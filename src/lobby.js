// Co-op lobby: a DOM panel over the game. Sign in with a name, then create or
// join a room with a 4-letter code. Everything else (the cave itself) runs in
// game.js; this file only drives the panel.
import { Net } from './net.js';
import { STATE } from './game.js';

const NAME_RE = /^[A-Za-z0-9 _-]{1,12}$/;
const NAME_KEY = 'deepmine.name';
const GOOD = '#7fe6a4';
const BAD = '#ff9db1';

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'cls') node.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else node[k] = v;
  }
  for (const kid of kids) if (kid) node.append(kid);
  return node;
}

export function setupLobby(game) {
  const button = document.getElementById('friends-btn');
  const panel = document.getElementById('lobby');
  const body = document.getElementById('lobby-body');
  const close = document.getElementById('lobby-close');
  let note = { text: '', color: '#a49fc6' };
  let busy = false;

  const say = (text, color = '#a49fc6') => {
    note = { text, color };
    render();
  };

  function show(open) {
    panel.hidden = !open;
    // the cave keeps running behind the panel, so pause it while the panel is open
    if (open && game.state === STATE.MINE) game.paused = true;
    if (open) render();
  }

  function connectView() {
    const nameIn = el('input', {
      id: 'lobby-name',
      placeholder: 'your name',
      maxLength: 12,
      value: localStorage.getItem(NAME_KEY) || '',
      on: { keydown: (e) => e.key === 'Enter' && connect() },
    });
    return el(
      'div',
      {},
      el('p', { text: 'Pick a name your friends will know you by. Names are not passwords, so only use a name your friends trust you with.' }),
      el('label', { text: 'Name (1-12 letters, numbers, spaces, - or _)' }),
      nameIn,
      el('button', { text: busy ? 'Connecting...' : 'Connect', disabled: busy, on: { click: connect } }),
      el('p', { text: 'Co-op progress is saved on the server under your name. It is separate from the solo save in this browser.' }),
    );
  }

  function lobbyView(net) {
    const codeIn = el('input', {
      placeholder: 'ROOM CODE',
      maxLength: 4,
      on: { keydown: (e) => e.key === 'Enter' && join(codeIn.value) },
    });
    return el(
      'div',
      {},
      el('p', { text: `Signed in as ${net.name}. Create a room for your friends, or join one with its code.` }),
      el('button', { text: 'Create room', disabled: busy, on: { click: () => roomCall({ t: 'create' }) } }),
      el('div', { cls: 'lobby-row' }, codeIn, el('button', { text: 'Join', disabled: busy, on: { click: () => join(codeIn.value) } })),
      el('button', { text: 'Disconnect', on: { click: disconnect } }),
    );
  }

  function roomView(net) {
    const rows = (net.players || []).map((p) =>
      el('li', { text: `${p.name}${p.host ? ' - running the cave' : ''}${p.id === net.id ? ' (you)' : ''}` }),
    );
    const status = net.caveHost
      ? `${net.caveHost} has the cave open. Press E at the portal to join.`
      : 'No cave is open. Press E at the portal to open one.';
    return el(
      'div',
      {},
      el('p', { text: 'Room code - share it with your friends, along with this game\'s link:' }),
      el('div', { cls: 'lobby-code', text: net.code }),
      el('p', { text: `Up to 4 players. Players in room (${net.players.length}/4):` }),
      el('ul', {}, ...rows),
      el('p', { text: status }),
      el('button', { text: 'Leave room', on: { click: leaveRoom } }),
      el('button', { text: 'Disconnect', on: { click: disconnect } }),
    );
  }

  function render() {
    body.replaceChildren();
    const net = game.net;
    if (!net) body.append(connectView());
    else if (!net.code) body.append(lobbyView(net));
    else body.append(roomView(net));
    const msg = el('div', { cls: 'lobby-msg', text: note.text });
    msg.style.color = note.color;
    body.append(msg);
  }

  async function connect() {
    if (busy) return;
    const name = (document.getElementById('lobby-name')?.value || '').trim();
    if (!NAME_RE.test(name)) return say('Names are 1-12 letters, numbers, spaces, - or _.', BAD);
    if (game.state === STATE.MINE) return say('Finish your cave run first, then connect.', BAD);
    busy = true;
    say('Connecting...');
    let net = null;
    try {
      net = await Net.connect();
      const reply = await net.request({ t: 'hello', name }, ['profile']);
      localStorage.setItem(NAME_KEY, name);
      game.attachNet(net, reply.save);
      say(`Signed in as ${net.name}. Create a room or join one.`, GOOD);
    } catch (err) {
      if (net && !game.net) net.close();
      say(err.message || 'Could not connect.', BAD);
    } finally {
      busy = false;
      render();
    }
  }

  async function roomCall(req) {
    if (busy || !game.net) return;
    busy = true;
    try {
      await game.net.request(req, ['room']);
      say(`In room ${game.net.code}.`, GOOD);
    } catch (err) {
      say(err.message, BAD);
    } finally {
      busy = false;
      render();
    }
  }

  function join(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (code.length !== 4) return say('Room codes are 4 characters.', BAD);
    return roomCall({ t: 'join', code });
  }

  function leaveRoom() {
    game.leaveRoom();
    say('Left the room.');
  }

  function disconnect() {
    game.detachNet();
    say('Disconnected. Solo play uses this browser\'s own save again.');
  }

  game.onRoomChange = () => {
    if (!panel.hidden) render();
  };

  button.addEventListener('click', () => show(panel.hidden));
  close.addEventListener('click', () => show(false));
  panel.addEventListener('click', (e) => {
    if (e.target === panel) show(false);
  });
}
