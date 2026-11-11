import test from 'node:test';
import assert from 'node:assert/strict';
import { Brain } from '../brain/index.js';
import { LLMClient } from '../brain/llm/client.js';
import { testConfig } from './helpers.js';

test('one tick senses, thinks, acts, remembers and learns a word', async () => {
  const cfg = testConfig();
  const acted = [], said = [];
  const body = {
    sense: async () => ({ food: 8, health: 20, blocks: [{ name: 'oak_log', dist: 2 }], entities: [{ kind: 'human', name: 'Alex', dist: 3 }], heard: [{ speaker: 'Alex', text: 'this is a tree' }] }),
    act: async (a) => { acted.push(a); return { ok: true, outcome: 'touched it', valence: 0.2 }; },
    say: (t) => said.push(t)
  };
  const backend = {
    chat: async () => ({ text: JSON.stringify({ thought: 'what is that', action: { name: 'touch', args: { target: 't1' } }, say: 'ma ma' }), usage: null }),
    embed: async () => null
  };
  const brain = await new Brain({ config: cfg, llm: new LLMClient(cfg, { backend }), body, sleep: async () => {} }).init();
  await brain.tick();
  assert.equal(acted[0].name, 'touch');
  assert.equal(acted[0].target.name, 'oak_log');
  assert.deepEqual(said, ['ma']); // newborn: one word only
  assert.equal(brain.episodic.count(), 1);
  assert.equal(brain.semantic.learnedNames().get('oak_log'), 'tree');
  assert.equal(brain.getState().stageName, 'newborn');
  await brain.shutdown();
});

test('an unreachable language model leaves the being resting, not crashing', async () => {
  const cfg = testConfig();
  const acted = [];
  const body = { sense: async () => ({ food: 20 }), act: async (a) => { acted.push(a.name); return { ok: true, outcome: 'ok' }; }, say() {} };
  const backend = { chat: async () => { throw new Error('down'); }, embed: async () => null };
  const brain = await new Brain({ config: cfg, llm: new LLMClient(cfg, { backend }), body, sleep: async () => {} }).init();
  brain.on('error', () => {});
  await brain.tick();
  assert.deepEqual(acted, ['rest']);
  await brain.shutdown();
});

