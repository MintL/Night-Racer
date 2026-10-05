import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found');
}

app.innerHTML = '<main class="startup">Preparing the rally course…</main>';
