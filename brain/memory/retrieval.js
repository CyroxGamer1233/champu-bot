import { Episodic } from './episodic.js';

const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{3,}/g) || []);

/** Cosine similarity of two vectors (0 if unusable). */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Keyword overlap (Jaccard) used when no embeddings are available. */
export function keywordScore(query, text) {
  const q = words(query), t = words(text);
  if (!q.size || !t.size) return 0;
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / (q.size + t.size - hit);
}

const HALF_LIFE_MS = 30 * 60 * 1000;

/**
 * Score = 0.5 similarity + 0.3 recency + 0.2 importance.
 * @param {{text:string,ts:number,importance:number,embedding?:number[]|null}[]} items
 */
export function rank(items, { query, queryEmbedding = null, now = Date.now() }) {
  return items.map((it) => {
    const sim = queryEmbedding && it.embedding ? Math.max(0, cosine(queryEmbedding, it.embedding)) : keywordScore(query, it.text);
    const recency = Math.pow(0.5, Math.max(0, now - it.ts) / HALF_LIFE_MS);
    return { ...it, score: 0.5 * sim + 0.3 * recency + 0.2 * Math.min(1, it.importance) };
  }).sort((a, b) => b.score - a.score);
}

/** Top-k memories from episodes and facts. @returns {{kind:string,text:string,score:number}[]} */
export function retrieve({ episodic, semantic, query, queryEmbedding = null, k = 5, now = Date.now() }) {
  const eps = episodic.recent(200).map((e) => ({ kind: 'episode', text: Episodic.line(e), ts: e.ts, importance: e.importance + Math.abs(e.valence) * 0.5, embedding: e.embedding }));
  const facts = semantic.all(200).map((f) => ({ kind: 'fact', text: f.text, ts: f.ts, importance: Math.min(1, 0.4 + f.strength * 0.1), embedding: f.embedding }));
  return rank([...eps, ...facts], { query, queryEmbedding, now }).slice(0, k).map(({ kind, text, score }) => ({ kind, text, score }));
}

