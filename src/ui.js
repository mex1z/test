// Lightweight immediate-mode button helper for the pixel HUD.
import { drawText, textWidth } from './font.js';

function inside(r, m) {
  return m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
}

const THEME = {
  panel: 'rgba(16,14,28,0.94)',
  panelEdge: '#4a4270',
  panelEdgeLit: '#8a7dff',
  primary: '#ffd447',
  primaryDark: '#b8860b',
  text: '#f2f0ff',
  dim: '#a49fc6',
  good: '#7fe6a4',
  bad: '#ff7b8a',
};

export class UI {
  constructor(input) {
    this.input = input;
    this.prevRects = new Map();
    this.nextRects = new Map();
    this.hoverId = null;
    this.clickId = null;
    this.consumedClick = false;
    this.cursor = false;
  }

  begin() {
    this.prevRects = this.nextRects;
    this.nextRects = new Map();
    this.hoverId = null;
    this.clickId = null;
    this.consumedClick = false;
    this.cursor = false;
    const m = this.input.mouse;
    for (const [id, r] of this.prevRects) {
      if (inside(r, m)) {
        this.hoverId = id;
        this.cursor = true;
        if (this.input.mouse.clicked) {
          this.clickId = id;
          this.consumedClick = true;
        }
      }
    }
  }

  end() {
    return this.consumedClick;
  }

  wasClicked(id) {
    return this.clickId === id;
  }

  /** Draws a button; returns clickId === id. */
  button(id, x, y, w, h, label, opts = {}) {
    const {
      style = 'primary',
      disabled = false,
      scale = 2,
      sub = null,
      icon = null,
    } = opts;
    this.nextRects.set(id, { x, y, w, h });
    const m = this.input.mouse;
    const hover = !disabled && inside({ x, y, w, h }, m);
    if (hover) this.cursor = true;
    const pressed = hover && m.down;

    let fill = '#241f3d';
    let edge = THEME.panelEdge;
    let textCol = THEME.text;
    if (style === 'primary') {
      fill = disabled ? '#3a3350' : pressed ? '#a87f14' : hover ? '#e8bb2e' : '#c99a16';
      edge = disabled ? '#4a4260' : hover ? '#fff3a8' : '#8a6a10';
      textCol = disabled ? '#8b84a8' : '#221a06';
    } else if (style === 'danger') {
      fill = disabled ? '#3a3350' : hover ? '#b4353f' : '#8f2226';
      edge = hover ? '#ff9db1' : '#5a1a1e';
      textCol = disabled ? '#8b84a8' : '#ffe9ec';
    } else if (style === 'ghost') {
      fill = hover ? 'rgba(120,100,220,0.30)' : 'rgba(30,26,52,0.65)';
      edge = hover ? THEME.panelEdgeLit : '#443c66';
      textCol = disabled ? '#6f6a8c' : THEME.text;
    } else if (style === 'tab') {
      const active = opts.active;
      fill = active ? '#5b31b0' : hover ? '#2e2850' : '#221d3b';
      edge = active ? '#b58cff' : hover ? '#6a5fa0' : '#3a3358';
      textCol = active ? '#ffffff' : disabled ? '#6f6a8c' : THEME.dim;
    }

    // Pixel bevel
    const ctx = this.ctx;
    if (ctx) {
      ctx.fillStyle = edge;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = fill;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 2, y + 2, w - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 2, y + h - 4, w - 4, 2);
      if (hover) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      }
    }

    const ty = y + h / 2 - (sub ? 10 : 5);
    if (icon) {
      const tw = textWidth(label, scale);
      const total = tw + 22 + (icon.w * 2);
      const ix = x + (w - total) / 2;
      if (ctx) ctx.drawImage(icon.base, ix, y + h / 2 - icon.h, icon.w * 2, icon.h * 2);
      drawText(ctx, label, ix + icon.w * 2 + 8, ty, scale, textCol, {
        shadow: style === 'primary' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.6)',
      });
      if (sub) drawText(ctx, sub, ix + icon.w * 2 + 8, ty + 14, 1, THEME.dim, { align: 'left' });
      return this.clickId === id;
    }
    drawText(ctx, label, x + w / 2, ty, scale, textCol, {
      align: 'center',
      shadow: style === 'primary' ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.65)',
    });
    if (sub) {
      drawText(ctx, sub, x + w / 2, ty + 16, 1, style === 'primary' ? 'rgba(30,20,0,0.72)' : THEME.dim, {
        align: 'center',
        shadow: false,
      });
    }
    return this.clickId === id;
  }

  panel(x, y, w, h, opts = {}) {
    const ctx = this.ctx;
    const { fill = THEME.panel, edge = THEME.panelEdge, accent = null } = opts;
    if (!ctx) return;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 5, y + 5, w, h);
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#141221';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(x + 4, y + 4, w - 8, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + 4, y + 6, w - 8, 1);
  }

  dimScreen(alpha = 0.72) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = `rgba(6,4,14,${alpha})`;
    ctx.fillRect(0, 0, this.input.w, this.input.h);
  }
}

export { THEME, inside };
