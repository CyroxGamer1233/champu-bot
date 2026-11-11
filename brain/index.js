import { EventEmitter } from 'node:events';
import { Drives } from './drives/drives.js';
import { translate, describeThing } from './perception/translator.js';
import { STAGES, stageById, stageFromProgress, buildMessages } from './persona/newborn.js';
import { menuFor, menuText, stepSchema, validateStep } from './planner/actions.js';
import { pickGoal } from './planner/goals.js';
import { openDb, getKv, setKv } from './memory/db.js';
import { Episodic } from './memory/episodic.js';
import { Semantic, parseTeaching } from './memory/semantic.js';
import { retrieve } from './memory/retrieval.js';
import { reflect, LowPriorityQueue } from './memory/reflection.js';
import { sanitizeSay } from './safety/filters.js';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The cognitive loop: SENSE -> DRIVES -> GOAL (code) -> MEMORIES -> THINK (LLM) -> ACT -> RECORD -> REFLECT.
 * The body must provide:
 *   sense(): Promise<raw senses>   (see perception/translator.js)
 *   act({name,args,target}): Promise<{ok:boolean,outcome:string,valence?:number}>
 *   say(text): void
 */
export class Brain extends EventEmitter {
  constructor({ config, llm, body, now = () => Date.now(), sleep = defaultSleep }) {
    super();
    Object.assign(this, { config, llm, body, now, sleep });
    this.drives = new Drives();
    this.seen = new Set();
    this.running = false; this.paused = false; this.stepRequested = false;
    this.stageId = 0; this.manualStage = null; this.experiences = 0; this.steps = 0;
    this.lastTick = now();
    this.last = { thought: '', action: null, goal: null };
    this.queue = new LowPriorityQueue((err) => this.emit('error', err));
  }

  /** Open memory and restore progress. */
  async init() {
    this.db = await openDb(this.config.memory.dbFile);
    this.episodic = new Episodic(this.db);
    this.semantic = new Semantic(this.db);
    this.experiences = Number(getKv(this.db, 'experiences', 0));
    this.stageId = Number(getKv(this.db, 'stage', 0));
    return this;
  }

  get stage() { return this.manualStage ?? this.stageId; }

  setStage(id) { this.manualStage = id == null ? null : stageById(id).id; this.emit('stage', this.stage); }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  step() { this.stepRequested = true; }

  start() { if (!this.running) { this.running = true; this.#loop(); } }

  async #loop() {
    while (this.running) {
      if (this.paused && !this.stepRequested) { await this.sleep(300); continue; }
      this.stepRequested = false;
      try { await this.tick(); } catch (err) { this.emit('error', err); await this.sleep(2000); }
    }
  }

  /** Stop the loop and close the database. */
  async shutdown() {
    this.running = false;
    await this.sleep(50);
    try { this.db?.close(); } catch { /* already closed */ }
  }

  /** Snapshot for the dashboard. */
  getState() {
    return {
      stage: this.stage, stageName: stageById(this.stage).name, manualStage: this.manualStage, drives: this.drives.toJSON(),
      goal: this.last.goal, thought: this.last.thought, action: this.last.action, experiences: this.experiences,
      concepts: this.semantic?.conceptCount() ?? 0, paused: this.paused, llm: this.llm.stats()
    };
  }

  /** One full think-act cycle. */
  async tick() {
    const t0 = this.now();
    const dt = Math.min(60, Math.max(0.5, (t0 - this.lastTick) / 1000));
    this.lastTick = t0;

    const raw = await this.body.sense();
    const view = translate(raw, { learnedNames: this.semantic.learnedNames(), seen: this.seen });
    this.#learnFromVoices(view);
    this.drives.update(dt, { food: raw.food, danger: view.danger, damageTaken: raw.damageTaken, heardVoice: view.voices.length > 0, caregiverNear: view.caregiverNear, isNight: raw.isNight, sleeping: raw.sleeping, novel: view.novel });

    const goal = pickGoal(this.drives);
    const stageId = this.stage;
    const query = `${goal.text} ${view.summary}`;
    const memories = retrieve({ episodic: this.episodic, semantic: this.semantic, query, queryEmbedding: await this.llm.embed(query), k: 5, now: this.now() });
    const menu = menuFor(stageId, goal.hints);
    const messages = buildMessages({
      stageId, feelings: [...new Set([...this.drives.feelingWords(), ...view.feelings])], sights: view.sights, voices: view.voices, holding: view.holding,
      goalText: goal.text, memories: memories.map((m) => m.text), recent: this.episodic.recent(3).reverse().map(Episodic.line),
      menuText: menuText(menu), maxPromptTokens: Math.floor(this.config.llm.contextLength * 0.6)
    });

    let step = null;
    try {
      const r = await this.llm.thinkJson(messages, { schema: stepSchema(menu.map((a) => a.name)), validate: (o) => validateStep(o, { stageId, targetIds: view.targetIds }) });
      if (r.ok) step = r.value; else this.emit('llmFailure', r.error);
    } catch (err) {
      this.emit('error', err);
      await this.sleep(3000);
      step = { thought: '(no thoughts right now)', action: { name: 'rest', args: {} }, say: null };
    }
    step ??= { thought: '(confused)', action: { name: 'look_around', args: {} }, say: null }; // safe fallback

    const speech = sanitizeSay(step.say, STAGES[stageId].maxWords);
    if (speech) this.body.say(speech);

    const act = { ...step.action, target: step.action.args.target ? view.targets[step.action.args.target] : undefined };
    const result = await this.#execute(act);
    this.#record({ raw, view, step, result, stageId });

    this.last = { thought: step.thought, action: step.action, goal: goal.text };
    this.emit('thought', { ...this.last, say: speech, outcome: result.outcome, drives: this.drives.toJSON() });
    const every = this.config.memory.reflectEvery;
    if (every && this.steps % every === 0) {
      this.queue.push(async () => { const r = await reflect({ llm: this.llm, episodic: this.episodic, semantic: this.semantic, db: this.db }); if (r) this.emit('reflection', r); });
    }

    const wait = this.config.loop.minSecondsBetweenThoughts * 1000 - (this.now() - t0);
    if (wait > 0) await this.sleep(wait);
  }

  /** Start the action and wait for it, but never longer than maxActionSeconds. */
  async #execute(act) {
    const limit = (this.config.loop.maxActionSeconds ?? 20) * 1000;
    const run = Promise.resolve().then(() => this.body.act(act)).catch((e) => ({ ok: false, outcome: e.message, valence: -0.2 }));
    return Promise.race([run, this.sleep(limit).then(() => ({ ok: true, outcome: 'still doing it', valence: 0 }))]);
  }

  /** Pair a taught word with the nearest thing in view. */
  #learnFromVoices(view) {
    const nearest = view.targetList[0];
    if (!nearest) return;
    for (const h of view.voicesRaw) {
      const word = parseTeaching(h.text);
      if (word) { this.semantic.teach(nearest.name, word, describeThing(nearest.name)); this.emit('learned', { word }); }
    }
  }

  #record({ raw, view, step, result, stageId }) {
    const valence = raw.damageTaken ? -0.8 : (result.valence ?? (result.ok ? 0.1 : -0.2));
    const importance = Math.min(1, Math.abs(valence) + (view.novel ? 0.3 : 0));
    this.episodic.add({ stage: stageId, sense: view.summary, thought: step.thought, action: step.action.name, args: step.action.args, outcome: result.outcome, valence, importance });
    this.experiences++; this.steps++;
    setKv(this.db, 'experiences', this.experiences);
    const next = stageFromProgress({ experiences: this.experiences, concepts: this.semantic.conceptCount() });
    if (next > this.stageId) { this.stageId = next; setKv(this.db, 'stage', next); this.emit('stage', next); }
  }
}

