import { SeededRandom } from '../../../core/random/seededRandom';
import { PerlinNoise } from './perlinNoise';

// HeightMap.cs and GamePlayView.cs. Heights here remain unitless until the
// terrain's vertical world scale is applied.
export const ORIGINAL_HEIGHT_MAP = {
  size: 401,
  primaryFrequency: 6,
  primaryPerturbation: 35,
  detailDivisor: 4,
  detailFrequency: 9,
  detailPerturbation: 20,
  detailStrength: 0.15,
} as const;

function indexOf(x: number, z: number, size: number): number {
  return z * size + x;
}

function clampIndex(value: number, size: number): number {
  return Math.min(size - 1, Math.max(0, value));
}

function addPerlinNoise(heights: Float32Array, size: number, noise: PerlinNoise, frequency: number): void {
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = indexOf(x, z, size);
      let height = heights[index] + noise.noise((frequency * x) / size, (frequency * z) / size, 0);
      if (height > 1) height -= (height - 1) / 2;
      if (height < 0) height += Math.abs(height) / 2;
      heights[index] = height;
    }
  }
}

function perturb(heights: Float32Array, size: number, noise: PerlinNoise, amount: number): Float32Array {
  const perturbed = new Float32Array(heights.length);
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const coordinateZ = clampIndex(z + Math.trunc(noise.noise((amount * z) / size, (amount * x) / size, 0) * amount), size);
      const coordinateX = clampIndex(x + Math.trunc(noise.noise((amount * z) / size, (amount * x) / size, 1) * amount), size);
      perturbed[indexOf(x, z, size)] = heights[indexOf(coordinateX, coordinateZ, size)];
    }
  }
  return perturbed;
}

function smoothenInPlace(heights: Float32Array, size: number): void {
  // The original nine-neighbour pass reads previously updated cells as it
  // walks the grid; preserving that detail affects the terrain profile.
  for (let z = 1; z < size - 1; z += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      let total = 0;
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          total += heights[indexOf(x + offsetX, z + offsetZ, size)];
        }
      }
      heights[indexOf(x, z, size)] = total / 9;
    }
  }
}

export function generateHeightMap(size: number, random: SeededRandom): Float32Array {
  if (!Number.isInteger(size) || size < 8) {
    throw new RangeError('Height map size must be an integer of at least eight.');
  }

  const heights = new Float32Array(size * size);
  const halfSize = size / 2;
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const bowlX = ((x - halfSize) / halfSize) ** 2;
      const bowlZ = ((z - halfSize) / halfSize) ** 2;
      heights[indexOf(x, z, size)] = (bowlX + bowlZ) / 2;
    }
  }

  const primaryNoise = new PerlinNoise(random);
  addPerlinNoise(heights, size, primaryNoise, ORIGINAL_HEIGHT_MAP.primaryFrequency);
  const perturbed = perturb(heights, size, primaryNoise, ORIGINAL_HEIGHT_MAP.primaryPerturbation);

  const detailSize = Math.floor(size / ORIGINAL_HEIGHT_MAP.detailDivisor);
  const detail = new Float32Array(detailSize * detailSize);
  const detailNoise = new PerlinNoise(random);
  addPerlinNoise(detail, detailSize, detailNoise, ORIGINAL_HEIGHT_MAP.detailFrequency);
  const perturbedDetail = perturb(detail, detailSize, detailNoise, ORIGINAL_HEIGHT_MAP.detailPerturbation);

  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      perturbed[indexOf(x, z, size)] += ORIGINAL_HEIGHT_MAP.detailStrength
        * perturbedDetail[indexOf(x % detailSize, z % detailSize, detailSize)];
    }
  }

  smoothenInPlace(perturbed, size);
  for (let index = 0; index < perturbed.length; index += 1) {
    perturbed[index] = Math.max(0, perturbed[index]);
  }
  return perturbed;
}
