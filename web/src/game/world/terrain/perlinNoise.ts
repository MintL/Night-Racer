import { SeededRandom } from '../../../core/random/seededRandom';

// Fixed lattice permutation from MapGeneration/PerlinGenerator.cs. The old
// generator ignored its seed and drew gradients from a global C# Random;
// here the gradient draw is explicitly seeded by the caller.
const PERMUTATION = new Uint8Array([
  225, 155, 210, 108, 175, 199, 221, 144, 203, 116, 70, 213, 69, 158, 33, 252,
  5, 82, 173, 133, 222, 139, 174, 27, 9, 71, 90, 246, 75, 130, 91, 191,
  169, 138, 2, 151, 194, 235, 81, 7, 25, 113, 228, 159, 205, 253, 134, 142,
  248, 65, 224, 217, 22, 121, 229, 63, 89, 103, 96, 104, 156, 17, 201, 129,
  36, 8, 165, 110, 237, 117, 231, 56, 132, 211, 152, 20, 181, 111, 239, 218,
  170, 163, 51, 172, 157, 47, 80, 212, 176, 250, 87, 49, 99, 242, 136, 189,
  162, 115, 44, 43, 124, 94, 150, 16, 141, 247, 32, 10, 198, 223, 255, 72,
  53, 131, 84, 57, 220, 197, 58, 50, 208, 11, 241, 28, 3, 192, 62, 202,
  18, 215, 153, 24, 76, 41, 15, 179, 39, 46, 55, 6, 128, 167, 23, 188,
  106, 34, 187, 140, 164, 73, 112, 182, 244, 195, 227, 13, 35, 77, 196, 185,
  26, 200, 226, 119, 31, 123, 168, 125, 249, 68, 183, 230, 177, 135, 160, 180,
  12, 1, 243, 148, 102, 166, 38, 238, 251, 37, 240, 126, 64, 74, 161, 40,
  184, 149, 171, 178, 101, 66, 29, 59, 146, 61, 254, 107, 42, 86, 154, 4,
  236, 232, 120, 21, 233, 209, 45, 98, 193, 114, 78, 19, 206, 14, 118, 127,
  48, 79, 147, 85, 30, 207, 219, 54, 88, 234, 190, 122, 95, 67, 143, 109,
  137, 214, 145, 93, 92, 100, 245, 0, 216, 186, 60, 83, 105, 97, 204, 52,
]);

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}

export class PerlinNoise {
  private readonly gradients = new Float32Array(256 * 3);

  constructor(random: SeededRandom) {
    for (let index = 0; index < 256; index += 1) {
      const z = 1 - 2 * random.nextFloat();
      const radius = Math.sqrt(1 - z * z);
      const angle = 2 * Math.PI * random.nextFloat();
      this.gradients[index * 3] = radius * Math.cos(angle);
      this.gradients[index * 3 + 1] = radius * Math.sin(angle);
      this.gradients[index * 3 + 2] = z;
    }
  }

  private lattice(x: number, y: number, z: number, offsetX: number, offsetY: number, offsetZ: number): number {
    const index = PERMUTATION[(x + PERMUTATION[(y + PERMUTATION[z & 255]) & 255]) & 255] * 3;
    return this.gradients[index] * offsetX
      + this.gradients[index + 1] * offsetY
      + this.gradients[index + 2] * offsetZ;
  }

  noise(x: number, y: number, z: number): number {
    const latticeX = Math.floor(x);
    const latticeY = Math.floor(y);
    const latticeZ = Math.floor(z);
    const fractionX = x - latticeX;
    const fractionY = y - latticeY;
    const fractionZ = z - latticeZ;
    const weightX = smooth(fractionX);
    const weightY = smooth(fractionY);
    const weightZ = smooth(fractionZ);

    const bottomNear = lerp(
      this.lattice(latticeX, latticeY, latticeZ, fractionX, fractionY, fractionZ),
      this.lattice(latticeX + 1, latticeY, latticeZ, fractionX - 1, fractionY, fractionZ),
      weightX,
    );
    const bottomFar = lerp(
      this.lattice(latticeX, latticeY + 1, latticeZ, fractionX, fractionY - 1, fractionZ),
      this.lattice(latticeX + 1, latticeY + 1, latticeZ, fractionX - 1, fractionY - 1, fractionZ),
      weightX,
    );
    const topNear = lerp(
      this.lattice(latticeX, latticeY, latticeZ + 1, fractionX, fractionY, fractionZ - 1),
      this.lattice(latticeX + 1, latticeY, latticeZ + 1, fractionX - 1, fractionY, fractionZ - 1),
      weightX,
    );
    const topFar = lerp(
      this.lattice(latticeX, latticeY + 1, latticeZ + 1, fractionX, fractionY - 1, fractionZ - 1),
      this.lattice(latticeX + 1, latticeY + 1, latticeZ + 1, fractionX - 1, fractionY - 1, fractionZ - 1),
      weightX,
    );

    return lerp(lerp(bottomNear, bottomFar, weightY), lerp(topNear, topFar, weightY), weightZ);
  }
}
