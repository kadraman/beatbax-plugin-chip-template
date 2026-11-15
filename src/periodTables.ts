/**
 * Hardware constants and value-conversion helpers for the BLIP-01 PSG.
 *
 * This file is the natural home for the chip's frequency/period lookup table
 * and any fixed hardware parameters. For a real chip you would replace the
 * fictional values below with the actual master clock, divider, and duty
 * sequences (see `packages/engine/src/chips/gameboy/periodTables.ts` or the
 * NES/SMS period tables in the BeatBax repo for reference implementations).
 */

/** Fictional 1 MHz master clock for the BLIP-01. Replace with your chip's clock. */
export const BLIP_CLOCK = 1_000_000;

/**
 * Nominal hardware envelope clock in Hz.
 *
 * BeatBax calls `ChipChannelBackend.applyEnvelope(frame)` once per engine
 * frame; the frame counter is opaque. We treat each frame as `1 /
 * ENVELOPE_FRAME_HZ` seconds when converting to Web Audio time so the PCM and
 * Web Audio envelopes stay in rough agreement.
 */
export const ENVELOPE_FRAME_HZ = 60;

/**
 * LFSR step rates for the noise channel, indexed by the `noise_rate` field:
 *
 *   noise_rate 0 → 32 kHz  (bright — hi-hat)
 *   noise_rate 1 → 12 kHz  (mid   — snare)
 *   noise_rate 2 →  5 kHz  (dark  — kick)
 *
 * Lower clocks produce darker, lower-frequency noise. Replace with your chip's
 * actual noise period table (see the SMS/SN76489 plugin for a real example).
 */
export const NOISE_RATE_HZ: readonly number[] = [32_000, 12_000, 5_000];

/** `periodic` noise runs the LFSR at half the rate for a buzzing, tonal quality. */
export const NOISE_PERIODIC_DIVISOR = 2;

/** Number of samples in a wave-channel wavetable. */
export const WAVE_TABLE_LENGTH = 32;

/**
 * Accepted `duty` strings and their pulse-width fractions (0..1).
 *
 * A square wave's duty cycle is the fraction of each period the output is
 * "high". 50% is a normal square; 12.5% is a thin, nasal pulse.
 */
export const DUTY_FRACTIONS: Record<string, number> = {
  '12.5': 0.125,
  '12': 0.125,
  '0.125': 0.125,
  '25': 0.25,
  '0.25': 0.25,
  '50': 0.5,
  '0.5': 0.5,
  '75': 0.75,
  '0.75': 0.75,
};

/**
 * Resolve an instrument `duty` value to a pulse-width fraction, falling back
 * to 50% (a plain square wave) for anything unrecognised.
 */
export function dutyFraction(raw: unknown): number {
  const key = String(raw ?? '50').trim().toLowerCase();
  return DUTY_FRACTIONS[key] ?? 0.5;
}

/**
 * Clamp an instrument `vol` value to the 0–15 hardware range, defaulting to
 * full volume when omitted. Returns an integer so it can be used directly as
 * a hardware register value.
 */
export function clampVolume(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15;
  return Math.max(0, Math.min(15, Math.round(n)));
}

/**
 * Clamp a `noise_rate` value to the 0–2 range (0 = bright/hat, 1 = snare,
 * 2 = dark/kick), defaulting to 1.
 */
export function clampNoiseRate(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(2, Math.round(n)));
}

// ─── Wavetable ────────────────────────────────────────────────────────────────

/** A 32-nibble hex string, e.g. `0123456789abcdef0123456789abcdef` (sawtooth). */
const WAVE_HEX_RE = /^[0-9a-f]{32}$/i;

/**
 * Parse a wave-channel wavetable into a `number[]` of 4-bit samples (0–15).
 *
 * Accepts:
 *   - an array of numbers (clamped to 0–15), or
 *   - a 32-nibble hex string (`0123456789abcdef…`), or
 *   - a JSON-encoded array string.
 *
 * Returns `null` for anything unrecognised. Callers decide whether the length
 * (16 or 32 samples) is acceptable for their hardware.
 */
export function parseWaveTable(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    const samples = raw.map((s) => Math.max(0, Math.min(15, Math.round(Number(s) || 0))));
    return samples.length > 0 ? samples : null;
  }

  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (WAVE_HEX_RE.test(trimmed)) {
    return trimmed.split('').map((nibble) => parseInt(nibble, 16));
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parseWaveTable(parsed) : null;
  } catch {
    return null;
  }
}
