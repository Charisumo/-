const Game = require('../src/game.js');
const AI = require('../src/ai.js');

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function play(seed, sanma, levels) {
  const g = new Game({ sanma, length: 'tonpuu', rng: mulberry(seed) });
  let steps = 0;
  const stats = { agari: 0, draws: 0, aborts: 0 };
  while (!g.over) {
    if (++steps > 30000) throw new Error('loop ' + seed);
    const pd = g.pending;
    if (pd.kind === 'discard') g.act(pd.p, AI.decide(g, pd.p, levels[pd.p]));
    else if (pd.kind === 'claim') {
      for (const q of Object.keys(pd.opts).map(Number)) {
        if (pd.responses[q]) continue;
        g.act(q, AI.decideClaim(g, q, levels[q]));
        if (g.pending !== pd) break;
      }
    } else if (pd.kind === 'roundEnd') {
      const sum = g.scores.reduce((a, b) => a + b, 0) + g.kyoutaku;
      if (sum !== g.startPoints * g.n) throw new Error('score sum ' + sum);
      const t = pd.result.type;
      if (t === 'agari') stats.agari++; else if (t === 'draw') stats.draws++; else stats.aborts++;
      g.act(0, { t: 'next' });
    }
  }
  return { g, stats };
}

// 1) crash test with mixed levels
const tot = { agari: 0, draws: 0, aborts: 0 };
for (const sanma of [false, true]) {
  for (let s = 1; s <= 8; s++) {
    const levels = [1, 2, 3, 4].slice(0, sanma ? 3 : 4);
    const { stats } = play(s * 101, sanma, levels);
    tot.agari += stats.agari; tot.draws += stats.draws; tot.aborts += stats.aborts;
  }
}
console.log('mixed-level crash test OK', tot);

// 2) strength test: each level vs three level-1 bots, average rank & points (seat rotated)
for (const lv of [1, 2, 3, 4]) {
  let sumPts = 0, wins = 0, games = 0, rankSum = 0;
  for (let s = 1; s <= 28; s++) {
    const seat = s % 4;
    const levels = [1, 1, 1, 1];
    levels[seat] = lv;
    const { g } = play(s * 37 + lv, false, levels);
    const me = g.final.players[seat];
    sumPts += me.pts; rankSum += me.rank; if (me.rank === 1) wins++; games++;
  }
  console.log(`level ${lv} vs three beginners: avg pts ${(sumPts / games).toFixed(1)}, avg rank ${(rankSum / games).toFixed(2)}, 1st ${wins}/${games}`);
}
