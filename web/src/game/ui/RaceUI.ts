import type { RaceState } from '../race/raceState';
import { raceElapsedSeconds } from '../race/raceState';
import type { WorldSeed } from '../../core/random/seededRandom';
import { LEGACY_WORLD_SCALE, ORIGINAL_HANDLING, VEHICLE_STEP_SECONDS } from '../vehicle/vehicleController';

export type GraphicsQuality = 'low' | 'medium' | 'high';
type MenuPage = 'main' | 'setup' | 'options';

export interface RaceUICallbacks {
  start(seed: WorldSeed): void;
  resume(): void;
  restart(): void;
  menu(): void;
  qualityChanged(quality: GraphicsQuality): void;
  rainChanged(rain: boolean): void;
  volumeChanged(volume: number): void;
  fullscreen(): void;
}

export interface HudState {
  race: RaceState;
  speedKmh: number;
  seed: WorldSeed;
}

// HUDComponent.cs rotates the original needle through 240 degrees at MaxSpeed.
const MAX_NEEDLE_ANGLE = 240;
const MAX_GAUGE_SPEED_KMH = ORIGINAL_HANDLING.maxSpeed * LEGACY_WORLD_SCALE / VEHICLE_STEP_SECONDS * 3.6;

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
  private rain = false;
  private currentSeed: WorldSeed = '2013';
  private menuPage: MenuPage = 'main';
  private noticeUntil = 0;

  constructor(root: HTMLDivElement, callbacks: RaceUICallbacks) {
    this.callbacks = callbacks;
    root.innerHTML = `
      <div class="game-viewport"></div>
      <div class="vignette" aria-hidden="true"></div>
      <div class="race-hud" hidden>
        <div class="hud-top">
          <div class="hud-card timer-card"><span class="eyebrow">Race time</span><strong id="time-value">00:00.00</strong></div>
          <div class="hud-card lap-card"><span class="eyebrow">Lap</span><strong id="lap-value">01 / 03</strong></div>
        </div>
        <div class="hud-bottom">
          <div class="speedometer" aria-label="Speed in kilometres per hour">
            <img class="speedometer-face" src="/assets/hud/speedometer2.png" alt="" />
            <img class="speedometer-needle" id="speedometer-needle" src="/assets/hud/speedometer-needle.png" alt="" />
            <strong id="speed-value">000</strong>
          </div>
          <div class="track-readout"><span class="eyebrow">Next checkpoint</span><strong id="gate-value">01 / 06</strong><span id="seed-value"></span></div>
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
    root.addEventListener('input', this.onInput);
    root.addEventListener('keydown', this.onKeyDown);
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const menuPanel = button.closest<HTMLElement>('[data-menu-panel]');
    if (menuPanel && menuPanel.dataset.panelStatus !== 'active') return;
    switch (button.dataset.action) {
      case 'setup': this.setMenuPage('setup'); break;
      case 'options': this.setMenuPage('options'); break;
      case 'back': this.setMenuPage('main'); break;
      case 'quality-prev': this.changeQuality(-1); break;
      case 'quality-next': this.changeQuality(1); break;
      case 'rain-prev': this.changeRain(-1); break;
      case 'rain-next': this.changeRain(1); break;
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

  private readonly onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== 'master-volume') return;
    this.volume = Number(target.value) / 100;
    this.callbacks.volumeChanged(this.volume);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const menu = this.panel.querySelector('.menu-screen');
    if (!menu) return;
    if (event.key === 'Escape' && this.menuPage !== 'main') {
      event.preventDefault();
      event.stopPropagation();
      this.setMenuPage('main');
      return;
    }
    if (this.menuPage === 'options' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const option = (event.target as Element).closest<HTMLElement>('[data-option-row]')?.dataset.optionRow;
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      if (option === 'graphics') this.changeQuality(direction);
      else if (option === 'rain') this.changeRain(direction);
      else return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const activePanel = menu.querySelector<HTMLElement>('[data-panel-status="active"]');
    if (!activePanel) return;
    const controls = this.menuPage === 'options'
      ? [
          activePanel.querySelector<HTMLElement>('[data-action="quality-prev"]'),
          activePanel.querySelector<HTMLElement>('[data-action="rain-prev"]'),
          activePanel.querySelector<HTMLElement>('#master-volume'),
          activePanel.querySelector<HTMLElement>('[data-action="fullscreen"]'),
          activePanel.querySelector<HTMLElement>('[data-action="back"]'),
        ].filter((control): control is HTMLElement => control !== null)
      : [...activePanel.querySelectorAll<HTMLElement>('input, button')];
    const target = event.target as HTMLElement;
    const currentIndex = controls.findIndex((control) =>
      control === target || control.closest('[data-option-row]')?.contains(target));
    const movement = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(controls.length - 1, currentIndex + movement));
    event.preventDefault();
    event.stopPropagation();
    controls[nextIndex]?.focus({ preventScroll: true });
  };

  private changeQuality(direction: -1 | 1): void {
    const qualities: GraphicsQuality[] = ['low', 'medium', 'high'];
    const index = Math.max(0, Math.min(qualities.length - 1, qualities.indexOf(this.quality) + direction));
    const next = qualities[index];
    if (next === this.quality) return;
    this.quality = next;
    const value = this.panel.querySelector<HTMLOutputElement>('#graphics-quality-value');
    if (value) value.textContent = next[0].toUpperCase() + next.slice(1);
    this.callbacks.qualityChanged(next);
  }

  private changeRain(direction: -1 | 1): void {
    const next = direction > 0;
    if (next === this.rain) return;
    this.rain = next;
    const value = this.panel.querySelector<HTMLOutputElement>('#rain-enabled-value');
    if (value) value.textContent = next ? 'On' : 'Off';
    this.callbacks.rainChanged(next);
  }

  private setMenuPage(page: MenuPage): void {
    const menu = this.panel.querySelector('.menu-screen');
    if (!menu) return;
    this.menuPage = page;
    for (const menuPanel of menu.querySelectorAll<HTMLElement>('[data-menu-panel]')) {
      const name = menuPanel.dataset.menuPanel;
      const status = name === page ? 'active' : name === 'main' ? 'previous' : 'future';
      menuPanel.dataset.panelStatus = status;
      menuPanel.inert = status !== 'active';
      menuPanel.setAttribute('aria-hidden', String(status !== 'active'));
    }
    const activePanel = menu.querySelector<HTMLElement>('[data-panel-status="active"]');
    const firstControl = page === 'setup' ? '#world-seed'
      : page === 'options' ? 'button[data-action="quality-prev"]'
        : 'button[data-action="setup"]';
    activePanel?.querySelector<HTMLElement>(firstControl)?.focus({ preventScroll: true });
  }

  showMenu(seed: WorldSeed = this.currentSeed): void {
    this.currentSeed = seed;
    this.hud.hidden = true;
    this.countdown.textContent = '';
    this.notice.textContent = '';
    this.panel.hidden = false;
    this.panel.innerHTML = `
      <main class="menu-screen">
        <img class="legacy-logo" src="/assets/menu/menu-title.png" alt="Night Racer" />
        <div class="menu-carousel">
          <section class="menu-content menu-panel-main" data-menu-panel="main" aria-label="Main Menu">
            <h1>Main Menu</h1>
            <div class="menu-actions">
              <button class="primary-button" data-action="setup">Play</button>
              <button class="secondary-button" data-action="options">Options</button>
            </div>
          </section>
          <section class="menu-content menu-panel-setup" data-menu-panel="setup" aria-label="Race Setup">
            <h2>Race Setup</h2>
            <div class="menu-setup-body">
              <div class="legacy-option-row seed-row">
                <label for="world-seed">Course Seed</label>
                <input id="world-seed" type="text" maxlength="48" value="${escapeHtml(String(seed))}" autocomplete="off" spellcheck="false" />
              </div>
              <button class="secondary-button" data-action="random">Random Seed</button>
            </div>
            <div class="menu-actions menu-bottom-actions">
              <button class="primary-button" data-action="play">Start Race</button>
              <button class="secondary-button" data-action="back">Back</button>
            </div>
          </section>
          <section class="menu-content menu-panel-options" data-menu-panel="options" aria-label="Options">
            <h2>Options</h2>
            <div class="legacy-option-list">
              <div class="legacy-option-row" data-option-row="graphics">
                <span>Graphics</span>
                <div class="legacy-option-value">
                  <button class="option-arrow" data-action="quality-prev" aria-label="Previous graphics quality"><img src="/assets/menu/menu-left-arrow.png" alt="" /></button>
                  <output id="graphics-quality-value">${this.quality[0].toUpperCase() + this.quality.slice(1)}</output>
                  <button class="option-arrow" data-action="quality-next" aria-label="Next graphics quality"><img src="/assets/menu/menu-right-arrow.png" alt="" /></button>
                </div>
              </div>
              <div class="legacy-option-row" data-option-row="rain">
                <span>Rain</span>
                <div class="legacy-option-value">
                  <button class="option-arrow" data-action="rain-prev" aria-label="Turn rain off"><img src="/assets/menu/menu-left-arrow.png" alt="" /></button>
                  <output id="rain-enabled-value">${this.rain ? 'On' : 'Off'}</output>
                  <button class="option-arrow" data-action="rain-next" aria-label="Turn rain on"><img src="/assets/menu/menu-right-arrow.png" alt="" /></button>
                </div>
              </div>
              <label class="legacy-option-row" for="master-volume">
                <span>Volume</span>
                <input id="master-volume" aria-label="Volume" type="range" min="0" max="100" value="${Math.round(this.volume * 100)}" />
              </label>
            </div>
            <div class="menu-actions menu-bottom-actions">
              <button class="secondary-button" data-action="fullscreen">Fullscreen</button>
              <button class="secondary-button" data-action="back">Back</button>
            </div>
          </section>
        </div>
      </main>
    `;
    this.setMenuPage('main');
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
          <button class="primary-button" data-action="resume">Resume</button>
          <button class="secondary-button" data-action="restart">Restart Course</button>
          <button class="secondary-button" data-action="menu">Main Menu</button>
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
          <button class="primary-button" data-action="restart">Race Again</button>
          <button class="secondary-button" data-action="new-seed">New Course</button>
          <button class="secondary-button" data-action="menu">Main Menu</button>
        </div>
      </div>
    `;
  }

  updateHud({ race, speedKmh, seed }: HudState): void {
    this.hud.querySelector('#lap-value')!.textContent = `${String(race.currentLap).padStart(2, '0')} / ${String(race.totalLaps).padStart(2, '0')}`;
    this.hud.querySelector('#time-value')!.textContent = formatTime(raceElapsedSeconds(race));
    this.hud.querySelector('#gate-value')!.textContent = `${String(race.nextCheckpointIndex + 1).padStart(2, '0')} / ${String(race.checkpoints.length).padStart(2, '0')}`;
    this.hud.querySelector('#speed-value')!.textContent = String(Math.max(0, Math.round(Math.abs(speedKmh)))).padStart(3, '0');
    const needleAngle = Math.min(MAX_NEEDLE_ANGLE, Math.abs(speedKmh) / MAX_GAUGE_SPEED_KMH * MAX_NEEDLE_ANGLE);
    (this.hud.querySelector('#speedometer-needle') as HTMLImageElement).style.transform = `rotate(${needleAngle}deg)`;
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
