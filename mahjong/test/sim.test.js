const Game = require('../src/game.js');

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playGame(seed, sanma, length) {
  const rng = mulberry(seed);
  const g = new Game({ sanma, length, rng });
  let steps = 0, agari = 0, draws = 0, aborts = 0, maxHan = 0, yakumans = 0;
  while (!g.over) {
    if (++steps > 20000) throw new Error('infinite loop seed ' + seed);
    const pd = g.pending;
    if (pd.kind === 'discard') {
      const a = g.getActions(pd.p);
      let act;
      if (a.tsumo) act = { t: 'tsumo' };
      else if (a.riichi.length && rng() < 0.7) act = { t: 'discard', id: a.riichi[Math.floor(rng() * a.riichi.length)], riichi: true };
      else if (a.ankan.length && rng() < 0.5) act = { t: 'ankan', type: a.ankan[0] };
      else if (a.kakan.length && rng() < 0.5) act = { t: 'kakan', type: a.kakan[0] };
      else if (a.kita && rng() < 0.8) act = { t: 'kita' };
      else if (a.abort && rng() < 0.3) act = { t: 'abort' };
      else act = { t: 'discard', id: a.discard[Math.floor(rng() * a.discard.length)] };
      g.act(pd.p, act);
    } else if (pd.kind === 'claim') {
      for (const q of Object.keys(pd.opts).map(Number)) {
        if (pd.responses[q]) continue;
        const o = pd.opts[q];
        let act = { t: 'pass' };
        if (o.ron) act = { t: 'ron' };
        else if (o.kan && rng() < 0.3) act = { t: 'kan' };
        else if (o.pon && rng() < 0.4) act = { t: 'pon', ids: o.pon[0] };
        else if (o.chi && rng() < 0.4) act = { t: 'chi', ids: o.chi[0] };
        g.act(q, act);
        if (g.pending !== pd) break;
      }
    } else if (pd.kind === 'roundEnd') {
      const r = pd.result;
      // score conservation
      const sum = g.scores.reduce((a, b) => a + b, 0) + g.kyoutaku;
      const expected = g.startPoints * g.n;
      if (sum !== expected) throw new Error(`score sum ${sum} != ${expected} seed ${seed} type ${r.type}`);
      if (r.type === 'agari') {
        agari++;
        for (const w of r.winners) { maxHan = Math.max(maxHan, w.res.han); if (w.res.yakuman) yakumans++; }
      } else if (r.type === 'draw') draws++; else aborts++;
      g.act(0, { t: 'next' });
    }
  }
  const total = g.final.players.reduce((a, p) => a + p.pts, 0);
  if (Math.abs(total) > 0.11) throw new Error('final pts do not sum to zero: ' + total + ' seed ' + seed);
  return { agari, draws, aborts, maxHan, yakumans };
}

let tot = { agari: 0, draws: 0, aborts: 0, yakumans: 0, games: 0 };
for (const sanma of [false, true]) {
  for (let s = 1; s <= 150; s++) {
    try {
      const r = playGame(s * 7919 + (sanma ? 1 : 0), sanma, s % 2 ? 'hanchan' : 'tonpuu');
      tot.agari += r.agari; tot.draws += r.draws; tot.aborts += r.aborts; tot.yakumans += r.yakumans; tot.games++;
    } catch (e) {
      console.log('ERROR', sanma ? 'sanma' : '4p', s, e.stack.split('\n').slice(0, 4).join(' | '));
      process.exitCode = 1;
      break;
    }
  }
}
console.log(tot);
