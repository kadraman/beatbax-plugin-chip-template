/**
 * Mixer gains for the BLIP-01 PSG.
 *
 * A single flat gain makes some voices sound louder than others at the same
 * `vol` level:
 *
 *   - a square/pulse delivers full power at its peak (RMS ≈ peak),
 *   - a triangle at the same peak carries only ~1/√3 of that power and has no
 *     harmonics, so it sounds about 4.8 dB quieter,
 *   - the mean-centred wavetable peaks at ~half the raw sample range.
 *
 * These per-voice gains compensate so all four voices sit at a similar
 * perceived loudness. `triangle` is the pulse gain × √3; `wave` doubles the
 * pulse gain to make up for the mean-centring. The sum of the *effective*
 * peaks (0.2 + 0.35 + 0.2 + 0.2 = 0.95) keeps a full mix under full scale.
 *
 * Tune these to taste for your own chip (see the NES/SMS `mixer.ts` files in
 * the BeatBax repo for the full reference pattern).
 */
export const BLIP_MIX_GAIN = {
  pulse: 0.2,
  triangle: 0.35,
  wave: 0.4,
  noise: 0.2,
} as const;

/** Rough peak budget for a full four-voice mix (used only for documentation). */
export const BLIP_TARGET_PEAK = 0.95;
