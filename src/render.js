import { TILE, VIEW_W, VIEW_H } from './data.js';
import { T } from './world.js';
import { drawSprite, drawShadow, shadeColor } from './sprites.js';
import { drawText, textWidth } from './font.js';

const tileCache = new Map();
let patternSeed = 1234;

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function floorTile(biome, variant) {
  const key = `floor|${biome.floor.join(',')}|${variant}`;
  let c = tileCache.get(key);
  if (c) return c;
  c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  const rng = rngFrom(variant * 7717 + 55);
  ctx.fillStyle = biome.floor[variant % biome.floor.length];
  ctx.fillRect(0, 0, TILE, TILE);
  // dithered speckles
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rng() * TILE);
    const y = Math.floor(rng() * TILE);
    const shadeDark = rng() < 0.62;
    ctx.fillStyle = shadeDark ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.055)';
    const s = rng() < 0.82 ? 2 : 4;
    ctx.fillRect(x, y, s, s);
  }
  // a couple of pebbles
  for (let i = 0; i < 3; i++) {
    const x = 3 + Math.floor(rng() * (TILE - 8));
    const y = 3 + Math.floor(rng() * (TILE - 8));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y + 1, 4, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, 3, 1);
  }
  tileCache.set(key, c);
  return c;
}

function wallTile(biome, variant, topOpen) {
  const key = `wall|${biome.wall.join(',')}|${variant}|${topOpen}`;
  let c = tileCache.get(key);
  if (c) return c;
  c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  const rng = rngFrom(variant * 3313 + 91);
  ctx.fillStyle = biome.wall[0];
  ctx.fillRect(0, 0, TILE, TILE);
  // rock blocks
  const blocks = [
    [0, 0, 15, 14],
    [16, 0, 16, 10],
    [0, 15, 21, 17],
    [22, 11, 10, 21],
  ];
  for (const [bx, by, bw, bh] of blocks) {
    const v = rng();
    ctx.fillStyle = v < 0.33 ? shadeColor(biome.wall[0], 0.06) : v < 0.66 ? shadeColor(biome.wall[0], -0.12) : biome.wall[1];
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(bx, by, bw, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx, by + bh - 2, bw, 2);
  }
  // lit top face where the wall meets open floor below (reads as a cliff edge)
  if (topOpen) {
    ctx.fillStyle = shadeColor(biome.wall[0], 0.24);
    ctx.fillRect(0, TILE - 9, TILE, 9);
    ctx.fillStyle = shadeColor(biome.wall[0], 0.40);
    ctx.fillRect(0, TILE - 9, TILE, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, TILE - 1, TILE, 2);
  } else {
    // interior seams so solid rock still reads as blocks
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, TILE - 2, TILE, 2);
  }
  tileCache.set(key, c);
  return c;
}

function gravelTile(biome) {
  const key = `gravel|${biome.floor.join(',')}`;
  let c = tileCache.get(key);
  if (c) return c;
  c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.drawImage(floorTile(biome, 0), 0, 0);
  const rng = rngFrom(4242);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * (TILE - 3));
    const y = Math.floor(rng() * (TILE - 3));
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y, 3, 2);
  }
  tileCache.set(key, c);
  return c;
}

function rugTile() {
  const key = 'rug';
  let c = tileCache.get(key);
  if (c) return c;
  c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6d2f43';
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#86405a';
  ctx.fillRect(0, 0, TILE, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 8; i++) ctx.fillRect(2, 6 + i * 3, TILE - 4, 1);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(0, 0, 2, TILE);
  ctx.fillRect(TILE - 2, 0, 2, TILE);
  tileCache.set(key, c);
  return c;
}

export function clearTileCache() {
  tileCache.clear();
}

export function drawWorld(ctx, world, time, camera) {
  const ox = camera.x | 0;
  const oy = camera.y | 0;
  const biome = world.biome;

  // floors first
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      const t = world.get(tx, ty);
      const x = tx * TILE + ox;
      const y = ty * TILE + oy;
      if (t === T.WALL) continue;
      if (t === T.RUG) {
        ctx.drawImage(rugTile(), x, y);
        continue;
      }
      if (t === T.GRAVEL) {
        ctx.drawImage(gravelTile(biome), x, y);
        continue;
      }
      const variant = ((tx * 7 + ty * 13) % 4 + 4) % 4;
      ctx.drawImage(floorTile(biome, variant), x, y);
    }
  }

  // portal glow ellipse under the portal tiles
  if (world.portal) {
    const p = world.portal;
    const g = ctx.createRadialGradient(p.x + ox, p.y + oy, 4, p.x + ox, p.y + oy, TILE * 2.1);
    g.addColorStop(0, 'rgba(120,80,255,0.55)');
    g.addColorStop(0.55, 'rgba(90,50,220,0.22)');
    g.addColorStop(1, 'rgba(60,30,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x + ox - TILE * 2.2, p.y + oy - TILE * 2.2, TILE * 4.4, TILE * 4.4);
  }

  // walls / props
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      const t = world.get(tx, ty);
      if (t === T.WALL) {
        const topOpen = world.get(tx, ty + 1) !== T.WALL;
        const variant = ((tx * 5 + ty * 3) % 4 + 4) % 4;
        ctx.drawImage(wallTile(biome, variant, topOpen), tx * TILE + ox, ty * TILE + oy);
      } else if (t === T.PILLAR) {
        drawPillar(ctx, tx * TILE + ox, ty * TILE + oy);
      } else if (t === T.CRYSTAL) {
        drawCrystalDecor(ctx, tx * TILE + ox, ty * TILE + oy, time, biome);
      } else if (t === T.COUNTER) {
        drawCounter(ctx, tx * TILE + ox, ty * TILE + oy, world.get(tx, ty - 1) === T.COUNTER);
      } else if (t === T.CRATE) {
        drawCrate(ctx, tx * TILE + ox, ty * TILE + oy);
      } else if (t === T.ANVIL) {
        drawAnvil(ctx, tx * TILE + ox, ty * TILE + oy, time);
      } else if (t === T.TABLE) {
        drawTable(ctx, tx * TILE + ox, ty * TILE + oy);
      } else if (t === T.LANTERN) {
        drawLantern(ctx, tx * TILE + ox + TILE / 2, ty * TILE + oy + TILE / 2, time);
      } else if (t === T.PORTAL) {
        drawPortalTile(ctx, tx * TILE + ox, ty * TILE + oy, time, world.kind === 'hub');
      }
    }
  }

  // ground decor
  for (const d of world.decor) {
    drawDecor(ctx, d, ox, oy, time);
  }

  // Ore nodes are deliberately NOT drawn here: the game y-sorts them with
  // actors so the player can walk behind big clusters.
}

function drawPillar(ctx, x, y) {
  drawShadow(ctx, x + TILE / 2, y + TILE - 4, 14, 6, 0.35);
  ctx.fillStyle = '#141221';
  ctx.fillRect(x + 4, y + 2, TILE - 8, TILE - 6);
  ctx.fillStyle = '#4b4a63';
  ctx.fillRect(x + 6, y + 4, TILE - 12, TILE - 10);
  ctx.fillStyle = '#6b6a87';
  ctx.fillRect(x + 6, y + 4, TILE - 12, 4);
  ctx.fillStyle = '#33324a';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 6, y + 12 + i * 5, TILE - 12, 2);
  ctx.fillStyle = '#8b8aa8';
  ctx.fillRect(x + 6, y + 4, 3, TILE - 10);
}

function drawCrystalDecor(ctx, x, y, time, biome) {
  const cx = x + TILE / 2;
  const cy = y + TILE - 6;
  const pulse = 0.6 + 0.4 * Math.sin(time * 2 + x * 0.05);
  drawShadow(ctx, cx, cy + 2, 13, 5, 0.3);
  const col = biome.accent || '#7fe6c4';
  for (let i = 0; i < 3; i++) {
    const ang = -0.6 + i * 0.6;
    const hgt = 8 + i * 4 + 6;
    ctx.save();
    ctx.translate(cx - 5 + i * 6, cy);
    ctx.rotate(ang * 0.45);
    ctx.globalAlpha = 0.35 + palmPulse(pulse);
    ctx.fillStyle = col;
    ctx.fillRect(-3, -hgt, 6, hgt);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = shadeColor(col, 0.35);
    ctx.fillRect(-2, -hgt, 2, hgt);
    ctx.restore();
  }
  const g = ctx.createRadialGradient(cx, cy - 10, 2, cx, cy - 10, 26);
  g.addColorStop(0, `rgba(150,255,230,${0.10 + pulse * 0.09})`);
  g.addColorStop(1, 'rgba(150,255,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 28, cy - 38, 56, 56);
}

function palmPulse(p) {
  return p * 0.35;
}

function drawCounter(ctx, x, y, isUpper) {
  // shop counter: wooden top with brass trim
  ctx.fillStyle = '#141221';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#6a4126';
  ctx.fillRect(x, y + 6, TILE, TILE - 6);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(x + 1, y + 7, TILE - 2, TILE - 12);
  // planks
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  for (let i = 1; i < 3; i++) ctx.fillRect(x + 1, y + 7 + i * 8, TILE - 2, 1);
  // top edge brass
  ctx.fillStyle = '#ffd447';
  ctx.fillRect(x, y + 5, TILE, 3);
  ctx.fillStyle = '#fff3a8';
  ctx.fillRect(x, y + 5, TILE, 1);
  if (!isUpper) {
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(x + 2, y + TILE - 3, TILE - 4, 3);
  }
}

function drawCrate(ctx, x, y) {
  drawShadow(ctx, x + TILE / 2, y + TILE - 3, 14, 5, 0.35);
  ctx.fillStyle = '#141221';
  ctx.fillRect(x + 3, y + 4, TILE - 6, TILE - 8);
  ctx.fillStyle = '#7a4a24';
  ctx.fillRect(x + 4, y + 5, TILE - 8, TILE - 10);
  ctx.fillStyle = '#a06a34';
  ctx.fillRect(x + 4, y + 5, TILE - 8, 3);
  ctx.fillStyle = '#5a3318';
  ctx.fillRect(x + 4, y + TILE / 2 - 2, TILE - 8, 4);
  ctx.fillRect(x + TILE / 2 - 2, y + 5, 4, TILE - 10);
  ctx.fillStyle = '#ffd447';
  ctx.fillRect(x + TILE / 2 - 2, y + TILE / 2 - 2, 4, 4);
}

function drawAnvil(ctx, x, y, time) {
  drawShadow(ctx, x + TILE / 2, y + TILE - 4, 13, 5, 0.35);
  ctx.fillStyle = '#141221';
  ctx.fillRect(x + 7, y + 12, 18, 12);
  ctx.fillRect(x + 4, y + 8, 24, 7);
  ctx.fillStyle = '#4a5468';
  ctx.fillRect(x + 8, y + 13, 16, 10);
  ctx.fillRect(x + 5, y + 9, 22, 5);
  ctx.fillStyle = '#7c8899';
  ctx.fillRect(x + 5, y + 9, 22, 2);
  // spark
  if (Math.sin(time * 6) > 0.85) {
    ctx.fillStyle = '#fff3a8';
    ctx.fillRect(x + 14, y + 6, 3, 3);
  }
}

function drawTable(ctx, x, y) {
  drawShadow(ctx, x + TILE / 2, y + TILE - 4, 14, 5, 0.32);
  ctx.fillStyle = '#141221';
  ctx.fillRect(x + 2, y + 10, TILE - 4, 18);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(x + 3, y + 11, TILE - 6, 13);
  ctx.fillStyle = '#a06a34';
  ctx.fillRect(x + 3, y + 11, TILE - 6, 3);
  ctx.fillStyle = '#5a3618';
  ctx.fillRect(x + 5, y + 24, 4, 4);
  ctx.fillRect(x + TILE - 9, y + 24, 4, 4);
  // little sword on the bench
  ctx.fillStyle = '#cdd6e4';
  ctx.fillRect(x + 11, y + 8, 2, 10);
  ctx.fillRect(x + 9, y + 16, 6, 2);
  ctx.fillStyle = '#ffd447';
  ctx.fillRect(x + 11, y + 18, 2, 4);
}

function drawLantern(ctx, cx, cy, time) {
  const flicker = 0.75 + 0.25 * Math.sin(time * 7 + cx);
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 44);
  g.addColorStop(0, `rgba(255,210,120,${0.20 * flicker})`);
  g.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 46, cy - 46, 92, 92);
  ctx.fillStyle = '#141221';
  ctx.fillRect(cx - 5, cy - 8, 10, 16);
  ctx.fillStyle = '#5a3618';
  ctx.fillRect(cx - 4, cy - 10, 8, 3);
  ctx.fillRect(cx - 4, cy + 6, 8, 3);
  ctx.fillStyle = `rgba(255,220,130,${0.85 * flicker})`;
  ctx.fillRect(cx - 3, cy - 6, 6, 12);
  ctx.fillStyle = '#fff8d0';
  ctx.fillRect(cx - 1, cy - 4, 2, 8);
}

function drawPortalTile(ctx, x, y, time, isHub) {
  if (isHub) {
    ctx.fillStyle = 'rgba(40,20,90,0.85)';
    ctx.fillRect(x, y, TILE, TILE);
    const g = ctx.createRadialGradient(x + TILE / 2, y + TILE / 2, 2, x + TILE / 2, y + TILE / 2, TILE / 2 + 2);
    g.addColorStop(0, 'rgba(180,150,255,0.9)');
    g.addColorStop(0.55, 'rgba(120,80,255,0.55)');
    g.addColorStop(1, 'rgba(70,30,180,0.15)');
    ctx.fillStyle = g;
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  } else {
    ctx.fillStyle = 'rgba(30,14,60,0.8)';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = 'rgba(150,110,255,0.5)';
    ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
  }
  // swirling sparks
  for (let i = 0; i < 3; i++) {
    const a = time * 2 + (i * Math.PI * 2) / 3 + x * 0.02;
    const r = 8 + Math.sin(time * 3 + i) * 3;
    ctx.fillStyle = i % 2 ? '#d9c8ff' : '#fff';
    ctx.fillRect(x + TILE / 2 + Math.cos(a) * r - 1, y + TILE / 2 + Math.sin(a) * r * 0.6 - 1, 3, 3);
  }
}

function drawDecor(ctx, d, ox, oy, time) {
  const x = d.x + ox;
  const y = d.y + oy;
  if (d.type === 'pebble') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + 2, 5 * d.s, 3 * d.s);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, 4 * d.s, 2 * d.s);
  } else if (d.type === 'scratch' || d.type === 'crack') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y, 8 * d.s, 1);
    ctx.fillRect(x + 6 * d.s, y + 2, 5 * d.s, 1);
  } else if (d.type === 'mushroom') {
    const sway = Math.sin(time * 2 + x) * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 1, y + 3, 5, 2);
    ctx.fillStyle = '#c8b8a0';
    ctx.fillRect(x + 2, y + 1, 2, 3);
    ctx.fillStyle = '#7fe6ff';
    ctx.fillRect(x + 1 + sway, y - 1, 4, 2);
  } else if (d.type === 'bones') {
    ctx.fillStyle = '#cdd6e4';
    ctx.fillRect(x, y, 7, 2);
    ctx.fillRect(x + 1, y - 2, 2, 2);
    ctx.fillRect(x + 5, y - 2, 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + 2, 7, 1);
  }
}

export function drawOreNode(ctx, n, ox, oy, time) {
  const x = n.x + ox + (n.shake ? Math.sin(time * 60) * n.shake * 4 : 0);
  const y = n.y + oy;
  const col = n.type.color;
  const dark = shadeColor(col, -0.55);
  const rich = n.type.value >= 20;

  if (rich) {
    const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 34);
    g.addColorStop(0, `${col}44`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.fillRect(x - 36, y - 40, 72, 72);
  }

  drawShadow(ctx, x, y + 9, 16, 6, 0.34);

  // rocky base, tinted by the ore so clusters read at a glance
  ctx.fillStyle = '#141221';
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 17, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(col, -0.72);
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 15, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(col, -0.55);
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 2, 10, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shadeColor(col, -0.35);
  ctx.fillRect(x - 11, y - 6, 6, 2);

  // crystal shards
  for (const s of n.shards) {
    const sx = x + s.ox;
    const sy = y + s.oy + 2;
    const hgt = 15 * s.s;
    const wid = 6.5 * s.s;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(s.rot);
    // outline
    ctx.fillStyle = '#141221';
    ctx.beginPath();
    ctx.moveTo(0, -hgt - 2);
    ctx.lineTo(wid + 1.5, -hgt * 0.55);
    ctx.lineTo(wid - 0.5, 1);
    ctx.lineTo(-wid + 0.5, 1);
    ctx.lineTo(-wid - 1.5, -hgt * 0.55);
    ctx.closePath();
    ctx.fill();
    // crystal body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -hgt);
    ctx.lineTo(wid, -hgt * 0.55);
    ctx.lineTo(wid - 1.5, 0);
    ctx.lineTo(-wid + 1.5, 0);
    ctx.lineTo(-wid, -hgt * 0.55);
    ctx.closePath();
    ctx.fill();
    // lit facet
    ctx.fillStyle = shadeColor(col, 0.42);
    ctx.beginPath();
    ctx.moveTo(0, -hgt);
    ctx.lineTo(-wid * 0.28, -hgt * 0.6);
    ctx.lineTo(-wid * 0.28, -1);
    ctx.lineTo(-wid + 1.5, -1);
    ctx.lineTo(-wid, -hgt * 0.55);
    ctx.closePath();
    ctx.fill();
    // dark facet
    ctx.fillStyle = shadeColor(col, -0.3);
    ctx.fillRect(wid * 0.35, -hgt * 0.5, 2.5 * s.s, hgt * 0.5);
    if (n.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, n.hitFlash * 2)})`;
      ctx.fillRect(-wid, -hgt, wid * 2, hgt + 1);
    }
    ctx.restore();
  }

  // sparkle
  const glint = (Math.sin(time * 2.4 + n.seed) + 1) / 2;
  if (glint > 0.86) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const gx = x + Math.sin(n.seed) * 9;
    const gy = y - 12 + Math.cos(n.seed * 3) * 5;
    ctx.fillRect(gx, gy - 4, 2, 8);
    ctx.fillRect(gx - 4, gy, 8, 2);
  }

  // durability pips when chipped
  if (n.hp < n.maxHp) {
    const pct = n.hp / n.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 14, y - 28, 28, 6);
    ctx.fillStyle = dark;
    ctx.fillRect(x - 13, y - 27, 26, 4);
    ctx.fillStyle = col;
    ctx.fillRect(x - 13, y - 27, 26 * pct, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - 13, y - 27, 26 * pct, 1);
  }
}

/** Vignette + lantern light for mine levels. */
export function drawMineLighting(ctx, player, lightRadius, time, bossAlive) {
  ctx.save();
  if (bossAlive) {
    ctx.fillStyle = 'rgba(120,20,40,0.12)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  const g = ctx.createRadialGradient(player.x, player.y - 8, lightRadius * 0.38, player.x, player.y - 8, lightRadius);
  g.addColorStop(0, 'rgba(4,3,12,0)');
  g.addColorStop(0.55, 'rgba(4,3,12,0.14)');
  g.addColorStop(1, 'rgba(3,2,9,0.70)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // warm lantern tint near the player
  const w = ctx.createRadialGradient(player.x, player.y - 6, 2, player.x, player.y - 6, lightRadius * 0.6);
  w.addColorStop(0, 'rgba(255,196,110,0.10)');
  w.addColorStop(1, 'rgba(255,196,110,0)');
  ctx.fillStyle = w;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}

export function drawVignette(ctx, strength = 0.5) {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export { drawText, textWidth, drawSprite, drawShadow, shadeColor };
