import * as THREE from 'three';
import { worldRandom } from '../../core/random/seededRandom';
import type { World } from '../world/terrain/generateWorld';
import { generateSceneryPlacements, type SceneryQuality } from '../world/scenery/sceneryPlacement';

interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WeatherOptions {
  readonly quality?: SceneryQuality;
  /** A light curtain around the chase camera. Off by default for the dusk scene. */
  readonly rain?: boolean;
  readonly fireflies?: boolean;
}

export interface WeatherEffects {
  readonly group: THREE.Group;
  update(carPosition: Position3, cameraPosition: Position3, elapsedSeconds: number): void;
  dispose(): void;
}

export interface FireflyLocation extends Position3 {
  readonly phase: number;
  readonly size: number;
}

const COUNTS: Record<SceneryQuality, Readonly<{ rain: number; fireflyClusters: number }>> = {
  low: { rain: 300, fireflyClusters: 8 },
  medium: { rain: 650, fireflyClusters: 16 },
  high: { rain: 1050, fireflyClusters: 25 },
};

const RAIN_VOLUME_HEIGHT = 17;
const RAIN_RADIUS = 22;
const FIREFLIES_PER_CLUSTER = 4;

function isNearCourse(world: World, x: number, z: number): boolean {
  const maximumDistanceSquared = 32 * 32;
  for (let index = 0; index < world.track.points.length; index += 4) {
    const point = world.track.points[index];
    const deltaX = point.x - x;
    const deltaZ = point.z - z;
    if (deltaX * deltaX + deltaZ * deltaZ <= maximumDistanceSquared) return true;
  }
  return false;
}

/** Fireflies gather near seeded birches, as emitters did in GamePlayView.cs. */
export function generateFireflyLocations(world: World, quality: SceneryQuality = 'medium'): readonly FireflyLocation[] {
  const clusterCount = COUNTS[quality].fireflyClusters;
  const birches = generateSceneryPlacements(world, quality).filter(
    (placement) => placement.kind === 'birch' && isNearCourse(world, placement.x, placement.z),
  );
  if (birches.length === 0) return [];

  const random = worldRandom(world.seed, 'weather:fireflies');
  const locations: FireflyLocation[] = [];
  const count = Math.min(clusterCount, birches.length);
  for (let cluster = 0; cluster < count; cluster += 1) {
    const treeIndex = Math.floor((cluster + random.nextFloat()) * birches.length / count);
    const tree = birches[treeIndex];
    for (let index = 0; index < FIREFLIES_PER_CLUSTER; index += 1) {
      const angle = random.nextFloat() * Math.PI * 2;
      const radius = 0.35 + random.nextFloat() * 1.45;
      const x = tree.x + Math.cos(angle) * radius;
      const z = tree.z + Math.sin(angle) * radius;
      if (world.terrain.sampleRoad(x, z) > 0.01) continue;
      locations.push({
        x,
        y: tree.y + 1.8 + random.nextFloat() * 2.7,
        z,
        phase: random.nextFloat() * Math.PI * 2,
        size: 0.8 + random.nextFloat() * 0.6,
      });
    }
  }
  return locations;
}

function createFireflies(locations: readonly FireflyLocation[]): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(locations.length * 3);
  const phases = new Float32Array(locations.length);
  const sizes = new Float32Array(locations.length);
  locations.forEach((location, index) => {
    positions.set([location.x, location.y, location.z], index * 3);
    phases[index] = location.phase;
    sizes[index] = location.size;
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      varying float vPulse;
      varying float vDistanceFade;
      void main() {
        vec3 drift = vec3(
          sin(uTime * 0.67 + aPhase) * 0.42,
          sin(uTime * 1.03 + aPhase * 1.7) * 0.27,
          cos(uTime * 0.59 + aPhase) * 0.42
        );
        vec4 viewPosition = modelViewMatrix * vec4(position + drift, 1.0);
        float distance = max(-viewPosition.z, 0.1);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aSize * 80.0 / distance, 1.0, 8.0);
        float pulse = sin(uTime * 1.5 + aPhase) * 0.5 + 0.5;
        vPulse = 0.2 + 0.8 * pulse * pulse;
        vDistanceFade = 1.0 - smoothstep(22.0, 85.0, distance);
      }
    `,
    fragmentShader: `
      varying float vPulse;
      varying float vDistanceFade;
      void main() {
        vec2 centered = gl_PointCoord * 2.0 - 1.0;
        float radius = length(centered);
        float glow = exp(-radius * radius * 9.0);
        float core = 1.0 - smoothstep(0.13, 0.35, radius);
        float alpha = (glow * 0.36 + core * 0.45) * vPulse * vDistanceFade;
        gl_FragColor = vec4(0.93, 0.83, 0.32, alpha);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Seeded dusk fireflies';
  points.frustumCulled = false;
  return points;
}

function createRain(world: World, count: number): THREE.LineSegments {
  const random = worldRandom(world.seed, 'weather:rain');
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 2 * 3);
  const heights = new Float32Array(count * 2);
  const speeds = new Float32Array(count * 2);
  const lengths = new Float32Array(count * 2);
  const tips = new Float32Array(count * 2);
  for (let drop = 0; drop < count; drop += 1) {
    const x = (random.nextFloat() * 2 - 1) * RAIN_RADIUS;
    const z = (random.nextFloat() * 2 - 1) * RAIN_RADIUS;
    const height = random.nextFloat() * RAIN_VOLUME_HEIGHT;
    const speed = 9 + random.nextFloat() * 6;
    const length = 0.27 + random.nextFloat() * 0.3;
    for (let tip = 0; tip < 2; tip += 1) {
      const index = drop * 2 + tip;
      positions.set([x, 0, z], index * 3);
      heights[index] = height;
      speeds[index] = speed;
      lengths[index] = length;
      tips[index] = tip;
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aLength', new THREE.BufferAttribute(lengths, 1));
  geometry.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uVolumeHeight: { value: RAIN_VOLUME_HEIGHT },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aHeight;
      attribute float aSpeed;
      attribute float aLength;
      attribute float aTip;
      uniform float uTime;
      uniform float uVolumeHeight;
      varying float vOpacity;
      void main() {
        float height = mod(aHeight - uTime * aSpeed, uVolumeHeight) - aTip * aLength;
        vec3 streak = vec3(
          position.x + height * 0.16,
          height,
          position.z + height * 0.12
        );
        gl_Position = projectionMatrix * modelViewMatrix * vec4(streak, 1.0);
        float horizontalDistance = length(position.xz);
        vOpacity = 0.34 * (1.0 - smoothstep(12.0, 22.0, horizontalDistance));
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      void main() {
        gl_FragColor = vec4(0.64, 0.76, 0.91, vOpacity);
      }
    `,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'Light rain around the chase camera';
  lines.frustumCulled = false;
  return lines;
}

/** GPU-animated visual weather; the vehicle simulation remains unaffected. */
export function createWeatherEffects(world: World, options: WeatherOptions = {}): WeatherEffects {
  const quality = options.quality ?? 'medium';
  const counts = COUNTS[quality];
  if (!counts) throw new RangeError(`Unknown weather quality: ${quality}`);

  const group = new THREE.Group();
  group.name = 'Dusk weather and fireflies';
  const fireflies = options.fireflies === false ? null : createFireflies(generateFireflyLocations(world, quality));
  const rain = options.rain ? createRain(world, counts.rain) : null;
  if (fireflies) group.add(fireflies);
  if (rain) group.add(rain);

  return {
    group,
    update(carPosition, cameraPosition, elapsedSeconds): void {
      if (fireflies) (fireflies.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsedSeconds;
      if (!rain) return;
      (rain.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsedSeconds;
      rain.position.set(
        (carPosition.x + cameraPosition.x) / 2,
        carPosition.y - 2,
        (carPosition.z + cameraPosition.z) / 2,
      );
    },
    dispose(): void {
      group.clear();
      for (const effect of [fireflies, rain]) {
        if (!effect) continue;
        effect.geometry.dispose();
        for (const material of Array.isArray(effect.material) ? effect.material : [effect.material]) {
          material.dispose();
        }
      }
    },
  };
}
