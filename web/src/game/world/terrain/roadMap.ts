import type { Track } from '../track/track';

// GamePlayView.cs: the road spans seven terrain quads to each side, with a
// further nine-quad shoulder. The original sampled progress every .0002.
export const ORIGINAL_ROAD = {
  halfWidthCells: 7,
  falloffCells: 16,
  curveSamples: 5000,
} as const;

export interface RoadMap {
  readonly heights: Float32Array;
  readonly roadWeights: Float32Array;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** Fits a road ribbon to the curve after terrain generation. */
export function carveRoad(
  baseHeights: Float32Array,
  track: Track,
  size: number,
  cellSize: number,
  originX: number,
  originZ: number,
): RoadMap {
  if (baseHeights.length !== size * size) {
    throw new RangeError('The height map dimensions do not match the road grid.');
  }

  const nearestOffset = new Float32Array(baseHeights.length);
  nearestOffset.fill(Number.POSITIVE_INFINITY);
  const targetHeight = new Float32Array(baseHeights.length);
  const step = 1 / ORIGINAL_ROAD.curveSamples;

  for (let sampleIndex = 0; sampleIndex < ORIGINAL_ROAD.curveSamples; sampleIndex += 1) {
    const point = track.sample(sampleIndex * step);
    const next = track.sample((sampleIndex + 1) * step);
    const directionX = next.x - point.x;
    const directionZ = next.z - point.z;
    const horizontalLength = Math.hypot(directionX, directionZ);
    if (horizontalLength === 0) continue;
    const sideX = -directionZ / horizontalLength;
    const sideZ = directionX / horizontalLength;

    for (let offset = -ORIGINAL_ROAD.falloffCells; offset <= ORIGINAL_ROAD.falloffCells; offset += 1) {
      const worldX = point.x + offset * cellSize * sideX;
      const worldZ = point.z + offset * cellSize * sideZ;
      const gridX = Math.floor((worldX - originX) / cellSize);
      const gridZ = Math.floor((worldZ - originZ) / cellSize);
      if (gridX < 0 || gridX >= size || gridZ < 0 || gridZ >= size) continue;

      const index = gridZ * size + gridX;
      const distance = Math.abs(offset);
      if (distance < nearestOffset[index]) {
        nearestOffset[index] = distance;
        targetHeight[index] = point.y;
      }
    }
  }

  // GamePlayView.cs perturbs and smooths after stamping the road. That shifts
  // its mesh away from the driving curve. We stamp last so physics and road
  // visuals agree, and use a fading shoulder instead of its rising edge mask.
  const heights = baseHeights.slice();
  const roadWeights = new Float32Array(baseHeights.length);
  for (let index = 0; index < heights.length; index += 1) {
    const offset = nearestOffset[index];
    if (offset <= ORIGINAL_ROAD.halfWidthCells) {
      heights[index] = targetHeight[index];
      roadWeights[index] = 1;
    } else if (offset <= ORIGINAL_ROAD.falloffCells) {
      const amount = (offset - ORIGINAL_ROAD.halfWidthCells)
        / (ORIGINAL_ROAD.falloffCells - ORIGINAL_ROAD.halfWidthCells);
      const baseWeight = smoothstep(amount);
      heights[index] = targetHeight[index] * (1 - baseWeight) + heights[index] * baseWeight;
      roadWeights[index] = 1 - baseWeight;
    }
  }

  return { heights, roadWeights };
}
