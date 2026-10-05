import { expect, it } from 'vitest';
import { generateWorld } from '../world/terrain/generateWorld';
import { createTerrainGeometry } from './terrainRenderer';

it('paints road vertices on the terrain surface without a vertical gap', () => {
  const { terrain } = generateWorld('road-surface');
  const geometry = createTerrainGeometry(terrain);
  const positions = geometry.getAttribute('position');
  const weights = geometry.getAttribute('surfaceWeights');
  let roadVertexCount = 0;
  let largestGap = 0;

  for (let index = 0; index < terrain.heights.length; index += 1) {
    if (terrain.roadWeights[index] < 0.5) continue;
    roadVertexCount += 1;
    largestGap = Math.max(largestGap, Math.abs(positions.getY(index) - terrain.heights[index]));
    expect(weights.getX(index)).toBeGreaterThan(0);
  }

  expect(roadVertexCount).toBeGreaterThan(1_000);
  expect(largestGap).toBe(0);
  geometry.dispose();
});
