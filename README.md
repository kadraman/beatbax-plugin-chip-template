# BeatBax Chip Plugin Starter Template

A complete, ready-to-clone starting point for building a **chip plugin** for
[BeatBax](https://github.com/kadraman/beatbax) — the live-coding language and
runtime for retro console chiptunes.

This repository is a **GitHub template**: click **"Use this template"** (the
green button on GitHub) to create your own plugin repository from it.

The template ships with a **working, buildable, testable example chip** called
`blip` — a fictional 4-voice PSG (`pulse`, `triangle`, `wave`, `noise`) — so you
can run `npm test` and see audio come out of a real plugin immediately, then
rename it to your own chip.

---

## Quickstart

```bash
# 1. Create your own repo from this template (GitHub: "Use this template"),
#    then clone it locally.
git clone https://github.com/<you>/<your-plugin-repo>.git
cd <your-plugin-repo>

# 2. Install dependencies (fetches @beatbax/engine as a peer/dev dependency).
npm install

# 3. Build the plugin.
npm run build

# 4. Run the tests — they should pass out of the box.
npm test
```

The example chip is fully functional. You can try it in a BeatBax script:

```bax
chip blip
bpm 120

inst lead type=pulse vol=13 duty=25 env=13,down,2
inst bass type=triangle vol=15 env=15,flat
inst pad  type=wave vol=10 wave=0123456789abcdef0123456789abcdef
inst kick type=noise vol=15 noise_mode=white noise_rate=2 env=15,down,1
inst snare type=noise vol=12 noise_mode=white noise_rate=1 env=12,down,2

pat melody = C4 E4 G4 E4
pat bassl  = C2 . G2 .
pat drums  = kick . snare .
seq main     = melody melody
seq bass_seq = bassl bassl
seq drum_seq = drums drums

channel 1 => inst lead seq main
channel 2 => inst bass seq bass_seq
channel 3 => inst pad seq main:oct(-2)
channel 4 => inst kick seq drum_seq

play
```

> **Try it in the BeatBax CLI** (after publishing, or while developing):
> `beatbax list-chips` should show `blip` with version `0.1.0` and `4` channels.
> The CLI auto-discovers any installed package named `beatbax-plugin-chip-*`.
> See [Installing into the BeatBax CLI](#installing-into-the-beatbax-cli) below.

---

## Testing

The test suite runs entirely in Node with a mocked Web Audio context — no audio
device or BeatBax app required. See [`tests/plugin.test.ts`](tests/plugin.test.ts)
and [`tests/setupTests.ts`](tests/setupTests.ts).

```bash
npm install     # install devDependencies (@beatbax/engine, TypeScript, Jest, ts-jest)
npm run build   # type-check + compile src/ → dist/
npm test        # runs the build (via pretest) then Jest
```

What the tests cover:

- **metadata** — name, version, channel count, instrument types, volume range
- **registration** — `ChipRegistry.register()`, retrieval, aliases, `listCanonical()`
- **channel creation** — a backend per channel index, out-of-range throws
- **validation** — valid/invalid instruments and per-type field rules (`duty`, `wave`, `noise_mode`)
- **PCM rendering** — each voice outputs non-zero samples; silence after `noteOff`
- **Web Audio** — `createPlaybackNodes()` returns `[source, gain]` for the melodic
  voices and `null` (PCM fallback) for a mock context

Tips:

- `npm test` type-checks first (`pretest`); to re-run just Jest, use
  `npx jest --config ./jest.config.cjs`.
- Keep the audio path deterministic so tests stay stable in CI — the noise voice
  uses a fixed-seed LFSR instead of `Math.random()` for this reason.
- If Jest cannot spawn worker processes in a restricted environment, run
  `npx jest --config ./jest.config.cjs --runInBand`.

---

## What a chip plugin is

A BeatBax chip plugin is a plain npm package that:

1. Exports a default object implementing the `ChipPlugin` interface.
2. Is named `@beatbax/plugin-chip-<name>` (official) or `beatbax-plugin-chip-<name>` (community).
3. Is registered with the engine via `engine.registerChipPlugin(plugin)` — or
   auto-discovered by the CLI.

Each plugin adds new audio backends (hardware voices) to the engine without
touching core. The full guide lives in the BeatBax repo:
[docs/contributing/creating-plugins.md](https://github.com/kadraman/beatbax/blob/main/docs/contributing/creating-plugins.md).

---

## Project structure

```
.
├── .github/workflows/ci.yml     # Build + test on push/PR
├── src/
│   ├── index.ts                 # ChipPlugin entry point (default export)
│   ├── channel.ts               # ChipChannelBackend implementations (PCM + Web Audio)
│   ├── mixer.ts                 # Per-voice output gains
│   ├── periodTables.ts          # Hardware constants + conversion helpers
│   ├── validate.ts              # Instrument validation
│   ├── version.ts               # Version constant (do NOT import package.json)
│   ├── ui-contributions.ts      # Web editor hover docs / help / Copilot prompt
│   ├── songWizard.ts            # New Song wizard metadata + templates
│   └── instrument-editor.ts     # Desktop Instrument Editor schema
├── tests/
│   ├── plugin.test.ts           # Registration, validation, rendering tests
│   └── setupTests.ts            # Web Audio mock for headless tests
├── package.json                 # beatbax-plugin-chip-blip, peerDep @beatbax/engine
├── tsconfig.json                # ESM, strict, ES2022
├── jest.config.cjs              # ts-jest config matching BeatBax conventions
├── jest-resolver.cjs            # Maps `.js` import specifiers to `.ts` sources
├── docs/DECISIONS.md            # Design decisions & rationale
├── CONTRIBUTING.md
└── LICENSE                      # MIT
```

---

## How it works (walkthrough)

Every non-obvious choice in this template is documented in
[docs/DECISIONS.md](docs/DECISIONS.md) — read it alongside the code for the full
rationale. Below is the quick tour.

### 1. `src/index.ts` — the plugin object

The default export is a single `ChipPlugin` object. The only **required** fields
are `name`, `version`, `channels`, `validateInstrument`, and `createChannel`;
everything else (`aliases`, `status`, `uiContributions`, `newSongWizard`,
`instrumentEditor`, …) is optional polish.

### 2. `src/channel.ts` — the audio backends

`createChannel(channelIndex)` returns a `ChipChannelBackend` per hardware voice.
The example implements four distinct voices to show different synthesis paths:

| Channel | Type | Technique |
|---------|------|-----------|
| 0 | `pulse` | square wave with 4 duty cycles |
| 1 | `triangle` | fixed triangle wave |
| 2 | `wave` | 16/32-sample wavetable (hex or array) |
| 3 | `noise` | LFSR noise (white 16-bit / periodic 5-bit) + `noise_rate` 0–2 |

Two rendering paths are implemented:

| Path | Method | Used by |
|------|--------|---------|
| **PCM** | `render(buffer, sampleRate)` | CLI / headless / Node.js |
| **Web Audio** | `createPlaybackNodes(ctx, …)` | Browser / Electron (full effects) |

Key rules, shown in the code:

- `render()` must **add** to the buffer (`buffer[i] += …`), never overwrite —
  channels are mixed by accumulation.
- `createPlaybackNodes()` must set `_baseFreq` before returning so the arp
  effect can read the base pitch, connect `source → gain → destination`, and
  return `[source, gain]`. Return `null` to fall back to PCM (e.g. a mock ctx).
- Melodic channels implement **both** paths. The wave voice shows the
  `AudioBufferSourceNode` + `playbackRate` approach (one buffer = one cycle);
  the pulse shows a duty-cycle `PeriodicWave`; the triangle uses the built-in
  `osc.type = 'triangle'`. Percussion (noise) only needs `render()`.
- Per-voice gains in `src/mixer.ts` (`BLIP_MIX_GAIN`) keep a triangle from
  sounding quieter than a pulse at the same `vol` — see the file's comments.

### 3. `src/validate.ts` — instrument validation

`validateInstrument(inst)` returns `[]` when valid or a list of
`{ field, message }` errors. This is what makes `inst lead type=pulse duty=33`
report a helpful editor error instead of silently misbehaving. It also enforces
per-type fields (e.g. `wave` only on the wave channel, `duty` only on pulse).

### 4. `src/version.ts` — the version constant

Never `import { version } from '../package.json'` — Node.js v22+ throws
`ERR_IMPORT_ATTRIBUTE_MISSING` for ESM JSON imports. Export a plain string and
keep it in sync with `package.json`.

### 5. The UI files (optional)

- `ui-contributions.ts` — chip-specific hover docs, help-panel sections, and the
  Copilot system prompt in the web editor.
- `songWizard.ts` — metadata and starter templates for the New Song modal.
- `instrument-editor.ts` — a schema the Desktop editor renders as generic
  widgets, including the **drawable/hex wavetable** editor for the wave channel
  (see the top-level `waveform` block). No React.

---

## Customization checklist

Rename the example chip `blip` to your own hardware. Search-and-replace these
values (and update the comments/docs to match):

| What | Current value | Replace with |
|------|---------------|--------------|
| `package.json` → `name` | `beatbax-plugin-chip-blip` | `beatbax-plugin-chip-<your-chip>` |
| `package.json` → `description` | `BLIP-01 — …` | your chip's description |
| `src/index.ts` → `name` | `blip` | your chip id (used in `chip <id>`) |
| `src/index.ts` → `aliases` | `['blip01']` | your aliases (or remove) |
| `src/index.ts` → `channels` | `4` | your channel count |
| `src/version.ts` → `version` | `0.1.0` | keep in sync with `package.json` |
| `src/periodTables.ts` → `BLIP_CLOCK` | `1_000_000` | your chip's master clock |
| `src/channel.ts` | pulse/triangle/wave/noise backends | your channel types & waveforms |
| `src/validate.ts` → `BLIP_TYPES` | `pulse/triangle/wave/noise` | your instrument types |
| `src/instrument-editor.ts` → `waveform` | 32-sample wave table | your wavetable (or remove) |
| `src/ui-contributions.ts` | `BLIP-01` text | your chip's docs |
| `src/songWizard.ts` | `BLIP-01` metadata | your chip's metadata |

Also update the `CHANGELOG.md`, this `README.md`, and the `repository` URL in
`package.json`.

---

## Publishing

```bash
npm run build
npm test
npm publish --access public
```

- **Community plugins** must be named `beatbax-plugin-chip-<name>` so the CLI
  auto-discovers them.
- **Official plugins** use `@beatbax/plugin-chip-<name>`.
- The `name` field in the plugin object must match the string used in the
  `chip <name>` directive.

---

## Installing into the BeatBax CLI

`npm install` *inside this repo* only installs the plugin's build/test
dependencies — it does **not** make `beatbax` load the plugin. The CLI
auto-discovers packages named `beatbax-plugin-chip-*` (or
`@beatbax/plugin-chip-*`) from `node_modules`, including the folder you run
`beatbax` in. To register your chip:

**A. `npm link` — local development, no publish:**

```bash
# here, in this plugin repo
npm install
npm run build
npm link

# in your song folder (where you run beatbax)
npm link beatbax-plugin-chip-blip
beatbax list-chips          # → "blip" (v0.1.0, 4 channels)
```

**B. Install by path:**

```bash
npm run build               # here
cd ../my-song
npm install ../beatbax-plugin-chip-template
beatbax list-chips
```

**C. Publish, then install:**

```bash
npm publish --access public # here (builds + tests first via prepublishOnly)
# in your song folder
npm install beatbax-plugin-chip-blip
beatbax list-chips
```

After any of these, write `chip blip` (or the alias `chip blip01`) in a `.bax`
file and run `beatbax verify`, `beatbax play`, or `beatbax export` as usual.
`beatbax list-chips --json` shows chips with versions and aliases.

> **Desktop** does not install plugins via npm — plugins are bundled at build
> time (see `packages/app-core/src/plugins/registry-config.ts` in the main repo).

---

## References

- Full plugin guide: [docs/contributing/creating-plugins.md](https://github.com/kadraman/beatbax/blob/main/docs/contributing/creating-plugins.md)
- Plugin system spec: [docs/features/complete/plugin-system.md](https://github.com/kadraman/beatbax/blob/main/docs/features/complete/plugin-system.md)
- This template's design decisions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Reference implementations in the main repo:
  - Built-in Game Boy: `packages/engine/src/chips/gameboy/plugin.ts`
  - Built-in NES: `packages/engine/src/chips/nes/`
  - External SMS plugin: `packages/plugins/chip-sms/`

## License

MIT — see [LICENSE](LICENSE). When you fork, **retain the existing copyright
notice** (required by the MIT license) and add your own notice for your
contributions, e.g. `Copyright (c) <year> <Your Name>`.
