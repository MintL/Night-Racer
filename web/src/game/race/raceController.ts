import { crossesCheckpointGate, type TrackPoint2D } from './checkpointGates';
import { RACE_STEP_SECONDS, type RaceState } from './raceState';

/** Advance race timing and gate progress by one fixed 60 Hz simulation step. */
export function stepRace(state: RaceState, from: TrackPoint2D, to: TrackPoint2D): RaceState {
  if (state.phase === 'finished') {
    return state;
  }
  if (state.phase === 'countdown') {
    const countdownTicks = state.countdownTicks - 1;
    return {
      ...state,
      phase: countdownTicks === 0 ? 'racing' : 'countdown',
      countdownTicks,
    };
  }

  const elapsedTicks = state.elapsedTicks + 1;
  const checkpointIndex = state.nextCheckpointIndex;
  if (!crossesCheckpointGate(from, to, state.checkpoints[checkpointIndex])) {
    return { ...state, elapsedTicks };
  }

  // SimpleRaceMode starts at t=.99 and uses checkpoint zero as the start/finish
  // line. Its first lap begins at "Go", not at the first line crossing. The
  // original accepted the other five gates in any order within a lap; the GDD
  // calls for ordered gates, so this remake requires them in track order.
  if (checkpointIndex === 0 && !state.crossedStartLine) {
    return {
      ...state,
      elapsedTicks,
      crossedStartLine: true,
      nextCheckpointIndex: 1,
    };
  }
  if (checkpointIndex !== 0) {
    return {
      ...state,
      elapsedTicks,
      nextCheckpointIndex: (checkpointIndex + 1) % state.checkpoints.length,
    };
  }

  const completedLaps = state.completedLaps + 1;
  const lapTimesSeconds = [
    ...state.lapTimesSeconds,
    (elapsedTicks - state.lastLapStartTick) * RACE_STEP_SECONDS,
  ];
  const finished = completedLaps === state.totalLaps;
  return {
    ...state,
    phase: finished ? 'finished' : 'racing',
    elapsedTicks,
    currentLap: Math.min(completedLaps + 1, state.totalLaps),
    completedLaps,
    nextCheckpointIndex: finished ? 0 : 1,
    lastLapStartTick: elapsedTicks,
    lapTimesSeconds,
  };
}
