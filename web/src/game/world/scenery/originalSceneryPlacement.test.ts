import { expect, it } from 'vitest';
import { generateWorld } from '../terrain/generateWorld';
import { generateOriginalSceneryPlacements } from './originalSceneryPlacement';
import { generateSceneryPlacements, isProceduralFallbackPlacement } from './sceneryPlacement';

it('places the original models reproducibly off-road and clear of background scenery', () => {
  const world = generateWorld('legacy-scenery');
  const originals = generateOriginalSceneryPlacements(world, 'medium');
  const background = generateSceneryPlacements(world, 'medium').filter(isProceduralFallbackPlacement);

  expect(originals).toEqual(generateOriginalSceneryPlacements(world, 'medium'));
  expect(originals.length).toBeGreaterThan(80);
  expect(new Set(originals.map((placement) => placement.kind))).toEqual(new Set(['birch', 'oak', 'rock']));
  expect(new Set(originals.filter((placement) => placement.kind === 'birch').map((placement) => placement.variant)))
    .toEqual(new Set([0, 1, 2, 3]));
  expect(new Set(originals.filter((placement) => placement.kind === 'rock').map((placement) => placement.variant)))
    .toEqual(new Set([0, 1]));
  for (const placement of originals) {
    for (const [offsetX, offsetZ] of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) {
      expect(world.terrain.sampleRoad(placement.x + offsetX, placement.z + offsetZ)).toBeLessThanOrEqual(0.01);
    }
    const clearance = placement.kind === 'rock' ? 3 : 4;
    expect(placement.variant).toBeGreaterThanOrEqual(0);
    expect(placement.variant).toBeLessThan(placement.kind === 'birch' ? 4 : placement.kind === 'rock' ? 2 : 1);
    expect(background.every((item) => Math.hypot(item.x - placement.x, item.z - placement.z) >= clearance)).toBe(true);
  }
});
