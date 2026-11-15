/**
 * Channel backends for the BLIP-01 PSG.
 *
 * Each class implements `ChipChannelBackend` — the interface the BeatBax
 * engine uses to drive one hardware voice. A plugin's `createChannel()`
 * factory returns one backend per channel index.
 *
 *   channel 0 → pulse     (square wave, 4 duty cycles)
 *   channel 1 → triangle  (fixed triangle wave)
 *   channel 2 → wave      (32-sample wavetable)
 *   channel 3 → noise     (LFSR white noise or periodic buzz)
 *
 * Two rendering paths are supported (see the plugin guide "Dual Rendering"):
 *
 *   - PCM (`render()`): used by the CLI / headless / Node.js. The engine calls
 *     `render(buffer, sampleRate)` repeatedly and mixes channels by
 *     accumulation, so implementations must ADD to the buffer (`buffer[i] +=`)
 *     rather than overwrite it.
 *
 *   - Web Audio (`createPlaybackNodes()`): used in the browser / Electron. It
 *     returns `[sourceNode, gainNode]` so the engine can insert effects (arp,
 *     vib, portamento, echo…) between the gain and the destination. Melodic
 *     channels implement BOTH paths; percussion channels (like our noise
 *     voice) only need the PCM path.
 */
import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import {
  dutyFraction,
  clampVolume,
  clampNoiseRate,
  parseWaveTable,
  ENVELOPE_FRAME_HZ,
  NOISE_RATE_HZ,
  NOISE_PERIODIC_DIVISOR,
} from './periodTables.js';
import { BLIP_MIX_GAIN } from './mixer.js';

// Per-voice output gains live in `mixer.ts` (BLIP_MIX_GAIN). Each voice uses
// its own gain so a triangle or wavetable isn't audibly quieter than the pulse
// at the same `vol` level.

// ─── Hardware envelope ─────────────────────────────────────────────────────────

/** A parsed `env=<initial>,<up|down|flat>[,<period>]` hardware envelope. */
interface Envelope {
  initial: number; // 0..15 volume at note onset
  direction: 'up' | 'down' | 'flat';
  period: number; // frames per envelope step; 0 = no stepping
}

/**
 * Parse the instrument's `vol` and optional `env` field into a hardware
 * envelope. When no `env` is present the volume is held constant at `vol`.
 *
 * The engine may hand us `env` in two shapes:
 *   - a CSV string (`"13,down,2"`, optionally vendor-prefixed `"gb:13,down,1"`),
 *   - a normalized object (`{ level, direction, period }`) from JSON `env={…}`
 *     or when the parser normalizes `env` to an object.
 * We accept both so playback is correct in either mode.
 */
function parseEnvelope(inst: InstrumentNode): Envelope {
  let initial = clampVolume(inst.vol);
  let direction: 'up' | 'down' | 'flat' = 'flat';
  let period = 0;

  const raw = inst.env;
  if (raw && typeof raw === 'object') {
    const level = Number((raw as any).level ?? (raw as any).initial ?? 15);
    if (!Number.isNaN(level)) initial = Math.max(0, Math.min(15, Math.floor(level)));
    const d = String((raw as any).direction ?? 'flat').toLowerCase();
    direction = d === 'up' ? 'up' : d === 'down' ? 'down' : 'flat';
    const p = Number((raw as any).period ?? 0);
    if (!Number.isNaN(p)) period = Math.max(0, Math.min(15, Math.floor(p)));
  } else if (raw) {
    const s = String(raw).trim().replace(/^[a-z]+:/i, ''); // strip "gb:" prefix if present
    const parts = s.split(',').map((x) => x.trim());
    const v0 = parseInt(parts[0], 10);
    if (!Number.isNaN(v0)) initial = Math.max(0, Math.min(15, v0));
    if (parts[1]) {
      const d = parts[1].toLowerCase();
      direction = d === 'up' ? 'up' : d === 'flat' ? 'flat' : 'down';
    }
    if (parts[2]) {
      const v2 = parseInt(parts[2], 10);
      if (!Number.isNaN(v2)) period = Math.max(0, Math.min(15, v2));
    }
  }

  return { initial, direction, period };
}

/** Current envelope level (0..15) at a given frame index. */
function envelopeLevel(env: Envelope, frame: number): number {
  if (env.period <= 0 || env.direction === 'flat') return env.initial;
  const steps = Math.floor(frame / env.period);
  if (env.direction === 'down') return Math.max(0, env.initial - steps);
  return Math.min(15, env.initial + steps); // 'up'
}

/**
 * Schedule an amplitude envelope on a gain AudioParam (shared by the pulse,
 * triangle, and wave Web Audio paths). `gain` is the voice's mixer gain.
 */
function scheduleGainEnvelope(g: any, env: Envelope, start: number, dur: number, gain: number): void {
  const startLevel = (env.initial / 15) * gain;
  g.setValueAtTime(startLevel, start);

  if (env.period > 0 && env.direction !== 'flat') {
    // Step the hardware envelope over the note duration, one step per
    // `env.period` frames, then release.
    const stepSeconds = env.period / ENVELOPE_FRAME_HZ;
    const steps = Math.max(0, Math.floor(dur / stepSeconds));
    const values: number[] = [];
    let cur = env.initial;
    values.push((cur / 15) * gain);
    for (let s = 1; s <= steps; s++) {
      if (env.direction === 'down') cur = Math.max(0, cur - 1);
      else cur = Math.min(15, cur + 1);
      values.push((cur / 15) * gain);
      if (cur === 0 || cur === 15) break;
    }
    const curve = new Float32Array(values);
    const curveDuration = Math.max(0.001, (values.length - 1) * stepSeconds);
    try {
      g.setValueCurveAtTime(curve, start, curveDuration);
    } catch {
      g.setValueAtTime(startLevel, start);
    }
    g.setValueAtTime(values[values.length - 1], start + dur);
    g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
  } else {
    // Constant volume, with a short release at note end.
    g.setValueAtTime(startLevel, start + dur);
    g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
  }
}

// ─── Pulse (square) voice ──────────────────────────────────────────────────────

/**
 * A square-wave voice with duty-cycle and hardware-envelope support.
 * Used for `pulse` (channel 0).
 */
export class PulseBackend implements ChipChannelBackend {
  private active = false;
  private freq = 0;
  /** Phase accumulator in [0, 1) so the waveform is continuous across buffers. */
  private phase = 0;
  private duty = 0.5;
  private level = 15; // current envelope level (0..15)
  private env: Envelope = { initial: 15, direction: 'flat', period: 0 };
  private frame = 0;

  reset(): void {
    this.active = false;
    this.freq = 0;
    this.phase = 0;
    this.level = 15;
    this.frame = 0;
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.duty = dutyFraction(instrument.duty);
    this.env = parseEnvelope(instrument);
    this.level = this.env.initial;
    this.frame = 0;
    this.phase = 0; // retrigger from the start of the waveform
    this.active = true;
  }

  noteOff(): void {
    // A real chip would run a release segment here. For a starter template we
    // cut the voice immediately; the engine also schedules the Web Audio
    // release ramp via `createPlaybackNodes` below.
    this.active = false;
  }

  /**
   * Optional: called by the arpeggio effect to cycle chord tones without
   * re-triggering the amplitude envelope. Backends that omit it fall back to
   * `noteOn`, which re-attacks the envelope on every arp step.
   */
  setFrequency(frequency: number): void {
    this.freq = frequency;
  }

  applyEnvelope(frame: number): void {
    this.frame = frame;
    this.level = envelopeLevel(this.env, frame);
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || this.freq <= 0) return;

    const amplitude = (this.level / 15) * BLIP_MIX_GAIN.pulse;
    const phaseInc = this.freq / sampleRate;

    for (let i = 0; i < buffer.length; i++) {
      // Square wave: +amplitude for the first `duty` fraction of each cycle,
      // -amplitude for the rest. ADD to the buffer (never overwrite).
      buffer[i] += this.phase < this.duty ? amplitude : -amplitude;

      this.phase += phaseInc;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    }
  }

  createPlaybackNodes(
    ctx: BaseAudioContext,
    freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    _scheduler: unknown,
    destination: AudioNode,
  ): AudioNode[] | null {
    // Fall back to the PCM path when the context is a mock without real
    // Web Audio node factories (e.g. in some tests).
    if (typeof (ctx as any).createOscillator !== 'function') return null;

    const duty = dutyFraction(inst.duty);
    const env = parseEnvelope(inst);

    const osc = (ctx as any).createOscillator();
    const gain = (ctx as any).createGain();

    // 1. Waveform: a plain square for 50% duty, otherwise a PeriodicWave whose
    //    harmonics reproduce the requested duty cycle (mirrors the NES pulse).
    try {
      if (duty !== 0.5 && typeof (ctx as any).createPeriodicWave === 'function') {
        osc.setPeriodicWave(createPulsePeriodicWave(ctx, duty));
      } else {
        osc.type = 'square';
      }
    } catch {
      osc.type = 'square';
    }

    // 2. Frequency — store `_baseFreq` so the arp effect can read the base
    //    pitch before automating `osc.frequency`.
    osc.frequency.setValueAtTime(freq, start);
    osc._baseFreq = freq;

    // 3. Wire: oscillator → gain → destination. The engine inserts effects
    //    (pan, echo…) between `gain` and `destination` automatically.
    osc.connect(gain);
    gain.connect(destination);

    // 4. Amplitude envelope.
    scheduleGainEnvelope(gain.gain, env, start, dur, BLIP_MIX_GAIN.pulse);

    // 5. Note lifetime — use the provided `start` time, not ctx.currentTime.
    osc.start(start);
    osc.stop(start + dur + 0.02);

    // 6. Return [osc, gain] so the engine can apply effects.
    return [osc, gain];
  }
}

/**
 * Build a PeriodicWave whose first `MAX_HARMONICS` harmonics approximate a
 * square wave at the requested duty cycle.
 *
 * `disableNormalization: true` keeps our scaled amplitudes (Web Audio otherwise
 * re-normalizes the wave to a fixed peak); 64 harmonics give a reasonably
 * band-limited square without excessive aliasing. A real chip has a fixed
 * hardware sequence instead — see the NES pulse's 8-step duty table for that
 * approach.
 */
const MAX_HARMONICS = 64;

function createPulsePeriodicWave(ctx: BaseAudioContext, duty: number): any {
  const size = 4096;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);

  for (let n = 1; n <= MAX_HARMONICS; n++) {
    const amplitude = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    imag[n] = Number.isFinite(amplitude) ? amplitude : 0;
  }

  return (ctx as any).createPeriodicWave(real, imag, { disableNormalization: true });
}

// ─── Triangle voice ────────────────────────────────────────────────────────────

/**
 * A fixed triangle wave — the classic smooth bass/flute voice. No duty cycle;
 * only volume and envelope. Web Audio has a built-in triangle oscillator, so
 * the browser path is trivial.
 */
export class TriangleBackend implements ChipChannelBackend {
  private active = false;
  private freq = 0;
  private phase = 0;
  private level = 15;
  private env: Envelope = { initial: 15, direction: 'flat', period: 0 };
  private frame = 0;

  reset(): void {
    this.active = false;
    this.freq = 0;
    this.phase = 0;
    this.level = 15;
    this.frame = 0;
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.env = parseEnvelope(instrument);
    this.level = this.env.initial;
    this.frame = 0;
    this.phase = 0;
    this.active = true;
  }

  noteOff(): void {
    this.active = false;
  }

  setFrequency(frequency: number): void {
    this.freq = frequency;
  }

  applyEnvelope(frame: number): void {
    this.frame = frame;
    this.level = envelopeLevel(this.env, frame);
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || this.freq <= 0) return;

    const amplitude = (this.level / 15) * BLIP_MIX_GAIN.triangle;
    const phaseInc = this.freq / sampleRate;

    for (let i = 0; i < buffer.length; i++) {
      // Triangle: rises linearly from -1 to +1 over the first half of the
      // cycle, falls back to -1 over the second half.
      const tri = this.phase < 0.5 ? 4 * this.phase - 1 : 3 - 4 * this.phase;
      buffer[i] += tri * amplitude;

      this.phase += phaseInc;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    }
  }

  createPlaybackNodes(
    ctx: BaseAudioContext,
    freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    _scheduler: unknown,
    destination: AudioNode,
  ): AudioNode[] | null {
    if (typeof (ctx as any).createOscillator !== 'function') return null;

    const env = parseEnvelope(inst);
    const osc = (ctx as any).createOscillator();
    const gain = (ctx as any).createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);
    osc._baseFreq = freq;

    osc.connect(gain);
    gain.connect(destination);

    scheduleGainEnvelope(gain.gain, env, start, dur, BLIP_MIX_GAIN.triangle);

    osc.start(start);
    osc.stop(start + dur + 0.02);

    return [osc, gain];
  }
}

// ─── Wave (wavetable) voice ────────────────────────────────────────────────────

/**
 * A user-defined wavetable voice. The `wave` instrument field holds 16 or 32
 * four-bit samples (0–15) as a hex string or a number array.
 *
 * PCM path: loop through the table, mean-centred so silence sits at zero.
 * Web Audio path: render one cycle into an AudioBuffer and scale its
 * `playbackRate` to the requested frequency (the same trick the Game Boy wave
 * channel uses).
 */
export class WaveBackend implements ChipChannelBackend {
  private active = false;
  private freq = 0;
  private phase = 0;
  private table: number[] = [];
  private level = 15;
  private env: Envelope = { initial: 15, direction: 'flat', period: 0 };
  private frame = 0;

  reset(): void {
    this.active = false;
    this.freq = 0;
    this.phase = 0;
    this.table = [];
    this.level = 15;
    this.frame = 0;
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.table = parseWaveTable(instrument.wave) ?? [];
    this.env = parseEnvelope(instrument);
    this.level = this.env.initial;
    this.frame = 0;
    this.phase = 0;
    this.active = true;
  }

  noteOff(): void {
    this.active = false;
  }

  setFrequency(frequency: number): void {
    this.freq = frequency;
  }

  applyEnvelope(frame: number): void {
    this.frame = frame;
    this.level = envelopeLevel(this.env, frame);
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || this.freq <= 0 || this.table.length === 0) return;

    const amplitude = (this.level / 15) * BLIP_MIX_GAIN.wave;
    const cycleLen = this.table.length;
    const mean = this.table.reduce((a, b) => a + b, 0) / cycleLen;
    // One full table per output cycle.
    const phaseInc = (this.freq * cycleLen) / sampleRate;

    for (let i = 0; i < buffer.length; i++) {
      const idx = Math.floor(this.phase) % cycleLen;
      buffer[i] += ((this.table[idx] - mean) / 15) * amplitude;

      this.phase += phaseInc;
      if (this.phase >= cycleLen) this.phase -= Math.floor(this.phase);
    }
  }

  createPlaybackNodes(
    ctx: BaseAudioContext,
    freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    _scheduler: unknown,
    destination: AudioNode,
  ): AudioNode[] | null {
    if (
      typeof (ctx as any).createBuffer !== 'function' ||
      typeof (ctx as any).createBufferSource !== 'function'
    ) {
      return null;
    }

    const table = parseWaveTable(inst.wave) ?? [];
    if (table.length === 0) return null;

    const env = parseEnvelope(inst);
    const sampleRate = (ctx as any).sampleRate || 44100;
    const cycleLen = table.length;
    const mean = table.reduce((a, b) => a + b, 0) / cycleLen;

    // Render exactly one cycle of the wavetable into a buffer.
    const buf = (ctx as any).createBuffer(1, cycleLen, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < cycleLen; i++) {
      data[i] = (table[i] - mean) / 15;
    }

    const src = (ctx as any).createBufferSource();
    src.buffer = buf;

    // One buffer = one cycle at `sampleRate / cycleLen` Hz. Scale playbackRate
    // so the cycle plays at the requested frequency.
    const cycleFreq = sampleRate / cycleLen;
    src.playbackRate.setValueAtTime(freq / cycleFreq, start);
    src._baseFreq = freq;

    const gain = (ctx as any).createGain();
    src.connect(gain);
    gain.connect(destination);

    scheduleGainEnvelope(gain.gain, env, start, dur, BLIP_MIX_GAIN.wave);

    src.start(start);
    src.stop(start + dur + 0.02);

    return [src, gain];
  }
}

// ─── Noise voice ───────────────────────────────────────────────────────────────

/**
 * Advance a 16-bit Galois LFSR by one step (deterministic pseudo-noise).
 *
 * The tap mask (bits 0,2,3,5) is a maximal-length polynomial, so the sequence
 * cycles through 2^16-1 states before repeating — enough for non-repetitive
 * noise over short notes. The fixed seed keeps PCM export and tests
 * deterministic (no `Math.random()` in the audio path).
 */
function stepLfsr(state: number): number {
  const bit = ((state >> 0) ^ (state >> 2) ^ (state >> 3) ^ (state >> 5)) & 1;
  return ((state >> 1) | (bit << 15)) & 0xffff;
}

/**
 * A noise voice driven by a linear-feedback shift register (LFSR), matching
 * how real retro sound chips generate percussion. Percussion channels only
 * implement `render()` — they do not use the melodic effects system, so they
 * have no `createPlaybackNodes()`.
 */
export class NoiseBackend implements ChipChannelBackend {
  private active = false;
  private periodic = false;
  private rate = 1; // noise_rate index into NOISE_RATE_HZ (0=hat, 1=snare, 2=kick)
  private level = 15;
  private env: Envelope = { initial: 15, direction: 'flat', period: 0 };
  private frame = 0;
  private lfsr = 0xace1; // fixed seed so tests stay deterministic
  private noisePhase = 0; // fractional LFSR step accumulator

  reset(): void {
    this.active = false;
    this.periodic = false;
    this.rate = 1;
    this.level = 15;
    this.frame = 0;
    this.lfsr = 0xace1;
    this.noisePhase = 0;
  }

  noteOn(_frequency: number, instrument: InstrumentNode): void {
    // `frequency` is ignored for noise; the LFSR step rate sets the "pitch".
    this.periodic = String(instrument.noise_mode ?? 'white').toLowerCase() === 'periodic';
    this.rate = clampNoiseRate(instrument.noise_rate);
    this.env = parseEnvelope(instrument);
    this.level = this.env.initial;
    this.frame = 0;
    this.lfsr = 0xace1;
    this.noisePhase = 0;
    this.active = true;
  }

  noteOff(): void {
    this.active = false;
  }

  applyEnvelope(frame: number): void {
    this.frame = frame;
    this.level = envelopeLevel(this.env, frame);
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active) return;

    const amplitude = (this.level / 15) * BLIP_MIX_GAIN.noise;
    const baseHz = NOISE_RATE_HZ[this.rate] ?? NOISE_RATE_HZ[1];
    const stepHz = this.periodic ? baseHz / NOISE_PERIODIC_DIVISOR : baseHz;
    const step = stepHz / sampleRate;

    for (let i = 0; i < buffer.length; i++) {
      this.noisePhase += step;
      while (this.noisePhase >= 1) {
        this.lfsr = stepLfsr(this.lfsr);
        this.noisePhase -= 1;
      }
      // The low bit of the LFSR is our ±1 noise output.
      buffer[i] += this.lfsr & 1 ? amplitude : -amplitude;
    }
  }
}

// ─── Channel factory ───────────────────────────────────────────────────────────

/**
 * Return the backend for a given zero-based channel index.
 *
 *   channel 0 → pulse
 *   channel 1 → triangle
 *   channel 2 → wave
 *   channel 3 → noise
 */
export function createChannel(
  channelIndex: number,
  _audioContext: BaseAudioContext,
): ChipChannelBackend {
  switch (channelIndex) {
    case 0:
      return new PulseBackend();
    case 1:
      return new TriangleBackend();
    case 2:
      return new WaveBackend();
    case 3:
      return new NoiseBackend();
    default:
      throw new Error(`blip: invalid channel index ${channelIndex} (valid: 0–3)`);
  }
}
