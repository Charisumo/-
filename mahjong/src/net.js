/* Transports: in-page room (solo / browser host), LAN server client, WebRTC guest */
(function () {
  const MJ = globalThis.MJ;

  function handle(room, cid, m) {
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'join': room.join(cid, m.name); break;
      case 'act': room.action(cid, m.a); break;
      case 'cfg': room.setCfg(cid, m.cfg || {}); break;
      case 'start': room.start(cid); break;
      case 'leave': room.leave(cid); break;
    }
  }

  /* ----- WebRTC code helpers ----- */
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const b64 = (u8) => btoa(String.fromCharCode.apply(null, u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  async function pack(desc) {
    const raw = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: desc.sdp }));
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const buf = new Uint8Array(await new Response(cs).arrayBuffer());
        return 'z' + b64(buf);
      } catch (e) {}
    }
    return 'p' + b64(raw);
  }
  async function unpack(code) {
    code = String(code || '').replace(/\s+/g, '');
    const kind = code[0];
    let u8 = unb64(code.slice(1));
    if (kind === 'z') {
      const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      u8 = new Uint8Array(await new Response(ds).arrayBuffer());
    } else if (kind !== 'p') throw new Error('bad code');
    const o = JSON.parse(new TextDecoder().decode(u8));
    return { type: o.t, sdp: o.s };
  }
  function gathered(pc) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 3000);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); }
      });
    });
  }

  /* ----- In-page room. Used for solo and for "browser is the host" ----- */
  class LocalHost {
    constructor(onMsg, opts) {
      this.onMsg = onMsg;
      this.guests = new Map(); // gid -> datachannel
      this.nextGuest = 1;
      this.invites = [];
      this.room = new MJ.Room((cid, m) => {
        if (cid === 'host') setTimeout(() => this.onMsg(m), 0);
        else { const dc = this.guests.get(cid); if (dc && dc.readyState === 'open') dc.send(JSON.stringify(m)); }
      }, opts);
    }
    send(m) { handle(this.room, 'host', m); }
    close() {
      handle(this.room, 'host', { t: 'leave' });
      for (const dc of this.guests.values()) try { dc.close(); } catch (e) {}
      for (const i of this.invites) try { i.pc.close(); } catch (e) {}
      clearTimeout(this.room.timer);
      this.room.state = 'closed';
    }
    // WebRTC invitation for one friend
    async invite(onState) {
      const pc = new RTCPeerConnection(ICE);
      const dc = pc.createDataChannel('mj');
      const inv = { pc, dc, gid: null };
      this.invites.push(inv);
      dc.onopen = () => {
        inv.gid = 'g' + this.nextGuest++;
        this.guests.set(inv.gid, dc);
        onState && onState('open');
      };
      dc.onmessage = (e) => { try { handle(this.room, inv.gid, JSON.parse(e.data)); } catch (err) {} };
      dc.onclose = () => { if (inv.gid) { this.guests.delete(inv.gid); handle(this.room, inv.gid, { t: 'leave' }); } onState && onState('closed'); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') onState && onState('failed'); };
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      inv.code = await pack(pc.localDescription);
      inv.accept = async (answerCode) => { await pc.setRemoteDescription(await unpack(answerCode)); };
      return inv;
    }
  }

  /* ----- WebRTC guest ----- */
  class RtcGuest {
    constructor(onMsg, onState) { this.onMsg = onMsg; this.onState = onState; this.dc = null; this.pc = null; }
    async accept(offerCode) {
      const pc = (this.pc = new RTCPeerConnection(ICE));
      pc.ondatachannel = (e) => {
        const dc = (this.dc = e.channel);
        dc.onopen = () => this.onState('open');
        dc.onclose = () => this.onState('closed');
        dc.onmessage = (ev) => { try { this.onMsg(JSON.parse(ev.data)); } catch (err) {} };
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.onState('failed'); };
      await pc.setRemoteDescription(await unpack(offerCode));
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      return pack(pc.localDescription);
    }
    send(m) { if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(m)); }
    close() { try { this.send({ t: 'leave' }); this.pc && this.pc.close(); } catch (e) {} }
  }

  /* ----- LAN server client (SSE + POST) ----- */
  class ServerClient {
    constructor(onMsg, onState) {
      this.cid = 'c' + Math.random().toString(36).slice(2, 10);
      this.onMsg = onMsg;
      this.onState = onState || (() => {});
      this.es = new EventSource('/events?cid=' + this.cid);
      this.es.onmessage = (e) => { try { this.onMsg(JSON.parse(e.data)); } catch (err) {} };
      this.es.onopen = () => this.onState('open');
      this.es.onerror = () => this.onState('error');
    }
    send(m) { fetch('/msg?cid=' + this.cid, { method: 'POST', body: JSON.stringify(m), keepalive: true }).catch(() => {}); }
    close() { this.send({ t: 'leave' }); setTimeout(() => this.es.close(), 100); }
  }

  async function detectServer() {
    try {
      if (!/^https?:$/.test(location.protocol)) return null;
      const r = await fetch('/api/info', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.server === true ? j : null;
    } catch (e) { return null; }
  }

  MJ.net = { LocalHost, RtcGuest, ServerClient, detectServer, handle };
})();
