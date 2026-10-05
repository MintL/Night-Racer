import { expect, it } from 'vitest';
import { createVehicleState, interpolateVehicleState } from '../src/game/vehicle/vehicleState';

it('interpolates one continuous display pose across a yaw wrap', () => {
  const previous = { ...createVehicleState({ x: 0, y: 1, z: 0 }), yaw: Math.PI - 0.02 };
  const current = { ...createVehicleState({ x: 1, y: 2, z: -0.5 }), yaw: -Math.PI + 0.02 };
  const halfway = interpolateVehicleState(previous, current, 0.5);

  expect(halfway.position).toEqual({ x: 0.5, y: 1.5, z: -0.25 });
  expect(halfway.yaw).toBeCloseTo(Math.PI);
  expect(interpolateVehicleState(previous, current, -1).position).toEqual(previous.position);
  expect(interpolateVehicleState(previous, current, 2).position).toEqual(current.position);
});
