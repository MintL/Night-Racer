import * as THREE from 'three';
import type { World } from '../terrain/generateWorld';
import {
  generateSceneryPlacements,
  isProceduralFallbackPlacement,
  type SceneryPlacement,
  type SceneryQuality,
} from './sceneryPlacement';

const BIRCH_LEAVES = [0x819b64, 0xa0ad68, 0xb2a55f, 0x6d906d];
const OAK_LEAVES = [0x486e4f, 0x5c8155, 0x779460, 0x8c985b];
const ROCK_COLORS = [0x7b817b, 0x8a867c, 0x697974, 0x777568];
const WHITE = new THREE.Color(0xffffff);

function colorFromPalette(palette: readonly number[], variation: number): THREE.Color {
  return new THREE.Color(palette[Math.min(palette.length - 1, Math.floor(variation * palette.length))]);
}

function createInstances(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  castShadow: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function finishInstances(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function composeInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  position: Readonly<{ x: number; y: number; z: number }>,
  scale: Readonly<{ x: number; y: number; z: number }>,
  yaw: number,
  color: THREE.Color,
  object: THREE.Object3D,
): void {
  object.position.set(position.x, position.y, position.z);
  object.rotation.set(0, yaw, 0);
  object.scale.set(scale.x, scale.y, scale.z);
  object.updateMatrix();
  mesh.setMatrixAt(index, object.matrix);
  mesh.setColorAt(index, color);
}

function addTrees(
  group: THREE.Group,
  placements: readonly SceneryPlacement[],
  kind: 'birch' | 'oak',
  trunkGeometry: THREE.BufferGeometry,
  crownGeometry: THREE.BufferGeometry,
  castShadow: boolean,
): void {
  if (placements.length === 0) return;
  const isBirch = kind === 'birch';
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 1, flatShading: true });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.95, flatShading: true });
  const trunks = createInstances(trunkGeometry, trunkMaterial, placements.length, castShadow);
  const crowns = createInstances(crownGeometry, crownMaterial, placements.length * 2, castShadow);
  trunks.name = `${kind} trunks`;
  crowns.name = `${kind} crowns`;
  const object = new THREE.Object3D();

  placements.forEach((placement, index) => {
    const size = placement.scale;
    const trunkHeight = (isBirch ? 3.1 : 2.5) * size;
    const trunkRadius = (isBirch ? 0.105 : 0.19) * size;
    const trunkColor = isBirch
      ? new THREE.Color(0xd7d4c4).lerp(new THREE.Color(0xaaa99d), placement.colorVariation * 0.42)
      : new THREE.Color(0x5a4c3d).lerp(new THREE.Color(0x80705a), placement.colorVariation * 0.65);
    composeInstance(
      trunks,
      index,
      { x: placement.x, y: placement.y + trunkHeight / 2, z: placement.z },
      { x: trunkRadius, y: trunkHeight, z: trunkRadius },
      placement.yaw,
      trunkColor,
      object,
    );

    const leafColor = colorFromPalette(isBirch ? BIRCH_LEAVES : OAK_LEAVES, placement.colorVariation);
    const lobeSpread = (isBirch ? 0.33 : 0.55) * size;
    const lobeDirection = placement.yaw + placement.shapeVariation * Math.PI;
    const lobeX = Math.cos(lobeDirection) * lobeSpread;
    const lobeZ = Math.sin(lobeDirection) * lobeSpread;
    const firstRadius = (isBirch ? 0.91 : 1.37) * size;
    composeInstance(
      crowns,
      index * 2,
      { x: placement.x + lobeX, y: placement.y + trunkHeight + (isBirch ? 0.36 : 0.46) * size, z: placement.z + lobeZ },
      { x: firstRadius, y: firstRadius * (isBirch ? 1.2 : 0.83), z: firstRadius * (isBirch ? 0.88 : 1.02) },
      placement.yaw,
      leafColor,
      object,
    );
    const secondRadius = firstRadius * (isBirch ? 0.78 : 0.82);
    composeInstance(
      crowns,
      index * 2 + 1,
      { x: placement.x - lobeX, y: placement.y + trunkHeight + (isBirch ? 1.25 : 1.12) * size, z: placement.z - lobeZ },
      { x: secondRadius, y: secondRadius * (isBirch ? 1.24 : 0.86), z: secondRadius },
      placement.yaw + 1.2,
      leafColor.clone().multiplyScalar(1.08),
      object,
    );
  });

  finishInstances(trunks);
  finishInstances(crowns);
  group.add(trunks, crowns);
}

function addRocks(
  group: THREE.Group,
  placements: readonly SceneryPlacement[],
  rockGeometry: THREE.BufferGeometry,
  castShadow: boolean,
): void {
  if (placements.length === 0) return;
  const material = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 1, flatShading: true });
  const rocks = createInstances(rockGeometry, material, placements.length, castShadow);
  rocks.name = 'rocks';
  const object = new THREE.Object3D();

  placements.forEach((placement, index) => {
    const size = placement.scale;
    composeInstance(
      rocks,
      index,
      { x: placement.x, y: placement.y + 0.21 * size, z: placement.z },
      { x: size * (0.76 + placement.shapeVariation * 0.56), y: size * 0.56, z: size * 0.82 },
      placement.yaw,
      colorFromPalette(ROCK_COLORS, placement.colorVariation),
      object,
    );
  });

  finishInstances(rocks);
  group.add(rocks);
}

/** Show a sparse seeded fallback until the original trees and stones finish loading. */
export function createScenery(world: World, quality: SceneryQuality = 'medium'): THREE.Group {
  const placements = generateSceneryPlacements(world, quality).filter(isProceduralFallbackPlacement);
  const birches = placements.filter((placement) => placement.kind === 'birch');
  const oaks = placements.filter((placement) => placement.kind === 'oak');
  const rocks = placements.filter((placement) => placement.kind === 'rock');
  const group = new THREE.Group();
  group.name = 'Seeded forest and rocks';
  group.userData.placementCount = placements.length;

  const trunkGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 7, 1);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const castShadow = quality !== 'low';
  addTrees(group, birches, 'birch', trunkGeometry, crownGeometry, castShadow);
  addTrees(group, oaks, 'oak', trunkGeometry, crownGeometry, castShadow);
  addRocks(group, rocks, rockGeometry, castShadow);
  return group;
}

/** Call when replacing a race world to release the group's GPU resources. */
export function disposeScenery(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  group.clear();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
