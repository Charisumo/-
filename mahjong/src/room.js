/* Room: runs one table. Transport-agnostic (Node server, WebRTC host, or in-page solo). */
(function () {
  const MJ = (globalThis.MJ = globalThis.MJ || {});
  const Game = MJ.Game || require('./game.js');
  const AI = MJ.ai || require('./ai.js');

  const AI_NAMES = [
    ['はるか', 'けんた', 'みお', 'りく'], ['さくら', 'そうた', 'ゆうき', 'あおい'], ['たくみ', 'なな', 'かいと', 'ひなた'],
  ];
  const AI_NAMES_EN = [
    ['Hana', 'Ken', 'Mio', 'Riku'], ['Sakura', 'Sota', 'Yuki', 'Aoi'], ['Taku', 'Nana', 'Kai', 'Hinata'],
  ];

  class Room {
    // send(cid, msg) delivers a message object to a client
    constructor(send, opts) {
      this.send = send;
      this.opts = opts || {};
      this.clients = new Map(); // cid -> {name, seat, host}
      this.cfg = { sanma: false, length: 'hanchan', red: true, seats: [{ kind: 'human' }, { kind: 'ai', level: 2 }, { kind: 'ai', level: 2 }, { kind: 'ai', level: 2 }] };
      this.state = 'lobby';
      this.game = null;
      this.timer = null;
      this.ready = new Set();
      this.away = new Set();
      this.names = [];
      this.aiLevels = [];
      this.lang = 'ja';
    }

    get n() { return this.cfg.sanma ? 3 : 4; }
    get hostCid() { for (const [cid, c] of this.clients) if (c.host) return cid; return null; }

    /* ---------- lobby ---------- */
    join(cid, name) {
      if (this.clients.has(cid)) return;
      name = (String(name || '').trim() || 'Player').slice(0, 12);
      const used = new Set([...this.clients.values()].map((c) => c.name));
      let nm = name, k = 2;
      while (used.has(nm)) nm = name + k++;
      const isFirst = this.clients.size === 0;
      const c = { name: nm, seat: -1, host: isFirst };
      if (this.state === 'lobby') {
        c.seat = this.freeSeat();
        if (c.seat < 0 && !isFirst) { this.send(cid, { t: 'err', code: 'full' }); return; }
        if (isFirst) c.seat = 0;
      } else {
        // game in progress: take over a vacated seat (marked as ai) if any
        const s = this.vacantSeat();
        if (s < 0) { this.send(cid, { t: 'err', code: 'started' }); return; }
        c.seat = s;
        this.takeSeat(s, nm);
      }
      this.clients.set(cid, c);
      this.send(cid, { t: 'you', seat: c.seat, host: c.host });
      this.broadcast();
      if (this.state === 'playing') this.pump(100);
    }

    freeSeat() {
      const taken = new Set([...this.clients.values()].map((c) => c.seat));
      for (let i = 0; i < this.n; i++) if (this.cfg.seats[i].kind === 'human' && !taken.has(i)) return i;
      return -1;
    }

    vacantSeat() {
      if (!this.game) return -1;
      const taken = new Set([...this.clients.values()].map((c) => c.seat));
      for (let i = 0; i < this.n; i++) if (this.humanSeat[i] === 'vacant' && !taken.has(i)) return i;
      return -1;
    }

    takeSeat(s, name) {
      this.humanSeat[s] = 'human';
      this.names[s] = name;
      this.game.names[s] = name;
      this.aiLevels[s] = 0;
    }

    leave(cid) {
      const c = this.clients.get(cid);
      if (!c) return;
      this.clients.delete(cid);
      if (this.state === 'playing') {
        if (c.seat >= 0) {
          this.humanSeat[c.seat] = 'vacant';
          this.aiLevels[c.seat] = 2;
          this.ready.delete(c.seat);
          this.away.delete(c.seat);
        }
        if (c.host) {
          const next = this.clients.keys().next();
          if (!next.done) { this.clients.get(next.value).host = true; this.send(next.value, { t: 'you', seat: this.clients.get(next.value).seat, host: true }); }
        }
        if (this.clients.size === 0) { clearTimeout(this.timer); this.state = 'closed'; return; }
        this.broadcast();
        this.pump(100);
      } else {
        if (c.host) {
          const next = this.clients.keys().next();
          if (!next.done) { const nc = this.clients.get(next.value); nc.host = true; this.send(next.value, { t: 'you', seat: nc.seat, host: true }); }
        }
        this.broadcast();
      }
    }

    setCfg(cid, cfg) {
      const c = this.clients.get(cid);
      if (!c || !c.host || this.state !== 'lobby') return;
      const old = this.cfg;
      const sanma = cfg.sanma !== undefined ? !!cfg.sanma : old.sanma;
      const occupied = new Set([...this.clients.values()].map((x) => x.seat));
      if (sanma !== old.sanma && sanma && [...occupied].some((s) => s >= 3)) return;
      const next = {
        sanma,
        length: cfg.length === 'tonpuu' ? 'tonpuu' : cfg.length === 'hanchan' ? 'hanchan' : old.length,
        red: cfg.red !== undefined ? !!cfg.red : old.red,
        seats: old.seats.map((s) => Object.assign({}, s)),
      };
      if (Array.isArray(cfg.seats)) {
        cfg.seats.forEach((s, i) => {
          if (i === 0 || i > 3 || !s) return;
          if (occupied.has(i) && s.kind !== 'human') return; // someone is sitting here
          next.seats[i] = { kind: s.kind === 'human' ? 'human' : 'ai', level: Math.min(4, Math.max(1, +s.level || 2)) };
        });
      }
      if (cfg.lang) this.lang = cfg.lang === 'en' ? 'en' : 'ja';
      this.cfg = next;
      this.broadcast();
    }

    lobbyInfo() {
      const seats = [];
      for (let i = 0; i < this.n; i++) {
        const cl = [...this.clients.values()].find((c) => c.seat === i);
        seats.push({ kind: this.cfg.seats[i].kind, level: this.cfg.seats[i].level || 2, name: cl ? cl.name : null });
      }
      return { state: this.state, sanma: this.cfg.sanma, length: this.cfg.length, red: this.cfg.red, seats, canStart: seats.every((s) => s.kind === 'ai' || s.name) };
    }

    start(cid) {
      const c = this.clients.get(cid);
      if (!c || !c.host || this.state !== 'lobby') return;
      const info = this.lobbyInfo();
      if (!info.canStart) return;
      const n = this.n;
      const nm = this.lang === 'en' ? AI_NAMES_EN : AI_NAMES;
      const pick = nm[Math.floor(Math.random() * nm.length)];
      this.names = [];
      this.aiLevels = [];
      this.humanSeat = [];
      for (let i = 0; i < n; i++) {
        const cl = [...this.clients.values()].find((x) => x.seat === i);
        if (this.cfg.seats[i].kind === 'human' && cl) {
          this.names.push(cl.name); this.aiLevels.push(0); this.humanSeat.push('human');
        } else {
          this.names.push(pick[i]); this.aiLevels.push(this.cfg.seats[i].level || 2); this.humanSeat.push('ai');
        }
      }
      this.game = new Game({ sanma: this.cfg.sanma, length: this.cfg.length, red: this.cfg.red, names: this.names.slice() });
      this.state = 'playing';
      this.ready = new Set();
      this.away = new Set();
      this.broadcast();
      this.pump(600);
    }

    /* ---------- actions from clients ---------- */
    action(cid, a) {
      const c = this.clients.get(cid);
      if (!c || !a) return;
      if (a.t === 'toLobby') {
        if (c.host && this.game && this.game.over) {
          clearTimeout(this.timer);
          this.state = 'lobby'; this.game = null;
          // vacated seats become ai; keep connected clients on their seats
          this.broadcast();
        }
        return;
      }
      if (this.state !== 'playing' || c.seat < 0) return;
      const g = this.game;
      try {
        if (a.t === 'next') {
          if (g.pending.kind !== 'roundEnd') return;
          this.ready.add(c.seat);
          if (this.allReady()) { this.ready = new Set(); g.act(0, { t: 'next' }); }
          this.broadcast();
          this.pump(500);
          return;
        }
        g.act(c.seat, a);
      } catch (e) {
        this.send(cid, { t: 'err', code: 'illegal', msg: String(e.message) });
        this.sendView(cid);
        return;
      }
      this.broadcast();
      this.pump(a.t === 'discard' ? 350 : 300);
    }

    // a client lost its connection (e.g. iPhone switched apps): an AI plays for the seat until it returns
    setAway(cid, away) {
      const c = this.clients.get(cid);
      if (!c || c.seat < 0 || this.state !== 'playing') return;
      const had = this.away.has(c.seat);
      if (away) this.away.add(c.seat); else this.away.delete(c.seat);
      if (had !== !!away) { this.broadcast(); this.pump(150); }
    }

    controlled(p) { return this.humanSeat[p] === 'human' && !this.away.has(p); }

    allReady() {
      for (let i = 0; i < this.n; i++) if (this.controlled(i) && !this.ready.has(i)) return false;
      return true;
    }

    /* ---------- AI / flow ---------- */
    pump(delay) {
      clearTimeout(this.timer);
      if (this.state !== 'playing') return;
      const sp = this.opts.speed === undefined ? 1 : this.opts.speed;
      this.timer = setTimeout(() => this.step(), (delay === undefined ? 400 : delay) * sp);
    }

    step() {
      if (this.state !== 'playing') return;
      const g = this.game;
      const pd = g.pending;
      if (pd.kind === 'discard') {
        const p = pd.p;
        if (!this.controlled(p)) {
          g.act(p, AI.decide(g, p, this.aiLevels[p] || 2));
          this.broadcast();
          return this.pump(450);
        }
        // human in riichi with nothing to decide: auto tsumogiri
        const a = g.getActions(p);
        const special = a.tsumo || a.ankan.length || a.kakan.length || a.kita || a.abort || a.riichi.length;
        if (g.r.riichi[p] > 0 && !special) {
          g.act(p, { t: 'discard', id: g.r.drawn.id });
          this.broadcast();
          return this.pump(700);
        }
        return;
      }
      if (pd.kind === 'claim') {
        let waiting = false;
        for (const q of Object.keys(pd.opts).map(Number)) {
          if (pd.responses[q]) continue;
          if (this.controlled(q)) { waiting = true; continue; }
          g.act(q, AI.decideClaim(g, q, this.aiLevels[q] || 2));
          if (g.pending !== pd) break;
        }
        this.broadcast();
        if (g.pending === pd && waiting) return;
        return this.pump(300);
      }
      if (pd.kind === 'roundEnd') {
        // auto-ready for vacated/ai seats is implicit; humans must confirm
        if (this.allReady()) { this.ready = new Set(); g.act(0, { t: 'next' }); this.broadcast(); this.pump(500); }
      }
    }

    /* ---------- views ---------- */
    viewFor(seat) {
      const g = this.game, r = g.r, n = g.n, pd = g.pending;
      const v = {
        n, seat, names: this.names.slice(), levels: this.aiLevels.slice(),
        human: this.humanSeat.map((x) => x === 'human'),
        away: Array.from({ length: n }, (_, i) => this.away.has(i)),
        scores: g.scores.slice(), dealer: r.dealer, idx: g.idx,
        seatWinds: Array.from({ length: n }, (_, p) => g.seatWind(p)), roundWind: g.roundWind(),
        honba: g.honba, kyoutaku: g.kyoutaku, wall: r.wall.length, revealed: r.revealed, dora: r.doraInd.slice(0, r.revealed),
        discards: r.discards, nuki: r.nuki, riichi: r.riichi.slice(),
        melds: r.melds.map((ms) => ms.map((m) => ({ kind: m.kind, t: m.t, objs: m.objs, called: m.called, from: m.from }))),
        handCount: r.hands.map((h) => h.length),
        hand: seat >= 0 ? r.hands[seat] : [],
        drawn: seat >= 0 && pd.kind === 'discard' && pd.p === seat && r.drawn ? r.drawn.id : null,
        lastDiscard: r.lastDiscard && pd.kind !== 'roundEnd' ? r.lastDiscard.tile.id : null,
        turn: pd.kind === 'discard' ? pd.p : -1, phase: pd.kind,
        actions: seat >= 0 && pd.kind === 'discard' && pd.p === seat ? g.getActions(seat) : null,
        claim: seat >= 0 && pd.kind === 'claim' && pd.opts[seat] ? { opts: pd.opts[seat], tile: pd.tile, from: pd.p, responded: !!pd.responses[seat] } : null,
        result: pd.kind === 'roundEnd' ? pd.result : null,
        ready: pd.kind === 'roundEnd' ? [...this.ready] : [],
        final: pd.kind === 'gameEnd' ? pd.final : null,
      };
      return v;
    }

    sendView(cid) {
      const c = this.clients.get(cid);
      if (!c || !this.game) return;
      this.send(cid, { t: 'view', view: this.viewFor(c.seat) });
    }

    broadcast() {
      for (const [cid, c] of this.clients) {
        this.send(cid, { t: 'lobby', lobby: this.lobbyInfo(), you: { seat: c.seat, host: c.host } });
        if (this.state === 'playing' && this.game) this.send(cid, { t: 'view', view: this.viewFor(c.seat) });
      }
    }
  }

  MJ.Room = Room;
  if (typeof module !== 'undefined') module.exports = Room;
})();
