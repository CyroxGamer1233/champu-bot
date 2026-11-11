import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../brain/llm/jsonParse.js';
import { validateStep, menuFor } from '../brain/planner/actions.js';

test('extractJson handles fences, chatter and braces inside strings', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a":{"b":"}"}} hope that helps'), { a: { b: '}' } });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{"a":'), null);
});

test('validateStep accepts a menu action and normalises it', () => {
  const r = validateStep({ thought: 'x', action: { name: 'touch', args: { target: 't2', junk: 1 } }, say: ' ma ' }, { stageId: 0, targetIds: ['t1', 't2'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.action, { name: 'touch', args: { target: 't2' } });
  assert.equal(r.value.say, 'ma');
});

test('validateStep rejects unknown actions, bad targets and locked stages', () => {
  assert.equal(validateStep({ action: { name: 'fly', args: {} } }).ok, false);
  assert.equal(validateStep({ action: { name: 'touch', args: { target: 'banana' } } }).ok, false);
  assert.equal(validateStep({ action: { name: 'touch', args: { target: 't9' } } }, { targetIds: ['t1'] }).ok, false);
  assert.equal(validateStep({ action: { name: 'break_off', args: { target: 't1' } } }, { stageId: 0 }).ok, false);
  assert.equal(validateStep({ action: { name: 'break_off', args: { target: 't1' } } }, { stageId: 2 }).ok, true);
  assert.equal(validateStep(null).ok, false);
});

test('menu grows with stage and puts preferred actions first', () => {
  assert.ok(menuFor(0).length < menuFor(3).length);
  assert.equal(menuFor(1, ['eat'])[0].name, 'eat');
});

