/**
 * Desktop Instrument Editor schema for the BLIP-01 PSG.
 *
 * Chip plugins may declare `instrumentEditor` so the Desktop editor can edit
 * `inst` lines graphically. The host renders generic widgets from this schema;
 * plugins MUST NOT ship React UI here.
 *
 * The `waveform` block declares the drawable/hex wavetable editor for the wave
 * channel — the one place where a chip's custom waveform surface is exposed.
 *
 * Writeback still goes through the plugin's `validateInstrument`.
 */
import type { ChipInstrumentEditor } from '@beatbax/engine';

export const blipInstrumentEditor: ChipInstrumentEditor = {
  // Instrument type tiles (used for the "new instrument" picker and preview).
  types: [
    { id: 'pulse', label: 'Pulse', previewChannel: 1, previewMode: 'melodic', previewOctave: 4 },
    { id: 'triangle', label: 'Triangle', previewChannel: 2, previewMode: 'melodic', previewOctave: 3 },
    { id: 'wave', label: 'Wave', previewChannel: 3, previewMode: 'melodic', previewOctave: 4 },
    { id: 'noise', label: 'Noise', previewChannel: 4, previewMode: 'oneshot' },
  ],

  // Scalar and composite fields shown in the editor.
  fields: [
    { name: 'vol', label: 'Volume', widget: 'int', min: 0, max: 15, hint: 'Output level (0 = silent, 15 = loudest).' },
    { name: 'duty', label: 'Duty cycle', widget: 'enum', values: ['12.5', '25', '50', '75'], whenType: 'pulse', hint: 'Pulse width as a percentage of the period.' },
    { name: 'env', label: 'Envelope', widget: 'envelope', storage: 'csv', whenType: ['pulse', 'triangle', 'wave', 'noise'], hint: 'Hardware volume envelope: initial,direction,period.' },
    { name: 'noise_mode', label: 'Noise mode', widget: 'enum', values: ['white', 'periodic'], whenType: 'noise', hint: 'White noise or a periodic buzzing tone.' },
    { name: 'noise_rate', label: 'Noise rate', widget: 'enum', values: ['0', '1', '2'], whenType: 'noise', hint: 'Noise brightness: 0 = hi-hat, 1 = snare, 2 = kick.' },
  ],

  // Drawable / hex-importable wavetable for the wave channel.
  waveform: {
    field: 'wave',
    length: 32,
    min: 0,
    max: 15,
    hexImport: true,
    draw: true,
    playWhileDrawing: true,
    whenType: 'wave',
    presets: [
      { id: 'sine', label: 'Sine', samples: 'sine' },
      { id: 'square', label: 'Square', samples: 'square' },
      { id: 'saw', label: 'Saw', samples: 'saw' },
    ],
  },

  // Graphable software macros the editor offers (handled by the engine).
  macros: [
    { name: 'vol_env', label: 'Volume macro', min: 0, max: 15, loop: true, kind: 'software', hint: 'Software volume sequence, e.g. [15,12,8,4|0].' },
    { name: 'arp_env', label: 'Arpeggio macro', min: -24, max: 24, signed: true, loop: true, kind: 'software', whenType: ['pulse', 'triangle', 'wave'], hint: 'Chord tones in semitones, e.g. [0,4,7].' },
  ],

  // One-click instrument presets (`content` is an `inst` body, no name prefix).
  presets: [
    { id: 'lead', label: 'Lead', type: 'pulse', content: 'type=pulse vol=13 duty=25 env=13,down,2' },
    { id: 'bass', label: 'Bass', type: 'triangle', content: 'type=triangle vol=15 env=15,flat' },
    { id: 'pad', label: 'Saw pad', type: 'wave', content: 'type=wave vol=10 wave=0123456789abcdef0123456789abcdef' },
    { id: 'kick', label: 'Kick drum', type: 'noise', content: 'type=noise vol=15 noise_mode=white noise_rate=2 env=15,down,1' },
    { id: 'snare', label: 'Snare', type: 'noise', content: 'type=noise vol=12 noise_mode=white noise_rate=1 env=12,down,2' },
    { id: 'hat', label: 'Hi-hat', type: 'noise', content: 'type=noise vol=9 noise_mode=white noise_rate=0 env=9,down,1' },
  ],

  // Short guidance notes shown in the panel.
  constraints: [
    { id: 'duty-pulse-only', when: 'triangle', message: 'duty is ignored on the triangle channel.' },
    { id: 'wave-table-required', when: 'wave', message: 'wave requires a 16 or 32 sample wavetable.' },
  ],
};
