/** Step 18: plays SoundDirector frames with Web Audio. Browser-only (vitest runs in node); checked by test:browser and by ear. */
import type { SoundFrame } from "./SoundDirector";

// Starting values; all tuned by ear in chunk 6.
const MASTER_GAIN = 0.5;      // Q9
const CRACKLE_FADE_S = 0.07;  // Q19: ~0.2 s from full to near-silent
const CLICKS_PER_SECOND = 40; // Q18: click rate at full crackle
const CLICK_S = 0.005;        // one click lasts 5 ms
const BOOM_S = 1.2;
const BOOM_CUTOFF_HZ = 250;   // only rumble below this gets through
const WHOOSH_LOW_HZ = 300;    // the whoosh sweeps from this...
const WHOOSH_HIGH_HZ = 3000;  // ...up to this
const WHOOSH_PEAK = 0.4;
const SILENT = 0.001;         // exponential ramps can't reach 0, so they stop here (−60 dB)

export class WebAudioSynth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;   // everything → master → compressor → speakers
  private noise!: AudioBuffer; // 1 s of white noise, shared by every voice (Q1)
  private enabled = true;
  private crackleLevel = 0;    // Q19: smoothed fire level; sets click count and volume
  private lastPlayTime = 0;    // ctx.currentTime at the previous play()

  /** Q4: browsers only let audio start inside a user gesture, so create/resume on the first pointerdown or keydown. */
  constructor(target: EventTarget = window) {
    const unlock = () => {
      if (!this.ctx) this.init(new AudioContext());
      void this.ctx!.resume();
    };
    target.addEventListener("pointerdown", unlock, { once: true });
    target.addEventListener("keydown", unlock, { once: true });
  }

  private init(ctx: AudioContext): void {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor(); // Q5: browser defaults squash overlapping booms
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? MASTER_GAIN : 0;
    this.master.connect(compressor);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }

  /** Q4: unticking mutes instantly, including booms already ringing; the director then stops starting new ones. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return; // called every frame; only act on a change
    this.enabled = enabled;
    if (this.ctx) this.master.gain.setValueAtTime(enabled ? MASTER_GAIN : 0, this.ctx.currentTime);
  }

  /** On GPU device loss (the clock stops), so a crackle doesn't keep playing over a dead sim. */
  suspend(): void {
    void this.ctx?.suspend();
  }

  /** Called once per frame with the director's output. */
  play(frame: SoundFrame): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return; // before the first click/key there's no sound: drop, don't queue
    const now = ctx.currentTime;
    const elapsed = Math.min(now - this.lastPlayTime, 0.1); // after a hidden tab, don't play a pile of clicks
    this.lastPlayTime = now;
    for (const s of frame.starts) {
      if (s.kind === "boom") this.boom(now, s.rate);
      else this.whoosh(now, s.duration);
    }
    this.crackleLevel += (frame.crackle - this.crackleLevel) * (1 - Math.exp(-elapsed / CRACKLE_FADE_S));
    this.crackleClicks(now, elapsed);
  }

  /** Low rumble: noise → low-pass → quick fade out. */
  private boom(now: number, rate: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();        // the default type is "lowpass"
    filter.frequency.value = BOOM_CUTOFF_HZ * rate; // ±15% pitch (Q7)
    const env = ctx.createGain();
    env.gain.setValueAtTime(1, now);
    env.gain.exponentialRampToValueAtTime(SILENT, now + BOOM_S);
    this.noiseSource(now, BOOM_S).connect(filter).connect(env).connect(this.master);
  }

  /** Rising hiss: noise → band-pass sweeping up, swelling in then out. */
  private whoosh(now: number, duration: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(WHOOSH_LOW_HZ, now);
    filter.frequency.exponentialRampToValueAtTime(WHOOSH_HIGH_HZ, now + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, now);
    env.gain.exponentialRampToValueAtTime(WHOOSH_PEAK, now + duration * 0.3); // swell for the first 30%...
    env.gain.exponentialRampToValueAtTime(SILENT, now + duration);            // ...then fade as it climbs away
    this.noiseSource(now, duration).connect(filter).connect(env).connect(this.master);
  }

  /** Q18/Q19: schedule this frame's clicks; the count and volume follow crackleLevel. */
  private crackleClicks(now: number, elapsed: number): void {
    const ctx = this.ctx!;
    const due = this.crackleLevel * CLICKS_PER_SECOND * elapsed;
    const count = Math.floor(due) + (Math.random() < due % 1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const when = now + Math.random() * elapsed; // spread over the next frame, not all at once
      const env = ctx.createGain();
      env.gain.setValueAtTime(this.crackleLevel * (0.3 + Math.random() * 0.7), when); // random loudness per click
      env.gain.exponentialRampToValueAtTime(SILENT, when + CLICK_S);
      this.noiseSource(when, CLICK_S).connect(env).connect(this.master);
    }
  }

  /** One play of the shared noise from a random point, so no two sounds start the same. */
  private noiseSource(when: number, seconds: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true; // the buffer is 1 s and a boom is 1.2 s
    src.start(when, Math.random() * this.noise.duration);
    src.stop(when + seconds);
    return src;
  }
}
