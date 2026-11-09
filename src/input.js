// Keyboard + mouse input with logical (canvas-space) coordinates.
export class Input {
  constructor(canvas, logicalW, logicalH) {
    this.canvas = canvas;
    this.w = logicalW;
    this.h = logicalH;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: logicalW / 2, y: logicalH / 2, down: false, clicked: false };
    this.anyKey = false;
    this._bind();
  }

  _toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * this.w,
      y: ((clientY - r.top) / r.height) * this.h,
    };
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      // typing into a text box (the co-op name / room code) must not drive the game
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.anyKey = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });

    const move = (e) => {
      const p = this._toLogical(e.clientX, e.clientY);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
    };
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mousedown', (e) => {
      move(e);
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
        this.pressed.add('mouse');
      }
      if (e.button === 2) this.pressed.add('rmouse');
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: tap to move/attack toward point.
    this.canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const p = this._toLogical(t.clientX, t.clientY);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.down = true;
      this.mouse.clicked = true;
      this.pressed.add('mouse');
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const p = this._toLogical(t.clientX, t.clientY);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      this.mouse.down = false;
      e.preventDefault();
    }, { passive: false });
  }

  isDown(...keys) {
    return keys.some((k) => this.keys.has(k));
  }

  wasPressed(...keys) {
    return keys.some((k) => this.pressed.has(k));
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
    this.anyKey = false;
  }
}
