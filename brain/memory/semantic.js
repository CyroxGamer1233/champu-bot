import { containsForbidden } from '../safety/filters.js';

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const STOP = new Set(['a', 'an', 'the', 'it', 'this', 'that', 'good', 'bad', 'ok', 'okay', 'fine', 'nice', 'here', 'there', 'hot', 'cold', 'called']);

/** Find a word a caregiver is teaching: "this is a tree", "that is called tree". */
export function parseTeaching(text) {
  const t = String(text || '');
  const m = t.match(/\b(?:called|call (?:it|this|that)|name is)\s+(?:an?\s+|the\s+)?([a-z][a-z-]{1,24})\b/i)
    || t.match(/\b(?:this|that|it)\s+is\s+(?:an?\s+|the\s+)?([a-z][a-z-]{1,24})\b/i);
  const w = m?.[1]?.toLowerCase();
  return w && !STOP.has(w) && !containsForbidden(w) ? w : null;
}

/** Semantic memory: lessons, learned concepts and learned names. */
export class Semantic {
  constructor(db) { this.db = db; }

  /** Add a fact, or strengthen it if the same text exists. @returns {number} id */
  learn({ text, kind = 'lesson', key = null, embedding = null }) {
    const t = String(text).slice(0, 200);
    const old = this.db.prepare('SELECT id FROM facts WHERE text=?').get(t);
    if (old) { this.db.prepare('UPDATE facts SET strength=strength+1, ts=? WHERE id=?').run(Date.now(), old.id); return Number(old.id); }
    const r = this.db.prepare('INSERT INTO facts(ts,text,kind,key,strength,embedding) VALUES(?,?,?,?,?,?)')
      .run(Date.now(), t, kind, key, 1, embedding ? JSON.stringify(embedding) : null);
    return Number(r.lastInsertRowid);
  }

  /** A caregiver taught a word for a real thing. `realName` stays internal; `feel` is how it feels to the being. */
  teach(realName, word, feel = 'that thing') {
    this.db.prepare("DELETE FROM facts WHERE kind='name' AND key=?").run(realName);
    return this.learn({ text: `${feel} is called "${word}"`, kind: 'name', key: realName });
  }

  /** Map of real name -> learned word. */
  learnedNames() {
    const m = new Map();
    for (const r of this.db.prepare("SELECT key, text FROM facts WHERE kind='name'").all()) {
      const w = r.text.match(/"([^"]+)"$/)?.[1];
      if (r.key && w) m.set(r.key, w);
    }
    return m;
  }

  conceptCount() { return Number(this.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE kind IN ('name','concept')").get().n); }

  /** Newest first, with embeddings parsed. */
  all(limit = 200) {
    return this.db.prepare('SELECT * FROM facts ORDER BY strength DESC, id DESC LIMIT ?').all(limit).map((r) => ({ ...r, embedding: parse(r.embedding) }));
  }

  /** Keep at most `max` facts, dropping the weakest. */
  prune(max = 500) {
    this.db.prepare('DELETE FROM facts WHERE id NOT IN (SELECT id FROM facts ORDER BY strength DESC, id DESC LIMIT ?)').run(max);
  }
}

