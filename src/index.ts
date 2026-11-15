/**
 * @beatbax/plugin-chip-blip — the BLIP-01 PSG chip plugin.
 *
 * A deliberately minimal, fully-commented example chip for the BeatBax plugin
 * starter template. It exposes four voices:
 *
 *   channel 0 → pulse     (square wave, 4 duty cycles, volume + hardware envelope)
 *   channel 1 → triangle  (fixed triangle wave, volume + hardware envelope)
 *   channel 2 → wave      (16/32-sample wavetable, volume + hardware envelope)
 *   channel 3 → noise     (LFSR white noise or periodic buzz)
 *
 * Usage (programmatic):
 * ```typescript
 * import { BeatBaxEngine } from '@beatbax/engine';
 * import blipPlugin from 'beatbax-plugin-chip-blip';
 *
 * const engine = new BeatBaxEngine();
 * engine.registerChipPlugin(blipPlugin);
 * ```
 *
 * Usage (BeatBax script):
 * ```bax
 * chip blip
 * bpm 120
 *
 * inst lead type=pulse vol=13 duty=25 env=13,down,2
 * inst bass type=triangle vol=15 env=15,flat
 * inst pad  type=wave vol=10 wave=0123456789abcdef0123456789abcdef
 * inst kick type=noise vol=15 noise_mode=white noise_rate=2 env=15,down,1
 * inst snare type=noise vol=12 noise_mode=white noise_rate=1 env=12,down,2
 *
 * pat melody = C4 E4 G4 E4
 * pat bassl  = C2 . G2 .
 * pat drums  = kick . snare .
 * seq main   = melody melody
 *
 * channel 1 => inst lead seq main
 * channel 2 => inst bass seq bassl
 * channel 3 => inst pad seq main:oct(-2)
 * channel 4 => inst kick seq drums
 *
 * play
 * ```
 *
 * NOTE: import only *types* from the root `@beatbax/engine` entry. Runtime
 * plugin code that must run in a browser should prefer browser-safe subpaths
 * (`@beatbax/engine/chips`, `@beatbax/engine/util/music`, …) and must never
 * import `@beatbax/engine/node`.
 */
import type { ChipPlugin, ChipChannelBackend } from '@beatbax/engine';
import { version } from './version.js';
import { createChannel } from './channel.js';
import { validateBlipInstrument, BLIP_TYPES } from './validate.js';
import { blipUIContributions } from './ui-contributions.js';
import { blipSongWizard } from './songWizard.js';
import { blipInstrumentEditor } from './instrument-editor.js';
import { BLIP_MIX_GAIN } from './mixer.js';

const blipPlugin: ChipPlugin = {
  // Identifier used in the `chip blip` directive. Must match the string users
  // write in their `.bax` files.
  name: 'blip',

  // Optional aliases accepted anywhere a chip name is resolved (`chip blip01`).
  aliases: ['blip01'],

  version,

  // Maturity badge shown in Settings and the New Song Wizard.
  status: 'Stable',

  // Number of audio channels this chip exposes.
  channels: 4,

  // `vol` maps directly to a runtime amplitude register (0..15), so the mixer
  // may offer per-channel volume control. Chips whose volume is baked into an
  // envelope (e.g. Game Boy DMG) should set this to false.
  supportsPerChannelVolume: true,

  // The integer range of the `vol` / `env` level fields. `max` = loudest here
  // (not attenuation-based). This drives the instrument volume indicator in
  // the web UI Channel Mixer.
  instrumentVolumeRange: { min: 0, max: 15 },

  // Optional: normalize the per-channel VU/waveform meter so a `vol=15`
  // triangle doesn't *look* quieter than a `vol=15` pulse. Display-only —
  // does not change audio output (see BLIP_MIX_GAIN in mixer.ts).
  getMeterDisplayGain(channelIndex: number): number {
    switch (channelIndex) {
      case 0: return 1 / BLIP_MIX_GAIN.pulse;
      case 1: return 1 / BLIP_MIX_GAIN.triangle;
      case 2: return 1 / BLIP_MIX_GAIN.wave;
      case 3: return 1 / BLIP_MIX_GAIN.noise;
      default: return 1;
    }
  },

  // Optional web editor contributions (hover docs, help panel, Copilot prompt).
  uiContributions: blipUIContributions,

  // Optional New Song wizard metadata and starter templates.
  newSongWizard: blipSongWizard,

  // Optional Desktop Instrument Editor schema (no React — the host renders it).
  instrumentEditor: blipInstrumentEditor,

  validateInstrument(inst) {
    return validateBlipInstrument(inst);
  },

  createChannel(channelIndex, audioContext): ChipChannelBackend {
    return createChannel(channelIndex, audioContext);
  },
};

export default blipPlugin;
export { blipPlugin };

// Re-export a couple of useful bits for consumers/tests.
export { BLIP_TYPES } from './validate.js';
export { createChannel, PulseBackend, TriangleBackend, WaveBackend, NoiseBackend } from './channel.js';
export { BLIP_MIX_GAIN, BLIP_TARGET_PEAK } from './mixer.js';
