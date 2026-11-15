# Design Decisions & Rationale

This document explains **why** the template is structured the way it is. It is
meant to be read alongside the source (start with
[`../src/index.ts`](../src/index.ts) and [`../src/channel.ts`](../src/channel.ts)).

Each entry states the decision, the reasoning, and (where useful) the
alternatives that were considered. When you fork this template for your own
chip, most of these decisions carry over; the ones you are expected to change
are called out.

---

## 1. Package identity & naming

**Decision:** the package is `beatbax-plugin-chip-blip`, and the plugin's
`name` field is `blip` with `aliases: ['blip01']`.

**Why:**

- The BeatBax CLI auto-discovers any package whose name starts with
  `beatbax-plugin-chip-` (community) or `@beatbax/plugin-chip-` (official).
  Using the community prefix makes the example installable/discoverable without
  reserving an official name.
- `name` is the string users write in the `chip blip` directive, so it must
  match the package's identity. The alias demonstrates `ChipRegistry` alias
  resolution (`chip blip01` works too) without being required.

---

## 2. ESM & module layout

**Decision:** `"type": "module"`, relative imports written with a `.js`
extension, and `main`/`types`/`exports` pointing at `dist/`.

**Why:**

- The engine ships as ESM. Node resolves a package via its `exports` map, which
  points at `dist/index.js`; the `.js` extension is **required** in Node ESM
  relative imports.
- TypeScript compiles `src/*.ts` → `dist/*.js`, and the emitted specifiers
  (`./channel.js`) already match Node's expectations — no bundler or rewrite
  step needed. (`jest-resolver.cjs` maps those `.js` specifiers back to `.ts`
  for Jest, since Jest resolves before compile — see §12.)

**Alternative considered:** `moduleResolution: "bundler"`/`"nodenext"`. These
add stricter mode friction with ts-jest; the engine itself uses
`module: ES2022` + `moduleResolution: node`, and matching it is the lowest-risk
choice for a plugin.

---

## 3. TypeScript configuration

**Decision:** `target`/`lib` `ES2022` + `DOM`, `strict`, `composite: true`,
`build: tsc -b`.

**Why:**

- `DOM` in `lib` supplies the Web Audio types (`BaseAudioContext`,
  `OscillatorNode`, `AudioParam`, …) used by `createPlaybackNodes()`.
- `composite: true` + `tsc -b` matches the BeatBax monorepo convention and emits
  `.tsbuildinfo` for incremental builds; it also forces `declaration: true` so
  the published package ships `.d.ts` files for consumers.
- `rootDir: "src"` / `outDir: "dist"` keeps emit contained; `tests/` is
  excluded from the build (Jest type-checks it separately).

---

## 4. `src/version.ts` (why not import package.json)

**Decision:** export a plain `version` constant; do **not**
`import { version } from '../package.json'`.

**Why:** Node v22+ throws `ERR_IMPORT_ATTRIBUTE_MISSING` for ESM JSON imports
(the `with { type: 'json' }` assertion isn't emitted by TypeScript). A
hand-maintained constant avoids this entirely; it is kept in sync with
`package.json` by the repo's `sync-versions` script when a plugin lives inside
the monorepo.

---

## 5. Dependencies

**Decision:** `@beatbax/engine` appears in **both** `peerDependencies` and
`devDependencies`.

**Why:**

- `peerDependencies` (`^0.27.0`) declares the runtime contract — the host
  (CLI/Desktop) provides one engine instance, so two copies are never loaded.
- `devDependencies` installs it locally so `tsc` can resolve the types and Jest
  can run against the engine's plugin-API entry during development.

**Also:** `files: ["dist", "README.md"]` publishes a slim package (no `src`,
tests, or config). `prepublishOnly` runs `build` + `test` so a broken build
cannot be published, and `pretest` builds first so `npm test` alone validates
types as well as behavior.

---

## 6. The example chip: four voices

**Decision:** `blip` has four channels — `pulse`, `triangle`, `wave`, `noise` —
rather than the Game Boy-like pulse/pulse/noise.

**Why:** the template's job is to *teach*. Four voices demonstrate four distinct
synthesis paths that map to four different `ChipChannelBackend` implementations:

| Voice | Technique shown |
|-------|-----------------|
| `pulse` | square + duty (PCM phase compare; Web Audio `PeriodicWave`) |
| `triangle` | a second waveform (PCM piecewise; Web Audio `osc.type='triangle'`) |
| `wave` | user wavetable (`parseWaveTable`, `AudioBufferSourceNode` + `playbackRate`) |
| `noise` | LFSR percussion (PCM-only, `noise_rate` brightness) |

A single flat gain would make these wildly different in loudness (§11), which
is why there is a mixer.

---

## 7. Dual rendering (PCM + Web Audio)

**Decision:** melodic channels implement **both** `render()` (PCM) and
`createPlaybackNodes()` (Web Audio); the noise channel implements only
`render()`.

**Why:**

- The CLI/headless path uses `render(buffer, sampleRate)`; the browser/Electron
  path uses `createPlaybackNodes()` to get the full effects system.
- `render()` must **accumulate** (`buffer[i] += …`) because the engine mixes
  channels by summation.
- `createPlaybackNodes()` returns `[source, gain]` and stores `_baseFreq` on
  the source so the arp effect can read the base pitch; it returns `null` for a
  context without real Web Audio factories (e.g. a mock) to fall back to PCM.
- Percussion (noise) has no pitch effects, so it is PCM-only — matching the
  guidance in the plugin guide.

---

## 8. Instrument fields & validation

**Decision:** `validateInstrument` is strict about a small, per-type field set.

- `type` is **required** and must be one of `pulse|triangle|wave|noise`.
- `vol` is an integer 0–15; `duty` is pulse-only; `wave` is wave-only (16 or 32
  samples); `noise_mode`/`noise_rate` are noise-only.

**Why:** catching a typo like `duty=33` or a `wave` on a pulse channel at
parse/validation time beats silently rendering the wrong thing. The
`instrumentVolumeRange: { min: 0, max: 15 }` (non-attenuation) matches
Game Boy/NES semantics — `max` is loudest, `0` is silent.

---

## 9. Envelope handling

**Decision:** `parseEnvelope` accepts **both** a CSV string
(`"13,down,2"`, optionally `"gb:"`-prefixed) **and** a normalized object
(`{ level, direction, period }`), and the envelope is stepped per *frame*.

**Why:**

- The engine keeps `env=13,down,2` as a string by default, but JSON
  `env={…}` — or the parser with `BEATBAX_PEGGY_NORMALIZE_INST_PROPS` enabled —
  produces an object. A plugin that only handles one shape breaks under the
  other, so both are supported.
- The PCM envelope is frame-driven (`applyEnvelope(frame)` + `envelopeLevel()`);
  the Web Audio path schedules an equivalent `setValueCurveAtTime` curve at
  `ENVELOPE_FRAME_HZ` (60 Hz) so the two paths sound alike. `flat` = constant
  volume, `up`/`down` = stepped toward the rail, period 0 = no stepping.

---

## 10. Noise voice

**Decision:** a deterministic 16-bit Galois LFSR, `noise_mode`
(`white`|`periodic`), and `noise_rate` (0|1|2).

**Why:**

- An LFSR is how real retro chips make noise, and a **fixed seed** makes PCM
  export and tests deterministic (no `Math.random()` in the audio path).
- `noise_rate` selects the LFSR clock from `NOISE_RATE_HZ = [32k, 12k, 5k]`,
  giving the classic hat/snare/kick brightness progression — the same idea as
  the SMS/SN76489 `noise_rate` register. Lower clock = darker noise.
- `periodic` switches to a short 5-bit LFSR (a repeating 31-step buzz) and
  halves the clock again, rather than just slowing the white-noise sequence.

---

## 11. Mixer & perceived loudness

**Decision:** per-voice gains in [`src/mixer.ts`](../src/mixer.ts) instead of
one flat gain.

**Why:** at the same peak, a square carries full power (RMS ≈ peak) while a
triangle carries only `1/√3` (≈ −4.8 dB) and has no harmonics; the mean-centred
wavetable peaks at ~half the raw range. `BLIP_MIX_GAIN` compensates
(`triangle = pulse × √3`, `wave = pulse × 2`), and `getMeterDisplayGain()`
returns `1 / gain` so the Channel Mixer meter is display-normalized too
(display-only — it never changes audio output).

---

## 12. Testing strategy

**Decision:** Jest (ts-jest) with three pieces of configuration, plus a mocked
Web Audio context.

- `moduleNameMapper` maps `@beatbax/engine` → `dist/plugin-api.js`.
- `transformIgnorePatterns` un-ignores `@beatbax/engine` and ts-jest also
  transpiles `.js` files (with `allowJs`, `checkJs: false`).
- `jest-resolver.cjs` rewrites relative `.js` specifiers to `.ts`.

**Why:** the engine ships as ESM but Jest runs CommonJS. `plugin-api.js` is the
engine's plugin entry and is free of `import.meta` (unlike the root entry), so
it can be transpiled to CommonJS; the resolver makes the plugin's own `.js`
imports resolve to the `.ts` sources. `setupTests.ts` provides a fake
`AudioContext` so `createPlaybackNodes()` can be exercised headlessly.

> If Jest cannot spawn worker processes in a restricted sandbox, run
> `npx jest --config ./jest.config.cjs --runInBand`.

---

## 13. CI

**Decision:** GitHub Actions on Node 20 with `npm ci`, `npm run build`, and
`npm test`.

**Why:** `npm ci` gives reproducible installs from the committed
`package-lock.json`; building and testing in CI guarantees the template stays
green for anyone who clones it.

---

## 14. UI surfaces (optional)

**Decision:** ship `ui-contributions`, `songWizard`, and `instrument-editor` as
separate modules, all optional.

**Why:**

- `ui-contributions` gives chip-specific hover docs, help-panel sections, and
  the Copilot prompt — the web editor swaps these in automatically on
  `chip blip`.
- `songWizard` supplies New Song metadata + templates; its `defaults` entries
  double as the Preview button audio, so they are kept short and pleasant.
- `instrument-editor` is a declarative schema (no React) that the Desktop host
  renders; its top-level `waveform` block exposes the drawable/hex wavetable
  editor for the wave channel.

---

## 15. Intentionally omitted (and where to find them)

To keep the example approachable, these engine capabilities are **not**
demonstrated, but they are documented in the plugin guide and reference chips:

| Capability | Why omitted | Where to see it |
|------------|-------------|-----------------|
| Sample playback (`bundledSamples`, `resolveSampleAsset`, `preloadForPCM`) | Most code; only needed for sampled chips | NES DMC (`packages/engine/src/chips/nes/dmc.ts`) |
| `configureForSong` + region/console variants | Plumbing, not audio | SMS (`configureForSong`), Spectrum (`consoleVariants`) |
| Chip-specific `effects` handlers | Only needed to override a default effect | SMS `volSlide` (`packages/plugins/chip-sms/src/volSlide.ts`) |
| `validateSong` (shared-resource conflicts) | Only for chips with shared registers | Spectrum AY noise/envelope |
| `exporterPlugins` | Separate concern | `packages/plugins/export-*` |
| Attenuation volume (`isAttenuation: true`) | Would invert all the level math; the example stays linear for clarity | SMS / Genesis |
| Pitch sweep / duty macros | Advanced | NES pulse sweep; Game Boy `pitch_env` |

If your chip needs any of these, add them following the reference
implementations — the plugin object and backends here are structured so each is
a drop-in addition.
