/**
 * Web editor contributions for the BLIP-01 PSG.
 *
 * These tailor the BeatBax web editor whenever a song using `chip blip` is the
 * active document:
 *
 *   - `copilotSystemPrompt` replaces the default Game Boy hardware block in the
 *     Copilot system prompt.
 *   - `hoverDocs` provides chip-specific Markdown shown when hovering keywords.
 *   - `helpSections` replaces/appends entries in the Help & Reference panel.
 *
 * The engine swaps these in automatically when the parser sees a `chip blip`
 * directive — no user action required.
 */
import type { ChipUIContributions } from '@beatbax/engine';

export const blipUIContributions: ChipUIContributions = {
  copilotSystemPrompt: `
══ BLIP-01 PSG HARDWARE — READ FIRST ══
4 channels with a FIXED channel-to-type mapping:
  channel 1 → pulse    (square, 4 duty cycles)
  channel 2 → triangle (fixed triangle wave)
  channel 3 → wave     (16/32-sample wavetable)
  channel 4 → noise    (LFSR white noise or periodic buzz)

Instrument fields:
  type        pulse | triangle | wave | noise (required)
  vol         0–15 (0 = silent, 15 = loudest; default 15)
  duty        12.5 | 25 | 50 | 75 — pulse channel only
  wave        16/32-sample wavetable (hex string or [0..15] array) — wave channel only
  env         <initial>,<up|down|flat>[,<period>] — hardware volume envelope
  noise_mode  white | periodic — noise channel only
  noise_rate  0 | 1 | 2 — noise brightness (hat/snare/kick) — noise channel only

Style guide:
  - pulse is the classic lead voice; thin duties (12.5/25) sound nasal and
    cutting, 50/75 sound fuller.
  - triangle is the smooth sub-bass / flute; it has no duty and no harmonics.
  - wave plays any custom timbre — a saw table sounds brassy, a soft table
    makes an organ pad, a hollow table makes a square-ish lead.
  - noise is your drum kit: noise_rate 2 (dark) + a fast down-envelope is a
    kick, noise_rate 1 is a snare, noise_rate 0 (bright) is a hi-hat;
    "periodic" + a slow down-envelope is a buzzing tom.
  - keep the mix to 3–4 voices; this chip has no echo or sweep hardware.
`.trim(),

  hoverDocs: {
    inst: [
      '**Instrument definition** — declares a named instrument with channel type and parameters.',
      '```\ninst <name> type=<type> [field=value …]\n```',
      '**Common fields (all chips):**',
      '- `note` — default note when the instrument name is used as a hit token, e.g. `note=C2`',
      '- `gm` — General MIDI program number for MIDI export (0–127)',
      '',
      '**BLIP-01 instrument types:**',
      '- `type=pulse` — square wave, `duty` (12.5/25/50/75), `vol`, `env`',
      '- `type=triangle` — fixed triangle wave, `vol`, `env`',
      '- `type=wave` — wavetable, `wave` (16/32 samples), `vol`, `env`',
      '- `type=noise` — LFSR noise, `noise_mode` (white/periodic), `vol`, `env`',
      '',
      'Example: `inst lead type=pulse vol=13 duty=25 env=13,down,2`',
    ].join('\n\n'),

    pulse:
      '**Pulse** — square wave on channel 1. `duty` sets the pulse width (12.5/25/50/75); lower values are thinner and brighter. `env=13,down,2` gives a short pluck.',
    triangle:
      '**Triangle** — a pure triangle wave on channel 2. Smooth and hollow; great for sub-bass and flute-like leads. No `duty` field.',
    wave:
      '**Wave** — a user-defined wavetable on channel 3. `wave` is 16 or 32 four-bit samples (0–15) as a hex string (e.g. `0123456789abcdef…`) or a number array. Draw it in the Instrument Editor.',
    noise:
      '**Noise** — LFSR noise on channel 4. `noise_mode=white` is classic percussion hiss; `noise_mode=periodic` is a buzzing, pitched tone. `noise_rate` sets the brightness: `0` = hi-hat, `1` = snare, `2` = kick. `env=15,down,1` gives a punchy hit.',
  },

  helpSections: [
    {
      id: 'instruments', // replaces the built-in "Instruments" placeholder
      title: 'Instruments (BLIP-01)',
      content: [
        {
          kind: 'text',
          text:
            'Four voices: a square pulse (channel 1), a triangle (channel 2), a drawable wavetable (channel 3), and LFSR noise (channel 4). Every instrument needs a `type`; `vol`, `duty`, `wave`, `env`, `noise_mode`, and `noise_rate` tune the sound.',
        },
        { kind: 'snippet', label: 'Lead (pulse)', code: 'inst lead type=pulse vol=13 duty=25 env=13,down,2' },
        { kind: 'snippet', label: 'Bass (triangle)', code: 'inst bass type=triangle vol=15 env=15,flat' },
        { kind: 'snippet', label: 'Pad (wave, sawtooth)', code: 'inst pad type=wave vol=10 wave=0123456789abcdef0123456789abcdef' },
        { kind: 'snippet', label: 'Kick (noise, dark)', code: 'inst kick type=noise vol=15 noise_mode=white noise_rate=2 env=15,down,1' },
        { kind: 'snippet', label: 'Snare (noise, mid)', code: 'inst snare type=noise vol=12 noise_mode=white noise_rate=1 env=12,down,2' },
        { kind: 'snippet', label: 'Hi-hat (noise, bright)', code: 'inst hat type=noise vol=9 noise_mode=white noise_rate=0 env=9,down,1' },
        { kind: 'snippet', label: 'Buzz tom (periodic)', code: 'inst tom type=noise vol=12 noise_mode=periodic noise_rate=2 env=12,down,4' },
      ],
    },
    {
      id: 'examples', // replaces the built-in "Examples" placeholder
      title: 'Examples — Click to Insert (BLIP-01)',
      content: [
        {
          kind: 'song',
          label: 'Four-voice BLIP-01 demo',
          code:
            'chip blip\nbpm 120\n\ninst lead type=pulse vol=13 duty=25 env=13,down,2\ninst bass type=triangle vol=15 env=15,flat\ninst pad  type=wave vol=10 wave=0123456789abcdef0123456789abcdef\ninst kick type=noise vol=15 noise_mode=white env=15,down,1\n\npat melody = C4 E4 G4 E4\npat bassl  = C2 . G2 .\npat drums  = kick . kick .\nseq main   = melody melody\n\nchannel 1 => inst lead seq main\nchannel 2 => inst bass seq bassl\nchannel 3 => inst pad seq main:oct(-2)\nchannel 4 => inst kick seq drums\n\nplay',
        },
      ],
    },
  ],
};
