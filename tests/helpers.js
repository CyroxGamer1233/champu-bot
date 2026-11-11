import { loadConfig } from '../config/load.js';

/** Config for tests: in-memory db, no waiting. */
export function testConfig(over = {}) {
  const c = loadConfig({});
  c.memory.dbFile = ':memory:';
  c.loop.minSecondsBetweenThoughts = 0;
  c.loop.maxActionSeconds = 1;
  return { ...c, ...over };
}

