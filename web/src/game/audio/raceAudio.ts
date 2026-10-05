import type { VehicleState } from '../vehicle/vehicleState';
import { ORIGINAL_HANDLING } from '../vehicle/vehicleController';

export interface RaceAudioOptions {
  /** Vite's public base path by default. Must end in a slash if overridden. */
  readonly assetBaseUrl?: string;
  readonly masterVolume?: number;
}

interface AudioBuffers {
  readonly engine: AudioBuffer;
  readonly skid: AudioBuffer;
  readonly checkpoint: AudioBuffer;
}

interface LoopPlayback {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

const AUDIO_MIX = {
  idleEngineVolume: 0.08,
  drivingEngineVolume: 0.23,
  maximumSkidVolume: 0.11,
  checkpointVolume: 0.24,
  idleEngineRate: 0.72,
  engineRateRange: 0.95,
  skidSteeringReference: 0.07,
  gainResponseSeconds: 0.08,
  pitchResponseSeconds: 0.12,
} as const;

/** Browser audio for one local race. Call start or resume from a user gesture. */
export class RaceAudioController {
  private readonly assetBaseUrl: string;
  private masterVolume: number;
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers: AudioBuffers | null = null;
  private engine: LoopPlayback | null = null;
  private skid: LoopPlayback | null = null;
  private checkpointSources = new Set<AudioBufferSourceNode>();
  private loadingAbort: AbortController | null = null;
  private startPromise: Promise<void> | null = null;
  private disposed = false;
  private speed = 0;
  private steeringAngle = 0;
  private roadWeight = 1;

  constructor(options: RaceAudioOptions = {}) {
    this.assetBaseUrl = options.assetBaseUrl ?? import.meta.env.BASE_URL;
    this.masterVolume = clamp(options.masterVolume ?? 0.7, 0, 1);
  }

  get isRunning(): boolean {
    return this.context?.state === 'running' && this.engine !== null;
  }

  start(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.startPromise) return this.startPromise;

    const context = this.context ?? new AudioContext();
    this.context = context;
    if (!this.masterGain) {
      this.masterGain = context.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(context.destination);
    }

    // resume() must be invoked synchronously inside the click/key handler.
    const resumePromise = context.resume();
    this.startPromise = (async () => {
      try {
        await resumePromise;
        if (!this.buffers) this.buffers = await this.loadBuffers(context);
        if (this.disposed || !this.buffers || !this.masterGain) return;
        if (!this.engine) this.engine = this.createLoop(context, this.buffers.engine, this.masterGain);
        if (!this.skid) this.skid = this.createLoop(context, this.buffers.skid, this.masterGain);
        this.applyMix();
      } catch (error) {
        if (!this.disposed) throw error;
      } finally {
        this.startPromise = null;
      }
    })();
    return this.startPromise;
  }

  resume(): Promise<void> {
    return this.start();
  }

  async pause(): Promise<void> {
    if (this.disposed || !this.context) return;
    await this.context.suspend();
  }

  /** Update the continuous mix once per simulation step or animation frame. */
  update(vehicle: Pick<VehicleState, 'speed' | 'steeringAngle'>, roadWeight: number): void {
    this.speed = vehicle.speed;
    this.steeringAngle = vehicle.steeringAngle;
    this.roadWeight = clamp(roadWeight, 0, 1);
    this.applyMix();
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1);
    if (!this.context || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(
      this.masterVolume,
      this.context.currentTime,
      AUDIO_MIX.gainResponseSeconds,
    );
  }

  playCheckpoint(): void {
    if (this.disposed || !this.context || !this.masterGain || !this.buffers) return;
    if (this.context.state !== 'running') return;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffers.checkpoint;
    gain.gain.value = AUDIO_MIX.checkpointVolume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.onended = () => {
      this.checkpointSources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.checkpointSources.add(source);
    source.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadingAbort?.abort();
    this.stopLoop(this.engine);
    this.stopLoop(this.skid);
    for (const source of this.checkpointSources) {
      source.stop();
      source.disconnect();
    }
    this.checkpointSources.clear();
    this.masterGain?.disconnect();
    if (this.context) void this.context.close().catch(() => undefined);
    this.engine = null;
    this.skid = null;
    this.masterGain = null;
    this.context = null;
  }

  private async loadBuffers(context: AudioContext): Promise<AudioBuffers> {
    this.loadingAbort = new AbortController();
    const signal = this.loadingAbort.signal;
    const load = async (filename: string): Promise<AudioBuffer> => {
      const response = await fetch(`${this.assetBaseUrl}assets/audio/${filename}`, { signal });
      if (!response.ok) throw new Error(`Could not load race audio: ${filename}`);
      return context.decodeAudioData(await response.arrayBuffer());
    };

    try {
      const [engine, skid, checkpoint] = await Promise.all([
        load('engine-loop.wav'),
        load('tire-skid-loop.wav'),
        load('checkpoint.wav'),
      ]);
      return { engine, skid, checkpoint };
    } finally {
      this.loadingAbort = null;
    }
  }

  private createLoop(context: AudioContext, buffer: AudioBuffer, output: GainNode): LoopPlayback {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(output);
    source.start();
    return { source, gain };
  }

  private applyMix(): void {
    if (!this.context || !this.engine || !this.skid) return;
    const now = this.context.currentTime;
    const speedRatio = clamp(Math.abs(this.speed) / ORIGINAL_HANDLING.maxSpeed, 0, 1);
    const scrub = clamp(
      speedRatio * Math.abs(this.steeringAngle) / AUDIO_MIX.skidSteeringReference,
      0,
      1,
    );
    const skidVolume = scrub * AUDIO_MIX.maximumSkidVolume * (0.5 + 0.5 * this.roadWeight);

    this.engine.gain.gain.setTargetAtTime(
      AUDIO_MIX.idleEngineVolume + speedRatio * AUDIO_MIX.drivingEngineVolume,
      now,
      AUDIO_MIX.gainResponseSeconds,
    );
    this.engine.source.playbackRate.setTargetAtTime(
      AUDIO_MIX.idleEngineRate + speedRatio * AUDIO_MIX.engineRateRange,
      now,
      AUDIO_MIX.pitchResponseSeconds,
    );
    this.skid.gain.gain.setTargetAtTime(
      skidVolume,
      now,
      AUDIO_MIX.gainResponseSeconds,
    );
  }

  private stopLoop(loop: LoopPlayback | null): void {
    if (!loop) return;
    loop.source.stop();
    loop.source.disconnect();
    loop.gain.disconnect();
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
