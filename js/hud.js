'use strict';
/* ================= HUD (2D-канвас поверх WebGL) ================= */

const HUD = {
  ctx: null,
  W: 0, H: 0,
  toasts: [],
  banner: null, // {lines: [], t}
  MM: 150,      // размер миникарты

  init(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
  },
  resize() {
    this.W = innerWidth; this.H = innerHeight;
    this.cv.width = this.W; this.cv.height = this.H;
  },

  toast(msg, t) { this.toasts.push({ msg, t: t || 3 }); if (this.toasts.length > 4) this.toasts.shift(); },
  banner(lines, t) { this.banner = { lines: String(lines).split('\n'), t: t || 5 }; },

  _star(ctx, x, y, r, filled) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (filled) { ctx.fillStyle = '#ff4040'; ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  draw(game) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (game.state === 'title') {
      // лёгкий виньетный градиент под меню
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, this.W, this.H);
      return;
    }

    const playing = game.state === 'playing';

    // ---------- миникарта ----------
    if (World.minimap) {
      const s = this.MM, x = 12, y = 12;
      ctx.fillStyle = 'rgba(8,12,18,0.82)';
      ctx.fillRect(x - 4, y - 4, s + 8, s + 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(x - 4, y - 4, s + 8, s + 8);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(World.minimap, x, y, s, s);
      const map = (wx, wz) => [x + wx / WORLD_M * s, y + wz / WORLD_M * s];
      // маркер миссии
      const mk = Missions.marker();
      if (mk) {
        const [mx, mz] = map(mk.x, mk.z);
        const pr = 4 + Math.sin(game.time * 5) * 1.5;
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, mz, pr + 2, 0, TAU); ctx.stroke();
      }
      // полицейские
      const blink = Math.floor(game.time * 4) % 2 === 0;
      for (const c of Cars.list) {
        if (!c.ai || c.ai.kind !== 'police' || c.dead) continue;
        const [cx, cz] = map(c.x, c.z);
        if (blink) { ctx.fillStyle = '#ff4040'; ctx.fillRect(cx - 2, cz - 2, 4, 4); }
      }
      // ривалы
      for (const t of Missions.targets) {
        const [cx, cz] = map(t.x, t.z);
        ctx.fillStyle = '#ff8040'; ctx.fillRect(cx - 2, cz - 2, 4, 4);
      }
      // удалённые игроки
      for (const [id, r] of Net.remotes) {
        const [cx, cz] = map(r.x, r.z);
        ctx.fillStyle = '#40e0e0'; ctx.fillRect(cx - 2.5, cz - 2.5, 5, 5);
      }
      // игрок
      const [px, pz] = map(Player.x, Player.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(Math.PI - Player.angle);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.6, 4); ctx.lineTo(-3.6, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // ---------- панель справа сверху ----------
    const rx = this.W - 14;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    // деньги
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = '#3f7';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
    ctx.fillText(fmtMoney(Player.money), rx, 14);
    // звёзды розыска
    for (let i = 0; i < 5; i++) this._star(ctx, rx - 26 - i * 26, 52, 9, i < Crimes.level);
    // полосы здоровья и брони
    const bw = 150, bx = rx - bw, by = 72;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = '#e04040';
    ctx.fillRect(bx, by, bw * clamp(Player.health / 100, 0, 1), 10);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by + 13, bw, 7);
    ctx.fillStyle = '#4a90d9';
    ctx.fillRect(bx, by + 13, bw * clamp(Player.armor / 100, 0, 1), 7);
    ctx.shadowBlur = 0;

    // ---------- оружие слева снизу ----------
    if (playing) {
      const w = Player.weapon;
      ctx.textAlign = 'left';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillStyle = '#e8e8e8';
      ctx.fillText(w.name, 14, this.H - 40);
      ctx.font = '14px "Courier New", monospace';
      ctx.fillStyle = '#9ab09a';
      ctx.fillText(w.ammo === Infinity ? '∞' : w.ammo + ' патр.', 14, this.H - 22);
      // скорость в машине
      if (Player.inCar) {
        const kmh = Math.round(Math.abs(Player.inCar.v) * 3.6);
        ctx.textAlign = 'right';
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(kmh + ' км/ч', this.W - 14, this.H - 30);
      }
    }

    // ---------- подсказка ----------
    if (playing && game.prompt) {
      ctx.textAlign = 'center';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const tw = ctx.measureText(game.prompt).width;
      ctx.fillRect(this.W / 2 - tw / 2 - 8, this.H - 78, tw + 16, 22);
      ctx.fillStyle = '#ffe9a0';
      ctx.fillText(game.prompt, this.W / 2, this.H - 70);
    }

    // ---------- текст миссии ----------
    const mt = Missions.text();
    if (playing && mt) {
      ctx.textAlign = 'center';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = ctx.measureText(mt).width;
      ctx.fillRect(this.W / 2 - tw / 2 - 10, 12, tw + 20, 24);
      ctx.fillStyle = '#d8ffe0';
      ctx.fillText(mt, this.W / 2, 29);
    }

    // ---------- прицел ----------
    if (playing && !Player.inCar && Player.alive) {
      const m = game.mouse;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(m.x, m.y, 2.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, TAU); ctx.stroke();
    }

    // ---------- тосты ----------
    ctx.textAlign = 'center';
    ctx.font = '15px "Courier New", monospace';
    let ty = this.H - 110;
    for (const t of this.toasts) {
      const a = clamp(t.t, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,' + 0.55 * a + ')';
      const tw = ctx.measureText(t.msg).width;
      ctx.fillRect(this.W / 2 - tw / 2 - 10, ty - 16, tw + 20, 24);
      ctx.fillStyle = 'rgba(255,240,190,' + a + ')';
      ctx.fillText(t.msg, this.W / 2, ty);
      ty -= 28;
    }

    // ---------- баннер ----------
    if (this.banner) {
      const b = this.banner;
      const a = clamp(Math.min(b.t, (5 - b.t) * 2), 0, 1);
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px "Courier New", monospace';
      const lh = 40;
      const y0 = this.H * 0.3 - (b.lines.length - 1) * lh / 2;
      for (let i = 0; i < b.lines.length; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + 0.6 * a + ')';
        const tw = ctx.measureText(b.lines[i]).width;
        ctx.fillRect(this.W / 2 - tw / 2 - 16, y0 + i * lh - 26, tw + 32, 36);
        ctx.fillStyle = i === 0 ? 'rgba(255,210,63,' + a + ')' : 'rgba(230,230,230,' + a + ')';
        ctx.fillText(b.lines[i], this.W / 2, y0 + i * lh);
      }
    }

    // ---------- WASTED / BUSTED ----------
    if (game.state === 'dead' || game.state === 'busted') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 64px "Courier New", monospace';
      const t = game.state === 'dead' ? 'ТЫ ПОГИБ' : 'ТЕБЯ АРЕСТОВАЛИ';
      ctx.fillStyle = game.state === 'dead' ? '#c0392b' : '#4a90d9';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
      ctx.fillText(t, this.W / 2, this.H / 2);
      ctx.shadowBlur = 0;
      ctx.font = '16px "Courier New", monospace';
      ctx.fillStyle = '#ccc';
      ctx.fillText(game.state === 'dead' ? 'Потеряно 15% денег. Возрождение в больнице…' : 'Штраф $500. Возрождение в участке…', this.W / 2, this.H / 2 + 40);
    }

    // ---------- большая карта ----------
    if (game.bigMap && World.minimap) {
      const s = Math.min(this.W, this.H) * 0.8;
      const x = (this.W - s) / 2, y = (this.H - s) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(x - 10, y - 10, s + 20, s + 20);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(World.minimap, x, y, s, s);
      const map = (wx, wz) => [x + wx / WORLD_M * s, y + wz / WORLD_M * s];
      const mk = Missions.marker();
      if (mk) {
        const [mx, mz] = map(mk.x, mk.z);
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(mx, mz, 10, 0, TAU); ctx.stroke();
      }
      const [px, pz] = map(Player.x, Player.z);
      ctx.save();
      ctx.translate(px, pz); ctx.rotate(Math.PI - Player.angle);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillStyle = '#9ab09a';
      ctx.fillText('КАРТА ГОРОДА — [M] закрыть', this.W / 2, y + s + 26);
    }

    // ---------- FPS ----------
    ctx.textAlign = 'left';
    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = 'rgba(140,160,140,0.7)';
    ctx.fillText('FPS ' + Math.round(game.fps) + '  чанки: ' + City3D.chunks.size, 12, this.H - 14);
  },

  update(dt) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].t -= dt;
      if (this.toasts[i].t <= 0) this.toasts.splice(i, 1);
    }
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
  }
};
