/**
 * New Song wizard contributions for the BLIP-01 PSG.
 *
 * The web editor's New Song modal reads `newSongWizard` to show chip metadata
 * on the chip card and to offer starter templates for instruments, effects, and
 * structure. Keep every template self-contained and parser-valid; the
 * `defaults` templates double as the audio previewed by the Preview button.
 */
import type { ChipNewSongWizard } from '@beatbax/engine';

export const blipSongWizard: ChipNewSongWizard = {
  metadata: {
    chipDisplayName: 'BLIP-01',
    platform: 'Fictional PSG',
    year: '1987',
    channelSummary: 'square, triangle, wavetable, noise',
    eraTag: '1987',
    styleTags: ['wavetable', 'square', '4-channel'],
    blurb: 'A tiny four-voice PSG with a drawable wavetable — the perfect canvas for learning BeatBax chip plugins.',
    channels: [
      { name: 'Pulse', role: 'lead / arps' },
      { name: 'Triangle', role: 'bass / flute' },
      { name: 'Wave', role: 'pads / custom timbres' },
      { name: 'Noise', role: 'drums' },
    ],
    highlights: [
      { title: 'Draw your own timbre', detail: 'The wave channel plays any 32-sample wavetable you sketch in the editor.' },
      { title: 'Duty-cycle bites', detail: 'Thin 12.5% pulses cut like a chiptune lead; 50% feels round and warm.' },
    ],
  },

  templates: {
    instruments: [
      {
        id: 'blip-sample-instruments',
        label: 'Sample instruments',
        content:
          'inst lead type=pulse vol=13 duty=25 env=13,down,2\ninst bass type=triangle vol=15 env=15,flat\ninst pad type=wave vol=10 wave=0123456789abcdef0123456789abcdef\ninst kick type=noise vol=15 noise_mode=white noise_rate=2 env=15,down,1\ninst snare type=noise vol=12 noise_mode=white noise_rate=1 env=12,down,2\ninst hat type=noise vol=9 noise_mode=white noise_rate=0 env=9,down,1',
      },
    ],
    effects: [
      {
        id: 'blip-sample-effects',
        label: 'Sample effects',
        content: 'effect leadVib = vib:3,5,sine,4',
      },
    ],
    structure: [
      {
        id: 'blip-sample-structure',
        label: 'Sample structure',
        content:
          'pat melody = C4 E4 G4 E4\npat bassl  = C2 . G2 .\npat drums  = kick . kick .\nseq main   = melody melody\nchannel 1 => inst lead seq main\nchannel 2 => inst bass seq bassl\nchannel 3 => inst pad seq main:oct(-2)\nchannel 4 => inst kick seq drums\nplay',
      },
    ],
    defaults: {
      instruments: 'blip-sample-instruments',
      effects: 'blip-sample-effects',
      structure: 'blip-sample-structure',
    },
  },
};
