import { describe, expect, it } from 'vitest';
import { createCheckpointGates } from '../src/game/race/checkpointGates';
import { stepRace } from '../src/game/race/raceController';
import { createRaceState } from '../src/game/race/raceState';
import { generateWorld } from '../src/game/world/terrain/generateWorld';

describe('generated race course', () => {
  it('allows three ordered laps along the generated road', () => {
    const world = generateWorld('2013');
    const gates = createCheckpointGates(world.track.sample);
    let race = createRaceState(gates, 3, 0);
    const step = 1 / 1500;

    for (let progress = 0.99; progress < 4.01 && race.phase !== 'finished'; progress += step) {
      const from = world.track.sample(progress);
      const to = world.track.sample(progress + step);
      race = stepRace(race, from, to);
    }

    expect(race.phase).toBe('finished');
    expect(race.completedLaps).toBe(3);
    expect(race.lapTimesSeconds).toHaveLength(3);
    expect(race.elapsedTicks).toBeGreaterThan(0);
  });
});
