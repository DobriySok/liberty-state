'use strict';
/* ================= ПЕШЕХОДЫ-ИГРОК: реальные FBX-персонажи Kenney
   (каждый инстанс — отдельная загрузка файла, никаких сломанных клонов скелета) ================= */

function makeCharacter(skin) {
  return new Promise((res, rej) => {
    const fbx = new THREE.FBXLoader();
    fbx.load('assets/people/characterMedium.fbx', model => {
      model.traverse(o => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.map = Assets.charSkins[skin] || Assets.charSkins.humanMaleA;
        }
      });
      /* самонормализация: фактический мировой размер -> рост 1.78 м, низ на y=0 */
      model.updateMatrixWorld(true);
      let wb = new THREE.Box3().setFromObject(model);
      const s = 1.78 / Math.max(0.1, wb.max.y - wb.min.y);
      model.scale.multiplyScalar(s);
      model.updateMatrixWorld(true);
      wb = new THREE.Box3().setFromObject(model);
      model.position.y -= wb.min.y;
      const mixer = new THREE.AnimationMixer(model);
      const act = {};
      for (const k of ['idle', 'run', 'jump'])
        if (Assets.charProto.clips[k]) { act[k] = mixer.clipAction(Assets.charProto.clips[k]); }
      if (act.idle) act.idle.play();
      const group = new THREE.Group();
      group.add(model);
      group.userData = { mixer, act, cur: act.idle || null };
      // тень
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10), Game.shadowMat);
      sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03;
      group.add(sh);
      res(group);
    }, undefined, rej);
  });
}

function charAnim(group, moving, dt) {
  const u = group.userData;
  if (!u.mixer) return;
  u.mixer.update(dt);
  const want = moving ? (u.act.run || u.act.idle) : (u.act.idle || u.act.run);
  if (want && want !== u.cur) {
    if (u.cur) u.cur.fadeOut(0.12);
    want.reset().fadeIn(0.12).play();
    u.cur = want;
  }
  if (u.act.run) u.act.run.timeScale = 1.15;
}

/* ================= Пешеходы (NPC) ================= */
const Peds = {
  list: [], spawnT: 0,

  async spawnOne(x, z) {
    const skin = pick(Assets.charFiles);
    const group = await makeCharacter(skin);
    group.position.set(x, 0, z);
    Game.scene.add(group);
    const ped = {
      group, x, z, angle: Math.random() * 6.28,
      state: 'walk', target: null, waitT: 0, hp: 40, speed: rand(1.6, 2.4),
      armed: false, panicT: 0
    };
    this.list.push(ped);
    return ped;
  },

  update(dt) {
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.list.length < 14) {
      this.spawnT = 0.7;
      const p = World.spawnPts[(Math.random() * World.spawnPts.length) | 0];
      const d = dist(p.x, p.z, Game.player.x, Game.player.z);
      if (d > 40 && d < 150) this.spawnOne(p.x + rand(-6, 6), p.z + rand(-6, 6));
    }
    for (const p of [...this.list]) {
      if (p.dead) { p.deadT -= dt; if (p.deadT < 0) this.remove(p); continue; }
      const pl = Game.player;
      const dP = dist(p.x, p.z, pl.x, pl.z);
      if (dP > 200) { this.remove(p); continue; }
      if (p.panicT > 0) {
        p.panicT -= dt;
        // бежим от игрока
        const ax = p.x - pl.x, az = p.z - pl.z, l = Math.hypot(ax, az) || 1;
        this._move(p, ax / l, az / l, 5.2, dt);
      } else {
        if (!p.target || dist(p.x, p.z, p.target.x, p.target.z) < 2) {
          const t = World.spawnPts[(Math.random() * World.spawnPts.length) | 0];
          p.target = t;
        }
        const dx = p.target.x - p.x, dz = p.target.z - p.z, l = Math.hypot(dx, dz) || 1;
        this._move(p, dx / l, dz / l, p.speed, dt);
      }
      charAnim(p.group, p.panicT > 0 || p.speed > 0, dt);
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.angle;
    }
  },

  _move(p, dx, dz, spd, dt) {
    const nx = p.x + dx * spd * dt, nz = p.z + dz * spd * dt;
    const c = World.collide(nx, nz, 0.4);
    p.x = c.x; p.z = c.z;
    p.angle = angLerp(p.angle, Math.atan2(dx, dz), Math.min(1, 10 * dt));
  },

  panic(x, z, r) {
    for (const p of this.list) if (!p.dead && dist2(p.x, p.z, x, z) < r * r) p.panicT = rand(3, 6);
  },

  kill(p, by) {
    if (p.dead) return;
    p.dead = true; p.deadT = 6;
    p.group.rotation.x = -Math.PI / 2;   // упал (визуально честно: труп лежит)
    p.group.position.y = 0.35;
    if (by === 'player') { Game.crime(1); Game.money += 25; HUD.toast('+ $25'); }
  },

  orPoliceNear(x, z, r) {
    for (const p of this.list) if (!p.dead && dist2(p.x, p.z, x, z) < r * r) return true;
    for (const c of Police.units) if (!c.v.dead && dist2(c.v.x, c.v.z, x, z) < r * r) return true;
    return false;
  },

  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    Game.scene.remove(p.group);
  },
  clear() { for (const p of [...this.list]) this.remove(p); }
};
