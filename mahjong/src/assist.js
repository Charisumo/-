/* Assist mode: waits, discard advice, yaku hints, remaining-tile counts. Uses only what the player can see. */
(function () {
  const MJ = globalThis.MJ;
  const C = MJ.core, S = MJ.score;
  const h = MJ.h;

  const SUIT = { ja: ['萬子', '筒子', '索子'], en: ['characters', 'circles', 'bamboo'] };
  const tname = (t, ja) => {
    if (t < 27) return String(t % 9 + 1) + (ja ? ['萬', '筒', '索'][Math.floor(t / 9)] : ['m', 'p', 's'][Math.floor(t / 9)]);
    return (ja ? ['東', '南', '西', '北', '白', '發', '中'] : ['E', 'S', 'W', 'N', 'Wh', 'Gr', 'Rd'])[t - 27];
  };

  /* ---- visible tiles -> remaining counts ---- */
  function visibleCounts(v) {
    const vis = new Array(34).fill(0);
    for (const x of v.hand) vis[x.t]++;
    for (let p = 0; p < v.n; p++) {
      for (const d of v.discards[p]) if (!d.called) vis[d.tile.t]++;
      for (const m of v.melds[p]) for (const o of m.objs) vis[o.t]++;
      for (const k of v.nuki[p]) vis[k.t]++;
    }
    for (const d of v.dora) vis[d.t]++;
    return vis;
  }

  function remainOf(v) {
    const vis = visibleCounts(v);
    const rem = vis.map((x) => Math.max(0, 4 - x));
    if (v.n === 3) for (let t = 1; t <= 7; t++) rem[t] = 0; // no 2-8 man in sanma
    return rem;
  }

  /* ---- evaluate a winning tile for the current hand ---- */
  function evalWin(v, counts, t, tsumo, akaInHand) {
    const me = v.seat;
    const c = counts.slice(); c[t]++;
    const melds = v.melds[me].map((m) => ({ kind: m.kind, t: m.t, tiles: m.objs.map((o) => o.t) }));
    let aka = akaInHand;
    for (const m of v.melds[me]) for (const o of m.objs) if (o.red) aka++;
    return S.evaluate({
      counts: c, melds, winTile: t, tsumo,
      seatWind: v.seatWinds[me], roundWind: v.roundWind, riichi: v.riichi[me], ippatsu: false,
      haitei: false, houtei: false, rinshan: false, chankan: false, tenhou: false, chiihou: false,
      doraTypes: v.dora.map((d) => C.doraFromIndicator(d.t, v.n === 3)), uraTypes: [],
      aka, nuki: v.nuki[me].length, sanma: v.n === 3,
    });
  }

  function waitsInfo(v, counts, mc, rem, akaInHand) {
    const ws = C.waits(counts, mc);
    const mine = new Set(v.discards[v.seat].map((d) => d.tile.t));
    const list = ws.map((t) => {
      const ron = evalWin(v, counts, t, false, akaInHand);
      const tsumo = evalWin(v, counts, t, true, akaInHand);
      return { t, left: rem[t], ron: ron && { han: ron.han, fu: ron.fu, ym: ron.yakuman }, tsumo: tsumo && { han: tsumo.han, fu: tsumo.fu, ym: tsumo.yakuman }, furiten: mine.has(t) };
    });
    return { list, total: list.reduce((a, x) => a + x.left, 0), furiten: list.some((x) => x.furiten), anyRon: list.some((x) => x.ron), anyTsumo: list.some((x) => x.tsumo) };
  }

  /* ---- yaku hints ---- */
  function yakuTips(v, lang, shanten) {
    const ja = lang === 'ja';
    const me = v.seat;
    const hand = v.hand, melds = v.melds[me];
    const cH = C.toCounts(hand);           // concealed
    const all = cH.slice();
    for (const m of melds) for (const o of m.objs) all[o.t]++;
    const closed = melds.every((m) => m.kind === 'ankan');
    const hasChi = melds.some((m) => m.kind === 'chi');
    const tips = [];
    const add = (score, id, title, text, done) => tips.push({ score, id, title, text, done: !!done });

    // yakuhai
    const yh = (t) => t >= 31 || t === v.seatWinds[me] || t === v.roundWind;
    for (let t = 27; t < 34; t++) {
      if (!yh(t)) continue;
      const m3 = melds.some((m) => m.kind !== 'chi' && m.t === t);
      if (m3 || cH[t] >= 3) add(12, 'yakuhai' + t, (ja ? '役牌 ' : 'Yakuhai ') + tname(t, ja), ja ? `${tname(t, true)}の刻子があるので1翻(鳴いてもOK)。` : `You hold a ${tname(t, false)} triplet: 1 han (works open too).`, true);
      else if (cH[t] === 2) add(8, 'yakuhai' + t, (ja ? '役牌 ' : 'Yakuhai ') + tname(t, ja), ja ? `${tname(t, true)}が対子。誰かが捨てたらポンで1翻確定。` : `Pair of ${tname(t, false)}: pon it when discarded to lock in 1 han.`);
    }

    // tanyao
    if (!melds.some((m) => m.objs.some((o) => C.isYaochu(o.t)))) {
      let yao = 0; for (let t = 0; t < 34; t++) if (C.isYaochu(t)) yao += cH[t];
      if (yao === 0) add(11, 'tanyao', ja ? '断幺九' : 'Tanyao', ja ? '2〜8だけなので成立中(1翻・鳴きOK)。' : 'All tiles are 2-8: tanyao is ready (1 han, open OK).', true);
      else if (yao <= 4) add(10 - yao * 1.4, 'tanyao', ja ? '断幺九' : 'Tanyao', ja ? `1・9・字牌が${yao}枚。これを切っていけば成立(鳴いてもOK)。` : `${yao} terminal/honor tile(s) left. Discard them to make tanyao (open OK).`);
    }

    // flush
    for (let s = 0; s < 3; s++) {
      let inS = 0, hon = 0, total = 0;
      for (let t = 0; t < 34; t++) { total += all[t]; if (t < 27 && Math.floor(t / 9) === s) inS += all[t]; if (t >= 27) hon += all[t]; }
      const other = total - inS - hon;
      if (other <= 4 && inS >= 6) {
        if (hon === 0 && other <= 3) add(9 - other * 1.5, 'chinitsu', ja ? '清一色' : 'Chinitsu', ja ? `${SUIT.ja[s]}だけに寄せる(6翻・鳴くと5翻)。他の色があと${other}枚。` : `Go all-${SUIT.en[s]} (6 han, 5 open). ${other} off-suit tile(s) to drop.`, other === 0);
        add(7.5 - other * 1.4, 'honitsu', ja ? '混一色' : 'Honitsu', ja ? `${SUIT.ja[s]}と字牌だけに寄せる(3翻・鳴くと2翻)。他の色があと${other}枚。` : `${SUIT.en[s]} + honors only (3 han, 2 open). ${other} off-suit tile(s) to drop.`, other === 0);
      }
    }

    // toitoi
    if (!hasChi) {
      let trip = melds.filter((m) => m.kind !== 'chi').length, pairs = 0;
      for (let t = 0; t < 34; t++) { if (cH[t] >= 3) trip++; else if (cH[t] === 2) pairs++; }
      if (trip + pairs >= 4) add(5 + trip, 'toitoi', ja ? '対々和' : 'Toitoi', ja ? `刻子${trip}組・対子${pairs}組。対子をポンして刻子にそろえる(2翻)。` : `${trip} triplet(s), ${pairs} pair(s). Pon the pairs to make all triplets (2 han).`);
    }

    // chiitoi
    if (closed && melds.length === 0) {
      let pairs = 0; for (let t = 0; t < 34; t++) if (cH[t] >= 2) pairs++;
      if (pairs >= 4) add(3 + pairs * 1.2, 'chiitoi', ja ? '七対子' : 'Chiitoitsu', ja ? `対子が${pairs}組。あと${7 - pairs}組で聴牌(2翻25符)。3枚以上は1枚切る。` : `${pairs} pair(s). ${7 - pairs} more for tenpai (2 han, 25 fu). Keep each tile to a pair.`);
    }

    // ittsu
    for (let s = 0; s < 3; s++) {
      let okGroups = 0;
      for (let g = 0; g < 3; g++) { let k = 0; for (let i = 0; i < 3; i++) if (all[s * 9 + g * 3 + i] > 0) k++; if (k >= 2) okGroups++; }
      if (okGroups === 3) add(6.5, 'ittsu', ja ? '一気通貫' : 'Ittsu', ja ? `${SUIT.ja[s]}で123・456・789の形がそろいつつある(2翻・鳴くと1翻)。` : `Pieces of 123/456/789 in ${SUIT.en[s]} (2 han, 1 open).`);
    }

    // sanshoku
    for (let n = 0; n < 7; n++) {
      let suits = 0, strong = 0;
      for (let s = 0; s < 3; s++) { let k = 0; for (let i = 0; i < 3; i++) if (all[s * 9 + n + i] > 0) k++; if (k >= 2) suits++; if (k === 3) strong++; }
      if (suits === 3) add(6 + strong * .5, 'sanshoku', ja ? '三色同順' : 'Sanshoku', ja ? `${n + 1}${n + 2}${n + 3}を萬・筒・索の3色でそろえる(2翻・鳴くと1翻)。` : `Build ${n + 1}${n + 2}${n + 3} in all three suits (2 han, 1 open).`);
    }

    // kokushi
    if (closed && melds.length === 0) {
      let k = 0; for (const t of C.YAOCHU_LIST) if (cH[t] > 0) k++;
      if (k >= 9) add(5 + k - 8, 'kokushi', ja ? '国士無双' : 'Kokushi', ja ? `幺九牌が${k}種。13種そろえる役満(あと${13 - k}種)。` : `${k} of 13 terminal/honor kinds. Collect all 13 for yakuman (${13 - k} more).`);
    }

    // riichi (always for closed hands)
    if (closed && melds.every((m) => m.kind === 'ankan') && shanten <= 1 && v.riichi[me] === 0) add(4, 'riichi', ja ? 'リーチ' : 'Riichi', ja ? '門前を保てば、聴牌でリーチ(1翻+一発・裏ドラのチャンス)。鳴かないのがコツ。' : 'Stay closed: declare riichi at tenpai (1 han + ippatsu/ura chances). Avoid calling.');

    // dora info
    const doraTypes = v.dora.map((d) => C.doraFromIndicator(d.t, v.n === 3));
    let nd = 0; for (const t of doraTypes) nd += all[t];
    let aka = hand.filter((x) => x.red).length; for (const m of melds) for (const o of m.objs) if (o.red) aka++;
    if (nd + aka + v.nuki[me].length > 0) add(1, 'dora', ja ? 'ドラ' : 'Dora', ja ? `手の中にドラ${nd}枚・赤${aka}枚${v.nuki[me].length ? '・抜き' + v.nuki[me].length + '枚' : ''}(1枚1翻)。役がないと和了れないので注意。` : `Dora ${nd}, red ${aka}${v.nuki[me].length ? ', nuki ' + v.nuki[me].length : ''} (1 han each). You still need a yaku to win.`, true);

    // dedupe by id (keep best), sort
    const best = new Map();
    for (const t of tips) { const o = best.get(t.id); if (!o || t.score > o.score) best.set(t.id, t); }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /* ---- main analysis ---- */
  function analyze(v, lang) {
    const me = v.seat;
    const rem = remainOf(v);
    const mc = v.melds[me].length;
    const counts = C.toCounts(v.hand);
    const aka = v.hand.filter((x) => x.red).length;
    const drew = v.hand.length % 3 === 2;
    const out = { rem, drew, shanten: C.shanten(counts, mc), waits: null, recs: [], recIds: new Set(), tips: [] };

    if (drew) {
      const seen = new Set();
      const list = [];
      for (const x of v.hand) {
        if (seen.has(x.t)) continue; seen.add(x.t);
        counts[x.t]--;
        const sh = C.shanten(counts, mc);
        const uke = C.ukeire(counts, mc, rem).total;
        let w = null;
        if (sh === 0) w = waitsInfo(v, counts, mc, rem, aka - (x.red ? 1 : 0));
        counts[x.t]++;
        list.push({ t: x.t, sh, uke: sh === 0 ? w.total : uke, waits: w });
      }
      list.sort((a, b) => a.sh - b.sh || b.uke - a.uke);
      out.shanten = list.length ? list[0].sh : out.shanten;
      out.recs = list.slice(0, 4);
      if (!(v.riichi[me] > 0) && list.length) {
        const top = list[0];
        for (const r of list) if (r.sh === top.sh && r.uke >= top.uke * 0.92) for (const x of v.hand) if (x.t === r.t) out.recIds.add(x.id);
      }
      // can we already win?
      if (v.actions && v.actions.tsumo) out.canTsumo = true;
    } else if (v.hand.length > 0) {
      out.shanten = C.shanten(counts, mc);
      if (out.shanten === 0) out.waits = waitsInfo(v, counts, mc, rem, aka);
    }
    out.tips = yakuTips(v, lang, out.shanten);
    return out;
  }

  /* ---- panel ---- */
  function fmtWin(r, ja) {
    if (!r) return null;
    return r.ym ? (ja ? '役満' : 'Yakuman') : `${r.han}${ja ? '翻' : 'h'}${r.fu}${ja ? '符' : 'f'}`;
  }

  function waitsBlock(L, ja, w) {
    const wrap = h('div', { class: 'as-waits' });
    for (const x of w.list) {
      const label = x.ron ? (ja ? 'ロン ' : 'Ron ') + fmtWin(x.ron, ja) : x.tsumo ? (ja ? 'ツモのみ ' : 'Tsumo only ') + fmtWin(x.tsumo, ja) : (ja ? '役なし' : 'No yaku');
      wrap.append(h('div', { class: 'as-wait' + (x.ron || x.tsumo ? '' : ' bad') },
        MJ.tileEl(L, { t: x.t, red: false }, { small: true }),
        h('div', { class: 'as-wt' }, h('b', {}, `${ja ? '残り' : 'Left '}${x.left}${ja ? '枚' : ''}`), h('span', {}, label))));
    }
    const warn = [];
    if (!w.anyRon && !w.anyTsumo) warn.push(ja ? '⚠ このままでは役がなく和了できません。役を足しましょう。' : '⚠ No yaku yet: you cannot win. Add a yaku.');
    else if (!w.anyRon && w.anyTsumo) warn.push(ja ? '⚠ ロンでは和了できません(ツモのみ)。' : '⚠ Ron is not possible (tsumo only).');
    if (w.furiten) warn.push(ja ? '⚠ フリテン:待ち牌を自分で捨てているのでロンできません。' : '⚠ Furiten: you discarded a winning tile, so no ron.');
    return h('div', {}, wrap, warn.map((t) => h('p', { class: 'as-warn' }, t)));
  }

  function remainGrid(L, rem, ja) {
    const g = h('div', { class: 'rmgrid' });
    const rows = [[0, 9], [9, 18], [18, 27], [27, 34]];
    for (const [a, b] of rows) {
      const row = h('div', { class: 'rmrow' + (b - a === 7 ? ' h' : '') });
      for (let t = a; t < b; t++) {
        const n = rem[t];
        row.append(h('div', { class: 'rm c' + Math.min(n, 4) }, MJ.tileEl(L, { t, red: false }, { small: true }), h('span', {}, String(n))));
      }
      g.append(row);
    }
    return g;
  }

  function panel(L, lang, A, v) {
    const ja = lang === 'ja';
    const T = (a, b) => (ja ? a : b);
    const box = h('div', { class: 'assist' });
    box.append(h('div', { class: 'as-head' }, h('b', {}, '🎓 ' + T('アシスト', 'Assist')), h('small', {}, T('目安です(公式判定ではありません)', 'Guidance only'))));

    // status
    const st = A.shanten <= -1 ? T('和了形です!', 'Complete hand!') : A.shanten === 0 ? T('テンパイ', 'Tenpai') : T(`あと${A.shanten}枚で聴牌(${A.shanten}向聴)`, `${A.shanten}-shanten`);
    box.append(h('div', { class: 'as-sec' }, h('div', { class: 'as-t' }, T('いまの手', 'Your hand')), h('p', { class: 'as-big' + (A.shanten <= 0 ? ' ok' : '') }, st)));

    if (A.canTsumo) box.append(h('p', { class: 'as-warn ok' }, T('✅ ツモ和了できます!', '✅ You can tsumo!')));

    // waits (13 tiles)
    if (A.waits) box.append(h('div', { class: 'as-sec' }, h('div', { class: 'as-t' }, T('待ち牌(上がり牌)', 'Winning tiles')), waitsBlock(L, ja, A.waits)));

    // discard advice (14 tiles)
    if (A.drew && A.recs.length && !(v.riichi[v.seat] > 0)) {
      const sec = h('div', { class: 'as-sec' }, h('div', { class: 'as-t' }, T('おすすめの打牌(手牌の金枠)', 'Suggested discards (gold outline)')));
      A.recs.forEach((r, i) => {
        const line = r.sh === 0
          ? T(`聴牌 / 待ち${r.uke}枚`, `Tenpai / ${r.uke} outs`)
          : T(`${r.sh}向聴 / 受け入れ${r.uke}枚`, `${r.sh}-shanten / ${r.uke} outs`);
        const row = h('div', { class: 'as-rec' + (i === 0 ? ' top' : '') }, MJ.tileEl(L, { t: r.t, red: false }, { small: true }), h('div', {}, h('b', {}, T('切る → ', 'Discard → ') + tname(r.t, ja)), h('span', {}, line)));
        if (r.waits) {
          const w = r.waits;
          const note = !w.anyRon && !w.anyTsumo ? T('(役なし注意)', '(no yaku!)') : !w.anyRon ? T('(ツモのみ)', '(tsumo only)') : '';
          row.querySelector('span').textContent += ' ' + w.list.map((x) => tname(x.t, ja)).join('・') + ' ' + note;
        }
        sec.append(row);
      });
      box.append(sec);
    }

    // yaku tips
    const sec = h('div', { class: 'as-sec' }, h('div', { class: 'as-t' }, T('狙える役・作り方', 'Yaku you can aim for')));
    if (!A.tips.length) sec.append(h('p', { class: 'as-p' }, T('いまは目立つ役の形がありません。まずは牌効率(受け入れの多い形)を優先しましょう。', 'No obvious yaku shape yet. Focus on tile efficiency first.')));
    for (const t of A.tips) sec.append(h('div', { class: 'as-tip' + (t.done ? ' done' : '') }, h('b', {}, (t.done ? '✓ ' : '') + t.title), h('p', {}, t.text)));
    box.append(sec);

    // remaining tiles
    box.append(h('div', { class: 'as-sec' }, h('div', { class: 'as-t' }, T('残り牌(まだ見えていない枚数)', 'Tiles left (not yet seen)')), remainGrid(L, A.rem, ja),
      h('p', { class: 'as-p small' }, T('自分の手牌・捨て牌・鳴き・ドラ表示牌を引いた数です。他家の手の中にあるかもしれません。', 'Counts what you can see: your hand, discards, melds, dora indicators. They may be in opponents’ hands.'))));
    return box;
  }

  MJ.assist = { analyze, panel };
})();
