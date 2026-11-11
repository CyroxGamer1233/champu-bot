import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../brain/perception/translator.js';
import { containsForbidden } from '../brain/safety/filters.js';

const raw = {
  health: 4, food: 3, isNight: true,
  blocks: [{ name: 'stone', dist: 3 }, { name: 'oak_log', dist: 5 }, { name: 'weird_block', dist: 7 }],
  entities: [{ kind: 'creature', name: 'zombie', dist: 8 }, { kind: 'human', name: 'Alex', dist: 4 }],
  heard: [{ speaker: 'Alex', text: 'hello little one, this is a game' }]
};

test('feelings come out in body words', () => {
  const v = translate(raw);
  assert.ok(v.feelings.some((f) => f.includes('belly')));
  assert.ok(v.feelings.some((f) => f.includes('hurt')));
  assert.ok(v.feelings.some((f) => f.includes('dark and cold')));
});

test('real names are hidden and unknown things get a generic description', () => {
  const v = translate(raw);
  const text = v.sights.join(' ');
  assert.ok(text.includes('hard grey stuff'));
  assert.ok(text.includes('tall brown stuff'));
  assert.ok(text.includes('strange stuff'));
  for (const n of ['stone', 'zombie', 'oak_log']) assert.ok(!text.includes(n), n);
});

test('danger and caregiver are detected, targets get ids', () => {
  const v = translate(raw);
  assert.equal(v.danger, true);
  assert.equal(v.caregiverNear, true);
  assert.deepEqual(v.targetIds.slice(0, 2), ['t1', 't2']);
});

test('learned names are used and forbidden words are scrubbed from voices', () => {
  const v = translate(raw, { learnedNames: new Map([['oak_log', 'tree']]) });
  assert.ok(v.sights.join(' ').includes('tree (tall brown stuff)'));
  assert.ok(!containsForbidden(v.voices.join(' ')));
});

