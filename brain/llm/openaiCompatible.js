/** Minimal OpenAI-compatible HTTP client (Ollama, llama.cpp server, LM Studio, vLLM). Local servers only. */
export class LLMError extends Error {
  constructor(message, { cause, status } = {}) {
    super(message, { cause });
    this.name = 'LLMError';
    this.status = status;
  }
}

/** Accepts "http://host:port" or "http://host:port/v1"; always returns the root. */
export const normalizeBase = (url) => String(url || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '');

export class OpenAICompatible {
  /** @param {{baseUrl:string,model:string,embeddingModel?:string|null,temperature?:number,timeoutMs?:number,fetchImpl?:typeof fetch}} cfg */
  constructor({ baseUrl, model, embeddingModel = null, temperature = 0.7, timeoutMs = 60000, fetchImpl = globalThis.fetch }) {
    this.base = normalizeBase(baseUrl);
    this.model = model;
    this.embeddingModel = embeddingModel;
    this.temperature = temperature;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.schemaOk = true; // flips to false if the backend rejects json_schema
  }

  async #post(path, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(this.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    } catch (err) {
      const why = err?.name === 'AbortError' ? `did not answer within ${this.timeoutMs} ms` : 'is not reachable';
      throw new LLMError(`The language model server at ${this.base} ${why}. Start Ollama ("ollama serve") and run: ollama pull ${this.model}`, { cause: err });
    } finally { clearTimeout(timer); }
    const text = await res.text();
    if (!res.ok) throw new LLMError(`LLM server answered ${res.status}: ${text.slice(0, 200)}`, { status: res.status });
    try { return JSON.parse(text); } catch (err) { throw new LLMError('LLM server returned something that is not JSON', { cause: err }); }
  }

  /** Chat completion. With `schema`, asks for structured output when the backend supports it. */
  async chat(messages, { maxTokens = 200, schema = null } = {}) {
    const body = { model: this.model, messages, temperature: this.temperature, max_tokens: maxTokens, stream: false };
    if (schema && this.schemaOk) body.response_format = { type: 'json_schema', json_schema: { name: 'step', schema } };
    let data;
    try {
      data = await this.#post('/v1/chat/completions', body);
    } catch (err) {
      if (!body.response_format || err.status !== 400) throw err;
      this.schemaOk = false; // retry once without structured output
      delete body.response_format;
      data = await this.#post('/v1/chat/completions', body);
    }
    return { text: data?.choices?.[0]?.message?.content ?? '', usage: data?.usage ?? null };
  }

  /** Embedding vector, or null when no embedding model is configured. */
  async embed(text) {
    if (!this.embeddingModel) return null;
    const data = await this.#post('/v1/embeddings', { model: this.embeddingModel, input: String(text).slice(0, 2000) });
    const v = data?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  }
}

