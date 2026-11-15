/**
 * Jest setup for the BLIP-01 chip plugin tests.
 *
 * Provides a minimal Web Audio mock so channel backends can be exercised
 * headlessly, and silences console noise during tests.
 */

// Mock AudioContext / BaseAudioContext for tests.
class MockAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  destination: any = {};

  createOscillator() {
    return {
      type: 'square',
      frequency: { value: 0, setValueAtTime: jest.fn() },
      setPeriodicWave: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      connect: jest.fn(),
    };
  }

  createGain() {
    return {
      gain: {
        value: 0,
        setValueAtTime: jest.fn(),
        setValueCurveAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
      },
      connect: jest.fn(),
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      playbackRate: { value: 0, setValueAtTime: jest.fn() },
      start: jest.fn(),
      stop: jest.fn(),
      connect: jest.fn(),
    };
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return {
      sampleRate: sampleRate ?? this.sampleRate,
      length,
      numberOfChannels: _channels,
      getChannelData: () => new Float32Array(length),
    };
  }

  createPeriodicWave(_real: Float32Array, _imag: Float32Array, _constraints: any) {
    return {};
  }
}

(global as any).AudioContext = MockAudioContext as any;
(global as any).BaseAudioContext = MockAudioContext as any;

// Suppress console warnings during tests.
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

beforeEach(() => {
  jest.clearAllMocks();
});
