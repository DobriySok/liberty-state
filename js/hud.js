'use strict';
/* ================= HUD: минимапа, здоровье/броня, деньги, звёзды, скорость, миссии ================= */

const HUD = {
  cv: null, x: null, hurt: 0, toastText: '', toastT: 0,

  init() { this.cv = document.getElementById('hud'); this.x = this.cv.getContext('2d'); this.resize(); addEventListener('resize', () => this.resize()); },
  resize() { this.cv.width = innerWidth; this.cv.height = innerHeight; },

  toast(t) { this.toastText = t; this.toastT = 3.4; },
  hurtFlash() { this.hurt = 1; },

  update(dt) { this.toastT = Math.max(0, this.toastT - dt); this.hurt = Math.max(0, this.hurt - dt * 2); },

  draw() {
    const x = this.x, W = this.cv.width, H = this.cv.height;
    x.clearRect(0, 0, W, H);
    const pl = Game.player;

    /* --- мини-карта (левый низ) --- */
    const MS = 150, mx = 18, my = H - MS - 18;
    x.save();
    x.beginPath(); x.arc(mx + MS / 2, my + MS / 2, MS / 2 + 4, 0, 7);
    x.fillStyle = 'rgba(8,12,20,.75)'; x.fill();
    x.strokeStyle = '#3a4a63'; x.lineWidth = 3; x.stroke();
    x.clip();
    const sc = 0.42, cxm = mx + MS / 2, cym = my + MS / 2;
    x.fillStyle = '#20351c'; x.fillRect(mx, my, MS, MS);
    // дороги
    x.strokeStyle = '#5a6068'; x.lineWidth = 3;
    const P = TILE * BLOCK;
    for (let i = 0; i < LINES; i++) {
      const px = cxm + (i * P - pl.x) * sc, pz = cym + (i * P - pl.z) * sc;
      x.beginPath(); x.moveTo(px, my); x.lineTo(px, my + MS); x.stroke();
      x.beginPath(); x.moveTo(mx, pz); x.lineTo(mx + MS, pz); x.stroke();
    }
    // маркер миссии
    if (Missions.marker && Missions.marker.visible) {
      const mkx = cxm + (Missions.marker.userData.tx - pl.x) * sc, mkz = cym + (Missions.marker.userData.tz - pl.z) * sc;
      x.fillStyle = '#ffd23e'; x.beginPath(); x.arc(clamp(mkx, mx + 6, mx + MS - 6), clamp(mkz, my + 6, my + MS - 6), 5, 0, 7); x.fill();
    }
    // копы
    x.fillStyle = '#5a8fff';
    for (const u of Police.units) if (!u.v.dead) {
      x.beginPath(); x.arc(cxm + (u.v.x - pl.x) * sc, cym + (u.v.z - pl.z) * sc, 3.4, 0, 7); x.fill();
    }
    // игрок — стрелка по yaw
    x.save();
    x.translate(cxm, cym); x.rotate(-pl.yaw + Math.PI);
    x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 6); x.lineTo(-5, 6); x.closePath(); x.fill();
    x.restore();
    x.restore();

    /* --- здоровье/броня --- */
    const bx = mx + 4, by = my - 26;
    x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(bx - 2, by - 2, MS - 4, 20);
    x.fillStyle = '#37b24d'; x.fillRect(bx, by, (MS - 8) * pl.hp / 100, 7);
    if (pl.armor > 0) { x.fillStyle = '#4dabf7'; x.fillRect(bx, by + 9, (MS - 8) * pl.armor / 100, 7); }

    /* --- деньги --- */
    x.font = 'italic 900 26px Arial';
    x.textAlign = 'right';
    x.lineWidth = 4; x.strokeStyle = '#000';
    const mstr = '$' + Game.money;
    x.strokeText(mstr, W - 24, 44); x.fillStyle = '#3ddc63'; x.fillText(mstr, W - 24, 44);

    /* --- часы --- */
    const hh = Math.floor(World.timeOfDay), mm = Math.floor((World.timeOfDay % 1) * 60);
    x.font = 'bold 17px Consolas, monospace';
    const tstr = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    x.strokeText(tstr, W - 24, 68); x.fillStyle = '#dfe7f2'; x.fillText(tstr, W - 24, 68);

    /* --- звёзды розыска --- */
    x.textAlign = 'right'; x.font = '24px Arial';
    for (let i = 0; i < 4; i++) {
      const sx = W - 24 - i * 26;
      x.strokeText('★', sx, 98);
      x.fillStyle = i < Police.stars ? '#ffd23e' : 'rgba(255,255,255,.14)';
      x.fillText('★', sx, 98);
    }
    if (Police.stars > 0) {
      x.font = 'italic bold 15px Arial'; x.fillStyle = '#ff6b6b';
      const blink = (Game.time * 2 | 0) % 2 === 0;
      if (blink) { x.strokeText('WANTED', W - 24, 122); x.fillText('WANTED', W - 24, 122); }
    }

    /* --- оружие/патроны --- */
    const w = pl.weapon, slot = pl.weapons[pl.wi];
    x.font = 'italic 900 20px Arial';
    x.strokeText(w.name.toUpperCase(), W - 24, H - 30); x.fillStyle = '#fff'; x.fillText(w.name.toUpperCase(), W - 24, H - 30);
    x.font = 'bold 16px Consolas';
    const astr = slot.ammo === Infinity ? '∞' : slot.ammo;
    x.strokeText(astr, W - 24, H - 10); x.fillStyle = '#ffd23e'; x.fillText(astr, W - 24, H - 10);

    /* --- спидометр в машине --- */
    if (pl.car) {
      const kmh = Math.round(pl.car.speed * 3.6);
      x.textAlign = 'center'; x.font = 'italic 900 34px Arial';
      x.strokeText(kmh, W / 2, H - 26); x.fillStyle = kmh > 100 ? '#ff6b6b' : '#fff'; x.fillText(kmh, W / 2, H - 26);
      x.font = 'bold 12px Arial'; x.fillStyle = '#9fb0c8'; x.fillText('км/ч', W / 2, H - 10);
    }

    /* --- миссия/таймер --- */
    if (Missions.active) {
      const a = Missions.active;
      x.textAlign = 'center'; x.font = 'bold 15px Arial';
      const label = a.kind === 'delivery' ? 'ДОСТАВКА' : 'ЗАЧИСТКА';
      x.strokeText(label + '  ·  ' + Math.ceil(a.time) + ' c', W / 2, 34);
      x.fillStyle = '#ffd23e'; x.fillText(label + '  ·  ' + Math.ceil(a.time) + ' c', W / 2, 34);
    }

    /* --- тост --- */
    if (this.toastT > 0) {
      x.textAlign = 'center'; x.font = '600 16px Segoe UI';
      x.globalAlpha = Math.min(1, this.toastT);
      x.strokeText(this.toastText, W / 2, H - 64);
      x.fillStyle = '#fff'; x.fillText(this.toastText, W / 2, H - 64);
      x.globalAlpha = 1;
    }

    /* --- красная вспышка урона --- */
    if (this.hurt > 0) {
      x.fillStyle = `rgba(180,0,0,${this.hurt * 0.35})`;
      x.fillRect(0, 0, W, H);
    }

    /* --- прицел --- */
    if (!pl.car) {
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.6;
      const cxx = W / 2 + (pl.aiming ? 0 : 0), cyy = H / 2;
      x.beginPath(); x.arc(cxx, cyy, 5, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(cxx - 9, cyy); x.lineTo(cxx - 3, cyy); x.moveTo(cxx + 3, cyy); x.lineTo(cxx + 9, cyy); x.stroke();
    }
  }
};
