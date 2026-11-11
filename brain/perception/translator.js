import { cleanExternal } from '../safety/filters.js';

// Extendable mapping tables: real name -> how it looks and feels to a being who has no names yet.
export const BLOCK_WORDS = {
  stone: 'hard grey stuff', cobblestone: 'rough grey stuff', dirt: 'soft brown stuff', grass_block: 'soft stuff with green on top',
  sand: 'loose pale stuff', gravel: 'loose grey bits', water: 'cold wet moving stuff', lava: 'glowing hot stuff that burns',
  coal_ore: 'grey stuff with black spots', iron_ore: 'grey stuff with tan spots', crafting_table: 'a flat brown thing with tools drawn on it',
  torch: 'a small stick with a warm light', furnace: 'a grey box with a hot hole'
};
const BLOCK_PATTERNS = [[/_log$/, 'tall brown stuff'], [/_leaves$/, 'green fluffy stuff'], [/_planks$/, 'smooth flat wooden stuff'], [/_ore$/, 'grey stuff with shiny spots'], [/_bed$|^bed$/, 'a soft flat thing']];
export const ENTITY_WORDS = {
  zombie: { d: 'a groaning creature that wants to hurt me', hostile: true }, skeleton: { d: 'a clattering white creature that throws sharp things', hostile: true },
  spider: { d: 'a many-legged creature that jumps at me', hostile: true }, creeper: { d: 'a quiet green creature that makes a loud burst', hostile: true },
  cow: { d: 'a big gentle creature with spots' }, pig: { d: 'a round pink creature' }, sheep: { d: 'a soft fluffy creature' }, chicken: { d: 'a small feathery creature' }
};
const FOOD = /apple|bread|beef|porkchop|mutton|chicken|cooked_|carrot|potato|melon|berries|cookie|pie/;

const MAX_TARGETS = 8;

/** Description of any block or item name. Learned words win and keep the feeling in brackets. */
export function describeThing(name, learned = new Map()) {
  const n = String(name || '');
  let d = BLOCK_WORDS[n] || BLOCK_PATTERNS.find(([re]) => re.test(n))?.[1];
  if (!d) d = FOOD.test(n) ? 'something that might fill my belly' : /pickaxe|_axe|sword|shovel|hoe/.test(n) ? 'a hard thing made for hitting' : 'strange stuff';
  const word = learned.get(n);
  return word ? `${word} (${d})` : d;
}

/**
 * Translate raw body data into sense-language.
 * @param {object} raw {health,food,isNight,raining,damageTaken,inventory:[{name,count}],blocks:[{name,pos,dist,dy}],
 *   entities:[{kind:'human'|'creature'|'item',name,dist,dy}],heard:[{speaker,text}]}
 * @param {{learnedNames?:Map<string,string>,seen?:Set<string>}} [opts]
 */
export function translate(raw = {}, { learnedNames = new Map(), seen = new Set() } = {}) {
  const feelings = [];
  if (Number.isFinite(raw.food)) {
    if (raw.food <= 6) feelings.push('my belly feels empty and achy');
    else if (raw.food <= 12) feelings.push('my belly feels a little empty');
  }
  if (Number.isFinite(raw.health)) {
    if (raw.health <= 6) feelings.push('I hurt a lot');
    else if (raw.health <= 14) feelings.push('I hurt a little');
  }
  if (raw.damageTaken) feelings.push('something just hurt me');
  if (raw.isNight) feelings.push('everything is dark and cold');
  if (raw.raining) feelings.push('wet drops fall on me');

  const candidates = [
    ...(raw.entities || []).map((e) => {
      const info = ENTITY_WORDS[e.name];
      const desc = e.kind === 'human' ? 'a tall caring one' : e.kind === 'item' ? 'a small thing lying on the ground' : info?.d || 'a creature';
      return { kind: e.kind || 'creature', name: e.name, desc: learnedNames.get(e.name) ? `${learnedNames.get(e.name)} (${desc})` : desc, hostile: Boolean(info?.hostile), dist: e.dist ?? 99, dy: e.dy ?? 0, pos: e.pos };
    }),
    ...(raw.blocks || []).map((b) => ({ kind: 'thing', name: b.name, desc: describeThing(b.name, learnedNames), hostile: false, dist: b.dist ?? 99, dy: b.dy ?? 0, pos: b.pos }))
  ].sort((a, b) => a.dist - b.dist).slice(0, MAX_TARGETS);

  const targets = {}, targetList = [], sights = [];
  let novel = false;
  candidates.forEach((c, i) => {
    const id = `t${i + 1}`;
    targets[id] = c; targetList.push(c);
    if (!seen.has(c.name)) { seen.add(c.name); novel = true; }
    const where = c.dy > 2 ? ', up high' : c.dy < -2 ? ', down low' : '';
    sights.push(`${id}: ${c.desc}, ${Math.round(c.dist)} steps away${where}`);
  });

  const voicesRaw = (raw.heard || []).map((h) => ({ speaker: cleanExternal(h.speaker || '', 24), text: cleanExternal(h.text || '', 160) })).filter((h) => h.text);
  const voices = voicesRaw.map((h) => `a voice${h.speaker ? ` (${h.speaker})` : ''} said: "${h.text}"`);
  const holding = (raw.inventory || []).slice(0, 6).map((i) => `${i.count} of ${describeThing(i.name, learnedNames)}`);
  const danger = candidates.some((c) => c.hostile && c.dist <= 12);
  const caregiverNear = candidates.some((c) => c.kind === 'human' && c.dist <= 10);

  return {
    feelings, sights, voices, voicesRaw, holding, targets, targetList, targetIds: Object.keys(targets), danger, caregiverNear, novel,
    summary: [...feelings, ...sights.slice(0, 3)].join('; ') || 'nothing special'
  };
}

