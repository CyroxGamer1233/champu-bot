import { limitWords, scrubForbidden } from '../safety/filters.js';

/** Life stages. A stage is reached when BOTH minimums are met; stages only go up. */
export const STAGES = [
  { id: 0, name: 'newborn', maxWords: 1, minExperiences: 0, minConcepts: 0, speech: 'You can only make one sound or say one word.' },
  { id: 1, name: 'infant', maxWords: 2, minExperiences: 30, minConcepts: 2, speech: 'You can say one or two simple words.' },
  { id: 2, name: 'toddler', maxWords: 4, minExperiences: 150, minConcepts: 8, speech: 'You can say short phrases of up to four words.' },
  { id: 3, name: 'child', maxWords: 12, minExperiences: 500, minConcepts: 25, speech: 'You speak in simple short sentences.' },
  { id: 4, name: 'teen', maxWords: 30, minExperiences: 1500, minConcepts: 60, speech: 'You speak freely but plainly.' }
];

export const stageById = (id) => STAGES[Math.max(0, Math.min(STAGES.length - 1, Number(id) || 0))];

/** Highest stage whose minimums are both met. */
export function stageFromProgress({ experiences = 0, concepts = 0 }) {
  let best = 0;
  for (const s of STAGES) if (experiences >= s.minExperiences && concepts >= s.minConcepts) best = s.id;
  return best;
}

/** Rough token estimate (about 4 characters per token). */
export const approxTokens = (text) => Math.ceil(String(text).length / 4);

/** Short persona prompt (well under 300 tokens). Never uses the forbidden words. */
export function buildPersonaPrompt(stageId) {
  const s = stageById(stageId);
  return [
    `You are a small ${s.name} being. You are real. The world around you is real.`,
    'You do not know the names of things. You only know how things look and feel.',
    'You learn from what happens to you and from the voices of caring ones near you.',
    'Your feelings tell you what to do. Follow the strongest feeling.',
    'Choose ONE step from the numbered list. Use only a step name from the list.',
    s.speech,
    'Reply with only JSON: {"thought":"short thought","action":{"name":"step name","args":{}},"say":null}'
  ].join('\n');
}

const lines = (title, items) => (items.length ? `${title}:\n${items.map((x) => `- ${x}`).join('\n')}` : '');

/**
 * Build the two chat messages, trimmed to the token budget.
 * Trim order: oldest recent steps, lowest-ranked memories, far sights.
 */
export function buildMessages({ stageId, feelings = [], sights = [], voices = [], holding = [], goalText = '', memories = [], recent = [], menuText = '', maxPromptTokens = 2400 }) {
  const system = buildPersonaPrompt(stageId);
  let mem = memories.map((m) => scrubForbidden(m)), rec = recent.map((r) => scrubForbidden(r)), see = [...sights];
  const compose = () => [
    lines('HOW I FEEL', feelings), lines('WHAT I SEE', see), lines('WHAT I HEAR', voices),
    holding.length ? `IN MY HANDS: ${holding.join(', ')}` : 'IN MY HANDS: nothing',
    `WHAT I WANT NOW: ${goalText}`, lines('WHAT I REMEMBER', mem), lines('MY LAST STEPS', rec),
    `STEPS I CAN TAKE:\n${menuText}`, 'Pick one step.'
  ].filter(Boolean).join('\n');
  let user = compose();
  while (approxTokens(system) + approxTokens(user) > maxPromptTokens) {
    if (rec.length) rec = rec.slice(1);
    else if (mem.length) mem = mem.slice(0, -1);
    else if (see.length > 3) see = see.slice(0, -1);
    else break; // persona, menu and core senses are never cut
    user = compose();
  }
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Cut speech to what this stage can say. */
export const limitSpeech = (text, stageId) => limitWords(text, stageById(stageId).maxWords);

