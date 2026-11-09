# Deepmine

A 2D pixel-art, top-down mine-and-fight wave game. Spawn in a cozy **hub**, gear up at the
**Prospector's shop**, then step through the portal into a procedural cave where you **mine ore**
for gold before each wave of mobs attacks.

![Deepmine gameplay](shots/08-fight.png)

## Run it

```bash
node server.js       # or: npm start
# open http://localhost:3000
```

No build step. Plain ES modules served by a tiny static server, plus one runtime dependency,
`ws`, for the co-op relay. Everything (sprites, font, sound) is generated in code.

## Play with friends (co-op)

Up to **4 players** can share one cave.

The player who opens the cave runs the simulation in their browser (mobs, waves, ore, pickups,
combat). Everyone else moves and fights from their own browser, sends their input to the host, and
shows what the host sends back. The server only relays messages and stores saves.

1. The host runs `npm start` on their computer (port 3000 by default).
2. Make it reachable by friends with a tunnel, for example `cloudflared tunnel --url http://localhost:3000`
   or `ngrok http 3000`, and share the link it prints. Tunnels are not included.
3. Everyone clicks **FRIENDS (CO-OP)**, enters a name, and connects.
4. One player clicks **Create room** and shares the 4-letter code. The others type it into **Join**.
5. In the hub, press `E` at the portal. The first player to do so opens the cave. Anyone else who
   presses `E` joins it.

Rules:
- A player who dies goes back to the hub with the usual half-run-gold penalty. The cave goes on for the others.
- If the host dies or leaves through the portal, the cave closes for everyone. The others keep what they earned.
- Only the host can start a wave early with `F`. Pausing is local, so the cave keeps running for others.
- Friends are only visible where your lantern reaches. Outside that light the cave is dark.

Saves and names:
- Co-op progress is saved on the server under your name, in `data/profiles.json`. Set `SAVE_FILE` to put it elsewhere.
  Solo progress stays in this browser, as before.
- Names are not passwords. Anyone who types your name gets your co-op save, so only play with friends you trust.
  Two people cannot be online with the same name at once.

Limits:
- The game is only online while the host's computer is running the server and the tunnel. If the host's
  computer sleeps or disconnects, the cave closes.

## How it plays

**The Hub**
- Walk with `WASD` / arrow keys (or hold the mouse button to walk toward the cursor).
- Click the shopkeeper or the counter (or press `B`) to open the shop.
- Step onto the glowing portal and press `E`, or hit **ENTER THE MINE**.

**The Shop — "The Prospector"**
- **Pickaxes** (9 tiers): higher power breaks ore faster, higher gold multiplier increases payout.
- **Swords** (8 tiers): damage per swing, straight DPS upgrades.
- **Supplies**: health potions, +max HP, movement speed, lantern radius and crit chance.

**The Mine**
- Every wave starts with a **mining phase** (~22s): hold the mouse (or `SPACE`) on a glowing ore
  cluster to chip it. Ore that breaks drops coins that magnet toward you.
- Press `F` (or **FIGHT NOW**) when prepared — or let the timer run out and the wave starts anyway.
- Mobs spawn out of the dark and path to you. Clear them all to finish the wave.
- Wave clear = gold bonus + a heal, then the next wave begins in the same cave with fresh ore.
- Every 5th wave is a **boss wave** (Skeleton King: ground slams, charges, summons).
- The biome re-skins the cave every 5 waves: Mossy Caverns → Frozen Hollow → Ashen Depths →
  Amethyst Rift → Gilded Vault.

**Risk and reward**
- The portal in the spawn room (`E`) ends the run and banks everything you earned.
- **Dying costs half the gold from that run** — owned gear and wallet gold are safe. Keep digging,
  or get out while you're ahead.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | Move |
| Hold left click | Swing all around you / mine nearby ore (360°) |
| `SPACE` / `J` | Attack or mine (keyboard alternative) |
| `E` | Use portal (enter or leave the mine) |
| `F` | Start the wave immediately |
| `B` | Open the shop |
| `ESC` | Pause (in the mine) / leave the shop |
| `M` | Mute/unmute |

## Content

- 6 enemy types: slime (hops), cave bat (swoops), skeleton (chases), wraith (ranged bolts),
  stone golem (telegraphed charge), skeleton king (boss).
- 7 ore types gated by wave: coal, iron, gold, emerald, diamond, amethyst, starstone.
- 9 pickaxes, 8 swords, 5 stacking upgrades.
- Procedural caves: jittered room grid, blobby caverns, winding corridors and guaranteed
  connectivity. Ore and mob spawns are restricted to the region reachable from your spawn.
- Mobs use a BFS flow field to path around walls, plus an anti-stall failsafe so a wave can
  always be finished.
- Save data (gold, gear, upgrades, best wave, stats) persists in `localStorage`.

## Project layout

```
index.html          page shell + canvas
server.js           zero-dependency static server (binds 0.0.0.0)
src/main.js         boot, resize/scaling, game loop
src/game.js         state machine, combat, waves, shop and all UI screens
src/world.js        hub + procedural cave generation, collision, flow-field pathing
src/render.js       tile/prop/ore rendering, lighting, vignette
src/sprites.js      character-matrix art -> canvases, sprite drawing helpers
src/art.js          every sprite as a string matrix + palette
src/font.js         5x7 bitmap font and text helpers
src/ui.js           immediate-mode pixel buttons/panels
src/audio.js        procedural WebAudio sound effects
src/save.js         localStorage save/load with validation
src/net.js          browser side of the co-op connection (WebSocket)
src/lobby.js        co-op panel: sign in, create/join a room
server/rooms.js     co-op relay: rooms, cave hosting, profile store
```

## Dev tools

```bash
npm test          # art validation + headless playthrough + two-to-four player co-op test
npm run shots     # render PNG screenshots of every screen (needs @napi-rs/canvas)
```

`npm test` drives the real game headlessly through title → hub → shop purchases → mine → mining →
waves → boss wave → pause → death → summary → hub and fails on runtime errors, NaN geometry,
escaped players or stuck waves. `tools/coop.mjs` runs the real co-op relay with several game
instances: room codes, the 4-player cap, cave joins, movement and combat sync, credit, mining,
waves, deaths, saves and leaving. The `shots/` folder was produced by `npm run shots`.
