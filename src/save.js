const KEY = 'deepmine.save.v1';

export function defaultSave() {
  return {
    gold: 0,
    pickaxe: 0,
    sword: 0,
    maxHp: 100,
    hp: 100,
    speedLevel: 0,
    lampLevel: 0,
    critLevel: 0,
    bestWave: 0,
    totalGold: 0,
    potionsBought: 0,
    kills: 0,
    oresMined: 0,
    runs: 0,
  };
}

export function sanitizeSave(obj) {
  const base = defaultSave();
  if (!obj || typeof obj !== 'object') return base;
  const out = { ...base };
  for (const key of Object.keys(base)) {
    const v = obj[key];
    if (typeof base[key] === 'number' && Number.isFinite(v)) {
      out[key] = Math.max(0, Math.floor(v));
    }
  }
  out.hp = Math.max(1, Math.min(out.hp, out.maxHp));
  return out;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return sanitizeSave(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitizeSave(data)));
    return true;
  } catch {
    return false;
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
