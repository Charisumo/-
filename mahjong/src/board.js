/* Board rendering from a per-seat "view" object (see Room.viewFor) */
(function () {
  const MJ = globalThis.MJ;
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  MJ.h = h;

  function tileEl(L, tile, opts) {
    opts = opts || {};
    const t = tile.t;
    const suit = t < 9 ? 'man' : t < 18 ? 'pin' : t < 27 ? 'sou' : t === 31 ? 'haku' : t === 32 ? 'hatsu' : t === 33 ? 'chun' : 'wind';
    const el = h('div', { class: 'tile ' + suit + (tile.red ? ' red' : '') + (opts.small ? ' small' : '') + (opts.back ? ' back' : '') + (opts.cls ? ' ' + opts.cls : '') });
    if (!opts.back) el.innerHTML = MJ.tileFace(t, !!tile.red);
    if (opts.onclick) { el.addEventListener('click', opts.onclick); el.classList.add('click'); }
    return el;
  }
  MJ.tileEl = tileEl;

  function render(root, v, ctx) {
    const { L, send, ui } = ctx;
    const n = v.n, me = v.seat;
    const T = (tile, o) => tileEl(L, tile, o);
    const rel = (p) => (p - me + n) % n;
    const posOf = (p) => (n === 4 ? ['bottom', 'right', 'top', 'left'][rel(p)] : ['bottom', 'right', 'left'][rel(p)]);
    const act = (a) => { ui.riichiMode = false; ui.chiPick = null; ui.ponPick = null; send({ t: 'act', a }); };
    const windName = (w) => L[['E', 'S', 'W', 'N'][w - 27]];
    root.innerHTML = '';
    root.classList.toggle('assist-on', !!ctx.assistOn);
    const A = ctx.assistOn && v.hand.length ? MJ.assist.analyze(v, ctx.lang) : null;

    const board = h('div', { class: 'board p' + n });
    const dora = h('div', { class: 'dorarow' }, h('span', { class: 'lbl' }, L.dora),
      Array.from({ length: 5 }, (_, i) => i < v.revealed ? T(v.dora[i], { small: true }) : T({ t: 0 }, { small: true, back: true })));
    board.append(h('div', { class: 'center area-c' },
      h('div', { class: 'ri' }, L.round(v.roundWind, (v.idx % n) + 1)),
      h('div', { class: 'rs' }, `${L.left} ${v.wall}`),
      h('div', { class: 'rs' }, `${v.honba}${L.honba} · ${L.kyoutaku} ${Math.round(v.kyoutaku / 1000)}`),
      dora));

    for (let p = 0; p < n; p++) {
      const panel = h('div', { class: 'panel area-' + posOf(p) });
      panel.append(h('div', { class: 'tag' + (p === v.dealer ? ' dealer' : '') + (v.turn === p ? ' turn' : '') },
        h('span', { class: 'wind' }, windName(v.seatWinds[p])),
        h('b', {}, v.names[p] + (p === me && v.names[p] !== L.you ? ' ' + L.youTag : '')),
        v.human[p] ? null : h('small', {}, L['lvl' + v.levels[p]]),
        v.away && v.away[p] ? h('small', { class: 'away' }, '💤') : null,
        h('span', { class: 'sc' }, v.scores[p].toLocaleString()),
        null));
      if (v.riichi[p]) panel.append(h('span', { class: 'rch' }, '●' + L.riichi));
      const ml = h('div', { class: 'melds' });
      for (const t of v.nuki[p]) ml.append(T(t, { small: true, cls: 'nuki' }));
      for (const m of v.melds[p]) {
        const grp = h('div', { class: 'meld' });
        m.objs.forEach((o, i) => grp.append(T(o, { small: true, back: m.kind === 'ankan' && (i === 0 || i === 3), cls: o.id === m.called ? 'calledm' : '' })));
        ml.append(grp);
      }
      panel.append(ml);
      const nd = v.discards[p].length;
      const dsz = nd <= 18 ? ['6', '4.7cqw'] : nd <= 24 ? ['8', '3.6cqw'] : ['10', '2.9cqw'];
      const disc = h('div', { class: 'disc dc' + (nd <= 18 ? 1 : nd <= 24 ? 2 : 3) });
      disc.style.setProperty('--cols', dsz[0]);
      disc.style.setProperty('--tw', dsz[1]);
      v.discards[p].forEach((d) => {
        const el = T(d.tile, { small: true, cls: (d.called ? 'called ' : '') + (d.riichi ? 'rdisc' : '') });
        if (v.lastDiscard === d.tile.id) el.classList.add('last');
        disc.append(el);
      });
      panel.append(disc);
      board.append(panel);
    }

    // my hand
    const a = v.actions;
    const sorted = v.hand.slice();
    let drawn = null;
    if (a && v.drawn != null) { const i = sorted.findIndex((x) => x.id === v.drawn); if (i >= 0) drawn = sorted.splice(i, 1)[0]; }
    const okIds = a ? (ui.riichiMode ? a.riichi : a.discard) : [];
    const mk = (tile, extra) => {
      const can = okIds.includes(tile.id);
      return T(tile, { cls: (a ? (can ? 'ok ' : 'dim ') : '') + (A && A.recIds.has(tile.id) ? 'rec ' : '') + (extra || ''), onclick: can ? () => act({ t: 'discard', id: tile.id, riichi: ui.riichiMode }) : null });
    };
    const hw = h('div', { class: 'hw' }, sorted.map((x) => mk(x)));
    if (drawn) hw.append(h('div', { class: 'gap' }), mk(drawn, 'drawn'));
    board.append(h('div', { class: 'myhand' }, hw));

    root.append(h('div', { class: 'topbar' }, h('div', { class: 'tb' }, h('button', { class: 'mini', onclick: ctx.onMenu }, h('span', {}, '☰'), h('span', { class: 'tx' }, ' ' + L.menu)), h('button', { class: 'mini', onclick: () => MJ.showYaku(L, ctx.lang) }, h('span', {}, '📖'), h('span', { class: 'tx' }, ' ' + L.yakuList)), h('button', { class: 'mini' + (ctx.assistOn ? ' on' : ''), onclick: ctx.onAssist }, h('span', {}, '🎓'), h('span', { class: 'tx' }, ' ' + L.assist))), h('span', { class: 'hint' }, ctx.status || '')));
    root.append(board);

    // actions
    const bar = h('div', { class: 'actions' });
    const btn = (label, cls, fn) => bar.append(h('button', { class: 'act ' + cls, onclick: fn }, label));
    if (a) {
      if (a.tsumo) btn(L.tsumo, 'hot', () => act({ t: 'tsumo' }));
      if (a.riichi.length) btn(ui.riichiMode ? L.cancel : L.riichi, ui.riichiMode ? '' : 'warm', () => { ui.riichiMode = !ui.riichiMode; ctx.rerender(); });
      for (const t of a.ankan) btn(L.kan, '', () => act({ t: 'ankan', type: t }));
      for (const t of a.kakan) btn(L.kan + '+', '', () => act({ t: 'kakan', type: t }));
      if (a.kita) btn(L.kita, '', () => act({ t: 'kita' }));
      if (a.abort) btn(L.abort, '', () => act({ t: 'abort' }));
    }
    const cl = v.claim;
    if (cl && !cl.responded) {
      const o = cl.opts;
      if (ui.chiPick || ui.ponPick) {
        const list = ui.chiPick || ui.ponPick;
        const kind = ui.chiPick ? 'chi' : 'pon';
        bar.append(h('span', { class: 'hint' }, ui.chiPick ? L.chooseChi : L.choosePon));
        for (const ids of list) {
          const tiles = ids.map((id) => v.hand.find((x) => x.id === id));
          bar.append(h('button', { class: 'act shape', onclick: () => act({ t: kind, ids }) }, tiles.map((t) => T(t, { small: true })), T(cl.tile, { small: true })));
        }
        btn(L.cancel, '', () => { ui.chiPick = ui.ponPick = null; ctx.rerender(); });
      } else {
        if (o.ron) btn(L.ron, 'hot', () => act({ t: 'ron' }));
        if (o.kan) btn(L.kan, '', () => act({ t: 'kan' }));
        if (o.pon) btn(L.pon, 'warm', () => { if (o.pon.length > 1) { ui.ponPick = o.pon; ctx.rerender(); } else act({ t: 'pon', ids: o.pon[0] }); });
        if (o.chi) btn(L.chi, 'warm', () => { if (o.chi.length > 1) { ui.chiPick = o.chi; ctx.rerender(); } else act({ t: 'chi', ids: o.chi[0] }); });
        btn(L.pass, '', () => act({ t: 'pass' }));
      }
    }
    root.append(bar);
    if (A) root.append(MJ.assist.panel(L, ctx.lang, A, v));

    if (v.phase === 'roundEnd') root.append(resultModal(L, v, ctx, T));
    if (v.phase === 'gameEnd') root.append(finalModal(L, v, ctx));
  }

  function tilesRow(T, tiles) { return h('div', { class: 'trow' }, tiles.map((t) => T(t, { small: true }))); }

  function resultModal(L, v, ctx, T) {
    const res = v.result;
    const box = h('div', { class: 'modal' });
    const card = h('div', { class: 'mcard' });
    box.append(card);
    if (res.type === 'agari') {
      card.append(h('h2', {}, res.tsumo ? L.tsumoWin : L.ronWin));
      for (const w of res.winners) {
        const rr = w.res, pay = w.pay;
        const sec = h('div', { class: 'win' });
        sec.append(h('div', { class: 'wname' }, v.names[w.p] + (res.tsumo ? '' : ` ← ${v.names[res.loser]}${L.ronFrom}`)));
        const row = h('div', { class: 'trow' }, w.hand.slice().sort((a, b) => a.t - b.t).map((t) => T(t, { small: true })));
        for (const m of w.melds) row.append(h('div', { class: 'meld inline' }, m.objs.map((o) => T(o, { small: true }))));
        sec.append(row);
        sec.append(h('div', { class: 'trow' }, h('span', { class: 'lbl' }, res.tsumo ? L.tsumoLabel : L.ron), T(w.winTile, { small: true })));
        const ul = h('ul', { class: 'yaku' });
        for (const y of rr.yaku) ul.append(h('li', {}, h('span', {}, L.yaku[y.id]), h('b', {}, y.ym ? L.yakumanW : y.han + L.han)));
        for (const k of ['dora', 'aka', 'nuki', 'ura']) if (rr[k]) ul.append(h('li', {}, h('span', {}, L.yaku[k]), h('b', {}, rr[k] + L.han)));
        sec.append(ul);
        const lim = pay.limit ? L[pay.limit] : '';
        const head = rr.yakuman ? '' : `${rr.han}${L.han} ${rr.fu}${L.fu}`;
        let ptxt;
        if (pay.kind === 'ron') ptxt = `${pay.ron.toLocaleString()}${L.points}`;
        else if (w.p === v.dealer) ptxt = `${pay.fromEach.toLocaleString()}${L.all2}`;
        else ptxt = `${pay.fromOther.toLocaleString()} / ${pay.fromDealer.toLocaleString()}`;
        sec.append(h('div', { class: 'big' }, [head, lim, ptxt].filter(Boolean).join('  ')));
        card.append(sec);
      }
      const dr = [h('span', { class: 'lbl' }, L.dora), tilesRow(T, res.dora)];
      if (res.showUra && res.ura.length) dr.push(h('span', { class: 'lbl' }, L.ura), tilesRow(T, res.ura));
      card.append(h('div', { class: 'doras' }, dr));
    } else if (res.type === 'draw') {
      card.append(h('h2', {}, res.kind === 'nagashi' ? L.nagashi : L.draw));
      const row = h('div', { class: 'tenpai' });
      res.tenpai.forEach((t, p) => row.append(h('div', {}, v.names[p] + ': ', h('b', { class: t ? 'ten' : 'noten' }, t ? L.tenpai : L.noten))));
      card.append(row);
    } else card.append(h('h2', {}, L.abortW), h('p', {}, L.abortReason[res.reason]));

    const tbl = h('table', { class: 'scores' });
    tbl.append(h('tr', {}, h('th', {}, ''), h('th', {}, L.deltaW), h('th', {}, L.points)));
    for (let p = 0; p < v.n; p++) {
      const d = res.delta[p];
      tbl.append(h('tr', {}, h('td', {}, v.names[p]), h('td', { class: d > 0 ? 'pos' : d < 0 ? 'neg' : '' }, (d > 0 ? '+' : '') + d.toLocaleString()), h('td', {}, res.scores[p].toLocaleString())));
    }
    card.append(tbl);
    const iReady = v.ready.includes(v.seat);
    card.append(iReady ? h('p', { class: 'hint' }, L.waitOthers) : h('button', { class: 'primary', onclick: () => ctx.send({ t: 'act', a: { t: 'next' } }) }, L.next));
    return box;
  }

  function finalModal(L, v, ctx) {
    const f = v.final;
    const box = h('div', { class: 'modal' });
    const card = h('div', { class: 'mcard' });
    card.append(h('h2', {}, L.gameEnd));
    const tbl = h('table', { class: 'scores final' });
    tbl.append(h('tr', {}, h('th', {}, L.rank), h('th', {}, ''), h('th', {}, L.points), h('th', {}, L.finalPts)));
    f.order.forEach((p) => {
      const x = f.players[p];
      tbl.append(h('tr', { class: p === v.seat ? 'me' : '' }, h('td', {}, x.rank), h('td', {}, v.names[p]), h('td', {}, x.score.toLocaleString()),
        h('td', { class: x.pts >= 0 ? 'pos' : 'neg' }, (x.pts >= 0 ? '+' : '') + x.pts.toFixed(1))));
    });
    card.append(tbl);
    const row = h('div', { class: 'btnrow' });
    if (ctx.isHost) row.append(h('button', { class: 'primary', onclick: () => ctx.send({ t: 'act', a: { t: 'toLobby' } }) }, L.backLobby));
    else row.append(h('p', { class: 'hint' }, L.hostWait));
    row.append(h('button', { onclick: ctx.onLeave }, L.toTitle));
    card.append(row);
    box.append(card);
    return box;
  }

  MJ.board = { render };
})();
