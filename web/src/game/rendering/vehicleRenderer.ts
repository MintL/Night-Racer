import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import type { VehicleState } from '../vehicle/vehicleState';

interface WheelMesh {
  object: THREE.Object3D;
  originalX: number;
  originalY: number;
  front: boolean;
}

function modernMaterial(source: THREE.Material, meshName: string): THREE.Material {
  const isGlass = meshName.toLowerCase().includes('glass');
  const isWheel = meshName.toLowerCase().startsWith('wheel');
  const original = source instanceof THREE.MeshPhongMaterial || source instanceof THREE.MeshStandardMaterial
    ? source
    : null;
  const color = original?.color ?? new THREE.Color('#ffffff');
  const map = original?.map ?? null;

  if (isGlass) {
    return new THREE.MeshPhysicalMaterial({
      color: '#617985',
      map,
      metalness: 0.2,
      roughness: 0.18,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      clearcoat: 1,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color,
    map,
    metalness: isWheel ? 0.08 : meshName === 'main' ? 0.48 : 0.2,
    roughness: isWheel ? 0.85 : meshName === 'main' ? 0.3 : 0.58,
    clearcoat: meshName === 'main' ? 0.7 : 0,
    clearcoatRoughness: 0.2,
  });
}

function fallbackCar(): THREE.Group {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: '#e27143', metalness: 0.48, roughness: 0.29, clearcoat: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#354d58', metalness: 0.2, roughness: 0.14, transparent: true, opacity: 0.8 });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.25, 1.95), paint);
  lower.position.y = 0.28;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.71, 0.24, 0.82), glass);
  cabin.position.set(0, 0.49, 0.08);
  group.add(lower, cabin);
  for (const x of [-0.43, 0.43]) {
    for (const z of [-0.55, 0.57]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12),
        new THREE.MeshStandardMaterial({ color: '#202727', roughness: 0.9 }),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.14, z);
      group.add(wheel);
    }
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return group;
}

export class VehicleRenderer {
  readonly group = new THREE.Group();
  private readonly placeholder = fallbackCar();
  private readonly wheels: WheelMesh[] = [];
  private loadedModel: THREE.Group | null = null;

  constructor() {
    this.group.add(this.placeholder);
    this.addHeadlights();
    this.loadOriginalCar();
  }

  private addHeadlights(): void {
    const bulb = new THREE.MeshBasicMaterial({ color: '#ffe0a6' });
    for (const x of [-0.29, 0.29]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bulb);
      light.position.set(x, 0.32, -0.94);
      this.group.add(light);
    }
    const glow = new THREE.PointLight('#ffe4bc', 2, 7, 2);
    glow.position.set(0, 0.35, -0.95);
    this.group.add(glow);

    // The original car shader mixed violet directional and nearby point lights.
    // A soft local fill keeps the Porsche body readable against PurpleSky.
    const bodyFill = new THREE.PointLight('#b9a5e3', 4, 4, 2);
    bodyFill.position.set(0, 1.5, 1.2);
    this.group.add(bodyFill);
  }

  private loadOriginalCar(): void {
    const loader = new FBXLoader();
    loader.load('/assets/car/porsche.FBX', (model) => {
      // The FBX stores 1 unit = 2.54 XNA units. Combined with the game's
      // legacy-to-web factor of .01, the correct scale is .0254.
      model.scale.setScalar(0.0254);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      model.position.y = -bounds.min.y + 0.015;
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const sources = Array.isArray(object.material) ? object.material : [object.material];
        const materials = sources.map((source) => modernMaterial(source, object.name));
        object.material = materials.length === 1 ? materials[0] : materials;
        if (object.name.toLowerCase().startsWith('wheel')) {
          this.wheels.push({
            object,
            originalX: object.rotation.x,
            originalY: object.rotation.y,
            front: object.name.endsWith('001') || object.name.endsWith('002'),
          });
        }
      });
      this.group.remove(this.placeholder);
      this.placeholder.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      this.group.add(model);
      this.loadedModel = model;
    }, undefined, (error) => {
      console.warn('Original car model could not be loaded; using the built-in fallback.', error);
    });
  }

  update(state: VehicleState): void {
    this.group.position.set(state.position.x, state.position.y, state.position.z);
    this.group.rotation.set(state.pitch, state.yaw, state.roll, 'YXZ');

    for (const wheel of this.wheels) {
      wheel.object.rotation.x = wheel.originalX + state.wheelSpin;
      wheel.object.rotation.y = wheel.originalY + (wheel.front ? state.steeringAngle : 0);
    }
  }

  dispose(): void {
    if (!this.loadedModel) return;
    this.loadedModel.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }
}
