import * as THREE from 'three';
import type { Terrain } from '../world/terrain/generateWorld';
import type { Track } from '../world/track/track';

const ROAD_HALF_WIDTH = 7 * 0.75;
const GRASS = new THREE.Color('#456b48');
const DEEP_GRASS = new THREE.Color('#2f5143');
const ROCK = new THREE.Color('#727774');
const SNOW = new THREE.Color('#c9c8bd');
const DIRT = new THREE.Color('#8e7d67');
const color = new THREE.Color();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function terrainColor(height: number, slope: number, road: number, x: number, z: number): THREE.Color {
  const variation = Math.sin(x * 0.37 + z * 0.19) * Math.sin(z * 0.59 - x * 0.14);
  color.copy(GRASS).lerp(DEEP_GRASS, clamp01(0.23 + variation * 0.2));
  color.lerp(ROCK, clamp01((height - 8) / 15) * 0.55 + clamp01((slope - 0.3) * 1.8));
  color.lerp(SNOW, clamp01((height - 22) / 9) * 0.75);
  color.lerp(DIRT, clamp01(road * 1.15));
  return color;
}

/** Render the original heightmap at a selectable mesh density. Physics always uses full resolution. */
export function createTerrainMesh(terrain: Terrain, gridStep = 1): THREE.Mesh {
  if (!Number.isInteger(gridStep) || gridStep < 1 || (terrain.size - 1) % gridStep !== 0) {
    throw new RangeError('Terrain grid step must divide the map edge.');
  }
  const side = (terrain.size - 1) / gridStep + 1;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const indices = new Uint32Array((side - 1) * (side - 1) * 6);

  for (let row = 0; row < side; row += 1) {
    const gridZ = row * gridStep;
    const z = terrain.originZ + gridZ * terrain.cellSize;
    for (let column = 0; column < side; column += 1) {
      const gridX = column * gridStep;
      const x = terrain.originX + gridX * terrain.cellSize;
      const source = gridZ * terrain.size + gridX;
      const destination = (row * side + column) * 3;
      const height = terrain.heights[source];
      const roadWeight = terrain.roadWeights[source];
      const left = terrain.heights[gridZ * terrain.size + Math.max(0, gridX - 1)];
      const right = terrain.heights[gridZ * terrain.size + Math.min(terrain.size - 1, gridX + 1)];
      const near = terrain.heights[Math.max(0, gridZ - 1) * terrain.size + gridX];
      const far = terrain.heights[Math.min(terrain.size - 1, gridZ + 1) * terrain.size + gridX];
      const slope = Math.hypot(right - left, far - near) / (2 * terrain.cellSize);
      const shade = terrainColor(height, slope, roadWeight, x, z);
      // The ribbon interpolates along the spline while the terrain triangulates
      // a grid. Recess the covered ground slightly to prevent z-fighting and
      // grass triangles from piercing the road on bends.
      positions.set([x, height - 0.28 * clamp01(roadWeight * 2), z], destination);
      colors.set([shade.r, shade.g, shade.b], destination);
    }
  }

  let index = 0;
  for (let row = 0; row < side - 1; row += 1) {
    for (let column = 0; column < side - 1; column += 1) {
      const topLeft = row * side + column;
      const bottomLeft = topLeft + side;
      indices.set([
        topLeft, bottomLeft, topLeft + 1,
        topLeft + 1, bottomLeft, bottomLeft + 1,
      ], index);
      index += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
  }));
  mesh.receiveShadow = true;
  return mesh;
}

/** A continuous textured ribbon makes the route readable at driving speed. */
export function createRoadMesh(track: Track, terrain: Terrain): THREE.Mesh {
  const count = track.points.length;
  const positions = new Float32Array((count + 1) * 2 * 3);
  const uv = new Float32Array((count + 1) * 2 * 2);
  const indices = new Uint16Array(count * 6);

  for (let index = 0; index <= count; index += 1) {
    const point = track.points[index % count];
    const distance = index === count ? track.length : point.distanceFromStart;
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const sign = sideIndex === 0 ? -1 : 1;
      const x = point.x + point.side.x * ROAD_HALF_WIDTH * sign;
      const z = point.z + point.side.z * ROAD_HALF_WIDTH * sign;
      const offset = (index * 2 + sideIndex) * 3;
      positions.set([x, terrain.sampleHeight(x, z) + 0.05, z], offset);
      uv.set([sideIndex, distance / 7], (index * 2 + sideIndex) * 2);
    }
    if (index < count) {
      const offset = index * 6;
      const first = index * 2;
      indices.set([first, first + 1, first + 2, first + 1, first + 3, first + 2], offset);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: '#c4b9a2',
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    normalScale: new THREE.Vector2(0.34, 0.34),
  });
  new THREE.TextureLoader().load('/assets/terrain/road.jpg', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    material.map = texture;
    material.needsUpdate = true;
  });
  new THREE.TextureLoader().load('/assets/terrain/road_n.png', (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    material.normalMap = texture;
    material.needsUpdate = true;
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
