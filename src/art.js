// Pure pixel-art data. Every sprite is an array of equal-length strings.
// One character = one art pixel. '.' is transparent.

export const PALETTE = {
  k: '#141221', // outline
  w: '#f5f7ff', // white
  W: '#c8d2e8', // off white
  g: '#9aa3b2', // grey
  d: '#5a6472', // dark grey
  G: '#ffd447', // gold
  y: '#fff3a8', // gold highlight
  o: '#ff9a3c', // orange
  O: '#c8641f', // deep orange
  b: '#8a5a2b', // brown
  B: '#5a3618', // dark brown
  r: '#e5484d', // red
  R: '#8f2226', // dark red
  p: '#3b4c7a', // pants blue
  P: '#5b31b0', // dark purple
  v: '#b58cff', // violet
  c: '#4ecbd8', // cyan shirt
  C: '#1f7f95', // teal dark
  s: '#cdd6e4', // steel
  S: '#6b7789', // steel dark
  l: '#9ef01a', // lime
  e: '#3f9e4d', // green
  E: '#256b31', // dark green
  m: '#ff5fa2', // pink
  n: '#f2c39a', // skin
  N: '#c98f63', // skin shadow
  h: '#3b2a1e', // hair
  t: '#c9905a', // rock tan
  T: '#8a5c33', // rock dark
  u: '#4a5468', // stone
  U: '#2c3444', // stone dark
  x: '#6fe3c4', // crystal
  X: '#2fb59b', // crystal dark
  z: '#ff7bd5', // magenta glow
  q: '#7fe6ff', // ice blue
};

// ---------------------------------------------------------------- player 12x16
const PLAYER_FRONT = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhhhhhhhk.',
  '.khhnnnnhhk.',
  '.khnknnknhk.',
  '.khnnnnnnhk.',
  '..knnnnnnk..',
  '...kcccck...',
  '..kcccccck..',
  '.knccccccnk.',
  '.knccccccnk.',
  '..kcccccck..',
  '..kppppppk..',
  '..kppkkppk..',
  '..kbbkkbbk..',
  '...kk..kk...',
];

const PLAYER_BACK = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '..khhhhhhk..',
  '...kcccck...',
  '..kcccccck..',
  '.knccccccnk.',
  '.knccccccnk.',
  '..kcccccck..',
  '..kppppppk..',
  '..kppkkppk..',
  '..kbbkkbbk..',
  '...kk..kk...',
];

const PLAYER_SIDE = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhhhhhhhk.',
  '.khhnnnnnnk.',
  '.khhnnknnnk.',
  '.khhnnnnnnk.',
  '..knnnnnnk..',
  '...kcccck...',
  '..kcccccck..',
  '..kcccccnk..',
  '..kcccccck..',
  '..kcccccck..',
  '..kppppppk..',
  '..kppppppk..',
  '..kbbbpppk..',
  '...kkk.kk...',
];

// --------------------------------------------------------------- shopkeeper
const KEEPER_FRONT = [
  '...kkkkkk...',
  '..kBBBBBBk..',
  '.kBBBBBBBBk.',
  '.kBBBBBBBBk.',
  '..kkkkkkkk..',
  '.khnnnnnnhk.',
  '.khnknnknhk.',
  '.khnnnnnnhk.',
  '..knnnnnnk..',
  '..kBBkkBBk..',
  '.ktBBBBBBtk.',
  '.ktBBBBBBtk.',
  '..kBBBBBBk..',
  '..kBBkkBBk..',
  '..kbbkkbbk..',
  '...kk..kk...',
];

// ------------------------------------------------------------------ enemies
const SLIME = [
  '............',
  '............',
  '....kkkk....',
  '..kkllllkk..',
  '.kllllllllk.',
  '.klwllllwlk.',
  '.klkllllklk.',
  '.kllllllllk.',
  '.kllllllllk.',
  '..kllllllk..',
  '...kkkkkk...',
  '............',
];

const BAT = [
  '............',
  '...kk..kk...',
  '..kPkkkkPk..',
  '.kPPPPPPPPk.',
  'kPPPPrrPPPPk',
  'kPPPPPkkPPPk',
  'kPPPPPPPPPPk',
  '.kPPPPPPPPk.',
  '..kPPPPPPk..',
  '...kPPPPk...',
  '....kkkk....',
  '............',
];

const SKELETON = [
  '...kkkkkk...',
  '..kWWWWWWk..',
  '.kWWWWWWWWk.',
  '.kWkkWWkkWk.',
  '.kWkkWWkkWk.',
  '.kWWWWWWWWk.',
  '..kWkWkWkWk.',
  '...kWWWWk...',
  '..kWWWWWWk..',
  '.kWkWWWWkWk.',
  '.kWkWWWWkWk.',
  '..kWWWWWWk..',
  '..kWWkkWWk..',
  '..kWWkkWWk..',
  '..kWWkkWWk..',
  '...kk..kk...',
];

const WRAITH = [
  '....kkkk....',
  '..kkvvvvkk..',
  '.kvvvvvvvvk.',
  '.kvvkvvkvvk.',
  'kvvvvvvvvvvk',
  '.kvvvvvvvvk.',
  '.kvvvvvvvvk.',
  '..kvvvvvvk..',
  '..kvkvvkvk..',
  '...k.k..k...',
  '............',
  '............',
];

const GOLEM = [
  '..kkkkkkkkkk..',
  '.kttttttttttk.',
  'kttttttttttttk',
  'ktttkkttkktttk',
  'ktttqqttqqtttk',
  'kttttttttttttk',
  'kttBttttttBttk',
  'ktttttBttttttk',
  'kttttttttttttk',
  '.kttttttttttk.',
  'kttttttttttttk',
  'kttBttttttBttk',
  'kttttttttttttk',
  '.kttttttttttk.',
  '..ktttkktttk..',
  '...kkk..kkk...',
];

// 16 wide x 20 tall
const SKELETON_KING = [
  '....G.GG.GG.....',
  '...GGkGkkGGk....',
  '...GGGGGGGGk....',
  '...kkkkkkkkk....',
  '..kWWWWWWWWk....',
  '.kWWWWWWWWWWk...',
  '.kWkkWWWWkkWk...',
  '.kWrrWWWWrrWk...',
  '.kWWWWWWWWWWk...',
  '..kWkWkWkWkWk...',
  '...kWWWWWWk.....',
  '..kWWWWWWWWk....',
  '.kWkWWWWWWkWk...',
  '.kWkWWWWWWkWk...',
  '..kWWWWWWWWk....',
  '..kWWWWWWWWk....',
  '..kWWWkkWWWk....',
  '..kWWWkkWWWk....',
  '..kWWWkkWWWk....',
  '...kkk..kkk.....',
];

// ------------------------------------------------------------------- tools 16x16
export const PICKAXE_ART = [
  '................',
  '..kkkkkkkkkkkk..',
  '.kGGGGGGGGGGGGk.',
  'kGwwGGGGGGGGwwGk',
  'kGGkkkkkkkkkkGGk',
  '.kk....kbbk..kk.',
  '.......kbbk.....',
  '.......kbbk.....',
  '.......kbbk.....',
  '.......kbbk.....',
  '.......kbbk.....',
  '.......kbbk.....',
  '.......kbbk.....',
  '.......kbbk.....',
  '.......kkkk.....',
  '................',
];

export const SWORD_ART = [
  '.......kk.......',
  '......kwwk......',
  '......kwsk......',
  '......kwsk......',
  '......kwsk......',
  '......kwsk......',
  '......kwsk......',
  '......kwsk......',
  '......kwsk......',
  '......kwsk......',
  '....kkkwwkkk....',
  '......kyyk......',
  '.....kGGGGk.....',
  '.....kGGGGk.....',
  '......kbbk......',
  '......kkkk......',
];

// --------------------------------------------------------------- shop pieces
export const HEART_ART = [
  '............',
  '.kkkk..kkkk.',
  'krrrrkkrrrrk',
  'krrRrrrrRrrk',
  'krrrrrrrrrrk',
  'krrrrrrrrrrk',
  '.krrrrrrrrk.',
  '..krrrrrrk..',
  '...krrrrk...',
  '....krrk....',
  '.....kk.....',
  '............',
];

export const COIN_ART = [
  '...kkkk...',
  '..kyyyyk..',
  '.kyGGGGyk.',
  'kyGGkkGGyk',
  'kyGGkkGGyk',
  'kyGGkkGGyk',
  'kyGGkkGGyk',
  '.kyGGGGyk.',
  '..kyyyyk..',
  '...kkkk...',
];

export const GEM_ART = [
  '....kkkk....',
  '..kkoooook..',
  '.koyyyyyook.',
  'koyyyyyyyook',
  'koyyyyyyyook',
  '.koyyyyyook.',
  '..kooooook..',
  '...kkkkkk...',
];

export const POTION_ART = [
  '....kkkk....',
  '....kbbk....',
  '...kkkkkk...',
  '..kmmmmmmk..',
  '..kmwmmmwk..',
  '..kmmmmmmk..',
  '..kmmmmmmk..',
  '...kmmmmk...',
  '....kkkk....',
];

export const SKULL_ART = [
  '..kkkkkk..',
  '.kWWWWWWk.',
  'kWWWWWWWWk',
  'kWWkkkkWWk',
  'kWWkkkkWWk',
  'kWWWWWWWWk',
  '.kWkWWkWk.',
  '..kWkkWk..',
  '..kkkkkk..',
];

export const ART = {
  player: { front: PLAYER_FRONT, back: PLAYER_BACK, side: PLAYER_SIDE },
  keeper: { front: KEEPER_FRONT, back: KEEPER_FRONT, side: KEEPER_FRONT },
  slime: SLIME,
  bat: BAT,
  skeleton: SKELETON,
  wraith: WRAITH,
  golem: GOLEM,
  boss: SKELETON_KING,
  pickaxe: PICKAXE_ART,
  sword: SWORD_ART,
  heart: HEART_ART,
  coin: COIN_ART,
  gem: GEM_ART,
  potion: POTION_ART,
  skull: SKULL_ART,
};

export const ART_SIZES = Object.fromEntries(
  Object.entries(ART).map(([name, art]) => {
    const rows = Array.isArray(art) ? art : art.front;
    return [name, { w: rows[0].length, h: rows.length }];
  })
);
