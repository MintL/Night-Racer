import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../../../core/assetUrl';
import type { World } from '../terrain/generateWorld';
import type { SceneryQuality } from './sceneryPlacement';
import { generateOriginalSceneryPlacements, type OriginalSceneryKind, type OriginalSceneryPlacement } from './originalSceneryPlacement';

const MODELS: readonly { kind: OriginalSceneryKind; variant: number; url: string }[] = [
  { kind: 'birch', variant: 0, url: assetUrl('assets/scenery/birch_01.glb') },
  { kind: 'birch', variant: 1, url: assetUrl('assets/scenery/birch_02.glb') },
  { kind: 'birch', variant: 2, url: assetUrl('assets/scenery/birch_03.glb') },
  { kind: 'birch', variant: 3, url: assetUrl('assets/scenery/birch_04.glb') },
  { kind: 'oak', variant: 0, url: assetUrl('assets/scenery/oak_tree.glb') },
  { kind: 'rock', variant: 0, url: assetUrl('assets/scenery/stone_01.glb') },
  { kind: 'rock', variant: 1, url: assetUrl('assets/scenery/stone_02.glb') },
];

function addInstances(
  group: THREE.Group,
  source: THREE.Group,
  placements: readonly OriginalSceneryPlacement[],
  kind: OriginalSceneryKind,
  variant: number,
  castShadow: boolean,
): void {
  const matching = placements.filter((placement) => placement.kind === kind && placement.variant === variant);
  if (matching.length === 0) {
    disposeOriginalScenery(source);
    return;
  }

  source.updateMatrixWorld(true);
  const object = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const instances = new THREE.InstancedMesh(child.geometry, child.material, matching.length);
    instances.name = `Original ${kind} ${variant + 1}: ${child.name}`;
    instances.castShadow = castShadow;
    instances.receiveShadow = true;
    instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    matching.forEach((placement, index) => {
      object.position.set(placement.x, placement.y, placement.z);
      object.rotation.set(0, placement.yaw, 0);
      object.scale.setScalar(placement.scale);
      object.updateMatrix();
      matrix.multiplyMatrices(object.matrix, child.matrixWorld);
      instances.setMatrixAt(index, matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    group.add(instances);
  });
}

/** Load textured legacy foliage after the playable world is already on screen. */
export async function loadOriginalScenery(world: World, quality: SceneryQuality = 'medium'): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const loaded = await Promise.all(MODELS.map(async (model) => ({
    ...model,
    source: (await loader.loadAsync(model.url)).scene,
  })));
  const placements = generateOriginalSceneryPlacements(world, quality);
  const group = new THREE.Group();
  group.name = 'Original birches, oaks, and stones';
  group.userData.placementCount = placements.length;
  const castShadow = quality !== 'low';
  for (const model of loaded) {
    addInstances(group, model.source, placements, model.kind, model.variant, castShadow);
  }
  return group;
}

/** Release model buffers and embedded textures when a race world is replaced. */
export function disposeOriginalScenery(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      for (const texture of [
        material.map, material.normalMap, material.roughnessMap, material.metalnessMap,
        material.aoMap, material.alphaMap, material.emissiveMap,
      ]) {
        if (texture) textures.add(texture);
      }
    }
  });
  group.clear();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}
