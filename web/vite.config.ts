import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this repository below /Night-Racer/.
  base: command === 'build' ? '/Night-Racer/' : '/',
}));
