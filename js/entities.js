'use strict';
/* ================= СУЩНОСТИ: игрок, машины, пешеходы, пули ================= */

const WEAPONS = [
  { id: 'fists',   name: 'Кулаки',   dmg: 14, rate: 0.45, range: 2.8, ammo: Infinity, auto: false, spread: 0,    pellets: 1, price: 0 },
  { id: 'pistol',  name: 'Пистолет', dmg: 26, rate: 0.3,  range: 48,  ammo: 36, auto: false, spread: 0.05, pellets: 1, price: 300 },
  { id: 'smg',     name: 'ПП',       dmg: 15, rate: 0.1,  range: 42,  ammo: 96, auto: true,  spread: 0.11, pellets: 1, price: 900 },
  { id: 'shotgun', name: 'Дробовик', dmg: 12, rate: 0.95, range: 28,  ammo: 20, auto: false, spread: 0.24, pellets: 8, price: 1100 },
  { id: 'rifle',   name: 'Винтовка', dmg: 62, rate: 0.6,  range: 95,  ammo: 30, auto: false, spread: 0.02, pellets: 1, price: 1800 }
];
const wById = id => WEAPONS.find(w => w.id === id);

/* ---------- Игрок ---------- */
const Player = {
  group: null,
  x: World.START.x, z: World.START.z, angle: 0,
  speed: 0, health: 100, armor: 0, money: 250,
  weapons: [{ id: 'fists', ammo: Infinity }, { id: 'pistol', ammo: 36 }],
  wi: 0, fireCd: 0, swingT: 0,
  inCar: null, alive: true, arrestT: 0,
  aimX: 0, aimZ: 0,

  init(x, z) {
    if (!this.group) {
      this.group = Meshes.player(0x3f7fd8);
      City3D.scene.add(this.group);
    }
    this.x = x; this.z = z;
    this.alive = true;
    this.inCar = null;
  },
  get weapon() { return wById(this.weapons[this.wi].id); },
  giveWeapon(id, ammo) {
    const w = this.weapons.find(w => w.id === id);
    if (w) { if (ammo != null) w.ammo = ammo; }
    else this.weapons.push({ id, ammo: ammo != null ? ammo : wById(id).ammo });
    this.wi = this.weapons.length - 1;
  },
  ammo(id) { const w = this.weapons.find(w => w.id === id); return w ? w.ammo : 0; },

  setPos(x, z) { this.x = x; this.z = z; },

  update(dt) {
    if (!this.alive) return;
    if (this.inCar) {
      // управляем машиной
      const c = this.inCar;
      const k = Game.keys;
      let throttle = 0, steer = 0, hand = false;
      if (k['KeyW'] || k['ArrowUp']) throttle = 1;
      if (k['KeyS'] || k['ArrowDown']) throttle = -1;
      if (k['KeyA'] || k['ArrowLeft']) steer = 1;
      if (k['KeyD'] || k['ArrowRight']) steer = -1;
      hand = k['Space'];
      c.setInput(throttle, steer, hand, true);
      this.x = c.x; this.z = c.z; this.angle = c.angle;
      // стрельба из машины (drive-by)
      this.fireCd -= dt;
      if (Game.mouse.down && this.fireCd <= 0) this.fire(c.angle, true);
      this.group.visible = false;
    } else {
      this.group.visible = true;
      // движение относительно камеры
      const cam = City3D.cam;
      const fx = cam ? cam.look.x - cam.pos.x : 0;
      const fz = cam ? cam.look.z - cam.pos.z : 1;
      const fl = Math.hypot(fx, fz) || 1;
      const fwx = fx / fl, fwz = fz / fl;
      const rx = fwz, rz = -fwx;
      const k = Game.keys;
      let mx = 0, mz = 0;
      if (k['KeyW'] || k['ArrowUp']) { mx += fwx; mz += fwz; }
      if (k['KeyS'] || k['ArrowDown']) { mx -= fwx; mz -= fwz; }
      if (k['KeyA'] || k['ArrowLeft']) { mx += rx; mz += rz; }
      if (k['KeyD'] || k['ArrowRight']) { mx -= rx; mz -= rz; }
      const ml = Math.hypot(mx, mz);
      const run = k['ShiftLeft'] || k['ShiftRight'];
      const spd = ml > 0 ? (run ? 7.2 : 4.4) : 0;
      if (ml > 0) {
        mx /= ml; mz /= ml;
        this.x += mx * spd * dt;
        this.z += mz * spd * dt;
        this.angle = angLerp(this.angle, Math.atan2(mx, mz), Math.min(1, 12 * dt));
        this.speed = spd;
      } else this.speed = 0;
      const res = World.collideCircle(this.x, this.z, 0.45);
      this.x = res.x; this.z = res.z;
      // прицел
      const ray = Game.aimRay();
      if (ray) {
        this.aimX = ray.x; this.aimZ = ray.z;
        this.angle = Math.atan2(ray.x - this.x, ray.z - this.z);
      }
      // анимация (модельные Idle/Run)
      Assets3D.setWalk(this.group, this.speed, dt);
      if (this.fireCd <= 0 && Game.mouse.down) this.fire(this.angle, false);
      this.fireCd = Math.max(0, this.fireCd - dt);
      this.swingT = Math.max(0, this.swingT - dt);
    }
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;
  },

  fire(angle, inCar) {
    const w = this.weapon;
    if (w.ammo <= 0) { if (w.ammo !== Infinity) { AudioSys.error(); this.fireCd = 0.3; } return; }
    this.fireCd = w.rate;
    if (w.ammo !== Infinity) this.weapons[this.wi].ammo--;
    AudioSys.shot();
    const ox = this.x + Math.sin(angle) * 0.6;
    const oz = this.z + Math.cos(angle) * 0.6;
    if (w.id === 'fists') {
      // удар
      this.swingT = 0.15;
      if (this.group.userData.armR) this.group.userData.armR.rotation.x = -1.2;
      this.melee(ox, oz, angle);
      return;
    }
    const y = inCar ? 1.0 : 1.3;
    for (let i = 0; i < w.pellets; i++) {
      const a = angle + (Math.random() - 0.5) * 2 * w.spread;
      Bullets.fire(ox, y, oz, a, w.dmg, 'player', w.range);
    }
    City3D.spark(ox + Math.sin(angle) * 0.3, y, oz + Math.cos(angle) * 0.3,
      Math.sin(angle) * 4, 2, Math.cos(angle) * 4, 0.08, 1, 0.9, 0.5);
    Net.send({ t: 'sh', x: ox, z: oz, a: angle });
    Crimes.onShotNear(ox, oz);
  },

  melee(ox, oz, angle) {
    const cone = 0.9;
    for (const p of Peds.list) {
      if (p.state === 'dead') continue;
      const d = dist(ox, oz, p.x, p.z);
      if (d > 2.8) continue;
      const pa = Math.atan2(p.x - ox, p.z - oz);
      if (Math.abs(angDiff(angle, pa)) < cone) Peds.damage(p, 20, 'player');
    }
    for (const c of Cars.list) {
      const d = dist(ox, oz, c.x, c.z);
      if (d < 3.2 && c !== this.inCar) damageCar(c, 4);
    }
  },

  damage(d, src) {
    if (!this.alive) return;
    let rem = d;
    if (this.armor > 0) {
      const abs = Math.min(this.armor, rem * 0.65);
      this.armor -= abs;
      rem -= abs;
    }
    this.health -= rem;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      Game.onPlayerDeath();
    }
  },

  bust() { Game.onBusted(); },

  updateGroup() {
    if (!this.group) return;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;
  }
};

/* ---------- Машины ---------- */
class Car {
  constructor(x, z, angle, type, paintHex) {
    this.x = x; this.z = z; this.angle = angle;
    this.type = type;
    this.v = 0; this.steer = 0;
    this.throttle = 0; this.steerIn = 0; this.hand = false;
    this.health = 100;
    this.dead = false;
    this.occupied = false;
    this.ai = null;
    this.id = Car._next++;
    this.smokeT = 0;
    this.group = Meshes.car(type, paintHex);
    City3D.scene.add(this.group);
    this._r = this.group.userData.radius;
  }
  setInput(t, s, h) { this.throttle = t; this.steerIn = s; this.hand = h; }
  update(dt) {
    if (this.dead) return;
    const T = Meshes.CAR_TYPES[this.type];
    const t = this.throttle, s = this.steerIn;
    const tile = World.tileAt(this.x, this.z);
    const offroad = tile !== T.ROAD && tile !== T.RUNWAY && tile !== T.SIDEWALK && tile !== T.PAVEMENT;
    let cap = offroad ? T.max * 0.5 : T.max;
    if (this.ai) {
      if (this.ai.kind === 'police' && Crimes.level > 0) cap *= 1.2;
      else if (this.ai.kind === 'chase') cap *= 1.12;
    }
    if (t > 0) this.v += T.acc * dt * (1 - this.v / cap);
    else if (t < 0) this.v += T.acc * 0.7 * dt * (1 - this.v / (-cap * 0.35));
    else this.v *= (1 - 1.7 * dt);
    if (this.hand) this.v *= (1 - 3.2 * dt);
    this.v = clamp(this.v, -cap * 0.35, cap);
    this.steer += (s - this.steer) * Math.min(1, 9 * dt);
    const turn = this.steer * T.turn * clamp(Math.abs(this.v) / (cap * 0.4), 0, 1) * (this.v < -0.1 ? -1 : 1) * (this.hand ? 1.45 : 1);
    this.angle += turn * dt;
    let nx = this.x + Math.sin(this.angle) * this.v * dt;
    let nz = this.z + Math.cos(this.angle) * this.v * dt;
    // столкновение со стенами: проверяем нос и хвост
    const hl = T.L * 0.34;
    const fx = nx + Math.sin(this.angle) * hl, fz = nz + Math.cos(this.angle) * hl;
    const bx = nx - Math.sin(this.angle) * hl, bz = nz - Math.cos(this.angle) * hl;
    let hitWall = false;
    let res = World.collideCircle(fx, fz, 1.05);
    if (res.hit) { nx += res.x - fx; nz += res.z - fz; hitWall = true; }
    res = World.collideCircle(bx, bz, 1.05);
    if (res.hit) { nx += res.x - bx; nz += res.z - bz; hitWall = true; }
    if (hitWall) {
      if (Math.abs(this.v) > 9) {
        damageCar(this, (Math.abs(this.v) - 9) * 1.6);
        AudioSys.thud();
        for (let i = 0; i < 6; i++)
          City3D.spark(nx, 0.8, nz, rand(-4, 4), rand(2, 6), rand(-4, 4), 0.4, 1, 0.8, 0.3);
        City3D.addShake(0.3);
      }
      this.v *= -0.22;
    }
    this.x = nx; this.z = nz;
    // занос
    const skidding = Math.abs(this.steer) > 0.55 && Math.abs(this.v) > cap * 0.55;
    if (this.occupied) AudioSys.setSkid(skidding ? 0.7 : 0);
    // дым и огонь
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.health < 45) {
      this.smokeT = this.health < 15 ? 0.08 : 0.3;
      City3D.puff(this.x + rand(-0.5, 0.5), 1.2, this.z + rand(-0.5, 0.5), rand(-0.5, 0.5), rand(1.2, 2.2), rand(-0.5, 0.5),
        rand(0.8, 1.6), 0.25, 0.25, 0.27, rand(0.5, 0.9));
      if (this.health < 15)
        City3D.spark(this.x + rand(-0.4, 0.4), 0.8, this.z + rand(-0.4, 0.4), 0, rand(2, 4), 0, 0.3, 1, 0.5, 0.1);
    }
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;
    if (this.group.userData.lightbar) {
      const f = (Game.time * 8) % 1 < 0.5;
      this.group.userData.lightbar.material.color.setHex(f ? 0xff2020 : 0x2040ff);
    }
  }
}
Car._next = 1;

const Cars = {
  list: [],
  add(c) { this.list.push(c); return c; },
  remove(c) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    City3D.scene.remove(c.group);
    if (Player.inCar === c) Player.inCar = null;
  },
  updateAll(dt) {
    for (const c of this.list) c.update(dt);
    this.collideCars();
    // сбитые пешеходы (проверяем центр и нос машины)
    for (const c of this.list) {
      if (Math.abs(c.v) < 5) continue;
      const hl = Meshes.CAR_TYPES[c.type].L * 0.36;
      const fx = c.x + Math.sin(c.angle) * hl, fz = c.z + Math.cos(c.angle) * hl;
      for (const p of Peds.list) {
        if (p.state === 'dead') continue;
        if (dist2(c.x, c.z, p.x, p.z) < 1.44 || dist2(fx, fz, p.x, p.z) < 1.44) {
          Peds.kill(p, 'player');
          c.v *= 0.6;
        }
      }
    }
  },
  collideCars() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (a.dead || b.dead) continue;
      const A = carSeg(a.x, a.z, a.angle, Meshes.CAR_TYPES[a.type].L * 0.36);
      const B = carSeg(b.x, b.z, b.angle, Meshes.CAR_TYPES[b.type].L * 0.36);
      const d = segSeg2D(A[0], A[1], A[2], A[3], B[0], B[1], B[2], B[3]);
      const thr = (Meshes.CAR_TYPES[a.type].W + Meshes.CAR_TYPES[b.type].W) / 2 + 0.3;
      if (d > thr || d < 1e-4) continue;
      const overlap = thr - d;
      // расталкиваем по собственным осям (аркадный вариант)
      a.x -= Math.sin(a.angle) * overlap * 0.5; a.z -= Math.cos(a.angle) * overlap * 0.5;
      b.x += Math.sin(b.angle) * overlap * 0.5; b.z += Math.cos(b.angle) * overlap * 0.5;
      const rel = Math.abs(a.v - b.v) * 0.8 + Math.abs(a.steer * a.v + b.steer * b.v) * 0.4;
      if (rel > 7) {
        const dmg = rel * 1.1;
        damageCar(a, dmg);
        damageCar(b, dmg);
        AudioSys.thud();
        City3D.addShake(0.25);
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        for (let k = 0; k < 5; k++)
          City3D.spark(mx, 0.9, mz, rand(-5, 5), rand(1, 5), rand(-5, 5), 0.35, 1, 0.85, 0.4);
        if (a.ai && a.ai.kind === 'police' && b.occupied) Crimes.add(1);
        if (b.ai && b.ai.kind === 'police' && a.occupied) Crimes.add(1);
      }
      a.v *= 0.86; b.v *= 0.86;
    }
  },
  nearest(x, z, r) {
    let best = null, bd = r * r;
    for (const c of this.list) {
      if (c.dead || c.occupied) continue;
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
};

function damageCar(c, d) {
  if (c.dead) return;
  c.health -= d;
  if (c.health <= 0) {
    c.dead = true;
    explode(c.x, c.z, 8, c);
    Cars.remove(c);
  }
}

/* ---------- Пешеходы ---------- */
class Ped {
  constructor(x, z, opts) {
    opts = opts || {};
    this.x = x; this.z = z;
    this.angle = Math.random() * TAU;
    this.state = opts.rival ? 'chase' : 'wander';
    this.rival = !!opts.rival;
    this.timer = rand(2, 6);
    this.health = opts.rival ? 45 : 30;
    this.mission = !!opts.mission;
    this.shootCd = rand(0.5, 1.5);
    this.id0 = Ped._next++;
    const shirts = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085, 0xd4a017, 0xe8e8e8];
    const skins = [0xd8a878, 0xb07850, 0xe8c090, 0x8a5a3a];
    this.group = Meshes.ped(opts.rival ? 0x2c2c34 : pick(shirts), pick(skins), opts.rival);
    if (!opts.noScene) City3D.scene.add(this.group);
    this.group.position.set(x, 0, z);
  }
  update(dt) {
    if (this.state === 'dead') return;
    let spd = 0;
    if (this.state === 'wander') {
      spd = 1.3;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = rand(2, 6);
        if (Math.random() < 0.4) this.angle += Math.PI * (Math.random() < 0.5 ? 0.5 : -0.5) + rand(-0.4, 0.4);
      }
    } else if (this.state === 'flee') {
      spd = 5.6;
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'wander';
    } else if (this.state === 'chase') {
      // соперник: догоняет игрока и стреляет
      const dx = Player.x - this.x, dz = Player.z - this.z;
      const d = Math.hypot(dx, dz);
      this.angle = Math.atan2(dx, dz);
      if (d > 14) spd = 2.6;
      else {
        spd = 0;
        this.shootCd -= dt;
        if (this.shootCd <= 0 && Player.alive) {
          this.shootCd = rand(0.9, 1.6);
          const a = this.angle + rand(-0.08, 0.08);
          Bullets.fire(this.x + Math.sin(a) * 0.5, 1.3, this.z + Math.cos(a) * 0.5, a, 8, 'rival', 35);
          AudioSys.shot();
          City3D.spark(this.x + Math.sin(a) * 0.6, 1.3, this.z + Math.cos(a) * 0.6, Math.sin(a) * 3, 1.5, Math.cos(a) * 3, 0.07, 1, 0.8, 0.4);
        }
      }
    }
    if (spd > 0) {
      this.x += Math.sin(this.angle) * spd * dt;
      this.z += Math.cos(this.angle) * spd * dt;
      const res = World.collideCircle(this.x, this.z, 0.4);
      if (res.hit) { this.angle += rand(0.6, 2.2) * (Math.random() < 0.5 ? 1 : -1); this.x = res.x; this.z = res.z; }
    }
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;
    Assets3D.setWalk(this.group, spd > 0 ? Math.max(spd, 1.5) : 0, dt);
  }
  fleeFrom(x, z) {
    if (this.state === 'dead' || this.rival) return;
    this.state = 'flee';
    this.angle = Math.atan2(this.x - x, this.z - z);
    this.timer = rand(2.5, 5);
  }
}
Ped._next = 1;

const Peds = {
  list: [],
  MAX: 34,
  spawnT: 0,
  updateAll(dt) {
    this.spawnT -= dt;
    // доп. спавн вокруг игрока
    if (this.spawnT <= 0) {
      this.spawnT = 0.4;
      if (this.list.length < this.MAX) {
        const a = Math.random() * TAU, r = rand(35, 120);
        const x = Player.x + Math.sin(a) * r, z = Player.z + Math.cos(a) * r;
        if (World.walkableAt(x, z) && !World.isRoadArea(x, z) && dist(x, z, Player.x, Player.z) > 20)
          this.list.push(new Ped(x, z));
      }
    }
    // убирание дальних
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.state === 'dead' && p.fade <= 0) { this._remove(i); continue; }
      if (p.state === 'dead') { p.fade -= dt; continue; }
      if (!p.rival && !p.mission && dist2(p.x, p.z, Player.x, Player.z) > 170 * 170) this._remove(i);
      p.update(dt);
    }
  },
  _remove(i) {
    const p = this.list[i];
    City3D.scene.remove(p.group);
    this.list.splice(i, 1);
  },
  scareNear(x, z) {
    for (const p of this.list) {
      if (dist2(x, z, p.x, p.z) < 60 * 60 && Math.random() < 0.5) p.fleeFrom(x, z);
    }
  },
  damage(p, d, src) {
    if (p.state === 'dead') return;
    p.health -= d;
    City3D.puff(p.x, 1.2, p.z, rand(-1, 1), rand(1, 2), rand(-1, 1), 0.3, 0.5, 0.08, 0.08, 0.4);
    if (p.health <= 0) this.kill(p, src);
  },
  kill(p, src) {
    if (p.state === 'dead') return;
    p.state = 'dead';
    p.fade = 18;
    p.group.rotation.x = -Math.PI / 2;
    p.group.position.y = 0.3;
    City3D.addDecal(p.x, p.z, rand(0.7, 1.1), 0x5e1010);
    for (let i = 0; i < 8; i++)
      City3D.spark(p.x, 1, p.z, rand(-3, 3), rand(1, 4), rand(-3, 3), 0.5, 0.55, 0.06, 0.06);
    if (src === 'player') {
      Crimes.add(1);
      if (p.rival && p.mission) Missions.onRivalKilled(p);
      if (Math.random() < 0.4) Pickups.add(p.x + rand(-0.5, 0.5), p.z + rand(-0.5, 0.5), 'money', randi(5, 40));
    }
    if (p.mission) p.missionDead = true;
  }
};

/* ---------- Пули (единая LineSegments) ---------- */
const Bullets = {
  MAX: 120,
  items: [],
  lines: null,
  init() {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(this.MAX * 6);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.LineBasicMaterial({ color: 0xffd87a, transparent: true, opacity: 0.85 });
    this.lines = new THREE.LineSegments(g, m);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    City3D.scene.add(this.lines);
  },
  fire(x, y, z, a, dmg, from, range) {
    if (this.items.length >= this.MAX) return;
    this.items.push({
      x, y, z, px: x, py: y, pz: z,
      dx: Math.sin(a) * 55, dy: 0, dz: Math.cos(a) * 55,
      life: range / 55, dmg, from
    });
  },
  update(dt) {
    const attr = this.lines.geometry.attributes.position;
    let ni = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const b = this.items[i];
      let dead = false;
      for (let s = 0; s < 3 && !dead; s++) {
        b.px = b.x; b.py = b.y; b.pz = b.z;
        b.x += b.dx * dt / 3; b.z += b.dz * dt / 3;
        b.life -= dt / 3;
        if (b.life <= 0) { dead = true; break; }
        if (World.solidAt(b.x, b.z)) {
          City3D.spark(b.x, b.y, b.z, rand(-2, 2), rand(1, 3), rand(-2, 2), 0.2, 1, 0.8, 0.4);
          dead = true; break;
        }
        if (b.from !== 'player') {
          const d = dist2(b.x, b.z, Player.x, Player.z);
          if (d < 0.5 * 0.5) {
            if (Player.alive && !Player.inCar) Player.damage(b.dmg, 'shot');
            dead = true; break;
          }
          if (Player.inCar && d < 2 * 2) { damageCar(Player.inCar, b.dmg * 0.6); dead = true; break; }
        }
        if (b.from === 'player') {
          for (const p of Peds.list) {
            if (p.state === 'dead') continue;
            if (dist2(b.x, b.z, p.x, p.z) < 0.55 * 0.55) { Peds.damage(p, b.dmg, 'player'); dead = true; break; }
          }
          if (!dead) for (const c of Cars.list) {
            if (c.dead || c.occupied) continue;
            if (dist2(b.x, b.z, c.x, c.z) < 2.2 * 2.2 && Math.abs(b.y - 1) < 1.5) {
              damageCar(c, b.dmg * 0.7);
              if (c.ai && c.ai.kind === 'police') Crimes.add(1);
              dead = true; break;
            }
          }
        }
      }
      if (dead) { this.items.splice(i, 1); continue; }
      const o = ni * 6;
      attr.array[o] = b.px; attr.array[o + 1] = b.py; attr.array[o + 2] = b.pz;
      attr.array[o + 3] = b.x; attr.array[o + 4] = b.y; attr.array[o + 5] = b.z;
      ni++;
    }
    this.lines.visible = ni > 0;
    attr.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, ni * 2);
  }
};

/* ---------- Подбор предметов ---------- */
const Pickups = {
  list: [],
  add(x, z, kind, amount) {
    const geo = kind === 'money' ? new THREE.BoxGeometry(0.5, 0.14, 0.34)
      : kind === 'health' ? new THREE.BoxGeometry(0.5, 0.3, 0.34)
      : new THREE.BoxGeometry(0.44, 0.3, 0.3);
    const mat = new THREE.MeshLambertMaterial({ color: kind === 'money' ? 0x4caf50 : kind === 'health' ? 0xe53935 : 0xffc94d });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.35, z);
    City3D.scene.add(m);
    this.list.push({ x, z, kind, amount, mesh: m });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.mesh.rotation.y += dt * 2;
      if (dist2(p.x, p.z, Player.x, Player.z) < 1.4 * 1.4 && !Player.inCar) {
        if (p.kind === 'money') { Player.money += p.amount; HUD.toast('+' + fmtMoney(p.amount)); }
        else if (p.kind === 'health') { Player.health = Math.min(100, Player.health + 25); HUD.toast('+Здоровье'); }
        else { const w = Player.weapon; if (w.ammo !== Infinity) Player.weapons[Player.wi].ammo += 10; HUD.toast('+Патроны'); }
        City3D.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.list.splice(i, 1);
        AudioSys.buy();
      }
    }
  }
};

/* ---------- Взрывы ---------- */
function explode(x, z, radius, srcCar) {
  City3D.addShake(1.2);
  AudioSys.explosion();
  City3D.addDecal(x, z, rand(2.6, 3.6), 0x141414);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU, s = rand(4, 16);
    City3D.spark(x, 0.6, z, Math.sin(a) * s, rand(3, 10), Math.cos(a) * s, rand(0.3, 0.8),
      1, rand(0.4, 0.8), 0.1);
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, s = rand(1, 5);
    City3D.puff(x + rand(-1, 1), 0.8, z + rand(-1, 1), Math.sin(a) * s, rand(1.5, 3.5), Math.cos(a) * s,
      rand(1.2, 2.4), 0.22, 0.2, 0.2, rand(0.8, 1.4));
  }
  // урон
  const dP = dist(x, z, Player.x, Player.z);
  if (dP < radius && Player.alive && !Player.inCar) Player.damage(75 * (1 - dP / radius), 'boom');
  if (dP < radius && Player.inCar) damageCar(Player.inCar, 90 * (1 - dP / radius));
  for (let i = Cars.list.length - 1; i >= 0; i--) {
    const c = Cars.list[i];
    if (c === srcCar) continue;
    const d = dist(x, z, c.x, c.z);
    if (d < radius) damageCar(c, 95 * (1 - d / radius));
  }
  for (const p of Peds.list) {
    const d = dist(x, z, p.x, p.z);
    if (d < radius * 0.9) Peds.kill(p, srcCar ? 'player' : 'other');
  }
  Peds.scareNear(x, z);
  Net.send({ t: 'bm', x, z });
}

/* ---------- Преступления / розыск ---------- */
const Crimes = {
  level: 0,
  cool: 0,
  decayT: 0,
  add(n) {
    if (this.level >= 5) return;
    this.level = Math.min(5, this.level + n);
    this.cool = 14;
    this.decayT = 0;
  },
  onShotNear(x, z) {
    Peds.scareNear(x, z);
    // выстрелы на публике повышают розыск
    if (Math.random() < 0.3 && this.level < 3) this.add(0);
  },
  update(dt) {
    this.cool -= dt;
    if (this.cool > 0) return;
    if (this.level > 0) {
      this.decayT += dt;
      if (this.decayT > 22) {
        this.decayT = 0;
        this.level--;
      }
    }
  }
};
