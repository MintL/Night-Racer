import * as THREE from 'three';
import { assetUrl } from '../../core/assetUrl';
import type { Terrain } from '../world/terrain/generateWorld';

type TerrainTextures = Readonly<Record<'road' | 'grass' | 'rock' | 'snow', THREE.Texture>>;
let terrainTextures: TerrainTextures | null = null;

function getTerrainTextures(): TerrainTextures {
  if (terrainTextures) return terrainTextures;
  const loader = new THREE.TextureLoader();
  const load = (filename: string): THREE.Texture => {
    const texture = loader.load(assetUrl(`assets/terrain/${filename}`));
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

/** Build the original heightmap and its painted road as one continuous surface. */
export function createTerrainGeometry(terrain: Terrain, gridStep = 1): THREE.BufferGeometry {
  if (!Number.isInteger(gridStep) || gridStep < 1 || (terrain.size - 1) % gridStep !== 0) {
    throw new RangeError('Terrain grid step must divide the map edge.');
  }
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
      positions.set([x, height, z], destination);
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
  return geometry;
}

/** Render the original heightmap at a selectable mesh density. Physics always uses full resolution. */
export function createTerrainMesh(terrain: Terrain, gridStep = 1): THREE.Mesh {
  const geometry = createTerrainGeometry(terrain, gridStep);
  const textures = getTerrainTextures();
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
