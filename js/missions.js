'use strict';
/* ================= МИССИИ: доставка и зачистка, циклично. ================= */

const Missions = {
  idx: 0, active: null, marker: null,

  start() {
    this.idx++;
    const types = ['delivery', 'rampage'];
    const kind = types[this.idx % types.length];
    const P = TILE * BLOCK;
    if (kind === 'delivery') {
      const p = World.spawnPts[(Math.random() * World.spawnPts.length) | 0];
      this.active = { kind, stage: 0, tx: p.x, tz: p.z, time: 95, reward: 400 + this.idx * 60 };
      HUD.toast('ДОСТАВКА: садись в машину и приезжай на маркер. $' + this.active.reward);
    } else {
      const cx = Game.player.x, cz = Game.player.z;
      const targets = [];
      for (let i = 0; i < 4; i++) targets.push({ x: cx + rand(-60, 60), z: cz + rand(-60, 60) });
      this.active = { kind, stage: 0, targets, killed: 0, time: 150, reward: 600 + this.idx * 80 };
      HUD.toast('ЗАЧИСТКА: устрани 4 бандитов на маркерах. $' + this.active.reward);
      this._spawnRivals();
    }
    this._marker(this.active.tx != null ? this.active.tx : this.active.targets[0].x,
                 this.active.tz != null ? this.active.tz : this.active.targets[0].z);
  },

  _spawnRivals() {
    for (const t of this.active.targets) {
      Peds.spawnOne(t.x, t.z).then(p => { p.armed = true; p.hostile = true; t.ped = p; });
    }
  },

  _marker(x, z) {
    if (!this.marker) {
      const g = new THREE.CylinderGeometry(2.6, 2.6, 3.2, 18, 1, true);
      this.marker = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      Game.scene.add(this.marker);
    }
    this.marker.position.set(x, 1.6, z);
    this.marker.visible = true;
    this.marker.userData.tx = x; this.marker.userData.tz = z;
  },

  update(dt) {
    if (!this.active) {
      this.idleT = (this.idleT || 0) - dt;
      if (this.idleT <= 0) this.start();
      return;
    }
    const a = this.active, pl = Game.player;
    a.time -= dt;
    if (a.time <= 0) { HUD.toast('МИССИЯ ПРОВАЛЕНА'); this.abort(); return; }

    if (a.kind === 'delivery') {
      if (a.stage === 0 && pl.car && dist2(pl.x, pl.z, a.tx, a.tz) < 5 * 5) {
        a.stage = 1;
        HUD.toast('Отлично! Заезжай в точку — жёлтый маркер');
        const p = World.spawnPts[(Math.random() * World.spawnPts.length) | 0];
        let best = p, bd = 1e9;
        for (const q of World.spawnPts) { const d = dist2(q.x, q.z, a.tx, a.tz); if (d > 150 * 150 && d < bd) { bd = d; best = q; } }
        a.tx = best.x; a.tz = best.z;
        this._marker(a.tx, a.tz);
      } else if (a.stage === 1 && pl.car && dist2(pl.x, pl.z, a.tx, a.tz) < 5 * 5) {
        Game.money += a.reward;
        HUD.toast('ДОСТАВЛЕНО! + $' + a.reward);
        AudioSys.cash();
        this.abort(true);
      }
      if (a.stage === 0 && !pl.car) this._marker(a.tx, a.tz);
    } else {
      let alive = 0, any = null;
      for (const t of a.targets) {
        if (t.ped && !t.ped.dead) { alive++; any = t; }
      }
      if (any) this._marker(any.ped.x, any.ped.z);
      if (alive === 0) {
        Game.money += a.reward;
        HUD.toast('ЗОНА ЧИСТА! + $' + a.reward);
        AudioSys.cash();
        this.abort(true);
      }
    }
  },

  abort(done) {
    this.active = null;
    if (this.marker) this.marker.visible = false;
    this.idleT = done ? 8 : 4;
  }
};
