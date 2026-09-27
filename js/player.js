'use strict';
/* ================= ИГРОК: пешком / за рулём, SA-камера (pointer lock орбита),
   прицел «в плечо», прыжок, гравитация, оружие. ================= */

const WEAPONS = [
  { id: 'fist',  name: 'Кулаки',   dmg: 15, rate: 0.4,  range: 2.6, ammo: Infinity, spread: 0 },
  { id: 'pistol', name: 'Пистолет', dmg: 30, rate: 0.32, range: 60, ammo: 60, spread: 0.03 },
  { id: 'smg',   name: 'ПП',      dmg: 16, rate: 0.11, range: 50, ammo: 150, spread: 0.09 }
];

const Player = {
  x: 0, z: 0, y: 0, vy: 0, angle: 0,
  hp: 100, armor: 0, money: 350,
  weapons: [{ id: 'fist', ammo: Infinity }, { id: 'pistol', ammo: 60 }], wi: 1,
  fireCd: 0, car: null, group: null, yaw: 0, pitch: 0.32, aiming: false,

  async init(x, z) {
    this.x = x; this.z = z; this.y = 0; this.vy = 0;
    this.group = await makeCharacter('humanMaleA');
    Game.scene.add(this.group);
  },

  get weapon() { return WEAPONS.find(w => w.id === this.weapons[this.wi].id); },
  giveWeapon(id, ammo) {
    const w = this.weapons.find(w => w.id === id);
    if (w) w.ammo += ammo; else { this.weapons.push({ id, ammo }); this.wi = this.weapons.length - 1; }
    HUD.toast(WEAPONS.find(w => w.id === id).name + ' + ' + ammo);
  },

  update(dt) {
    if (this.car) { this._drive(dt); return; }
    this._foot(dt);
  },

  /* ---------- пешком ---------- */
  _foot(dt) {
    const k = Game.keys;
    let mx = 0, mz = 0;
    // движение относительно КАМЕРЫ (yaw) — как в SA
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    if (k['KeyW'] || k['ArrowUp']) { mx += fx; mz += fz; }
    if (k['KeyS'] || k['ArrowDown']) { mx -= fx; mz -= fz; }
    if (k['KeyA'] || k['ArrowLeft']) { mx += fz; mz -= fx; }
    if (k['KeyD'] || k['ArrowRight']) { mx -= fz; mz += fx; }
    const l = Math.hypot(mx, mz);
    const run = k['ShiftLeft'] || k['ShiftRight'];
    const spd = l > 0 ? (run ? 7.0 : 3.8) : 0;
    if (l > 0) {
      this.x += mx / l * spd * dt; this.z += mz / l * spd * dt;
      if (!this.aiming) this.angle = angLerp(this.angle, Math.atan2(mx, mz), Math.min(1, 14 * dt));
    }
    // гравитация/прыжок
    if (this.jumping) {
      this.vy -= 22 * dt; this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.jumping = false; }
    } else if (k['Space'] && !this._sp) { this.jumping = true; this.vy = 7.6; AudioSys.ui(); }
    this._sp = k['Space'];
    const c = World.collide(this.x, this.z, 0.45);
    this.x = c.x; this.z = c.z;

    // прицел: RMB — режим «в плечо», поворот к прицелу
    if (this.aiming) this.angle = this.yaw;

    // стрельба
    this.fireCd -= dt;
    if (Game.mouseDown && this.fireCd <= 0) this.fire();
    this.fireCd = Math.max(this.fireCd, 0);

    // анимация/визуал
    if (this.group) {
      charAnim(this.group, spd > 0 && !this.jumping, dt);
      if (this.jumping && this.group.userData.act.jump) {
        const u = this.group.userData;
        if (u.cur !== u.act.jump) { if (u.cur) u.cur.fadeOut(0.1); u.act.jump.reset().fadeIn(0.1).play(); u.cur = u.act.jump; }
      }
      this.group.position.set(this.x, this.y, this.z);
      this.group.rotation.y = this.angle;
    }
  },

  fire() {
    const w = this.weapon;
    const slot = this.weapons[this.wi];
    if (slot.ammo <= 0) { AudioSys.dry(); this.fireCd = 0.3; return; }
    this.fireCd = w.rate;
    if (w.id === 'fist') { AudioSys.punch(); this._melee(); return; }
    slot.ammo--;
    AudioSys.shot(w.id === 'smg');
    const spread = w.spread * (this.aiming ? 0.5 : 1);
    const ang = this.angle + rand(-spread, spread);
    Game.hitscan(this.x + Math.sin(ang) * 0.5, this.z + Math.cos(ang) * 0.5, ang, w.range, w.dmg, 'player');
    Game.muzzle(this.x + Math.sin(ang) * 0.9, 1.3, this.z + Math.cos(ang) * 0.9, ang);
  },

  _melee() {
    const fx = Math.sin(this.angle), fz = Math.cos(this.angle);
    for (const p of Peds.list) if (!p.dead && dist2(p.x, p.z, this.x + fx * 1.5, this.z + fz * 1.5) < 1.7) { Peds.kill(p, 'player'); break; }
    for (const v of Vehicles.list) if (!v.dead && dist2(v.x, v.z, this.x + fx * 1.8, this.z + fz * 1.8) < 4) { v.hp -= 4; break; }
  },

  /* ---------- за рулём ---------- */
  _drive(dt) {
    const k = Game.keys, v = this.car;
    let th = 0, st = 0;
    if (k['KeyW'] || k['ArrowUp']) th += 1;
    if (k['KeyS'] || k['ArrowDown']) th -= 1;
    if (k['KeyA'] || k['ArrowLeft']) st += 1;
    if (k['KeyD'] || k['ArrowRight']) st -= 1;
    v.throttle = th; v.steerIn = st; v.hand = !!k['Space'];
    this.x = v.x; this.z = v.z; this.angle = v.angle;
    // drive-by
    this.fireCd -= dt;
    if (Game.mouseDown && this.fireCd <= 0) {
      const w = this.weapon, slot = this.weapons[this.wi];
      if (w.id !== 'fist' && slot.ammo > 0) {
        slot.ammo--; AudioSys.shot(false);
        Game.hitscan(v.x, v.z, this.yaw + rand(-0.06, 0.06), w.range, w.dmg, 'player');
        this.fireCd = w.rate * 1.3;
      }
    }
  },

  enterCar(v) {
    this.car = v; v.driver = 'player'; v.ai = null;
    if (this.group) this.group.visible = false;
    AudioSys.door();
    HUD.toast(v.T.name + ' · WASD — газ · SPACE — ручник · E — выйти');
  },
  leaveCar() {
    const v = this.car;
    if (!v) return;
    v.throttle = 0; v.steerIn = 0; v.hand = true; v.driver = null;
    const side = { x: Math.cos(v.angle), z: -Math.sin(v.angle) };
    this.x = v.x + side.x * 2.2; this.z = v.z + side.z * 2.2;
    const c = World.collide(this.x, this.z, 0.45);
    this.x = c.x; this.z = c.z;
    this.car = null;
    if (this.group) { this.group.visible = true; this.group.position.set(this.x, 0, this.z); }
  },

  damage(d) {
    let rem = d;
    if (this.armor > 0) { const a = Math.min(this.armor, rem * 0.7); this.armor -= a; rem -= a; }
    this.hp -= rem;
    HUD.hurtFlash();
    if (this.hp <= 0) { this.hp = 0; Game.wasted(); }
  }
};
