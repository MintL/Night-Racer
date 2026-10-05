export interface TrackPoint2D {
  readonly x: number;
  readonly z: number;
}

export interface CheckpointGate {
  readonly position: TrackPoint2D;
  /** Unit tangent in the legal driving direction. */
  readonly heading: TrackPoint2D;
  /** Distance from the centerline to either end of the gate. */
  readonly halfWidth: number;
}

// GamePlayView.cs uses a road half-width of seven height-map cells, each 75
// legacy units wide. The web world scales those distances by 0.01.
export const ORIGINAL_ROAD_HALF_WIDTH = 7 * 75 * 0.01;
export const ORIGINAL_CHECKPOINT_COUNT = 6;

/** Place ordered gates at equal parameters on a closed track curve. */
export function createCheckpointGates(
  sampleTrack: (parameter: number) => TrackPoint2D,
  count = ORIGINAL_CHECKPOINT_COUNT,
  halfWidth = ORIGINAL_ROAD_HALF_WIDTH,
): CheckpointGate[] {
  if (!Number.isInteger(count) || count < 2) {
    throw new RangeError('A race needs at least two checkpoints');
  }
  if (!(halfWidth > 0)) {
    throw new RangeError('Checkpoint half-width must be positive');
  }

  const tangentSampleOffset = 0.0001;
  return Array.from({ length: count }, (_, index) => {
    const parameter = index / count;
    const position = sampleTrack(parameter);
    const before = sampleTrack(wrapUnit(parameter - tangentSampleOffset));
    const after = sampleTrack(wrapUnit(parameter + tangentSampleOffset));
    const headingX = after.x - before.x;
    const headingZ = after.z - before.z;
    const headingLength = Math.hypot(headingX, headingZ);
    if (headingLength === 0) {
      throw new Error(`Track has no direction at checkpoint ${index}`);
    }
    return {
      position: { x: position.x, z: position.z },
      heading: { x: headingX / headingLength, z: headingZ / headingLength },
      halfWidth,
    };
  });
}

/** Detect a forward crossing of the finite checkpoint line segment. */
export function crossesCheckpointGate(
  from: TrackPoint2D,
  to: TrackPoint2D,
  gate: CheckpointGate,
): boolean {
  const fromAlong =
    (from.x - gate.position.x) * gate.heading.x +
    (from.z - gate.position.z) * gate.heading.z;
  const toAlong =
    (to.x - gate.position.x) * gate.heading.x +
    (to.z - gate.position.z) * gate.heading.z;
  if (fromAlong >= 0 || toAlong < 0) {
    return false;
  }

  const fraction = -fromAlong / (toAlong - fromAlong);
  const crossingX = from.x + (to.x - from.x) * fraction - gate.position.x;
  const crossingZ = from.z + (to.z - from.z) * fraction - gate.position.z;
  const lateralDistance = crossingX * -gate.heading.z + crossingZ * gate.heading.x;
  return Math.abs(lateralDistance) <= gate.halfWidth;
}

function wrapUnit(value: number): number {
  return (value % 1 + 1) % 1;
}
