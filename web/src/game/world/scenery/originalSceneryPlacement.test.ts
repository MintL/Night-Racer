import { expect, it } from 'vitest';
import { generateWorld } from '../terrain/generateWorld';
import { generateOriginalSceneryPlacements } from './originalSceneryPlacement';
import { generateSceneryPlacements } from './sceneryPlacement';

it('places the original models reproducibly off-road and clear of background scenery', () => {
  const world = generateWorld('legacy-scenery');
  const originals = generateOriginalSceneryPlacements(world, 'medium');
  const background = generateSceneryPlacements(world, 'medium');

  expect(originals).toEqual(generateOriginalSceneryPlacements(world, 'medium'));
  expect(originals.length).toBeGreaterThan(40);
  for (const placement of originals) {
    for (const [offsetX, offsetZ] of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) {
      expect(world.terrain.sampleRoad(placement.x + offsetX, placement.z + offsetZ)).toBeLessThanOrEqual(0.01);
    }
    const clearance = placement.kind === 'birch' ? 4 : 3;
    expect(background.every((item) => Math.hypot(item.x - placement.x, item.z - placement.z) >= clearance)).toBe(true);
  }
});
