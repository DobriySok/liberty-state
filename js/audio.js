'use strict';
/* ================= ЗВУК: настоящая музыка (файлы CC-BY/CC0) + SFX WebAudio ================= */

const AudioSys = {
  ctx: null, musicOn: true, sfxOn: true,
  tracks: ['assets/music/Funkorama.mp3', 'assets/music/Local Forecast - Elevator.mp3'],
  ti: 0, music: null, engineOsc: null, engineGain: null,

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  playTrack(i) {
    if (!this.musicOn) return;
    if (this.music) { this.music.pause(); }
    this.ti = i % this.tracks.length;
    this.music = new Audio(this.tracks[this.ti]);
    this.music.volume = 0.45;
    this.music.loop = true;
    this.music.play().catch(() => {});
    HUD.toast('Радио: ' + (this.ti === 0 ? 'Funkorama' : 'Elevator') + ' (Kevin MacLeod, CC-BY)');
  },
  radioToggle() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this.playTrack(this.ti);
    else if (this.music) this.music.pause();
    HUD.toast(this.musicOn ? 'Радио ВКЛ' : 'Радио ВЫКЛ');
  },
  next() { if (this.musicOn) this.playTrack(this.ti + 1); },

  _osc(type, f0, f1, t, vol, decay) {
    if (!this.ctx || !this.sfxOn) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), this.ctx.currentTime + t);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (decay || t));
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + t + 0.05);
  },
  _noise(t, vol, f) {
    if (!this.ctx || !this.sfxOn) return;
    const n = this.ctx.sampleRate * t, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f || 900;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start();
  },

  shot(auto) { this._osc('square', 900, 120, 0.13, 0.25); this._noise(0.08, 0.18, 2500); },
  dry() { this._osc('square', 300, 250, 0.06, 0.12); },
  punch() { this._noise(0.09, 0.3, 500); },
  crash(v) { this._noise(0.25, Math.min(0.5, v / 40), 700); this._osc('sawtooth', 180, 40, 0.3, 0.2); },
  door() { this._noise(0.06, 0.2, 400); },
  boom() { this._noise(0.7, 0.8, 350); this._osc('sine', 120, 25, 0.8, 0.6); },
  cash() { this._osc('square', 700, 700, 0.07, 0.18); setTimeout(() => this._osc('square', 1050, 1050, 0.09, 0.18), 80); },
  jingle() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this._osc('square', f, f, 0.14, 0.14), i * 110)); },
  siren(toggle) {
    if (toggle && !this._sir) {
      this._sir = setInterval(() => {
        if (!this.sfxOn) return;
        this._osc('sawtooth', 700, 950, 0.32, 0.07);
        setTimeout(() => this._osc('sawtooth', 950, 700, 0.32, 0.07), 300);
      }, 700);
    } else if (!toggle && this._sir) { clearInterval(this._sir); this._sir = null; }
  },
  ui() { this._osc('square', 600, 900, 0.05, 0.1); },

  /* мотор: постоянный осциллятор, высота от скорости */
  engine(speed01, on) {
    if (!this.ctx || !this.sfxOn) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 60;
      this.engineGain.gain.value = 0.05;
      this.engineOsc.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    } else if (!on && this.engineOsc) {
      this.engineOsc.stop(); this.engineOsc = null;
      return;
    }
    if (this.engineOsc) {
      this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.08);
      this.engineGain.gain.setTargetAtTime(0.035 + speed01 * 0.05, this.ctx.currentTime, 0.1);
    }
  }
};
