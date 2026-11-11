import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Deep-merge plain objects (arrays are replaced). */
export function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base?.[k] || {}, v) : v;
  }
  return out;
}

/** Load config/default.json, then .env, then environment overrides. */
export function loadConfig(env = process.env) {
  try { process.loadEnvFile?.('.env'); } catch { /* no .env file is fine */ }
  const cfg = JSON.parse(readFileSync(join(here, 'default.json'), 'utf8'));
  const pick = (v, f = (x) => x) => (v === undefined || v === '' ? undefined : f(v));
  return merge(cfg, {
    minecraft: { host: pick(env.MC_HOST), port: pick(env.MC_PORT, Number), username: pick(env.MC_USERNAME), version: pick(env.MC_VERSION), auth: pick(env.MC_AUTH) },
    llm: { baseUrl: pick(env.LLM_BASE_URL), model: pick(env.LLM_MODEL), embeddingModel: pick(env.LLM_EMBEDDING_MODEL) },
    dashboard: { port: pick(env.DASHBOARD_PORT, Number), password: pick(env.DASHBOARD_PASSWORD) },
    owners: pick(env.OWNERS, (v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  });
}

