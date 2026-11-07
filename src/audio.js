// Tiny procedural sound engine (no audio assets needed).
let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.22;
  return muted;
}

function tone({ freq = 440, freq2 = null, type = 'square', dur = 0.12, gain = 0.5, delay = 0, attack = 0.005 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.15, gain = 0.4, delay = 0, filter = 1200, type = 'lowpass' }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bq = ctx.createBiquadFilter();
  bq.type = type;
  bq.frequency.value = filter;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(bq);
  bq.connect(g);
  g.connect(master);
  src.start(t0);
}

const SFX = {
  mine() {
    noise({ dur: 0.08, gain: 0.35, filter: 2400, type: 'bandpass' });
    tone({ freq: 180, freq2: 120, type: 'square', dur: 0.06, gain: 0.18 });
  },
  break() {
    noise({ dur: 0.28, gain: 0.5, filter: 900 });
    tone({ freq: 140, freq2: 60, type: 'sawtooth', dur: 0.2, gain: 0.25 });
  },
  coin() {
    tone({ freq: 880, type: 'square', dur: 0.06, gain: 0.25 });
    tone({ freq: 1320, type: 'square', dur: 0.10, gain: 0.2, delay: 0.05 });
  },
  swoosh() {
    noise({ dur: 0.12, gain: 0.22, filter: 1800, type: 'highpass' });
  },
  hit() {
    noise({ dur: 0.1, gain: 0.45, filter: 1500 });
    tone({ freq: 220, freq2: 90, type: 'square', dur: 0.1, gain: 0.25 });
  },
  crit() {
    tone({ freq: 1200, freq2: 400, type: 'square', dur: 0.14, gain: 0.22 });
    noise({ dur: 0.14, gain: 0.4, filter: 2600, type: 'highpass' });
  },
  kill() {
    tone({ freq: 320, freq2: 80, type: 'sawtooth', dur: 0.22, gain: 0.2 });
    noise({ dur: 0.2, gain: 0.25, filter: 700 });
  },
  hurt() {
    tone({ freq: 200, freq2: 70, type: 'sawtooth', dur: 0.25, gain: 0.3 });
    noise({ dur: 0.15, gain: 0.3, filter: 500 });
  },
  buy() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.1, gain: 0.18, delay: i * 0.06 }));
  },
  deny() {
    tone({ freq: 180, type: 'square', dur: 0.12, gain: 0.22 });
    tone({ freq: 130, type: 'square', dur: 0.16, gain: 0.22, delay: 0.09 });
  },
  wave() {
    [392, 523, 659].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.2, delay: i * 0.1 }));
  },
  clear() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.16, gain: 0.16, delay: i * 0.08 }));
  },
  zap() {
    tone({ freq: 600, freq2: 1400, type: 'sine', dur: 0.18, gain: 0.18 });
    tone({ freq: 300, freq2: 900, type: 'triangle', dur: 0.18, gain: 0.12 });
  },
  slam() {
    noise({ dur: 0.4, gain: 0.55, filter: 320 });
    tone({ freq: 90, freq2: 35, type: 'sine', dur: 0.35, gain: 0.35 });
  },
  heal() {
    [440, 554, 659].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.18, gain: 0.16, delay: i * 0.05 }));
  },
  die() {
    [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.22, delay: i * 0.14 }));
  },
  click() {
    tone({ freq: 620, type: 'square', dur: 0.04, gain: 0.14 });
  },
  step() {
    noise({ dur: 0.05, gain: 0.06, filter: 600 });
  },
};

export function play(name) {
  const fn = SFX[name];
  if (fn) {
    try {
      fn();
    } catch {
      /* audio is best-effort */
    }
  }
}
