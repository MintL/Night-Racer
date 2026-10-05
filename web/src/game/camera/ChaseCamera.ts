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
  private followingYaw = 0;
  private orbit = 0;
  private initialized = false;

  constructor(aspect: number) {
    // GamePlayView.cs used Pi/4. ThirdPersonCamera.cs used a 330-unit zoom,
    // offset by (0, .2, 1), looking toward (0, .275, 0).
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.08, 550);
  }

  update(target: CameraTarget, frameSeconds: number, orbitInput: number): void {
    const distance = 3.3;
    const height = 0.66;

    if (!this.initialized) this.followingYaw = target.yaw;
    const yawDifference = Math.atan2(
      Math.sin(target.yaw - this.followingYaw),
      Math.cos(target.yaw - this.followingYaw),
    );
    this.followingYaw += yawDifference * (1 - Math.exp(-4.68 * frameSeconds));
    this.orbit = this.orbit * Math.exp(-2.2 * frameSeconds) + orbitInput * frameSeconds * 1.9;
    this.orbit = Math.max(-0.85, Math.min(0.85, this.orbit));

    const heading = this.followingYaw + this.orbit;
    this.desiredPosition.set(
      target.position.x + Math.sin(heading) * distance,
      target.position.y + height,
      target.position.z + Math.cos(heading) * distance,
    );
    this.desiredLookAt.set(
      target.position.x,
      target.position.y + 0.9075,
      target.position.z,
    );

    if (!this.initialized) {
      this.camera.position.copy(this.desiredPosition);
      this.lookAt.copy(this.desiredLookAt);
      this.initialized = true;
    } else {
      // ThirdPersonCamera.cs follows translation at .98 per 60 Hz tick.
      const positionBlend = 1 - Math.exp(-235 * frameSeconds);
      this.camera.position.lerp(this.desiredPosition, positionBlend);
      this.lookAt.lerp(this.desiredLookAt, positionBlend);
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
