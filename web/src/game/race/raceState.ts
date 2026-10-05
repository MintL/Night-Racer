import type { CheckpointGate } from './checkpointGates';

export const RACE_STEP_SECONDS = 1 / 60;
export const RACE_LAPS = 3;
export const RACE_COUNTDOWN_SECONDS = 3;

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RaceState {
  readonly phase: RacePhase;
  readonly checkpoints: readonly CheckpointGate[];
  readonly totalLaps: number;
  readonly countdownTicks: number;
  readonly elapsedTicks: number;
  readonly currentLap: number;
  readonly completedLaps: number;
  readonly nextCheckpointIndex: number;
  readonly crossedStartLine: boolean;
  readonly lastLapStartTick: number;
  readonly lapTimesSeconds: readonly number[];
}

export function createRaceState(
  checkpoints: readonly CheckpointGate[],
  totalLaps = RACE_LAPS,
  countdownSeconds = RACE_COUNTDOWN_SECONDS,
): RaceState {
  if (checkpoints.length < 2) {
    throw new RangeError('A race needs at least two checkpoints');
  }
  if (!Number.isInteger(totalLaps) || totalLaps < 1) {
    throw new RangeError('A race needs at least one lap');
  }
  if (!Number.isFinite(countdownSeconds) || countdownSeconds < 0) {
    throw new RangeError('Countdown duration cannot be negative');
  }

  const normalizedCheckpoints = checkpoints.map((checkpoint, index) => {
    const length = Math.hypot(checkpoint.heading.x, checkpoint.heading.z);
    if (length === 0 || !(checkpoint.halfWidth > 0)) {
      throw new RangeError(`Invalid checkpoint gate ${index}`);
    }
    return {
      position: { ...checkpoint.position },
      heading: {
        x: checkpoint.heading.x / length,
        z: checkpoint.heading.z / length,
      },
      halfWidth: checkpoint.halfWidth,
    };
  });
  const countdownTicks = Math.round(countdownSeconds / RACE_STEP_SECONDS);

  return {
    phase: countdownTicks === 0 ? 'racing' : 'countdown',
    checkpoints: normalizedCheckpoints,
    totalLaps,
    countdownTicks,
    elapsedTicks: 0,
    currentLap: 1,
    completedLaps: 0,
    nextCheckpointIndex: 0,
    crossedStartLine: false,
    lastLapStartTick: 0,
    lapTimesSeconds: [],
  };
}

export function raceElapsedSeconds(state: RaceState): number {
  return state.elapsedTicks * RACE_STEP_SECONDS;
}

export function currentLapElapsedSeconds(state: RaceState): number {
  return (state.elapsedTicks - state.lastLapStartTick) * RACE_STEP_SECONDS;
}
