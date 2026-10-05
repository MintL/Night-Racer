export interface VehiclePosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Speed is in original XNA distance units per 60 Hz simulation step. */
export interface VehicleState {
  readonly position: VehiclePosition;
  /** Yaw zero faces -Z, as in the original XNA car. */
  readonly yaw: number;
  readonly speed: number;
  readonly steeringAngle: number;
  readonly wheelSpin: number;
  /** Body attitude about its local right and forward axes, respectively. */
  readonly pitch: number;
  readonly roll: number;
}

export function createVehicleState(position: VehiclePosition, yaw = 0): VehicleState {
  return {
    position: { ...position },
    yaw,
    speed: 0,
    steeringAngle: 0,
    wheelSpin: 0,
    pitch: 0,
    roll: 0,
  };
}

export function vehicleHeading(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** One display pose shared by the car mesh and chase camera between 60 Hz ticks. */
export function interpolateVehicleState(previous: VehicleState, current: VehicleState, alpha: number): VehicleState {
  const amount = Math.min(1, Math.max(0, alpha));
  const lerp = (first: number, second: number): number => first + (second - first) * amount;
  const yawDifference = Math.atan2(Math.sin(current.yaw - previous.yaw), Math.cos(current.yaw - previous.yaw));
  return {
    position: {
      x: lerp(previous.position.x, current.position.x),
      y: lerp(previous.position.y, current.position.y),
      z: lerp(previous.position.z, current.position.z),
    },
    yaw: previous.yaw + yawDifference * amount,
    speed: lerp(previous.speed, current.speed),
    steeringAngle: lerp(previous.steeringAngle, current.steeringAngle),
    wheelSpin: lerp(previous.wheelSpin, current.wheelSpin),
    pitch: lerp(previous.pitch, current.pitch),
    roll: lerp(previous.roll, current.roll),
  };
}
