#!/usr/bin/env node
// Mahjong server with room codes. No dependencies.
//   Local / LAN:  node server.js [port]
//   Hosted:       the host sets PORT; everyone opens the site URL and uses a 4-letter room code.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
globalThis.MJ = globalThis.MJ || {};
const Room = require('./src/room.js');

const PORT = +(process.argv[2] || process.env.PORT || 3000);
const HTML = path.join(__dirname, 'dist', 'mahjong.html');
const MAX_ROOMS = 200;
const GRACE_MS = 5 * 60 * 1000; // how long a disconnected player keeps their seat (AI plays meanwhile)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

const rooms = new Map();      // code -> { code, room, last }
const clientRoom = new Map(); // cid -> code
const streams = new Map();    // cid -> { res, timer }

function send(cid, msg) {
  const s = streams.get(cid);
  if (!s || !s.res) return;
  try { s.res.write('data: ' + JSON.stringify(msg) + '\n\n'); } catch (e) {}
}

function newCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

function leaveCurrent(cid) {
  const code = clientRoom.get(cid);
  if (!code) return;
  clientRoom.delete(cid);
  const e = rooms.get(code);
  if (e) { e.room.leave(cid); e.last = Date.now(); }
}

function handleMsg(cid, m) {
  if (!m || typeof m.t !== 'string') return;
  const lang = m.lang === 'en' ? 'en' : 'ja';
  if (m.t === 'create') {
    if (rooms.size >= MAX_ROOMS) return send(cid, { t: 'err', code: 'busy' });
    leaveCurrent(cid);
    const code = newCode();
    if (!code) return send(cid, { t: 'err', code: 'busy' });
    const e = { code, room: null, last: Date.now() };
    e.room = new Room(send);
    e.room.lang = lang;
    rooms.set(code, e);
    clientRoom.set(cid, code);
    send(cid, { t: 'room', code });
    e.room.join(cid, m.name);
    e.room.setCfg(cid, { lang, seats: [{}, { kind: 'human' }, { kind: 'ai', level: 2 }, { kind: 'ai', level: 2 }] });
    return;
  }
  if (m.t === 'join') {
    const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const e = rooms.get(code);
    if (!e || e.room.state === 'closed') return send(cid, { t: 'err', code: 'noroom' });
    if (clientRoom.get(cid) !== code) leaveCurrent(cid);
    e.last = Date.now();
    send(cid, { t: 'room', code });
    e.room.join(cid, m.name);
    if (e.room.clients.has(cid)) clientRoom.set(cid, code); else clientRoom.delete(cid);
    return;
  }
  if (m.t === 'leave') return dropClient(cid);
  const code = clientRoom.get(cid);
  const e = code && rooms.get(code);
  if (!e) return;
  e.last = Date.now();
  switch (m.t) {
    case 'act': e.room.action(cid, m.a); break;
    case 'cfg': e.room.setCfg(cid, m.cfg || {}); break;
    case 'start': e.room.start(cid); break;
  }
}

function dropClient(cid) {
  const s = streams.get(cid);
  if (s) { clearTimeout(s.timer); try { s.res && s.res.end(); } catch (e) {} streams.delete(cid); }
  leaveCurrent(cid);
}

// remove empty / finished rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, e] of rooms) {
    const empty = e.room.clients.size === 0;
    if (e.room.state === 'closed' || (empty && now - e.last > 60 * 1000) || now - e.last > 6 * 3600 * 1000) {
      clearTimeout(e.room.timer);
      for (const [cid, c] of clientRoom) if (c === code) clientRoom.delete(cid);
      rooms.delete(code);
    }
  }
}, 30 * 1000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    fs.readFile(HTML, (err, data) => {
      if (err) { res.writeHead(500); return res.end('dist/mahjong.html not found. Run: node build.js'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  } else if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  } else if (req.method === 'GET' && url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: true, port: PORT, rooms: rooms.size, addresses: lanAddresses().map((a) => `http://${a}:${PORT}`) }));
  } else if (req.method === 'GET' && url.pathname === '/events') {
    const cid = url.searchParams.get('cid');
    if (!cid || cid.length > 40) { res.writeHead(400); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    const old = streams.get(cid);
    if (old) { clearTimeout(old.timer); try { old.res && old.res.end(); } catch (e) {} }
    const entry = { res, timer: null };
    streams.set(cid, entry);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 15000);
    const code = clientRoom.get(cid);
    const e = code && rooms.get(code);
    if (e && e.room.clients.has(cid)) {
      // reconnect: the player is back, resend everything
      const c = e.room.clients.get(cid);
      send(cid, { t: 'room', code });
      send(cid, { t: 'you', seat: c.seat, host: c.host });
      e.room.setAway(cid, false);
      send(cid, { t: 'lobby', lobby: e.room.lobbyInfo(), you: { seat: c.seat, host: c.host } });
      if (e.room.state === 'playing') e.room.sendView(cid);
    } else send(cid, { t: 'hello' });
    req.on('close', () => {
      clearInterval(ping);
      if (streams.get(cid) !== entry) return;
      entry.res = null;
      const code2 = clientRoom.get(cid);
      const e2 = code2 && rooms.get(code2);
      if (e2) e2.room.setAway(cid, true); // AI plays for them meanwhile
      entry.timer = setTimeout(() => dropClient(cid), GRACE_MS);
    });
  } else if (req.method === 'POST' && url.pathname === '/msg') {
    const cid = url.searchParams.get('cid');
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try { handleMsg(cid, JSON.parse(body)); res.writeHead(204); } catch (e) { res.writeHead(400); }
      res.end();
    });
  } else { res.writeHead(404); res.end('not found'); }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  麻雀 / Mahjong server is running (room codes)\n');
  console.log('  This PC:      http://localhost:' + PORT);
  for (const a of lanAddresses()) console.log('  Same Wi-Fi:   http://' + a + ':' + PORT);
  console.log('\n  Open the address, press "Host a room", and send the room code or link to friends.');
  console.log('  Press Ctrl+C to stop.\n');
});
module.exports = { server };
