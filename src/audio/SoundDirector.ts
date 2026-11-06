/** Step 18: pure "events → what to play" logic. Web Audio lives in WebAudioSynth; this file runs in node tests. */

/** One frame's worth of Simulation.takeSoundEvents(). */
export interface SoundEvents {
  launchPowers: number[];
  bursts: number;
  fireArea: number;
}

export type SoundStart =
  | { kind: "boom"; rate: number }        // pitch multiplier, 1 ± 15%
  | { kind: "whoosh"; duration: number }; // seconds

export interface SoundFrame {
  starts: SoundStart[]; // sounds to start now
  crackle: number;      // target crackle level 0..1; the synth ramps toward it (Q14)
}

const CAP_COUNT = 4;              // Q5/Q17: at most 4 starts of one kind...
const CAP_WINDOW_MS = 100;        // ...in any 100 ms
const FULL_CRACKLE_AREA = 20_000; // px² of fire for full crackle (Q15)
const VARIATION = 0.15;           // ±15% (Q7)

export class SoundDirector {
  private readonly recentBooms: number[] = [];   // start times (ms) of booms in the last 100 ms
  private readonly recentWhooshes: number[] = [];

  /** `random` is injectable so tests get fixed values; never the sim RNG (Q7). */
  constructor(private readonly random: () => number = Math.random) {}

  update(events: SoundEvents, paused: boolean, enabled: boolean, nowMs: number): SoundFrame {
    if (!enabled || paused) return { starts: [], crackle: 0 }; // the events were already drained, so they're dropped, not queued
    const starts: SoundStart[] = [];
    const booms = this.admit(this.recentBooms, events.bursts, nowMs);
    for (let i = 0; i < booms; i++) starts.push({ kind: "boom", rate: this.vary(1) });
    const whooshes = this.admit(this.recentWhooshes, events.launchPowers.length, nowMs);
    for (const power of events.launchPowers.slice(0, whooshes)) {
      starts.push({ kind: "whoosh", duration: this.vary(0.35 + 0.5 * power) }); // Q16
    }
    return { starts, crackle: Math.min(1, Math.sqrt(events.fireArea / FULL_CRACKLE_AREA)) };
  }

  /** Q17 sliding window: forget starts ≥100 ms old, then allow up to 4 minus what's left. */
  private admit(recent: number[], wanted: number, nowMs: number): number {
    while (recent.length > 0 && nowMs - recent[0] >= CAP_WINDOW_MS) recent.shift();
    const allowed = Math.min(wanted, CAP_COUNT - recent.length);
    for (let i = 0; i < allowed; i++) recent.push(nowMs);
    return allowed;
  }

  /** x × (1 ± 15%): random() is 0..1, so random()*2-1 is -1..1. */
  private vary(x: number): number {
    return x * (1 + (this.random() * 2 - 1) * VARIATION);
  }
}
