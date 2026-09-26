'use strict';
/* ================= МУЛЬТИПЛЕЕР: LAN без сервера =================
   - Локальный режим: BroadcastChannel (две вкладки одного браузера, для теста)
   - LAN: WebRTC. Звёздная топология: каждый игрок соединяется с хостом
     (копируешь код), хост ретранслирует пакеты. Сигналинг — copy/paste,
     серверов нет вообще. ICE-кандидаты собираются до обмена (LAN, без STUN).
   Мир детерминированный: сид передаётся хостом, все получают один город. */

const Net = {
  on: false,
  mode: null,            // 'bc' | 'webrtc'
  id: (Math.random() * 1e9) | 0,
  name: 'Игрок',
  isHost: false,
  bc: null,
  pcs: [],               // {pc, dc}
  remotes: new Map(),    // id -> {x, z, a, car, buf, last}
  lastSend: 0,
  _seedTimer: 0,
  _joined: false,

  /* ---------- локальный режим ---------- */
  startLocal(name) {
    this.name = name || 'Игрок';
    if (this.bc) this.bc.close();
    this.bc = new BroadcastChannel('liberty-state-local');
    this.bc.onmessage = e => { try { this.recv(JSON.parse(e.data), null); } catch (_) {} };
    this.mode = 'bc';
    this.on = true;
    this.isHost = false;
    UI.netStatus('Локальный режим: открой игру во второй вкладке');
  },
  stopLocal() { if (this.bc) { this.bc.close(); this.bc = null; } },

  /* ---------- WebRTC ---------- */
  waitIce(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const to = setTimeout(res, 3500);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(to); res(); }
      };
    });
  },
  _encode(desc) { return btoa(unescape(encodeURIComponent(JSON.stringify(desc)))); },
  _decode(blob) {
    let s = String(blob).trim();
    try { s = decodeURIComponent(escape(atob(s))); } catch (e) { /* уже JSON */ }
    return JSON.parse(s);
  },
  _onDc(slot, dc) {
    slot.dc = dc;
    dc.onopen = () => {
      if (this.isHost) this.send({ t: 'init', seed: World.seed, name: this.name });
      else this.send({ t: 'join', name: this.name });
    };
    dc.onmessage = e => { try { this.recv(JSON.parse(e.data), slot); } catch (_) {} };
    dc.onclose = () => this._dropPc(slot);
  },
  _dropPc(slot) {
    const i = this.pcs.indexOf(slot);
    if (i >= 0) this.pcs.splice(i, 1);
    UI.netStatus('Соединений с хостом: ' + this.pcs.length);
  },

  // Хост: создать слот, вернуть OFFER-код
  async hostOffer() {
    if (!window.RTCPeerConnection) throw new Error('WebRTC не поддерживается');
    const pc = new RTCPeerConnection();
    const slot = { pc, dc: null };
    const dc = pc.createDataChannel('game');
    this._onDc(slot, dc);
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this._dropPc(slot);
    };
    this.pcs.push(slot);
    this.isHost = true;
    this.mode = 'webrtc';
    this.on = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitIce(pc);
    return this._encode(pc.localDescription);
  },
  // Хост: применить ANSWER от нового игрока
  async hostAddPeer(answerBlob) {
    const slot = this.pcs[this.pcs.length - 1];
    if (!slot) throw new Error('Сначала создай сессию');
    await slot.pc.setRemoteDescription(this._decode(answerBlob));
    UI.netStatus('Игрок подключён. Создай новый слот для следующего.');
  },
  // Джойнер: применить OFFER от хоста, вернуть ANSWER-код
  async joinOffer(offerBlob) {
    if (!window.RTCPeerConnection) throw new Error('WebRTC не поддерживается');
    const pc = new RTCPeerConnection();
    const slot = { pc, dc: null };
    pc.ondatachannel = e => this._onDc(slot, e.channel);
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this._dropPc(slot);
    };
    this.pcs.push(slot);
    this.isHost = false;
    this.mode = 'webrtc';
    this.on = true;
    await pc.setRemoteDescription(this._decode(offerBlob));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await this.waitIce(pc);
    UI.netStatus('Скопируй ANSWER-код и отправь его хосту.');
    return this._encode(pc.localDescription);
  },

  get online() { return this.on ? 1 + this.remotes.size : 0; },

  send(obj) {
    if (!this.on) return;
    const msg = JSON.stringify(Object.assign({ id: this.id }, obj));
    if (this.mode === 'bc' && this.bc) this.bc.postMessage(JSON.parse(msg));
    if (this.mode === 'webrtc')
      for (const s of this.pcs)
        if (s.dc && s.dc.readyState === 'open') s.dc.send(msg);
  },

  recv(msg, slot) {
    if (!msg || msg.id === this.id) return;
    // ретрансляция звёздной топологии (хост пересылает чужие пакеты остальным)
    if (this.mode === 'webrtc') {
      for (const s of this.pcs) {
        if (s === slot) continue;
        if (s.dc && s.dc.readyState === 'open') s.dc.send(JSON.stringify(msg));
      }
    }
    switch (msg.t) {
      case 'seed':
      case 'hello':
        // локальный режим: сходимся к минимальному сиду (детерминированно)
        if (this.mode === 'bc' && msg.seed != null && msg.seed !== World.seed && msg.seed < World.seed)
          Game.reseedWorld(msg.seed);
        break;
      case 'init':
        // webrtc: хост авторитетен
        if (msg.seed != null && msg.seed !== World.seed) Game.reseedWorld(msg.seed);
        if (!this._joined) { this._joined = true; UI.netStatus('Подключено к хосту!'); }
        break;
      case 'st': this._upsertRemote(msg); break;
      case 'sh': this._remoteShot(msg); break;
      case 'bm': this._remoteBoom(msg); break;
      case 'bye': this.remotes.delete(msg.id); break;
    }
  },

  _upsertRemote(m) {
    let r = this.remotes.get(m.id);
    if (!r) {
      r = { id: m.id, x: m.x, z: m.z, a: m.a, car: null, buf: [], last: performance.now() };
      this.remotes.set(m.id, r);
    }
    r.last = performance.now();
    r.x = m.x; r.z = m.z; r.a = m.a; r.car = m.car || null;
    r.buf.push({ t: performance.now(), x: m.x, z: m.z, a: m.a, car: m.car });
    if (r.buf.length > 8) r.buf.shift();
  },

  _remoteShot(m) {
    City3D.spark(m.x, 1.1, m.z, Math.sin(m.a) * 4, 2, Math.cos(m.a) * 4, 0.08, 1, 0.9, 0.5);
    if (dist(m.x, m.z, Player.x, Player.z) < 40) AudioSys.shot();
  },

  _remoteBoom(m) {
    // эффекты + урон, но без повторной отправки (нет пинг-понга)
    City3D.addShake(1);
    AudioSys.explosion();
    City3D.addDecal(m.x, m.z, 3, 0x141414);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU, s = rand(4, 14);
      City3D.spark(m.x, 0.6, m.z, Math.sin(a) * s, rand(3, 9), Math.cos(a) * s, rand(0.3, 0.7), 1, rand(0.4, 0.8), 0.1);
    }
    for (let i = 0; i < 10; i++)
      City3D.puff(m.x + rand(-1, 1), 0.8, m.z + rand(-1, 1), 0, rand(1, 3), 0, 1.5, 0.2, 0.2, 0.2, 1);
    const dP = dist(m.x, m.z, Player.x, Player.z);
    if (dP < 8) {
      if (Player.alive && !Player.inCar) Player.damage(75 * (1 - dP / 8), 'boom');
      if (Player.inCar) damageCar(Player.inCar, 90 * (1 - dP / 8));
      for (let i = Cars.list.length - 1; i >= 0; i--) {
        const c = Cars.list[i];
        const d = dist(m.x, m.z, c.x, c.z);
        if (d < 8) damageCar(c, 95 * (1 - d / 8));
      }
    }
  },

  /* отправка своего состояния, 15 Гц */
  tick() {
    if (!this.on) return;
    const now = performance.now();
    // локальный режим: периодический обмен сидом
    if (this.mode === 'bc') {
      this._seedTimer -= 1;
      if (this._seedTimer <= 0) { this._seedTimer = 30; this.send({ t: 'seed', seed: World.seed }); }
    }
    if (now - this.lastSend < 66) return;
    this.lastSend = now;
    const st = { t: 'st', x: Player.x, z: Player.z, a: Player.angle };
    if (Player.inCar) {
      const c = Player.inCar;
      st.car = { x: c.x, z: c.z, a: c.angle, type: c.type, paint: c.group.userData.paint, hp: c.health };
    }
    this.send(st);
  },

  stop() {
    this.send({ t: 'bye' });
    if (this.bc) { this.bc.close(); this.bc = null; }
    for (const s of this.pcs) { try { s.dc && s.dc.close(); s.pc.close(); } catch (_) {} }
    this.pcs = [];
    this.remotes.clear();
    this.on = false; this.mode = null; this.isHost = false;
  }
};
