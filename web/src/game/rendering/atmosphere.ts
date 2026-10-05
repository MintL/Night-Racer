import * as THREE from 'three';
import { assetUrl } from '../../core/assetUrl';

export interface Atmosphere {
  update(carPosition: Readonly<{ x: number; y: number; z: number }>): void;
}

/** The PurpleSky cubemap and violet directional light come from GamePlayView.cs. */
export function createAtmosphere(scene: THREE.Scene, shadows: boolean): Atmosphere {
  const purpleSky = new THREE.CubeTextureLoader()
    .setPath(assetUrl('assets/skybox/'))
    .load([
      'skybox_right1.png',
      'skybox_left2.png',
      'skybox_top3.png',
      'skybox_bottom4.png',
      'skybox_front5.png',
      'skybox_back6_2.png',
    ]);
  purpleSky.colorSpace = THREE.SRGBColorSpace;
  scene.background = purpleSky;
  scene.environment = purpleSky;
  scene.environmentIntensity = 0.45;
  scene.fog = new THREE.FogExp2('#170d22', 0.0042);

  // The XNA game used dim ambient and violet directional light. Small fill
  // keeps the original road texture legible on a modern PBR surface.
  scene.add(new THREE.HemisphereLight('#8173ad', '#211728', 0.95));
  const moonlight = new THREE.DirectionalLight('#a58bd9', 1.55);
  moonlight.position.set(-65, 80, -45);
  moonlight.castShadow = shadows;
  moonlight.shadow.mapSize.set(shadows ? 2048 : 512, shadows ? 2048 : 512);
  moonlight.shadow.camera.left = -34;
  moonlight.shadow.camera.right = 34;
  moonlight.shadow.camera.top = 34;
  moonlight.shadow.camera.bottom = -34;
  moonlight.shadow.camera.near = 1;
  moonlight.shadow.camera.far = 170;
  moonlight.shadow.bias = -0.00015;
  moonlight.shadow.normalBias = 0.025;
  scene.add(moonlight, moonlight.target);

  return {
    update(carPosition): void {
      moonlight.position.set(carPosition.x - 65, carPosition.y + 80, carPosition.z - 45);
      moonlight.target.position.set(carPosition.x, carPosition.y, carPosition.z);
      moonlight.target.updateMatrixWorld();
    },
  };
}
