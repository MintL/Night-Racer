import * as THREE from 'three';
import type { CheckpointGate } from '../race/checkpointGates';
import type { Terrain } from '../world/terrain/generateWorld';
import type { Track } from '../world/track/track';

// GamePlayView.cs places nine FireObjects across each checkpoint. The middle
// flame is 250 XNA units above the road; the outer flames form a low arch.
const FLAMES_PER_SIDE = 4;
const FLAME_SPACING = 1;
const ARCH_HEIGHT = 6.5;
const ARCH_DROP = 4;

export interface CheckpointVisuals {
  readonly group: THREE.Group;
  setActive(index: number): void;
}

function makeFireBillboard(
  geometry: THREE.PlaneGeometry,
  material: THREE.MeshBasicMaterial,
  basePosition: THREE.Vector3,
  width: number,
  height: number,
  phase: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(basePosition);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    const time = performance.now() * 0.001;
    const flicker = Math.sin(time * 8 + phase) * 0.07 + Math.sin(time * 13 + phase * 2) * 0.04;
    mesh.position.y = basePosition.y + Math.sin(time * 2.6 + phase) * 0.13;
    mesh.scale.set(width * (1 + flicker), height * (1 + flicker), 1);
    mesh.quaternion.copy(camera.quaternion);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

export function createCheckpointVisuals(gates: readonly CheckpointGate[], terrain: Terrain): CheckpointVisuals {
  const group = new THREE.Group();
  const flameTexture = new THREE.TextureLoader().load('/assets/particles/smoke_2.png');
  const smokeTexture = new THREE.TextureLoader().load('/assets/particles/smoke.png');
  const billboardGeometry = new THREE.PlaneGeometry(1, 1);
  const flameMaterials = ['#ff3b1f', '#ff8a24', '#ffd34f'].map((flameColor) =>
    new THREE.MeshBasicMaterial({
      map: flameTexture,
      color: flameColor,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  const smokeMaterial = new THREE.MeshBasicMaterial({
    map: smokeTexture,
    color: '#393e43',
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lights: THREE.PointLight[] = [];

  for (let gateIndex = 0; gateIndex < gates.length; gateIndex += 1) {
    const gate = gates[gateIndex];
    const sideX = -gate.heading.z;
    const sideZ = gate.heading.x;
    const roadHeight = terrain.sampleHeight(gate.position.x, gate.position.z);

    for (let offset = -FLAMES_PER_SIDE; offset <= FLAMES_PER_SIDE; offset += 1) {
      const x = gate.position.x + sideX * offset * FLAME_SPACING;
      const z = gate.position.z + sideZ * offset * FLAME_SPACING;
      const y = roadHeight - ARCH_DROP + ARCH_HEIGHT * Math.cos(offset / (FLAMES_PER_SIDE + 1));
      for (let layer = 0; layer < flameMaterials.length; layer += 1) {
        const phase = gateIndex * 1.7 + offset * 0.81 + layer * 2.1;
        const base = new THREE.Vector3(x, y + layer * 0.16, z);
        group.add(makeFireBillboard(
          billboardGeometry,
          flameMaterials[layer],
          base,
          0.54 + layer * 0.08,
          0.62 + layer * 0.12,
          phase,
        ));
      }
      const smokeBase = new THREE.Vector3(x, y + 0.48, z);
      group.add(makeFireBillboard(
        billboardGeometry,
        smokeMaterial,
        smokeBase,
        0.7,
        0.82,
        gateIndex * 1.3 + offset * 0.69,
      ));
    }

    // The original used a warm CheckpointLight plus a light for each flame.
    // One light per arch keeps that color without dozens of dynamic lights.
    const light = new THREE.PointLight('#ff5525', 3, 9, 2);
    light.position.set(gate.position.x, roadHeight + 2.5, gate.position.z);
    lights.push(light);
    group.add(light);
  }

  return {
    group,
    setActive(index: number): void {
      lights.forEach((light, gateIndex) => {
        light.intensity = gateIndex === index ? 7 : 3;
      });
    },
  };
}

/** Short reflector posts carry the eye through bends without turning the road into UI. */
export function createRoadsideReflectors(track: Track, terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  const postGeometry = new THREE.BoxGeometry(0.13, 0.55, 0.13);
  const capGeometry = new THREE.BoxGeometry(0.15, 0.12, 0.15);
  const count = Math.ceil(track.points.length / 10) * 2;
  const posts = new THREE.InstancedMesh(postGeometry, new THREE.MeshStandardMaterial({ color: '#d7d6c8', roughness: 0.75 }), count);
  const caps = new THREE.InstancedMesh(capGeometry, new THREE.MeshStandardMaterial({
    color: '#ffd18c', emissive: '#ff9b4e', emissiveIntensity: 1.3,
  }), count);
  const transform = new THREE.Object3D();
  let instance = 0;

  for (let pointIndex = 0; pointIndex < track.points.length; pointIndex += 10) {
    const point = track.points[pointIndex];
    for (const sign of [-1, 1]) {
      const x = point.x + point.side.x * sign * 6.9;
      const z = point.z + point.side.z * sign * 6.9;
      const y = terrain.sampleHeight(x, z);
      transform.position.set(x, y + 0.275, z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      posts.setMatrixAt(instance, transform.matrix);
      transform.position.y = y + 0.5;
      transform.updateMatrix();
      caps.setMatrixAt(instance, transform.matrix);
      instance += 1;
    }
  }
  posts.count = instance;
  caps.count = instance;
  posts.castShadow = true;
  group.add(posts, caps);
  return group;
}
