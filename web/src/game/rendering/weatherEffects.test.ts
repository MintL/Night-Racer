import * as THREE from 'three';
import { expect, it } from 'vitest';
import { generateWorld } from '../world/terrain/generateWorld';
import { createWeatherEffects, generateFireflyLocations } from './weatherEffects';

it('keeps seeded fireflies off-road and updates a bounded rain volume', () => {
  const world = generateWorld('dusk-rally');
  const locations = generateFireflyLocations(world, 'low');
  expect(locations).toEqual(generateFireflyLocations(world, 'low'));
  expect(locations.length).toBeGreaterThan(12);
  expect(locations.every((location) => world.terrain.sampleRoad(location.x, location.z) <= 0.01)).toBe(true);

  const weather = createWeatherEffects(world, { quality: 'low', rain: true });
  expect(weather.group.children.length).toBe(2);
  const rain = weather.group.children.find((child) => child instanceof THREE.LineSegments);
  expect(rain).toBeInstanceOf(THREE.LineSegments);
  if (!(rain instanceof THREE.LineSegments)) throw new Error('Rain geometry was not created.');
  expect(rain.geometry.getAttribute('position').count).toBe(600);

  weather.update({ x: 10, y: 2, z: -4 }, { x: 4, y: 5, z: -8 }, 3.5);
  expect(rain.position.toArray()).toEqual([7, 0, -6]);
  weather.dispose();
  expect(weather.group.children.length).toBe(0);
});
