import { TILE, MAP_W, MAP_H, ORE_TYPES, biomeForWave } from './data.js';

export const T = {
  FLOOR: 0,
  WALL: 1,
  PILLAR: 2,
  CRYSTAL: 3,
  RUBBLE: 4,
  GRAVEL: 5,
  COUNTER: 6,
  CRATE: 7,
  RUG: 8,
  PORTAL: 9,
  LANTERN: 10,
  TABLE: 11,
  ANVIL: 12,
  WATER: 13,
};

const SOLID = new Set([T.WALL, T.PILLAR, T.CRYSTAL, T.COUNTER, T.CRATE, T.TABLE, T.ANVIL]);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor({ kind = 'mine', wave = 1, seed = Date.now() } = {}) {
    this.kind = kind;
    this.w = MAP_W;
    this.h = MAP_H;
    this.tiles = new Uint8Array(this.w * this.h).fill(T.WALL);
    this.decor = [];
    this.oreNodes = [];
    this.rng = mulberry32(seed);
    this.seed = seed;
    this.biome = kind === 'hub' ? { name: 'The Hub', floor: ['#3b3a52', '#343348'], wall: ['#252338', '#1c1b2c'], accent: '#ffd447' } : biomeForWave(wave);
    this.wave = wave;
    this.spawn = { x: 0, y: 0 };

    if (kind === 'hub') this.buildHub();
    else this.buildMine(wave);
  }

  idx(tx, ty) {
    return ty * this.w + tx;
  }

  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T.WALL;
    return this.tiles[this.idx(tx, ty)];
  }

  set(tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.tiles[this.idx(tx, ty)] = v;
  }

  isSolidTile(tx, ty) {
    return SOLID.has(this.get(tx, ty));
  }

  isWalkableWorld(x, y) {
    return !this.isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  tileCenter(tx, ty) {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  // ------------------------------------------------------------------ hub
  buildHub() {
    const { w, h } = this;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const border = tx === 0 || ty === 0 || tx === w - 1 || ty === h - 1;
        this.set(tx, ty, border ? T.WALL : T.FLOOR);
      }
    }

    // Warm rug in the middle
    for (let ty = 7; ty <= 11; ty++) {
      for (let tx = 12; tx <= 18; tx++) this.set(tx, ty, T.RUG);
    }

    // Shop counter along the top (with a gap so the keeper stands behind it)
    for (let tx = 4; tx <= 11; tx++) this.set(tx, 4, T.COUNTER);
    for (let tx = 19; tx <= 26; tx++) this.set(tx, 4, T.COUNTER);
    // Crates and barrels around the shop
    [[4, 5], [5, 5], [26, 5], [25, 5], [3, 6], [27, 6]].forEach(([x, y]) => this.set(x, y, T.CRATE));
    // Anvil + workbench to the right
    this.set(21, 12, T.ANVIL);
    this.set(22, 12, T.TABLE);
    this.set(23, 12, T.TABLE);
    // Garden crystals in the corners (decor, still solid)
    [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].forEach(([x, y]) => this.set(x, y, T.CRYSTAL));
    [[6, 14], [24, 14], [9, 2], [21, 2]].forEach(([x, y]) => this.set(x, y, T.LANTERN));

    // Portal down to the mine
    for (let tx = 14; tx <= 16; tx++) {
      for (let ty = 13; ty <= 14; ty++) this.set(tx, ty, T.PORTAL);
    }

    // Pillars flanking the hall
    for (let ty = 7; ty <= 11; ty += 2) {
      this.set(8, ty, T.PILLAR);
      this.set(22, ty, T.PILLAR);
    }

    this.spawn = this.tileCenter(15, 9);

    // NPC spot behind the counter
    this.keeper = this.tileCenter(15, 4.6);

    // Decor
    const rng = this.rng;
    for (let i = 0; i < 60; i++) {
      const tx = 1 + Math.floor(rng() * (w - 2));
      const ty = 1 + Math.floor(rng() * (h - 2));
      const t = this.get(tx, ty);
      if (t === T.FLOOR || t === T.RUG) {
        this.decor.push({
          x: tx * TILE + 6 + rng() * 20,
          y: ty * TILE + 6 + rng() * 20,
          type: rng() < 0.55 ? 'pebble' : rng() < 0.8 ? 'scratch' : 'mushroom',
          s: 0.6 + rng() * 0.7,
        });
      }
    }
    this.portal = this.tileCenter(15, 14);
    this.portalHint = 'ENTER THE MINE';
  }

  // ----------------------------------------------------------------- mine
  buildMine(wave) {
    const rng = this.rng;
    const { w, h } = this;
    this.rooms = [];

    // Grid-based room layout: guarantees coverage of the whole map while
    // still looking organic (jittered rectangles + winding corridors).
    const cols = 5;
    const rows = 3;
    const cellW = (w - 2) / cols;
    const cellH = (h - 2) / rows;
    const jitter = (amount) => (rng() - 0.5) * amount;
    const grid = [];

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cx = 1 + gx * cellW + cellW / 2;
        const cy = 1 + gy * cellH + cellH / 2;
        const rw = Math.max(3, Math.round(cellW * (0.5 + rng() * 0.34)));
        const rh = Math.max(3, Math.round(cellH * (0.5 + rng() * 0.34)));
        let rx = Math.round(cx - rw / 2 + jitter(cellW * 0.26));
        let ry = Math.round(cy - rh / 2 + jitter(cellH * 0.26));
        rx = Math.max(1, Math.min(w - rw - 1, rx));
        ry = Math.max(1, Math.min(h - rh - 1, ry));
        const room = { x: rx, y: ry, w: rw, h: rh, gx, gy };
        grid.push(room);
        this.rooms.push(room);
        for (let ty = ry; ty < ry + rh; ty++) {
          for (let tx = rx; tx < rx + rw; tx++) {
            if (tx > 0 && ty > 0 && tx < w - 1 && ty < h - 1) this.set(tx, ty, T.FLOOR);
          }
        }
      }
    }

    // Guarantee a spawn room: the leftmost room of the middle row.
    const spawnRoom = grid[Math.floor(rows / 2) * cols];
    this.spawnRoom = spawnRoom;

    // Extra blobby caverns so it doesn't read as a grid.
    for (let i = 0; i < 5; i++) {
      const r = this.rooms[Math.floor(rng() * this.rooms.length)];
      let bx = r.x + Math.floor(rng() * r.w);
      let by = r.y + Math.floor(rng() * r.h);
      const steps = 6 + Math.floor(rng() * 10);
      for (let st = 0; st < steps; st++) {
        bx += Math.floor(rng() * 3) - 1;
        by += Math.floor(rng() * 3) - 1;
        if (bx <= 1 || by <= 1 || bx >= w - 2 || by >= h - 2) break;
        for (let ty = by - 1; ty <= by + 1; ty++) {
          for (let tx = bx - 1; tx <= bx + 1; tx++) {
            if (tx > 0 && ty > 0 && tx < w - 1 && ty < h - 1 && rng() < 0.8) this.set(tx, ty, T.FLOOR);
          }
        }
      }
    }

    // Corridors: connect horizontal + vertical neighbours, plus a few diagonals.
    const carveCorridor = (x, y) => this.carveCorridor(x, y);
    const connectRooms = (a, b) => {
      const ax = a.x + (a.w >> 1);
      const ay = a.y + (a.h >> 1);
      const bx = b.x + (b.w >> 1);
      const by = b.y + (b.h >> 1);
      if (rng() < 0.5) {
        for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
          carveCorridor(x, ay);
          if (rng() < 0.5) carveCorridor(x, ay + 1);
        }
        for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
          carveCorridor(bx, y);
          if (rng() < 0.5) carveCorridor(bx + 1, y);
        }
      } else {
        for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
          carveCorridor(ax, y);
          if (rng() < 0.5) carveCorridor(ax + 1, y);
        }
        for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
          carveCorridor(x, by);
          if (rng() < 0.5) carveCorridor(x, by + 1);
        }
      }
    };

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const room = grid[gy * cols + gx];
        if (gx < cols - 1) connectRooms(room, grid[gy * cols + gx + 1]);
        if (gy < rows - 1) connectRooms(room, grid[(gy + 1) * cols + gx]);
      }
    }
    // A couple of long diagonal shortcuts keep the cave from feeling gridded.
    for (let i = 0; i < 2; i++) {
      const a = grid[Math.floor(rng() * grid.length)];
      const b = grid[Math.floor(rng() * grid.length)];
      if (a !== b) connectRooms(a, b);
    }

    // Wandering tunnels for a more organic cave
    for (let i = 0; i < 5; i++) {
      const r = this.rooms[Math.floor(rng() * this.rooms.length)];
      let x = r.x + (r.w >> 1);
      let y = r.y + (r.h >> 1);
      for (let step = 0; step < 26; step++) {
        x += Math.floor(rng() * 3) - 1;
        y += Math.floor(rng() * 3) - 1;
        if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) break;
        this.carveCorridor(x, y);
      }
    }

    // Spawn in the middle of the spawn room.
    this.spawn = this.tileCenter(spawnRoom.x + (spawnRoom.w >> 1), spawnRoom.y + (spawnRoom.h >> 1));

    // Pillars & crystal clusters inside big rooms, gravel near the spawn
    for (const r of this.rooms) {
      if (r === spawnRoom) continue;
      if (r.w >= 6 && r.h >= 5 && rng() < 0.65) {
        const px = r.x + 1 + Math.floor(rng() * (r.w - 2));
        const py = r.y + 1 + Math.floor(rng() * (r.h - 2));
        if (this.get(px, py) === T.FLOOR) this.set(px, py, T.PILLAR);
      }
      if (rng() < 0.5) {
        const cx = r.x + Math.floor(rng() * r.w);
        const cy = r.y + Math.floor(rng() * r.h);
        if (this.get(cx, cy) === T.FLOOR) this.set(cx, cy, T.CRYSTAL);
      }
    }
    for (let ty = spawnRoom.y; ty < spawnRoom.y + spawnRoom.h; ty++) {
      for (let tx = spawnRoom.x; tx < spawnRoom.x + spawnRoom.w; tx++) {
        if (rng() < 0.3) this.set(tx, ty, T.GRAVEL);
      }
    }

    this.spawn = this.tileCenter(spawnRoom.x + (spawnRoom.w >> 1), spawnRoom.y + (spawnRoom.h >> 1));

    // Escape portal in the spawn room (bottom corner)
    const portalTX = spawnRoom.x + spawnRoom.w - 1;
    const portalTY = spawnRoom.y + spawnRoom.h - 1;
    this.set(portalTX, portalTY, T.PORTAL);
    this.portal = this.tileCenter(portalTX, portalTY);
    this.portalHint = 'LEAVE MINE';
    // never let decor sit on the portal
    this.decor = [];

    // Only place ores and spawns in areas the player can actually walk to.
    this.reachable = this.computeReachable(Math.floor(this.spawn.x / TILE), Math.floor(this.spawn.y / TILE));
    this.populateOres(wave);
    this.populateDecor();
  }

  carveCorridor(tx, ty) {
    const t = this.get(tx, ty);
    if (t === T.WALL) this.set(tx, ty, T.FLOOR);
  }

  populateOres(wave) {
    const rng = this.rng;
    const pool = ORE_TYPES.filter((o) => wave >= o.minWave);
    const weighted = [];
    for (const o of pool) {
      for (let i = 0; i < o.weight; i++) weighted.push(o);
    }
    const target = 17 + Math.min(13, wave * 1.5);
    let placed = 0;
    let guard = 0;
    while (placed < target && guard < 4000) {
      guard++;
      const tx = 1 + Math.floor(rng() * (this.w - 2));
      const ty = 1 + Math.floor(rng() * (this.h - 2));
      if (this.get(tx, ty) !== T.FLOOR) continue;
      if (this.reachable && !this.reachable[ty * this.w + tx]) continue;
      const c = this.tileCenter(tx, ty);
      const distToSpawn = Math.hypot(c.x - this.spawn.x, c.y - this.spawn.y);
      if (distToSpawn < TILE * 2.2) continue;
      if (this.oreNodes.some((n) => Math.hypot(n.x - c.x, n.y - c.y) < TILE * 1.55)) continue;
      const type = weighted[Math.floor(rng() * weighted.length)];
      const hpScale = 1 + (wave - 1) * 0.16;
      this.oreNodes.push(makeOreNode(c.x, c.y, type, hpScale, rng, placed));
      placed++;
    }
  }

  populateDecor() {
    const rng = this.rng;
    for (let i = 0; i < 95; i++) {
      const tx = 1 + Math.floor(rng() * (this.w - 2));
      const ty = 1 + Math.floor(rng() * (this.h - 2));
      const t = this.get(tx, ty);
      if (t === T.FLOOR || t === T.GRAVEL) {
        this.decor.push({
          x: tx * TILE + 4 + rng() * 24,
          y: ty * TILE + 4 + rng() * 24,
          type: rng() < 0.5 ? 'pebble' : rng() < 0.75 ? 'crack' : rng() < 0.9 ? 'mushroom' : 'bones',
          s: 0.5 + rng() * 0.8,
        });
      }
    }
  }

  /** Tile grid BFS reachable from (startTX, startTY). Returns a Uint8Array mask. */
  computeReachable(startTX, startTY) {
    const size = this.w * this.h;
    const mask = new Uint8Array(size);
    const q = new Int32Array(size);
    let head = 0;
    let tail = 0;
    if (this.isSolidTile(startTX, startTY)) return mask;
    const start = startTY * this.w + startTX;
    mask[start] = 1;
    q[tail++] = start;
    while (head < tail) {
      const cur = q[head++];
      const cx = cur % this.w;
      const cy = (cur / this.w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = ny * this.w + nx;
          if (mask[ni]) continue;
          if (this.isSolidTile(nx, ny)) continue;
          // no diagonal squeezing through a corner
          if (dx && dy && (this.isSolidTile(cx + dx, cy) || this.isSolidTile(cx, cy + dy))) continue;
          mask[ni] = 1;
          q[tail++] = ni;
        }
      }
    }
    return mask;
  }

  isReachable(x, y) {
    if (!this.reachable) return true;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.reachable[ty * this.w + tx] === 1;
  }

  /** BFS distance field from a tile - used so mobs actually path around walls. */
  buildFlowMap(targetTX, targetTY) {
    const size = this.w * this.h;
    const INF = 65535;
    if (!this.flowDist || this.flowDist.length !== size) this.flowDist = new Uint16Array(size);
    const dist = this.flowDist;
    dist.fill(INF);
    const q = new Int32Array(size);
    let head = 0;
    let tail = 0;
    const stx = Math.max(0, Math.min(this.w - 1, targetTX));
    const sty = Math.max(0, Math.min(this.h - 1, targetTY));
    const start = sty * this.w + stx;
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const cur = q[head++];
      const cx = cur % this.w;
      const cy = (cur / this.w) | 0;
      const d = dist[cur];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = ny * this.w + nx;
          if (dist[ni] <= d + 1) continue;
          if (this.isSolidTile(nx, ny)) continue;
          if (dx && dy && (this.isSolidTile(cx + dx, cy) || this.isSolidTile(cx, cy + dy))) continue;
          dist[ni] = d + 1;
          q[tail++] = ni;
        }
      }
    }
    this.flowTarget = { tx: stx, ty: sty };
  }

  /** Direction (unit vector) a mob at world x,y should walk to reach the flow target. */
  flowDirAt(x, y, targetX, targetY) {
    const dist = this.flowDist;
    if (!dist) return null;
    const tx = Math.max(0, Math.min(this.w - 1, Math.floor(x / TILE)));
    const ty = Math.max(0, Math.min(this.h - 1, Math.floor(y / TILE)));
    const here = dist[ty * this.w + tx];
    // Same tile as the target (or adjacent): just go straight at the goal.
    if (here === 65535 || here <= 1) {
      const dx = targetX - x;
      const dy = targetY - y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    }
    let bestD = here;
    let bestX = -1;
    let bestY = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        if (this.isSolidTile(nx, ny)) continue;
        if (dx && dy && (this.isSolidTile(tx + dx, ty) || this.isSolidTile(tx, ty + dy))) continue;
        const d = dist[ny * this.w + nx];
        if (d < bestD) {
          bestD = d;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    if (bestX < 0) {
      const dx = targetX - x;
      const dy = targetY - y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    }
    const cx = bestX * TILE + TILE / 2;
    const cy = bestY * TILE + TILE / 2;
    const dx = cx - x;
    const dy = cy - y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  /** Cheap line-of-sight test between two world points. */
  hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / 10);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      if (this.isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE))) return false;
    }
    return true;
  }

  /** Random walkable world point at least `minDist` from (fx, fy). */
  randomFloorPoint(fx = -9999, fy = -9999, minDist = 0) {
    for (let i = 0; i < 300; i++) {
      const tx = 1 + Math.floor(this.rng() * (this.w - 2));
      const ty = 1 + Math.floor(this.rng() * (this.h - 2));
      if (this.get(tx, ty) !== T.FLOOR) continue;
      if (this.reachable && !this.reachable[ty * this.w + tx]) continue;
      const c = this.tileCenter(tx, ty);
      if (Math.hypot(c.x - fx, c.y - fy) < minDist) continue;
      if (this.oreNodes.some((n) => Math.hypot(n.x - c.x, n.y - c.y) < TILE * 0.9)) continue;
      return c;
    }
    return { ...this.spawn };
  }

  /** Deepest overlap between a circle and solid geometry (0 when clear). */
  penetration(px, py, r, blockingOres = true) {
    let worst = 0;
    const minTX = Math.floor((px - r) / TILE);
    const maxTX = Math.floor((px + r) / TILE);
    const minTY = Math.floor((py - r) / TILE);
    const maxTY = Math.floor((py + r) / TILE);
    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        if (!this.isSolidTile(tx, ty)) continue;
        const bx = tx * TILE;
        const by = ty * TILE;
        const cx = Math.max(bx, Math.min(px, bx + TILE));
        const cy = Math.max(by, Math.min(py, by + TILE));
        const d2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (d2 < r * r) worst = Math.max(worst, r - Math.sqrt(d2));
      }
    }
    if (blockingOres) {
      for (const n of this.oreNodes) {
        if (n.dead) continue;
        const d = Math.hypot(px - n.x, py - n.y);
        const rr = r + n.radius;
        if (d < rr) worst = Math.max(worst, rr - d);
      }
    }
    return worst;
  }

  /**
   * Resolves circle movement against solid tiles + ore nodes. Returns {x,y}.
   * A move is allowed when it does not push the circle deeper into geometry,
   * so large mobs in narrow tunnels (or a player nudged into a rock) can never
   * get permanently wedged.
   */
  moveCircle(x, y, r, dx, dy, blockingOres = true) {
    const cur = this.penetration(x, y, r, blockingOres);
    const limit = cur + 0.75;
    let nx = x + dx;
    let ny = y + dy;
    if (this.penetration(nx, y, r, blockingOres) > limit) nx = x;
    if (this.penetration(nx, ny, r, blockingOres) > limit) ny = y;
    return { x: nx, y: ny };
  }
}

let oreUid = 1;

export function makeOreNode(x, y, type, hpScale = 1, rng = Math.random, seedIndex = 0) {
  const hps = Math.round(type.hp * hpScale);
  // Deterministic little crystal cluster layout.
  const r = rng;
  const shards = [];
  const count = 3 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    shards.push({
      ox: (r() - 0.5) * 18,
      oy: (r() - 0.5) * 12 - 3,
      s: 0.55 + r() * 0.85,
      rot: (r() - 0.5) * 0.6,
    });
  }
  return {
    uid: oreUid++,
    x,
    y,
    type,
    hp: hps,
    maxHp: hps,
    radius: 15,
    shards,
    seed: seedIndex * 977 + Math.floor(r() * 10000),
    hitFlash: 0,
    shake: 0,
    dead: false,
  };
}

export { TILE, MAP_W, MAP_H, mulberry32 };
