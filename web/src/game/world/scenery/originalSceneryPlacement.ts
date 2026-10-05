import { worldRandom } from '../../../core/random/seededRandom';
import type { World } from '../terrain/generateWorld';
import {
  generateSceneryPlacements,
  isProceduralFallbackPlacement,
  type SceneryPlacement,
  type SceneryQuality,
} from './sceneryPlacement';

export type OriginalSceneryKind = 'birch' | 'oak' | 'rock';

export interface OriginalSceneryPlacement {
  readonly kind: OriginalSceneryKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly yaw: number;
  readonly variant: number;
}

const COUNTS: Record<SceneryQuality, Record<OriginalSceneryKind, number>> = {
  low: { birch: 20, oak: 14, rock: 10 },
  medium: { birch: 45, oak: 28, rock: 22 },
  high: { birch: 70, oak: 44, rock: 35 },
};

const MODEL_VARIANTS: Record<OriginalSceneryKind, number> = {
  birch: 4,
  oak: 1,
  rock: 2,
};

const EDGE_MARGIN = 7;
const ROAD_WEIGHT_LIMIT = 0.01;
const ROAD_FOOTPRINT_RADIUS = 2.5;
const MAX_TREE_HEIGHT = 29;
const MAX_ATTEMPTS_PER_PLACEMENT = 40;

function isOffRoad(world: World, x: number, z: number): boolean {
  const { terrain } = world;
  return (
    terrain.sampleRoad(x, z) <= ROAD_WEIGHT_LIMIT
    && terrain.sampleRoad(x + ROAD_FOOTPRINT_RADIUS, z) <= ROAD_WEIGHT_LIMIT
    && terrain.sampleRoad(x - ROAD_FOOTPRINT_RADIUS, z) <= ROAD_WEIGHT_LIMIT
    && terrain.sampleRoad(x, z + ROAD_FOOTPRINT_RADIUS) <= ROAD_WEIGHT_LIMIT
    && terrain.sampleRoad(x, z - ROAD_FOOTPRINT_RADIUS) <= ROAD_WEIGHT_LIMIT
  );
}

function isClearOfScenery(
  x: number,
  z: number,
  kind: OriginalSceneryKind,
  background: readonly SceneryPlacement[],
  placed: readonly OriginalSceneryPlacement[],
): boolean {
  const minimumDistance = kind === 'rock' ? 3 : 4;
  for (const item of background) {
    if (Math.abs(x - item.x) >= minimumDistance || Math.abs(z - item.z) >= minimumDistance) continue;
    if (Math.hypot(x - item.x, z - item.z) < minimumDistance) return false;
  }
  for (const item of placed) {
    if (Math.abs(x - item.x) >= minimumDistance || Math.abs(z - item.z) >= minimumDistance) continue;
    if (Math.hypot(x - item.x, z - item.z) < minimumDistance) return false;
  }
  return true;
}

/** Sparse foreground placements that complement the existing procedural forest. */
export function generateOriginalSceneryPlacements(
  world: World,
  quality: SceneryQuality = 'medium',
): readonly OriginalSceneryPlacement[] {
  const counts = COUNTS[quality];
  if (!counts) throw new RangeError(`Unknown scenery quality: ${quality}`);

  const background = generateSceneryPlacements(world, quality).filter(isProceduralFallbackPlacement);
  const random = worldRandom(world.seed, 'scenery:original-models');
  const placed: OriginalSceneryPlacement[] = [];
  const { terrain, track } = world;
  const maximumX = terrain.originX + (terrain.size - 1) * terrain.cellSize;
  const maximumZ = terrain.originZ + (terrain.size - 1) * terrain.cellSize;

  for (const kind of ['birch', 'oak', 'rock'] as const) {
    const count = counts[kind];
    for (let slot = 0; slot < count; slot += 1) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_PLACEMENT; attempt += 1) {
        // Stratifying by track progress keeps the recognizable original models
        // visible throughout a lap without clustering them at the start.
        const progress = (slot + random.nextFloat()) / count;
        const anchor = track.points[Math.floor(progress * track.points.length) % track.points.length];
        const distance = 11.5 + random.nextFloat() * 13;
        const side = random.nextInt(2) === 0 ? -1 : 1;
        const along = (random.nextFloat() - 0.5) * 6;
        const x = anchor.x + anchor.side.x * side * distance + anchor.heading.x * along;
        const z = anchor.z + anchor.side.z * side * distance + anchor.heading.z * along;

        if (
          x < terrain.originX + EDGE_MARGIN || x > maximumX - EDGE_MARGIN
          || z < terrain.originZ + EDGE_MARGIN || z > maximumZ - EDGE_MARGIN
        ) continue;
        if (!isOffRoad(world, x, z)) continue;
        const surface = terrain.sampleSurface(x, z);
        if (surface.normal.y < (kind === 'rock' ? 0.58 : 0.76)) continue;
        if (kind !== 'rock' && surface.height > MAX_TREE_HEIGHT) continue;
        if (!isClearOfScenery(x, z, kind, background, placed)) continue;

        // GamePlayView.cs gives both tree species a scale of 3–6 and stones
        // a scale of 0.5–0.75. Keep the original model size differences too.
        const scale = kind === 'rock' ? 0.5 + random.nextFloat() * 0.25 : 3 + random.nextFloat() * 3;
        placed.push({
          kind, x, y: surface.height, z, scale,
          yaw: random.nextFloat() * Math.PI * 2,
          variant: random.nextInt(MODEL_VARIANTS[kind]),
        });
        break;
      }
    }
  }

  return placed;
}
