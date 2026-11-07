// Tiny 5x7 bitmap font so all text stays crisp and pixelated.
const G = {};

function def(chars, rows) {
  for (const c of chars) G[c] = rows.split('/');
}

def('A', '.###./#...#/#...#/#####/#...#/#...#/#...#');
def('B', '####./#...#/#...#/####./#...#/#...#/####.');
def('C', '.###./#...#/#..../#..../#..../#...#/.###.');
def('D', '####./#...#/#...#/#...#/#...#/#...#/####.');
def('E', '#####/#..../#..../####./#..../#..../#####');
def('F', '#####/#..../#..../####./#..../#..../#....');
def('G', '.###./#...#/#..../#.###/#...#/#...#/.###.');
def('H', '#...#/#...#/#...#/#####/#...#/#...#/#...#');
def('I', '#####/..#../..#../..#../..#../..#../#####');
def('J', '..###/...#./...#./...#./...#./#..#./.##..');
def('K', '#...#/#..#./#.#../##.../#.#../#..#./#...#');
def('L', '#..../#..../#..../#..../#..../#..../#####');
def('M', '#...#/##.##/#.#.#/#...#/#...#/#...#/#...#');
def('N', '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#');
def('O', '.###./#...#/#...#/#...#/#...#/#...#/.###.');
def('P', '####./#...#/#...#/####./#..../#..../#....');
def('Q', '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#');
def('R', '####./#...#/#...#/####./#.#../#..#./#...#');
def('S', '.####/#..../#..../.###./....#/....#/####.');
def('T', '#####/..#../..#../..#../..#../..#../..#..');
def('U', '#...#/#...#/#...#/#...#/#...#/#...#/.###.');
def('V', '#...#/#...#/#...#/#...#/#...#/.#.#./..#..');
def('W', '#...#/#...#/#...#/#...#/#.#.#/##.##/#...#');
def('X', '#...#/#...#/.#.#./..#../.#.#./#...#/#...#');
def('Y', '#...#/#...#/.#.#./..#../..#../..#../..#..');
def('Z', '#####/....#/...#./..#../.#.../#..../#####');
def('0', '.###./#...#/#..##/#.#.#/##..#/#...#/.###.');
def('1', '..#../.##../..#../..#../..#../..#../.###.');
def('2', '.###./#...#/....#/...#./..#../.#.../#####');
def('3', '#####/...#./..#../...#./....#/#...#/.###.');
def('4', '...#./..##./.#.#./#..#./#####/...#./...#.');
def('5', '#####/#..../####./....#/....#/#...#/.###.');
def('6', '..##./.#.../#..../####./#...#/#...#/.###.');
def('7', '#####/....#/...#./..#../.#.../.#.../.#...');
def('8', '.###./#...#/#...#/.###./#...#/#...#/.###.');
def('9', '.###./#...#/#...#/.####/....#/...#./.##..');
def('.', '...../...../...../...../...../.##../.##..');
def(',', '...../...../...../...../.##../.##../.#...');
def(':', '...../.##../.##../...../.##../.##../.....');
def('!', '..#../..#../..#../..#../..#../...../..#..');
def('?', '.###./#...#/....#/..##./..#../...../..#..');
def('+', '...../..#../..#../#####/..#../..#../.....');
def('-', '...../...../...../#####/...../...../.....');
def('/', '....#/...#./..#../..#../.#.../#..../#....');
def('%', '##..#/##.#./..#../.#.../#..##/..#.#/.....');
def('$', '..#../.####/#.#../.###./..#.#/####./..#..');
def("'", '..#../..#../...../...../...../...../.....');
def('(', '...#./..#../.#.../.#.../.#.../..#../...#.');
def(')', '.#.../..#../...#./...#./...#./..#../.#...');
def('*', '...../#.#.#/.###./#####/.###./#.#.#/.....');
def('<', '...#./..#../.#.../#..../.#.../..#../...#.');
def('>', '.#.../..#../...#./....#/...#./..#../.#...');
def('=', '...../...../#####/...../#####/...../.....');
def('_', '...../...../...../...../...../...../#####');
def('[', '..###/..#../..#../..#../..#../..#../..###');
def(']', '###../..#../..#../..#../..#../..#../###..');
def('x', '...../...../#...#/.#.#./..#../.#.#./#...#');
def('#', '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.');
def('~', '...../...../.##.#/#..##/...../...../.....');

export const FONT_W = 5;
export const FONT_H = 7;
export const FONT_GAP = 1;

const cache = new Map();

function glyphCanvas(ch, color) {
  const key = ch + '|' + color;
  let c = cache.get(key);
  if (c) return c;
  const rows = G[ch] || G['?'];
  c = document.createElement('canvas');
  c.width = FONT_W;
  c.height = FONT_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  for (let y = 0; y < FONT_H; y++) {
    for (let x = 0; x < FONT_W; x++) {
      if (rows[y][x] === '#') ctx.fillRect(x, y, 1, 1);
    }
  }
  cache.set(key, c);
  return c;
}

export function normalizeChar(ch) {
  const up = ch.toUpperCase();
  if (G[up] && up !== 'X') return up;
  if (G[ch] && ch === 'x') return 'x';
  if (G[up]) return up;
  return up;
}

export function textWidth(text, scale = 2) {
  const s = String(text);
  if (s.length === 0) return 0;
  return s.length * (FONT_W + FONT_GAP) * scale - FONT_GAP * scale;
}

/**
 * Draws pixel text. opts: { align: 'left'|'center'|'right', shadow: color|false,
 *   outline: color, maxChars }
 */
export function drawText(ctx, text, x, y, scale = 2, color = '#ffffff', opts = {}) {
  const str = String(text);
  const { align = 'left', shadow = 'rgba(0,0,0,0.55)', outline = null } = opts;
  const w = textWidth(str, scale);
  let ox = x;
  if (align === 'center') ox = x - w / 2;
  else if (align === 'right') ox = x - w;
  ox = Math.round(ox);
  const oy = Math.round(y);

  const paint = (px, py, col) => {
    let cx = px;
    for (const ch of str) {
      if (ch === ' ') {
        cx += (FONT_W + FONT_GAP) * scale;
        continue;
      }
      const g = glyphCanvas(normalizeChar(ch), col);
      ctx.drawImage(g, 0, 0, FONT_W, FONT_H, cx, py, FONT_W * scale, FONT_H * scale);
      cx += (FONT_W + FONT_GAP) * scale;
    }
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (outline) {
    const o = Math.max(1, Math.round(scale / 2));
    for (let dx = -o; dx <= o; dx++) {
      for (let dy = -o; dy <= o; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) > o + 0.5) continue;
        paint(ox + dx, oy + dy, outline);
      }
    }
  }
  if (shadow) paint(ox + scale, oy + scale, shadow);
  paint(ox, oy, color);
  ctx.restore();
  return w;
}

/** Greedy word wrap. Returns array of lines that fit within maxWidth. */
export function wrapText(text, maxWidth, scale = 2) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (textWidth(test, scale) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
