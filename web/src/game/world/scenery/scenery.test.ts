import { it, expect } from 'vitest';
import { generateWorld } from '../terrain/generateWorld';
import { createScenery, disposeScenery } from './createScenery';
import { generateSceneryPlacements } from './sceneryPlacement';

it('builds road-safe deterministic scenery', () => {
  const world = generateWorld(2026);
  const placements = generateSceneryPlacements(world, 'medium');
  expect(placements).toEqual(generateSceneryPlacements(world, 'medium'));
  expect(placements.length).toBeGreaterThan(1100);
  expect(placements.every((item) => world.terrain.sampleRoad(item.x, item.z) <= 0.01)).toBe(true);
  const group = createScenery(world, 'medium');
  expect(group.children.length).toBe(5);
  expect(group.userData.placementCount).toBe(placements.length);
  disposeScenery(group);
  expect(group.children.length).toBe(0);
});
