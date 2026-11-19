# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Desktop live playback: wave `AudioBufferSourceNode` now sets `loop = true` and
  an immediate `playbackRate.value` (was a one-cycle click then silence).
- Desktop live playback: noise implements `createPlaybackNodes()` so drums are
  not left on ScriptProcessor PCM fallback while melodic voices use Web Audio.

### Changed

- Docs (README + `docs/DECISIONS.md`): dual-rendering guidance now requires
  Web Audio on **all** voices for Desktop, and calls out the wave-loop footgun.

### Added

- Initial template scaffold: a minimal 4-channel `blip` chip plugin example
  (pulse, triangle, wavetable, noise) with PCM + Web Audio rendering, instrument
  validation, a drawable wavetable editor, UI contributions, and a New Song
  wizard.
