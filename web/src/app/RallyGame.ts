import * as THREE from 'three';
import type { WorldSeed } from '../core/random/seededRandom';
import { ChaseCamera } from '../game/camera/ChaseCamera';
import { PlayerInput } from '../game/input/PlayerInput';
import { createCheckpointGates, type CheckpointGate } from '../game/race/checkpointGates';
import { stepRace } from '../game/race/raceController';
import { createRaceState, type RaceState } from '../game/race/raceState';
import { RaceAudioController } from '../game/audio/raceAudio';
import { createAtmosphere } from '../game/rendering/atmosphere';
import { createCheckpointVisuals, createRoadsideReflectors, type CheckpointVisuals } from '../game/rendering/checkpointRenderer';
import { DustTrail } from '../game/rendering/particles/DustTrail';
import { createRoadMesh, createTerrainMesh } from '../game/rendering/terrainRenderer';
import { VehicleRenderer } from '../game/rendering/vehicleRenderer';
import { createWeatherEffects, type WeatherEffects } from '../game/rendering/weatherEffects';
import { RaceUI, type GraphicsQuality } from '../game/ui/RaceUI';
import { stepVehicle, vehicleSpeedWorldPerSecond, VEHICLE_STEP_SECONDS } from '../game/vehicle/vehicleController';
import { VehiclePhysics } from '../game/vehicle/physics/vehiclePhysics';
import { createVehicleState, interpolateVehicleState, type VehicleState } from '../game/vehicle/vehicleState';
import { createScenery } from '../game/world/scenery/createScenery';
import { disposeOriginalScenery, loadOriginalScenery } from '../game/world/scenery/loadOriginalScenery';
import { generateWorld, type World } from '../game/world/terrain/generateWorld';

type Screen = 'loading' | 'menu' | 'race' | 'pause' | 'results';

function disposeWorldGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    if (material instanceof THREE.MeshStandardMaterial) {
      material.map?.dispose();
      material.normalMap?.dispose();
    }
    material.dispose();
  });
}

function startingPose(world: World): VehicleState {
  const start = world.track.sample(0.99);
  const ahead = world.track.sample(0.001);
  const yaw = Math.atan2(-(ahead.x - start.x), -(ahead.z - start.z));
  return createVehicleState({
    x: start.x,
    y: world.terrain.sampleHeight(start.x, start.z),
    z: start.z,
  }, yaw);
}

export class RallyGame {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: ChaseCamera;
  private readonly atmosphere;
  private readonly ui: RaceUI;
  private readonly input = new PlayerInput();
  private readonly audio = new RaceAudioController({ masterVolume: 0.55 });
  private readonly car = new VehicleRenderer();
  private readonly root: HTMLDivElement;
  private world: World | null = null;
  private worldGroup: THREE.Group | null = null;
  private originalScenery: THREE.Group | null = null;
  private dust: DustTrail | null = null;
  private weather: WeatherEffects | null = null;
  private physics: VehiclePhysics | null = null;
  private checkpointVisuals: CheckpointVisuals | null = null;
  private checkpoints: readonly CheckpointGate[] = [];
  private vehicle: VehicleState | null = null;
  private previousVehicle: VehicleState | null = null;
  private race: RaceState | null = null;
  private seed: WorldSeed = '2013';
  private quality: GraphicsQuality = 'medium';
  private rainEnabled = false;
  private screen: Screen = 'loading';
  private accumulator = 0;
  private lastFrameTime = 0;
  private lastOrbitInput = 0;
  private rebuildForQuality = false;
  private generationToken = 0;

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.ui = new RaceUI(root, {
      start: (seed) => this.start(seed),
      resume: () => this.resume(),
      restart: () => this.restart(),
      menu: () => this.menu(),
      qualityChanged: (quality) => this.changeQuality(quality),
      rainChanged: (rain) => this.changeRain(rain),
      volumeChanged: (volume) => this.audio.setMasterVolume(volume),
      fullscreen: () => this.toggleFullscreen(),
    });
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.ui.viewport.append(this.renderer.domElement);

    this.camera = new ChaseCamera(1);
    this.atmosphere = createAtmosphere(this.scene, true);
    this.scene.add(this.car.group);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.ui.showLoading(this.seed);
    requestAnimationFrame(this.frame);
    requestAnimationFrame(() => window.setTimeout(() => {
      this.buildWorld(this.seed);
      this.screen = 'menu';
      this.ui.showMenu(this.seed);
    }, 0));
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.ui.viewport.clientWidth);
    const height = Math.max(1, this.ui.viewport.clientHeight);
    const ratioLimit = this.quality === 'low' ? 1 : this.quality === 'medium' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioLimit));
    this.renderer.setSize(width, height, false);
    this.camera.resize(width, height);
  };

  private buildWorld(seed: WorldSeed): void {
    this.physics?.dispose();
    this.physics = null;
    if (this.worldGroup) {
      this.dust?.dispose();
      this.dust = null;
      this.weather?.dispose();
      this.weather = null;
      if (this.originalScenery) {
        this.worldGroup.remove(this.originalScenery);
        disposeOriginalScenery(this.originalScenery);
        this.originalScenery = null;
      }
      this.scene.remove(this.worldGroup);
      disposeWorldGroup(this.worldGroup);
    }
    const world = generateWorld(seed);
    const group = new THREE.Group();
    const gridStep = this.quality === 'low' ? 2 : 1;
    group.add(createTerrainMesh(world.terrain, gridStep));
    group.add(createRoadMesh(world.track, world.terrain));
    group.add(createScenery(world, this.quality));
    group.add(createRoadsideReflectors(world.track, world.terrain));
    this.dust = new DustTrail(seed);
    group.add(this.dust.group);
    this.weather = createWeatherEffects(world, {
      quality: this.quality,
      rain: this.rainEnabled,
      fireflies: true,
    });
    group.add(this.weather.group);
    this.checkpoints = createCheckpointGates(world.track.sample);
    this.checkpointVisuals = createCheckpointVisuals(this.checkpoints, world.terrain);
    group.add(this.checkpointVisuals.group);
    this.scene.add(group);
    this.world = world;
    this.worldGroup = group;
    void loadOriginalScenery(world, this.quality).then((detail) => {
      if (this.worldGroup !== group) {
        disposeOriginalScenery(detail);
        return;
      }
      group.add(detail);
      this.originalScenery = detail;
    }).catch((error: unknown) => console.warn('Original scenery unavailable', error));
    this.seed = seed;
    this.rebuildForQuality = false;
    this.vehicle = startingPose(world);
    this.previousVehicle = this.vehicle;
    void VehiclePhysics.create(world.terrain, this.vehicle).then((physics) => {
      if (this.worldGroup !== group || !this.vehicle) {
        physics.dispose();
        return;
      }
      physics.reset(this.vehicle);
      this.physics = physics;
    }).catch((error: unknown) => console.warn('Vehicle physics unavailable', error));
    this.race = createRaceState(this.checkpoints);
    this.checkpointVisuals.setActive(0);
    this.camera.snap();
  }

  private start(seed: WorldSeed): void {
    // AudioContext resume happens directly in the button handler.
    void this.audio.start().catch((error: unknown) => console.warn('Race audio unavailable', error));
    this.ui.showLoading(seed);
    this.screen = 'loading';
    const token = ++this.generationToken;
    requestAnimationFrame(() => window.setTimeout(() => {
      if (token !== this.generationToken) return;
      try {
        if (!this.world || this.seed !== seed || this.rebuildForQuality) this.buildWorld(seed);
        this.resetRace();
      } catch (error) {
        console.error('Could not build the rally course', error);
        this.screen = 'menu';
        this.ui.showMenu(seed);
        this.ui.notify('Course generation failed');
      }
    }, 0));
  }

  private resetRace(): void {
    if (!this.world) return;
    this.vehicle = startingPose(this.world);
    this.previousVehicle = this.vehicle;
    this.physics?.reset(this.vehicle);
    this.dust?.reset(this.seed);
    this.race = createRaceState(this.checkpoints);
    this.checkpointVisuals?.setActive(0);
    this.camera.snap();
    this.accumulator = 0;
    this.screen = 'race';
    this.ui.showRace();
  }

  private restart(): void {
    void this.audio.resume().catch((error: unknown) => console.warn('Race audio unavailable', error));
    this.resetRace();
  }

  private pause(): void {
    if (this.screen !== 'race') return;
    this.screen = 'pause';
    this.accumulator = 0;
    this.previousVehicle = this.vehicle;
    void this.audio.pause();
    this.ui.showPause();
  }

  private resume(): void {
    if (this.screen !== 'pause') return;
    void this.audio.resume().catch((error: unknown) => console.warn('Race audio unavailable', error));
    this.accumulator = 0;
    this.screen = 'race';
    this.ui.showRace();
  }

  private menu(): void {
    this.screen = 'menu';
    this.accumulator = 0;
    void this.audio.pause();
    this.ui.showMenu(this.seed);
  }

  private changeQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.rebuildForQuality = true;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.resize();
  }

  private changeRain(rain: boolean): void {
    this.rainEnabled = rain;
    this.audio.setRainEnabled(rain);
    if (!this.world || !this.worldGroup) return;
    if (this.weather) {
      this.worldGroup.remove(this.weather.group);
      this.weather.dispose();
    }
    this.weather = createWeatherEffects(this.world, {
      quality: this.quality,
      rain,
      fireflies: true,
    });
    this.worldGroup.add(this.weather.group);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void this.root.requestFullscreen();
    }
  }

  private resetVehicleToTrack(): void {
    if (!this.world || !this.vehicle) return;
    let closest = this.world.track.points[0];
    let closestDistance = Infinity;
    for (const point of this.world.track.points) {
      const distance = (point.x - this.vehicle.position.x) ** 2 + (point.z - this.vehicle.position.z) ** 2;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = point;
      }
    }
    const yaw = Math.atan2(-closest.heading.x, -closest.heading.z);
    this.vehicle = createVehicleState({
      x: closest.x,
      y: this.world.terrain.sampleHeight(closest.x, closest.z),
      z: closest.z,
    }, yaw);
    this.previousVehicle = this.vehicle;
    this.physics?.reset(this.vehicle);
    this.dust?.reset(this.seed);
    this.camera.snap();
    this.ui.notify('Back on course');
  }

  private readonly frame = (timestamp: number): void => {
    requestAnimationFrame(this.frame);
    const elapsed = this.lastFrameTime ? Math.min((timestamp - this.lastFrameTime) / 1000, 0.1) : 0;
    this.lastFrameTime = timestamp;
    const controls = this.input.sample();
    this.lastOrbitInput = controls.cameraOrbit;

    if (this.screen === 'race' && this.world && this.vehicle && this.race) {
      if (controls.pausePressed) this.pause();
      if (controls.resetPressed) this.resetVehicleToTrack();
      if (this.screen === 'race') {
        this.accumulator += elapsed;
        let steps = 0;
        while (this.accumulator >= VEHICLE_STEP_SECONDS && steps < 8) {
          this.step(controls);
          this.accumulator -= VEHICLE_STEP_SECONDS;
          steps += 1;
          if (this.screen !== 'race') break;
        }
        if (steps === 8) this.accumulator = 0;
      }
    } else if (this.screen === 'pause' && controls.pausePressed) {
      this.resume();
    }

    if (this.vehicle && this.previousVehicle) {
      const interpolation = this.screen === 'race' ? this.accumulator / VEHICLE_STEP_SECONDS : 1;
      const displayVehicle = interpolateVehicleState(this.previousVehicle, this.vehicle, interpolation);
      this.car.update(displayVehicle);
      this.camera.update(displayVehicle, elapsed, this.lastOrbitInput);
      this.atmosphere.update(displayVehicle.position);
      this.weather?.update(displayVehicle.position, this.camera.camera.position, timestamp / 1000);
      if (this.race && this.screen !== 'menu' && this.screen !== 'loading') {
        this.ui.updateHud({ race: this.race, speedKmh: vehicleSpeedWorldPerSecond(this.vehicle) * 3.6, seed: this.seed });
      }
      this.audio.update(this.vehicle, this.world?.terrain.sampleRoad(this.vehicle.position.x, this.vehicle.position.z) ?? 1);
    }
    this.renderer.render(this.scene, this.camera.camera);
  };

  private step(controls: Readonly<{ throttle: number; brake: number; steer: number }>): void {
    if (!this.world || !this.vehicle || !this.race) return;
    const previous = this.vehicle;
    const driving = this.race.phase === 'racing'
      ? controls
      : { throttle: 0, brake: 0, steer: 0 };
    const arcadeNext = stepVehicle(previous, driving, {
      sampleHeight: this.physics ? undefined : this.world.terrain.sampleHeight,
      sampleRoad: this.world.terrain.sampleRoad,
    });
    const next = this.physics ? this.physics.step(arcadeNext).vehicle : arcadeNext;
    this.dust?.update(
      VEHICLE_STEP_SECONDS,
      next,
      this.world.terrain.sampleRoad(next.position.x, next.position.z),
    );
    const previousRace = this.race;
    const race = stepRace(previousRace, previous.position, next.position);
    this.previousVehicle = previous;
    this.vehicle = next;
    this.race = race;
    if (race.nextCheckpointIndex !== previousRace.nextCheckpointIndex) {
      this.checkpointVisuals?.setActive(race.nextCheckpointIndex);
      this.audio.playCheckpoint();
      if (race.completedLaps > previousRace.completedLaps) {
        this.ui.notify(race.phase === 'finished' ? 'Finish!' : `Lap ${race.currentLap}`);
      } else {
        this.ui.notify(`Checkpoint ${previousRace.nextCheckpointIndex + 1}`);
      }
    }
    if (race.phase === 'finished' && previousRace.phase !== 'finished') {
      this.screen = 'results';
      this.ui.showResults(race);
      void this.audio.pause();
    }
  }
}
