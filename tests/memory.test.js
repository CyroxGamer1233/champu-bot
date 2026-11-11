import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../brain/memory/db.js';
import { Episodic } from '../brain/memory/episodic.js';
import { Semantic, parseTeaching } from '../brain/memory/semantic.js';
import { retrieve, cosine, keywordScore } from '../brain/memory/retrieval.js';

async function setup() {
  const db = await openDb(':memory:');
  return { db, ep: new Episodic(db), se: new Semantic(db) };
}

test('episodes are stored and read back newest first', async () => {
  const { ep } = await setup();
  ep.add({ sense: 'belly empty', action: 'eat', outcome: 'belly full', valence: 0.6 });
  ep.add({ sense: 'dark', action: 'rest', outcome: 'ok' });
  assert.equal(ep.count(), 2);
  assert.equal(ep.recent(1)[0].action, 'rest');
});

test('retrieval finds the relevant memory by keywords', async () => {
  const { ep, se } = await setup();
  ep.add({ sense: 'hard grey stuff near', action: 'touch', outcome: 'nothing happened' });
  se.learn({ text: 'the loud green creature made me hurt' });
  se.learn({ text: 'the round pink creature was gentle' });
  const top = retrieve({ episodic: ep, semantic: se, query: 'green creature hurt', k: 2 });
  assert.ok(top[0].text.includes('green creature'));
});

test('retrieval uses embeddings when present', async () => {
  const { se } = await setup();
  se.learn({ text: 'alpha', embedding: [1, 0] });
  se.learn({ text: 'beta', embedding: [0, 1] });
  const top = retrieve({ episodic: new Episodic((await setup()).db), semantic: se, query: 'zzz', queryEmbedding: [0, 1], k: 1 });
  assert.equal(top[0].text, 'beta');
});

test('teaching stores a learned name and counts as a concept', async () => {
  const { se } = await setup();
  se.teach('oak_log', 'tree', 'tall brown stuff');
  se.teach('oak_log', 'wood', 'tall brown stuff');
  assert.equal(se.learnedNames().get('oak_log'), 'wood');
  assert.equal(se.conceptCount(), 1);
});

test('parseTeaching finds words and ignores filler', () => {
  assert.equal(parseTeaching('Look, this is a tree!'), 'tree');
  assert.equal(parseTeaching('that is called water'), 'water');
  assert.equal(parseTeaching('this is good'), null);
  assert.equal(parseTeaching('this is a game'), null);
});

test('math helpers', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.ok(keywordScore('green hurt', 'green thing hurt me') > 0);
});

