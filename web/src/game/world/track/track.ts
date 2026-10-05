import { SeededRandom } from '../../../core/random/seededRandom';
import { generateTrackCurve, type Point3, type TerrainScale, type TrackNode } from './trackCurve';
import { rasterizeTrack, type TrackPoint } from './trackRasterization';

export interface Track {
  readonly nodes: readonly TrackNode[];
  readonly points: readonly TrackPoint[];
  readonly length: number;
  sample(progress: number): Point3;
}

export function generateTrack(
  terrainSize: number,
  terrainScale: TerrainScale,
  random: SeededRandom,
  pointCount = 750,
): Track {
  const curve = generateTrackCurve(terrainSize, terrainScale, random);
  const points = rasterizeTrack(curve, pointCount);
  const first = points[0];
  const last = points[points.length - 1];
  const closingLength = Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
  return {
    nodes: curve.nodes,
    points,
    length: last.distanceFromStart + closingLength,
    sample: curve.sample,
  };
}
