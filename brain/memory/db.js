import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS episodes(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, stage INTEGER NOT NULL, sense TEXT NOT NULL,
  thought TEXT, action TEXT, args TEXT, outcome TEXT, valence REAL NOT NULL DEFAULT 0, importance REAL NOT NULL DEFAULT 0.1,
  embedding TEXT, summarized INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS facts(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, text TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
  key TEXT, strength REAL NOT NULL DEFAULT 1, embedding TEXT);
CREATE TABLE IF NOT EXISTS reflections(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/**
 * Open the SQLite database. Uses better-sqlite3; if it cannot load (e.g. native build failed)
 * falls back to Node's built-in node:sqlite (Node 22.5+). Both expose prepare/run/get/all/exec.
 * @param {string} file path or ':memory:'
 */
export async function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  let db;
  try {
    const { default: Database } = await import('better-sqlite3');
    db = new Database(file);
    db.pragma('journal_mode = WAL');
  } catch {
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec(SCHEMA);
  return db;
}

export const getKv = (db, key, fallback = null) => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? fallback;
export const setKv = (db, key, value) => { db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value)); };

