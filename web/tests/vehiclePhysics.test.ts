import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { VehiclePhysics, type PhysicsTerrain } from '../src/game/vehicle/physics/vehiclePhysics';
import { createVehicleState } from '../src/game/vehicle/vehicleState';
import { generateWorld } from '../src/game/world/terrain/generateWorld';

function testTerrain(heightAtGridPoint: (x: number, z: number) => number): PhysicsTerrain {
  const size = 13;
  const cellSize = 1;
  const originX = -6;
  const originZ = -6;
  const heights = new Float32Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      heights[z * size + x] = heightAtGridPoint(originX + x, originZ + z);
    }
  }
  return {
    size,
    cellSize,
    originX,
    originZ,
    heights,
    sampleHeight(x: number, z: number): number {
      const gridX = Math.min(size - 1, Math.max(0, x - originX));
      const gridZ = Math.min(size - 1, Math.max(0, z - originZ));
      const x0 = Math.floor(gridX);
      const z0 = Math.floor(gridZ);
      const x1 = Math.min(size - 1, x0 + 1);
      const z1 = Math.min(size - 1, z0 + 1);
      const mixX = gridX - x0;
      const mixZ = gridZ - z0;
      const near = heights[z0 * size + x0] * (1 - mixX) + heights[z0 * size + x1] * mixX;
      const far = heights[z1 * size + x0] * (1 - mixX) + heights[z1 * size + x1] * mixX;
      return near * (1 - mixZ) + far * mixZ;
    },
  };
}

describe('Rapier vehicle suspension', () => {
  it('aligns the physics heightfield with row-major world terrain', async () => {
    const terrain = testTerrain((x, z) => 2 + 0.3 * x + 0.1 * z);
    const initial = createVehicleState({ x: 0, y: terrain.sampleHeight(0, 0), z: 0 });
    const physics = await VehiclePhysics.create(terrain, initial);
    try {
      const ray = new RAPIER.Ray({ x: -2.9999, y: 8, z: 2.0001 }, { x: 0, y: -1, z: 0 });
      const hit = physics.world.castRayAndGetNormal(ray, 20, false);
      expect(hit).not.toBeNull();
      expect(8 - hit!.timeOfImpact).toBeCloseTo(terrain.sampleHeight(-3, 2), 2);
      expect(hit!.normal.y).toBeGreaterThan(0.9);
    } finally {
      physics.dispose();
    }
  });

  it('settles all four wheels on level ground while keeping arcade X/Z motion', async () => {
    const terrain = testTerrain(() => 0);
    const initial = createVehicleState({ x: 0, y: 0, z: 0 });
    const physics = await VehiclePhysics.create(terrain, initial);
    try {
      let result = physics.step(initial);
      for (let tick = 0; tick < 239; tick++) result = physics.step(result.vehicle);

      expect(result.groundedWheels).toBe(4);
      expect(result.vehicle.position.x).toBe(0);
      expect(result.vehicle.position.z).toBe(0);
      expect(result.vehicle.position.y).toBeGreaterThan(-0.08);
      expect(result.vehicle.position.y).toBeLessThan(0.08);
      expect(Math.abs(result.vehicle.pitch)).toBeLessThan(0.01);
      expect(Math.abs(result.vehicle.roll)).toBeLessThan(0.01);
    } finally {
      physics.dispose();
    }
  });

  it('leans moderately into a two-axis slope and can be reset', async () => {
    const terrain = testTerrain((x, z) => 0.08 * x - 0.15 * z);
    const initial = createVehicleState({ x: 0, y: 0, z: 0 });
    const physics = await VehiclePhysics.create(terrain, initial);
    try {
      let result = physics.step(initial);
      for (let tick = 0; tick < 179; tick++) result = physics.step(result.vehicle);

      expect(result.groundedWheels).toBe(4);
      expect(result.vehicle.pitch).toBeGreaterThan(0.05);
      expect(result.vehicle.pitch).toBeLessThanOrEqual(0.18);
      expect(result.vehicle.roll).toBeGreaterThan(0.02);
      expect(result.vehicle.roll).toBeLessThanOrEqual(0.16);

      physics.reset(initial);
      result = physics.step(initial);
      expect(result.vehicle.pitch).toBeLessThan(0.02);
    } finally {
      physics.dispose();
    }
  });

  it('casts wheel contacts on a fully generated race terrain', async () => {
    const generated = generateWorld('2013');
    const start = generated.track.sample(0.99);
    const ahead = generated.track.sample(0.001);
    const yaw = Math.atan2(-(ahead.x - start.x), -(ahead.z - start.z));
    const initial = createVehicleState({
      x: start.x,
      y: generated.terrain.sampleHeight(start.x, start.z),
      z: start.z,
    }, yaw);
    const physics = await VehiclePhysics.create(generated.terrain, initial);
    try {
      let result = physics.step(initial);
      for (let tick = 0; tick < 120; tick++) result = physics.step(result.vehicle);
      expect(result.groundedWheels).toBeGreaterThanOrEqual(2);
      expect(Number.isFinite(result.vehicle.position.y)).toBe(true);
      expect(Math.abs(result.vehicle.position.y - generated.terrain.sampleHeight(start.x, start.z))).toBeLessThan(0.5);
    } finally {
      physics.dispose();
    }
  });

  it('becomes airborne over a drop and regains four-wheel ground contact', async () => {
    const terrain = testTerrain((_x, z) => z >= 0 ? 1 : 0);
    const initial = createVehicleState({ x: 0, y: 1, z: 2 });
    const physics = await VehiclePhysics.create(terrain, initial);
    try {
      let result = physics.step(initial);
      for (let tick = 0; tick < 120; tick++) result = physics.step(result.vehicle);
      const overDrop = {
        ...result.vehicle,
        position: { ...result.vehicle.position, z: -2 },
      };
      result = physics.step(overDrop);
      expect(result.groundedWheels).toBe(0);
      expect(result.vehicle.position.y).toBeGreaterThan(0.5);

      for (let tick = 0; tick < 120; tick++) result = physics.step(result.vehicle);
      expect(result.groundedWheels).toBe(4);
      expect(result.vehicle.position.y).toBeLessThan(0.1);
    } finally {
      physics.dispose();
    }
  });

  it('lets the kinematic chassis push a dynamic scenery prop', async () => {
    const terrain = testTerrain(() => 0);
    const initial = createVehicleState({ x: 0, y: 0, z: 0 });
    const physics = await VehiclePhysics.create(terrain, initial);
    try {
      const prop = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.45, -1.4),
      );
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.2, 0.2), prop);
      const originalZ = prop.translation().z;
      for (let tick = 0; tick < 40; tick++) {
        physics.step({
          ...initial,
          position: { ...initial.position, z: -(tick + 1) * 0.015 },
        });
      }
      expect(prop.translation().z).toBeLessThan(originalZ - 0.05);
    } finally {
      physics.dispose();
    }
  });
});
