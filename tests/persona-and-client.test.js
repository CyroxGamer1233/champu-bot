import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, buildPersonaPrompt, buildMessages, approxTokens, stageFromProgress, limitSpeech } from '../brain/persona/newborn.js';
import { containsForbidden, sanitizeSay } from '../brain/safety/filters.js';
import { LLMClient } from '../brain/llm/client.js';
import { validateStep } from '../brain/planner/actions.js';
import { testConfig } from './helpers.js';

test('persona prompts never contain forbidden words and stay small', () => {
  for (const s of STAGES) {
    const p = buildPersonaPrompt(s.id);
    assert.equal(containsForbidden(p), false, `stage ${s.id}`);
    assert.ok(approxTokens(p) < 300);
  }
});

test('stages advance only when both minimums are met', () => {
  assert.equal(stageFromProgress({ experiences: 29, concepts: 5 }), 0);
  assert.equal(stageFromProgress({ experiences: 30, concepts: 2 }), 1);
  assert.equal(stageFromProgress({ experiences: 1000, concepts: 1 }), 0);
});

test('speech is limited per stage and scrubbed', () => {
  assert.equal(limitSpeech('one two three', 0), 'one');
  assert.equal(sanitizeSay('I am a bot talking', 10), 'I am a ? talking');
  assert.equal(sanitizeSay('', 1), null);
});

test('prompt is trimmed to the budget but keeps the menu', () => {
  const memories = Array.from({ length: 50 }, (_, i) => `memory number ${i} with some extra words in it`);
  const msgs = buildMessages({ stageId: 0, memories, recent: memories, menuText: '1. rest - stay still', maxPromptTokens: 400 });
  const total = approxTokens(msgs[0].content) + approxTokens(msgs[1].content);
  assert.ok(total <= 400);
  assert.ok(msgs[1].content.includes('1. rest'));
});

test('client retries bad JSON then succeeds, and counts failures', async () => {
  const replies = ['not json', '{"thought":"hm","action":{"name":"nope","args":{}},"say":null}', '{"thought":"ok","action":{"name":"rest","args":{}},"say":null}'];
  const backend = { chat: async () => ({ text: replies.shift(), usage: { completion_tokens: 10 } }), embed: async () => null };
  const llm = new LLMClient(testConfig(), { backend });
  const r = await llm.thinkJson([{ role: 'user', content: 'x' }], { validate: (o) => validateStep(o, { stageId: 0 }) });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
  assert.equal(llm.stats().jsonFailures, 2);
});

test('client gives up after 3 bad replies', async () => {
  const backend = { chat: async () => ({ text: 'nope', usage: null }), embed: async () => null };
  const llm = new LLMClient(testConfig(), { backend });
  const r = await llm.thinkJson([{ role: 'user', content: 'x' }]);
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 3);
});

