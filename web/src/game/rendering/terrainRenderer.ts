import * as THREE from 'three';
import type { Terrain } from '../world/terrain/generateWorld';
import type { Track } from '../world/track/track';

const ROAD_HALF_WIDTH = 7 * 0.75;
type TerrainTextures = Readonly<Record<'road' | 'grass' | 'rock' | 'snow', THREE.Texture>>;
let terrainTextures: TerrainTextures | null = null;

function getTerrainTextures(): TerrainTextures {
  if (terrainTextures) return terrainTextures;
  const loader = new THREE.TextureLoader();
  const load = (filename: string): THREE.Texture => {
    const texture = loader.load(`/assets/terrain/${filename}`);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  };
  terrainTextures = {
    road: load('road.jpg'),
    grass: load('grass.jpg'),
    rock: load('rock.jpg'),
    snow: load('snow.jpg'),
  };
  return terrainTextures;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Render the original heightmap at a selectable mesh density. Physics always uses full resolution. */
export function createTerrainMesh(terrain: Terrain, gridStep = 1): THREE.Mesh {
  if (!Number.isInteger(gridStep) || gridStep < 1 || (terrain.size - 1) % gridStep !== 0) {
    throw new RangeError('Terrain grid step must divide the map edge.');
  }
  const textures = getTerrainTextures();
  const side = (terrain.size - 1) / gridStep + 1;
  const positions = new Float32Array(side * side * 3);
  const textureCoordinates = new Float32Array(side * side * 2);
  const textureWeights = new Float32Array(side * side * 4);
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
      // The ribbon interpolates along the spline while the terrain triangulates
      // a grid. Recess the covered ground slightly to prevent z-fighting and
      // grass triangles from piercing the road on bends.
      positions.set([x, height - 0.28 * clamp01(roadWeight * 2), z], destination);
      textureCoordinates.set([gridX / 8, gridZ / 8], (row * side + column) * 2);
      // TerrainModel.cs blends these four original textures using normalized
      // height-map values. Keep its weighting curves together here.
      const normalizedHeight = height / 35;
      const weights = [
        roadWeight,
        clamp01(1 - Math.abs(normalizedHeight - 0.2) / 0.4),
        clamp01(1 - Math.abs(normalizedHeight - 0.7) / 0.2),
        clamp01(1 - Math.abs(normalizedHeight - 1) / 0.3),
      ];
      const magnitude = Math.hypot(...weights) || 1;
      textureWeights.set(weights.map((weight) => weight / magnitude), (row * side + column) * 4);
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
  geometry.setAttribute('uv', new THREE.BufferAttribute(textureCoordinates, 2));
  geometry.setAttribute('surfaceWeights', new THREE.BufferAttribute(textureWeights, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.97,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainRoad = { value: textures.road };
    shader.uniforms.terrainGrass = { value: textures.grass };
    shader.uniforms.terrainRock = { value: textures.rock };
    shader.uniforms.terrainSnow = { value: textures.snow };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute vec4 surfaceWeights;\nvarying vec4 vSurfaceWeights;\nvarying vec2 vTerrainUv;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvSurfaceWeights = surfaceWeights;\nvTerrainUv = uv;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform sampler2D terrainRoad;\nuniform sampler2D terrainGrass;\nuniform sampler2D terrainRock;\nuniform sampler2D terrainSnow;\nvarying vec4 vSurfaceWeights;\nvarying vec2 vTerrainUv;',
    ).replace(
      '#include <map_fragment>',
      `
      vec4 weights = vSurfaceWeights;
      float weightSum = max(dot(weights, vec4(1.0)), 0.001);
      vec3 surfaceColor =
        texture2D(terrainRoad, vTerrainUv).rgb * weights.x +
        texture2D(terrainGrass, vTerrainUv).rgb * weights.y +
        texture2D(terrainRock, vTerrainUv).rgb * weights.z +
        texture2D(terrainSnow, vTerrainUv).rgb * weights.w;
      diffuseColor.rgb *= surfaceColor / weightSum;
      `,
    );
  };
  const mesh = new THREE.Mesh(geometry, material);
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
