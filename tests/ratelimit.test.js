import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../brain/safety/ratelimit.js';

test('limits calls in a window and frees slots over time', () => {
  let t = 0;
  const r = new RateLimiter(2, 1000, () => t);
  assert.ok(r.tryTake()); assert.ok(r.tryTake());
  assert.equal(r.tryTake(), false);
  assert.equal(r.msUntilAvailable(), 1000);
  t = 1001;
  assert.ok(r.tryTake());
  assert.equal(r.count(), 1);
});

