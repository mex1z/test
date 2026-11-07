// Game balance & content definitions.

export const TILE = 32;
export const MAP_W = 30;
export const MAP_H = 18;
export const VIEW_W = TILE * MAP_W;
export const VIEW_H = TILE * MAP_H;

export const PICKAXES = [
  { id: 'wood', name: 'Wooden Pick', price: 0, power: 1, gold: 1.0, color: '#a06a34', hl: '#c98f52' },
  { id: 'copper', name: 'Copper Pick', price: 70, power: 1.5, gold: 1.3, color: '#d1793d', hl: '#f5b46e' },
  { id: 'iron', name: 'Iron Pick', price: 190, power: 2.2, gold: 1.7, color: '#b9c3d1', hl: '#eef3ff' },
  { id: 'steel', name: 'Steel Pick', price: 430, power: 3.1, gold: 2.2, color: '#93b6d6', hl: '#d7ecff' },
  { id: 'cobalt', name: 'Cobalt Pick', price: 900, power: 4.3, gold: 2.9, color: '#5f8cff', hl: '#a9c4ff' },
  { id: 'crimson', name: 'Crimson Pick', price: 1800, power: 5.8, gold: 3.7, color: '#e5546f', hl: '#ff9db1' },
  { id: 'obsidian', name: 'Obsidian Pick', price: 3300, power: 7.6, gold: 4.7, color: '#6b4bb8', hl: '#a98cff' },
  { id: 'mythril', name: 'Mythril Pick', price: 5800, power: 10, gold: 6.0, color: '#4ff0d0', hl: '#b8fff2' },
  { id: 'starforged', name: 'Starforged Pick', price: 9500, power: 13, gold: 7.5, color: '#ffd447', hl: '#fff8c9' },
];

export const SWORDS = [
  { id: 'rusty', name: 'Rusty Sword', price: 0, damage: 14, color: '#9aa3b2', hl: '#e8eef9' },
  { id: 'iron', name: 'Iron Sword', price: 85, damage: 24, color: '#b9c3d1', hl: '#eef3ff' },
  { id: 'steel', name: 'Steel Sword', price: 210, damage: 38, color: '#93b6d6', hl: '#d7ecff' },
  { id: 'cobalt', name: 'Cobalt Sword', price: 480, damage: 58, color: '#5f8cff', hl: '#a9c4ff' },
  { id: 'crimson', name: 'Crimson Sword', price: 980, damage: 84, color: '#e5546f', hl: '#ff9db1' },
  { id: 'obsidian', name: 'Obsidian Sword', price: 1950, damage: 120, color: '#6b4bb8', hl: '#a98cff' },
  { id: 'mythril', name: 'Mythril Sword', price: 3700, damage: 170, color: '#4ff0d0', hl: '#b8fff2' },
  { id: 'starforged', name: 'Starforged Sword', price: 6800, damage: 245, color: '#ffd447', hl: '#fff8c9' },
];

export const UPGRADES = [
  {
    id: 'potion',
    name: 'Health Potion',
    desc: 'Restores 60 HP right now.',
    basePrice: 45,
    repeatable: true,
    icon: 'potion',
  },
  {
    id: 'maxhp',
    name: 'Reinforced Heart',
    desc: '+25 maximum HP.',
    basePrice: 120,
    repeatable: true,
    icon: 'heart',
  },
  {
    id: 'speed',
    name: 'Swift Boots',
    desc: '+8% movement speed.',
    basePrice: 140,
    repeatable: true,
    icon: 'boots',
  },
  {
    id: 'lamp',
    name: 'Bright Lantern',
    desc: 'Wider light in the mine.',
    basePrice: 160,
    repeatable: true,
    icon: 'lamp',
  },
  {
    id: 'crit',
    name: 'Whetstone',
    desc: '+6% critical hit chance (crits deal double).',
    basePrice: 220,
    repeatable: true,
    icon: 'gem',
  },
];

export const ORE_TYPES = [
  { id: 'coal', name: 'Coal', value: 6, color: '#7c8899', hp: 3, weight: 44, minWave: 1 },
  { id: 'iron', name: 'Iron', value: 11, color: '#b9c3d1', hp: 4, weight: 30, minWave: 1 },
  { id: 'gold', name: 'Gold', value: 20, color: '#ffd447', hp: 5, weight: 18, minWave: 2 },
  { id: 'emerald', name: 'Emerald', value: 34, color: '#48e07a', hp: 6, weight: 12, minWave: 3 },
  { id: 'diamond', name: 'Diamond', value: 60, color: '#7fe6ff', hp: 8, weight: 8, minWave: 4 },
  { id: 'amethyst', name: 'Amethyst', value: 95, color: '#b58cff', hp: 10, weight: 5, minWave: 6 },
  { id: 'starstone', name: 'Starstone', value: 170, color: '#ff7bd5', hp: 13, weight: 3, minWave: 9 },
];

export const MOBS = {
  slime: {
    name: 'Slime',
    art: 'slime',
    hp: 26,
    speed: 46,
    damage: 8,
    gold: 5,
    radius: 11,
    height: 9,
    scale: 2,
    xp: 1,
    behavior: 'hop',
  },
  bat: {
    name: 'Cave Bat',
    art: 'bat',
    hp: 18,
    speed: 104,
    damage: 6,
    gold: 4,
    radius: 10,
    height: 20,
    scale: 2,
    behavior: 'swoop',
  },
  skeleton: {
    name: 'Skeleton',
    art: 'skeleton',
    hp: 52,
    speed: 54,
    damage: 12,
    gold: 9,
    radius: 11,
    height: 0,
    scale: 2,
    behavior: 'chase',
  },
  wraith: {
    name: 'Wraith',
    art: 'wraith',
    hp: 44,
    speed: 62,
    damage: 10,
    gold: 12,
    radius: 11,
    height: -4,
    scale: 2,
    behavior: 'caster',
  },
  golem: {
    name: 'Stone Golem',
    art: 'golem',
    hp: 150,
    speed: 40,
    damage: 20,
    gold: 26,
    radius: 13,
    height: 2,
    scale: 2.4,
    behavior: 'charge',
  },
  boss: {
    name: 'Skeleton King',
    art: 'boss',
    hp: 620,
    speed: 52,
    damage: 24,
    gold: 160,
    radius: 15,
    height: 0,
    scale: 2.6,
    behavior: 'boss',
  },
};

// Which mobs can appear at which wave, and how many.
export function waveComposition(wave) {
  const list = [];
  const total = 3 + Math.floor(wave * 1.6);
  const isBoss = wave % 5 === 0;

  for (let i = 0; i < total; i++) {
    const r = Math.random();
    if (wave >= 7 && r < 0.16) list.push('wraith');
    else if (wave >= 5 && r < 0.3) list.push('skeleton');
    else if (wave >= 3 && r < 0.55) list.push('bat');
    else if (wave >= 8 && r < 0.62) list.push('golem');
    else list.push('slime');
  }
  if (isBoss) {
    list.push('boss');
    if (wave >= 10) list.push('boss');
  }
  return list;
}

export const BIOMES = [
  { name: 'Mossy Caverns', floor: ['#4a4168', '#41395e'], wall: ['#2b2440', '#221c34'], accent: '#6ec07a' },
  { name: 'Frozen Hollow', floor: ['#3d5070', '#364863'], wall: ['#243044', '#1b2534'], accent: '#7fe6ff' },
  { name: 'Ashen Depths', floor: ['#5e3f38', '#533731'], wall: ['#382424', '#2c1c1c'], accent: '#ff9a3c' },
  { name: 'Amethyst Rift', floor: ['#4c3c68', '#43345b'], wall: ['#2d2142', '#241a35'], accent: '#b58cff' },
  { name: 'Gilded Vault', floor: ['#5e5034', '#53462d'], wall: ['#3a3220', '#2e2819'], accent: '#ffd447' },
];

export function biomeForWave(wave) {
  return BIOMES[Math.floor((Math.max(1, wave) - 1) / 5) % BIOMES.length];
}

export const PLAYER_BASE = {
  maxHp: 100,
  speed: 168,
  radius: 10,
  attackDamage: 0, // from sword
  attackCooldown: 0.42,
  attackReach: 44,
  attackArc: Math.PI * 0.78,
  critChance: 0.05,
  lightRadius: 235,
  invulnTime: 0.75,
};
