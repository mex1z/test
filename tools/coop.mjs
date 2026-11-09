// Headless two-to-four player co-op test.
//
// Runs the real co-op relay (server/rooms.js) and the real browser networking
// wrapper (src/net.js) in-process, with fake sockets that deliver messages
// synchronously. Each player is a real Game instance, so the sim host, the
// peers, snapshots, credits and saves all go through the same code the browser
// uses. Stubs the DOM/canvas the same way tools/smoke.mjs does.

import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

class FakeGradient {
  addColorStop() {}
}

function fakeContext() {
  const target = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    font: '10px monospace',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'top',
    shadowBlur: 0,
    shadowColor: '#000',
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'measureText') return (t) => ({ width: String(t).length * 6 });
      if (/Gradient|Pattern/.test(String(prop))) return () => new FakeGradient();
      if (prop === 'getImageData' || prop === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
}

class FakeCanvas {
  constructor(w = 300, h = 150) {
    this.width = w;
    this.height = h;
    this.style = {};
    this._ctx = fakeContext();
  }
  getContext() {
    return this._ctx;
  }
  addEventListener() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width, height: this.height };
  }
}

const storage = new Map();
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : { getContext: () => fakeContext() }),
  getElementById: () => null,
  addEventListener() {},
  hidden: false,
};
globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1440, innerHeight: 900 };
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { buildAllSprites } = await import('../src/sprites.js');
const { Input } = await import('../src/input.js');
const { Game, STATE } = await import('../src/game.js');
const { Net } = await import('../src/net.js');
const { createRooms } = await import('../server/rooms.js');
const { VIEW_W, VIEW_H } = await import('../src/data.js');

buildAllSprites();

// ---------------------------------------------------------------- server wiring
const saveFile = path.join(os.tmpdir(), `deepmine-coop-${process.pid}-${Date.now()}.json`);
const rooms = createRooms({ saveFile, log: (m) => console.log('  [server]', m) });
let onConnection = null;
rooms.attach({
  on(event, fn) {
    if (event === 'connection') onConnection = fn;
  },
});

// A pair of fake sockets: the client's send() reaches the server's message
// handler, and the server's send() reaches the client's onmessage. Everything
// is synchronous, so a message is handled before the next line runs.
function connectClient() {
  const clientWs = {
    readyState: 1,
    onmessage: null,
    onclose: null,
    send: (text) => serverWs._h.message(text),
    close: () => {
      if (serverWs.readyState === 1) {
        serverWs.readyState = 3;
        serverWs._h.close?.();
      }
    },
  };
  const serverWs = {
    readyState: 1,
    _h: {},
    on(event, fn) {
      this._h[event] = fn;
    },
    send: (text) => clientWs.onmessage?.({ data: text }),
  };
  onConnection(serverWs);
  return new Net(clientWs);
}

// ---------------------------------------------------------------- game wiring
function makeGame() {
  const canvas = new FakeCanvas(VIEW_W, VIEW_H);
  const input = new Input(canvas, VIEW_W, VIEW_H);
  return new Game(canvas, input);
}

async function login(game, name) {
  const net = connectClient();
  const reply = await net.request({ t: 'hello', name }, ['profile']);
  game.attachNet(net, reply.save);
  game.enterHub();
  return net;
}

function tick(games, frames, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) {
    for (const g of games) {
      g.update(dt);
      if (i % 10 === 0) g.render();
    }
  }
}

function hold(game, { keys = [], mouse = null } = {}) {
  game.input.keys = new Set(keys);
  if (mouse) game.input.mouse = { x: mouse.x, y: mouse.y, down: !!mouse.down, clicked: false };
  else game.input.mouse = { x: game.player.x, y: game.player.y, down: false, clicked: false };
}

let passed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label}`);
    throw err;
  }
}

const mobsNear = (game, x, y, r = 40) => game.mobs.filter((m) => !m.dead && Math.hypot(m.x - x, m.y - y) < r);

// ---------------------------------------------------------------- scenario
console.log('room and sign-in');

const ann = makeGame();
const bob = makeGame();
const cara = makeGame();
const dan = makeGame();
const eve = makeGame();
const annNet = await login(ann, 'Ann');
const bobNet = await login(bob, 'Bob');
const caraNet = await login(cara, 'Cara');
const danNet = await login(dan, 'Dan');
const eveNet = await login(eve, 'Eve');

{
  const dup = connectClient();
  await assert.rejects(dup.request({ t: 'hello', name: 'ann' }, ['profile']), /already online/);
  dup.close();
  console.log('✓ a second "ann" is refused while Ann is online');
  passed++;
}

await annNet.request({ t: 'create' }, ['room']);
const code = annNet.code;
for (const [game, net] of [
  [bob, bobNet],
  [cara, caraNet],
  [dan, danNet],
]) {
  await net.request({ t: 'join', code }, ['room']);
}
await assert.rejects(() => eveNet.request({ t: 'join', code }, ['room']), /full/);
check('room holds 4 players; a 5th is refused', () => {
  assert.equal(annNet.players.length, 4);
});

await assert.rejects(() => eveNet.request({ t: 'join', code: 'ZZZZ' }, ['room']), /No room/);
check('joining an unknown code is refused', () => {});

// ----- cave open and join
console.log('cave');
ann.startRun();
check('the host opens the cave and runs the simulation', () => {
  assert.equal(ann.simCave, true);
  assert.equal(ann.state, STATE.MINE);
  assert.equal(annNet.caveHost, 'Ann');
});

bob.startRun();
check('a peer joins the open cave and mirrors the host world', () => {
  assert.equal(bob.peerCave, true);
  assert.equal(bob.state, STATE.MINE);
  assert.equal(bob.scene.seed, ann.scene.seed);
  assert.deepEqual(bob.scene.tiles, ann.scene.tiles);
  assert.equal(bob.scene.oreNodes.length, ann.scene.oreNodes.length);
  assert.equal(ann.remotes.size, 1);
});

// cave-busy path: Cara was told someone else opened the cave
cara.onNet({ t: 'cave-busy' });
check('after "cave busy", a player joins the open cave automatically', () => {
  assert.equal(cara.peerCave, true);
  assert.equal(cara.state, STATE.MINE);
});

dan.startRun();
check('four players are in one cave', () => {
  assert.equal(ann.remotes.size, 3);
  assert.equal(dan.peerCave, true);
});

const allGames = [ann, bob, cara, dan];
tick(allGames, 20);

// ----- movement and snapshots
console.log('movement and sync');
const bobStartX = bob.player.x;
hold(bob, { keys: ['d'] });
tick(allGames, 60);
hold(bob, {});
tick(allGames, 6);
const bobOnHost = ann.remotes.get(bob.myId);
check('the host sees a peer walk (input is relayed)', () => {
  assert.ok(bobOnHost, 'host has an entry for Bob');
  assert.ok(bobOnHost.x > bobStartX + 20, `moved ${bobOnHost.x - bobStartX}px`);
  assert.ok(Math.abs(bobOnHost.x - bob.player.x) < 2, `host sees x=${bobOnHost.x}, bob at ${bob.player.x}`);
});

check('a peer sees the host and the other peers in snapshots', () => {
  const hostOnBob = bob.remotes.get(ann.myId);
  assert.ok(hostOnBob, 'Bob has an entry for Ann');
  assert.ok(Math.abs(hostOnBob.x - ann.player.x) < 2);
  assert.ok(bob.remotes.has(cara.myId) && bob.remotes.has(dan.myId));
});

// ----- credit gold to the player who collects it
console.log('credits');
const annGoldBefore = ann.runGold;
const bobGoldBefore = bob.runGold;
const bobSaveGoldBefore = bob.save.gold;
ann.pickups.push({ x: bob.player.x, y: bob.player.y, vx: 0, vy: 0, value: 10, life: 10, delay: 0, bob: 0 });
tick(allGames, 2);
check('gold is credited to the peer who picked it up, not the host', () => {
  assert.equal(bob.runGold - bobGoldBefore, 10);
  assert.equal(bob.save.gold - bobSaveGoldBefore, 10);
  assert.equal(ann.runGold, annGoldBefore);
});

// ----- combat: a mob hurts a peer, a peer kills a mob
console.log('combat');
const bobHpBefore = bob.save.hp;
ann.mobs = [];
ann.spawnMobAt('slime', bob.player.x + 14, bob.player.y);
tick(allGames, 30);
check('a mob attacking a peer damages that peer (host decides, peer reflects)', () => {
  assert.ok(bob.save.hp < bobHpBefore, `hp ${bobHpBefore} -> ${bob.save.hp}`);
  console.log(`   bob hp ${bobHpBefore} -> ${bob.save.hp} (host sees ${ann.remotes.get(bob.myId)?.hp})`);
  assert.ok(bob.player.invuln >= 0);
});

// Bob swings at a slime in front of him
ann.mobs = [];
const target = ann.spawnMobAt('slime', bob.player.x + 30, bob.player.y);
const killsBefore = bob.runKills;
hold(bob, { mouse: { x: bob.player.x + 30, y: bob.player.y, down: true } });
tick(allGames, 150);
hold(bob, {});
check('a peer swinging the sword kills a mob and gets the kill credit', () => {
  assert.ok(target.dead, `slime still alive at ${target.hp} hp`);
  assert.equal(bob.runKills - killsBefore, 1);
  assert.equal(ann.runKills, 0);
});

// ----- mining: Bob mines an ore node on the host's cave
console.log('mining');
ann.mobs = [];
const ore = ann.scene.oreNodes.find((n) => !n.dead);
bob.player.x = ore.x + 26;
bob.player.y = ore.y;
const oreHpBefore = ore.hp;
hold(bob, { mouse: { x: ore.x, y: ore.y, down: true } });
tick(allGames, 80);
hold(bob, {});
tick(allGames, 6);
const bobOre = bob.scene.oreNodes.find((n) => n.uid === ore.uid);
check('a peer mining an ore node damages it on the host and the peer sees it', () => {
  assert.ok(ore.hp < oreHpBefore || ore.dead, 'host ore took damage');
  assert.equal(bobOre.dead, ore.dead);
  assert.ok(Math.abs(bobOre.hp - ore.hp) < 0.6, `ore hp host ${ore.hp} vs peer ${bobOre.hp}`);
});

// ----- wave clear and the next wave
console.log('waves');
ann.mobs = [];
ann.spawnQueue = [];
const waveBefore = ann.wave;
const bobGoldBeforeWave = bob.runGold;
tick(allGames, 2);
// the next update sees fight+empty and clears the wave
ann.waveState = 'fight';
tick(allGames, 2);
check('clearing a wave pays every player in the cave', () => {
  assert.equal(ann.waveState, 'clear');
  assert.ok(bob.runGold - bobGoldBeforeWave >= 24, `bob gained ${bob.runGold - bobGoldBeforeWave}`);
});
tick(allGames, 240);
check('the next wave starts for everyone and ore is refreshed', () => {
  assert.equal(ann.wave, waveBefore + 1);
  assert.equal(bob.wave, ann.wave);
  assert.deepEqual(
    bob.scene.oreNodes.map((n) => n.uid),
    ann.scene.oreNodes.map((n) => n.uid),
  );
});

// ----- a peer dies
console.log('death');
const dyingRemote = ann.remotes.get(bob.myId);
dyingRemote.hp = 1;
dyingRemote.invuln = 0;
ann.mobs = [];
ann.pickups = []; // nothing left on the floor to change Bob's gold mid-test
const runBeforeDeath = bob.runGold;
const saveGoldBeforeDeath = bob.save.gold;
ann.spawnMobAt('slime', bob.player.x + 14, bob.player.y);
tick(allGames, 40);
check('a downed peer goes to the summary; the cave goes on for the others', () => {
  assert.equal(bob.state, STATE.SUMMARY);
  assert.equal(bob.summary.reason, 'dead');
  assert.equal(ann.state, STATE.MINE);
  assert.equal(ann.simCave, true);
  assert.equal(cara.peerCave, true);
  assert.ok(!ann.remotes.has(bob.myId), 'host dropped Bob');
});

check('the death penalty (half of the run gold) is applied to the peer', () => {
  assert.equal(bob.summary.lost, Math.round(runBeforeDeath * 0.5));
  assert.equal(bob.save.gold, saveGoldBeforeDeath - bob.summary.lost);
});

// ----- save sync: the server holds the profile
console.log('saves');
ann.flushSave?.();
tick(allGames, 40);
const profiles = rooms._profiles();
check('progress is saved on the server under the player name', () => {
  assert.equal(profiles.ann.gold, ann.save.gold);
  assert.equal(profiles.bob.gold, bob.save.gold);
  assert.ok(profiles.ann.bestWave >= 1);
});

// ----- peer rejoins from the hub
console.log('rejoin and host retreat');
bob.enterHub();
bob.startRun();
check('a downed peer can rejoin the cave from the hub', () => {
  assert.equal(bob.peerCave, true);
  assert.equal(ann.remotes.has(bob.myId), true);
});

// the host runs the cave to the portal and everyone is sent back
ann.leaveMine('retreat');
tick(allGames, 6);
check('when the host leaves, the cave ends for everyone', () => {
  assert.equal(ann.simCave, false);
  assert.equal(bob.peerCave, false);
  assert.equal(bob.state, STATE.SUMMARY);
  assert.equal(bob.summary.reason, 'retreat');
  assert.equal(cara.state, STATE.SUMMARY);
  assert.equal(rooms._rooms.get(code).simHost, null);
});

// ----- leaving a room
console.log('leaving');
caraNet.close();
danNet.close();
tick(allGames, 2);
check('players who disconnect leave the room', () => {
  assert.equal(annNet.players.length, 2);
  assert.ok(!annNet.players.some((p) => p.name === 'Cara'));
});

bob.enterHub();
bob.leaveRoom();
check('leaving a room returns to a normal hub with no cave', () => {
  assert.equal(bob.net.code, null);
});

fs.rmSync(saveFile, { force: true });
fs.rmSync(`${saveFile}.tmp`, { force: true });
console.log(`\n${passed} co-op checks passed`);
process.exit(0);
