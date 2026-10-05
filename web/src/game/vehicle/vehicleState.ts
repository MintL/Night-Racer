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
