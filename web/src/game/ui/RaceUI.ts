import type { RaceState } from '../race/raceState';
import { raceElapsedSeconds } from '../race/raceState';
import type { WorldSeed } from '../../core/random/seededRandom';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface RaceUICallbacks {
  start(seed: WorldSeed): void;
  resume(): void;
  restart(): void;
  menu(): void;
  qualityChanged(quality: GraphicsQuality): void;
  volumeChanged(volume: number): void;
  fullscreen(): void;
}

export interface HudState {
  race: RaceState;
  speedKmh: number;
  seed: WorldSeed;
}

function randomSeed(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0]);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export function formatTime(seconds: number): string {
  const totalCentiseconds = Math.max(0, Math.floor(seconds * 100));
  const minutes = Math.floor(totalCentiseconds / 6000);
  const remainder = totalCentiseconds % 6000;
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(remainder / 100)).padStart(2, '0')}.${String(remainder % 100).padStart(2, '0')}`;
}

export class RaceUI {
  readonly viewport: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  private readonly notice: HTMLDivElement;
  private readonly callbacks: RaceUICallbacks;
  private quality: GraphicsQuality = 'medium';
  private volume = 0.55;
  private currentSeed: WorldSeed = '2013';
  private noticeUntil = 0;

  constructor(root: HTMLDivElement, callbacks: RaceUICallbacks) {
    this.callbacks = callbacks;
    root.innerHTML = `
      <div class="game-viewport"></div>
      <div class="vignette" aria-hidden="true"></div>
      <div class="race-hud" hidden>
        <div class="hud-top">
          <div class="hud-card lap-card"><span class="eyebrow">Lap</span><strong id="lap-value">01 / 03</strong></div>
          <div class="hud-card timer-card"><span class="eyebrow">Race time</span><strong id="time-value">00:00.00</strong></div>
        </div>
        <div class="hud-bottom">
          <div class="track-readout"><span class="eyebrow">Next gate</span><strong id="gate-value">01 / 06</strong><span id="seed-value"></span></div>
          <div class="speed-readout"><strong id="speed-value">000</strong><span>KM/H</span></div>
        </div>
      </div>
      <div class="countdown" aria-live="polite"></div>
      <div class="race-notice" aria-live="polite"></div>
      <div class="screen-panel"></div>
    `;
    this.viewport = root.querySelector<HTMLDivElement>('.game-viewport')!;
    this.panel = root.querySelector<HTMLDivElement>('.screen-panel')!;
    this.hud = root.querySelector<HTMLDivElement>('.race-hud')!;
    this.countdown = root.querySelector<HTMLDivElement>('.countdown')!;
    this.notice = root.querySelector<HTMLDivElement>('.race-notice')!;
    root.addEventListener('click', this.onClick);
    root.addEventListener('change', this.onChange);
    root.addEventListener('input', this.onInput);
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    switch (button.dataset.action) {
      case 'play': {
        const input = this.panel.querySelector<HTMLInputElement>('#world-seed');
        const seed = input?.value.trim() || randomSeed();
        this.callbacks.start(seed);
        break;
      }
      case 'random': {
        const input = this.panel.querySelector<HTMLInputElement>('#world-seed');
        if (input) input.value = randomSeed();
        break;
      }
      case 'resume': this.callbacks.resume(); break;
      case 'restart': this.callbacks.restart(); break;
      case 'menu': this.callbacks.menu(); break;
      case 'new-seed': this.callbacks.start(randomSeed()); break;
      case 'fullscreen': this.callbacks.fullscreen(); break;
    }
  };

  private readonly onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.id !== 'graphics-quality') return;
    this.quality = target.value as GraphicsQuality;
    this.callbacks.qualityChanged(this.quality);
  };

  private readonly onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== 'master-volume') return;
    this.volume = Number(target.value) / 100;
    this.callbacks.volumeChanged(this.volume);
  };

  showMenu(seed: WorldSeed = this.currentSeed): void {
    this.currentSeed = seed;
    this.hud.hidden = true;
    this.countdown.textContent = '';
    this.notice.textContent = '';
    this.panel.hidden = false;
    this.panel.innerHTML = `
      <main class="menu-screen">
        <div class="menu-content">
          <div class="brand-mark"><span class="brand-dash"></span> DATX / 02</div>
          <p class="overline">A procedural rally experience</p>
          <h1>NIGHT<br><em>RACER.</em></h1>
          <p class="menu-description">One seed. One winding road. Three laps through the dusk.</p>
          <label class="seed-label" for="world-seed">Course seed</label>
          <div class="seed-control">
            <input id="world-seed" type="text" maxlength="48" value="${escapeHtml(String(seed))}" autocomplete="off" spellcheck="false" />
            <button class="icon-button" data-action="random" title="Random seed" aria-label="Random seed">↻</button>
          </div>
          <button class="primary-button" data-action="play">START RACE <span>↗</span></button>
          <details class="settings">
            <summary>Settings & controls</summary>
            <div class="settings-grid">
              <label>Graphics <select id="graphics-quality">
                <option value="low" ${this.quality === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${this.quality === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${this.quality === 'high' ? 'selected' : ''}>High</option>
              </select></label>
              <label>Volume <input id="master-volume" type="range" min="0" max="100" value="${Math.round(this.volume * 100)}" /></label>
            </div>
            <button class="text-button" data-action="fullscreen">Toggle fullscreen ↗</button>
          </details>
        </div>
        <div class="menu-aside"><span>WASD / ARROWS · DRIVE</span><span>R · RESET</span><span>Q / E · CAMERA</span><span>ESC · PAUSE</span><span>GAMEPAD SUPPORTED</span></div>
      </main>
    `;
  }

  showLoading(seed: WorldSeed): void {
    this.currentSeed = seed;
    this.hud.hidden = true;
    this.panel.hidden = false;
    this.panel.innerHTML = '<div class="center-screen"><span class="overline">Building course</span><h2>Carving the road…</h2></div>';
  }

  showRace(): void {
    this.panel.hidden = true;
    this.hud.hidden = false;
  }

  showPause(): void {
    this.panel.hidden = false;
    this.panel.innerHTML = `
      <div class="center-screen">
        <span class="overline">Race paused</span><h2>Catch your breath.</h2>
        <div class="button-stack">
          <button class="primary-button" data-action="resume">RESUME <span>↗</span></button>
          <button class="secondary-button" data-action="restart">RESTART COURSE</button>
          <button class="text-button" data-action="menu">MAIN MENU</button>
        </div>
      </div>
    `;
  }

  showResults(race: RaceState): void {
    this.countdown.textContent = '';
    this.panel.hidden = false;
    const laps = race.lapTimesSeconds.map((time, index) =>
      `<li><span>Lap ${index + 1}</span><strong>${formatTime(time)}</strong></li>`).join('');
    this.panel.innerHTML = `
      <div class="center-screen results-screen">
        <span class="overline">Finish line</span><h2>Course complete.</h2>
        <div class="result-time"><span>Total time</span><strong>${formatTime(raceElapsedSeconds(race))}</strong></div>
        <ol class="lap-list">${laps}</ol>
        <div class="button-stack">
          <button class="primary-button" data-action="restart">RACE AGAIN <span>↗</span></button>
          <button class="secondary-button" data-action="new-seed">NEW COURSE</button>
          <button class="text-button" data-action="menu">MAIN MENU</button>
        </div>
      </div>
    `;
  }

  updateHud({ race, speedKmh, seed }: HudState): void {
    this.hud.querySelector('#lap-value')!.textContent = `${String(race.currentLap).padStart(2, '0')} / ${String(race.totalLaps).padStart(2, '0')}`;
    this.hud.querySelector('#time-value')!.textContent = formatTime(raceElapsedSeconds(race));
    this.hud.querySelector('#gate-value')!.textContent = `${String(race.nextCheckpointIndex + 1).padStart(2, '0')} / ${String(race.checkpoints.length).padStart(2, '0')}`;
    this.hud.querySelector('#speed-value')!.textContent = String(Math.max(0, Math.round(Math.abs(speedKmh)))).padStart(3, '0');
    this.hud.querySelector('#seed-value')!.textContent = `SEED ${seed}`;
    this.countdown.textContent = race.phase === 'countdown'
      ? String(Math.ceil(race.countdownTicks / 60))
      : race.phase === 'racing' && race.elapsedTicks < 45 ? 'GO!' : '';
    if (performance.now() > this.noticeUntil) this.notice.textContent = '';
  }

  notify(message: string): void {
    this.notice.textContent = message;
    this.noticeUntil = performance.now() + 1700;
  }

  get selectedQuality(): GraphicsQuality { return this.quality; }
  get selectedVolume(): number { return this.volume; }
}
