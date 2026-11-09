import {
  TILE,
  VIEW_W,
  VIEW_H,
  PICKAXES,
  SWORDS,
  UPGRADES,
  PLAYER_BASE,
  waveComposition,
  biomeForWave,
  MOBS,
} from './data.js';
import { World, T } from './world.js';
import { SPRITES, drawSprite, drawShadow } from './sprites.js';
import { drawText, textWidth, wrapText } from './font.js';
import { play, initAudio, isMuted, toggleMute } from './audio.js';
import { loadSave, writeSave, wipeSave } from './save.js';
import { drawWorld, drawMineLighting, drawVignette, drawOreNode, clearTileCache } from './render.js';
import { UI } from './ui.js';

export const STATE = {
  TITLE: 'title',
  HUB: 'hub',
  SHOP: 'shop',
  MINE: 'mine',
  SUMMARY: 'summary',
  DEAD: 'dead',
};

const MINING_DURATION = 22;
const HIT_INTERVAL = 0.34;

function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.input = input;
    this.ui = new UI(input);
    this.ui.ctx = this.ctx;

    this.save = loadSave();
    this.state = STATE.TITLE;
    this.prevState = STATE.HUB;
    this.time = 0;
    this.shake = 0;
    this.hitFlash = 0;
    this.toasts = [];
    this.particles = [];
    this.floaters = [];
    this.pickups = [];
    this.mobs = [];
    this.projectiles = [];

    this.scene = null;
    this.player = null;
    this.wave = 1;
    this.waveState = 'mining';
    this.waveTimer = -3;
    this.mineTimer = MINING_DURATION;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveBanner = 0;
    this.runGold = 0;
    this.runKills = 0;
    this.runOres = 0;
    this.shopTab = 'pickaxe';
    this.shopMsg = null;
    this.muted = isMuted();
    this.cam = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0 };
    this.titleStars = [];
    const rnd = mulberry32(9182);
    for (let i = 0; i < 90; i++) {
      this.titleStars.push({ x: rnd() * VIEW_W, y: rnd() * VIEW_H * 0.72, s: rnd() < 0.75 ? 2 : 4, a: 0.25 + rnd() * 0.7, sp: 4 + rnd() * 22 });
    }
    this.muted = isMuted();
    this.paused = false;
    this.saveTimer = 0;
  }

  // ------------------------------------------------------------------ helpers
  get pickaxe() {
    return PICKAXES[clamp(this.save.pickaxe, 0, PICKAXES.length - 1)];
  }

  get sword() {
    return SWORDS[clamp(this.save.sword, 0, SWORDS.length - 1)];
  }

  get maxHp() {
    return this.save.maxHp;
  }

  get moveSpeed() {
    return PLAYER_BASE.speed * (1 + this.save.speedLevel * 0.08);
  }

  get critChance() {
    return PLAYER_BASE.critChance + this.save.critLevel * 0.06;
  }

  get lightRadius() {
    return PLAYER_BASE.lightRadius + this.save.lampLevel * 40;
  }

  saveNow() {
    this.save.hp = Math.max(1, Math.min(this.save.hp, this.save.maxHp));
    writeSave(this.save);
  }

  toast(text, color = '#f2f0ff') {
    this.toasts.push({ text, color, t: 0, life: 2.6 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  addParticles(x, y, count, opts = {}) {
    const { color = '#ffffff', speed = 90, size = 3, life = 0.5, gravity = 0, spread = Math.PI * 2, angle = 0 } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spread / 2, spread / 2);
      const sp = speed * rand(0.35, 1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life * rand(0.6, 1.2),
        maxLife: life,
        size: size * rand(0.7, 1.3),
        color,
        gravity,
        glow: opts.glow || false,
      });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  floater(x, y, text, color = '#fff', scale = 2) {
    this.floaters.push({ x, y, text, color, life: 0.9, maxLife: 0.9, scale });
  }

  // --------------------------------------------------------------- transitions
  startRun() {
    initAudio();
    this.save.hp = this.save.maxHp;
    this.save.runs = (this.save.runs || 0) + 1;
    this.wave = 1;
    this.runGold = 0;
    this.runKills = 0;
    this.runOres = 0;
    this.mobs = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles = [];
    this.floaters = [];
    this.enterMine(1);
    this.saveNow();
  }

  enterMine(wave) {
    this.wave = wave;
    this.scene = new World({ kind: 'mine', wave, seed: (Date.now() ^ (wave * 7919)) >>> 0 });
    clearTileCache();
    const p = this.player || {};
    p.x = this.scene.spawn.x;
    p.y = this.scene.spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.hp = Math.max(1, this.save.hp);
    p.invuln = 0;
    p.attackTimer = 0;
    p.attackAnim = 0;
    p.swingAngle = 0;
    p.mineProgress = 0;
    p.mineTarget = null;
    p.facing = { x: 0, y: 1 };
    p.walkPhase = 0;
    p.moving = false;
    this.player = p;
    this.state = STATE.MINE;
    this.startMiningPhase(false);
    this.waveBanner = 2.2;
  }

  startMiningPhase(announce = true) {
    this.waveState = 'mining';
    this.mineTimer = MINING_DURATION;
    this.mobs = [];
    this.projectiles = [];
    if (announce) this.waveBanner = 2.0;
    this.runGoldWaveStart = this.runGold;
  }

  startFight() {
    if (this.waveState !== 'mining') return;
    this.waveState = 'fight';
    this.spawnQueue = waveComposition(this.wave);
    this.spawnTimer = 0.25;
    this.waveBanner = 1.6;
    play('wave');
    this.toast(`WAVE ${this.wave} — FIGHT!`, '#ff9db1');
  }

  clearWave() {
    this.waveState = 'clear';
    this.waveTimer = 3.6;
    play('clear');
    this.save.bestWave = Math.max(this.save.bestWave, this.wave);
    const bonus = 18 + this.wave * 6;
    this.giveGold(bonus);
    this.save.hp = Math.min(this.maxHp, this.save.hp + Math.round(this.maxHp * 0.22));
    if (this.player) this.player.hp = this.save.hp;
    this.floater(this.player.x, this.player.y - 46, `WAVE CLEAR +${bonus}`, '#ffd447', 2);
    this.saveNow();
  }

  nextWave() {
    this.wave++;
    this.scene.biome = biomeForWave(this.wave);
    clearTileCache();
    this.scene.oreNodes = [];
    this.scene.populateOres(this.wave);
    this.scene.wave = this.wave;
    this.startMiningPhase(true);
    this.mobs = [];
    this.projectiles = [];
    this.save.hp = Math.min(this.maxHp, this.save.hp + 8);
    this.player.hp = this.save.hp;
    this.saveNow();
  }

  leaveMine(reason = 'retreat') {
    const earned = this.runGold;
    this.save.bestWave = Math.max(this.save.bestWave, this.wave - 1);
    // Escaping through the portal keeps everything. Dying costs half of what
    // this run earned - that's the risk/reward of staying down too long.
    let lost = 0;
    if (reason === 'dead') {
      lost = Math.round(earned * 0.5);
      this.save.gold = Math.max(0, this.save.gold - lost);
    }
    this.saveNow();
    this.state = STATE.SUMMARY;
    this.summary = {
      reason,
      wave: this.wave,
      gold: reason === 'dead' ? earned - lost : earned,
      lost,
      kills: this.runKills,
      ores: this.runOres,
      best: this.save.bestWave,
    };
    this.mobs = [];
    this.projectiles = [];
    this.pickups = [];
    play(reason === 'dead' ? 'die' : 'clear');
  }

  enterHub() {
    this.scene = new World({ kind: 'hub', seed: 4242 });
    clearTileCache();
    this.player = {
      x: this.scene.spawn.x,
      y: this.scene.spawn.y,
      vx: 0,
      vy: 0,
      hp: Math.max(1, this.save.hp),
      invuln: 0,
      attackTimer: 0,
      attackAnim: 0,
      swingAngle: Math.PI / 2,
      mineProgress: 0,
      mineTarget: null,
      facing: { x: 0, y: 1 },
      walkPhase: 0,
      moving: false,
    };
    this.mobs = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.pickups = [];
    this.state = STATE.HUB;
    this.shopMsg = null;
  }

  openShop() {
    this.state = STATE.SHOP;
    this.shopTab = 'pickaxe';
    play('click');
  }

  closeShop() {
    this.state = STATE.HUB;
    play('click');
  }

  giveGold(n) {
    const v = Math.round(n);
    this.save.gold += v;
    this.save.totalGold = (this.save.totalGold || 0) + v;
    this.runGold += v;
  }

  // -------------------------------------------------------------------- update
  update(dt) {
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.4);
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t += dt;
      if (this.toasts[i].t > this.toasts[i].life) this.toasts.splice(i, 1);
    }
    this.ui.begin();

    if (this.input.wasPressed('m')) {
      this.muted = toggleMute();
      this.toast(this.muted ? 'Sound off' : 'Sound on', this.muted ? '#ff9db1' : '#7fe6a4');
    }
    if (this.state === STATE.MINE && !this.paused) {
      this.saveTimer += dt;
      if (this.saveTimer > 4) {
        this.saveTimer = 0;
        this.saveNow();
      }
    }

    const paused = this.state === STATE.SHOP || this.paused;

    if (this.state === STATE.TITLE) this.updateTitle(dt);
    else if (this.state === STATE.HUB) this.updateHub(dt);
    else if (this.state === STATE.SHOP) this.updateShop(dt);
    else if (this.state === STATE.MINE) this.updateMine(dt);
    else if (this.state === STATE.SUMMARY || this.state === STATE.DEAD) this.updateSummary(dt);

    if (!paused) {
      this.updateParticles(dt);
      this.updateFloaters(dt);
    }

    this.input.endFrame();
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy *= 1 - 2.4 * dt;
    }
  }

  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  updateTitle(dt) {
    for (const s of this.titleStars) {
      s.y += s.sp * dt;
      if (s.y > VIEW_H * 0.8) {
        s.y = -4;
        s.x = Math.random() * VIEW_W;
      }
    }
    const ui = this.ui;
    if (ui.wasClicked('play') || this.input.wasPressed('enter', ' ')) {
      initAudio();
      play('click');
      this.enterHub();
    }
    if (ui.wasClicked('wipe')) {
      wipeSave();
      this.save = loadSave();
      this.toast('Save data wiped', '#ff9db1');
    }
  }

  updateHub(dt) {
    const p = this.player;
    this.handleMovement(dt, p, false);
    // face the mouse when idle
    this.updateFacing(p, false);

    const portal = this.scene.portal;
    const nearPortal = Math.hypot(p.x - portal.x, p.y - portal.y) < 58;

    if (nearPortal && (this.input.wasPressed('e', 'enter'))) {
      this.startRun();
      return;
    }

    const ui = this.ui;
    if (ui.wasClicked('enter_mine')) {
      this.startRun();
      return;
    }
    if (ui.wasClicked('open_shop') || (this.input.wasPressed('b') && this.state === STATE.HUB)) {
      this.openShop();
      return;
    }
    const m = this.input.mouse;
    if (this.input.mouse.clicked && !ui.consumedClick) {
      // clicking the shop counter / keeper opens the shop
      const kx = this.scene.keeper.x;
      const ky = this.scene.keeper.y;
      if (Math.hypot(m.x - kx, m.y - ky) < 46) {
        this.openShop();
        return;
      }
      if (m.y < 4 * TILE + TILE && m.y > 2 * TILE && m.x > 3 * TILE && m.x < 27 * TILE) {
        this.openShop();
        return;
      }
      if (Math.hypot(m.x - portal.x, m.y - portal.y) < 70) {
        this.startRun();
        return;
      }
    }

    if (this.input.wasPressed('escape')) {
      this.toast('Press B to shop · E at the portal');
    }
  }

  updateFacing(p, aimAtMouse = true) {
    const m = this.input.mouse;
    if (aimAtMouse && (m.x !== 0 || m.y !== 0)) {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        p.facing.x = dx / d;
        p.facing.y = dy / d;
      }
    } else if (p.moving) {
      const d = Math.hypot(p.vx, p.vy) || 1;
      p.facing.x = p.vx / d;
      p.facing.y = p.vy / d;
    }
  }

  handleMovement(dt, p, aimAtMouse) {
    const input = this.input;
    const kx = Number(input.isDown('d', 'arrowright')) - Number(input.isDown('a', 'arrowleft'));
    const ky = Number(input.isDown('s', 'arrowdown')) - Number(input.isDown('w', 'arrowup'));
    let moveX = kx;
    let moveY = ky;

    // click-to-move: hold left mouse away from the player to walk toward it
    const m = input.mouse;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const mdist = Math.hypot(dx, dy);
    const useMouse = m.down && mdist > 44 && kx === 0 && ky === 0;
    if (useMouse) {
      moveX = dx / mdist;
      moveY = dy / mdist;
    }

    const len = Math.hypot(moveX, moveY);
    p.moving = len > 0.01;
    if (p.moving) {
      moveX /= len;
      moveY /= len;
      const spd = this.moveSpeed;
      p.vx = moveX * spd;
      p.vy = moveY * spd;
      const r = PLAYER_BASE.radius;
      const res = this.scene.moveCircle(p.x, p.y, r, p.vx * dt, p.vy * dt, this.state === STATE.MINE);
      if (Math.abs(res.x - p.x) < 0.01 && Math.abs(p.vx) > 1) p.vx *= 0.2;
      if (Math.abs(res.y - p.y) < 0.01 && Math.abs(p.vy) > 1) p.vy *= 0.2;
      p.x = clamp(res.x, r, VIEW_W - r);
      p.y = clamp(res.y, r, VIEW_H - r);
      p.walkPhase += dt * 11;
      this.stepTimer = (this.stepTimer || 0) + dt;
      if (this.stepTimer > 0.32) {
        this.stepTimer = 0;
        play('step');
      }
    } else {
      p.vx = 0;
      p.vy = 0;
      p.walkPhase *= 0.9;
    }
    this.updateFacing(p, aimAtMouse);
  }

  updateMine(dt) {
    const p = this.player;
    const ui = this.ui;

    if (this.paused) {
      this.updatePause();
      return;
    }
    if (this.input.wasPressed('escape')) {
      this.paused = true;
      play('click');
      return;
    }

    this.waveBanner = Math.max(0, this.waveBanner - dt);
    this.handleMovement(dt, p, true);

    p.invuln = Math.max(0, p.invuln - dt);
    p.attackTimer = Math.max(0, p.attackTimer - dt);
    p.attackAnim = Math.max(0, p.attackAnim - dt);

    // ------------------------------------------------ mine phase
    if (this.waveState === 'mining') {
      this.mineTimer -= dt;
      if (this.mineTimer <= 0) this.startFight();
      if (this.input.wasPressed('f') || ui.wasClicked('fight_now')) this.startFight();
      this.handleMining(dt);
    }

    if (this.waveState === 'clear') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.nextWave();
    }

    // ------------------------------------------------ attacking
    const wantsAttack = this.input.mouse.down || this.input.isDown(' ', 'j');
    const aimX = this.input.mouse.x - p.x;
    const aimY = this.input.mouse.y - p.y;
    const aimLen = Math.hypot(aimX, aimY);
    p.swingAngle = aimLen > 4 ? Math.atan2(aimY, aimX) : Math.atan2(p.facing.y, p.facing.x);

    if (wantsAttack && p.attackTimer <= 0 && !ui.consumedClick) {
      this.doAttack(p);
    }

    // ------------------------------------------------ ore hits
    for (const n of this.scene.oreNodes) {
      n.hitFlash = Math.max(0, n.hitFlash - dt * 4);
      n.shake = Math.max(0, n.shake - dt * 8);
    }

    // ------------------------------------------------ mobs
    if (this.waveState === 'fight') {
      this.flowTimer = (this.flowTimer || 0) - dt;
      if (this.flowTimer <= 0) {
        this.flowTimer = 0.18;
        this.scene.buildFlowMap(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
      }
    }
    this.updateMobs(dt);
    if (this.state !== STATE.MINE) return;
    this.updateProjectiles(dt);
    if (this.state !== STATE.MINE) return;
    this.updatePickups(dt);

    // ------------------------------------------------ spawn queue
    if (this.waveState === 'fight' && this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.34;
        this.spawnMob(this.spawnQueue.shift());
      }
    }

    // ------------------------------------------------ wave complete?
    if (this.waveState === 'fight' && this.spawnQueue.length === 0 && this.mobs.length === 0) {
      this.clearWave();
    }

    // ------------------------------------------------ portal / leave
    const portal = this.scene.portal;
    const nearPortal = Math.hypot(p.x - portal.x, p.y - portal.y) < 54;
    if (nearPortal && this.input.wasPressed('e')) {
      this.leaveMine('retreat');
      return;
    }
    if (ui.wasClicked('leave_mine')) {
      this.leaveMine('retreat');
      return;
    }

    if (this.save.hp <= 0 || p.hp <= 0) {
      this.leaveMine('dead');
      return;
    }

    // HP regen trickle during mining phase only
    if (this.waveState === 'mining' && this.save.hp < this.maxHp) {
      this.save.hp = Math.min(this.maxHp, this.save.hp + dt * 1.6);
      p.hp = this.save.hp;
    }
  }

  doAttack(p) {
    p.attackTimer = PLAYER_BASE.attackCooldown;
    p.attackAnim = 0.2;
    play('swoosh');

    // The sword swings all the way around the character: every mob and ore
    // node inside reach is hit regardless of where the cursor is.
    const reach = PLAYER_BASE.attackReach;
    const dmgBase = this.sword.damage;
    let hitAny = false;

    for (const m of this.mobs) {
      if (m.dead) continue;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + m.radius) continue;
      const a = Math.atan2(dy, dx);
      const crit = Math.random() < this.critChance;
      const dmg = Math.round(dmgBase * (crit ? 2 : 1) * rand(0.92, 1.08));
      this.damageMob(m, dmg, crit, a);
      hitAny = true;
    }

    // Sword chips nearby ore a little (mining is faster with a pickaxe)
    for (const n of this.scene.oreNodes) {
      if (n.dead) continue;
      const dx = n.x - p.x;
      const dy = n.y - p.y;
      if (Math.hypot(dx, dy) > reach + n.radius) continue;
      this.chipOre(n, Math.max(1, this.sword.damage * 0.12), n.x, n.y);
    }

    if (!hitAny) {
      // whiff: a faint ring of sparks around the character instead of a cone
      this.addParticles(p.x, p.y - 6, 10, {
        color: 'rgba(255,255,255,0.5)',
        speed: 60,
        size: 2,
        life: 0.18,
        spread: Math.PI * 2,
      });
    }
  }

  damageMob(m, dmg, crit, angle) {
    m.hp -= dmg;
    m.flash = 0.14;
    m.knockX = Math.cos(angle) * (m.def.behavior === 'boss' ? 0 : 210);
    m.knockY = Math.sin(angle) * (m.def.behavior === 'boss' ? 0 : 210);
    this.floater(m.x + rand(-6, 6), m.y - (m.def.height || 0) - 14, `${dmg}`, crit ? '#fff3a8' : '#ffffff', crit ? 3 : 2);
    if (crit) {
      this.floater(m.x, m.y - (m.def.height || 0) - 34, 'CRIT!', '#ff9a3c', 2);
      play('crit');
      this.shake = Math.min(1, this.shake + 0.35);
    } else {
      play('hit');
      this.shake = Math.min(1, this.shake + 0.12);
    }
    this.addParticles(m.x, m.y - (m.def.height || 0) - 6, crit ? 12 : 7, {
      color: m.blood || '#ff5f7a',
      speed: crit ? 190 : 130,
      size: 3,
      life: 0.4,
      angle,
      spread: 1.7,
      gravity: 240,
    });
    if (m.hp <= 0) this.killMob(m);
  }

  killMob(m) {
    m.dead = true;
    this.runKills++;
    this.save.kills = (this.save.kills || 0) + 1;
    play('kill');
    this.shake = Math.min(1.2, this.shake + (m.def.behavior === 'boss' ? 1.1 : 0.22));
    this.addParticles(m.x, m.y - (m.def.height || 0), m.def.behavior === 'boss' ? 60 : 18, {
      color: m.blood || '#ff5f7a',
      speed: m.def.behavior === 'boss' ? 260 : 150,
      size: 3,
      life: 0.7,
      gravity: 280,
    });
    this.addParticles(m.x, m.y - (m.def.height || 0), 10, { color: '#ffffff', speed: 110, size: 2, life: 0.35 });

    // loot
    const goldValue = m.def.gold * (1 + (this.wave - 1) * 0.1);
    const coins = m.def.behavior === 'boss' ? 8 : 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < coins; i++) {
      this.pickups.push({
        x: m.x + rand(-10, 10),
        y: m.y + rand(-6, 6),
        vx: rand(-60, 60),
        vy: rand(-70, 20),
        value: goldValue / coins,
        life: 14,
        delay: 0.18 + i * 0.05,
        bob: Math.random() * 6,
      });
    }
    if (m.def.behavior === 'boss') {
      // boss drops a big bonus and heals a little
      this.pickups.push({ x: m.x, y: m.y, vx: 0, vy: -40, value: 90, life: 16, delay: 0.4, bob: 0, gem: true });
      this.save.hp = Math.min(this.maxHp, this.save.hp + this.maxHp * 0.3);
      this.player.hp = this.save.hp;
      this.toast('SKELETON KING SLAIN!', '#ffd447');
    }
    this.saveNow();
  }

  spawnMob(kind) {
    const def = { ...(MINE_MOB_DEFS[kind] || MINE_MOB_DEFS.slime) };
    let point = this.scene.randomFloorPoint(this.player.x, this.player.y, 210);
    for (let tries = 0; tries < 24 && !this.scene.isReachable(point.x, point.y); tries++) {
      point = this.scene.randomFloorPoint(this.player.x, this.player.y, 210);
    }
    const hpScale = 1 + (this.wave - 1) * 0.26;
    const dmgScale = 1 + (this.wave - 1) * 0.12;
    const m = {
      kind,
      x: point.x,
      y: point.y,
      def: { ...def, hp: Math.round(def.hp * hpScale), damage: def.damage * dmgScale },
      hp: Math.round(def.hp * hpScale),
      maxHp: Math.round(def.hp * hpScale),
      flash: 0,
      hurtCd: 0,
      anim: Math.random() * 10,
      facing: 1,
      dead: false,
      knockX: 0,
      knockY: 0,
      shootCd: rand(1.2, 2.4),
      state: 'idle',
      stateTimer: 0,
      blood: def.blood,
    };
    m.radius = def.radius;
    this.mobs.push(m);
    this.addParticles(m.x, m.y - 6, 16, {
      color: '#b58cff',
      speed: 120,
      size: 3,
      life: 0.5,
      glow: true,
    });
    return m;
  }

  updateMobs(dt) {
    const p = this.player;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead) {
        this.mobs.splice(i, 1);
        continue;
      }
      m.flash = Math.max(0, m.flash - dt * 5);
      m.hurtCd = Math.max(0, m.hurtCd - dt);
      m.anim += dt;
      const def = m.def;
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const dist = Math.hypot(dx, dy) || 1;
      let nx = dx / dist;
      let ny = dy / dist;
      // Path around walls: use the BFS flow field when the player isn't in sight.
      if (dist > 60 && !this.scene.hasLineOfSight(m.x, m.y, p.x, p.y)) {
        const dir = this.scene.flowDirAt(m.x, m.y, p.x, p.y);
        if (dir) {
          nx = dir.x;
          ny = dir.y;
        }
      }

      let vx = 0;
      let vy = 0;
      const speed = def.speed;

      switch (def.behavior) {
        case 'hop': {
          m.stateTimer -= dt;
          if (m.stateTimer <= 0) {
            m.state = m.state === 'hop' ? 'rest' : 'hop';
            m.stateTimer = m.state === 'hop' ? 0.5 : rand(0.35, 0.8);
          }
          if (m.state === 'hop') {
            vx = nx * speed;
            vy = ny * speed;
          }
          break;
        }
        case 'swoop': {
          const wob = Math.sin(m.anim * 7) * 0.7;
          vx = (nx * Math.cos(wob) - ny * Math.sin(wob)) * speed;
          vy = (nx * Math.sin(wob) + ny * Math.cos(wob)) * speed;
          break;
        }
        case 'chase': {
          vx = nx * speed;
          vy = ny * speed;
          break;
        }
        case 'caster': {
          // Hover at a comfortable range, but never stall out of reach forever.
          const ideal = 110;
          let move = 0;
          if (dist > ideal + 25) move = 1;
          else if (dist < ideal - 35) move = -0.85;
          else move = Math.sin(m.anim * 1.7) * 0.4;
          const strafe = Math.sin(m.anim * 1.3) * 0.45;
          vx = (nx * move + -ny * strafe) * speed;
          vy = (ny * move + nx * strafe) * speed;
          m.shootCd -= dt;
          if (m.shootCd <= 0 && dist < 420) {
            m.shootCd = rand(1.8, 2.8);
            this.fireProj(m.x, m.y - 10, nx, ny, 135, def.damage, '#b58cff', 6);
            play('zap');
          }
          break;
        }
        case 'charge': {
          m.stateTimer -= dt;
          if (m.state === 'idle' && dist < 230) {
            m.state = 'windup';
            m.stateTimer = 0.7;
          } else if (m.state === 'windup') {
            if (m.stateTimer <= 0) {
              m.state = 'dash';
              m.stateTimer = 0.45;
              m.dashX = nx;
              m.dashY = ny;
              play('slam');
              this.shake = Math.min(1, this.shake + 0.3);
            }
          } else if (m.state === 'dash') {
            vx = (m.dashX || nx) * 330;
            vy = (m.dashY || ny) * 330;
            this.addParticles(m.x, m.y, 1, { color: 'rgba(190,170,140,0.6)', speed: 20, size: 4, life: 0.4 });
            if (m.stateTimer <= 0) {
              m.state = 'idle';
              m.stateTimer = 2.6;
            }
          } else if (m.state === 'idle') {
            vx = nx * speed;
            vy = ny * speed;
          }
          break;
        }
        case 'boss': {
          m.stateTimer -= dt;
          m.summonCd = (m.summonCd ?? 6) - dt;
          if (m.state === 'idle') {
            vx = nx * speed;
            vy = ny * speed;
            if (m.stateTimer <= 0) {
              m.state = Math.random() < 0.62 ? 'slam' : 'charge';
              m.stateTimer = m.state === 'slam' ? 1.15 : 0.75;
              if (m.state === 'slam') {
                play('slam');
                this.shake = Math.min(1.2, this.shake + 0.4);
              }
            }
            if (m.summonCd <= 0) {
              m.summonCd = 9;
              for (let s = 0; s < 2; s++) {
                const sp = this.scene.randomFloorPoint(p.x, p.y, 150);
                const minion = this.spawnMobAt('skeleton', sp.x, sp.y, 0.6);
                if (minion) this.toast('The King summons the dead!', '#b58cff');
              }
            }
          } else if (m.state === 'slam') {
            if (m.stateTimer <= 0) {
              // ground slam shockwave
              const radius = 118;
              for (let k = 0; k < 34; k++) {
                const a = (k / 34) * Math.PI * 2;
                this.addParticles(m.x + Math.cos(a) * 20, m.y + Math.sin(a) * 20, 2, {
                  color: '#ffd447',
                  speed: 210,
                  size: 3,
                  life: 0.5,
                  angle: a,
                  spread: 0.4,
                });
              }
              this.shake = 1.2;
              if (Math.hypot(p.x - m.x, p.y - m.y) < radius) this.hurtPlayer(def.damage * 1.15, m.x, m.y);
              m.state = 'idle';
              m.stateTimer = rand(2.4, 3.4);
            }
          } else if (m.state === 'charge') {
            vx = nx * 250;
            vy = ny * 250;
            if (m.stateTimer <= 0) {
              m.state = 'idle';
              m.stateTimer = rand(2.2, 3.2);
            }
          }
          break;
        }
        default:
          vx = nx * speed;
          vy = ny * speed;
      }

      // knockback
      vx += m.knockX;
      vy += m.knockY;
      m.knockX *= 1 - 9 * dt;
      m.knockY *= 1 - 9 * dt;

      // separation so mobs don't stack
      for (const o of this.mobs) {
        if (o === m || o.dead) continue;
        const ox = m.x - o.x;
        const oy = m.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od > 0.01 && od < m.radius + o.radius) {
          const push = (m.radius + o.radius - od) * 4;
          vx += (ox / od) * push;
          vy += (oy / od) * push;
        }
      }

      const res = this.scene.moveCircle(m.x, m.y, m.radius, vx * dt, vy * dt, false);
      m.x = clamp(res.x, 8, VIEW_W - 8);
      m.y = clamp(res.y, 8, VIEW_H - 8);
      if (Math.abs(vx) > 4) m.facing = vx > 0 ? 1 : -1;

      // Anti-stall: mobs that can't reach the player for a long time "phase"
      // closer through the dark, so a wave can always be finished.
      const engaged = dist < 240 && this.scene.hasLineOfSight(m.x, m.y, p.x, p.y);
      m.huntTimer = engaged ? 0 : (m.huntTimer || 0) + dt;
      if (m.huntTimer > 9) {
        m.huntTimer = 0;
        let spot = null;
        for (let t = 0; t < 20 && !spot; t++) {
          const cand = this.scene.randomFloorPoint(p.x, p.y, 140);
          if (this.scene.isReachable(cand.x, cand.y) && Math.hypot(cand.x - p.x, cand.y - p.y) > 110) spot = cand;
        }
        if (spot) {
          this.addParticles(m.x, m.y - 8, 12, { color: '#b58cff', speed: 90, size: 3, life: 0.5, glow: true });
          m.x = spot.x;
          m.y = spot.y;
          this.addParticles(m.x, m.y - 8, 12, { color: '#b58cff', speed: 90, size: 3, life: 0.5, glow: true });
        }
      }

      // contact damage
      if (dist < m.radius + PLAYER_BASE.radius + 2 && m.hurtCd <= 0) {
        m.hurtCd = 0.7;
        this.hurtPlayer(def.damage, m.x, m.y);
      }
    }
  }

  spawnMobAt(kind, x, y, hpMul = 1) {
    const def = MINE_MOB_DEFS[kind];
    if (!def) return null;
    const hp = Math.max(1, Math.round(def.hp * hpMul * (1 + (this.wave - 1) * 0.2)));
    const m = {
      kind,
      x,
      y,
      def: { ...def, damage: def.damage * (1 + (this.wave - 1) * 0.08) },
      hp,
      maxHp: hp,
      flash: 0,
      hurtCd: 0,
      anim: Math.random() * 10,
      facing: 1,
      dead: false,
      knockX: 0,
      knockY: 0,
      shootCd: rand(1, 2),
      state: 'idle',
      stateTimer: 0,
      radius: def.radius,
      blood: def.blood,
    };
    this.mobs.push(m);
    return m;
  }

  fireProj(x, y, nx, ny, speed, damage, color, r) {
    this.projectiles.push({
      x, y,
      vx: nx * speed,
      vy: ny * speed,
      damage,
      color,
      r,
      life: 4,
      anim: 0,
    });
  }

  updateProjectiles(dt) {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.anim += dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      const dead =
        pr.life <= 0 ||
        !this.scene.isWalkableWorld(pr.x, pr.y) ||
        pr.x < 0 || pr.y < 0 || pr.x > VIEW_W || pr.y > VIEW_H;
      if (dead) {
        this.addParticles(pr.x, pr.y, 6, { color: pr.color, speed: 70, size: 3, life: 0.3 });
        this.projectiles.splice(i, 1);
        continue;
      }
      if (Math.hypot(pr.x - p.x, pr.y - p.y - 8) < pr.r + PLAYER_BASE.radius) {
        this.hurtPlayer(pr.damage, pr.x, pr.y);
        this.addParticles(pr.x, pr.y, 12, { color: pr.color, speed: 120, size: 3, life: 0.4 });
        this.projectiles.splice(i, 1);
      }
    }

    // mob projectiles vs ore? skip. player melee vs projectiles: deflect (nice touch)
  }

  hurtPlayer(dmg, fromX, fromY) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== STATE.MINE) return;
    p.invuln = PLAYER_BASE.invulnTime;
    const d = Math.round(dmg);
    this.save.hp = Math.max(0, this.save.hp - d);
    p.hp = this.save.hp;
    this.hitFlash = 1;
    this.shake = Math.min(1.3, this.shake + 0.5);
    play('hurt');
    this.floater(p.x, p.y - 42, `-${d}`, '#ff7b8a', 2);
    this.addParticles(p.x, p.y - 8, 12, { color: '#ff5f7a', speed: 140, size: 3, life: 0.5, gravity: 200 });
    // knockback away from source
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const dl = Math.hypot(dx, dy) || 1;
    const res = this.scene.moveCircle(p.x, p.y, PLAYER_BASE.radius, (dx / dl) * 16, (dy / dl) * 16, true);
    p.x = clamp(res.x, 10, VIEW_W - 10);
    p.y = clamp(res.y, 10, VIEW_H - 10);
    this.saveNow();
    if (this.save.hp <= 0) this.leaveMine('dead');
  }

  handleMining(dt) {
    const p = this.player;
    // pickaxe reaches a full 360 degrees: mine the nearest ore node in range
    let best = null;
    let bestDist = Infinity;
    for (const n of this.scene.oreNodes) {
      if (n.dead) continue;
      const dist = Math.hypot(n.x - p.x, n.y - p.y);
      if (dist > 52 + n.radius) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = n;
      }
    }
    p.mineTarget = best;
    const holding = (this.input.mouse.down && !this.ui.consumedClick) || this.input.isDown(' ', 'j');

    if (best && holding) {
      p.mineProgress += dt;
      if (p.mineProgress >= HIT_INTERVAL) {
        p.mineProgress = 0;
        this.mineHit(best);
      }
      p.attackAnim = 0.14;
      p.attackTimer = Math.max(p.attackTimer, 0.1);
    } else {
      p.mineProgress = Math.max(0, p.mineProgress - dt * 2);
    }
  }

  mineHit(node) {
    const p = this.player;
    const power = this.pickaxe.power;
    const dmg = power * rand(0.85, 1.15);
    play('mine');
    this.shake = Math.min(1, this.shake + 0.07);
    this.addParticles(node.x, node.y, 8, {
      color: node.type.color,
      speed: 130,
      size: 3,
      life: 0.45,
      gravity: 320,
      angle: Math.atan2(node.y - p.y, node.x - p.x),
      spread: 2.2,
    });
    this.addParticles(node.x, node.y, 4, {
      color: 'rgba(200,200,220,0.7)',
      speed: 60,
      size: 2,
      life: 0.5,
      gravity: 120,
    });
    node.hitFlash = 0.5;
    node.shake = 0.4;
    this.chipOre(node, dmg, node.x, node.y, true);
  }

  chipOre(node, dmg, fx, fy, fromPick = false) {
    if (node.dead) return;
    node.hp -= dmg;
    if (node.hp <= 0) {
      node.dead = true;
      node.hp = 0;
      play('break');
      this.shake = Math.min(1.2, this.shake + 0.28);
      this.addParticles(node.x, node.y, 22, {
        color: node.type.color,
        speed: 200,
        size: 4,
        life: 0.7,
        gravity: 400,
      });
      this.addParticles(node.x, node.y, 10, { color: '#8a5c33', speed: 150, size: 4, life: 0.6, gravity: 300 });
      const value = Math.round(node.type.value * this.pickaxe.gold * (1 + (this.wave - 1) * 0.12));
      this.pickups.push({
        x: node.x,
        y: node.y,
        vx: rand(-50, 50),
        vy: rand(-80, -20),
        value,
        life: 18,
        delay: 0.15,
        bob: Math.random() * 6,
        gem: node.type.value >= 34,
        color: node.type.color,
      });
      this.runOres++;
      this.save.oresMined = (this.save.oresMined || 0) + 1;
    }
  }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const c = this.pickups[i];
      c.life -= dt;
      c.delay -= dt;
      c.bob += dt * 6;
      if (c.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }
      if (c.delay > 0) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vx *= 1 - 4 * dt;
        c.vy *= 1 - 4 * dt;
        continue;
      }
      // magnet toward the player
      const dx = p.x - c.x;
      const dy = p.y - 10 - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = 380;
      c.x += (dx / d) * pull * dt;
      c.y += (dy / d) * pull * dt;
      if (d < 20) {
        this.giveGold(c.value);
        play('coin');
        this.floater(p.x + rand(-10, 10), p.y - 34, `+${Math.round(c.value)}`, '#ffd447', 2);
        this.addParticles(c.x, c.y, 4, { color: '#fff3a8', speed: 60, size: 2, life: 0.3 });
        this.pickups.splice(i, 1);
      }
    }
  }

  updateShop(dt) {
    const ui = this.ui;
    if (this.input.wasPressed('escape') || this.input.wasPressed('b')) {
      this.closeShop();
      return;
    }
    if (ui.wasClicked('shop_close')) {
      this.closeShop();
      return;
    }
    if (ui.wasClicked('tab_pickaxe')) this.shopTab = 'pickaxe';
    if (ui.wasClicked('tab_sword')) this.shopTab = 'sword';
    if (ui.wasClicked('tab_supply')) this.shopTab = 'supply';

    // item rows
    if (this.shopTab === 'pickaxe' || this.shopTab === 'sword') {
      const list = this.shopTab === 'pickaxe' ? PICKAXES : SWORDS;
      for (let i = 0; i < list.length; i++) {
        if (ui.wasClicked(`buy_${this.shopTab}_${i}`)) this.buyTool(this.shopTab, i);
      }
    } else {
      for (const up of UPGRADES) {
        if (ui.wasClicked(`buy_up_${up.id}`)) this.buyUpgrade(up);
      }
    }

    if (this.shopMsg) {
      this.shopMsg.t -= dt;
      if (this.shopMsg.t <= 0) this.shopMsg = null;
    }
  }

  buyTool(kind, index) {
    const list = kind === 'pickaxe' ? PICKAXES : SWORDS;
    const item = list[index];
    const cur = kind === 'pickaxe' ? this.save.pickaxe : this.save.sword;
    if (index <= cur) {
      play('deny');
      this.setShopMsg('You already own that.', '#a49fc6');
      return;
    }
    if (index > cur + 1) {
      play('deny');
      this.setShopMsg(`Buy ${list[cur + 1].name} first!`, '#ff9db1');
      return;
    }
    if (this.save.gold < item.price) {
      play('deny');
      this.setShopMsg(`Need ${fmt(item.price - this.save.gold)} more gold.`, '#ff7b8a');
      return;
    }
    this.save.gold -= item.price;
    if (kind === 'pickaxe') this.save.pickaxe = index;
    else this.save.sword = index;
    play('buy');
    this.setShopMsg(`${item.name} equipped!`, '#7fe6a4');
    this.saveNow();
  }

  buyUpgrade(up) {
    const level =
      up.id === 'maxhp' ? Math.floor((this.save.maxHp - 100) / 25)
        : up.id === 'speed' ? this.save.speedLevel
          : up.id === 'lamp' ? this.save.lampLevel
            : up.id === 'crit' ? this.save.critLevel
              : this.save.potionsBought;
    const price = Math.round(up.basePrice * Math.pow(1.55, up.id === 'potion' ? 0 : level));
    if (this.save.gold < price) {
      play('deny');
      this.setShopMsg(`Need ${fmt(price - this.save.gold)} more gold.`, '#ff7b8a');
      return;
    }
    if (up.id === 'potion' && this.save.hp >= this.maxHp) {
      play('deny');
      this.setShopMsg('You are already at full health.', '#a49fc6');
      return;
    }
    this.save.gold -= price;
    switch (up.id) {
      case 'potion':
        this.save.potionsBought = (this.save.potionsBought || 0) + 1;
        this.save.hp = Math.min(this.maxHp, this.save.hp + 60);
        play('heal');
        this.setShopMsg('Healed 60 HP!', '#7fe6a4');
        break;
      case 'maxhp':
        this.save.maxHp += 25;
        this.save.hp = Math.min(this.save.maxHp, this.save.hp + 25);
        play('buy');
        this.setShopMsg('Max HP increased!', '#7fe6a4');
        break;
      case 'speed':
        this.save.speedLevel += 1;
        play('buy');
        this.setShopMsg('Speed increased!', '#7fe6a4');
        break;
      case 'lamp':
        this.save.lampLevel += 1;
        play('buy');
        this.setShopMsg('Your lantern shines brighter.', '#7fe6a4');
        break;
      case 'crit':
        this.save.critLevel += 1;
        play('buy');
        this.setShopMsg('Critical chance increased!', '#7fe6a4');
        break;
      default:
        break;
    }
    this.saveNow();
  }

  setShopMsg(text, color) {
    this.shopMsg = { text, color, t: 2.4 };
  }

  updatePause() {
    const ui = this.ui;
    if (this.input.wasPressed('escape') || ui.wasClicked('resume')) {
      this.paused = false;
      play('click');
      return;
    }
    if (ui.wasClicked('abandon')) {
      this.paused = false;
      this.leaveMine('retreat');
    }
  }

  updateSummary() {
    const ui = this.ui;
    if (ui.wasClicked('to_hub') || this.input.wasPressed('enter', ' ')) {
      this.save.hp = Math.max(1, this.maxHp);
      this.enterHub();
      this.saveNow();
    }
    if (ui.wasClicked('again')) {
      this.save.hp = this.maxHp;
      this.startRun();
    }
  }

  // -------------------------------------------------------------------- render
  render() {
    const ctx = this.ctx;
    this.ui.ctx = ctx;
    this.updateCursorStyle();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    const shakeAmt = this.shake * 6;
    const sx = (Math.random() - 0.5) * shakeAmt;
    const sy = (Math.random() - 0.5) * shakeAmt;

    if (this.state === STATE.TITLE) {
      this.renderTitle(ctx);
      return;
    }

    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    if (this.scene) {
      drawWorld(ctx, this.scene, this.time, this.cam);
      this.renderEntities(ctx);
      this.renderPickups(ctx);
      this.renderParticles(ctx);
      this.renderFloaters(ctx);
      if (this.state === STATE.MINE) {
        drawMineLighting(ctx, this.player, this.lightRadius, this.time, this.mobs.some((m) => m.def.behavior === 'boss'));
      } else {
        // hub: gentle darkening at the edges only
        drawVignette(ctx, 0.42);
      }
    }
    ctx.restore();

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(200,30,60,${this.hitFlash * 0.28})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.state === STATE.MINE) this.renderHud(ctx);
    if (this.state === STATE.MINE && this.paused) this.renderPause(ctx);
    if (this.state === STATE.HUB) this.renderHubHud(ctx);
    if (this.state === STATE.SHOP) this.renderShop(ctx);
    if (this.state === STATE.SUMMARY || this.state === STATE.DEAD) this.renderSummary(ctx);

    this.renderToasts(ctx);
    this.renderCursor(ctx);

    // scanline overlay for CRT-ish feel
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#000';
    for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 2);
    ctx.restore();
  }

  renderEntities(ctx) {
    if (!this.scene) return;
    const list = [];
    // Ore nodes join the y-sorted pass so the player can walk behind them.
    if (this.scene && this.scene.oreNodes) {
      for (const n of this.scene.oreNodes) {
        if (n.dead) continue;
        list.push({ y: n.y, d: () => drawOreNode(ctx, n, 0, 0, this.time) });
      }
    }
    if (this.player) {
      list.push({ y: this.player.y, d: () => this.drawPlayer(ctx, this.player) });
    }
    for (const m of this.mobs) {
      list.push({ y: m.y, d: () => this.drawMob(ctx, m) });
    }
    if (this.scene && this.scene.kind === 'hub') {
      list.push({ y: this.scene.keeper.y, d: () => this.drawKeeper(ctx, this.scene.keeper) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const e of list) e.d();

    // swing arc on top
    if (this.player && this.player.attackAnim > 0 && this.state === STATE.MINE) {
      this.drawSwing(ctx, this.player);
    }
    this.renderProjectiles(ctx);
  }

  drawPlayer(ctx, p) {
    const art = SPRITES.player;
    const flip = p.facing.x < -0.25;
    let sprite = art.front;
    if (Math.abs(p.facing.x) > 0.6) sprite = art.side;
    else if (p.facing.y < -0.3) sprite = art.back;

    const bob = p.moving ? Math.round(Math.sin(p.walkPhase) * 1.2) : Math.round(Math.sin(this.time * 2.4) * 0.6);
    const breathing = Math.round(Math.sin(this.time * 3) * 0.5);
    const scaleY = 1 + (p.moving ? Math.abs(Math.sin(p.walkPhase)) * 0.03 : 0);
    const invulnBlink = p.invuln > 0 && Math.floor(this.time * 18) % 2 === 0;

    drawShadow(ctx, p.x, p.y + 2, 13, 5.5, 0.34);

    // lantern glow marker
    if (this.state === STATE.MINE) {
      const g = ctx.createRadialGradient(p.x, p.y - 4, 2, p.x, p.y - 4, 46);
      g.addColorStop(0, 'rgba(255,205,130,0.20)');
      g.addColorStop(1, 'rgba(255,205,130,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 48, p.y - 52, 96, 96);
    }

    drawSprite(ctx, sprite, p.x, p.y + 3 + bob + breathing, 2, {
      flip,
      alpha: invulnBlink ? 0.45 : 1,
      scaleY,
    });

    // Held weapon, drawn at the aiming angle
    this.drawHeldWeapon(ctx, p);

    // HP ring under the player when hurt
    if (this.save.hp / this.maxHp < 0.34) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.time * 6);
      ctx.strokeStyle = '#ff5f7a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, 18, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawHeldWeapon(ctx, p) {
    const weaponArt = this.state === STATE.MINE ? SPRITES.sword : SPRITES.pickaxe;
    const ang = p.swingAngle || Math.atan2(p.facing.y, p.facing.x);
    const swing = p.attackAnim > 0 ? Math.sin((1 - p.attackAnim / 0.2) * Math.PI) : 0;
    const reach = 13;
    const hx = p.x + Math.cos(ang) * reach;
    const hy = p.y - 8 + Math.sin(ang) * reach * 0.65;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang + Math.PI / 2 * 0.12 - swing * 0.9);
    const s = 1.35;
    ctx.drawImage(weaponArt.base, -8 * s, -2 * s, 16 * s, 16 * s);
    ctx.restore();
  }

  drawSwing(ctx, p) {
    // full 360 degree sweep: a ring that expands out to the attack reach
    const t = 1 - p.attackAnim / 0.2;
    const r0 = 16;
    const r1 = PLAYER_BASE.attackReach + 10;
    const rr = r0 + (r1 - r0) * Math.min(1, t * 1.4);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.55;
    const grad = ctx.createRadialGradient(p.x, p.y - 6, r0 * 0.5, p.x, p.y - 6, rr);
    grad.addColorStop(0, 'rgba(255,255,255,0.0)');
    grad.addColorStop(0.7, 'rgba(200,230,255,0.42)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 6, rr, 0, Math.PI * 2);
    ctx.arc(p.x, p.y - 6, r0 * 0.5, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
  }

  drawKeeper(ctx, k) {
    drawShadow(ctx, k.x, k.y + 4, 15, 6, 0.34);
    const bob = Math.round(Math.sin(this.time * 2) * 1);
    drawSprite(ctx, SPRITES.keeper.front, k.x, k.y + 6 + bob, 2.4, {});
    // name tag + prompt
    drawText(ctx, 'SHOPKEEPER', k.x, k.y - 56, 1, '#ffd447', { align: 'center', shadow: 'rgba(0,0,0,0.8)' });
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffd447';
    ctx.fillRect(k.x - 2, k.y - 48, 4, 8);
    ctx.restore();
  }

  drawMob(ctx, m) {
    const def = m.def;
    const sprite = SPRITES[def.art];
    if (!sprite) return;
    const hover = def.height;
    const bob = def.behavior === 'swoop'
      ? Math.sin(m.anim * 8) * 4
      : def.behavior === 'hop'
        ? -Math.abs(Math.sin(m.anim * 6)) * 6
        : Math.sin(m.anim * 2.4) * 1.2;
    const y = m.y - hover + bob;

    drawShadow(ctx, m.x, m.y + 2, m.radius * 1.15, m.radius * 0.5, hover ? 0.2 : 0.32);

    // telegraph for golem windup / boss slam
    if (m.state === 'windup' || (m.state === 'charge' && def.behavior === 'boss')) {
      const pulse = 0.4 + 0.4 * Math.sin(this.time * 24);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ff9a3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 2, m.radius + 16, (m.radius + 16) * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (m.state === 'slam' && def.behavior === 'boss') {
      const t = 1 - clamp(m.stateTimer / 1.15, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 2, 118 * t, 118 * t * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const squash = def.behavior === 'hop' ? 1 + Math.sin(m.anim * 6) * 0.08 : 1;
    drawSprite(ctx, sprite, m.x, y, def.scale, {
      flip: m.facing < 0,
      flash: m.flash * 6,
      scaleY: squash,
    });

    // HP bar for damaged mobs
    if (m.hp < m.maxHp) {
      const w = Math.max(20, m.radius * 2.4);
      const bx = m.x - w / 2;
      const by = m.y - hover - (sprite.h * def.scale) - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx - 1, by - 1, w + 2, 6);
      ctx.fillStyle = '#3a1420';
      ctx.fillRect(bx, by, w, 4);
      const pct = clamp(m.hp / m.maxHp, 0, 1);
      ctx.fillStyle = def.behavior === 'boss' ? '#ff9a3c' : '#ff5f7a';
      ctx.fillRect(bx, by, w * pct, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(bx, by, w * pct, 1);
    }

    if (def.behavior === 'boss') {
      drawText(ctx, 'SKELETON KING', m.x, m.y - sprite.h * def.scale - 26, 1, '#ffd447', {
        align: 'center',
        outline: '#141221',
      });
    }
  }

  renderProjectiles(ctx) {
    for (const pr of this.projectiles) {
      const t = pr.anim * 8;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.ellipse(pr.x - pr.vx * 0.02, pr.y - pr.vy * 0.02, pr.r * 1.6, pr.r * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#141221';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pr.x - 1 + Math.sin(t) * 1.5, pr.y - 2, 3, 3);
    }
  }

  renderPickups(ctx) {
    for (const c of this.pickups) {
      const bob = Math.sin(c.bob) * 2;
      const sprite = c.gem ? SPRITES.gem : SPRITES.coin;
      const scale = c.gem ? 1.8 : 1.6;
      drawShadow(ctx, c.x, c.y + 5, 7, 3, 0.25);
      ctx.save();
      if (c.life < 3) ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 10));
      drawSprite(ctx, sprite, c.x, c.y + bob + 2, scale, {});
      if (c.gem) {
        const g = ctx.createRadialGradient(c.x, c.y - 6, 1, c.x, c.y - 6, 26);
        g.addColorStop(0, 'rgba(255,200,120,0.35)');
        g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(c.x - 26, c.y - 32, 52, 52);
      }
      ctx.restore();
    }
  }

  renderParticles(ctx) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      if (p.glow) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
      }
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size * (0.4 + a * 0.6));
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.restore();
    }
  }

  renderFloaters(ctx) {
    for (const f of this.floaters) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      drawText(ctx, f.text, f.x, f.y, f.scale, f.color, { align: 'center', outline: '#141221' });
      ctx.restore();
    }
  }

  renderToasts(ctx) {
    let y = 96;
    for (const t of this.toasts) {
      const a = Math.min(1, t.t * 6) * Math.min(1, (t.life - t.t) * 3);
      ctx.save();
      ctx.globalAlpha = a;
      const w = textWidth(t.text, 2) + 24;
      this.ui.panel(VIEW_W / 2 - w / 2, y - 6, w, 28, { fill: 'rgba(20,17,33,0.92)', edge: '#4a4270' });
      drawText(ctx, t.text, VIEW_W / 2, y + 4, 2, t.color, { align: 'center', shadow: false });
      ctx.restore();
      y += 34;
    }
  }

  // Gameplay (hub + mine, not paused) uses the pixel crosshair with the system
  // cursor hidden. Menus (title, shop, pause, summary, death) show the normal
  // system cursor, so it is always visible there.
  usePixelCursor() {
    return this.state === STATE.HUB || (this.state === STATE.MINE && !this.paused);
  }

  updateCursorStyle() {
    if (!this.canvas.style) return;
    const css = this.usePixelCursor() ? 'none' : this.ui.cursor ? 'pointer' : 'default';
    if (this.canvas.style.cursor !== css) this.canvas.style.cursor = css;
  }

  renderCursor(ctx) {
    if (!this.usePixelCursor()) return;
    const m = this.input.mouse;
    const cx = Math.round(m.x);
    const cy = Math.round(m.y);
    const hot = this.input.mouse.down;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#141221';
    ctx.fillRect(cx - 6, cy - 6, 12, 12);
    ctx.fillStyle = hot ? '#ffd447' : '#ffffff';
    ctx.fillRect(cx - 5, cy - 5, 10, 10);
    ctx.fillStyle = '#141221';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    ctx.fillStyle = hot ? '#ffd447' : '#ff9a3c';
    ctx.fillRect(cx - 1, cy - 9, 2, 4);
    ctx.fillRect(cx - 1, cy + 5, 2, 4);
    ctx.fillRect(cx - 9, cy - 1, 4, 2);
    ctx.fillRect(cx + 5, cy - 1, 4, 2);
    ctx.restore();
  }

  // -------------------------------------------------------------------- title
  renderTitle(ctx) {
    // animated cavern background
    const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    bg.addColorStop(0, '#10101f');
    bg.addColorStop(0.55, '#1a1730');
    bg.addColorStop(1, '#241d3a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (const s of this.titleStars) {
      ctx.fillStyle = `rgba(140,255,220,${s.a * 0.5})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
    }

    // distant mountains of rock
    ctx.fillStyle = '#201b34';
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W; x += 40) {
      const h = 70 + Math.sin(x * 0.012) * 46 + Math.sin(x * 0.03) * 16;
      ctx.lineTo(x, VIEW_H - 120 - h);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#181428';
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    for (let x = 0; x <= VIEW_W; x += 30) {
      const h = 40 + Math.sin(x * 0.02 + 2) * 30 + Math.cos(x * 0.05) * 10;
      ctx.lineTo(x, VIEW_H - 70 - h);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();

    // title art
    const bob = Math.sin(this.time * 1.6) * 3;
    drawText(ctx, 'DEEPMINE', VIEW_W / 2, 108 + bob, 10, '#ffd447', {
      align: 'center',
      outline: '#3a2400',
    });
    drawText(ctx, 'DEEPMINE', VIEW_W / 2, 108 + bob, 10, '#ffd447', { align: 'center', shadow: false });
    drawText(ctx, 'MINE DEEP . FIGHT WAVES . GET RICH', VIEW_W / 2, 196, 2, '#a49fc6', {
      align: 'center',
      shadow: 'rgba(0,0,0,0.7)',
    });

    // hero + monster parade above the menu panel
    const cast = [
      ['player', 3.0],
      ['slime', 2.2],
      ['bat', 2.2],
      ['skeleton', 2.2],
      ['wraith', 2.2],
      ['golem', 2.0],
    ];
    const gap = 66;
    const startX = VIEW_W / 2 - ((cast.length - 1) * gap) / 2;
    cast.forEach(([name, scale], i) => {
      const x = startX + i * gap;
      const sprite = name === 'player' ? SPRITES.player.front : SPRITES[name];
      const y = 316 + Math.sin(this.time * 2 + i * 0.8) * 4;
      drawShadow(ctx, x, 320, sprite.w * scale * 0.34, sprite.w * scale * 0.16, 0.35);
      drawSprite(ctx, sprite, x, y, scale, { flip: name !== 'player' && Math.sin(this.time * 1.4 + i) > 0 });
    });

    this.ui.panel(VIEW_W / 2 - 210, 380, 420, 150, { fill: 'rgba(18,15,32,0.9)', edge: '#4a4270' });
    this.ui.button('play', VIEW_W / 2 - 170, 400, 340, 52, 'PLAY', { style: 'primary', scale: 3 });
    drawText(ctx, 'WASD / ARROWS  MOVE      CLICK or SPACE  ATTACK', VIEW_W / 2, 470, 1, '#8f89b5', { align: 'center' });
    drawText(ctx, 'HOLD CLICK ON ORE TO MINE      E  USE PORTAL', VIEW_W / 2, 486, 1, '#8f89b5', { align: 'center' });
    drawText(ctx, 'ESC  PAUSE            B  OPEN SHOP', VIEW_W / 2, 502, 1, '#8f89b5', { align: 'center' });

    const s = this.save;
    this.ui.panel(24, VIEW_H - 88, 260, 64, { fill: 'rgba(18,15,32,0.88)', edge: '#4a4270' });
    drawSprite(ctx, SPRITES.skull, 44, VIEW_H - 34, 2, {});
    drawText(ctx, `BEST WAVE ${s.bestWave}`, 76, VIEW_H - 62, 2, '#ffd447');
    drawText(ctx, `GOLD ${fmt(s.gold)}   KILLS ${fmt(s.kills)}`, 76, VIEW_H - 42, 1, '#a49fc6');

    this.ui.button('wipe', VIEW_W - 176, VIEW_H - 60, 152, 32, 'WIPE SAVE', { style: 'danger', scale: 1 });
    this.renderToasts(ctx);
    this.renderCursor(ctx);
  }

  // ---------------------------------------------------------------------- hub
  renderHubHud(ctx) {
    const s = this.save;
    // top bar
    this.ui.panel(16, 16, 330, 58, { fill: 'rgba(16,13,28,0.9)', edge: '#4a4270', accent: '#ffd447' });
    drawSprite(ctx, SPRITES.heart, 30, 60, 2.2, {});
    const hpPct = clamp(s.hp / this.maxHp, 0, 1);
    ctx.fillStyle = '#2a1020';
    ctx.fillRect(60, 32, 200, 12);
    ctx.fillStyle = '#ff5f7a';
    ctx.fillRect(60, 32, 200 * hpPct, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(60, 32, 200 * hpPct, 3);
    drawText(ctx, `${Math.ceil(s.hp)} / ${this.maxHp}`, 262, 33, 1, '#ffffff', { shadow: 'rgba(0,0,0,0.8)' });

    drawSprite(ctx, SPRITES.coin, 32, 66, 1.8, {});
    drawText(ctx, `${fmt(s.gold)}`, 50, 56, 2, '#ffd447');
    drawText(ctx, 'GOLD', 50, 46, 1, '#a49fc6');

    // loadout panel
    this.ui.panel(VIEW_W - 348, 16, 332, 100, { fill: 'rgba(16,13,28,0.9)', edge: '#4a4270', accent: '#8a7dff' });
    drawSprite(ctx, SPRITES.pickaxe, VIEW_W - 318, 72, 2.4, {});
    drawText(ctx, 'PICKAXE', VIEW_W - 286, 28, 1, '#a49fc6');
    drawText(ctx, this.pickaxe.name, VIEW_W - 286, 40, 2, '#f2f0ff');
    drawText(ctx, `PWR ${this.pickaxe.power}   GOLD x${this.pickaxe.gold}`, VIEW_W - 286, 60, 1, '#7fe6a4');
    drawSprite(ctx, SPRITES.sword, VIEW_W - 318, 106, 1.8, {});
    drawText(ctx, 'SWORD', VIEW_W - 286, 72, 1, '#a49fc6');
    drawText(ctx, this.sword.name, VIEW_W - 286, 84, 2, '#f2f0ff');
    drawText(ctx, `DMG ${this.sword.damage}`, VIEW_W - 286, 104, 1, '#7fe6a4');

    // hub title
    drawText(ctx, 'THE HUB', VIEW_W / 2, 22, 3, '#ffd447', { align: 'center', outline: '#141221' });
    drawText(ctx, 'Buy gear, then head down the portal.', VIEW_W / 2, 50, 1, '#c9c3e6', {
      align: 'center',
      shadow: 'rgba(0,0,0,0.8)',
    });

    // action buttons
    this.ui.button('enter_mine', VIEW_W / 2 - 150, VIEW_H - 82, 300, 54, 'ENTER THE MINE', { style: 'primary', scale: 2 });
    this.ui.button('open_shop', VIEW_W / 2 - 320, VIEW_H - 74, 150, 40, 'SHOP [B]', { style: 'ghost', scale: 1 });
    drawText(ctx, 'Walk to the portal or press E', VIEW_W / 2, VIEW_H - 22, 1, '#8f89b5', {
      align: 'center',
      shadow: 'rgba(0,0,0,0.7)',
    });

    const p = this.player;
    const portal = this.scene.portal;
    if (Math.hypot(p.x - portal.x, p.y - portal.y) < 58) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 5);
      ctx.save();
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS [E] TO DESCEND', portal.x, portal.y - 74, 2, '#d9c8ff', {
        align: 'center',
        outline: '#141221',
      });
      ctx.restore();
    }
    // shop prompt bubble over the counter
    const kx = this.scene.keeper.x;
    const ky = this.scene.keeper.y;
    if (Math.hypot(p.x - kx, p.y - ky) < 150) {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 4);
      ctx.save();
      ctx.globalAlpha = pulse;
      drawText(ctx, 'CLICK TO SHOP', kx, ky - 70, 1, '#ffd447', { align: 'center', outline: '#141221' });
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------- HUD
  renderHud(ctx) {
    const s = this.save;
    const p = this.player;

    // HP bar
    this.ui.panel(16, 16, 262, 50, { fill: 'rgba(16,13,28,0.9)', edge: '#4a4270', accent: '#ff5f7a' });
    drawSprite(ctx, SPRITES.heart, 32, 56, 2, {});
    const hpPct = clamp(s.hp / this.maxHp, 0, 1);
    ctx.fillStyle = '#2a1020';
    ctx.fillRect(56, 32, 168, 14);
    const barGrad = ctx.createLinearGradient(56, 0, 224, 0);
    barGrad.addColorStop(0, '#ff5f7a');
    barGrad.addColorStop(1, '#ff9db1');
    ctx.fillStyle = barGrad;
    ctx.fillRect(56, 32, 168 * hpPct, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(56, 32, 168 * hpPct, 3);
    drawText(ctx, `${Math.ceil(s.hp)}/${this.maxHp}`, 228, 33, 1, '#ffffff', { shadow: 'rgba(0,0,0,0.85)' });

    // gold
    this.ui.panel(VIEW_W - 200, 16, 184, 50, { fill: 'rgba(16,13,28,0.9)', edge: '#4a4270', accent: '#ffd447' });
    drawSprite(ctx, SPRITES.coin, VIEW_W - 182, 55, 1.9, {});
    drawText(ctx, `${fmt(s.gold)}`, VIEW_W - 164, 34, 2, '#ffd447');
    drawText(ctx, 'GOLD', VIEW_W - 32, 34, 1, '#a49fc6', { align: 'right' });

    // wave banner / timer center
    const cx = VIEW_W / 2;
    this.ui.panel(cx - 168, 16, 336, 62, { fill: 'rgba(16,13,28,0.92)', edge: '#4a4270', accent: this.waveState === 'fight' ? '#ff5f7a' : '#7fe6a4' });
    drawText(ctx, `WAVE ${this.wave}`, cx, 24, 3, '#ffffff', { align: 'center', outline: '#141221' });
    if (this.waveState === 'mining') {
      drawText(ctx, `MINE!  FIGHT IN ${Math.ceil(this.mineTimer)}s`, cx, 52, 2, '#7fe6a4', { align: 'center' });
      const pct = 1 - clamp(this.mineTimer / MINING_DURATION, 0, 1);
      ctx.fillStyle = '#1e3a2a';
      ctx.fillRect(cx - 150, 70, 300, 5);
      ctx.fillStyle = '#7fe6a4';
      ctx.fillRect(cx - 150, 70, 300 * pct, 5);
    } else if (this.waveState === 'fight') {
      const left = this.mobs.length + this.spawnQueue.length;
      drawText(ctx, `${left} ENEMY${left === 1 ? '' : 'IES'} LEFT`, cx, 54, 2, '#ff9db1', { align: 'center' });
    } else {
      drawText(ctx, 'WAVE CLEAR!', cx, 54, 2, '#ffd447', { align: 'center' });
    }

    // ore left counter
    const ores = this.scene.oreNodes.filter((n) => !n.dead).length;
    this.ui.panel(16, 74, 210, 30, { fill: 'rgba(16,13,28,0.8)', edge: '#3a3358' });
    drawText(ctx, `ORE ${ores}`, 30, 84, 1, '#b58cff');
    drawText(ctx, this.pickaxe.name, 214, 84, 1, '#a49fc6', { align: 'right' });

    // biome name
    drawText(ctx, this.scene.biome.name.toUpperCase(), VIEW_W - 24, 84, 1, '#8f89b5', {
      align: 'right',
      shadow: 'rgba(0,0,0,0.8)',
    });

    // mining prompt / progress
    if (this.waveState === 'mining') {
      if (p.mineTarget && !p.mineTarget.dead) {
        const n = p.mineTarget;
        const prog = clamp(p.mineProgress / HIT_INTERVAL, 0, 1);
        drawText(ctx, `HOLD TO MINE ${n.type.name.toUpperCase()}`, n.x, n.y - 44, 1, '#ffffff', {
          align: 'center',
          outline: '#141221',
        });
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 26, -Math.PI / 2, Math.PI * 1.5);
        ctx.stroke();
        ctx.strokeStyle = n.type.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
        ctx.restore();
      }
      // start fight button
      this.ui.button('fight_now', cx - 96, VIEW_H - 62, 192, 38, 'FIGHT NOW [F]', { style: 'danger', scale: 1 });
    } else if (this.waveState === 'fight') {
      drawText(ctx, 'SLAY EVERYTHING', cx, VIEW_H - 46, 1, '#ff9db1', {
        align: 'center',
        outline: '#141221',
      });
    } else {
      drawText(ctx, `NEXT WAVE IN ${Math.ceil(this.waveTimer)}`, cx, VIEW_H - 46, 1, '#7fe6a4', {
        align: 'center',
        outline: '#141221',
      });
    }

    // leave prompt when near the escape portal
    const portal = this.scene.portal;
    if (Math.hypot(p.x - portal.x, p.y - portal.y) < 54) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 5);
      ctx.save();
      ctx.globalAlpha = pulse;
      drawText(ctx, 'PRESS [E] TO LEAVE', portal.x, portal.y - 40, 2, '#d9c8ff', {
        align: 'center',
        outline: '#141221',
      });
      ctx.restore();
    }

    // pause hint
    drawText(ctx, 'ESC  pause      M  sound', VIEW_W - 20, VIEW_H - 18, 1, 'rgba(180,172,214,0.45)', {
      align: 'right',
      shadow: false,
    });

    if (this.waveBanner > 0) this.renderWaveBanner(ctx);
  }

  renderWaveBanner(ctx) {
    const t = this.waveBanner;
    // ease in/out so it doesn't pop
    const alpha = Math.min(1, t / 0.45) * Math.min(1, (2.2 - t) / 0.35);
    if (alpha <= 0.01) return;
    const bannerText =
      this.waveState === 'fight' ? 'FIGHT!' : this.waveState === 'clear' ? 'WAVE CLEAR' : `WAVE ${this.wave}`;
    const color = this.waveState === 'fight' ? '#ff9db1' : '#ffd447';
    const cx = VIEW_W / 2;
    const cy = 128;
    const w = Math.max(300, textWidth(bannerText, 5) + 72);
    ctx.save();
    ctx.globalAlpha = alpha;
    this.ui.panel(cx - w / 2, cy, w, 66, { fill: 'rgba(14,11,24,0.92)', edge: color, accent: color });
    drawText(ctx, bannerText, cx, cy + 12, 5, color, { align: 'center', outline: '#141221' });
    let sub = null;
    if (this.waveState === 'mining') sub = 'HOLD CLICK ON GLOWING ORE TO MINE';
    else if (this.waveState === 'fight') sub = 'THEY ARE COMING';
    else sub = 'CATCH YOUR BREATH';
    drawText(ctx, sub, cx, cy + 50, 1, '#c9c3e6', { align: 'center', outline: '#141221' });
    ctx.restore();
  }

  renderPause(ctx) {
    this.ui.dimScreen(0.72);
    const W = 460;
    const H = 340;
    const x = (VIEW_W - W) / 2;
    const y = (VIEW_H - H) / 2;
    this.ui.panel(x, y, W, H, { fill: 'rgba(16,13,28,0.98)', edge: '#6a5fa0', accent: '#ffd447' });
    drawText(ctx, 'PAUSED', x + W / 2, y + 30, 4, '#ffd447', { align: 'center', outline: '#141221' });
    drawText(ctx, `WAVE ${this.wave} . ${this.scene.biome.name}`, x + W / 2, y + 76, 1, '#a49fc6', {
      align: 'center',
      shadow: false,
    });
    drawText(ctx, `GOLD THIS RUN  ${fmt(this.runGold)}`, x + W / 2, y + 96, 1, '#ffd447', { align: 'center', shadow: false });

    this.ui.button('resume', x + 40, y + 128, W - 80, 44, 'RESUME', { style: 'primary', scale: 2 });
    this.ui.button('abandon', x + 40, y + 184, W - 80, 44, 'LEAVE MINE', { style: 'ghost', scale: 2 });

    const lines = [
      'WASD / ARROWS  move        CLICK / SPACE  attack',
      'HOLD CLICK on ore  mine        F  start the wave',
      'E  use portal        M  sound        ESC  pause',
    ];
    lines.forEach((l, i) => {
      drawText(ctx, l, x + W / 2, y + 250 + i * 16, 1, '#8f89b5', { align: 'center', shadow: false });
    });
    this.renderCursor(ctx);
  }

  // --------------------------------------------------------------------- shop
  renderShop(ctx) {
    this.ui.dimScreen(0.7);
    const W = 880;
    const H = 548;
    const x = (VIEW_W - W) / 2;
    const y = (VIEW_H - H) / 2;
    this.ui.panel(x, y, W, H, { fill: 'rgba(18,15,32,0.97)', edge: '#6a5fa0', accent: '#ffd447' });

    // header
    drawText(ctx, 'THE PROSPECTOR', x + 28, y + 22, 3, '#ffd447', { outline: '#141221' });
    drawText(ctx, '"Strike it rich, come back alive."', x + 28, y + 52, 1, '#a49fc6');

    // wallet
    this.ui.panel(x + W - 226, y + 18, 198, 40, { fill: 'rgba(10,8,20,0.95)', edge: '#4a4270' });
    drawSprite(ctx, SPRITES.coin, x + W - 206, y + 54, 1.8, {});
    drawText(ctx, fmt(this.save.gold), x + W - 188, y + 32, 2, '#ffd447');
    drawText(ctx, 'GOLD', x + W - 44, y + 34, 1, '#a49fc6', { align: 'right' });


    // tabs
    const tabs = [
      ['tab_pickaxe', 'PICKAXES'],
      ['tab_sword', 'SWORDS'],
      ['tab_supply', 'SUPPLIES'],
    ];
    tabs.forEach(([id, label], i) => {
      this.ui.button(id, x + 28 + i * 176, y + 76, 168, 34, label, {
        style: 'tab',
        scale: 2,
        active:
          (id === 'tab_pickaxe' && this.shopTab === 'pickaxe') ||
          (id === 'tab_sword' && this.shopTab === 'sword') ||
          (id === 'tab_supply' && this.shopTab === 'supply'),
      });
    });

    // divider
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 28, y + 120, W - 56, 1);

    if (this.shopTab === 'supply') this.renderSupplies(ctx, x, y, W, H);
    else this.renderToolList(ctx, x, y, W, H);

    // status message sits inline with the tabs so it never covers a row
    if (this.shopMsg) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.shopMsg.t * 2);
      const mw = Math.min(300, textWidth(this.shopMsg.text, 1) + 24);
      this.ui.panel(x + W - 56 - mw, y + 80, mw, 26, { fill: 'rgba(8,6,16,0.96)', edge: '#4a4270' });
      drawText(ctx, this.shopMsg.text, x + W - 56 - mw / 2, y + 89, 1, this.shopMsg.color, {
        align: 'center',
        shadow: false,
      });
      ctx.restore();
    }
    drawText(ctx, 'ESC or B to leave the shop', x + W / 2, y + H - 18, 1, '#6f6a8c', {
      align: 'center',
      shadow: false,
    });
    this.renderToasts(ctx);
    this.renderCursor(ctx);
  }

  renderToolList(ctx, x, y, W, H) {
    const isPick = this.shopTab === 'pickaxe';
    const list = isPick ? PICKAXES : SWORDS;
    const cur = isPick ? this.save.pickaxe : this.save.sword;
    const rowH = 42;
    const startY = y + 126;
    const listX = x + 22;
    const listW = 470;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const ry = startY + i * (rowH + 3);
      const owned = i <= cur;
      const isNext = i === cur + 1;
      const equipped = i === cur;
      const affordable = this.save.gold >= item.price;
      const highlight = isNext;

      const fill = highlight ? 'rgba(120,96,220,0.20)' : 'rgba(24,20,40,0.85)';
      this.ui.panel(listX, ry, listW, rowH, {
        fill,
        edge: highlight ? '#8a7dff' : owned ? '#3d6b52' : '#3a3358',
        accent: equipped ? '#7fe6a4' : isNext ? '#ffd447' : null,
      });

      // icon on a little plate
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(listX + 9, ry + 6, 32, 32);
      ctx.drawImage(SPRITES[isPick ? 'pickaxe' : 'sword'].base, listX + 11, ry + 8, 28, 28);

      drawText(ctx, item.name, listX + 50, ry + 8, 2, owned ? '#f2f0ff' : '#cfc9ec', {
        shadow: 'rgba(0,0,0,0.6)',
      });
      const stat = isPick
        ? `POWER ${item.power}   GOLD x${item.gold}`
        : `DMG ${item.damage}   ${(item.damage / PLAYER_BASE.attackCooldown).toFixed(0)} DPS`;
      drawText(ctx, stat, listX + 50, ry + 26, 1, '#a49fc6', { shadow: false });

      // status / price
      if (equipped) {
        drawText(ctx, 'EQUIPPED', listX + listW - 14, ry + 18, 1, '#7fe6a4', { align: 'right' });
      } else if (owned) {
        drawText(ctx, 'OWNED', listX + listW - 14, ry + 18, 1, '#6f8f7f', { align: 'right' });
      } else if (isNext) {
        this.ui.button(`buy_${this.shopTab}_${i}`, listX + listW - 122, ry + 7, 110, 30, `${fmt(item.price)}g`, {
          style: 'primary',
          scale: 1,
          disabled: !affordable,
        });
      } else {
        drawText(ctx, 'LOCKED', listX + listW - 14, ry + 18, 1, '#6f6a8c', { align: 'right' });
      }
    }

    // right-hand detail card
    const cardX = x + W - 348;
    const cardW = 326;
    const nextIdx = Math.min(list.length - 1, cur + 1);
    const focus = list[nextIdx];
    this.ui.panel(cardX, y + 128, cardW, H - 190, { fill: 'rgba(12,10,24,0.92)', edge: '#4a4270' });

    const previewY = y + 146;
    // draw a big pulsing icon
    const pulse = 1 + Math.sin(this.time * 2) * 0.03;
    const big = 84 * pulse;
    ctx.save();
    ctx.translate(cardX + cardW / 2, previewY + 40);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 70);
    glow.addColorStop(0, `${focus.hl}55`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-80, -80, 160, 160);
    ctx.drawImage(SPRITES[isPick ? 'pickaxe' : 'sword'].base, -big / 2, -big / 2, big, big);
    ctx.restore();

    drawText(ctx, focus.name, cardX + cardW / 2, previewY + 92, 2, '#ffd447', { align: 'center', outline: '#141221' });

    const curItem = list[cur];
    const rows = isPick
      ? [
        ['POWER', `${curItem.power}  >  ${focus.power}`, '#7fe6a4'],
        ['GOLD GAIN', `x${curItem.gold}  >  x${focus.gold}`, '#7fe6a4'],
        ['BREAK SPEED', `${(focus.power / 4).toFixed(2)}s per ore`, '#f2f0ff'],
      ]
      : [
        ['DAMAGE', `${curItem.damage}  >  ${focus.damage}`, '#7fe6a4'],
        ['DPS', `${(curItem.damage / PLAYER_BASE.attackCooldown).toFixed(0)}  >  ${(focus.damage / PLAYER_BASE.attackCooldown).toFixed(0)}`, '#7fe6a4'],
        ['CRIT', `${Math.round(this.critChance * 100)}% chance x2`, '#f2f0ff'],
      ];
    rows.forEach(([label, val, col], i) => {
      const ry = previewY + 118 + i * 21;
      drawText(ctx, label, cardX + 20, ry, 1, '#8f89b5', { shadow: false });
      drawText(ctx, val, cardX + cardW - 20, ry, 1, col, { align: 'right', shadow: false });
    });

    drawText(ctx, `NEXT UPGRADE`, cardX + 20, previewY + 196, 1, '#8f89b5', { shadow: false });
    drawText(ctx, nextIdx > cur ? `${fmt(focus.price)} GOLD` : 'MAXED OUT', cardX + 20, previewY + 210, 2, '#ffd447');
    if (nextIdx > cur && cur + 2 < list.length) {
      const after = list[cur + 2];
      drawText(ctx, `THEN: ${after.name} (${fmt(after.price)}g)`, cardX + 20, previewY + 234, 1, '#6f6a8c', { shadow: false });
    }
    // flavour tip
    const tips = [
      'Tier up your pickaxe first. Ore value scales with it.',
      'Gold from the mine carries over if you make it out.',
      'Deeper waves hide rarer crystal - and nastier mobs.',
      'A brighter lantern means fewer surprises.',
    ];
    const tip = tips[(Math.floor(this.time / 6) + cur) % tips.length];
    wrapText(tip, cardW - 40, 1).forEach((line, i) => {
      drawText(ctx, line, cardX + 20, y + H - 88 + i * 14, 1, '#6f6a8c', { shadow: false });
    });
  }

  renderSupplies(ctx, x, y, W, H) {
    const startY = y + 128;
    const rowH = 58;
    UPGRADES.forEach((up, i) => {
      const ry = startY + i * (rowH + 3);
      const listX = x + 22;
      const listW = W - 48;
      const level =
        up.id === 'maxhp' ? Math.floor((this.save.maxHp - 100) / 25)
          : up.id === 'speed' ? this.save.speedLevel
            : up.id === 'lamp' ? this.save.lampLevel
              : up.id === 'crit' ? this.save.critLevel
                : this.save.potionsBought;
      const price = Math.round(up.basePrice * Math.pow(1.55, up.id === 'potion' ? 0 : level));
      const affordable = this.save.gold >= price;
      this.ui.panel(listX, ry, listW, rowH, { fill: 'rgba(24,20,40,0.85)', edge: '#3a3358' });

      const icon = up.icon === 'boots' || up.icon === 'lamp' ? null : SPRITES[up.icon];
      if (icon) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(listX + 10, ry + 12, 38, 38);
        const s = up.icon === 'potion' || up.icon === 'gem' ? 3 : 2.6;
        ctx.drawImage(icon.base, listX + 12, ry + 14, icon.w * s, icon.h * s);
      } else {
        // drawn icons for boots / lantern
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(listX + 10, ry + 12, 38, 38);
        if (up.icon === 'boots') {
          ctx.fillStyle = '#8a5a2b';
          ctx.fillRect(listX + 18, ry + 20, 10, 18);
          ctx.fillRect(listX + 28, ry + 32, 14, 6);
          ctx.fillStyle = '#c9905a';
          ctx.fillRect(listX + 18, ry + 20, 4, 16);
        } else {
          ctx.fillStyle = '#5a3618';
          ctx.fillRect(listX + 22, ry + 14, 4, 6);
          ctx.fillStyle = '#ffd447';
          ctx.fillRect(listX + 18, ry + 20, 14, 18);
          ctx.fillStyle = '#fff8c9';
          ctx.fillRect(listX + 22, ry + 24, 5, 10);
        }
      }

      drawText(ctx, up.name, listX + 58, ry + 12, 2, '#f2f0ff', { shadow: 'rgba(0,0,0,0.6)' });
      drawText(ctx, up.desc, listX + 58, ry + 34, 1, '#a49fc6', { shadow: false });
      if (up.repeatable && up.id !== 'potion') {
        drawText(ctx, `LV ${level}`, listX + listW - 190, ry + 26, 1, '#8f89b5', { align: 'right' });
      }
      this.ui.button(`buy_up_${up.id}`, listX + listW - 150, ry + 14, 138, 32, `${fmt(price)}g`, {
        style: 'primary',
        scale: 1,
        disabled: !affordable,
        sub: up.id === 'potion' ? 'HEAL 60' : null,
      });
    });

    drawText(ctx, 'Supplies are permanent and stack for the rest of this save.', x + W / 2, y + H - 92, 1, '#6f6a8c', {
      align: 'center',
      shadow: false,
    });
  }

  // ------------------------------------------------------------------ summary
  renderSummary(ctx) {
    this.ui.dimScreen(0.82);
    const s = this.summary;
    const dead = s.reason === 'dead';
    const W = 640;
    const H = 512;
    const x = (VIEW_W - W) / 2;
    const y = (VIEW_H - H) / 2;
    this.ui.panel(x, y, W, H, {
      fill: 'rgba(18,15,32,0.98)',
      edge: dead ? '#8f2226' : '#6a5fa0',
      accent: dead ? '#ff5f7a' : '#ffd447',
    });

    if (dead) {
      drawSprite(ctx, SPRITES.skull, x + W / 2, y + 78, 3.6, {});
      drawText(ctx, 'YOU DIED', x + W / 2, y + 92, 5, '#ff5f7a', { align: 'center', outline: '#141221' });
      drawText(ctx, 'The mine kept half of what you dug up.', x + W / 2, y + 138, 1, '#c9c3e6', {
        align: 'center',
      });
    } else {
      drawText(ctx, 'RUN COMPLETE', x + W / 2, y + 34, 4, '#ffd447', { align: 'center', outline: '#141221' });
      drawText(ctx, 'You climbed back into the light with every coin.', x + W / 2, y + 76, 1, '#c9c3e6', {
        align: 'center',
      });
    }

    const rows = [
      ['WAVE REACHED', `${s.wave}`, '#f2f0ff'],
      ['GOLD KEPT', fmt(s.gold), '#ffd447'],
    ];
    if (s.lost > 0) rows.push(['GOLD LOST', `-${fmt(s.lost)}`, '#ff7b8a']);
    rows.push(
      ['ORES MINED', fmt(s.ores), '#b58cff'],
      ['MOBS SLAIN', fmt(s.kills), '#ff9db1'],
      ['BEST WAVE', `${this.save.bestWave}`, '#7fe6a4'],
      ['WALLET', fmt(this.save.gold), '#ffd447']
    );

    const rowH = 30;
    const listH = rows.length * rowH;
    const ty = (dead ? y + 160 : y + 108);
    rows.forEach(([label, val, col], i) => {
      const ry = ty + i * rowH;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 56, ry, W - 112, rowH - 4);
      drawText(ctx, label, x + 72, ry + 8, 1, '#a49fc6', { shadow: false });
      drawText(ctx, val, x + W - 72, ry + 6, 2, col, { align: 'right' });
    });

    const by = y + H - 82;
    this.ui.button('to_hub', x + 56, by, 258, 50, 'BACK TO HUB', { style: 'primary', scale: 2 });
    this.ui.button('again', x + W - 314, by, 258, 50, dead ? 'TRY AGAIN' : 'DIVE AGAIN', {
      style: 'ghost',
      scale: 2,
    });
    drawText(ctx, dead ? 'Gear and gold in your wallet are safe.' : 'Gold carries into the next run.', x + W / 2, y + H - 24, 1, '#6f6a8c', {
      align: 'center',
      shadow: false,
    });
    this.renderCursor(ctx);
  }
}

const MINE_MOB_DEFS = MOBS;
