import { describe, expect, it } from 'vitest';
import { SeededRandom, worldRandom } from '../src/core/random/seededRandom';
import { generateTrack } from '../src/game/world/track/track';
import { generateHeightMap } from '../src/game/world/terrain/heightMap';
import { generateWorld } from '../src/game/world/terrain/generateWorld';

describe('seeded generation', () => {
  it('repeats the same sequence and keeps subsystem streams independent', () => {
    const first = new SeededRandom(42);
    const second = new SeededRandom(42);
    const firstValues = Array.from({ length: 12 }, () => first.nextFloat());
    const secondValues = Array.from({ length: 12 }, () => second.nextFloat());
    expect(firstValues).toEqual(secondValues);
    expect(firstValues.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new SeededRandom(43).nextFloat()).not.toBe(firstValues[0]);
    expect(worldRandom('summer', 'track').nextFloat()).not.toBe(worldRandom('summer', 'terrain').nextFloat());
    expect(() => new SeededRandom(1.5)).toThrow(RangeError);
  });

  it('builds a continuous closed curve with the original five-node layout', () => {
    const track = generateTrack(401, { x: 0.75, y: 35, z: 0.75 }, new SeededRandom(17));
    expect(track.nodes).toHaveLength(5);
    expect(track.points).toHaveLength(750);
    expect(track.sample(0)).toEqual(track.sample(1));
    expect(track.length).toBeGreaterThan(300);

    for (const node of track.nodes) {
      expect(Math.hypot(node.position.x, node.position.z)).toBeCloseTo(401 * 0.25 * 0.75, 8);
      expect(node.position.y).toBeGreaterThanOrEqual(0.05 * 35);
      expect(node.position.y).toBeLessThanOrEqual(0.25 * 35);
    }
    for (const point of track.points) {
      expect(Math.hypot(point.heading.x, point.heading.y, point.heading.z)).toBeCloseTo(1, 8);
      expect(Math.hypot(point.side.x, point.side.z)).toBeCloseTo(1, 8);
    }
    expect(track.points[1].distanceFromStart).toBeGreaterThan(0);
    expect(track.points.at(-1)?.distanceFromStart).toBeLessThan(track.length);
  });

  it('creates a deterministic nonnegative height map', () => {
    const first = generateHeightMap(65, new SeededRandom('hill'));
    const repeated = generateHeightMap(65, new SeededRandom('hill'));
    const different = generateHeightMap(65, new SeededRandom('valley'));
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(different);
    expect(first).toHaveLength(65 * 65);
    expect(first.every((height) => Number.isFinite(height) && height >= 0)).toBe(true);
  });

  it('embeds a driveable road into the terrain and exposes world-space samples', () => {
    const world = generateWorld(2026);
    const repeated = generateWorld(2026);
    const { terrain, track } = world;
    expect(terrain.size).toBe(401);
    expect(terrain.cellSize).toBe(0.75);
    expect(terrain.heights).toEqual(repeated.terrain.heights);
    expect(terrain.roadWeights).toEqual(repeated.terrain.roadWeights);
    expect(track.points).toEqual(repeated.track.points);
    expect(terrain.sampleRoad(terrain.originX, terrain.originZ)).toBe(0);

    for (let index = 0; index < track.points.length; index += 25) {
      const point = track.points[index];
      expect(terrain.sampleRoad(point.x, point.z)).toBeGreaterThan(0.8);
      expect(terrain.sampleHeight(point.x, point.z)).toBeCloseTo(point.y, 0);
      expect(terrain.sampleSurface(point.x, point.z).normal.y).toBeGreaterThan(0);
    }

    const gridX = 107;
    const gridZ = 241;
    const worldX = terrain.originX + gridX * terrain.cellSize;
    const worldZ = terrain.originZ + gridZ * terrain.cellSize;
    expect(terrain.sampleHeight(worldX, worldZ)).toBeCloseTo(terrain.heights[gridZ * terrain.size + gridX], 7);
    expect(terrain.sampleRoad(worldX, worldZ)).toBeCloseTo(terrain.roadWeights[gridZ * terrain.size + gridX], 7);
  });
});
