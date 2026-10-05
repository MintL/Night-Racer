export type WorldSeed = number | string;

function seedToUint32(seed: WorldSeed): number {
  if (typeof seed === 'number') {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError('A numeric world seed must be a safe integer.');
    }
    return seed >>> 0;
  }

  // FNV-1a makes text entered in the seed field stable across browsers.
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A small local PRNG. Its sequence is intentionally not C# System.Random-compatible. */
export class SeededRandom {
  private state: number;

  constructor(seed: WorldSeed) {
    this.state = seedToUint32(seed);
  }

  nextUint32(): number {
    // Mulberry32 has a defined sequence for every 32-bit state, including zero.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  nextInt(exclusiveMaximum: number): number {
    if (!Number.isSafeInteger(exclusiveMaximum) || exclusiveMaximum <= 0) {
      throw new RangeError('The exclusive maximum must be a positive safe integer.');
    }
    return Math.floor(this.nextFloat() * exclusiveMaximum);
  }
}

export function worldRandom(seed: WorldSeed, system: string): SeededRandom {
  return new SeededRandom(`${typeof seed}:${String(seed)}:${system}`);
}
