/** Goal text and the actions that usually help, per drive. Code picks the goal, not the LLM. */
const GOALS = {
  safety: { text: 'get away from what scares me', hints: ['flee', 'look_around'] },
  hunger: { text: 'find something to eat', hints: ['eat', 'pick_up', 'touch', 'walk_to'] },
  comfort: { text: 'rest somewhere safe', hints: ['sleep', 'rest'] },
  social: { text: 'be near a caring voice', hints: ['follow_voice'] },
  curiosity: { text: 'explore and touch new things', hints: ['touch', 'walk_to', 'look_around'] }
};

/** @param {import('../drives/drives.js').Drives} drives */
export function pickGoal(drives) {
  const s = drives.strongest();
  return { drive: s.name, value: s.value, ...GOALS[s.name] };
}

