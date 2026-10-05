import { SeededRandom } from '../../../core/random/seededRandom';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrackNode {
  readonly position: Point3;
  readonly tangent: Point3;
}

export interface TrackCurve {
  readonly nodes: readonly TrackNode[];
  sample(progress: number): Point3;
}

export interface TerrainScale {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// RaceTrackCurve.cs: five nodes at a quarter of the terrain width, with a
// .6-radius tangent and independently varying elevations and tangent angles.
export const ORIGINAL_TRACK = {
  nodeCount: 5,
  radiusFraction: 0.25,
  tangentStrength: 0.6,
  baseHeight: 0.15,
  heightVariation: 0.2,
  angleVariation: 1,
} as const;

function rotateY(point: Point3, angle: number): Point3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  // Matches Matrix.CreateRotationY in the XNA curve's coordinate convention.
  return {
    x: point.x * cosine + point.z * sine,
    y: point.y,
    z: -point.x * sine + point.z * cosine,
  };
}

function scale(point: Point3, terrainScale: TerrainScale): Point3 {
  return {
    x: point.x * terrainScale.x,
    y: point.y * terrainScale.y,
    z: point.z * terrainScale.z,
  };
}

function bezier(first: Point3, firstControl: Point3, secondControl: Point3, last: Point3, t: number): Point3 {
  const remaining = 1 - t;
  const firstWeight = remaining ** 3;
  const firstControlWeight = 3 * remaining ** 2 * t;
  const secondControlWeight = 3 * remaining * t ** 2;
  const lastWeight = t ** 3;
  return {
    x: firstWeight * first.x + firstControlWeight * firstControl.x + secondControlWeight * secondControl.x + lastWeight * last.x,
    y: firstWeight * first.y + firstControlWeight * firstControl.y + secondControlWeight * secondControl.y + lastWeight * last.y,
    z: firstWeight * first.z + firstControlWeight * firstControl.z + secondControlWeight * secondControl.z + lastWeight * last.z,
  };
}

export function generateTrackCurve(terrainSize: number, terrainScale: TerrainScale, random: SeededRandom): TrackCurve {
  if (!Number.isInteger(terrainSize) || terrainSize < 8) {
    throw new RangeError('Terrain size must be an integer of at least eight.');
  }

  const radius = terrainSize * ORIGINAL_TRACK.radiusFraction;
  const direction = random.nextInt(2) * 2 - 1;
  const nodes: TrackNode[] = [];

  for (let index = 0; index < ORIGINAL_TRACK.nodeCount; index += 1) {
    const angle = (index * Math.PI * 2) / ORIGINAL_TRACK.nodeCount;
    const height = ORIGINAL_TRACK.baseHeight + ORIGINAL_TRACK.heightVariation * (random.nextFloat() - 0.5);
    const tangentAngle = direction * (angle + ORIGINAL_TRACK.angleVariation * random.nextFloat());
    nodes.push({
      position: scale(rotateY({ x: radius, y: height, z: 0 }, direction * angle), terrainScale),
      tangent: rotateY(scale({ x: 0, y: 0, z: -direction * ORIGINAL_TRACK.tangentStrength * radius }, terrainScale), tangentAngle),
    });
  }

  return {
    nodes,
    sample(progress: number): Point3 {
      if (!Number.isFinite(progress)) {
        throw new RangeError('Track progress must be finite.');
      }
      const wrapped = ((progress % 1) + 1) % 1;
      const curvePosition = wrapped * nodes.length;
      const firstIndex = Math.floor(curvePosition);
      const secondIndex = (firstIndex + 1) % nodes.length;
      const first = nodes[firstIndex];
      const second = nodes[secondIndex];
      const t = curvePosition - firstIndex;
      return bezier(
        first.position,
        { x: first.position.x + first.tangent.x, y: first.position.y + first.tangent.y, z: first.position.z + first.tangent.z },
        { x: second.position.x - second.tangent.x, y: second.position.y - second.tangent.y, z: second.position.z - second.tangent.z },
        second.position,
        t,
      );
    },
  };
}
