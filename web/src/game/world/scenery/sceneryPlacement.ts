import { worldRandom, type SeededRandom } from '../../../core/random/seededRandom';
import type { World } from '../terrain/generateWorld';

export type SceneryQuality = 'low' | 'medium' | 'high';
export type SceneryKind = 'birch' | 'oak' | 'rock';

export interface SceneryPlacement {
  readonly kind: SceneryKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly yaw: number;
  readonly colorVariation: number;
  readonly shapeVariation: number;
}

const COUNTS: Record<SceneryQuality, Record<SceneryKind, number>> = {
  low: { birch: 260, oak: 200, rock: 120 },
  medium: { birch: 600, oak: 450, rock: 280 },
  high: { birch: 1000, oak: 700, rock: 450 },
};

const SPATIAL_CELL_SIZE = 4;
const TREE_MINIMUM_NORMAL_Y = 0.77;
const ROCK_MINIMUM_NORMAL_Y = 0.58;
const TREE_MAXIMUM_HEIGHT = 29;
const ROAD_CLEARANCE = 15;
const TERRAIN_EDGE_MARGIN = 5;

function spatialKey(x: number, z: number): string {
  return `${x},${z}`;
}

function minimumSeparation(first: SceneryKind, second: SceneryKind): number {
  if (first === 'rock' && second === 'rock') return 1.5;
  if (first === 'rock' || second === 'rock') return 2.1;
  return 3.5;
}

function isClear(
  x: number,
  z: number,
  kind: SceneryKind,
  occupied: Map<string, SceneryPlacement[]>,
): boolean {
  const cellX = Math.floor(x / SPATIAL_CELL_SIZE);
  const cellZ = Math.floor(z / SPATIAL_CELL_SIZE);
  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const neighbours = occupied.get(spatialKey(cellX + offsetX, cellZ + offsetZ));
      if (!neighbours) continue;
      for (const neighbour of neighbours) {
        if (Math.hypot(x - neighbour.x, z - neighbour.z) < minimumSeparation(kind, neighbour.kind)) {
          return false;
        }
      }
    }
  }
  return true;
}

function remember(placement: SceneryPlacement, occupied: Map<string, SceneryPlacement[]>): void {
  const key = spatialKey(
    Math.floor(placement.x / SPATIAL_CELL_SIZE),
    Math.floor(placement.z / SPATIAL_CELL_SIZE),
  );
  const placements = occupied.get(key);
  if (placements) placements.push(placement);
  else occupied.set(key, [placement]);
}

function tryPlace(
  world: World,
  random: SeededRandom,
  kind: SceneryKind,
  occupied: Map<string, SceneryPlacement[]>,
): SceneryPlacement | null {
  const anchor = world.track.points[random.nextInt(world.track.points.length)];
  const distance = ROAD_CLEARANCE + random.nextFloat() * (kind === 'rock' ? 72 : 62);
  const signedDistance = random.nextInt(2) === 0 ? -distance : distance;
  const along = (random.nextFloat() - 0.5) * 5;
  const x = anchor.x + anchor.side.x * signedDistance + anchor.heading.x * along;
  const z = anchor.z + anchor.side.z * signedDistance + anchor.heading.z * along;
  const { terrain } = world;
  const maximumX = terrain.originX + (terrain.size - 1) * terrain.cellSize;
  const maximumZ = terrain.originZ + (terrain.size - 1) * terrain.cellSize;
  if (
    x < terrain.originX + TERRAIN_EDGE_MARGIN || x > maximumX - TERRAIN_EDGE_MARGIN
    || z < terrain.originZ + TERRAIN_EDGE_MARGIN || z > maximumZ - TERRAIN_EDGE_MARGIN
  ) return null;

  const surface = terrain.sampleSurface(x, z);
  if (surface.roadWeight > 0.01) return null;
  if (kind === 'rock' && surface.normal.y < ROCK_MINIMUM_NORMAL_Y) return null;
  if (kind !== 'rock' && (surface.normal.y < TREE_MINIMUM_NORMAL_Y || surface.height > TREE_MAXIMUM_HEIGHT)) return null;
  if (!isClear(x, z, kind, occupied)) return null;

  return {
    kind,
    x,
    y: surface.height,
    z,
    scale: kind === 'rock' ? 0.45 + random.nextFloat() * 1.1 : 0.77 + random.nextFloat() * 0.83,
    yaw: random.nextFloat() * Math.PI * 2,
    colorVariation: random.nextFloat(),
    shapeVariation: random.nextFloat(),
  };
}

/** Repeats exactly for a given world seed and quality, independently of rendering. */
export function generateSceneryPlacements(world: World, quality: SceneryQuality = 'medium'): readonly SceneryPlacement[] {
  const counts = COUNTS[quality];
  if (!counts) throw new RangeError(`Unknown scenery quality: ${quality}`);

  const placements: SceneryPlacement[] = [];
  const occupied = new Map<string, SceneryPlacement[]>();

  for (const kind of ['birch', 'oak', 'rock'] as const) {
    const random = worldRandom(world.seed, `scenery:${kind}`);
    const requestedCount = counts[kind];
    let acceptedCount = 0;
    // Steep terrain, overlapping track loops and edge rejection can reduce the
    // final count. Keep the attempt bound so every seed loads promptly.
    for (let attempt = 0; attempt < requestedCount * 20 && acceptedCount < requestedCount; attempt += 1) {
      const placement = tryPlace(world, random, kind, occupied);
      if (!placement) continue;
      placements.push(placement);
      remember(placement, occupied);
      acceptedCount += 1;
    }
  }

  return placements;
}
