import { Episodic } from './episodic.js';
import { scrubForbidden } from '../safety/filters.js';

const SYSTEM = [
  'You remember what just happened to you. You are a small being. Use simple words.',
  'Say up to 3 short lessons about what hurt, what helped and what you learned.',
  'Reply with only JSON: {"lessons":["..."]}'
].join('\n');

const validate = (o) => {
  if (!Array.isArray(o?.lessons)) return { ok: false, error: 'lessons must be a list' };
  const lessons = o.lessons.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 160)).slice(0, 3);
  return lessons.length ? { ok: true, value: lessons } : { ok: false, error: 'no lessons' };
};

/**
 * Summarize old episodes into lessons. Safe to fail: episodes stay unsummarized if the model fails.
 * @returns {Promise<{lessons:string[],episodes:number}|null>}
 */
export async function reflect({ llm, episodic, semantic, db, batch = 50 }) {
  const eps = episodic.unsummarized(batch);
  if (eps.length < 10) return null;
  const lines = eps.map((e) => scrubForbidden(Episodic.line(e))).join('\n').slice(0, 3500);
  const r = await llm.thinkJson([{ role: 'system', content: SYSTEM }, { role: 'user', content: lines }], { validate, maxTokens: 160 });
  if (!r.ok) return null;
  for (const text of r.value) semantic.learn({ text, kind: 'lesson', embedding: await llm.embed(text) });
  db.prepare('INSERT INTO reflections(ts,text) VALUES(?,?)').run(Date.now(), r.value.join(' | '));
  episodic.markSummarized(eps.map((e) => e.id));
  episodic.prune(); semantic.prune();
  return { lessons: r.value, episodes: eps.length };
}

/** Runs jobs one at a time in the background so acting is never blocked. */
export class LowPriorityQueue {
  constructor(onError = () => {}) { this.jobs = []; this.busy = false; this.onError = onError; }
  push(job) { this.jobs.push(job); if (!this.busy) setImmediate(() => this.#drain()); }
  async #drain() {
    this.busy = true;
    while (this.jobs.length) {
      try { await this.jobs.shift()(); } catch (err) { this.onError(err); }
    }
    this.busy = false;
  }
}

