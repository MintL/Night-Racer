import * as THREE from 'three';
import { SeededRandom, type WorldSeed } from '../../../core/random/seededRandom';
import type { VehicleState } from '../../vehicle/vehicleState';

type DustVehicle = Pick<VehicleState, 'position' | 'yaw' | 'speed' | 'steeringAngle'>;

const MAX_PARTICLES = 256;
const MINIMUM_DUST_SPEED = 10; // Dust in GamePlayView.cs begins above 10 XNA units per step.
const MAXIMUM_CAR_SPEED = 50;
const REAR_WHEEL_OFFSET = 0.57;
const REAR_WHEEL_HALF_SPACING = 0.38;
const MAXIMUM_EMISSION_STEP = 0.06;

const VERTEX_SHADER = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  attribute float aRoad;
  uniform float uPixelRatio;
  varying float vLife;
  varying float vRoad;

  void main() {
    vLife = aLife;
    vRoad = aRoad;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float perspective = 2.0 + 82.0 / max(1.0, -viewPosition.z);
    gl_PointSize = aLife > 0.0
      ? clamp(aSize * perspective * uPixelRatio, 1.0, 30.0)
      : 1.0;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vLife;
  varying float vRoad;

  void main() {
    if (vLife <= 0.0) discard;
    float radius = length(gl_PointCoord * 2.0 - 1.0);
    float feather = 1.0 - smoothstep(0.16, 1.0, radius);
    float fadeIn = smoothstep(0.0, 0.16, 1.0 - vLife);
    float fadeOut = smoothstep(0.0, 0.46, vLife);
    float alpha = feather * fadeIn * fadeOut * 0.27;
    vec3 grassDust = vec3(0.47, 0.49, 0.43);
    vec3 roadDust = vec3(0.61, 0.53, 0.43);
    gl_FragColor = vec4(mix(grassDust, roadDust, vRoad), alpha);
  }
`;

/** A bounded, single-draw-call dust trail behind the driven wheels. */
export class DustTrail {
  readonly group = new THREE.Group();

  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly lifeFractions = new Float32Array(MAX_PARTICLES);
  private readonly remainingLives = new Float32Array(MAX_PARTICLES);
  private readonly lifetimes = new Float32Array(MAX_PARTICLES);
  private readonly sizes = new Float32Array(MAX_PARTICLES);
  private readonly initialSizes = new Float32Array(MAX_PARTICLES);
  private readonly roadValues = new Float32Array(MAX_PARTICLES);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  private readonly points: THREE.Points;
  private random: SeededRandom;
  private nextParticle = 0;
  private spawnSerial = 0;
  private emissionRemainder = 0;
  private previousPosition: VehicleState['position'] | null = null;

  constructor(seed: WorldSeed) {
    this.random = new SeededRandom(`${typeof seed}:${String(seed)}:dust`);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lifeFractions, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aRoad', new THREE.BufferAttribute(this.roadValues, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geometry, this.material);
    // Particle positions move beyond their initial bounding sphere every frame.
    // Drawing 256 or fewer points is cheaper than updating that sphere.
    this.points.frustumCulled = false;
    this.points.name = 'Dust points';
    this.group.name = 'Vehicle dust trail';
    this.group.add(this.points);
  }

  update(dt: number, vehicle: DustVehicle, roadWeight: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.advanceParticles(dt);

    const speed = Math.abs(vehicle.speed);
    if (speed <= MINIMUM_DUST_SPEED) {
      this.emissionRemainder = 0;
      this.previousPosition = { ...vehicle.position };
      this.flushAttributes();
      return;
    }

    const normalizedSpeed = Math.min(1, (speed - MINIMUM_DUST_SPEED) / (MAXIMUM_CAR_SPEED - MINIMUM_DUST_SPEED));
    const steering = Math.min(1, Math.abs(vehicle.steeringAngle) / 0.55);
    const surface = THREE.MathUtils.clamp(roadWeight, 0, 1);
    const emissionRate = (14 + normalizedSpeed * 54) * (0.62 + surface * 0.38) * (1 + steering * 0.4);
    const emissionTime = Math.min(dt, MAXIMUM_EMISSION_STEP);
    const requested = this.emissionRemainder + emissionRate * emissionTime;
    const spawnCount = Math.min(MAX_PARTICLES, Math.floor(requested));
    this.emissionRemainder = requested - spawnCount;

    // Interpolate the emitters along the car's movement, as ParticleEmitter.cs
    // did, so a fast car does not leave clumps at render-frame positions.
    const previous = dt <= 0.15 ? this.previousPosition ?? vehicle.position : vehicle.position;
    for (let index = 0; index < spawnCount; index += 1) {
      const amount = (index + 0.5) / spawnCount;
      const x = THREE.MathUtils.lerp(previous.x, vehicle.position.x, amount);
      const y = THREE.MathUtils.lerp(previous.y, vehicle.position.y, amount);
      const z = THREE.MathUtils.lerp(previous.z, vehicle.position.z, amount);
      this.spawn(x, y, z, vehicle.yaw, vehicle.speed, normalizedSpeed, steering, surface);
    }
    this.previousPosition = { ...vehicle.position };
    this.flushAttributes();
  }

  reset(seed: WorldSeed): void {
    this.random = new SeededRandom(`${typeof seed}:${String(seed)}:dust`);
    this.positions.fill(0);
    this.velocities.fill(0);
    this.lifeFractions.fill(0);
    this.remainingLives.fill(0);
    this.lifetimes.fill(0);
    this.sizes.fill(0);
    this.initialSizes.fill(0);
    this.roadValues.fill(0);
    this.nextParticle = 0;
    this.spawnSerial = 0;
    this.emissionRemainder = 0;
    this.previousPosition = null;
    this.flushAttributes();
  }

  dispose(): void {
    this.group.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }

  private advanceParticles(dt: number): void {
    const drag = Math.exp(-1.35 * dt);
    for (let index = 0; index < MAX_PARTICLES; index += 1) {
      if (this.remainingLives[index] <= 0) continue;
      const remaining = this.remainingLives[index] - dt;
      if (remaining <= 0) {
        this.remainingLives[index] = 0;
        this.lifeFractions[index] = 0;
        continue;
      }

      const coordinate = index * 3;
      this.positions[coordinate] += this.velocities[coordinate] * dt;
      this.positions[coordinate + 1] += this.velocities[coordinate + 1] * dt;
      this.positions[coordinate + 2] += this.velocities[coordinate + 2] * dt;
      this.velocities[coordinate] *= drag;
      this.velocities[coordinate + 2] *= drag;
      this.remainingLives[index] = remaining;
      const lifeFraction = remaining / this.lifetimes[index];
      this.lifeFractions[index] = lifeFraction;
      this.sizes[index] = this.initialSizes[index] * (1.7 - 0.7 * lifeFraction);
    }
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    yaw: number,
    signedSpeed: number,
    normalizedSpeed: number,
    steering: number,
    roadWeight: number,
  ): void {
    const index = this.nextParticle;
    this.nextParticle = (index + 1) % MAX_PARTICLES;
    const coordinate = index * 3;
    const wheelSide = this.spawnSerial++ % 2 === 0 ? -1 : 1;
    const travelDirection = signedSpeed >= 0 ? 1 : -1;
    const localX = wheelSide * REAR_WHEEL_HALF_SPACING;
    const localZ = travelDirection * REAR_WHEEL_OFFSET;
    const sine = Math.sin(yaw);
    const cosine = Math.cos(yaw);
    const sideJitter = (this.random.nextFloat() - 0.5) * (0.22 + steering * 0.2);
    const backDrift = (0.28 + normalizedSpeed * 0.5) * travelDirection;
    this.positions[coordinate] = x + localX * cosine + localZ * sine + sideJitter;
    this.positions[coordinate + 1] = y + 0.16 + this.random.nextFloat() * 0.1;
    this.positions[coordinate + 2] = z - localX * sine + localZ * cosine;
    this.velocities[coordinate] = sine * backDrift + sideJitter * 0.8;
    this.velocities[coordinate + 1] = 0.34 + this.random.nextFloat() * 0.44;
    this.velocities[coordinate + 2] = cosine * backDrift;
    this.lifetimes[index] = 0.48 + this.random.nextFloat() * 0.3;
    this.remainingLives[index] = this.lifetimes[index];
    this.lifeFractions[index] = 1;
    this.initialSizes[index] = 0.27 + this.random.nextFloat() * 0.18;
    this.sizes[index] = this.initialSizes[index];
    this.roadValues[index] = roadWeight;
  }

  private flushAttributes(): void {
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('aLife').needsUpdate = true;
    this.geometry.getAttribute('aSize').needsUpdate = true;
    this.geometry.getAttribute('aRoad').needsUpdate = true;
  }
}
