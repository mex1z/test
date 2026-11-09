// Co-op relay + profile store. Runs in Node next to the static server.
//
// Model: a room holds up to MAX_PLAYERS people. One of them may "open the cave"
// and becomes the simulation host: their browser runs the shared cave and the
// server only relays messages between them and the room. Everyone else sends
// their input to the sim host and renders the snapshots it sends back.
//
// Profiles (gold, gear, stats) are stored by player name in a JSON file. There
// is no password, so this is for friends who trust each other.
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeSave, defaultSave } from '../src/save.js';

export const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const NAME_RE = /^[A-Za-z0-9 _-]{1,12}$/;

export function createRooms({ saveFile, log = () => {} }) {
  let profiles = {};
  try {
    profiles = JSON.parse(fs.readFileSync(saveFile, 'utf8')) || {};
  } catch {
    profiles = {};
  }

  let writeTimer = null;
  function persist() {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(saveFile), { recursive: true });
        const tmp = `${saveFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2));
        fs.renameSync(tmp, saveFile);
      } catch (err) {
        log(`could not write profiles: ${err.message}`);
      }
    }, 300);
  }

  const rooms = new Map(); // code -> { code, members: Set<id>, simHost: id|null }
  const clients = new Map(); // id -> { id, ws, name, room }
  let nextId = 1;

  const keyOf = (name) => name.toLowerCase();
  const nameOf = (id) => clients.get(id)?.name || '?';

  function send(client, msg) {
    if (client && client.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
  }

  function roster(room) {
    return [...room.members].map((id) => ({ id, name: nameOf(id), host: id === room.simHost }));
  }

  function broadcastRoom(room, msg, exceptId = null) {
    for (const id of room.members) {
      if (id !== exceptId) send(clients.get(id), msg);
    }
  }

  function broadcastRoster(room) {
    broadcastRoom(room, { t: 'roster', code: room.code, players: roster(room), caveHost: room.simHost ? nameOf(room.simHost) : null });
  }

  function leaveRoom(client) {
    const room = client.room;
    if (!room) return;
    client.room = null;
    room.members.delete(client.id);
    if (room.simHost === client.id) {
      room.simHost = null;
      broadcastRoom(room, { t: 'cave-closed', reason: 'host-left' });
    } else if (room.simHost) {
      send(clients.get(room.simHost), { t: 'sim-msg', from: client.id, msg: { t: 'leave' } });
    }
    if (room.members.size === 0) {
      rooms.delete(room.code);
    } else {
      broadcastRoster(room);
    }
  }

  function newCode() {
    for (let tries = 0; tries < 500; tries++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(code)) return code;
    }
    throw new Error('no free room codes');
  }

  function handle(client, msg) {
    const room = client.room;
    switch (msg.t) {
      case 'hello': {
        const name = typeof msg.name === 'string' ? msg.name.trim() : '';
        if (!NAME_RE.test(name)) return send(client, { t: 'error', text: 'Name: 1-12 letters, numbers, spaces, - or _' });
        // profiles are keyed by name, so two people online with one name would overwrite each other
        for (const other of clients.values()) {
          if (other !== client && other.name && keyOf(other.name) === keyOf(name)) {
            return send(client, { t: 'error', text: `${name} is already online - pick another name` });
          }
        }
        client.name = name;
        return send(client, { t: 'profile', id: client.id, name, save: profileFor(name) });
      }
      case 'create': {
        if (!client.name) return send(client, { t: 'error', text: 'Set a name first' });
        leaveRoom(client);
        const code = newCode();
        const newRoom = { code, members: new Set([client.id]), simHost: null };
        rooms.set(code, newRoom);
        client.room = newRoom;
        send(client, { t: 'room', code, id: client.id, players: roster(newRoom), caveHost: null });
        return;
      }
      case 'join': {
        if (!client.name) return send(client, { t: 'error', text: 'Set a name first' });
        const target = rooms.get(String(msg.code || '').trim().toUpperCase());
        if (!target) return send(client, { t: 'error', text: 'No room with that code' });
        if (target.members.size >= MAX_PLAYERS) return send(client, { t: 'error', text: 'That room is full (4 players)' });
        leaveRoom(client);
        target.members.add(client.id);
        client.room = target;
        send(client, { t: 'room', code: target.code, id: client.id, players: roster(target), caveHost: target.simHost ? nameOf(target.simHost) : null });
        broadcastRoster(target);
        return;
      }
      case 'save': {
        if (!client.name || !msg.save) return;
        profiles[keyOf(client.name)] = sanitizeSave(msg.save);
        persist();
        return;
      }
      case 'cave-open': {
        if (!room) return send(client, { t: 'error', text: 'Join a room first' });
        if (room.simHost && room.simHost !== client.id) return send(client, { t: 'cave-busy' });
        room.simHost = client.id;
        send(client, { t: 'cave-ok' });
        broadcastRoom(room, { t: 'cave-open', host: client.name }, client.id);
        broadcastRoster(room);
        return;
      }
      case 'cave-close': {
        if (room && room.simHost === client.id) {
          room.simHost = null;
          broadcastRoom(room, { t: 'cave-closed', reason: 'closed' });
          broadcastRoster(room);
        }
        return;
      }
      case 'to-sim': {
        // anyone in the room -> the sim host
        if (!room || !room.simHost || room.simHost === client.id) {
          // a peer leaving a cave that already closed is not an error
          if (msg.msg?.t === 'leave') return;
          return send(client, { t: 'error', text: 'No cave is open right now' });
        }
        send(clients.get(room.simHost), { t: 'sim-msg', from: client.id, msg: msg.msg });
        return;
      }
      case 'to-peer': {
        // sim host -> one player
        if (!room || room.simHost !== client.id || !room.members.has(msg.to)) return;
        send(clients.get(msg.to), { t: 'sim-msg', from: client.id, msg: msg.msg });
        return;
      }
      case 'to-all': {
        // sim host -> everyone else in the room
        if (!room || room.simHost !== client.id) return;
        broadcastRoom(room, { t: 'sim-msg', from: client.id, msg: msg.msg }, client.id);
        return;
      }
      case 'leave-room': {
        leaveRoom(client);
        return;
      }
      default:
        return;
    }
  }

  function profileFor(name) {
    return sanitizeSave(profiles[keyOf(name)] || defaultSave());
  }

  function attach(wss) {
    wss.on('connection', (ws) => {
      const client = { id: nextId++, ws, name: null, room: null };
      clients.set(client.id, client);
      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object') return;
        try {
          handle(client, msg);
        } catch (err) {
          log(`message ${msg.t} failed: ${err.message}`);
        }
      });
      ws.on('close', () => {
        leaveRoom(client);
        clients.delete(client.id);
      });
    });
  }

  return { attach, _rooms: rooms, _profiles: () => profiles };
}
