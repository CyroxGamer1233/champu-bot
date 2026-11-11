export const DRIVE_NAMES = ['hunger', 'safety', 'curiosity', 'social', 'comfort'];
const PRIORITY = ['safety', 'hunger', 'comfort', 'social', 'curiosity']; // tie-break order
const clamp = (v) => Math.max(0, Math.min(100, v));

/** Five drives, 0-100, higher = stronger unmet need. Pure code: no LLM involved. */
export class Drives {
  constructor(initial = {}) {
    this.v = { hunger: 10, safety: 0, curiosity: 40, social: 30, comfort: 10, ...initial };
  }

  /**
   * Advance by `dt` seconds.
   * @param {number} dt
   * @param {{food?:number,danger?:boolean,damageTaken?:boolean,heardVoice?:boolean,caregiverNear?:boolean,isNight?:boolean,sleeping?:boolean,novel?:boolean}} s
   */
  update(dt, s = {}) {
    const v = this.v;
    if (Number.isFinite(s.food)) {
      const target = (1 - clamp((s.food / 20) * 100) / 100) * 100; // empty belly = 100
      v.hunger += (target - v.hunger) * Math.min(1, dt / 10);
    } else v.hunger += dt * 0.05;
    if (s.damageTaken) v.safety += 40; else if (s.danger) v.safety += 15; else v.safety -= dt * 2;
    v.curiosity += dt * 0.3; if (s.novel) v.curiosity -= 25;
    if (s.heardVoice) v.social -= 30; else if (s.caregiverNear) v.social -= dt * 3; else v.social += dt * 0.15;
    v.comfort += dt * (s.isNight ? 0.4 : 0.1); if (s.sleeping) v.comfort -= dt * 5;
    for (const k of DRIVE_NAMES) v[k] = clamp(v[k]);
  }

  /** Strongest drive. Real danger (safety >= 35) always wins; below 25 the being just explores. */
  strongest() {
    if (this.v.safety >= 35) return { name: 'safety', value: this.v.safety };
    let best = PRIORITY[0];
    for (const k of PRIORITY) if (this.v[k] > this.v[best]) best = k;
    return this.v[best] < 25 ? { name: 'curiosity', value: this.v.curiosity } : { name: best, value: this.v[best] };
  }

  /** Feelings as words for the prompt. */
  feelingWords() {
    const v = this.v, out = [];
    if (v.hunger > 70) out.push('my belly aches and cries for food'); else if (v.hunger > 40) out.push('my belly feels empty');
    if (v.safety > 60) out.push('I am very scared'); else if (v.safety > 30) out.push('I feel uneasy');
    if (v.curiosity > 65) out.push('I want to touch and see new things');
    if (v.social > 65) out.push('I feel alone and want a caring voice'); else if (v.social > 40) out.push('I want someone near');
    if (v.comfort > 70) out.push('I am very tired'); else if (v.comfort > 45) out.push('I feel sleepy');
    return out;
  }

  toJSON() { return Object.fromEntries(DRIVE_NAMES.map((k) => [k, Math.round(this.v[k])])); }
}

