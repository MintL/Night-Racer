import RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleState } from '../vehicleState';
import { VEHICLE_STEP_SECONDS } from '../vehicleController';

/** The generated terrain data needed by the Rapier heightfield. */
export interface PhysicsTerrain {
  readonly size: number;
  readonly cellSize: number;
  readonly originX: number;
  readonly originZ: number;
  /** Row-major: heights[z * size + x]. */
  readonly heights: Float32Array;
  sampleHeight(x: number, z: number): number;
}

export type WheelName = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export interface WheelContact {
  readonly wheel: WheelName;
  readonly grounded: boolean;
  readonly groundHeight: number | null;
  readonly suspensionLength: number;
  readonly compression: number;
  readonly normal: Readonly<{ x: number; y: number; z: number }> | null;
}

export interface PhysicsVehicleStep {
  readonly vehicle: VehicleState;
  readonly contacts: readonly WheelContact[];
  readonly groundedWheels: number;
}

// These are web-unit chassis measurements from the Porsche/fallback mesh.
// The original handling's X/Z speed and turn are still calculated separately.
export const SUSPENSION_TUNING = {
  gravity: 22,
  wheelRadius: 0.14,
  wheelMountHeight: 0.28,
  frontAxleZ: -0.57,
  rearAxleZ: 0.57,
  leftWheelX: -0.38,
  rightWheelX: 0.38,
  restLength: 0.16,
  travel: 0.24,
  springStiffness: 220,
  springDamping: 13,
  maximumWheelForce: 60,
  maximumVerticalSpeed: 12,
  attitudeStiffness: 75,
  attitudeDamping: 18,
  maximumPitch: 0.18,
  maximumRoll: 0.16,
  chassisHalfWidth: 0.42,
  chassisHalfHeight: 0.16,
  chassisHalfLength: 0.88,
  chassisColliderHeight: 0.37,
} as const;

const WHEELS = [
  { wheel: 'frontLeft', x: SUSPENSION_TUNING.leftWheelX, z: SUSPENSION_TUNING.frontAxleZ },
  { wheel: 'frontRight', x: SUSPENSION_TUNING.rightWheelX, z: SUSPENSION_TUNING.frontAxleZ },
  { wheel: 'rearLeft', x: SUSPENSION_TUNING.leftWheelX, z: SUSPENSION_TUNING.rearAxleZ },
  { wheel: 'rearRight', x: SUSPENSION_TUNING.rightWheelX, z: SUSPENSION_TUNING.rearAxleZ },
] as const;

// Rapier heightfield casts can miss exactly on a grid edge. This offset is
// much smaller than a terrain cell and keeps four wheel queries reliable.
const RAY_GRID_EDGE_OFFSET = 0.0001;

interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/**
 * Rapier terrain and wheel queries with a fixed-step, arcade-compatible
 * suspension. The chassis is kinematic so steering stays with stepVehicle;
 * its collider can still push future dynamic scenery props.
 */
export class VehiclePhysics {
  readonly world: RAPIER.World;
  private readonly terrain: PhysicsTerrain;
  private readonly chassis: RAPIER.RigidBody;
  private chassisY: number;
  private verticalSpeed = 0;
  private pitch = 0;
  private roll = 0;
  private pitchSpeed = 0;
  private rollSpeed = 0;
  private disposed = false;

  private constructor(terrain: PhysicsTerrain, initial: VehicleState) {
    this.terrain = terrain;
    this.chassisY = initial.position.y;
    this.world = new RAPIER.World({ x: 0, y: -SUSPENSION_TUNING.gravity, z: 0 });
    this.world.timestep = VEHICLE_STEP_SECONDS;

    // Rapier stores heightfield samples by X column then Z row. The terrain
    // renderer stores them by Z row then X column, so transpose once here.
    const colliderHeights = new Float32Array(terrain.heights.length);
    for (let x = 0; x < terrain.size; x++) {
      for (let z = 0; z < terrain.size; z++) {
        colliderHeights[x * terrain.size + z] = terrain.heights[z * terrain.size + x];
      }
    }
    const extent = (terrain.size - 1) * terrain.cellSize;
    const centerX = terrain.originX + extent / 2;
    const centerZ = terrain.originZ + extent / 2;
    this.world.createCollider(
      RAPIER.ColliderDesc.heightfield(
        terrain.size - 1,
        terrain.size - 1,
        colliderHeights,
        { x: extent, y: 1, z: extent },
      ).setTranslation(centerX, 0, centerZ),
    );

    this.chassis = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        initial.position.x,
        initial.position.y,
        initial.position.z,
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        SUSPENSION_TUNING.chassisHalfWidth,
        SUSPENSION_TUNING.chassisHalfHeight,
        SUSPENSION_TUNING.chassisHalfLength,
      ).setTranslation(0, SUSPENSION_TUNING.chassisColliderHeight, 0),
      this.chassis,
    );
    this.chassis.setRotation(attitudeQuaternion(initial.yaw, 0, 0), true);

    // Scene queries become current after Rapier's first world step.
    this.world.step();
  }

  static async create(terrain: PhysicsTerrain, initial: VehicleState): Promise<VehiclePhysics> {
    if (terrain.size < 2 || terrain.heights.length !== terrain.size * terrain.size) {
      throw new RangeError('Physics terrain dimensions do not match its height data');
    }
    await RAPIER.init();
    return new VehiclePhysics(terrain, initial);
  }

  /** Advance one 60 Hz step after the original X/Z vehicle controller. */
  step(arcadeVehicle: VehicleState): PhysicsVehicleStep {
    this.assertAlive();
    const contacts = WHEELS.map((wheel) => this.castWheel(arcadeVehicle, wheel));
    const groundedWheels = contacts.filter((contact) => contact.grounded).length;

    let upwardForce = 0;
    for (const contact of contacts) {
      if (!contact.grounded) continue;
      const force = SUSPENSION_TUNING.springStiffness * contact.compression -
        SUSPENSION_TUNING.springDamping * this.verticalSpeed;
      upwardForce += clamp(force, 0, SUSPENSION_TUNING.maximumWheelForce);
    }
    this.verticalSpeed += (upwardForce - SUSPENSION_TUNING.gravity) * VEHICLE_STEP_SECONDS;
    this.verticalSpeed = clamp(
      this.verticalSpeed,
      -SUSPENSION_TUNING.maximumVerticalSpeed,
      SUSPENSION_TUNING.maximumVerticalSpeed,
    );
    this.chassisY += this.verticalSpeed * VEHICLE_STEP_SECONDS;

    // A deep impact can put all four ray origins below the surface. Keep the
    // chassis within a small tolerance so the next tick can regain contacts.
    if (this.isInsideTerrain(arcadeVehicle.position.x, arcadeVehicle.position.z)) {
      const minimumY = this.terrain.sampleHeight(arcadeVehicle.position.x, arcadeVehicle.position.z) - 0.08;
      if (this.chassisY < minimumY) {
        this.chassisY = minimumY;
        this.verticalSpeed = Math.max(0, this.verticalSpeed);
      }
    }

    const front = averageHeight(contacts[0], contacts[1]);
    const rear = averageHeight(contacts[2], contacts[3]);
    const left = averageHeight(contacts[0], contacts[2]);
    const right = averageHeight(contacts[1], contacts[3]);
    const wheelbase = SUSPENSION_TUNING.rearAxleZ - SUSPENSION_TUNING.frontAxleZ;
    const trackWidth = SUSPENSION_TUNING.rightWheelX - SUSPENSION_TUNING.leftWheelX;
    const targetPitch = front === null || rear === null
      ? 0
      : clamp(Math.atan2(front - rear, wheelbase), -SUSPENSION_TUNING.maximumPitch, SUSPENSION_TUNING.maximumPitch);
    const targetRoll = left === null || right === null
      ? 0
      : clamp(Math.atan2(right - left, trackWidth), -SUSPENSION_TUNING.maximumRoll, SUSPENSION_TUNING.maximumRoll);
    [this.pitch, this.pitchSpeed] = settleAttitude(this.pitch, this.pitchSpeed, targetPitch);
    [this.roll, this.rollSpeed] = settleAttitude(this.roll, this.rollSpeed, targetRoll);

    this.chassis.setNextKinematicTranslation({
      x: arcadeVehicle.position.x,
      y: this.chassisY,
      z: arcadeVehicle.position.z,
    });
    this.chassis.setNextKinematicRotation(attitudeQuaternion(arcadeVehicle.yaw, this.pitch, this.roll));
    this.world.step();

    return {
      vehicle: {
        ...arcadeVehicle,
        position: { ...arcadeVehicle.position, y: this.chassisY },
        pitch: this.pitch,
        roll: this.roll,
      },
      contacts,
      groundedWheels,
    };
  }

  reset(vehicle: VehicleState): void {
    this.assertAlive();
    this.chassisY = vehicle.position.y;
    this.verticalSpeed = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchSpeed = 0;
    this.rollSpeed = 0;
    const translation = { ...vehicle.position };
    const rotation = attitudeQuaternion(vehicle.yaw, 0, 0);
    this.chassis.setTranslation(translation, true);
    this.chassis.setRotation(rotation, true);
    this.chassis.setNextKinematicTranslation(translation);
    this.chassis.setNextKinematicRotation(rotation);
    this.world.step();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }

  private castWheel(arcadeVehicle: VehicleState, wheel: typeof WHEELS[number]): WheelContact {
    const rotation = attitudeQuaternion(arcadeVehicle.yaw, this.pitch, this.roll);
    const offset = rotateVector(rotation, {
      x: wheel.x,
      y: SUSPENSION_TUNING.wheelMountHeight,
      z: wheel.z,
    });
    const origin = {
      x: arcadeVehicle.position.x + offset.x,
      y: this.chassisY + offset.y,
      z: arcadeVehicle.position.z + offset.z,
    };
    const rayLength = SUSPENSION_TUNING.wheelRadius +
      SUSPENSION_TUNING.restLength + SUSPENSION_TUNING.travel;
    const ray = new RAPIER.Ray({
      x: origin.x + RAY_GRID_EDGE_OFFSET,
      y: origin.y,
      z: origin.z + RAY_GRID_EDGE_OFFSET,
    }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(
      ray,
      rayLength,
      false,
      undefined,
      undefined,
      undefined,
      this.chassis,
    );

    let groundHeight: number | null = null;
    let distance = rayLength;
    let normal: WheelContact['normal'] = null;
    if (hit && hit.normal.y > 0.2) {
      distance = hit.timeOfImpact;
      groundHeight = origin.y - distance;
      normal = { ...hit.normal };
    } else {
      const terrainHeight = this.terrain.sampleHeight(origin.x, origin.z);
      if (this.isInsideTerrain(origin.x, origin.z) && origin.y < terrainHeight) {
        // A steep bump may move the wheel mount beneath the heightfield before
        // a downward ray can hit it; this contact helps the spring recover.
        distance = origin.y - terrainHeight;
        groundHeight = terrainHeight;
        normal = { x: 0, y: 1, z: 0 };
      }
    }

    const grounded = groundHeight !== null;
    const suspensionLength = grounded
      ? Math.max(0, distance - SUSPENSION_TUNING.wheelRadius)
      : SUSPENSION_TUNING.restLength + SUSPENSION_TUNING.travel;
    const compression = grounded
      ? clamp(SUSPENSION_TUNING.restLength - (distance - SUSPENSION_TUNING.wheelRadius), 0,
        SUSPENSION_TUNING.restLength + SUSPENSION_TUNING.travel)
      : 0;
    return { wheel: wheel.wheel, grounded, groundHeight, suspensionLength, compression, normal };
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Vehicle physics has been disposed');
  }

  private isInsideTerrain(x: number, z: number): boolean {
    const extent = (this.terrain.size - 1) * this.terrain.cellSize;
    return x >= this.terrain.originX && x <= this.terrain.originX + extent &&
      z >= this.terrain.originZ && z <= this.terrain.originZ + extent;
  }
}

function averageHeight(first: WheelContact, second: WheelContact): number | null {
  if (first.groundHeight === null || second.groundHeight === null) return null;
  return (first.groundHeight + second.groundHeight) / 2;
}

function settleAttitude(value: number, velocity: number, target: number): [number, number] {
  const acceleration = (target - value) * SUSPENSION_TUNING.attitudeStiffness -
    velocity * SUSPENSION_TUNING.attitudeDamping;
  const nextVelocity = velocity + acceleration * VEHICLE_STEP_SECONDS;
  return [value + nextVelocity * VEHICLE_STEP_SECONDS, nextVelocity];
}

function attitudeQuaternion(yaw: number, pitch: number, roll: number): Quaternion {
  const halfYaw = yaw / 2;
  const halfPitch = pitch / 2;
  const halfRoll = roll / 2;
  const yawRotation = { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) };
  const pitchRotation = { x: Math.sin(halfPitch), y: 0, z: 0, w: Math.cos(halfPitch) };
  const rollRotation = { x: 0, y: 0, z: Math.sin(halfRoll), w: Math.cos(halfRoll) };
  return multiplyQuaternions(multiplyQuaternions(yawRotation, pitchRotation), rollRotation);
}

function multiplyQuaternions(first: Quaternion, second: Quaternion): Quaternion {
  return {
    x: first.w * second.x + first.x * second.w + first.y * second.z - first.z * second.y,
    y: first.w * second.y - first.x * second.z + first.y * second.w + first.z * second.x,
    z: first.w * second.z + first.x * second.y - first.y * second.x + first.z * second.w,
    w: first.w * second.w - first.x * second.x - first.y * second.y - first.z * second.z,
  };
}

function rotateVector(rotation: Quaternion, vector: Readonly<{ x: number; y: number; z: number }>) {
  const axisDot = rotation.x * vector.x + rotation.y * vector.y + rotation.z * vector.z;
  const axisLengthSquared = rotation.x ** 2 + rotation.y ** 2 + rotation.z ** 2;
  const crossX = rotation.y * vector.z - rotation.z * vector.y;
  const crossY = rotation.z * vector.x - rotation.x * vector.z;
  const crossZ = rotation.x * vector.y - rotation.y * vector.x;
  const scale = rotation.w ** 2 - axisLengthSquared;
  return {
    x: scale * vector.x + 2 * axisDot * rotation.x + 2 * rotation.w * crossX,
    y: scale * vector.y + 2 * axisDot * rotation.y + 2 * rotation.w * crossY,
    z: scale * vector.z + 2 * axisDot * rotation.z + 2 * rotation.w * crossZ,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
