const Room = require('../src/room.js');
const out = {};
const room = new Room((cid, m) => { (out[cid] = out[cid] || []).push(m); }, { speed: 0 });
const last = (cid, t) => { const a = (out[cid] || []).filter((m) => m.t === t); return a[a.length - 1]; };
room.join('A', 'Alice'); room.join('B', 'Bob'); // seat1 is ai by default -> Bob should be refused
console.log('Bob refused when seat is AI:', last('B', 'err') && last('B', 'err').code);
room.setCfg('A', { seats: [{}, { kind: 'human' }, { kind: 'ai', level: 3 }, { kind: 'ai', level: 4 }], length: 'tonpuu' });
room.join('B', 'Bob');
console.log('Bob seat', last('B', 'you').seat, 'canStart', last('A', 'lobby').lobby.canStart);
room.setCfg('B', { sanma: true }); // non-host ignored
room.start('A');
let steps = 0, rounds = 0;
const pending = () => {
  for (const cid of ['A', 'B']) {
    const m = last(cid, 'view'); if (!m) continue;
    const v = m.view;
    if (v.phase === 'discard' && v.actions) {
      const a = v.actions;
      if (a.tsumo) return room.action(cid, { t: 'tsumo' });
      if (a.riichi.length) return room.action(cid, { t: 'discard', id: a.riichi[0], riichi: true });
      return room.action(cid, { t: 'discard', id: a.discard[0] });
    }
    if (v.phase === 'claim' && v.claim && !v.claim.responded) {
      const o = v.claim.opts;
      return room.action(cid, o.ron ? { t: 'ron' } : o.pon && Math.random() < .5 ? { t: 'pon', ids: o.pon[0] } : { t: 'pass' });
    }
    if (v.phase === 'roundEnd' && !v.ready.includes(v.seat)) { rounds++; return room.action(cid, { t: 'next' }); }
  }
};
const iv = setInterval(() => {
  for (let k = 0; k < 20; k++) pending();
  const v = last('A', 'view') && last('A', 'view').view;
  if (++steps > 4000 || (v && v.phase === 'gameEnd')) {
    clearInterval(iv);
    console.log('finished', v && v.phase, 'rounds', rounds, 'steps', steps);
    // privacy: B's view must not contain A's hand
    const vb = last('B', 'view').view; console.log('view has only own hand:', vb.hand.length, 'opp handCount', vb.handCount.join(','));
    // disconnect test
    room.action('A', { t: 'toLobby' }); console.log('state after toLobby', room.state);
    process.exit(0);
  }
}, 1);
