'use strict';
/* ================= ИИ: трафик, полиция, соперники ================= */

function randomWalkPath(startIdx, hops) {
  const path = [startIdx];
  let cur = startIdx;
  for (let i = 0; i < hops; i++) {
    const adj = World.nodes[cur].adj;
    let next = adj[Math.floor(Math.random() * adj.length)];
    if (path.length > 1 && next === path[path.length - 2])
      next = adj[Math.floor(Math.random() * adj.length)];
    path.push(next);
    cur = next;
  }
  return path;
}

// ведёт машину по пути узлов (с смещением в свою полосу)
function followPath(c, ai, boost) {
  const nodes = World.nodes;
  if (ai.idx >= ai.path.length) return { done: true };
  const to = nodes[ai.path[ai.idx]];
  const from = ai.idx > 0 ? nodes[ai.path[ai.idx - 1]] : to;
  let dirx = to.x - from.x, dirz = to.z - from.z;
  const dl = Math.hypot(dirx, dirz) || 1;
  dirx /= dl; dirz /= dl;
  const tx = to.x + dirz * 1.2, tz = to.z - dirx * 1.2; // правая полоса
  const desired = Math.atan2(tx - c.x, tz - c.z);
  const diff = angDiff(c.angle, desired);
  const steer = clamp(diff * 1.7, -1, 1);
  // машина впереди?
  let blocked = false;
  for (const o of Cars.list) {
    if (o === c || o.dead) continue;
    if (dist2(c.x, c.z, o.x, o.z) < 64) {
      const ahead = (o.x - c.x) * Math.sin(c.angle) + (o.z - c.z) * Math.cos(c.angle) > 0;
      if (ahead) { blocked = true; break; }
    }
  }
  const dTo = dist(c.x, c.z, tx, tz);
  let throttle = 1;
  if (blocked) throttle = dTo < 8 ? -0.4 : 0;
  if (boost) throttle = 1;
  c.setInput(throttle, steer, false);
  if (dTo < 3) {
    ai.idx++;
    if (ai.idx >= ai.path.length) return { done: true };
  }
  return { done: false };
}

/* ---------- Трафик ---------- */
const Traffic = {
  cars: [],
  spawnT: 0,
  update(dt) {
    const max = City3D.QUAL[City3D.quality].traffic;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.7;
      const alive = this.cars.filter(c => !c.dead).length;
      if (alive < max) {
        for (let tries = 0; tries < 8; tries++) {
          const n = World.nodes[Math.floor(Math.random() * World.nodes.length)];
          const d = dist(n.x, n.z, Player.x, Player.z);
          if (d < 70 || d > 170) continue;
          const types = ['sedan', 'sedan', 'taxi', 'van', 'truck', 'sedan'];
          const car = new Car(n.x, n.z, 0, types[Math.floor(Math.random() * types.length)]);
          car.ai = { kind: 'traffic', path: randomWalkPath(n.i, 5), idx: 0 };
          car.angle = 0;
          Cars.add(car);
          this.cars.push(car);
          break;
        }
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.dead) { this.cars.splice(i, 1); continue; }
      const r = followPath(c, c.ai, false);
      if (r.done) c.ai.path = randomWalkPath(c.ai.path[c.ai.path.length - 1], 5), c.ai.idx = 0;
      if (dist2(c.x, c.z, Player.x, Player.z) > 190 * 190) {
        Cars.remove(c);
        this.cars.splice(i, 1);
      }
    }
  }
};

/* ---------- Полиция ---------- */
const Police = {
  cars: [],
  patrol: null,
  update(dt) {
    const need = Crimes.level;
    // фоновый патруль
    if (this.patrol && this.patrol.dead) this.patrol = null;
    if (!this.patrol && Crimes.level === 0) {
      for (let tries = 0; tries < 8; tries++) {
        const n = World.nodes[Math.floor(Math.random() * World.nodes.length)];
        if (dist(n.x, n.z, Player.x, Player.z) < 120) continue;
        const car = new Car(n.x, n.z, 0, 'police');
        car.ai = { kind: 'patrol', path: randomWalkPath(n.i, 6), idx: 0 };
        Cars.add(car);
        this.patrol = car;
        break;
      }
    } else if (this.patrol && Crimes.level > 0) {
      // патруль переключается на преследование
      this.patrol.ai.kind = 'police';
      this.patrol.ai.path = [];
      this.patrol.ai.idx = 0;
      this.patrol.ai.repathT = 0;
      this.cars.push(this.patrol);
      this.patrol = null;
    }

    // спавн по уровню розыска
    while (this.cars.length < need) {
      let best = null;
      for (let tries = 0; tries < 10; tries++) {
        const n = World.nodes[Math.floor(Math.random() * World.nodes.length)];
        const d = dist(n.x, n.z, Player.x, Player.z);
        if (d > 60 && d < 150) { best = n; break; }
      }
      if (!best) best = World.nodes[Math.floor(Math.random() * World.nodes.length)];
      const car = new Car(best.x, best.z, 0, 'police');
      car.ai = { kind: 'police', path: [], idx: 0, repathT: 0 };
      Cars.add(car);
      this.cars.push(car);
    }
    while (this.cars.length > need) {
      const c = this.cars.pop();
      if (c && !c.dead) Cars.remove(c);
    }

    // логика погон
    for (const c of this.cars) {
      if (c.dead) continue;
      const ai = c.ai;
      ai.repathT = (ai.repathT || 0.8) - dt;
      const dP = dist(c.x, c.z, Player.x, Player.z);
      // прямое преследование, если близко
      if (dP < 45) {
        const tx = Player.x, tz = Player.z;
        const desired = Math.atan2(tx - c.x, tz - c.z);
        const steer = clamp(angDiff(c.angle, desired) * 1.8, -1, 1);
        let throttle = 1;
        if (!Player.inCar) throttle = dP < 5 ? 0 : 1;
        c.setInput(throttle, steer, false);
        if (!Player.inCar && Crimes.level >= 2 && dP < 4.5 && Math.abs(c.v) < 12 && Player.alive) {
          Player.arrestT += dt;
          if (Player.arrestT > 1.4) Player.bust();
        }
      } else {
        if (ai.repathT <= 0 || ai.path.length === 0) {
          ai.repathT = 0.9;
          ai.path = World.pathTo(World.nearestNode(c.x, c.z), World.nearestNode(Player.x, Player.z));
          ai.idx = 1;
        }
        const r = followPath(c, ai, true);
        if (r.done) { ai.path = []; ai.idx = 0; }
        if (Player.inCar && dP < 25) c.v = Math.min(c.v + 2 * dt * 10, Meshes.CAR_TYPES.police.max * 1.15);
      }
      // уехал далеко — сбрасываем
      if (dP > 260 && Crimes.level === 0) Cars.remove(c);
    }
    this.cars = this.cars.filter(c => !c.dead);
  }
};

/* ---------- Соперники (миссии) ---------- */
const Rivals = {
  cars: [],
  spawn(x, z, type) {
    const c = new Car(x, z, 0, type || 'muscle', 0x555555);
    c.ai = { kind: 'chase' };
    c.health = 60;
    Cars.add(c);
    this.cars.push(c);
    return c;
  },
  update(dt) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.dead) { this.cars.splice(i, 1); continue; }
      const dx = Player.x - c.x, dz = Player.z - c.z;
      const d = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      const steer = clamp(angDiff(c.angle, desired) * 1.8, -1, 1);
      c.setInput(1, steer, false);
      c.v = Math.min(c.v + 1.5 * dt * 8, Meshes.CAR_TYPES[c.type].max * 1.12);
      if (d > 320) { Cars.remove(c); this.cars.splice(i, 1); }
    }
  },
  clear() {
    for (const c of this.cars) if (!c.dead) Cars.remove(c);
    this.cars = [];
  }
};
