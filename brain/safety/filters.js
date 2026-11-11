/** Words the being must never see or say: they would break its picture of the world. */
export const FORBIDDEN = ['minecraft', 'game', 'ai', 'bot', 'simulation', 'player', 'server', 'llm', 'code', 'model'];
const test = new RegExp(`\\b(?:${FORBIDDEN.join('|')})s?\\b`, 'i');
const replace = new RegExp(`\\b(?:${FORBIDDEN.join('|')})s?\\b`, 'gi');

export const containsForbidden = (text) => test.test(String(text ?? ''));
export const scrubForbidden = (text, repl = '?') => String(text ?? '').replace(replace, repl);

/** Remove control characters and collapse whitespace. */
export const flatten = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Keep at most `max` words. */
export const limitWords = (text, max) => flatten(text).split(' ').filter(Boolean).slice(0, Math.max(0, max)).join(' ');

/** Clean text that comes from outside (chat, names) before it enters a prompt. */
export const cleanExternal = (text, maxChars = 200) => scrubForbidden(flatten(text)).slice(0, maxChars);

/** Clean something the being wants to say aloud. Returns null if nothing is left. */
export function sanitizeSay(text, maxWords = 1, maxChars = 120) {
  if (typeof text !== 'string') return null;
  const out = limitWords(scrubForbidden(flatten(text)), maxWords).slice(0, maxChars).trim();
  return out || null;
}

