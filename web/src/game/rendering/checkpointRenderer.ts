import * as THREE from 'three';
import type { CheckpointGate } from '../race/checkpointGates';
import type { Terrain } from '../world/terrain/generateWorld';
import type { Track } from '../world/track/track';

const ACTIVE_COLOR = new THREE.Color('#ffbe72');
const INACTIVE_COLOR = new THREE.Color('#8dc5bc');

export interface CheckpointVisuals {
  readonly group: THREE.Group;
  setActive(index: number): void;
}

function makeBeam(start: THREE.Vector3, end: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, direction.length(), 7), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function createCheckpointVisuals(gates: readonly CheckpointGate[], terrain: Terrain): CheckpointVisuals {
  const group = new THREE.Group();
  const materials: THREE.MeshStandardMaterial[] = [];

  for (const gate of gates) {
    const material = new THREE.MeshStandardMaterial({
      color: INACTIVE_COLOR,
      emissive: INACTIVE_COLOR,
      emissiveIntensity: 1.2,
      roughness: 0.35,
      metalness: 0.4,
    });
    materials.push(material);
    const sideX = -gate.heading.z;
    const sideZ = gate.heading.x;
    const endDistance = gate.halfWidth + 0.8;
    const ends = [-1, 1].map((sign) => {
      const x = gate.position.x + sign * sideX * endDistance;
      const z = gate.position.z + sign * sideZ * endDistance;
      return new THREE.Vector3(x, terrain.sampleHeight(x, z), z);
    });
    const topHeight = Math.max(ends[0].y, ends[1].y) + 3.1;
    for (const end of ends) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, topHeight - end.y, 8), material);
      post.position.set(end.x, (topHeight + end.y) / 2, end.z);
      post.castShadow = true;
      group.add(post);

      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 0.08, 12),
        new THREE.MeshStandardMaterial({ color: '#273a3a', roughness: 0.7, metalness: 0.35 }),
      );
      foot.position.set(end.x, end.y + 0.04, end.z);
      group.add(foot);
    }

    const leftTop = new THREE.Vector3(ends[0].x, topHeight, ends[0].z);
    const rightTop = new THREE.Vector3(ends[1].x, topHeight, ends[1].z);
    group.add(makeBeam(leftTop, rightTop, material));

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(gate.halfWidth * 2, 0.025, 0.09),
      new THREE.MeshBasicMaterial({ color: '#e6f1db', transparent: true, opacity: 0.65 }),
    );
    strip.position.set(gate.position.x, terrain.sampleHeight(gate.position.x, gate.position.z) + 0.075, gate.position.z);
    strip.rotation.y = -Math.atan2(sideZ, sideX);
    group.add(strip);
  }

  return {
    group,
    setActive(index: number): void {
      materials.forEach((material, gateIndex) => {
        const active = index === gateIndex;
        const nextColor = active ? ACTIVE_COLOR : INACTIVE_COLOR;
        material.color.copy(nextColor);
        material.emissive.copy(nextColor);
        material.emissiveIntensity = active ? 2.5 : 0.55;
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
