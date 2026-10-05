import * as THREE from 'three';

export interface Atmosphere {
  update(carPosition: Readonly<{ x: number; y: number; z: number }>, cameraPosition: THREE.Vector3): void;
}

/** A dusk sky, cool forest fill, and low sun keep the dirt road legible. */
export function createAtmosphere(scene: THREE.Scene, shadows: boolean): Atmosphere {
  scene.background = new THREE.Color('#667f82');
  scene.fog = new THREE.FogExp2('#829896', 0.0047);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `
        varying vec3 skyDirection;
        void main() {
          skyDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 skyDirection;
        void main() {
          float height = skyDirection.y;
          vec3 dusk = vec3(0.73, 0.50, 0.42);
          vec3 horizon = vec3(0.53, 0.64, 0.65);
          vec3 zenith = vec3(0.10, 0.21, 0.31);
          vec3 ground = vec3(0.47, 0.56, 0.55);
          vec3 sky = mix(horizon, zenith, smoothstep(-0.05, 0.8, height));
          sky = mix(ground, sky, smoothstep(-0.4, 0.08, height));
          float warmHorizon = exp(-pow((height - 0.03) * 7.0, 2.0));
          sky = mix(sky, dusk, warmHorizon * 0.38);
          vec3 sunDirection = normalize(vec3(-0.64, 0.18, -0.46));
          float sun = pow(max(dot(skyDirection, sunDirection), 0.0), 600.0);
          float halo = pow(max(dot(skyDirection, sunDirection), 0.0), 16.0);
          sky += vec3(1.0, 0.66, 0.38) * (sun * 1.4 + halo * 0.13);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight('#c7e4e4', '#3d4339', 1.8));
  const sunlight = new THREE.DirectionalLight('#ffd5a6', 2.5);
  sunlight.position.set(-65, 80, -45);
  sunlight.castShadow = shadows;
  sunlight.shadow.mapSize.set(shadows ? 2048 : 512, shadows ? 2048 : 512);
  sunlight.shadow.camera.left = -34;
  sunlight.shadow.camera.right = 34;
  sunlight.shadow.camera.top = 34;
  sunlight.shadow.camera.bottom = -34;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 170;
  sunlight.shadow.bias = -0.00015;
  sunlight.shadow.normalBias = 0.025;
  scene.add(sunlight, sunlight.target);

  return {
    update(carPosition, cameraPosition): void {
      sunlight.position.set(carPosition.x - 65, carPosition.y + 80, carPosition.z - 45);
      sunlight.target.position.set(carPosition.x, carPosition.y, carPosition.z);
      sunlight.target.updateMatrixWorld();
      sky.position.copy(cameraPosition);
    },
  };
}
