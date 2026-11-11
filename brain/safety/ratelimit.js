/** Sliding-window rate limiter. `now` is injectable for tests. */
export class RateLimiter {
  constructor(max, windowMs = 60000, now = () => Date.now()) {
    this.max = Math.max(1, Number(max) || 1);
    this.windowMs = windowMs;
    this.now = now;
    this.stamps = [];
  }
  #prune() {
    const cutoff = this.now() - this.windowMs;
    while (this.stamps.length && this.stamps[0] <= cutoff) this.stamps.shift();
  }
  /** Take one slot if available. */
  tryTake() {
    this.#prune();
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(this.now());
    return true;
  }
  /** Slots used in the current window. */
  count() { this.#prune(); return this.stamps.length; }
  /** Milliseconds until a slot frees up (0 if free now). */
  msUntilAvailable() {
    this.#prune();
    return this.stamps.length < this.max ? 0 : this.stamps[0] + this.windowMs - this.now();
  }
}

