import * as THREE from 'three';

export interface CameraTarget {
  position: { x: number; y: number; z: number };
  yaw: number;
  speed: number;
}

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLookAt = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private orbit = 0;
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.08, 550);
  }

  update(target: CameraTarget, frameSeconds: number, orbitInput: number): void {
    const speedFraction = Math.min(1, Math.abs(target.speed) / 50);
    const distance = 7.2 + 2.6 * speedFraction;
    const height = 3.3 + 0.8 * speedFraction;

    this.orbit = this.orbit * Math.exp(-2.2 * frameSeconds) + orbitInput * frameSeconds * 1.9;
    this.orbit = Math.max(-0.85, Math.min(0.85, this.orbit));

    const heading = target.yaw + this.orbit;
    this.desiredPosition.set(
      target.position.x + Math.sin(heading) * distance,
      target.position.y + height,
      target.position.z + Math.cos(heading) * distance,
    );
    this.desiredLookAt.set(
      target.position.x - Math.sin(target.yaw) * 2.6,
      target.position.y + 1.1,
      target.position.z - Math.cos(target.yaw) * 2.6,
    );

    if (!this.initialized) {
      this.camera.position.copy(this.desiredPosition);
      this.lookAt.copy(this.desiredLookAt);
      this.initialized = true;
    } else {
      const positionBlend = 1 - Math.exp(-6 * frameSeconds);
      const lookBlend = 1 - Math.exp(-8 * frameSeconds);
      this.camera.position.lerp(this.desiredPosition, positionBlend);
      this.lookAt.lerp(this.desiredLookAt, lookBlend);
    }

    this.camera.lookAt(this.lookAt);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  snap(): void {
    this.initialized = false;
  }
}
