/* Mahjong AI: levels 1 (beginner) .. 4 (pro) */
(function () {
  const MJ = (globalThis.MJ = globalThis.MJ || {});
  const C = MJ.core || require('./core.js');

  // visible tile counts from p's point of view
  function visible(g, p) {
    const r = g.r;
    const v = new Array(34).fill(0);
    for (const x of r.hands[p]) v[x.t]++;
    for (let q = 0; q < g.n; q++) {
      for (const d of r.discards[q]) if (!d.called) v[d.tile.t]++;
      for (const m of r.melds[q]) for (const o of m.objs) v[o.t]++;
      for (const k of r.nuki[q]) v[k.t]++;
    }
    for (const d of r.doraInd.slice(0, r.revealed)) v[d.t]++;
    return v;
  }

  function valueTile(g, p, t) {
    // how useful is a tile to keep (higher = keep)
    const r = g.r;
    let s = 0;
    if (t >= 27) {
      if (t >= 31 || t === g.seatWind(p) || t === g.roundWind()) s += 2;
    } else {
      const n = t % 9;
      s += n === 0 || n === 8 ? 0 : n === 1 || n === 7 ? 1 : 2;
    }
    const dora = g.doraTypes(false);
    if (dora.includes(t)) s += 3;
    return s;
  }

  // danger estimate 0..1 of discarding tile t against riichi players
  function danger(g, p, t, vis) {
    const r = g.r;
    let worst = 0;
    for (let q = 0; q < g.n; q++) {
      if (q === p) continue;
      const threat = r.riichi[q] > 0 ? 1 : (r.melds[q].length >= 3 ? 0.4 : 0);
      if (!threat) continue;
      let d;
      const safe = r.discards[q].some((x) => x.tile.t === t) || r.passed[q].has(t);
      if (safe) d = 0;
      else if (t >= 27) d = vis[t] >= 3 ? 0.03 : vis[t] === 2 ? 0.08 : 0.15;
      else {
        const n = t % 9;
        const dc = r.discards[q].map((x) => x.tile.t);
        const base = Math.floor(t / 9) * 9;
        const has = (m) => m >= 0 && m <= 8 && dc.includes(base + m);
        let suji = false;
        if (n >= 3 && has(n - 3)) suji = true;
        if (n <= 5 && has(n + 3)) suji = true;
        if (n >= 3 && n <= 5) suji = has(n - 3) && has(n + 3);
        if (n < 3) suji = has(n + 3);
        if (n > 5) suji = has(n - 3);
        d = suji ? 0.12 : (n === 0 || n === 8 ? 0.2 : n === 1 || n === 7 ? 0.28 : 0.4);
        if (vis[t] >= 3) d *= 0.5;
      }
      worst = Math.max(worst, d * threat);
    }
    return worst;
  }

  function evalDiscards(g, p, level) {
    const r = g.r;
    const a = g.getActions(p);
    const hand = r.hands[p];
    const mc = r.melds[p].length;
    const counts = C.toCounts(hand);
    const vis = visible(g, p);
    const remain = vis.map((v) => Math.max(0, 4 - v));
    const out = [];
    const seen = new Set();
    for (const id of a.discard) {
      const x = hand.find((h) => h.id === id);
      const key = x.t + (x.red ? 'r' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      counts[x.t]--;
      const u = C.ukeire(counts, mc, remain);
      counts[x.t]++;
      out.push({ id, t: x.t, red: x.red, sh: u.shanten, uke: u.total, val: valueTile(g, p, x.t) + (x.red ? 3 : 0), dng: danger(g, p, x.t, vis) });
    }
    return out;
  }

  function threatLevel(g, p) {
    const r = g.r;
    let t = 0;
    for (let q = 0; q < g.n; q++) {
      if (q === p) continue;
      if (r.riichi[q] > 0) t = Math.max(t, 1);
      else if (r.melds[q].length >= 3) t = Math.max(t, 0.5);
    }
    return t;
  }

  /* ------------- main decisions ------------- */
  function decideTurn(g, p, level) {
    const r = g.r;
    const a = g.getActions(p);
    const rng = g.rng;
    if (a.tsumo) return { t: 'tsumo' };
    if (a.kita && (level >= 2 || rng() < 0.7)) return { t: 'kita' };
    if (a.abort && level >= 3) return { t: 'abort' };
    if (r.riichi[p] > 0) return { t: 'discard', id: r.drawn.id };

    // beginner: simple heuristics with noise
    if (level === 1) {
      if (a.riichi.length && rng() < 0.5) return { t: 'discard', id: a.riichi[Math.floor(rng() * a.riichi.length)], riichi: true };
      const ev = evalDiscards(g, p, 1);
      ev.sort((x, y) => x.sh - y.sh || (rng() < 0.5 ? -1 : 1));
      const pick = rng() < 0.45 ? ev[Math.floor(rng() * ev.length)] : ev[0];
      return { t: 'discard', id: pick.id };
    }

    const ev = evalDiscards(g, p, level);
    const threat = threatLevel(g, p);
    const tilesLeft = r.wall.length;
    const bestSh = Math.min(...ev.map((e) => e.sh));

    // kan: pro/advanced take ankan only when not in danger
    if (level >= 3 && a.ankan.length && threat === 0) return { t: 'ankan', type: a.ankan[0] };

    // fold decision
    let foldWeight = 0;
    if (level === 2) foldWeight = threat ? 4 : 0;
    if (level === 3) foldWeight = threat ? (bestSh <= 0 ? 1 : 12) : 0;
    if (level >= 4) foldWeight = threat ? (bestSh <= 0 ? 1 : bestSh === 1 ? 8 : 16) : 0;

    for (const e of ev) {
      let s = 0;
      s -= e.sh * 100;
      s += Math.min(e.uke, 40) * (level >= 4 ? 1.35 : 1.2);
      s -= e.val * (level >= 3 ? 1.2 : 0.8);
      if (level >= 3) s -= e.dng * foldWeight * 100;
      else s -= e.dng * foldWeight * 40;
      if (level >= 4 && tilesLeft < 12 && e.sh > 0) s -= e.dng * 30;
      e.score = s;
    }
    ev.sort((x, y) => y.score - x.score);
    let pick = ev[0];
    if (level === 2 && rng() < 0.08 && ev.length > 1) pick = ev[1];

    // riichi decision
    if (a.riichi.length) {
      const rid = a.riichi.find((id) => {
        const x = r.hands[p].find((h) => h.id === id);
        return x.t === pick.t;
      });
      if (rid !== undefined) {
        let ok = true;
        if (level >= 3) {
          // check waits quality
          const c = C.toCounts(r.hands[p]);
          c[pick.t]--;
          const w = C.waits(c, r.melds[p].length);
          const vis = visible(g, p);
          let n = 0;
          for (const t of w) n += Math.max(0, 4 - vis[t]);
          if (level >= 4 && n <= 1 && tilesLeft < 8) ok = false;
        }
        if (ok) return { t: 'discard', id: rid, riichi: true };
      }
    }
    return { t: 'discard', id: pick.id };
  }

  function handHasYakuPotential(g, p, extraT) {
    // rough check: yakuhai triplet, tanyao-able, or honitsu direction
    const r = g.r;
    const hand = r.hands[p];
    const melds = r.melds[p];
    const all = hand.map((x) => x.t).concat(melds.flatMap((m) => m.tiles));
    if (extraT !== undefined) all.push(extraT);
    const yakuhai = (t) => t >= 31 || t === g.seatWind(p) || t === g.roundWind();
    if (melds.some((m) => m.kind !== 'chi' && yakuhai(m.t))) return true;
    if (all.every((t) => !C.isYaochu(t))) return true;
    const suits = new Set(all.filter((t) => t < 27).map((t) => C.suitOf(t)));
    if (suits.size <= 1) return true;
    const cnt = C.toCounts(hand);
    for (let t = 27; t < 34; t++) if (yakuhai(t) && cnt[t] >= 2) return true;
    return false;
  }

  function decideClaim(g, p, level) {
    const r = g.r;
    const pd = g.pending;
    const o = pd.opts[p];
    const rng = g.rng;
    if (o.ron) return { t: 'ron' };
    if (level === 1) {
      if (o.pon && rng() < 0.25) return { t: 'pon', ids: o.pon[0] };
      if (o.chi && rng() < 0.2) return { t: 'chi', ids: o.chi[0] };
      return { t: 'pass' };
    }
    const tile = pd.tile;
    const counts = C.toCounts(r.hands[p]);
    const mc = r.melds[p].length;
    const base = C.shanten(counts, mc);
    const closedBefore = g.isClosed(p);
    const threat = threatLevel(g, p);
    if (level >= 3 && threat >= 1 && base > 0) return { t: 'pass' };

    const test = (ids, add) => {
      const c = counts.slice();
      for (const id of ids) c[r.hands[p].find((x) => x.id === id).t]--;
      // after meld, the hand has one more meld and must discard; shanten with one extra meld
      const s = C.shanten(c, mc + 1);
      return s;
    };
    const yakuOk = handHasYakuPotential(g, p, tile.t);
    const strict = level >= 3;
    if (o.pon) {
      const isYakuhai = tile.t >= 31 || tile.t === g.seatWind(p) || tile.t === g.roundWind();
      for (const ids of o.pon) {
        const s = test(ids);
        if (isYakuhai && s <= base) return { t: 'pon', ids };
        if (s < base && (yakuOk || !strict) && (level >= 2)) {
          if (!closedBefore || base >= 1) {
            if (level === 2 || yakuOk) return { t: 'pon', ids };
          }
        }
      }
    }
    if (o.chi) {
      for (const ids of o.chi) {
        const s = test(ids);
        if (s < base && yakuOk && (base >= 1 || !closedBefore)) {
          if (level >= 3 && closedBefore && base <= 1 && r.hands[p].length >= 11 && !strictChi(g, p)) continue;
          return { t: 'chi', ids };
        }
      }
    }
    if (o.kan && level >= 3 && threat === 0 && closedBefore === false && counts[tile.t] >= 3) {
      const isYakuhai = tile.t >= 31 || tile.t === g.seatWind(p) || tile.t === g.roundWind();
      if (isYakuhai) return { t: 'kan' };
    }
    return { t: 'pass' };
  }

  // for strong levels: keep closed hands closed when already 1-shanten with good shape
  function strictChi(g, p) {
    const r = g.r;
    const all = r.hands[p].map((x) => x.t);
    return all.every((t) => !C.isYaochu(t)) && false;
  }

  function decide(g, p, level) {
    const pd = g.pending;
    if (pd.kind === 'discard') return decideTurn(g, p, level);
    if (pd.kind === 'claim') return decideClaim(g, p, level);
    return null;
  }

  MJ.ai = { decide, decideTurn, decideClaim, visible };
  if (typeof module !== 'undefined') module.exports = MJ.ai;
})();
