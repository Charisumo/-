(function () {
  const MJ = globalThis.MJ;
  const h = MJ.h;
  const $ = (s, el) => (el || document).querySelector(s);
  const root = $('#app');

  /* ---------- persistent settings ---------- */
  let lang = (navigator.language || '').startsWith('ja') ? 'ja' : 'en';
  let name = '';
  try { lang = localStorage.getItem('mj_lang') || lang; name = localStorage.getItem('mj_name') || ''; } catch (e) {}
  const save = () => { try { localStorage.setItem('mj_lang', lang); localStorage.setItem('mj_name', name); } catch (e) {} };
  const L = () => MJ.i18n[lang];

  /* ---------- session state ---------- */
  let net = null;            // object with send(m), close()
  let mode = null;           // 'solo' | 'server' | 'browser' | 'guest'
  let local = null;          // LocalHost if mode is solo/browser
  let lobby = null, you = { seat: -1, host: false }, view = null;
  let serverInfo = null;
  let errCode = '';
  let roomCode = '';
  const inviteCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  let assistOn = false;
  try { assistOn = localStorage.getItem('mj_assist') === '1'; } catch (e) {}
  let ui = { riichiMode: false, chiPick: null, ponPick: null };
  let rtc = { invites: [], reply: '', status: '' }; // host invites / guest state

  MJ.net.detectServer().then((s) => { serverInfo = s; if (screen === 'title') renderTitle(); });
  let screen = 'title';

  function resetSession() {
    if (net) { try { net.close(); } catch (e) {} }
    net = null; mode = null; local = null; lobby = null; view = null; you = { seat: -1, host: false }; errCode = ''; roomCode = '';
    ui = { riichiMode: false, chiPick: null, ponPick: null };
    rtc = { invites: [], reply: '', status: '' };
  }

  function onMsg(m) {
    if (m.t === 'you') { you = { seat: m.seat, host: m.host }; }
    else if (m.t === 'lobby') { lobby = m.lobby; you = m.you || you; if (lobby.state === 'lobby') { view = null; } }
    else if (m.t === 'view') { view = m.view; }
    else if (m.t === 'room') { roomCode = m.code; }
    else if (m.t === 'err') { errCode = m.code; if (['full', 'started', 'noroom', 'busy'].includes(m.code)) { screen = 'joinerr'; } }
    else if (m.t === 'hello') { return; }
    route();
  }

  function route() {
    if (!net) return;
    if (screen === 'joinerr') return mode === 'server' ? renderJoinCode() : renderJoin();
    if (view && lobby && lobby.state === 'playing') { screen = 'game'; return renderGame(); }
    if (lobby) { screen = 'lobby'; return renderLobby(); }
  }

  /* ---------- title ---------- */
  function seg(items, cur, fn) {
    return h('div', { class: 'seg' }, items.map(([v, label]) => h('button', { class: v === cur ? 'on' : '', onclick: () => fn(v) }, label)));
  }

  function renderTitle() {
    screen = 'title';
    const T = L();
    root.innerHTML = '';
    const nameInput = h('input', { type: 'text', maxlength: 12, value: name, placeholder: T.you, oninput: (e) => { name = e.target.value; save(); } });
    root.append(h('div', { class: 'title' },
      h('div', { class: 'logo' }, h('span', {}, '🀄'), h('h1', {}, T.title), h('p', {}, T.subtitle)),
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('label', {}, T.language), seg([['ja', '日本語'], ['en', 'English']], lang, (v) => { lang = v; save(); renderTitle(); })),
        h('div', { class: 'row' }, h('label', {}, T.name), nameInput),
        h('button', { class: 'primary big', onclick: () => startSolo() }, '🤖 ' + T.solo),
        h('button', { class: 'big', onclick: () => MJ.showYaku(T, lang) }, '📖 ' + T.yakuList),
        serverInfo && inviteCode ? h('button', { class: 'primary big', onclick: () => joinByCode(inviteCode) }, '🔗 ' + T.joinThis(inviteCode)) : null,
        h('button', { class: 'big', onclick: () => startHost() }, '🏠 ' + T.hostRoom),
        h('button', { class: 'big', onclick: () => startJoin() }, '🔗 ' + T.joinRoom),
        h('p', { class: 'note' }, serverInfo ? '🖥 ' + T.serverMode : '🌐 ' + T.browserMode),
        h('p', { class: 'note' }, T.rulesNote))));
  }

  /* ---------- entry points ---------- */
  function startSolo() {
    resetSession();
    mode = 'solo';
    local = new MJ.net.LocalHost(onMsg);
    net = local;
    local.room.lang = lang;
    net.send({ t: 'join', name: name.trim() || L().you });
    net.send({ t: 'cfg', cfg: { lang } });
  }

  function connectServer(first) {
    let sent = false;
    net = new MJ.net.ServerClient(onMsg, (st) => { if (st === 'open' && !sent) { sent = true; first(); } });
  }

  function startHost() {
    resetSession();
    if (serverInfo) {
      mode = 'server';
      connectServer(() => net.send({ t: 'create', name: name.trim() || L().you, lang }));
      renderConnecting();
    } else {
      mode = 'browser';
      local = new MJ.net.LocalHost(onMsg);
      net = local;
      local.room.lang = lang;
      net.send({ t: 'join', name: name.trim() || L().you });
      net.send({ t: 'cfg', cfg: { lang, seats: [{}, { kind: 'human' }, { kind: 'ai', level: 2 }, { kind: 'ai', level: 2 }] } });
    }
  }

  function startJoin() {
    resetSession();
    if (serverInfo) { mode = 'server'; renderJoinCode(); }
    else { mode = 'guest'; renderJoin(); }
  }

  function joinByCode(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length !== 4) return;
    resetSession();
    mode = 'server';
    connectServer(() => net.send({ t: 'join', code, name: name.trim() || L().you }));
    renderConnecting();
  }

  function renderConnecting() {
    screen = 'connecting';
    root.innerHTML = '';
    root.append(h('div', { class: 'title' }, h('div', { class: 'card' }, h('p', {}, L().connecting), h('button', { onclick: () => leaveToTitle() }, L().toTitle))));
  }

  function renderJoinCode() {
    screen = 'joincode';
    const T = L();
    root.innerHTML = '';
    const input = h('input', { type: 'text', class: 'codeinput', maxlength: 4, autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'ABCD', value: inviteCode });
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(input.value); });
    const msg = errCode === 'noroom' ? T.errNoRoom : errCode === 'full' ? T.errFull : errCode === 'started' ? T.errStarted : errCode === 'busy' ? T.errBusy : '';
    root.append(h('div', { class: 'title' }, h('div', { class: 'card' },
      h('h2', {}, T.joinRoom),
      msg ? h('p', { class: 'neg' }, msg) : null,
      h('label', {}, T.enterCode), input,
      h('button', { class: 'primary big', onclick: () => joinByCode(input.value) }, T.joinBtn),
      h('button', { onclick: () => leaveToTitle() }, T.toTitle))));
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 50);
  }

  /* ---------- join screen (WebRTC) ---------- */
  function renderJoin() {
    screen = 'join';
    const T = L();
    root.innerHTML = '';
    const area = h('textarea', { class: 'code', rows: 5, placeholder: T.codeHere });
    const out = h('div', {});
    if (rtc.reply) out.append(replyBlock());
    const msg = errCode === 'full' ? T.errFull : errCode === 'started' ? T.errStarted : '';
    root.append(h('div', { class: 'title' }, h('div', { class: 'card' },
      h('h2', {}, T.joinRoom),
      msg ? h('p', { class: 'neg' }, msg) : null,
      h('p', { class: 'note' }, T.rtcNote),
      h('label', {}, T.rtcJoin1), area,
      h('button', { class: 'primary', onclick: async () => {
        try {
          errCode = '';
          if (net && net.close) net.close();
          net = new MJ.net.RtcGuest(onMsg, (st) => {
            rtc.status = st;
            if (st === 'open') { net.send({ t: 'join', name: name.trim() || T.you }); }
            if (st === 'closed' && screen !== 'title') { alert(L().lobbyLost); leaveToTitle(true); }
            if (screen === 'join') renderJoin();
          });
          rtc.reply = await net.accept(area.value);
          renderJoin();
        } catch (e) { alert(T.codeBad); }
      } }, T.makeReply),
      out,
      rtc.status === 'open' ? h('p', { class: 'pos' }, '✓ ' + T.connected) : null,
      h('button', { onclick: () => leaveToTitle() }, T.toTitle))));
  }

  function copyBtn(getText, label) {
    const T = L();
    return h('button', { class: 'mini', onclick: async (e) => {
      const text = getText();
      try { await navigator.clipboard.writeText(text); e.target.textContent = T.copied; return; } catch (err) { /* insecure origin (http) or denied: fall back below */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(ta);
        ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy'); ta.remove();
        if (ok) e.target.textContent = T.copied;
      } catch (err2) { /* user can long-press the text box and copy */ }
    } }, label || T.copy);
  }

  function replyBlock() {
    const T = L();
    const ta = h('textarea', { class: 'code', rows: 5, readonly: true }, rtc.reply);
    ta.value = rtc.reply;
    ta.addEventListener('focus', () => ta.select());
    return h('div', {}, h('label', {}, T.rtcJoin2), ta, copyBtn(() => rtc.reply));
  }

  /* ---------- lobby ---------- */
  function renderLobby() {
    const T = L();
    root.innerHTML = '';
    const lb = lobby;
    const isHost = you.host;
    const cfg = (c) => net.send({ t: 'cfg', cfg: c });
    const seatsCfg = (i, val) => { const arr = lb.seats.map(() => ({})); arr[i] = val; cfg({ seats: arr }); };
    const rows = lb.seats.map((s, i) => {
      const label = i === you.seat ? T.you : T.seat + ' ' + (i + 1);
      let right;
      if (i === 0 || !isHost) {
        right = h('span', {}, s.kind === 'ai' ? `${T.seatAI} ${T['lvl' + s.level]}` : (s.name || T.waiting));
      } else {
        const sel = h('select', { onchange: (e) => {
          const v = e.target.value;
          seatsCfg(i, v === 'human' ? { kind: 'human' } : { kind: 'ai', level: +v });
        } },
          [1, 2, 3, 4].map((lv) => h('option', { value: lv, selected: s.kind === 'ai' && s.level === lv }, `${T.seatAI} ${T['lvl' + lv]}`)),
          mode !== 'solo' ? h('option', { value: 'human', selected: s.kind === 'human' }, T.seatOpen) : null);
        right = h('span', { class: 'seatsel' }, sel, s.kind === 'human' ? h('b', { class: s.name ? 'pos' : 'noten' }, s.name || T.waiting) : null);
      }
      return h('div', { class: 'seatrow' + (i === you.seat ? ' me' : '') }, h('span', { class: 'lab' }, label), right);
    });

    const rules = isHost ? h('div', { class: 'rules' },
      h('div', { class: 'row' }, h('label', {}, T.mode), seg([[false, T.four], [true, T.three]], lb.sanma, (v) => cfg({ sanma: v }))),
      h('div', { class: 'row' }, h('label', {}, T.length), seg([['hanchan', T.hanchan], ['tonpuu', T.tonpuu]], lb.length, (v) => cfg({ length: v }))),
      h('div', { class: 'row' }, h('label', {}, T.red), seg([[true, T.on], [false, T.off]], lb.red, (v) => cfg({ red: v }))))
      : h('p', { class: 'note' }, `${lb.sanma ? T.three : T.four} · ${lb.length === 'tonpuu' ? T.tonpuu : T.hanchan} · ${T.red}: ${lb.red ? T.on : T.off}`);

    const card = h('div', { class: 'card' }, h('h2', {}, T.lobby), rules, h('div', { class: 'seats' }, rows));

    if (mode === 'server' && roomCode) {
      if (isHost) card.append(serverBlock());
      else card.append(h('div', { class: 'conn' }, h('b', {}, T.roomCode), h('div', { class: 'bigcode' }, roomCode)));
      card.append(h('p', { class: 'note' }, T.awayNote));
    } else if (isHost && mode !== 'solo') {
      card.append(hostInviteBlock());
      card.append(h('p', { class: 'note' }, T.leftAI));
    }
    if (isHost) {
      card.append(h('button', { class: 'primary big', disabled: lb.canStart ? false : 'disabled', onclick: () => { net.send({ t: 'cfg', cfg: { lang } }); net.send({ t: 'start' }); } }, T.start));
      if (!lb.canStart) card.append(h('p', { class: 'note' }, T.needPlayers));
    } else card.append(h('p', { class: 'hint' }, T.hostWait));
    card.append(h('button', { onclick: () => leaveToTitle() }, T.leave));
    root.append(h('div', { class: 'title' }, card));
  }

  function inviteLink() {
    const isLocal = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
    const base = isLocal && serverInfo && serverInfo.addresses && serverInfo.addresses[0] ? serverInfo.addresses[0] : location.origin;
    return base + '/?room=' + roomCode;
  }

  function serverBlock() {
    const T = L();
    const link = inviteLink();
    const wrap = h('div', { class: 'conn' },
      h('b', {}, T.roomCode), h('div', { class: 'bigcode' }, roomCode),
      h('div', { class: 'addr small' }, link),
      h('div', { class: 'btnrow' },
        navigator.share ? h('button', { class: 'warm', onclick: () => navigator.share({ title: T.title, text: T.shareText(roomCode), url: link }).catch(() => {}) }, '📤 ' + T.share) : null,
        copyBtn(() => link, T.copyLink)),
      h('p', { class: 'note' }, T.inviteHint));
    return wrap;
  }

  function hostInviteBlock() {
    const T = L();
    const wrap = h('div', { class: 'conn' }, h('b', {}, T.addFriend), h('p', { class: 'note' }, T.rtcNote));
    const list = h('div', {});
    const addBtn = h('button', { class: 'warm', onclick: async () => {
      addBtn.disabled = true; addBtn.textContent = T.connecting;
      try {
        const inv = await local.invite((st) => { inv.state = st; if (screen === 'lobby') updateInvites(); });
        rtc.invites.push(inv);
        updateInvites();
      } catch (e) { alert(String(e.message || e)); }
      addBtn.disabled = false; addBtn.textContent = '＋ ' + T.addFriend;
    } }, '＋ ' + T.addFriend);
    wrap.append(addBtn, list);
    function updateInvites() {
      list.innerHTML = '';
      rtc.invites.forEach((inv) => {
        const ta = h('textarea', { class: 'code', rows: 4, readonly: true });
        ta.value = inv.code;
        ta.addEventListener('focus', () => ta.select());
        const reply = h('textarea', { class: 'code', rows: 3, placeholder: T.codeHere });
        const row = h('div', { class: 'invite' },
          h('label', {}, T.rtcHost1), ta, copyBtn(() => inv.code),
          inv.state === 'open' ? h('p', { class: 'pos' }, '✓ ' + T.connected) : h('div', {},
            h('label', {}, T.rtcHost2), reply,
            h('button', { class: 'primary', onclick: async () => { try { await inv.accept(reply.value); } catch (e) { alert(T.codeBad); } } }, T.connect)));
        list.append(row);
      });
    }
    setTimeout(updateInvites, 0);
    return wrap;
  }

  function leaveToTitle(already) {
    if (!already) resetSession(); else { net = null; resetSession(); }
    renderTitle();
  }

  /* ---------- game ---------- */
  function renderGame() {
    const T = L();
    keepAwake();
    MJ.board.render(root, view, {
      L: T, lang, ui, isHost: you.host, assistOn,
      onAssist: () => { assistOn = !assistOn; try { localStorage.setItem('mj_assist', assistOn ? '1' : '0'); } catch (e) {} renderGame(); },
      send: (m) => net.send(m),
      rerender: renderGame,
      onMenu: () => { if (confirm(T.confirmQuit)) leaveToTitle(); },
      onLeave: () => leaveToTitle(),
      status: mode === 'solo' ? '' : (mode === 'server' ? '🖥' : '🌐'),
    });
  }

  // keep the screen awake while a game is on (iOS 16.4+/Android)
  let wake = null;
  const keepAwake = async () => {
    try { if ('wakeLock' in navigator && screen === 'game' && document.visibilityState === 'visible' && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; }
  };
  document.addEventListener('visibilitychange', keepAwake);
  const setVh = () => document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', () => setTimeout(setVh, 200));
  window.addEventListener('beforeunload', () => { try { if (net) net.close(); } catch (e) {} });
  MJ.ui = { renderTitle };
  renderTitle();
})();
