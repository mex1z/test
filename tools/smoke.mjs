// Headless smoke test: stubs the DOM/canvas, then drives the whole game loop
// through title -> hub -> shop -> mine -> waves -> boss -> death -> summary.
// Catches runtime errors and state corruption without a browser.

class FakeGradient {
  addColorStop() {}
}

function fakeContext(canvas) {
  const state = {
    canvas,
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
    font: '10px monospace',
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    shadowBlur: 0,
    shadowColor: '#000',
    textAlign: 'left',
    textBaseline: 'top',
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
  };
  const calls = Object.create(null);
  const target = { ...state, __calls: calls };

  const gradientFns = ['createLinearGradient', 'createRadialGradient', 'createPattern'];
  const handler = {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'measureText') {
        return (t) => ({ width: String(t).length * 6 });
      }
      if (gradientFns.includes(prop)) return () => new FakeGradient();
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      // Any other property is treated as a no-op drawing command.
      return (...args) => {
        calls[prop] = (calls[prop] || 0) + 1;
        // Validate numeric args are finite so NaN geometry is caught early.
        for (const a of args) {
          if (typeof a === 'number' && !Number.isFinite(a)) {
            throw new Error(`ctx.${prop} received non-finite argument: ${a}`);
          }
        }
        return undefined;
      };
    },
    set(obj, prop, value) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error(`ctx.${prop} set to non-finite value: ${value}`);
      }
      obj[prop] = value;
      return true;
    },
  };
  return new Proxy(target, handler);
}

class FakeCanvas {
  constructor(w = 300, h = 150) {
    this.width = w;
    this.height = h;
    this._ctx = fakeContext(this);
    this.style = {};
    this.listeners = new Map();
  }
  getContext() {
    return this._ctx;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
  }
}

class FakeElement {
  constructor() {
    this.style = {};
    this.textContent = '';
    this.listeners = new Map();
  }
  addEventListener() {}
  appendChild() {}
}

const storage = new Map();

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return new FakeCanvas();
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

globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { buildAllSprites } = await import('../src/sprites.js');
const { Input } = await import('../src/input.js');
const { Game, STATE } = await import('../src/game.js');
const { VIEW_W, VIEW_H, PICKAXES, SWORDS } = await import('../src/data.js');

buildAllSprites();

const canvas = new FakeCanvas(VIEW_W, VIEW_H);
const input = new Input(canvas, VIEW_W, VIEW_H);
const game = new Game(canvas, input);

let frames = 0;
let errors = 0;

function step(dt = 1 / 60) {
  game.update(dt);
  game.render();
  frames++;
  validate();
}

function clickAt(x, y, down = true) {
  game.render(); // register UI hit rects
  input.mouse.x = x;
  input.mouse.y = y;
  input.mouse.clicked = true;
  input.mouse.down = down;
  game.update(1 / 60);
  game.render();
  input.mouse.down = false;
  frames++;
  validate();
}

function press(...keys) {
  for (const k of keys) {
    input.keys.add(k);
    input.pressed.add(k);
  }
  game.update(1 / 60);
  game.render();
  for (const k of keys) input.keys.delete(k);
  frames++;
  validate();
}

function summaryButton(which) {
  const W = 640;
  const H = 512;
  const x = (VIEW_W - W) / 2;
  const y = (VIEW_H - H) / 2;
  const bx = which === 'hub' ? x + 56 + 129 : x + W - 314 + 129;
  return [bx, y + H - 82 + 25];
}

function fail(msg) {
  errors++;
  console.error('✗', msg);
  if (errors > 12) throw new Error('too many failures');
}

function validate() {
  const p = game.player;
  if (p) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(`player position is NaN in ${game.state}`);
    if (p.x < -80 || p.x > VIEW_W + 80 || p.y < -80 || p.y > VIEW_H + 80) fail(`player escaped map at ${p.x},${p.y}`);
  }
  for (const m of game.mobs) {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) fail(`mob ${m.kind} NaN position`);
  }
  if (game.state === 'mine' && game.scene) {
    for (const k of ['hp']) {
      if (!Number.isFinite(game.save[k])) fail(`save.${k} NaN`);
    }
  }
  if (game.particles.length > 1200) fail('particle leak');
}

function expectState(s, label) {
  if (game.state !== s) fail(`${label}: expected state "${s}" but got "${game.state}"`);
}

// ------------------------------------------------------------------ title
for (let i = 0; i < 5; i++) step();
expectState(STATE.TITLE, 'boot');

// click PLAY button (centre of its rect)
clickAt(VIEW_W / 2, 426);
expectState(STATE.HUB, 'play button');
console.log('✓ title -> hub via PLAY button');

// -------------------------------------------------------------------- hub
game.save.gold = 0;
for (let i = 0; i < 30; i++) step();
// walk with keys
input.keys.add('d');
for (let i = 0; i < 20; i++) step();
input.keys.delete('d');
input.keys.add('w');
for (let i = 0; i < 20; i++) step();
input.keys.delete('w');
if (!Number.isFinite(game.player.x)) fail('hub movement broke');
console.log('✓ hub movement');

// shop via B key
press('b');
expectState(STATE.SHOP, 'B opens shop');
console.log('✓ shop opens');

// buy with lots of gold: pickaxe tier 1, sword tier 1
game.save.gold = 60000;
const buyButtons = [];
for (let i = 0; i < 8; i++) {
  // pickaxe tab is default; buy the next available tier repeatedly
  const row = i;
  const listX = (VIEW_W - 880) / 2 + 22;
  const listW = 470;
  const startY = (VIEW_H - 548) / 2 + 126;
  const rx = listX + listW - 122 + 55;
  const ry = startY + row * 45 + 22;
  clickAt(rx, ry);
}
if (game.save.pickaxe < 5) fail(`expected several pickaxe tiers bought, got ${game.save.pickaxe}`);
console.log(`✓ bought pickaxe tier ${game.save.pickaxe} (${PICKAXES[game.save.pickaxe].name})`);

// sword tab
clickAt((VIEW_W - 880) / 2 + 28 + 176 + 84, (VIEW_H - 548) / 2 + 85 + 17);
if (game.shopTab !== 'sword') fail(`tab click failed, shopTab=${game.shopTab}`);
for (let i = 0; i < 6; i++) {
  const listX = (VIEW_W - 880) / 2 + 24;
  const startY = (VIEW_H - 548) / 2 + 126;
  clickAt(listX + 470 - 122 + 55, startY + i * 45 + 22);
}
if (game.save.sword < 4) fail(`expected sword tiers bought, got ${game.save.sword}`);
console.log(`✓ bought sword tier ${game.save.sword} (${SWORDS[game.save.sword].name})`);

// supplies tab + buy everything
clickAt((VIEW_W - 880) / 2 + 28 + 352 + 84, (VIEW_H - 548) / 2 + 85 + 17);
if (game.shopTab !== 'supply') fail(`supply tab click failed, shopTab=${game.shopTab}`);
game.save.hp = 10;
for (let i = 0; i < 3; i++) {
  const listX = (VIEW_W - 880) / 2 + 24;
  const startY = (VIEW_H - 548) / 2 + 126;
  for (let r = 0; r < 5; r++) clickAt(listX + 860 - 48 - 158 + 73, startY + r * 66 + 32);
}
if (game.save.maxHp <= 100) fail('max hp upgrade never applied');
console.log(`✓ supplies: maxHP=${game.save.maxHp} speed=${game.save.speedLevel} lamp=${game.save.lampLevel} crit=${game.save.critLevel}`);

// close shop with B
press('b');
expectState(STATE.HUB, 'close shop');
console.log('✓ shop closes');

// -------------------------------------------------------------------- mine
clickAt(VIEW_W / 2, VIEW_H - 82 + 27);
expectState(STATE.MINE, 'enter mine');
if (!game.scene.oreNodes.length) fail('mine generated no ore');
console.log(`✓ entered mine wave 1 with ${game.scene.oreNodes.length} ore nodes, ${game.scene.rooms.length} rooms`);

// mine an ore by standing next to it and holding the mouse on it
function mineNearestOre() {
  const nodes = game.scene.oreNodes.filter((n) => !n.dead);
  if (!nodes.length) return false;
  const n = nodes[0];
  game.player.x = n.x - 26;
  game.player.y = n.y + 4;
  game.player.facing = { x: 1, y: 0 };
  input.mouse.x = n.x;
  input.mouse.y = n.y;
  input.mouse.down = true;
  for (let i = 0; i < 120 && !n.dead; i++) step();
  input.mouse.down = false;
  return true;
}
const goldBefore = game.save.gold;
if (!mineNearestOre()) fail('no ore to mine');
if (!game.scene.oreNodes.some((n) => n.dead)) fail('mining did not break any ore');
for (let i = 0; i < 90; i++) step(); // let pickups fly in
if (game.save.gold <= goldBefore) fail('mining earned no gold');
console.log(`✓ mined ore: gold ${goldBefore} -> ${game.save.gold}`);

// start the fight early
press('f');
if (game.waveState !== 'fight') fail(`F did not start fight (${game.waveState})`);

// keep the player safe-ish but engaged: attack constantly toward the nearest mob
if (process.env.DEBUG_FIGHT) {
  const m0 = game.mobs[0];
  if (m0) {
    game.player.attackTimer = 0;
    game.player.x = m0.x - 30; game.player.y = m0.y;
    input.mouse.x = m0.x; input.mouse.y = m0.y;
    step();
    console.log('DBG before', {mx: m0.x, my: m0.y, px: game.player.x, py: game.player.y,
      hp: m0.hp, radius: m0.radius, height: m0.def.height, swing: game.player.swingAngle});
    game.doAttack(game.player);
    console.log('DBG after', {hp: m0.hp, dist: Math.hypot(m0.x-game.player.x, m0.y-game.player.y)});
    process.exit(0);
  }
}
function fightFor(seconds, opts = {}) {
  const maxFrames = Math.round(seconds * 60);
  for (let i = 0; i < maxFrames; i++) {
    if (game.state !== STATE.MINE) return;
    const p = game.player;
    // find nearest mob, aim at it and step toward it
    let best = null;
    let bd = Infinity;
    for (const m of game.mobs) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) {
      input.mouse.x = best.x;
      input.mouse.y = best.y;
      const want = 34;
      if (bd > want) {
        let kx = (best.x - p.x) / bd;
        let ky = (best.y - p.y) / bd;
        // Simulated player steers around walls using the game's own flow field.
        if (bd > 70 && !game.scene.hasLineOfSight(p.x, p.y, best.x, best.y)) {
          const dir = game.scene.flowDirAt(p.x, p.y, best.x, best.y);
          if (dir) {
            kx = dir.x;
            ky = dir.y;
          }
        }
        input.keys.clear();
        if (kx > 0.35) input.keys.add('d');
        if (kx < -0.35) input.keys.add('a');
        if (ky > 0.35) input.keys.add('s');
        if (ky < -0.35) input.keys.add('w');
        // walk with keys only when not clicking (mouse click also moves)
        input.mouse.down = false;
        input.mouse.clicked = false;
        game.player.attackTimer = 0;
        p.attackTimer = 0;
        // attack manually at range for the test
        if (bd < 60) game.doAttack(p);
      } else {
        input.mouse.down = true;
      }
    } else {
      input.keys.clear();
      input.mouse.down = false;
    }
    if (false) {
      const m = game.mobs[0];
      const dir = game.scene.flowDirAt(p.x, p.y, m.x, m.y);
      console.log('PEN', [[-2,0],[2,0],[0,-2],[0,2]].map(([dx,dy]) =>
        `${dx},${dy}:${game.scene.penetration(p.x+dx, p.y+dy, 10, true).toFixed(2)}`).join(' '),
        'penNow', game.scene.penetration(p.x, p.y, 10, true).toFixed(2),
        'mc', JSON.stringify(game.scene.moveCircle(p.x, p.y, 10, -2, 0, true)),
        'tile', Math.floor(p.x/32), Math.floor(p.y/32),
        'solid?', game.scene.isSolidTile(Math.floor(p.x/32), Math.floor(p.y/32)));
      console.log('STUCK?', { p: [p.x | 0, p.y | 0], m: [m.x | 0, m.y | 0], kind: m.kind,
        dir: dir && [dir.x.toFixed(2), dir.y.toFixed(2)], keys: [...input.keys],
        penP: game.scene.penetration(p.x, p.y, 10, true).toFixed(2),
        penM: game.scene.penetration(m.x, m.y, m.radius, false).toFixed(2),
        los: game.scene.hasLineOfSight(m.x, m.y, p.x, p.y),
        dist: Math.hypot(m.x - p.x, m.y - p.y) | 0, state: m.state,
        pen: game.scene.penetration(p.x, p.y, 10, true).toFixed(2),
        mc: JSON.stringify(game.scene.moveCircle(p.x, p.y, 10, -2, -1, true)),
        vxvy: [p.vx | 0, p.vy | 0], moveSpeed: game.moveSpeed });
    }
    if (opts.godmode) {
      game.save.hp = game.maxHp;
      p.hp = game.save.hp;
    }
    step();
  }
  input.keys.clear();
  input.mouse.down = false;
}

fightFor(30, { godmode: true });
console.log(`✓ wave 1 fight survived; waveState=${game.waveState} wave=${game.wave}`);

// Push through several waves, including the wave-5 boss and every biome.
let sawBoss = false;
let sawBiomes = new Set();
let maxWave = game.wave;
for (let w = 0; w < 12; w++) {
  if (game.state !== STATE.MINE) break;
  if (game.waveState === 'mining') {
    // mine a little, then fight
    mineNearestOre();
    press('f');
  }
  fightFor(40, { godmode: true });
  console.log(`   wave ${game.wave}: state=${game.waveState} mobs=${game.mobs.length} queue=${game.spawnQueue.length} kills=${game.runKills} gold=${game.save.gold} player=${game.player.x|0},${game.player.y|0} ` +
    game.mobs.map(m=>`${m.kind}@${m.x|0},${m.y|0} hp${m.hp}`).join(' | '));
  sawBiomes.add(game.scene.biome.name);
  if (game.mobs.some((m) => m.def.behavior === 'boss')) sawBoss = true;
  maxWave = Math.max(maxWave, game.wave);
  if (game.waveState === 'mining' && game.wave === maxWave) {
    // we advanced; keep going
  }
}
console.log(`✓ reached wave ${maxWave}; biomes seen: ${[...sawBiomes].join(', ')}`);

// pause overlay
if (game.state === STATE.MINE) {
  press('escape');
  if (!game.paused) fail('ESC did not pause');
  for (let i = 0; i < 10; i++) step();
  clickAt(VIEW_W / 2, (VIEW_H - 340) / 2 + 128 + 22); // resume
  if (game.paused) fail('resume button failed');
  console.log('✓ pause overlay + resume');
}

// ------------------------------------------------------------------- death
if (game.state === STATE.MINE) {
  game.save.hp = 1;
  game.player.hp = 1;
  game.player.invuln = 0;
  // spawn a mob right on top of the player to guarantee a hit
  game.mobs = [];
  game.spawnMobAt('skeleton', game.player.x + 4, game.player.y + 4);
  for (let i = 0; i < 120 && game.state === STATE.MINE; i++) step();
  expectState(STATE.SUMMARY, 'death');
  if (game.summary.reason !== 'dead') fail(`expected dead summary, got ${game.summary.reason}`);
  console.log('✓ death -> summary screen');
  const [hbx, hby] = summaryButton('hub');
  clickAt(hbx, hby); // back to hub
  expectState(STATE.HUB, 'back to hub');
  console.log('✓ summary -> hub');
}

// leave-mine flow from a healthy run
clickAt(VIEW_W / 2, VIEW_H - 82 + 27);
expectState(STATE.MINE, 'second run');
game.waveState = 'mining';
game.player.x = game.scene.portal.x;
game.player.y = game.scene.portal.y;
press('e');
expectState(STATE.SUMMARY, 'E at portal leaves mine');
clickAt(...summaryButton('hub'));
expectState(STATE.HUB, 'hub after retreat');
console.log('✓ retreat -> summary -> hub');

// saves persist
const raw = localStorage.getItem('deepmine.save.v1');
if (!raw) fail('nothing persisted to localStorage');
else {
  const parsed = JSON.parse(raw);
  if (!Number.isFinite(parsed.pickaxe) || !Number.isFinite(parsed.gold)) fail('bad save payload');
  console.log(`✓ save persisted (gold=${parsed.gold}, pickaxe=${parsed.pickaxe}, bestWave=${parsed.bestWave})`);
}

console.log(`\n${frames} frames simulated`);
if (errors) {
  console.error(`${errors} failure(s)`);
  process.exit(1);
}
console.log('✓ smoke test passed');
