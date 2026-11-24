/* Mahjong scoring: yaku, fu, points */
(function () {
  const MJ = (globalThis.MJ = globalThis.MJ || {});
  const C = MJ.core || require('./core.js');
  const { decompose, isChiitoi, isKokushi, isYaochu, isTerminal, isHonor, suitOf, GREEN } = C;

  function basicPoints(han, fu, yakuman) {
    if (yakuman > 0) return 8000 * yakuman;
    if (han >= 13) return 8000;
    if (han >= 11) return 6000;
    if (han >= 8) return 4000;
    if (han >= 6) return 3000;
    const b = fu * Math.pow(2, han + 2);
    if (han >= 5 || b > 2000) return 2000;
    return b;
  }

  function limitName(han, fu, yakuman) {
    if (yakuman > 0) return yakuman >= 2 ? 'yakuman2' : 'yakuman';
    if (han >= 13) return 'kazoe';
    if (han >= 11) return 'sanbaiman';
    if (han >= 8) return 'baiman';
    if (han >= 6) return 'haneman';
    if (han >= 5 || fu * Math.pow(2, han + 2) > 2000) return 'mangan';
    return null;
  }

  /*
   ctx: {
     counts (concealed incl. win tile), melds:[{kind,t,tiles}], winTile, tsumo,
     seatWind, roundWind, riichi(0/1/2), ippatsu, haitei, houtei, rinshan, chankan,
     tenhou, chiihou, doraTypes[], uraTypes[], aka, nuki, sanma
   }
  */
  function evaluate(ctx) {
    const { counts, melds, winTile, tsumo } = ctx;
    const closed = melds.every((m) => m.kind === 'ankan');
    const all = counts.slice();
    for (const m of melds) for (const t of m.tiles) all[t]++;

    const meldSets = melds.map((m) => ({
      k: m.kind === 'chi' ? 's' : 'k',
      t: m.t,
      open: m.kind !== 'ankan',
      kan: m.kind === 'daiminkan' || m.kind === 'kakan' || m.kind === 'ankan',
    }));

    const cands = [];

    // kokushi
    if (melds.length === 0 && isKokushi(counts)) {
      const before = counts.slice();
      before[winTile]--;
      const thirteen = C.YAOCHU_LIST.every((t) => before[t] === 1);
      cands.push(finish(ctx, { type: 'kok', thirteen }, all, closed));
    }
    // chiitoi
    if (melds.length === 0 && isChiitoi(counts)) {
      cands.push(finish(ctx, { type: 'chii' }, all, closed));
    }
    // standard
    const decs = decompose(counts, 4 - melds.length);
    const seen = new Set();
    for (const d of decs) {
      const key = d.pair + ':' + d.sets.map((s) => s.k + s.t).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const waitsList = [];
      if (d.pair === winTile) waitsList.push({ wait: 'tanki', idx: -1 });
      const doneSet = new Set();
      d.sets.forEach((s, idx) => {
        if (s.k === 'k' && s.t === winTile) {
          if (!doneSet.has('sh')) { waitsList.push({ wait: 'shanpon', idx }); doneSet.add('sh'); }
        } else if (s.k === 's' && winTile >= s.t && winTile <= s.t + 2) {
          const pos = winTile - s.t;
          const n = s.t % 9;
          let w;
          if (pos === 1) w = 'kanchan';
          else if (pos === 0) w = n === 6 ? 'penchan' : 'ryanmen';
          else w = n === 0 ? 'penchan' : 'ryanmen';
          const k2 = w + s.t;
          if (!doneSet.has(k2)) { waitsList.push({ wait: w, idx }); doneSet.add(k2); }
        }
      });
      if (waitsList.length === 0) continue;
      for (const w of waitsList) {
        const sets = d.sets.map((s, i) => ({
          k: s.k, t: s.t, open: !!(w.wait === 'shanpon' && i === w.idx && !tsumo), kan: false,
        })).concat(meldSets);
        cands.push(finish(ctx, { type: 'std', pair: d.pair, sets, wait: w.wait }, all, closed));
      }
    }
    let best = null;
    for (const r of cands) {
      if (!r) continue;
      if (!best || cmp(r, best) > 0) best = r;
    }
    return best;
  }

  function cmp(a, b) {
    const pa = basicPoints(a.han, a.fu, a.yakuman);
    const pb = basicPoints(b.han, b.fu, b.yakuman);
    if (pa !== pb) return pa - pb;
    if (a.han !== b.han) return a.han - b.han;
    return a.fu - b.fu;
  }

  function finish(ctx, sh, all, closed) {
    const { tsumo, seatWind, roundWind } = ctx;
    const yaku = [];
    let yakuman = 0;
    const ym = (id, n) => { yaku.push({ id, han: 0, ym: n || 1 }); yakuman += n || 1; };

    // ---- yakuman ----
    if (ctx.tenhou) ym('tenhou');
    if (ctx.chiihou) ym('chiihou');
    const allHonor = all.every((n, t) => n === 0 || isHonor(t));
    const allTerm = all.every((n, t) => n === 0 || isTerminal(t));
    const allGreen = all.every((n, t) => n === 0 || GREEN.has(t));
    if (sh.type === 'kok') ym(sh.thirteen ? 'kokushi13' : 'kokushi', sh.thirteen ? 2 : 1);
    if (allHonor) ym('tsuuiisou');
    if (allTerm) ym('chinroutou');
    if (allGreen) ym('ryuuiisou');
    if (sh.type === 'std') {
      const { sets, pair, wait } = sh;
      const kos = sets.filter((s) => s.k === 'k');
      const conc = kos.filter((s) => !s.open).length;
      if (closed && conc === 4) ym(wait === 'tanki' ? 'suuankouTanki' : 'suuankou', wait === 'tanki' ? 2 : 1);
      const dr = kos.filter((s) => s.t >= 31).length;
      if (dr === 3) ym('daisangen');
      const wi = kos.filter((s) => s.t >= 27 && s.t <= 30).length;
      if (wi === 4) ym('daisuushii', 2);
      else if (wi === 3 && pair >= 27 && pair <= 30) ym('shousuushii');
      if (sets.filter((s) => s.kan).length === 4) ym('suukantsu');
      // chuuren
      if (closed && ctx.melds.length === 0) {
        for (let s = 0; s < 3; s++) {
          const base = s * 9;
          let tot = 0;
          for (let i = 0; i < 9; i++) tot += all[base + i];
          if (tot !== 14) continue;
          let ok = all[base] >= 3 && all[base + 8] >= 3;
          for (let i = 1; i < 8; i++) if (all[base + i] < 1) ok = false;
          if (ok) {
            const b = all.slice(base, base + 9);
            b[ctx.winTile - base]--;
            const pure = b[0] === 3 && b[8] === 3 && b.slice(1, 8).every((x) => x === 1);
            ym(pure ? 'chuuren9' : 'chuuren', pure ? 2 : 1);
          }
        }
      }
    }
    if (yakuman > 0) {
      return { yakuman, han: 0, fu: 0, yaku, dora: 0, ura: 0, aka: 0, nuki: 0, sh };
    }

    // ---- regular yaku ----
    let han = 0;
    const add = (id, h) => { if (h > 0) { yaku.push({ id, han: h }); han += h; } };

    if (ctx.riichi === 2) add('doubleRiichi', 2);
    else if (ctx.riichi === 1) add('riichi', 1);
    if (ctx.riichi && ctx.ippatsu) add('ippatsu', 1);
    if (closed && tsumo) add('menzenTsumo', 1);
    if (tsumo && ctx.haitei) add('haitei', 1);
    if (!tsumo && ctx.houtei) add('houtei', 1);
    if (tsumo && ctx.rinshan) add('rinshan', 1);
    if (!tsumo && ctx.chankan) add('chankan', 1);

    const tanyao = all.every((n, t) => n === 0 || !isYaochu(t));
    if (tanyao) add('tanyao', 1);

    // flush
    const suitsUsed = new Set();
    let hasHonor = false;
    all.forEach((n, t) => {
      if (n > 0) { if (isHonor(t)) hasHonor = true; else suitsUsed.add(suitOf(t)); }
    });
    if (suitsUsed.size === 1) {
      if (!hasHonor) add('chinitsu', closed ? 6 : 5);
      else add('honitsu', closed ? 3 : 2);
    }
    const allYao = all.every((n, t) => n === 0 || isYaochu(t));
    if (allYao && hasHonor && suitsUsed.size > 0) add('honroutou', 2);

    let fu = 20;
    if (sh.type === 'chii') {
      add('chiitoi', 2);
      fu = 25;
    } else if (sh.type === 'kok') {
      return null;
    } else {
      const { sets, pair, wait } = sh;
      const shun = sets.filter((s) => s.k === 's');
      const kos = sets.filter((s) => s.k === 'k');
      // yakuhai
      for (const s of kos) {
        if (s.t === 31) add('yakuhaiHaku', 1);
        else if (s.t === 32) add('yakuhaiHatsu', 1);
        else if (s.t === 33) add('yakuhaiChun', 1);
        else {
          if (s.t === roundWind) add('yakuhaiRound', 1);
          if (s.t === seatWind) add('yakuhaiSeat', 1);
        }
      }
      // shousangen
      if (kos.filter((s) => s.t >= 31).length === 2 && pair >= 31) add('shousangen', 2);
      if (kos.length === 4) add('toitoi', 2);
      const conc = kos.filter((s) => !s.open).length;
      if (conc === 3) add('sanankou', 2);
      if (sets.filter((s) => s.kan).length === 3) add('sankantsu', 2);
      // sanshoku doukou
      for (let n = 0; n < 9; n++) {
        if (kos.some((s) => s.t === n) && kos.some((s) => s.t === 9 + n) && kos.some((s) => s.t === 18 + n)) {
          add('sanshokuDoukou', 2);
          break;
        }
      }
      // shuntsu-based
      if (shun.length > 0) {
        // sanshoku
        for (let n = 0; n < 7; n++) {
          if (shun.some((s) => s.t === n) && shun.some((s) => s.t === 9 + n) && shun.some((s) => s.t === 18 + n)) {
            add('sanshoku', closed ? 2 : 1);
            break;
          }
        }
        // ittsu
        for (let st = 0; st < 3; st++) {
          const b = st * 9;
          if (shun.some((s) => s.t === b) && shun.some((s) => s.t === b + 3) && shun.some((s) => s.t === b + 6)) {
            add('ittsu', closed ? 2 : 1);
            break;
          }
        }
        // chanta / junchan
        const termSet = (s) => (s.k === 's' ? (s.t % 9 === 0 || s.t % 9 === 6) : isYaochu(s.t));
        if (sets.every(termSet) && isYaochu(pair)) {
          const anyHonor = sets.some((s) => isHonor(s.t)) || isHonor(pair);
          if (anyHonor) add('chanta', closed ? 2 : 1);
          else add('junchan', closed ? 3 : 2);
        }
        // peikou
        if (closed) {
          const cnt = {};
          shun.forEach((s) => { cnt[s.t] = (cnt[s.t] || 0) + 1; });
          let pairs = 0;
          for (const k in cnt) pairs += Math.floor(cnt[k] / 2);
          if (pairs >= 2) add('ryanpeikou', 3);
          else if (pairs === 1) add('iipeikou', 1);
        }
      }
      // pinfu
      const yakuPair = pair >= 31 || pair === roundWind || pair === seatWind;
      const isPinfu = closed && shun.length === 4 && !yakuPair && wait === 'ryanmen';
      if (isPinfu) add('pinfu', 1);

      // fu
      if (isPinfu && tsumo) fu = 20;
      else {
        fu = 20;
        if (closed && !tsumo) fu += 10;
        if (tsumo) fu += 2;
        for (const s of kos) {
          const yao = isYaochu(s.t);
          let f = yao ? 4 : 2;
          if (!s.open) f *= 2;
          if (s.kan) f *= 4;
          fu += f;
        }
        if (pair >= 31) fu += 2;
        if (pair === roundWind) fu += 2;
        if (pair === seatWind) fu += 2;
        if (wait === 'kanchan' || wait === 'penchan' || wait === 'tanki') fu += 2;
        if (!closed && fu === 20) fu = 30; // open pinfu shape
        fu = Math.ceil(fu / 10) * 10;
      }
    }

    if (han === 0) return null; // no yaku

    // dora
    let dora = 0, ura = 0;
    for (const t of ctx.doraTypes || []) {
      dora += all[t];
      if (t === 30) dora += ctx.nuki || 0;
    }
    if (ctx.riichi) {
      for (const t of ctx.uraTypes || []) {
        ura += all[t];
        if (t === 30) ura += ctx.nuki || 0;
      }
    }
    const aka = ctx.aka || 0;
    const nuki = ctx.nuki || 0;
    const total = han + dora + ura + aka + nuki;
    return { yakuman: 0, han: total, yakuHan: han, fu, yaku, dora, ura, aka, nuki, sh };
  }

  // payment breakdown
  function payments(res, o) {
    // o: {dealer, tsumo, honba, sanma}
    const b = basicPoints(res.han, res.fu, res.yakuman);
    const up = (x) => Math.ceil(x / 100) * 100;
    const out = { basic: b, limit: limitName(res.han, res.fu, res.yakuman) };
    if (!o.tsumo) {
      out.kind = 'ron';
      out.ron = up(b * (o.dealer ? 6 : 4));
      out.honbaBonus = 300 * o.honba;
      out.total = out.ron + out.honbaBonus;
    } else {
      out.kind = 'tsumo';
      const hb = (o.sanma ? 150 : 100) * o.honba;
      if (o.dealer) {
        out.fromEach = up(b * 2);
        out.honbaEach = hb;
        const payers = o.sanma ? 2 : 3;
        out.total = (out.fromEach + hb) * payers;
      } else {
        out.fromDealer = up(b * 2);
        out.fromOther = up(b);
        out.honbaEach = hb;
        const others = o.sanma ? 1 : 2;
        out.total = out.fromDealer + out.fromOther * others + hb * (others + 1);
      }
    }
    return out;
  }

  MJ.score = { evaluate, payments, basicPoints, limitName };
  if (typeof module !== 'undefined') module.exports = MJ.score;
})();
