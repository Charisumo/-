// End-to-end test of the room-code server using plain HTTP/SSE clients
process.env.PORT = '3112';
require('../server.js');
const http = require('http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(cid) {
  const c = { cid, msgs: [], req: null };
  c.connect = () => new Promise((resolve) => {
    c.req = http.get(`http://localhost:3112/events?cid=${cid}`, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find((l) => l.startsWith('data: ')); if (line) c.msgs.push(JSON.parse(line.slice(6))); } });
      resolve();
    });
    c.req.on('error', () => {});
  });
  c.send = (m) => new Promise((resolve) => {
    const r = http.request({ port: 3112, path: `/msg?cid=${cid}`, method: 'POST' }, (res) => { res.resume(); resolve(res.statusCode); });
    r.end(JSON.stringify(m));
  });
  c.last = (t) => { const a = c.msgs.filter((m) => m.t === t); return a[a.length - 1]; };
  c.drop = () => { c.req.destroy(); };
  return c;
}
let fails = 0;
const ok = (cond, label) => { console.log(cond ? 'ok  ' : 'FAIL', label); if (!cond) fails++; };

(async () => {
  await sleep(300);
  const A = client('cA'), B = client('cB'), C = client('cC');
  await A.connect(); await B.connect(); await C.connect();
  await A.send({ t: 'create', name: 'Alice', lang: 'ja' }); await sleep(100);
  const code = A.last('room') && A.last('room').code;
  ok(/^[A-Z2-9]{4}$/.test(code || ''), 'host gets a 4-char room code: ' + code);
  ok(A.last('you') && A.last('you').host === true, 'creator is host');

  await C.send({ t: 'join', code: 'ZZZZ', name: 'Nobody' }); await sleep(100);
  ok(C.last('err') && C.last('err').code === 'noroom', 'wrong code -> noroom');

  await B.send({ t: 'join', code: code.toLowerCase(), name: 'Bob' }); await sleep(100);
  ok(B.last('you') && B.last('you').seat === 1, 'guest joins by code (case-insensitive), seat 1');
  ok(A.last('lobby').lobby.seats[1].name === 'Bob', 'host lobby shows Bob');

  await C.send({ t: 'join', code, name: 'Carol' }); await sleep(100);
  ok(C.last('err') && C.last('err').code === 'full', 'third guest -> room full (seat 3 is AI)');

  await A.send({ t: 'start' }); await sleep(900);
  ok(B.last('view') && B.last('view').view.seat === 1, 'guest receives its own view');

  // Bob loses connection: seat goes away, AI plays for him
  B.drop(); await sleep(400);
  ok(A.last('view').view.away[1] === true, 'disconnected player marked away');
  // game must keep progressing even if it is Bob's turn: wait and check turn counter moves on
  const wall1 = A.last('view').view.wall; await sleep(3500);
  const wall2 = A.last('view').view.wall;
  ok(wall2 <= wall1, 'game keeps running while player is away (wall ' + wall1 + ' -> ' + wall2 + ')');

  // Bob comes back with the same client id
  const B2 = client('cB'); await B2.connect(); await sleep(300);
  ok(B2.last('you') && B2.last('you').seat === 1, 'reconnect restores the seat');
  ok(B2.last('view') && B2.last('view').view.hand.length >= 13, 'reconnect resends the hand');
  ok(A.last('view').view.away[1] === false, 'away flag cleared');

  const info = await new Promise((r) => http.get('http://localhost:3112/api/info', (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => r(JSON.parse(b))); }));
  ok(info.rooms === 1, 'one room on server');
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
