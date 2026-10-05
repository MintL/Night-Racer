import { afterEach, describe, expect, it, vi } from 'vitest';
import { RaceAudioController } from '../src/game/audio/raceAudio';

class MockAudioParam {
  value = 0;

  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class MockGain {
  gain = new MockAudioParam();
  connected = false;

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }
}

class MockBufferSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  playbackRate = new MockAudioParam();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;

  connect(): void {}
  disconnect(): void {}

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 10;
  destination = {};
  gains: MockGain[] = [];
  sources: MockBufferSource[] = [];

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createGain(): MockGain {
    const gain = new MockGain();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): MockBufferSource {
    const source = new MockBufferSource();
    this.sources.push(source);
    return source;
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    return {} as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockAudioContext.instances.length = 0;
});

describe('race audio lifecycle', () => {
  it('stays silent until start, mixes driving audio, and releases sources on dispose', async () => {
    const fetchAudio = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    }));
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('fetch', fetchAudio);

    const audio = new RaceAudioController({ assetBaseUrl: '/', masterVolume: 0.5 });
    audio.update({ speed: 40, steeringAngle: 0.05 }, 0.7);
    audio.setRainEnabled(true);
    expect(MockAudioContext.instances).toHaveLength(0);
    expect(audio.isRunning).toBe(false);

    await audio.start();
    const context = MockAudioContext.instances[0];
    expect(fetchAudio).toHaveBeenCalledTimes(5);
    expect(context.sources).toHaveLength(4);
    expect(context.sources.every((source) => source.loop && source.started)).toBe(true);
    expect(context.sources[0].playbackRate.value).toBeGreaterThan(1);
    expect(context.gains[2].gain.value).toBeGreaterThan(0);
    expect(context.gains[3].gain.value).toBeGreaterThan(0);
    expect(context.gains[4].gain.value).toBeGreaterThan(0);
    expect(audio.isRunning).toBe(true);

    audio.setRainEnabled(false);
    expect(context.gains[4].gain.value).toBe(0);
    audio.setRainEnabled(true);
    expect(context.gains[4].gain.value).toBeGreaterThan(0);

    audio.playCheckpoint();
    expect(context.sources).toHaveLength(5);
    expect(context.sources[4].started).toBe(true);
    await audio.pause();
    expect(audio.isRunning).toBe(false);
    await audio.resume();
    expect(audio.isRunning).toBe(true);
    expect(context.sources).toHaveLength(5);

    audio.setMasterVolume(0.2);
    expect(context.gains[0].gain.value).toBe(0.2);
    audio.dispose();
    expect(context.sources.every((source) => source.stopped)).toBe(true);
    expect(audio.isRunning).toBe(false);
    expect(context.state).toBe('closed');
  });
});
