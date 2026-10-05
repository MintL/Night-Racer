import { type VehicleState, vehicleHeading } from './vehicleState';

export const VEHICLE_STEP_SECONDS = 1 / 60;
export const LEGACY_WORLD_SCALE = 0.01;

// Car.cs and CarControlComponent.cs. These are original values per XNA frame.
export const ORIGINAL_HANDLING = {
  acceleration: 0.15,
  braking: 0.35,
  maxSpeed: 50,
  maxWheelTurn: (Math.PI / 4) / 0.7,
  turnSpeed: 0.005,
  speedDragDuringAcceleration: 0.00305,
  steeringSpeedReduction: 0.00005,
  steeringReturn: 0.95,
  steeringSnapThreshold: 0.001,
  coastingFriction: 0.995,
  coastingSpeedPenalty: 0.0005,
  wheelbase: 40.197,
  wheelRadius: 13.4631138,
} as const;

// The original car was confined to a road ribbon. These small surface changes
// let it drive on open terrain while keeping the original on-road response.
export const MODERN_SURFACE_TUNING = {
  grassAcceleration: 0.8,
  grassSteering: 0.75,
  grassSpeedRetention: 0.9975,
  maxReverseSpeed: 15,
} as const;

export interface VehicleInput {
  /** 0..1; keyboard W or gamepad right trigger. */
  readonly throttle: number;
  /** 0..1; keyboard S or gamepad left trigger. Also engages reverse. */
  readonly brake: number;
  /** -1..1; positive steers left, matching the original A key. */
  readonly steer: number;
}

export interface VehicleEnvironment {
  /** World-space terrain height at the next vehicle position. */
  readonly sampleHeight?: (x: number, z: number) => number;
  /** Road coverage, 1 at the road center and 0 on grass. */
  readonly sampleRoad?: (x: number, z: number) => number;
}

/** Advance exactly one 60 Hz simulation step. Inputs and state are not mutated. */
export function stepVehicle(
  state: VehicleState,
  input: VehicleInput,
  environment: VehicleEnvironment = {},
): VehicleState {
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const steer = clamp(input.steer, -1, 1);
  const roadWeight = clamp(
    environment.sampleRoad?.(state.position.x, state.position.z) ?? 1,
    0,
    1,
  );
  const grassWeight = 1 - roadWeight;

  const accelerationScale = 1 - grassWeight * (1 - MODERN_SURFACE_TUNING.grassAcceleration);
  let speed = state.speed +
    (ORIGINAL_HANDLING.acceleration - state.speed * ORIGINAL_HANDLING.speedDragDuringAcceleration) *
      throttle * accelerationScale -
    brake * ORIGINAL_HANDLING.braking;
  speed = clamp(speed, -MODERN_SURFACE_TUNING.maxReverseSpeed, ORIGINAL_HANDLING.maxSpeed);

  if (throttle < ORIGINAL_HANDLING.steeringSnapThreshold) {
    speed *= ORIGINAL_HANDLING.coastingFriction -
      Math.abs(speed - ORIGINAL_HANDLING.maxSpeed) * ORIGINAL_HANDLING.coastingSpeedPenalty;
  }
  speed *= 1 - grassWeight * (1 - MODERN_SURFACE_TUNING.grassSpeedRetention);

  const steeringScale = 1 - grassWeight * (1 - MODERN_SURFACE_TUNING.grassSteering);
  let steeringAngle = state.steeringAngle + steer *
    (ORIGINAL_HANDLING.turnSpeed - Math.abs(speed) * ORIGINAL_HANDLING.steeringSpeedReduction) *
    steeringScale;
  steeringAngle = clamp(
    steeringAngle,
    -ORIGINAL_HANDLING.maxWheelTurn,
    ORIGINAL_HANDLING.maxWheelTurn,
  );
  steeringAngle = Math.abs(steeringAngle) > ORIGINAL_HANDLING.steeringSnapThreshold
    ? steeringAngle * ORIGINAL_HANDLING.steeringReturn
    : 0;

  // Reproduce Car.Update's two axle construction, with legacy distances scaled
  // into web world units. A positive yaw and steering angle both turn left.
  const heading = vehicleHeading(state.yaw);
  const frontHeading = vehicleHeading(state.yaw + steeringAngle);
  const wheelbase = ORIGINAL_HANDLING.wheelbase * LEGACY_WORLD_SCALE;
  const distance = speed * LEGACY_WORLD_SCALE;
  const frontX = state.position.x + wheelbase * heading.x + distance * frontHeading.x;
  const frontZ = state.position.z + wheelbase * heading.z + distance * frontHeading.z;
  const backX = state.position.x - wheelbase * heading.x + distance * heading.x;
  const backZ = state.position.z - wheelbase * heading.z + distance * heading.z;
  const x = (frontX + backX) / 2;
  const z = (frontZ + backZ) / 2;
  const yaw = Math.atan2(backX - frontX, backZ - frontZ);
  const y = environment.sampleHeight?.(x, z) ?? state.position.y;
  const traveledDistance = Math.hypot(x - state.position.x, z - state.position.z);
  const wheelSpin = state.wheelSpin +
    (speed < 0 ? 1 : -1) * traveledDistance /
      (ORIGINAL_HANDLING.wheelRadius * LEGACY_WORLD_SCALE);

  return {
    position: { x, y, z },
    yaw,
    speed,
    steeringAngle,
    wheelSpin,
    pitch: state.pitch,
    roll: state.roll,
  };
}

export function vehicleSpeedWorldPerSecond(state: VehicleState): number {
  return state.speed * LEGACY_WORLD_SCALE / VEHICLE_STEP_SECONDS;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
