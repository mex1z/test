import { Game } from './game.js';
import { Input } from './input.js';
import { buildAllSprites } from './sprites.js';
import { setupLobby } from './lobby.js';

const LOGICAL_W = 960;
const LOGICAL_H = 576;

function fatal(message) {
  const el = document.getElementById('fatal');
  if (!el) return;
  el.style.display = 'flex';
  el.textContent = `Deepmine failed to start\n\n${message}`;
}

function fit(canvas) {
  const pad = window.innerWidth < 640 ? 6 : 28;
  const availW = window.innerWidth - pad * 2;
  const availH = window.innerHeight - (window.innerWidth < 640 ? 12 : 58);
  let scale = Math.min(availW / LOGICAL_W, availH / LOGICAL_H);
  // Prefer whole-pixel scaling for crisp sprites, but never shrink too small.
  if (scale >= 1) scale = Math.floor(scale * 4) / 4;
  scale = Math.max(0.35, scale);
  canvas.style.width = `${Math.round(LOGICAL_W * scale)}px`;
  canvas.style.height = `${Math.round(LOGICAL_H * scale)}px`;
}

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) throw new Error('canvas #game missing');

  buildAllSprites();

  const input = new Input(canvas, LOGICAL_W, LOGICAL_H);
  const game = new Game(canvas, input);
  window.__game = game; // handy for debugging in the console
  setupLobby(game);

  fit(canvas);
  window.addEventListener('resize', () => fit(canvas));

  // Pause automatically when the tab is hidden so the player isn't mauled.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.input.keys.clear();
      game.input.mouse.down = false;
      if (game.state === 'mine') game.paused = true;
    }
  });

  let last = performance.now();
  let raf = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    try {
      game.update(dt);
      game.render();
    } catch (err) {
      cancelAnimationFrame(raf);
      console.error(err);
      fatal(err && err.stack ? err.stack : String(err));
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // Keep the mouse cursor state sane when the pointer leaves the canvas.
  canvas.addEventListener('mouseleave', () => {
    input.mouse.down = false;
  });
}

try {
  boot();
} catch (err) {
  console.error(err);
  fatal(err && err.stack ? err.stack : String(err));
}
