import { describe, expect, it } from 'vitest';
import {
  createCheckpointGates,
  crossesCheckpointGate,
  type CheckpointGate,
} from '../src/game/race/checkpointGates';
import { stepRace } from '../src/game/race/raceController';
import { createRaceState, raceElapsedSeconds } from '../src/game/race/raceState';

const gates: CheckpointGate[] = [0, -10, -20].map((z) => ({
  position: { x: 0, z },
  heading: { x: 0, z: -1 },
  halfWidth: 1,
}));

function driveThroughGate(state: ReturnType<typeof createRaceState>, index: number) {
  const z = gates[index].position.z;
  return stepRace(state, { x: 0, z: z + 1 }, { x: 0, z: z - 1 });
}

describe('race progression', () => {
  it('places six ordered gates around a closed track by default', () => {
    const generated = createCheckpointGates(
      (parameter) => ({
        x: 10 * Math.cos(parameter * 2 * Math.PI),
        z: 10 * Math.sin(parameter * 2 * Math.PI),
      }),
    );

    expect(generated).toHaveLength(6);
    expect(generated[0].position.x).toBeCloseTo(10);
    expect(generated[0].heading.z).toBeCloseTo(1);
  });

  it('waits for the countdown and ignores reverse or off-width crossings', () => {
    let state = createRaceState(gates);
    state = driveThroughGate(state, 0);
    expect(state.phase).toBe('countdown');
    expect(state.nextCheckpointIndex).toBe(0);

    for (let i = 1; i < 180; i++) {
      state = stepRace(state, { x: 0, z: 1 }, { x: 0, z: 1 });
    }
    expect(state.phase).toBe('racing');
    expect(state.elapsedTicks).toBe(0);

    expect(crossesCheckpointGate({ x: 0, z: -1 }, { x: 0, z: 1 }, gates[0])).toBe(false);
    expect(crossesCheckpointGate({ x: 2, z: 1 }, { x: 2, z: -1 }, gates[0])).toBe(false);
    state = stepRace(state, { x: 0, z: -1 }, { x: 0, z: 1 });
    state = stepRace(state, { x: 2, z: 1 }, { x: 2, z: -1 });
    expect(state.nextCheckpointIndex).toBe(0);
  });

  it('requires ordered checkpoints and completes exactly three timed laps', () => {
    let state = createRaceState(gates, 3, 0);
    state = driveThroughGate(state, 0);
    expect(state.crossedStartLine).toBe(true);
    expect(state.nextCheckpointIndex).toBe(1);

    state = driveThroughGate(state, 2);
    expect(state.nextCheckpointIndex).toBe(1);
    state = driveThroughGate(state, 1);
    state = driveThroughGate(state, 2);
    state = driveThroughGate(state, 0);
    expect(state.completedLaps).toBe(1);
    expect(state.currentLap).toBe(2);

    for (let lap = 1; lap < 3; lap++) {
      state = driveThroughGate(state, 1);
      state = driveThroughGate(state, 2);
      state = driveThroughGate(state, 0);
    }

    expect(state.phase).toBe('finished');
    expect(state.completedLaps).toBe(3);
    expect(state.currentLap).toBe(3);
    expect(state.lapTimesSeconds).toEqual([5 / 60, 3 / 60, 3 / 60]);
    expect(raceElapsedSeconds(state)).toBeCloseTo(11 / 60);
    expect(driveThroughGate(state, 0)).toBe(state);
  });
});
