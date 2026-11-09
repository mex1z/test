// Browser side of the co-op relay (see server/rooms.js for the protocol).
// Keeps one WebSocket, answers request/response pairs for the lobby, and hands
// everything else to whoever set `handler` (the game).
export class Net {
  constructor(ws) {
    this.ws = ws;
    this.id = null;
    this.name = null;
    this.code = null;
    this.players = [];
    this.caveHost = null; // name of whoever is running the open cave, if any
    this.handler = null;
    this.waiters = [];
    this.closed = false;
    ws.onmessage = (ev) => this._onMessage(ev);
    ws.onclose = () => {
      this.closed = true;
      if (this.handler) this.handler({ t: 'disconnected' });
    };
  }

  static connect() {
    return new Promise((resolve, reject) => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${location.host}/ws`);
      ws.onopen = () => resolve(new Net(ws));
      ws.onerror = () => reject(new Error('Could not reach the co-op server'));
    });
  }

  send(msg) {
    if (!this.closed && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  /** Sends `msg` and resolves with the first reply whose type is in `types`. */
  request(msg, types, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const waiter = {
        types: [...types, 'error'],
        done: (reply) => {
          clearTimeout(timer);
          this.waiters = this.waiters.filter((w) => w !== waiter);
          if (reply.t === 'error') reject(new Error(reply.text));
          else resolve(reply);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error('The co-op server did not answer'));
      }, timeoutMs);
      this.waiters.push(waiter);
      this.send(msg);
    });
  }

  close() {
    this.closed = true;
    try {
      this.send({ t: 'leave-room' });
      this.ws.close();
    } catch {
      /* already gone */
    }
  }

  _onMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.t === 'roster') {
      this.players = msg.players || [];
      this.code = msg.code || this.code;
      this.caveHost = msg.caveHost ?? null;
    } else if (msg.t === 'room') {
      this.code = msg.code;
      this.id = msg.id;
      this.players = msg.players || [];
      this.caveHost = msg.caveHost ?? null;
    } else if (msg.t === 'profile') {
      this.id = msg.id;
      this.name = msg.name;
    } else if (msg.t === 'cave-open') {
      this.caveHost = msg.host;
    } else if (msg.t === 'cave-closed') {
      this.caveHost = null;
    }

    const waiter = this.waiters.find((w) => w.types.includes(msg.t));
    if (waiter) waiter.done(msg);
    if (this.handler) this.handler(msg);
  }
}
