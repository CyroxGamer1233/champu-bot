const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/** Episodic memory: one row per step the being took. */
export class Episodic {
  constructor(db) { this.db = db; }

  /** @returns {number} new row id */
  add({ ts = Date.now(), stage = 0, sense, thought = '', action = '', args = {}, outcome = '', valence = 0, importance = 0.1, embedding = null }) {
    const r = this.db.prepare('INSERT INTO episodes(ts,stage,sense,thought,action,args,outcome,valence,importance,embedding) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(ts, stage, String(sense).slice(0, 400), String(thought).slice(0, 300), action, JSON.stringify(args), String(outcome).slice(0, 200), valence, importance, embedding ? JSON.stringify(embedding) : null);
    return Number(r.lastInsertRowid);
  }

  count() { return Number(this.db.prepare('SELECT COUNT(*) AS n FROM episodes').get().n); }

  /** Newest first, with embeddings parsed. */
  recent(n = 5) {
    return this.db.prepare('SELECT * FROM episodes ORDER BY id DESC LIMIT ?').all(n).map((r) => ({ ...r, embedding: parse(r.embedding) }));
  }

  /** Oldest rows not yet summarized by reflection. */
  unsummarized(limit = 50) { return this.db.prepare('SELECT * FROM episodes WHERE summarized=0 ORDER BY id LIMIT ?').all(limit); }

  markSummarized(ids) {
    const st = this.db.prepare('UPDATE episodes SET summarized=1 WHERE id=?');
    for (const id of ids) st.run(id);
  }

  /** Keep the newest `keep` rows plus anything important; drop old summarized, unimportant rows. */
  prune(keep = 500) {
    this.db.prepare('DELETE FROM episodes WHERE summarized=1 AND importance<0.5 AND id NOT IN (SELECT id FROM episodes ORDER BY id DESC LIMIT ?)').run(keep);
  }

  /** One-line text for prompts and retrieval. */
  static line(e) { return `I felt: ${e.sense}. I did: ${e.action}. Result: ${e.outcome || 'nothing'}.`; }
}

