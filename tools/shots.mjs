// Renders real PNG screenshots of each game state using a native canvas.
// Not part of the game - a dev tool for visual checking.
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';

const OUT = new URL('../shots/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

const storage = new Map();

class FakeElement {
  constructor() {
    this.style = {};
    this.textContent = '';
  }
  addEventListener() {}
  appendChild() {}
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(4, 4);
    return new FakeElement();
  },
  getElementById() {
    return new FakeElement();
  },
  addEventListener() {},
  hidden: false,
  body: new FakeElement(),
};

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
};

globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const { buildAllSprites } = await import('../src/sprites.js');
const { Input } = await import('../src/input.js');
const { Game, STATE } = await import('../src/game.js');
const { VIEW_W, VIEW_H } = await import('../src/data.js');

buildAllSprites();

const canvas = createCanvas(VIEW_W, VIEW_H);
// Stub out the DOM event API the Input layer expects.
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: VIEW_W, height: VIEW_H, right: VIEW_W, bottom: VIEW_H });
canvas.style = {};

const input = new Input(canvas, VIEW_W, VIEW_H);
const game = new Game(canvas, input);

function shot(name) {
  fs.writeFileSync(new URL(`${name}.png`, OUT), canvas.toBuffer('image/png'));
  console.log(`wrote shots/${name}.png`);
}

function step(n = 1, dt = 1 / 60) {
  for (let i = 0; i < n; i++) {
    game.update(dt);
    game.render();
  }
}

// ---------------------------------------------------------------- title
step(20);
shot('01-title');

// ------------------------------------------------------------------ hub
game.save.gold = 1240;
game.save.pickaxe = 3;
game.save.sword = 3;
game.enterHub();
game.player.x = game.scene.portal.x - 40;
game.player.y = game.scene.portal.y - 90;
step(30);
shot('02-hub');

// ----------------------------------------------------------------- shop
game.openShop();
step(2);
shot('03-shop-pickaxes');
game.shopTab = 'sword';
step(1);
shot('04-shop-swords');
game.shopTab = 'supply';
step(1);
shot('05-shop-supplies');
game.closeShop();

// ------------------------------------------------------------------ mine
game.startRun();
step(30);
shot('06-mine-mining');

// stand next to an ore and swing
const ore = game.scene.oreNodes[0];
game.player.x = ore.x - 30;
game.player.y = ore.y + 6;
game.player.facing = { x: 1, y: 0 };
input.mouse.x = ore.x;
input.mouse.y = ore.y;
input.mouse.down = true;
step(90);
shot('07-mine-ore');
input.mouse.down = false;

// ----------------------------------------------------------------- fight
game.startFight();
for (let i = 0; i < 260; i++) step(1);
// pull mobs close for a dramatic frame
for (const m of game.mobs) {
  const a = Math.random() * Math.PI * 2;
  m.x = game.player.x + Math.cos(a) * (60 + Math.random() * 50);
  m.y = game.player.y + Math.sin(a) * (50 + Math.random() * 40);
}
game.player.attackAnim = 0.18;
game.player.swingAngle = 0.4;
input.mouse.x = game.player.x + 40;
input.mouse.y = game.player.y + 10;
input.mouse.down = true;
step(3);
shot('08-fight');
input.mouse.down = false;

// ------------------------------------------------------------------ boss
game.wave = 6;
game.scene.biome = { name: 'Frozen Hollow', floor: ['#3d5070', '#364863'], wall: ['#243044', '#1b2534'], accent: '#7fe6ff' };
game.waveState = 'fight';
game.spawnQueue = [];
game.mobs = [];
game.player.x = 480;
game.player.y = 330;
const boss = game.spawnMobAt('boss', 600, 300, 1.2);
boss.hp = Math.round(boss.maxHp * 0.55);
game.spawnMobAt('skeleton', 540, 250, 1);
game.spawnMobAt('wraith', 380, 280, 1);
game.spawnMobAt('slime', 430, 380, 1);
for (let i = 0; i < 8; i++) { for (const m of game.mobs) { m.x += (game.player.x - m.x) * 0.06; m.y += (game.player.y - m.y) * 0.06; } step(1); }
input.mouse.x = boss.x; input.mouse.y = boss.y;
input.mouse.down = true;
step(3);
shot('09-boss-wave');
input.mouse.down = false;

// --------------------------------------------------------------- summary
game.leaveMine('dead');
step(2);
shot('10-dead-summary');
game.summary.reason = 'retreat';
step(1);
shot('11-run-complete');

console.log('done');
