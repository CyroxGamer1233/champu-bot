import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { OpenAICompatible } from './openaiCompatible.js';
import { extractJson } from './jsonParse.js';
import { RateLimiter } from '../safety/ratelimit.js';

const RETRY_NOTE = 'Return only valid JSON in the format shown. Use a step name from the list. No other text.';

/** High-level LLM access: rate limiting, JSON retries, stats and logging. */
export class LLMClient {
  /**
   * @param {object} cfg full config
   * @param {{backend?:object,logFile?:string|null,now?:()=>number,sleep?:(ms:number)=>Promise<void>}} [opts]
   */
  constructor(cfg, { backend = null, logFile = null, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    this.cfg = cfg;
    this.backend = backend || new OpenAICompatible(cfg.llm);
    this.limiter = new RateLimiter(cfg.loop.maxLlmCallsPerMinute, 60000, now);
    this.logFile = logFile;
    this.now = now;
    this.sleep = sleep;
    this.embedOk = Boolean(cfg.llm.embeddingModel);
    this.s = { calls: 0, errors: 0, jsonFailures: 0, totalMs: 0, tokensOut: 0 };
  }

  #log(entry) {
    if (!this.logFile) return;
    try {
      mkdirSync(dirname(this.logFile), { recursive: true });
      appendFileSync(this.logFile, JSON.stringify({ t: new Date(this.now()).toISOString(), ...entry }) + '\n');
    } catch { /* logging must never break thinking */ }
  }

  async #wait() {
    while (!this.limiter.tryTake()) await this.sleep(Math.max(200, this.limiter.msUntilAvailable()));
  }

  /**
   * Ask for a JSON object, validate it, retry up to 2 more times.
   * @returns {Promise<{ok:boolean,value?:any,error?:string,attempts:number}>}
   */
  async thinkJson(messages, { schema = null, validate = null, maxTokens = this.cfg.loop.maxTokensPerCall } = {}) {
    let msgs = messages, lastError = 'unknown';
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.#wait();
      const t0 = this.now();
      let out;
      try { out = await this.backend.chat(msgs, { maxTokens, schema }); }
      catch (err) { this.s.errors++; this.#log({ type: 'error', message: err.message }); throw err; }
      const ms = this.now() - t0;
      this.s.calls++; this.s.totalMs += ms; this.s.tokensOut += out.usage?.completion_tokens ?? 0;
      const obj = extractJson(out.text);
      const v = obj == null ? { ok: false, error: 'no JSON found' } : validate ? validate(obj) : { ok: true, value: obj };
      this.#log({ type: 'call', attempt, ms, ok: v.ok, error: v.error, messages: JSON.stringify(msgs).slice(0, 4000), reply: String(out.text).slice(0, 600) });
      if (v.ok) return { ok: true, value: v.value, attempts: attempt };
      this.s.jsonFailures++; lastError = v.error;
      msgs = [...messages, { role: 'user', content: RETRY_NOTE }];
    }
    return { ok: false, error: lastError, attempts: 3 };
  }

  /** Embedding or null. After one failure embeddings are switched off (keyword fallback is used). */
  async embed(text) {
    if (!this.embedOk) return null;
    try { return await this.backend.embed(text); }
    catch (err) { this.embedOk = false; this.#log({ type: 'embed-off', message: err.message }); return null; }
  }

  stats() {
    const { calls, errors, jsonFailures, totalMs, tokensOut } = this.s;
    return {
      calls, errors, jsonFailures,
      jsonFailureRate: calls ? jsonFailures / calls : 0,
      avgLatencyMs: calls ? Math.round(totalMs / calls) : 0,
      tokensPerSec: totalMs ? +(tokensOut / (totalMs / 1000)).toFixed(1) : 0,
      callsLastMinute: this.limiter.count(),
      embeddings: this.embedOk
    };
  }
}

