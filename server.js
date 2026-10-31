'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room, ROLES, TICK } = require('./vessel');
const { Session, reel } = require('./campaign');
const { FOES } = require('./shrine');
const { Records } = require('./records');
const { SessionStore, restore } = require('./session-store');
const { BUILDS } = require('./act2');
const { randomBytes, createHash } = require('crypto');

const PUBLIC = path.join(__dirname, 'public');
const MAX_PLAYERS = 4;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.mp4': 'video/mp4', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ALLOWED = new Set(Object.keys(MIME));

/** Byte-range video, the one thing a <video> tag genuinely needs from a server.
 *  A malformed or impossible range gets a 416 with the real length rather than a
 *  truncated body, which is what makes seeking work instead of hanging. */
function serveVideo(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
    const bad = () => { res.writeHead(416, Object.assign({}, headers, { 'Content-Range': `bytes */${st.size}` })); res.end(); };
    let from = 0, to = st.size - 1, code = 200;
    const asked = req.headers.range;
    if (asked) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(asked);
      if (!m || (!m[1] && !m[2])) return bad();
      if (!m[1]) {
        const tail = Number(m[2]);
        if (!Number.isSafeInteger(tail) || tail <= 0) return bad();
        from = Math.max(0, st.size - tail);
      } else {
        from = Number(m[1]);
        if (m[2]) to = Number(m[2]);
      }
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= st.size || to < from) return bad();
      to = Math.min(to, st.size - 1);
      headers['Content-Range'] = `bytes ${from}-${to}/${st.size}`;
      code = 206;
    }
    headers['Content-Length'] = to - from + 1;
    res.writeHead(code, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file, { start: from, end: to });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

function start(port, opts) {
  const rooms = new Map();
  // Shared across every room on this server, which is what makes the boards worth
  // climbing. Tests pass their own throwaway path so they never touch real records.
  const records = new Records((opts && opts.recordsFile) || undefined);
  const storage = new SessionStore(opts && (opts.sessionsFile || (opts.recordsFile && opts.recordsFile + '.sessions')));
  const hashed = (s) => createHash('sha256').update(s).digest('hex');
  const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const newCode = () => {
    for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE[Math.floor(Math.random() * CODE.length)]; if (!rooms.has(c)) return c; }
  };

  const server = http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch (e) { res.writeHead(400); return res.end('bad request'); }
    if (url === '/health') { res.writeHead(200); return res.end('ok'); }
    // The title screen offers the preview reel before anybody has a socket, so
    // the scene list has to be reachable without one.
    if (url === '/reel.json') {
      const body = JSON.stringify(reel());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Content-Length': Buffer.byteLength(body) });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const file = path.resolve(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, 'index.html')) { res.writeHead(403); return res.end('forbidden'); }
    if (!ALLOWED.has(path.extname(file))) { res.writeHead(403); return res.end('forbidden'); }
    // Cinematic video is streamed with HTTP byte ranges so a phone can start
    // playing without pulling the whole clip, and can seek inside it.
    if (path.extname(file) === '.mp4') return serveVideo(req, res, file);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)],
        'Cache-Control': path.extname(file) === '.webp' ? 'public, max-age=3600' : 'no-cache',
        'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });

  const wss = new WebSocketServer({ server, maxPayload: 2048 });
  wss.on('connection', (ws) => {
    ws.alive = true; ws.room = null; ws.pid = 0;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'join') return join(ws, m);
      const room = ws.room; if (!room) return;
      switch (m.t) {
        case 'in': room.setInput(ws.pid, m); break;
        case 'start': room.start(ws.pid); break;
        case 'again': room.again(ws.pid); break;
        case 'road': room.choose(ws.pid, String(m.key || '')); break;
        case 'gift': { if (room.shrine) room.shrine.takeGift(ws.pid, String(m.key || '')); break; }
        case 'skip': room.skipTo(ws.pid, String(m.to || '')); break;
        case 'go': room.go(ws.pid); break;
        case 'seen': room.seen(ws.pid); break;
        case 'build': room.chooseBuild(ws.pid, String(m.key || '')); break;
        case 'board': send(ws, { t: 'board', board: records.top() }); break;
        default: break;
      }
    });
    ws.on('close', () => {
      const room = ws.room; if (!room) return;
      // A superseded socket must not disconnect the same seat twice.
      if (room.clients.get(ws.pid) !== ws) return;
      room.clients.delete(ws.pid);
      room.disconnect(ws.pid);
      persist();
    });
  });

  function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

  function join(ws, m) {
    if (ws.room) return;
    const name = String(m.name || '').replace(/[^\w \-.]/g, '').trim().slice(0, 14) || 'Spirit';
    const code = String(m.code || '').toUpperCase().trim();
    let room;
    let recoveryToken = null, playerId = null;
    if (code) {
      room = rooms.get(code);
      if (!room) return send(ws, { t: 'err', msg: `No room "${code}".` });
      const given = typeof m.token === 'string' && /^[a-f0-9]{64}$/.test(m.token) ? m.token : null;
      const returning = given && room.roster.find((r) => r.tokenHash === hashed(given));
      if (returning) { playerId = returning.id; recoveryToken = given; }
      else if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'err', msg: 'That room is full. Reconnect with the same browser to reclaim your seat.' });
    } else {
      room = new Session(newCode(), (pid, msg) => {
        const data = JSON.stringify(msg);
        if (pid == null) { for (const c of room.clients.values()) if (c.readyState === 1) c.send(data); }
        else { const c = room.clients.get(pid); if (c && c.readyState === 1) c.send(data); }
      });
      room.clients = room.room.clients; rooms.set(room.code, room);
      room.records = records; room.room.records = records;
      room.onRun = (rec) => records.add(Object.assign({ players: room.players.size }, rec));
      room.room.onRun = room.onRun;
    }
    let p;
    if (playerId) {
      const old = room.clients.get(playerId); if (old && old !== ws) old.terminate();
      p = room.reconnect(playerId);
    } else {
      p = room.newPlayer(name);
      recoveryToken = randomBytes(32).toString('hex');
      const r = room.roster.find((x) => x.id === p.id); r.tokenHash = hashed(recoveryToken);
    }
    ws.room = room; ws.pid = p.id; room.clients.set(p.id, ws);
    send(ws, { t: 'joined', id: p.id, code: room.code, roles: ROLES, foes: FOES,
      token: recoveryToken, builds: Object.fromEntries(Object.entries(BUILDS).map(([k,b]) => [k, { name: b.name, desc: b.desc }])),
      reel: reel(), board: records.top(), best: records.best(p.name) });
    room.syncTo(p.id); persist();
  }

  function wireRoom(room) {
    room.clients = room.room.clients;
    room.records = records; room.room.records = records;
    room.onRun = (rec) => records.add(Object.assign({ players: room.players.size }, rec));
    room.room.onRun = room.onRun;
    if (room.shrine) { room.shrine.records = records; room.shrine.onRun = room.onRun; room.shrine.clients = room.clients; }
  }
  // Recover campaigns and the last completed checkpoint from disk. The room
  // does not advance while everyone is offline; reconnect tokens reclaim seats.
  for (const entry of storage.load()) {
    let recovered;
    try { recovered = restore(entry, (pid, msg) => {
      const room = rooms.get(entry.code); if (!room) return;
      const data = JSON.stringify(msg);
      if (pid == null) { for (const c of room.clients.values()) if (c.readyState === 1) c.send(data); }
      else { const c = room.clients.get(pid); if (c && c.readyState === 1) c.send(data); }
    }); } catch (err) { console.error('Could not restore room', entry.code, err.message); }
    if (recovered) { wireRoom(recovered); rooms.set(recovered.code, recovered); }
  }
  function persist() {
    try { storage.save(rooms); } catch (err) { console.error('Could not save room progress:', err.message); }
  }
  const saveLoop = setInterval(persist, 10000);
  const priorPhases = new Map();

  const loop = setInterval(() => {
    for (const room of rooms.values()) {
      try {
        room.tick();
        const phaseKey = room.stage + ':' + room.phase + ':' + (room.shrine ? room.shrine.chamberN : '');
        if (priorPhases.get(room.code) !== phaseKey) { priorPhases.set(room.code, phaseKey); persist(); }
        // Phases with no world to draw: the lobby, the cinematic barrier, and the
        // road. Serialising a room that has no map yet dereferences null and, with
        // no guard, takes the whole process down with it.
        if (room.phase === 'lobby' || room.phase === 'prologue' || room.phase === 'road') continue;
        if (!room.map) continue;
        const shared = room.sharedJSON(), head = shared.slice(0, -1);
        for (const [pid, ws] of room.clients) {
          if (ws.readyState !== 1 || ws.bufferedAmount > 131072) continue;
          ws.send(head + ',"me":' + room.meJSON(pid) + '}');
        }
      } catch (err) {
        // One broken room must never end every other room's session.
        console.error(`room ${room.code} tick failed:`, (err && err.stack) || err);
      }
    }
  }, 1000 / TICK);

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  }, 20000);

  /** Shut everything down so the process can actually exit. Without this the two
   *  timers above keep the event loop alive forever — which silently hangs any
   *  test run or embedding that expects the server to be stoppable. */
  const stop = () => new Promise((resolve) => {
    clearInterval(loop); clearInterval(heartbeat); clearInterval(saveLoop);
    persist();
    for (const ws of wss.clients) ws.terminate();
    wss.close(() => server.close(() => resolve()));
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, wss, rooms, records, storage, stop }))); 
}

module.exports = { start };

if (require.main === module) {
  const port = +process.env.PORT || 3000;
  start(port).then(() => console.log(`Vessel running → http://localhost:${port}`));
}
