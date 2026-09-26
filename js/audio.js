'use strict';
/* ================= Аудио (всё процедурно, WebAudio) ================= */

const AudioSys = {
  ctx: null,
  master: null,
  engineOsc: null, engineGain: null, engineFilter: null,
  sirenOsc: null, sirenGain: null, sirenLFO: null,
  skidGain: null,
  noiseBuf: null,
  muted: false,
  radioOn: false,
  radioTimer: null, radioStep: 0, radioNext: 0,

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.4;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 1;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // --- двигатель ---
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 350;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // --- сирена ---
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 700;
    this.sirenLFO = ctx.createOscillator();
    this.sirenLFO.type = 'sine';
    this.sirenLFO.frequency.value = 2.3;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 160;
    this.sirenLFO.connect(lfoG);
    lfoG.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLFO.start();

    // --- занос ---
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 850;
    bp.Q.value = 1.1;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    src.connect(bp);
    bp.connect(this.skidGain);
    this.skidGain.connect(this.master);
    src.start();
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.4;
    return this.muted;
  },

  _burst(dur, gain, filterType, freq) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + dur);
  },

  _tone(freq, dur, gain, type, slideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur);
  },

  shot() {
    this._burst(0.12, 0.5, 'highpass', 700);
    this._tone(140, 0.08, 0.3, 'square', 60);
  },
  hit() {
    this._burst(0.06, 0.25, 'bandpass', 500);
  },
  thud() {
    this._burst(0.15, 0.4, 'lowpass', 250);
    this._tone(70, 0.12, 0.3, 'sine', 40);
  },
  explosion() {
    this._burst(1.1, 1.0, 'lowpass', 220);
    this._tone(120, 0.7, 0.5, 'sawtooth', 28);
  },
  ui() { this._tone(620, 0.05, 0.15, 'square'); },
  buy() { this._tone(880, 0.07, 0.2, 'square'); this._tone(1320, 0.1, 0.15, 'square'); },
  error() { this._tone(180, 0.15, 0.2, 'square'); },
  horn() {
    this._tone(311, 0.4, 0.16, 'sawtooth');
    this._tone(392, 0.4, 0.16, 'sawtooth');
  },
  jingle() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => {
      setTimeout(() => this._tone(n, 0.14, 0.2, 'square'), i * 110);
    });
  },
  fail() {
    const notes = [400, 330, 262, 196];
    notes.forEach((n, i) => {
      setTimeout(() => this._tone(n, 0.16, 0.2, 'square'), i * 130);
    });
  },

  setEngine(on, speed01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.1 : 0, t, 0.05);
    this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 150, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.05);
  },
  setSiren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.05, this.ctx.currentTime, 0.1);
  },
  setSkid(level) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.12, this.ctx.currentTime, 0.04);
  },

  /* ---------- Радио: простой генеративный чиптюн-луп ---------- */
  radio(on) {
    this.radioOn = !!on;
    if (on) {
      if (!this.ctx) return;
      this.radioStep = 0;
      this.radioNext = this.ctx.currentTime + 0.1;
      this.radioTimer = setInterval(() => this._radioTick(), 120);
    } else {
      clearInterval(this.radioTimer);
      this.radioTimer = null;
    }
  },
  _radioTick() {
    if (!this.ctx || !this.radioOn) return;
    const bpm = 132, stepDur = 60 / bpm / 2; // 8-е доли
    const bass = [110, 110, 0, 110, 87, 0, 87, 110, 98, 0, 98, 110, 131, 0, 131, 98];
    const lead = [440, 0, 523, 440, 0, 392, 0, 440, 494, 0, 587, 494, 0, 523, 659, 0];
    while (this.radioNext < this.ctx.currentTime + 0.4) {
      const s = this.radioStep % 16;
      const t = this.radioNext;
      if (bass[s]) this._schedNote(bass[s], t, stepDur * 0.9, 0.12, 'square', 1200);
      if (lead[s]) this._schedNote(lead[s], t, stepDur * 0.85, 0.07, 'triangle', 3500);
      this.radioNext += stepDur;
      this.radioStep++;
    }
  },
  _schedNote(freq, t, dur, gain, type, lp) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
};
