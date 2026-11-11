/** The action menu. Names are plain verbs; labels use sense-language only. `stage` = first stage that may use it. */
export const ACTIONS = [
  { name: 'rest', stage: 0, args: [], label: 'stay still and breathe' },
  { name: 'look_around', stage: 0, args: [], label: 'turn and look at everything near me' },
  { name: 'flee', stage: 0, args: [], label: 'run away from what scares me' },
  { name: 'follow_voice', stage: 0, args: [], label: 'walk after the nearest caring one' },
  { name: 'touch', stage: 0, args: ['target'], label: 'walk up to a thing and touch it' },
  { name: 'pick_up', stage: 1, args: ['target'], label: 'grab a small thing from the ground' },
  { name: 'eat', stage: 1, args: [], label: 'put something from my hands in my mouth to fill my belly' },
  { name: 'sleep', stage: 1, args: [], label: 'lie down on a soft place and sleep' },
  { name: 'walk_to', stage: 1, args: ['target'], label: 'walk to a thing far away' },
  { name: 'break_off', stage: 2, args: ['target'], label: 'hit a thing until a piece comes off' },
  { name: 'put_down', stage: 2, args: ['target'], label: 'put something from my hands down next to a thing' },
  { name: 'make', stage: 3, args: ['what'], label: 'make something new from what I hold' }
];

/** Actions available at a stage, preferred ones first. */
export function menuFor(stageId, preferred = []) {
  const ok = ACTIONS.filter((a) => a.stage <= stageId);
  const rank = (a) => { const i = preferred.indexOf(a.name); return i < 0 ? 99 : i; };
  return [...ok].sort((a, b) => rank(a) - rank(b));
}

export const menuText = (menu) => menu.map((a, i) => `${i + 1}. ${a.name}${a.args.length ? `(${a.args.join(', ')})` : ''} - ${a.label}`).join('\n');

/** JSON schema for structured output; step names are limited to the menu. */
export const stepSchema = (names) => ({
  type: 'object',
  properties: {
    thought: { type: 'string' },
    action: { type: 'object', properties: { name: { type: 'string', enum: names }, args: { type: 'object', properties: { target: { type: 'string' }, what: { type: 'string' } } } }, required: ['name', 'args'] },
    say: { type: ['string', 'null'] }
  },
  required: ['thought', 'action', 'say']
});

/**
 * Validate one model reply. Only menu actions at this stage pass; args are checked per action.
 * @returns {{ok:true,value:{thought:string,action:{name:string,args:object},say:string|null}}|{ok:false,error:string}}
 */
export function validateStep(obj, { stageId = 0, targetIds = null } = {}) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'reply is not an object' };
  const a = obj.action;
  if (!a || typeof a !== 'object') return { ok: false, error: 'missing action' };
  const def = ACTIONS.find((x) => x.name === a.name && x.stage <= stageId);
  if (!def) return { ok: false, error: `"${a.name}" is not in the menu` };
  const args = {};
  for (const k of def.args) {
    const v = a.args?.[k];
    if (k === 'target') {
      if (typeof v !== 'string' || !/^t\d{1,2}$/.test(v)) return { ok: false, error: 'target must look like t1' };
      if (targetIds && !targetIds.includes(v)) return { ok: false, error: `unknown target ${v}` };
      args.target = v;
    } else {
      if (typeof v !== 'string' || !v.trim() || v.length > 40) return { ok: false, error: `bad argument ${k}` };
      args[k] = v.trim();
    }
  }
  return {
    ok: true,
    value: {
      thought: typeof obj.thought === 'string' ? obj.thought.slice(0, 300) : '',
      action: { name: def.name, args },
      say: typeof obj.say === 'string' && obj.say.trim() ? obj.say.trim().slice(0, 200) : null
    }
  };
}

