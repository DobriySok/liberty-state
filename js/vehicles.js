'use strict';
/* ================= ТРАНСПОРТ: настоящая аркадная физика.
   Скорость — вектор (есть боковой занос), ручник срывает зад,
   руль скоростозависимый, урон, дым, столкновения. ================= */

const CAR_TYPES = {
  sedan:   { name: 'Седан',    max: 30, acc: 11, turn: 2.6, grip: 6.0, gl: 1.6 },
  taxi:    { name: 'Такси',    max: 29, acc: 11, turn: 2.6, grip: 6.0, gl: 1.6 },
  wagon:   { name: 'Универсал',max: 27, acc: 10, turn: 2.4, grip: 6.2, gl: 1.5 },
  hatch:   { name: 'Хэтчбек',  max: 28, acc: 12, turn: 2.9, grip: 6.4, gl: 1.7 },
  police:  { name: 'Полицейская', max: 33, acc: 14, turn: 2.9, grip: 7.0, gl: 1.8 }
};
const CAR_MODEL = { sedan: 'car-sedan', taxi: 'car-taxi', wagon: 'car-stationwagon', hatch: 'car-hatchback', police: 'car-police' };

class Vehicle {
  constructor(type, x, z, angle) {
    this.type = type; this.T = CAR_TYPES[type];
    this.x = x; this.z = z; this.angle = angle;
    this.vx = 0; this.vz = 0;      // скорость, м/с (вектор!)
    this.steer = 0;
    this.throttle = 0; this.steerIn = 0; this.hand = false;
    this.hp = 100; this.dead = false; this.driver = null;   // 'player' | 'ai' | 'cop' | null
    this.ai = null;
    this.smokeT = 0;
    this.len = 4.2, this.wid = 1.9;
    this.mesh = Assets.mesh(CAR_MODEL[type]);
    this.mesh.scale.setScalar(4.6);   // KayKit-мини (0.94 м) -> настоящая машина ~4.3 м
    Game.scene.add(this.mesh);
    // тень-блоб
    const sh = new THREE.Mesh(new THREE.CircleGeometry(2.4, 12), Game.shadowMat);
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.scale.set(1, 0.55, 1);
    this.mesh.add(sh);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  fwd() { return { x: Math.sin(this.angle), z: Math.cos(this.angle) }; }

  destroy() { Game.scene.remove(this.mesh); }

  update(dt) {
    if (this.dead) return;
    const T = this.T;
    // --- руль: скоростозависимый ---
    this.steer += (this.steerIn - this.steer) * Math.min(1, 10 * dt);
    const sp = this.speed;
    const fwd = this.fwd();
    const dir = (this.vx * fwd.x + this.vz * fwd.z) >= 0 ? 1 : -1;

    // --- тяга вдоль носа ---
    let engine = this.throttle * T.acc;
    if (this.throttle * dir < 0) engine *= 2.2;              // торможение сильнее разгона
    const cap = T.max;
    let vf = this.vx * fwd.x + this.vz * fwd.z;              // продольная
    if (Math.abs(this.throttle) > 0.01 && Math.abs(vf) < cap)
      vf += engine * dt * (this.throttle < 0 ? -1 : 1) * (this.throttle < 0 ? (dir > 0 ? 1 : 0.6) : 1);
    // сопротивление
    vf *= (1 - 0.45 * dt);
    if (this.hand) vf *= (1 - 2.4 * dt);
    vf = clamp(vf, -cap * 0.4, cap);

    // --- боковое: сцепление (ручник его рвёт => занос) ---
    let right = { x: fwd.z, z: -fwd.x };
    let vr = this.vx * right.x + this.vz * right.z;
    const grip = this.hand ? T.gl : T.grip;
    vr *= Math.max(0, 1 - grip * dt);

    // --- поворот от руля и скорости ---
    const turnRate = this.steer * T.turn * clamp(Math.abs(vf) / 12, 0, 1) * (vf < 0 ? -1 : 1) * (this.hand ? 1.5 : 1);
    this.angle += turnRate * dt;
    // занос добавляет боковую при повороте на скорости
    vr += turnRate * Math.abs(vf) * 0.06;

    this.vx = fwd.x * vf + right.x * vr;
    this.vz = fwd.z * vf + right.z * vr;

    // --- движение + коллизии ---
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const c = World.collide(nx, nz, 1.6);
    if (c.hit) {
      const impact = this.speed;
      if (impact > 8) { this.hp -= (impact - 8) * 2.2; AudioSys.crash(impact); if (this.driver === 'player') Game.camShake(0.35); }
      // гасим нормальную составляющую
      this.vx *= 0.4; this.vz *= 0.4;
      nx = c.x; nz = c.z;
    }
    this.x = nx; this.z = nz;

    // --- урон/дым/смерть ---
    if (this.hp < 40) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = this.hp < 15 ? 0.06 : 0.25; Game.puff(this.x, 1.0, this.z, this.hp < 15); }
      if (this.hp <= 0) this.explode();
    }

    // --- визуал ---
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
    // лёгкий крен в поворотах
    this.mesh.rotation.z = clamp(-this.steer * Math.abs(vf) * 0.006, -0.09, 0.09);
  }

  explode() {
    this.dead = true;
    Game.boom(this.x, this.z);
    if (this.driver === 'player') Game.playerLeaveCar(true);
    for (const arr of [Vehicles.list]) {
      /* noop */
    }
  }

  /* ИИ-вести по дорогам: цель — ближайший узел сетки в направлении движения */
  driveAI(dt) {
    const ai = this.ai;
    if (!ai) return;
    if (ai.target == null || dist(this.x, this.z, ai.tx, ai.tz) < 6) {
      // выбрать следующий узел
      const P = TILE * BLOCK;
      const ci = Math.round(this.x / P), cj = Math.round(this.z / P);
      let bi = ci, bj = cj;
      if (ai.dir == null) ai.dir = (Math.random() * 4) | 0;
      if (Math.random() < 0.25) ai.dir = (ai.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
      const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][ai.dir];
      bi = clamp(ci + D[0] * 2, 0, (LINES - 1)); bj = clamp(cj + D[1] * 2, 0, (LINES - 1));
      ai.tx = bi * P; ai.tz = bj * P; ai.target = 1;
    }
    const want = Math.atan2(ai.tx - this.x, ai.tz - this.z);
    const diff = angDiff(this.angle, want);
    this.steerIn = clamp(diff * 1.6, -1, 1);
    this.throttle = Math.abs(diff) > 1.2 ? 0.25 : 0.85;
    if (this.type === 'police' && this.ai.chase) this.throttle = 1;
  }
}

const Vehicles = {
  list: [],
  add(v) { this.list.push(v); return v; },
  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    v.destroy();
  },
  clear() { for (const v of [...this.list]) this.remove(v); },
  update(dt) {
    for (const v of this.list) {
      if (v.dead) { v.deadT = (v.deadT == null ? 12 : v.deadT) - dt; if (v.deadT <= 0) this.remove(v); continue; }
      if (v.driver === 'ai' || v.driver === 'cop') v.driveAI(dt);
      v.update(dt);
    }
    // столкновения машина-машина (окружности)
    for (let i = 0; i < this.list.length; i++) for (let j = i + 1; j < this.list.length; j++) {
      const a = this.list[i], b = this.list[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, rr = 3.1;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, ov = (rr - d) / 2;
        a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
        const rel = Math.abs(a.speed - b.speed) + 1;
        if (rel > 10) { a.hp -= rel * 0.4; b.hp -= rel * 0.4; AudioSys.crash(rel); }
        const dotA = a.vx * nx + a.vz * nz, dotB = b.vx * nx + b.vz * nz;
        if (dotA > 0) { a.vx -= nx * dotA * 1.2; a.vz -= nz * dotA * 1.2; }
        if (dotB < 0) { b.vx -= nx * dotB * 1.2; b.vz -= nz * dotB * 1.2; }
      }
    }
  },
  nearest(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const v of this.list) {
      if (v.dead || v.driver) continue;
      const d2 = dist2(x, z, v.x, v.z);
      if (d2 < bd) { bd = d2; best = v; }
    }
    return best;
  },
  /* трафик: держим N машин вокруг игрока */
  spawnT: 0,
  traffic(dt) {
    this.spawnT -= dt;
    const want = 10;
    const aiCount = this.list.filter(v => v.driver === 'ai' && !v.dead).length;
    if (this.spawnT <= 0 && aiCount < want) {
      this.spawnT = 0.9;
      const pts = World.spawnPts;
      for (let t = 0; t < 6; t++) {
        const p = pts[(Math.random() * pts.length) | 0];
        const d = dist(p.x, p.z, Game.player.x, Game.player.z);
        if (d < 50 || d > 170) continue;
        if (Peds.orPoliceNear(p.x, p.z, 6)) continue;
        if (Vehicles.list.some(v => !v.dead && dist2(v.x, v.z, p.x, p.z) < 100)) continue; // не спавним вплотную
        const type = pick(['sedan', 'taxi', 'wagon', 'hatch', 'sedan']);
        const v = this.add(new Vehicle(type, p.x, p.z, Math.random() * 6.28));
        v.driver = 'ai'; v.ai = {};
        break;
      }
    }
    // деспавн далёких
    for (const v of [...this.list])
      if (v.driver === 'ai' && dist2(v.x, v.z, Game.player.x, Game.player.z) > 220 * 220) this.remove(v);
  }
};
