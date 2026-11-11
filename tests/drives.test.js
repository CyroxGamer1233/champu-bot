import test from 'node:test';
import assert from 'node:assert/strict';
import { Drives } from '../brain/drives/drives.js';

test('hunger rises toward an empty belly and falls when fed', () => {
  const d = new Drives({ hunger: 0 });
  for (let i = 0; i < 20; i++) d.update(5, { food: 2 });
  assert.ok(d.v.hunger > 80);
  for (let i = 0; i < 20; i++) d.update(5, { food: 20 });
  assert.ok(d.v.hunger < 10);
});

test('safety jumps on damage then decays', () => {
  const d = new Drives();
  d.update(1, { damageTaken: true });
  assert.ok(d.v.safety >= 40);
  assert.equal(d.strongest().name, 'safety');
  for (let i = 0; i < 30; i++) d.update(5, {});
  assert.equal(d.v.safety, 0);
});

test('values stay within 0-100 and a calm being explores', () => {
  const d = new Drives({ hunger: 0, social: 0, comfort: 0, curiosity: 0, safety: 0 });
  d.update(1, {});
  assert.equal(d.strongest().name, 'curiosity');
  for (let i = 0; i < 1000; i++) d.update(10, { isNight: true });
  for (const v of Object.values(d.v)) assert.ok(v >= 0 && v <= 100);
});

test('hearing a voice calms the social drive', () => {
  const d = new Drives({ social: 80 });
  d.update(1, { heardVoice: true });
  assert.ok(d.v.social <= 50);
});

