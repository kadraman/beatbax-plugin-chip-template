/**
 * Unit tests for the BLIP-01 chip plugin.
 *
 * Covers plugin metadata, registration, channel creation, instrument
 * validation, PCM rendering, and the Web Audio playback-node path for the
 * pulse, triangle, wave, and noise voices.
 */
import { ChipRegistry } from '@beatbax/engine';
import blipPlugin, { BLIP_TYPES, BLIP_MIX_GAIN } from '../src/index.js';

const SAW_WAVE = '0123456789abcdef0123456789abcdef'; // 32-nibble sawtooth

describe('plugin metadata', () => {
  it('has a valid name', () => {
    expect(blipPlugin.name).toBe('blip');
  });

  it('has a valid version string', () => {
    expect(typeof blipPlugin.version).toBe('string');
    expect(blipPlugin.version.length).toBeGreaterThan(0);
  });

  it('exposes four channels', () => {
    expect(blipPlugin.channels).toBe(4);
  });

  it('declares the four instrument types', () => {
    expect(BLIP_TYPES).toEqual(['pulse', 'triangle', 'wave', 'noise']);
  });

  it('declares a non-attenuation 0–15 volume range', () => {
    expect(blipPlugin.instrumentVolumeRange).toEqual({ min: 0, max: 15 });
  });

  it('normalizes the per-voice meter display gain', () => {
    expect(blipPlugin.getMeterDisplayGain?.(0)).toBeCloseTo(1 / BLIP_MIX_GAIN.pulse, 6);
    expect(blipPlugin.getMeterDisplayGain?.(1)).toBeCloseTo(1 / BLIP_MIX_GAIN.triangle, 6);
    expect(blipPlugin.getMeterDisplayGain?.(2)).toBeCloseTo(1 / BLIP_MIX_GAIN.wave, 6);
    expect(blipPlugin.getMeterDisplayGain?.(3)).toBeCloseTo(1 / BLIP_MIX_GAIN.noise, 6);
    expect(blipPlugin.getMeterDisplayGain?.(4)).toBe(1);
  });
});

describe('plugin registration', () => {
  it('registers without error', () => {
    const registry = new ChipRegistry();
    expect(() => registry.register(blipPlugin)).not.toThrow();
  });

  it('is retrievable after registration', () => {
    const registry = new ChipRegistry();
    registry.register(blipPlugin);
    expect(registry.has('blip')).toBe(true);
    expect(registry.get('blip')).toBe(blipPlugin);
  });

  it('registers aliases', () => {
    const registry = new ChipRegistry();
    registry.register(blipPlugin);
    expect(registry.aliasesFor('blip')).toEqual(['blip01']);
    expect(registry.has('blip01')).toBe(true);
  });

  it('keeps canonical names separate from aliases in listCanonical()', () => {
    const registry = new ChipRegistry();
    registry.register(blipPlugin);
    expect(registry.listCanonical()).toContain('blip');
    expect(registry.listCanonical()).not.toContain('blip01');
  });
});

describe('channel creation', () => {
  it('creates a channel for every valid index', () => {
    const mockCtx = {} as BaseAudioContext;
    for (let i = 0; i < blipPlugin.channels; i++) {
      expect(() => blipPlugin.createChannel(i, mockCtx)).not.toThrow();
    }
  });

  it('throws for an out-of-range channel index', () => {
    const mockCtx = {} as BaseAudioContext;
    expect(() => blipPlugin.createChannel(4, mockCtx)).toThrow();
    expect(() => blipPlugin.createChannel(-1, mockCtx)).toThrow();
  });
});

describe('instrument validation', () => {
  it('accepts valid instruments', () => {
    expect(blipPlugin.validateInstrument({ type: 'pulse', vol: 10, duty: '50' })).toEqual([]);
    expect(blipPlugin.validateInstrument({ type: 'triangle', vol: 15, env: '15,flat' })).toEqual([]);
    expect(blipPlugin.validateInstrument({ type: 'wave', vol: 10, wave: SAW_WAVE })).toEqual([]);
    expect(blipPlugin.validateInstrument({ type: 'noise', vol: 12, noise_mode: 'white' })).toEqual([]);
  });

  it('accepts a JSON/normalized env object', () => {
    expect(
      blipPlugin.validateInstrument({ type: 'pulse', env: { level: 12, direction: 'down', period: 2 } }),
    ).toEqual([]);
  });

  it('rejects an env object with a bad direction', () => {
    const errors = blipPlugin.validateInstrument({ type: 'pulse', env: { level: 12, direction: 'sideways', period: 2 } });
    expect(errors.some((e) => e.field === 'env')).toBe(true);
  });

  it('rejects an unknown type', () => {
    const errors = blipPlugin.validateInstrument({ type: 'sine' });
    expect(errors.some((e) => e.field === 'type')).toBe(true);
  });

  it('rejects an out-of-range volume', () => {
    const errors = blipPlugin.validateInstrument({ type: 'pulse', vol: 99 });
    expect(errors.some((e) => e.field === 'vol')).toBe(true);
  });

  it('rejects an invalid duty value', () => {
    const errors = blipPlugin.validateInstrument({ type: 'pulse', duty: '33' });
    expect(errors.some((e) => e.field === 'duty')).toBe(true);
  });

  it('rejects duty on a non-pulse channel', () => {
    const errors = blipPlugin.validateInstrument({ type: 'triangle', duty: '50' });
    expect(errors.some((e) => e.field === 'duty')).toBe(true);
  });

  it('rejects a wave instrument without a table', () => {
    const errors = blipPlugin.validateInstrument({ type: 'wave' });
    expect(errors.some((e) => e.field === 'wave')).toBe(true);
  });

  it('rejects a wave table of the wrong length', () => {
    const errors = blipPlugin.validateInstrument({ type: 'wave', wave: '0123' });
    expect(errors.some((e) => e.field === 'wave')).toBe(true);
  });

  it('rejects a wave field on a non-wave channel', () => {
    const errors = blipPlugin.validateInstrument({ type: 'pulse', wave: SAW_WAVE });
    expect(errors.some((e) => e.field === 'wave')).toBe(true);
  });

  it('rejects an invalid noise_mode', () => {
    const errors = blipPlugin.validateInstrument({ type: 'noise', noise_mode: 'loud' });
    expect(errors.some((e) => e.field === 'noise_mode')).toBe(true);
  });

  it('accepts a valid noise_rate', () => {
    expect(blipPlugin.validateInstrument({ type: 'noise', noise_rate: 0 })).toEqual([]);
    expect(blipPlugin.validateInstrument({ type: 'noise', noise_rate: 1 })).toEqual([]);
    expect(blipPlugin.validateInstrument({ type: 'noise', noise_rate: 2 })).toEqual([]);
  });

  it('rejects an out-of-range noise_rate', () => {
    const errors = blipPlugin.validateInstrument({ type: 'noise', noise_rate: 3 });
    expect(errors.some((e) => e.field === 'noise_rate')).toBe(true);
  });

  it('rejects noise_rate on a non-noise channel', () => {
    const errors = blipPlugin.validateInstrument({ type: 'pulse', noise_rate: 1 });
    expect(errors.some((e) => e.field === 'noise_rate')).toBe(true);
  });
});

describe('PCM rendering', () => {
  it('pulse channel renders non-zero audio', () => {
    const channel = blipPlugin.createChannel(0, {} as BaseAudioContext);
    channel.noteOn(440, { type: 'pulse', vol: 12, duty: '50' });
    const buffer = new Float32Array(256);
    channel.render(buffer, 44100);
    expect(buffer.some((s) => s !== 0)).toBe(true);
  });

  it('pulse renders with a JSON envelope object', () => {
    const channel = blipPlugin.createChannel(0, {} as BaseAudioContext);
    channel.noteOn(440, { type: 'pulse', vol: 12, env: { level: 12, direction: 'down', period: 2 } });
    const buffer = new Float32Array(256);
    channel.render(buffer, 44100);
    expect(buffer.some((s) => s !== 0)).toBe(true);
  });

  it('triangle channel renders non-zero audio', () => {
    const channel = blipPlugin.createChannel(1, {} as BaseAudioContext);
    channel.noteOn(440, { type: 'triangle', vol: 12 });
    const buffer = new Float32Array(256);
    channel.render(buffer, 44100);
    expect(buffer.some((s) => s !== 0)).toBe(true);
  });

  it('wave channel renders non-zero audio', () => {
    const channel = blipPlugin.createChannel(2, {} as BaseAudioContext);
    channel.noteOn(440, { type: 'wave', vol: 12, wave: SAW_WAVE });
    const buffer = new Float32Array(256);
    channel.render(buffer, 44100);
    expect(buffer.some((s) => s !== 0)).toBe(true);
  });

  it('noise channel renders non-zero audio', () => {
    const channel = blipPlugin.createChannel(3, {} as BaseAudioContext);
    channel.noteOn(0, { type: 'noise', vol: 12 });
    const buffer = new Float32Array(256);
    channel.render(buffer, 44100);
    expect(buffer.some((s) => s !== 0)).toBe(true);
  });

  it('is silent after noteOff', () => {
    const channel = blipPlugin.createChannel(0, {} as BaseAudioContext);
    channel.noteOn(440, { type: 'pulse', vol: 12 });
    channel.noteOff();
    const buffer = new Float32Array(256);
    channel.render(buffer, 44100);
    expect(buffer.every((s) => s === 0)).toBe(true);
  });
});

describe('Web Audio playback nodes', () => {
  it('falls back to null for a context without createOscillator', () => {
    const channel = blipPlugin.createChannel(0, {} as BaseAudioContext);
    const nodes = channel.createPlaybackNodes?.(
      {} as any,
      440,
      0,
      0.1,
      { type: 'pulse' },
      null,
      {} as any,
    );
    expect(nodes).toBeNull();
  });

  it('pulse returns [oscillator, gain]', () => {
    const ctx = new (global as any).AudioContext();
    const channel = blipPlugin.createChannel(0, ctx);
    const nodes = channel.createPlaybackNodes?.(ctx, 440, 0, 0.1, { type: 'pulse', vol: 12, duty: '50' }, null, ctx.destination);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes).toHaveLength(2);
  });

  it('triangle returns [oscillator, gain]', () => {
    const ctx = new (global as any).AudioContext();
    const channel = blipPlugin.createChannel(1, ctx);
    const nodes = channel.createPlaybackNodes?.(ctx, 220, 0, 0.1, { type: 'triangle', vol: 15 }, null, ctx.destination);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes).toHaveLength(2);
  });

  it('wave returns [bufferSource, gain]', () => {
    const ctx = new (global as any).AudioContext();
    const channel = blipPlugin.createChannel(2, ctx);
    const nodes = channel.createPlaybackNodes?.(ctx, 440, 0, 0.1, { type: 'wave', vol: 10, wave: SAW_WAVE }, null, ctx.destination);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes).toHaveLength(2);
  });
});
