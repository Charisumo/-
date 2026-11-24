/* Mahjong game flow: Japanese riichi, 4 players or 3 players (sanma) */
(function () {
  const MJ = (globalThis.MJ = globalThis.MJ || {});
  const C = MJ.core || require('./core.js');
  const S = MJ.score || require('./score.js');

  const sortHand = (h) => h.sort((a, b) => a.t - b.t || a.red - b.red || a.id - b.id);

  class Game {
    constructor(opts) {
      this.opts = Object.assign({ length: 'hanchan', red: true, rng: Math.random, sanma: false }, opts);
      this.sanma = !!this.opts.sanma;
      this.n = this.sanma ? 3 : 4;
      this.rng = this.opts.rng;
      this.names = this.opts.names || ['P1', 'P2', 'P3', 'P4'].slice(0, this.n);
      this.startPoints = this.sanma ? 35000 : 25000;
      this.target = this.sanma ? 40000 : 30000;
      this.uma = this.sanma ? [15, 0, -15] : [20, 10, -10, -20];
      this.scores = new Array(this.n).fill(this.startPoints);
      this.startDealer = Math.floor(this.rng() * this.n);
      this.idx = 0;
      this.honba = 0;
      this.kyoutaku = 0;
      this.baseMax = (this.opts.length === 'tonpuu' ? 1 : 2) * this.n;
      this.events = [];
      this.history = [];
      this.over = false;
      this.final = null;
      this.startRound();
    }

    /* ---------- helpers ---------- */
    get dealer() { return this.r.dealer; }
    seatWind(p) { return 27 + ((p - this.r.dealer + this.n) % this.n); }
    roundWind() { return 27 + Math.min(Math.floor(this.idx / this.n), 3); }
    next(p) { return (p + 1) % this.n; }
    isClosed(p) { return this.r.melds[p].every((m) => m.kind === 'ankan'); }
    emit(e) { this.events.push(e); }

    /* ---------- round setup ---------- */
    startRound() {
      const n = this.n;
      const r = (this.r = {});
      r.dealer = (this.startDealer + this.idx) % n;
      const tiles = C.buildTileSet(this.sanma, this.opts.red);
      C.shuffle(tiles, this.rng);
      const dead = tiles.splice(0, 14);
      r.rinshan = dead.splice(0, 4);
      r.doraInd = dead.splice(0, 5);
      r.uraInd = dead.splice(0, 5);
      r.revealed = 1;
      r.hands = Array.from({ length: n }, () => []);
      for (let k = 0; k < 13; k++) for (let p = 0; p < n; p++) r.hands[p].push(tiles.pop());
      r.hands.forEach(sortHand);
      r.wall = tiles;
      r.melds = Array.from({ length: n }, () => []);
      r.discards = Array.from({ length: n }, () => []);
      r.riichi = new Array(n).fill(0);
      r.ippatsu = new Array(n).fill(false);
      r.nuki = Array.from({ length: n }, () => []);
      r.tempFuriten = new Array(n).fill(false);
      r.permFuriten = new Array(n).fill(false);
      r.passed = Array.from({ length: n }, () => new Set());
      r.turnCount = new Array(n).fill(0);
      r.anyCall = false;
      r.kanCount = 0;
      r.kanBy = new Array(n).fill(0);
      r.declare = -1;
      r.doraPending = 0;
      r.rinshanFlag = false;
      r.kuikae = [];
      r.lastDiscard = null;
      r.startScores = this.scores.slice();
      r.drawn = null;
      this.pending = null;
      this.emit({ type: 'roundStart' });
      this.drawFor(r.dealer, false);
    }

    doraTypes(ura) {
      const r = this.r;
      const src = ura ? r.uraInd : r.doraInd;
      return src.slice(0, r.revealed).map((x) => C.doraFromIndicator(x.t, this.sanma));
    }

    drawFor(p, rin) {
      const r = this.r;
      let tile;
      if (rin) {
        tile = r.rinshan.shift();
        if (r.wall.length) r.rinshan.push(r.wall.shift());
        r.rinshanFlag = true;
      } else {
        tile = r.wall.pop();
        r.rinshanFlag = false;
      }
      r.hands[p].push(tile);
      r.drawn = tile;
      r.tempFuriten[p] = false;
      this.pending = { kind: 'discard', p, drew: true };
      this.emit({ type: 'draw', p, rin: !!rin });
    }

    /* ---------- win context ---------- */
    winCtx(p, tile, tsumo, chankan) {
      const r = this.r;
      const counts = C.toCounts(r.hands[p]);
      if (!tsumo) counts[tile.t]++;
      let aka = r.hands[p].filter((x) => x.red).length + (!tsumo && tile.red ? 1 : 0);
      for (const m of r.melds[p]) for (const o of m.objs) if (o.red) aka++;
      const first = !r.anyCall && r.turnCount[p] === 0;
      return {
        counts,
        melds: r.melds[p].map((m) => ({ kind: m.kind, t: m.t, tiles: m.tiles })),
        winTile: tile.t,
        tsumo,
        seatWind: this.seatWind(p),
        roundWind: this.roundWind(),
        riichi: r.riichi[p],
        ippatsu: r.ippatsu[p],
        haitei: tsumo && r.wall.length === 0 && !r.rinshanFlag,
        houtei: !tsumo && r.wall.length === 0 && !chankan,
        rinshan: tsumo && r.rinshanFlag,
        chankan: !!chankan,
        tenhou: tsumo && first && p === r.dealer,
        chiihou: tsumo && first && p !== r.dealer,
        doraTypes: this.doraTypes(false),
        uraTypes: this.doraTypes(true),
        aka,
        nuki: r.nuki[p].length,
        sanma: this.sanma,
      };
    }

    canRon(p, tile, chankan) {
      const r = this.r;
      if (r.permFuriten[p] || r.tempFuriten[p]) return null;
      const counts = C.toCounts(r.hands[p]);
      const mc = r.melds[p].length;
      const c = counts.slice();
      c[tile.t]++;
      if (!C.isAgari(c, mc)) return null;
      const res = S.evaluate(this.winCtx(p, tile, false, chankan));
      if (!res) return null;
      const w = C.waits(counts, mc);
      if (r.discards[p].some((d) => w.includes(d.tile.t))) return null;
      return res;
    }

    /* ---------- actions for player in discard phase ---------- */
    getActions(p) {
      const r = this.r;
      const pd = this.pending;
      if (!pd || pd.kind !== 'discard' || pd.p !== p) return null;
      const hand = r.hands[p];
      const mc = r.melds[p].length;
      const counts = C.toCounts(hand);
      const a = { discard: [], riichi: [], tsumo: false, ankan: [], kakan: [], kita: false, abort: false };
      const inRiichi = r.riichi[p] > 0;
      if (pd.drew && C.isAgari(counts, mc)) {
        if (S.evaluate(this.winCtx(p, r.drawn, true, false))) a.tsumo = true;
      }
      if (inRiichi) {
        a.discard = [r.drawn.id];
      } else {
        a.discard = hand.filter((x) => !r.kuikae.includes(x.t)).map((x) => x.id);
        if (a.discard.length === 0) a.discard = hand.map((x) => x.id);
      }
      const wallOk = r.wall.length > 0 && r.kanCount < 4;
      // riichi
      if (!inRiichi && pd.drew && this.isClosed(p) && this.scores[p] >= 1000 && r.wall.length >= this.n) {
        const seen = new Set();
        for (const x of hand) {
          if (seen.has(x.t)) continue;
          seen.add(x.t);
          counts[x.t]--;
          if (C.shanten(counts, mc) === 0) {
            for (const y of hand) if (y.t === x.t) a.riichi.push(y.id);
          }
          counts[x.t]++;
        }
      }
      // ankan
      if (wallOk && pd.drew) {
        for (let t = 0; t < 34; t++) {
          if (counts[t] !== 4) continue;
          if (inRiichi) {
            if (t !== r.drawn.t) continue;
            const before = counts.slice();
            before[t]--;
            const after = counts.slice();
            after[t] -= 4;
            const w1 = C.waits(before, mc).join(',');
            const w2 = C.waits(after, mc + 1).join(',');
            if (!w2 || w1 !== w2) continue;
          }
          a.ankan.push(t);
        }
      }
      // kakan
      if (wallOk && !inRiichi) {
        for (const m of r.melds[p]) {
          if (m.kind === 'pon' && counts[m.t] > 0) a.kakan.push(m.t);
        }
      }
      // kita
      if (this.sanma && r.wall.length > 0 && counts[30] > 0 && (!inRiichi || r.drawn.t === 30) && pd.drew) a.kita = true;
      // kyuushu kyuuhai
      if (pd.drew && !r.anyCall && r.turnCount[p] === 0) {
        let k = 0;
        for (const t of C.YAOCHU_LIST) if (counts[t] > 0) k++;
        if (k >= 9) a.abort = true;
      }
      return a;
    }

    /* ---------- generic entry ---------- */
    act(p, a) {
      const pd = this.pending;
      if (!pd) throw new Error('no pending');
      if (pd.kind === 'discard') {
        if (pd.p !== p) throw new Error('not your turn');
        const acts = this.getActions(p);
        switch (a.t) {
          case 'discard': {
            if (!acts.discard.includes(a.id)) throw new Error('illegal discard');
            if (a.riichi && !acts.riichi.includes(a.id)) throw new Error('illegal riichi');
            return this.doDiscard(p, a.id, !!a.riichi);
          }
          case 'tsumo':
            if (!acts.tsumo) throw new Error('illegal tsumo');
            return this.doTsumo(p);
          case 'ankan':
            if (!acts.ankan.includes(a.type)) throw new Error('illegal ankan');
            return this.doAnkan(p, a.type);
          case 'kakan':
            if (!acts.kakan.includes(a.type)) throw new Error('illegal kakan');
            return this.doKakan(p, a.type);
          case 'kita':
            if (!acts.kita) throw new Error('illegal kita');
            return this.doKita(p);
          case 'abort':
            if (!acts.abort) throw new Error('illegal abort');
            return this.endAbort('kyuushu');
          default:
            throw new Error('bad action ' + a.t);
        }
      } else if (pd.kind === 'claim') {
        return this.respond(p, a);
      } else if (pd.kind === 'roundEnd') {
        if (a.t === 'next') return this.nextRound();
      }
      throw new Error('bad state');
    }

    /* ---------- discard ---------- */
    doDiscard(p, id, riichi) {
      const r = this.r;
      const hand = r.hands[p];
      const i = hand.findIndex((x) => x.id === id);
      const tile = hand.splice(i, 1)[0];
      sortHand(hand);
      r.discards[p].push({ tile, riichi, called: false });
      r.turnCount[p]++;
      r.kuikae = [];
      r.rinshanFlag = false;
      if (riichi) {
        r.declare = p;
        r.declareDouble = r.turnCount[p] === 1 && !r.anyCall;
      } else r.ippatsu[p] = false;
      r.passed[p].clear();
      for (let q = 0; q < this.n; q++) if (q !== p) r.passed[q].add(tile.t);
      if (r.doraPending) {
        r.revealed += r.doraPending;
        r.doraPending = 0;
      }
      r.lastDiscard = { p, tile };
      r.drawn = null;
      this.emit({ type: 'discard', p, tile, riichi });
      this.startClaims(p, tile, false, null);
    }

    startClaims(p, tile, chankan, kakanType) {
      const r = this.r;
      const opts = {};
      for (let k = 1; k < this.n; k++) {
        const q = (p + k) % this.n;
        const o = {};
        const res = this.canRon(q, tile, chankan);
        if (res) o.ron = true;
        if (!chankan && r.riichi[q] === 0 && r.wall.length > 0) {
          const counts = C.toCounts(r.hands[q]);
          const same = r.hands[q].filter((x) => x.t === tile.t);
          if (counts[tile.t] >= 2) {
            const choices = this.ponChoices(same);
            const ok = choices.filter((ids) => this.hasDiscardAfter(q, ids, [tile.t]));
            if (ok.length) o.pon = ok;
          }
          if (counts[tile.t] >= 3 && r.kanCount < 4) o.kan = same.slice(0, 3).map((x) => x.id);
          if (!this.sanma && k === 1 && tile.t < 27) {
            const chis = this.chiChoices(q, tile);
            if (chis.length) o.chi = chis;
          }
        }
        if (Object.keys(o).length) opts[q] = o;
      }
      if (Object.keys(opts).length === 0) {
        if (chankan) return this.completeKakan(p, kakanType);
        return this.afterDiscardNoClaim(p);
      }
      this.pending = { kind: 'claim', p, tile, opts, responses: {}, chankan, kakanType };
      this.emit({ type: 'claimStart' });
    }

    ponChoices(same) {
      const normal = same.filter((x) => !x.red);
      const red = same.filter((x) => x.red);
      const out = [];
      if (normal.length >= 2) out.push([normal[0].id, normal[1].id]);
      if (red.length && same.length >= 2) {
        const other = normal[0] || red[1];
        if (other) out.push([red[0].id, other.id]);
      }
      if (!out.length && same.length >= 2) out.push([same[0].id, same[1].id]);
      return out;
    }

    chiChoices(q, tile) {
      const r = this.r;
      const t = tile.t;
      const n = t % 9;
      const out = [];
      const pairs = [];
      if (n >= 2) pairs.push([t - 2, t - 1]);
      if (n >= 1 && n <= 7) pairs.push([t - 1, t + 1]);
      if (n <= 6) pairs.push([t + 1, t + 2]);
      for (const [a, b] of pairs) {
        const as = r.hands[q].filter((x) => x.t === a);
        const bs = r.hands[q].filter((x) => x.t === b);
        if (!as.length || !bs.length) continue;
        const variants = new Set();
        const pick = (arr) => {
          const res = [];
          const nr = arr.find((x) => !x.red);
          const rd = arr.find((x) => x.red);
          if (nr) res.push(nr);
          if (rd) res.push(rd);
          return res;
        };
        for (const x of pick(as)) for (const y of pick(bs)) {
          const key = (x.red ? 'r' : 'n') + (y.red ? 'r' : 'n');
          if (variants.has(key)) continue;
          variants.add(key);
          const forbid = this.chiForbid(t, a, b);
          if (this.hasDiscardAfter(q, [x.id, y.id], forbid)) out.push([x.id, y.id]);
        }
      }
      return out;
    }

    chiForbid(t, a, b) {
      const f = [t];
      const lo = Math.min(a, b, t), hi = Math.max(a, b, t);
      if (t === lo && hi + 0 === lo + 2 && (lo % 9) + 3 <= 8) f.push(lo + 3);
      if (t === hi && (hi % 9) - 3 >= 0) f.push(hi - 3);
      return f;
    }

    hasDiscardAfter(q, ids, forbid) {
      const rest = this.r.hands[q].filter((x) => !ids.includes(x.id));
      return rest.some((x) => !forbid.includes(x.t));
    }

    respond(q, a) {
      const pd = this.pending;
      if (!pd || pd.kind !== 'claim') throw new Error('no claim');
      const o = pd.opts[q];
      if (!o) throw new Error('no option');
      if (pd.responses[q]) return;
      if (a.t === 'ron' && !o.ron) throw new Error('illegal ron');
      if (a.t === 'pon' && !o.pon) throw new Error('illegal pon');
      if (a.t === 'kan' && !o.kan) throw new Error('illegal kan');
      if (a.t === 'chi' && !o.chi) throw new Error('illegal chi');
      pd.responses[q] = a;
      if (Object.keys(pd.opts).every((x) => pd.responses[x])) this.resolveClaims();
    }

    resolveClaims() {
      const r = this.r;
      const pd = this.pending;
      const { p, tile, opts, responses } = pd;
      const order = Object.keys(opts).map(Number);
      const ronners = order.filter((q) => responses[q].t === 'ron');
      for (const q of order) {
        if (opts[q].ron && responses[q].t !== 'ron') {
          if (r.riichi[q] > 0) r.permFuriten[q] = true;
          else r.tempFuriten[q] = true;
        }
      }
      if (ronners.length) {
        if (!this.sanma && ronners.length >= 3) return this.endAbort('tripleRon');
        return this.applyRon(ronners, p, tile, pd.chankan);
      }
      if (pd.chankan) return this.completeKakan(p, pd.kakanType);
      for (const q of order) {
        const a = responses[q];
        if (a.t === 'kan') return this.doDaiminkan(q, p, tile);
      }
      for (const q of order) {
        const a = responses[q];
        if (a.t === 'pon') return this.doPon(q, p, tile, a.ids);
      }
      for (const q of order) {
        const a = responses[q];
        if (a.t === 'chi') return this.doChi(q, p, tile, a.ids);
      }
      this.afterDiscardNoClaim(p);
    }

    markCalled(p) {
      const d = this.r.discards[p];
      d[d.length - 1].called = true;
      this.establishRiichi();
    }

    takeFromHand(q, ids) {
      const r = this.r;
      const objs = [];
      for (const id of ids) {
        const i = r.hands[q].findIndex((x) => x.id === id);
        objs.push(r.hands[q].splice(i, 1)[0]);
      }
      return objs;
    }

    clearIppatsu() {
      this.r.ippatsu.fill(false);
    }

    doPon(q, p, tile, ids) {
      const r = this.r;
      if (!ids) ids = this.pending.opts[q].pon[0];
      const objs = this.takeFromHand(q, ids);
      objs.push(tile);
      r.melds[q].push({ kind: 'pon', t: tile.t, tiles: [tile.t, tile.t, tile.t], objs, from: p, called: tile.id });
      this.markCalled(p);
      r.anyCall = true;
      this.clearIppatsu();
      r.kuikae = [tile.t];
      this.pending = { kind: 'discard', p: q, drew: false };
      this.emit({ type: 'meld', p: q, kind: 'pon', from: p });
    }

    doChi(q, p, tile, ids) {
      const r = this.r;
      if (!ids) ids = this.pending.opts[q].chi[0];
      const objs = this.takeFromHand(q, ids);
      const types = objs.map((x) => x.t).concat(tile.t).sort((a, b) => a - b);
      objs.push(tile);
      r.melds[q].push({ kind: 'chi', t: types[0], tiles: types, objs, from: p, called: tile.id });
      this.markCalled(p);
      r.anyCall = true;
      this.clearIppatsu();
      r.kuikae = this.chiForbid(tile.t, types[0], types[2]);
      // forbid computation: called tile and the opposite end
      r.kuikae = [tile.t];
      if (tile.t === types[0] && (types[0] % 9) + 3 <= 8) r.kuikae.push(types[0] + 3);
      if (tile.t === types[2] && (types[2] % 9) - 3 >= 0) r.kuikae.push(types[2] - 3);
      this.pending = { kind: 'discard', p: q, drew: false };
      this.emit({ type: 'meld', p: q, kind: 'chi', from: p });
    }

    doDaiminkan(q, p, tile) {
      const r = this.r;
      const ids = this.pending.opts[q].kan;
      const objs = this.takeFromHand(q, ids);
      objs.push(tile);
      r.melds[q].push({ kind: 'daiminkan', t: tile.t, tiles: [tile.t, tile.t, tile.t, tile.t], objs, from: p, called: tile.id });
      this.markCalled(p);
      r.anyCall = true;
      r.kanCount++;
      r.kanBy[q]++;
      r.doraPending++;
      this.clearIppatsu();
      this.emit({ type: 'meld', p: q, kind: 'daiminkan', from: p });
      this.drawFor(q, true);
    }

    doAnkan(p, t) {
      const r = this.r;
      const ids = r.hands[p].filter((x) => x.t === t).map((x) => x.id);
      const objs = this.takeFromHand(p, ids);
      r.melds[p].push({ kind: 'ankan', t, tiles: [t, t, t, t], objs, from: -1 });
      r.anyCall = true;
      r.kanCount++;
      r.kanBy[p]++;
      r.revealed++;
      this.clearIppatsu();
      this.emit({ type: 'meld', p, kind: 'ankan', from: -1 });
      this.drawFor(p, true);
    }

    doKakan(p, t) {
      const r = this.r;
      const tile = r.hands[p].find((x) => x.t === t);
      this.emit({ type: 'kakanDeclare', p, tile });
      this.startClaims(p, tile, true, t);
    }

    completeKakan(p, t) {
      const r = this.r;
      const i = r.hands[p].findIndex((x) => x.t === t);
      const tile = r.hands[p].splice(i, 1)[0];
      const m = r.melds[p].find((x) => x.kind === 'pon' && x.t === t);
      m.kind = 'kakan';
      m.tiles = [t, t, t, t];
      m.objs.push(tile);
      r.anyCall = true;
      r.kanCount++;
      r.kanBy[p]++;
      r.doraPending++;
      this.clearIppatsu();
      this.emit({ type: 'meld', p, kind: 'kakan', from: -1 });
      this.drawFor(p, true);
    }

    doKita(p) {
      const r = this.r;
      const i = r.hands[p].findIndex((x) => x.t === 30);
      const tile = r.hands[p].splice(i, 1)[0];
      r.nuki[p].push(tile);
      this.emit({ type: 'kita', p, tile });
      this.drawFor(p, true);
    }

    establishRiichi() {
      const r = this.r;
      if (r.declare >= 0) {
        const p = r.declare;
        r.riichi[p] = r.declareDouble ? 2 : 1;
        r.ippatsu[p] = true;
        this.scores[p] -= 1000;
        this.kyoutaku += 1000;
        r.declare = -1;
        this.emit({ type: 'riichi', p });
      }
    }

    afterDiscardNoClaim(p) {
      const r = this.r;
      this.establishRiichi();
      // abortive draws
      if (!this.sanma) {
        if (r.riichi.every((x) => x > 0)) return this.endAbort('suuchaRiichi');
        if (!r.anyCall && r.discards.every((d) => d.length === 1)) {
          const ts = r.discards.map((d) => d[0].tile.t);
          if (ts[0] >= 27 && ts[0] <= 30 && ts.every((t) => t === ts[0])) return this.endAbort('suufonRenda');
        }
      }
      if (r.kanCount >= 4 && r.kanBy.filter((x) => x > 0).length > 1) return this.endAbort('suukaikan');
      if (r.wall.length === 0) return this.exhaustive();
      this.drawFor(this.next(p), false);
    }

    /* ---------- winning ---------- */
    doTsumo(p) {
      const r = this.r;
      const res = S.evaluate(this.winCtx(p, r.drawn, true, false));
      this.finishWin([{ p, res }], -1, true, r.drawn);
    }

    applyRon(ronners, loser, tile, chankan) {
      const r = this.r;
      // order from loser clockwise
      const ordered = ronners.slice().sort((a, b) => ((a - loser + this.n) % this.n) - ((b - loser + this.n) % this.n));
      if (r.declare >= 0) r.declare = -1; // riichi discard was ronned: not established
      const ws = ordered.map((q) => ({ p: q, res: this.canRon(q, tile, chankan) }));
      this.finishWin(ws, loser, false, tile);
    }

    finishWin(ws, loser, tsumo, tile) {
      const r = this.r;
      const n = this.n;
      const out = [];
      const delta = new Array(n).fill(0);
      let first = true;
      for (const w of ws) {
        const pay = S.payments(w.res, { dealer: w.p === r.dealer, tsumo, honba: first ? this.honba : 0, sanma: this.sanma });
        if (tsumo) {
          if (w.p === r.dealer) {
            for (let q = 0; q < n; q++) if (q !== w.p) { delta[q] -= pay.fromEach + pay.honbaEach; delta[w.p] += pay.fromEach + pay.honbaEach; }
          } else {
            for (let q = 0; q < n; q++) {
              if (q === w.p) continue;
              const amt = (q === r.dealer ? pay.fromDealer : pay.fromOther) + pay.honbaEach;
              delta[q] -= amt;
              delta[w.p] += amt;
            }
          }
        } else {
          delta[loser] -= pay.total;
          delta[w.p] += pay.total;
        }
        out.push({ p: w.p, res: w.res, pay, hand: r.hands[w.p].slice(), melds: r.melds[w.p].map((m) => Object.assign({}, m)), nukiTiles: r.nuki[w.p].slice(), winTile: tile });
        first = false;
      }
      const gain = this.kyoutaku;
      delta[ws[0].p] += gain;
      this.kyoutaku = 0;
      for (let q = 0; q < n; q++) this.scores[q] += delta[q];
      const result = {
        type: 'agari', tsumo, loser, winners: out, honba: this.honba, kyoutakuGain: gain,
        dora: r.doraInd.slice(0, r.revealed), ura: r.doraInd ? r.uraInd.slice(0, r.revealed) : [],
        showUra: out.some((w) => r.riichi[w.p] > 0),
      };
      this.endRound(result);
    }

    exhaustive() {
      const r = this.r;
      const n = this.n;
      const tenpai = [];
      for (let p = 0; p < n; p++) {
        const w = C.waits(C.toCounts(r.hands[p]), r.melds[p].length);
        tenpai.push(w.length > 0);
      }
      const nagashi = [];
      for (let p = 0; p < n; p++) {
        if (r.discards[p].length > 0 && r.discards[p].every((d) => C.isYaochu(d.tile.t) && !d.called)) nagashi.push(p);
      }
      const delta = new Array(n).fill(0);
      let kind = 'exhaust';
      if (nagashi.length) {
        kind = 'nagashi';
        for (const p of nagashi) {
          if (p === r.dealer) {
            for (let q = 0; q < n; q++) if (q !== p) { delta[q] -= 4000; delta[p] += 4000; }
          } else {
            for (let q = 0; q < n; q++) {
              if (q === p) continue;
              const amt = q === r.dealer ? 4000 : 2000;
              delta[q] -= amt;
              delta[p] += amt;
            }
          }
        }
      } else {
        const tc = tenpai.filter(Boolean).length;
        const total = this.sanma ? 2000 : 3000;
        if (tc > 0 && tc < n) {
          for (let p = 0; p < n; p++) {
            if (tenpai[p]) delta[p] += total / tc;
            else delta[p] -= total / (n - tc);
          }
        }
      }
      for (let q = 0; q < n; q++) this.scores[q] += delta[q];
      this.endRound({ type: 'draw', kind, tenpai, nagashi, dealerTenpai: tenpai[r.dealer], hands: r.hands.map((h) => h.slice()), melds: r.melds.map((m) => m.slice()) });
    }

    endAbort(reason) {
      const r = this.r;
      this.establishRiichi();
      this.endRound({ type: 'abort', reason, hands: r.hands.map((h) => h.slice()) });
    }

    endRound(result) {
      const r = this.r;
      result.delta = this.scores.map((s, i) => s - r.startScores[i]);
      result.scores = this.scores.slice();
      result.idx = this.idx;
      result.dealer = r.dealer;
      this.history.push(result);
      this.pending = { kind: 'roundEnd', result };
      this.emit({ type: 'roundEnd', result });
    }

    /* ---------- progression ---------- */
    nextRound() {
      const r = this.r;
      const res = this.pending.result;
      let renchan, honba;
      if (res.type === 'agari') {
        renchan = res.winners.some((w) => w.p === r.dealer);
        honba = renchan ? this.honba + 1 : 0;
      } else if (res.type === 'draw') {
        renchan = !!res.dealerTenpai;
        honba = this.honba + 1;
      } else {
        renchan = true;
        honba = this.honba + 1;
      }
      let end = this.scores.some((s) => s < 0);
      const top = Math.max(...this.scores);
      const limit = this.baseMax + this.n;
      if (!end) {
        if (renchan) {
          if (this.idx >= this.baseMax - 1 && this.scores[r.dealer] === top && top >= this.target) end = true;
        } else {
          const nextIdx = this.idx + 1;
          if (nextIdx >= this.baseMax) {
            if (top >= this.target || nextIdx >= limit) end = true;
          }
        }
      }
      if (end) return this.finishGame();
      this.honba = honba;
      if (!renchan) this.idx++;
      this.startRound();
    }

    finishGame() {
      const n = this.n;
      const order = [...Array(n).keys()].sort((a, b) => this.scores[b] - this.scores[a] || ((a - this.startDealer + n) % n) - ((b - this.startDealer + n) % n));
      const scores = this.scores.slice();
      if (this.kyoutaku) { scores[order[0]] += this.kyoutaku; }
      const oka = (this.target - this.startPoints) * n;
      const final = new Array(n);
      order.forEach((p, rank) => {
        let pts = (scores[p] - this.target) / 1000 + this.uma[rank] + (rank === 0 ? oka / 1000 : 0);
        pts = Math.round(pts * 10) / 10;
        final[p] = { p, rank: rank + 1, score: scores[p], pts };
      });
      this.over = true;
      this.final = { order, players: final };
      this.pending = { kind: 'gameEnd', final: this.final };
      this.emit({ type: 'gameEnd' });
    }

    // description string of the current round, e.g. {wind:27, num:1}
    roundInfo() {
      return { wind: this.roundWind(), num: (this.idx % this.n) + 1, honba: this.honba, kyoutaku: this.kyoutaku };
    }
  }

  MJ.Game = Game;
  if (typeof module !== 'undefined') module.exports = Game;
})();
