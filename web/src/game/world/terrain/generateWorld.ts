import { worldRandom, type WorldSeed } from '../../../core/random/seededRandom';
import { generateTrack, type Track } from '../track/track';
import { generateHeightMap, ORIGINAL_HEIGHT_MAP } from './heightMap';
import { carveRoad } from './roadMap';

// GamePlayView.cs uses (75, 3500, 75) XNA units per heightmap sample.
// One web world unit equals 100 XNA units, keeping the car and camera compact.
export const WORLD_SCALE = {
  horizontal: 0.75,
  vertical: 35,
} as const;

export interface SurfaceSample {
  readonly height: number;
  readonly roadWeight: number;
  readonly normal: Readonly<{ x: number; y: number; z: number }>;
}

export interface Terrain {
  readonly size: number;
  readonly cellSize: number;
  readonly originX: number;
  readonly originZ: number;
  /** World-space Y at each grid vertex, laid out as heights[z * size + x]. */
  readonly heights: Float32Array;
  readonly roadWeights: Float32Array;
  sampleHeight(x: number, z: number): number;
  sampleRoad(x: number, z: number): number;
  sampleSurface(x: number, z: number): SurfaceSample;
}

export interface World {
  readonly seed: WorldSeed;
  readonly track: Track;
  readonly terrain: Terrain;
}

function sampleGrid(values: Float32Array, size: number, gridX: number, gridZ: number): number {
  const x = Math.min(size - 1, Math.max(0, gridX));
  const z = Math.min(size - 1, Math.max(0, gridZ));
  const firstX = Math.floor(x);
  const firstZ = Math.floor(z);
  const secondX = Math.min(size - 1, firstX + 1);
  const secondZ = Math.min(size - 1, firstZ + 1);
  const amountX = x - firstX;
  const amountZ = z - firstZ;
  const near = values[firstZ * size + firstX] * (1 - amountX)
    + values[firstZ * size + secondX] * amountX;
  const far = values[secondZ * size + firstX] * (1 - amountX)
    + values[secondZ * size + secondX] * amountX;
  return near * (1 - amountZ) + far * amountZ;
}

function buildTerrain(heights: Float32Array, roadWeights: Float32Array, size: number): Terrain {
  const cellSize = WORLD_SCALE.horizontal;
  const origin = -(size / 2) * cellSize;
  const sample = (values: Float32Array, x: number, z: number): number => {
    return sampleGrid(values, size, (x - origin) / cellSize, (z - origin) / cellSize);
  };
  const sampleHeight = (x: number, z: number): number => sample(heights, x, z);
  const sampleRoad = (x: number, z: number): number => sample(roadWeights, x, z);

  return {
    size,
    cellSize,
    originX: origin,
    originZ: origin,
    heights,
    roadWeights,
    sampleHeight,
    sampleRoad,
    sampleSurface(x: number, z: number): SurfaceSample {
      const height = sampleHeight(x, z);
      const deltaX = sampleHeight(x - cellSize, z) - sampleHeight(x + cellSize, z);
      const deltaZ = sampleHeight(x, z - cellSize) - sampleHeight(x, z + cellSize);
      const length = Math.hypot(deltaX, 2 * cellSize, deltaZ);
      return {
        height,
        roadWeight: sampleRoad(x, z),
        normal: { x: deltaX / length, y: (2 * cellSize) / length, z: deltaZ / length },
      };
    },
  };
}

export function generateWorld(seed: WorldSeed): World {
  const size = ORIGINAL_HEIGHT_MAP.size;
  const track = generateTrack(
    size,
    { x: WORLD_SCALE.horizontal, y: WORLD_SCALE.vertical, z: WORLD_SCALE.horizontal },
    worldRandom(seed, 'track'),
  );
  const normalizedHeights = generateHeightMap(size, worldRandom(seed, 'terrain'));
  const baseHeights = normalizedHeights.map((height) => height * WORLD_SCALE.vertical);
  const origin = -(size / 2) * WORLD_SCALE.horizontal;
  const road = carveRoad(baseHeights, track, size, WORLD_SCALE.horizontal, origin, origin);
  return { seed, track, terrain: buildTerrain(road.heights, road.roadWeights, size) };
}
