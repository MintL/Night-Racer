export interface PlayerControls {
  throttle: number;
  brake: number;
  steer: number;
  cameraOrbit: number;
  resetPressed: boolean;
  pausePressed: boolean;
}

const DRIVING_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyP', 'Escape',
]);

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

function gamepadButton(gamepad: Gamepad, index: number): number {
  return gamepad.buttons[index]?.value ?? 0;
}

export class PlayerInput {
  private readonly held = new Set<string>();
  private resetPending = false;
  private pausePending = false;
  private previousGamepadReset = false;
  private previousGamepadPause = false;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    if (DRIVING_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat && event.code === 'KeyR') this.resetPending = true;
    if (!event.repeat && (event.code === 'Escape' || event.code === 'KeyP')) this.pausePending = true;
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
  };

  sample(): PlayerControls {
    const gamepad = navigator.getGamepads?.().find((pad): pad is Gamepad => pad !== null);
    // VehicleController follows the original XNA convention: positive is left.
    const keyboardSteer = Number(this.held.has('KeyA') || this.held.has('ArrowLeft'))
      - Number(this.held.has('KeyD') || this.held.has('ArrowRight'));
    const analogSteer = gamepad && Math.abs(gamepad.axes[0] ?? 0) > 0.12 ? -gamepad.axes[0] : 0;

    const gamepadReset = gamepad ? gamepadButton(gamepad, 3) > 0.5 : false;
    const gamepadPause = gamepad ? gamepadButton(gamepad, 9) > 0.5 : false;
    const resetPressed = this.resetPending || (gamepadReset && !this.previousGamepadReset);
    const pausePressed = this.pausePending || (gamepadPause && !this.previousGamepadPause);
    this.previousGamepadReset = gamepadReset;
    this.previousGamepadPause = gamepadPause;
    this.resetPending = false;
    this.pausePending = false;

    return {
      throttle: Math.max(Number(this.held.has('KeyW') || this.held.has('ArrowUp')), gamepad ? gamepadButton(gamepad, 7) : 0),
      brake: Math.max(Number(this.held.has('KeyS') || this.held.has('ArrowDown') || this.held.has('Space')), gamepad ? gamepadButton(gamepad, 6) : 0),
      steer: Math.max(-1, Math.min(1, keyboardSteer || analogSteer)),
      cameraOrbit: Number(this.held.has('KeyE')) - Number(this.held.has('KeyQ')) + (gamepad?.axes[2] ?? 0),
      resetPressed,
      pausePressed,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
