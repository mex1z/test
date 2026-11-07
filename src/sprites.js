// Turns character-matrix pixel art into offscreen canvases.
import { ART, ART_SIZES, PALETTE } from './art.js';

let tmp = null;
function getTmp() {
  if (!tmp) {
    tmp = document.createElement('canvas');
    tmp.width = 256;
    tmp.height = 256;
  }
  return tmp;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function shadeColor(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return rgbToHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}

/** Renders a character matrix into a canvas at 1px-per-cell. */
export function renderArt(rows, palette = PALETTE) {
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export const SPRITES = {};

export function buildAllSprites() {
  for (const [name, art] of Object.entries(ART)) {
    if (Array.isArray(art)) {
      SPRITES[name] = { base: renderArt(art), w: art[0].length, h: art.length };
    } else {
      SPRITES[name] = {};
      for (const [dir, rows] of Object.entries(art)) {
        SPRITES[name][dir] = { base: renderArt(rows), w: rows[0].length, h: rows.length };
      }
    }
  }
  return SPRITES;
}

/**
 * Draws a sprite scaled by `scale`, with its feet (bottom-centre) at x,y.
 * opts: { alpha, flip, tint, flash, scaleY, scaleX, shadow }
 */
export function drawSprite(ctx, sprite, x, y, scale = 2, opts = {}) {
  if (!sprite) return;
  const { alpha = 1, flip = false, tint = null, flash = 0, scaleX = 1, scaleY = 1, anchorY = 1 } = opts;
  const w = sprite.w * scale * scaleX;
  const h = sprite.h * scale * scaleY;
  const dx = Math.round(x - w / 2);
  const dy = Math.round(y - h * anchorY);
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  if (flip) {
    ctx.translate(Math.round(x * 2), 0);
    ctx.scale(-1, 1);
    ctx.translate(-Math.round(x * 2), 0);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite.base, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h));

  if (tint) {
    // Recolour the drawn silhouette footprint using the sprite as a mask.
    const tc = getTmp();
    tc.width = sprite.w;
    tc.height = sprite.h;
    const tctx = tc.getContext('2d');
    tctx.clearRect(0, 0, tc.width, tc.height);
    tctx.drawImage(sprite.base, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = tint;
    tctx.fillRect(0, 0, tc.width, tc.height);
    tctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha *= 1;
    ctx.drawImage(tc, 0, 0, sprite.w, sprite.h, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h));
  }
  if (flash > 0) {
    const tc = getTmp();
    tc.width = sprite.w;
    tc.height = sprite.h;
    const tctx = tc.getContext('2d');
    tctx.clearRect(0, 0, tc.width, tc.height);
    tctx.drawImage(sprite.base, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, tc.width, tc.height);
    tctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha *= Math.min(1, flash);
    ctx.drawImage(tc, 0, 0, sprite.w, sprite.h, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h));
  }
  ctx.restore();
}

export function drawShadow(ctx, x, y, rx, ry = rx * 0.45, alpha = 0.28) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export { ART_SIZES };
