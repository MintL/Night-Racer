import type { Point3, TrackCurve } from './trackCurve';

export interface TrackPoint extends Point3 {
  readonly heading: Point3;
  readonly side: Point3;
  readonly progress: number;
  readonly distanceFromStart: number;
}

function normalized(delta: Point3): Point3 {
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length === 0) {
    throw new Error('The track curve produced duplicate consecutive points.');
  }
  return { x: delta.x / length, y: delta.y / length, z: delta.z / length };
}

/** Samples the closed curve as in CurveRasterization.cs, including its closing segment. */
export function rasterizeTrack(curve: TrackCurve, pointCount: number): readonly TrackPoint[] {
  if (!Number.isInteger(pointCount) || pointCount < 3) {
    throw new RangeError('A closed track needs at least three raster points.');
  }

  const positions = Array.from({ length: pointCount }, (_, index) => curve.sample(index / pointCount));
  const points: TrackPoint[] = [];
  let distanceFromStart = 0;

  for (let index = 0; index < pointCount; index += 1) {
    const position = positions[index];
    const nextPosition = positions[(index + 1) % pointCount];
    const delta = {
      x: nextPosition.x - position.x,
      y: nextPosition.y - position.y,
      z: nextPosition.z - position.z,
    };
    const heading = normalized(delta);
    const horizontalLength = Math.hypot(heading.x, heading.z);
    const side = { x: -heading.z / horizontalLength, y: 0, z: heading.x / horizontalLength };
    points.push({
      ...position,
      heading,
      side,
      progress: index / pointCount,
      distanceFromStart,
    });
    distanceFromStart += Math.hypot(delta.x, delta.y, delta.z);
  }

  return points;
}
