// Sanity check: every sprite is rectangular and uses only known palette keys.
import { ART, PALETTE } from '../src/art.js';
import { PICKAXES, SWORDS, ORE_TYPES, MOBS } from '../src/data.js';

let bad = 0;

function checkMatrix(label, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(`✗ ${label}: empty`);
    bad++;
    return;
  }
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) {
      console.error(`✗ ${label}: row ${i} is ${r.length} wide, expected ${w}`);
      bad++;
    }
    for (const ch of r) {
      if (ch !== '.' && ch !== ' ' && !PALETTE[ch]) {
        console.error(`✗ ${label}: row ${i} has unknown palette key "${ch}"`);
        bad++;
      }
    }
  });
}

for (const [name, art] of Object.entries(ART)) {
  if (Array.isArray(art)) checkMatrix(name, art);
  else for (const [dir, rows] of Object.entries(art)) checkMatrix(`${name}.${dir}`, rows);
}

// Mob art references must resolve.
for (const [id, def] of Object.entries(MOBS)) {
  if (!ART[def.art]) {
    console.error(`✗ mob "${id}" references missing art "${def.art}"`);
    bad++;
  }
}

// Progression sanity.
const pickPow = PICKAXES.map((p) => p.power);
const swordDmg = SWORDS.map((s) => s.damage);
for (let i = 1; i < pickPow.length; i++) {
  if (pickPow[i] <= pickPow[i - 1]) {
    console.error(`✗ pickaxe power not increasing at index ${i}`);
    bad++;
  }
}
for (let i = 1; i < swordDmg.length; i++) {
  if (swordDmg[i] <= swordDmg[i - 1]) {
    console.error(`✗ sword damage not increasing at index ${i}`);
    bad++;
  }
}
for (let i = 1; i < ORE_TYPES.length; i++) {
  if (ORE_TYPES[i].value <= ORE_TYPES[i - 1].value) {
    console.error(`✗ ore value not increasing at index ${i}`);
    bad++;
  }
}

if (bad === 0) {
  const count = Object.keys(ART).length;
  console.log(`✓ all ${count} sprites valid, ${PICKAXES.length} pickaxes, ${SWORDS.length} swords, ${ORE_TYPES.length} ores, ${Object.keys(MOBS).length} mobs`);
} else {
  console.error(`\n${bad} problem(s) found`);
  process.exit(1);
}
