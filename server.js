import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRooms } from './server/rooms.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
// Co-op profiles (player name -> saved progress). Kept out of git by .gitignore.
const SAVE_FILE = process.env.SAVE_FILE || path.join(ROOT, 'data', 'profiles.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.join(ROOT, path.normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-ish fallback for unknown non-file routes
      if (!path.extname(pathname)) {
        fs.readFile(path.join(ROOT, 'index.html'), (err2, index) => {
          if (err2) {
            res.writeHead(404).end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
          res.end(index);
        });
        return;
      }
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

// Co-op WebSocket relay lives at /ws on the same port.
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
createRooms({ saveFile: SAVE_FILE, log: (m) => console.warn(m) }).attach(wss);

server.listen(PORT, HOST, () => {
  console.log(`Deepmine running at http://${HOST}:${PORT}  (co-op relay at /ws, profiles in ${SAVE_FILE})`);
});
