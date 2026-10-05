import './style.css';
import { RallyGame } from './app/RallyGame';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found');
}

new RallyGame(app);
