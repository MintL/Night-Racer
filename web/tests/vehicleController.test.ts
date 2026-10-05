import { describe, expect, it } from 'vitest';
import {
  LEGACY_WORLD_SCALE,
  ORIGINAL_HANDLING,
  stepVehicle,
  vehicleSpeedWorldPerSecond,
} from '../src/game/vehicle/vehicleController';
import { createVehicleState } from '../src/game/vehicle/vehicleState';

const start = createVehicleState({ x: 0, y: 0, z: 0 });
const accelerate = { throttle: 1, brake: 0, steer: 0 };

describe('fixed-step vehicle baseline', () => {
  it('uses the original first-frame acceleration and scaled forward displacement', () => {
    const next = stepVehicle(start, accelerate);

    expect(next.speed).toBeCloseTo(ORIGINAL_HANDLING.acceleration);
    expect(next.position.x).toBeCloseTo(0);
    expect(next.position.z).toBeCloseTo(-ORIGINAL_HANDLING.acceleration * LEGACY_WORLD_SCALE);
    expect(next.yaw).toBeCloseTo(0);
    expect(vehicleSpeedWorldPerSecond(next)).toBeCloseTo(0.09);
    expect(start.position.z).toBe(0);
  });

  it('steers left with the original steering return and deterministic two axle turn', () => {
    const input = { throttle: 1, brake: 0, steer: 1 };
    const run = (steps: number) => {
      let state = start;
      for (let i = 0; i < steps; i++) state = stepVehicle(state, input);
      return state;
    };

    const oneStep = run(1);
    expect(oneStep.steeringAngle).toBeCloseTo(
      (ORIGINAL_HANDLING.turnSpeed - oneStep.speed * ORIGINAL_HANDLING.steeringSpeedReduction) *
        ORIGINAL_HANDLING.steeringReturn,
    );
    expect(oneStep.yaw).toBeGreaterThan(0);
    expect(oneStep.position.x).toBeLessThan(0);

    const left = run(60);
    let right = start;
    for (let i = 0; i < 60; i++) {
      right = stepVehicle(right, { ...input, steer: -1 });
    }
    expect(left.position.x).toBeCloseTo(-right.position.x);
    expect(left.position.z).toBeCloseTo(right.position.z);
    expect(left.yaw).toBeCloseTo(-right.yaw);
  });

  it('slows on grass and follows an injected terrain height without a renderer', () => {
    let road = start;
    let grass = start;
    for (let i = 0; i < 120; i++) {
      road = stepVehicle(road, accelerate, {
        sampleHeight: (x, z) => x + z + 5,
        sampleRoad: () => 1,
      });
      grass = stepVehicle(grass, accelerate, {
        sampleHeight: (x, z) => x + z + 5,
        sampleRoad: () => 0,
      });
    }

    expect(grass.speed).toBeLessThan(road.speed);
    expect(Math.abs(grass.position.z)).toBeLessThan(Math.abs(road.position.z));
    expect(road.position.y).toBeCloseTo(road.position.x + road.position.z + 5);
  });

  it('brakes into bounded reverse motion', () => {
    let state = start;
    for (let i = 0; i < 240; i++) {
      state = stepVehicle(state, { throttle: 0, brake: 1, steer: 0 });
    }

    expect(state.speed).toBeLessThan(0);
    expect(state.speed).toBeGreaterThanOrEqual(-15);
    expect(state.position.z).toBeGreaterThan(0);
  });
});
