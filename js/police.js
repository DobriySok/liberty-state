'use strict';
/* ================= ПОЛИЦИЯ: розыск 1–6 звёзд, патрули и погони,
   при 3+ стреляют, арест при остановке. ================= */

const Police = {
  units: [], stars: 0, heat: 0, spawnT: 0,

  crime(n) {
    this.heat = Math.min(100, this.heat + n * 22);
    const before = this.stars;
    this.stars = this.heat > 85 ? 3 : this.heat > 60 ? 2 : this.heat > 32 ? 1 : 0;
    if (this.stars > before) HUD.toast('Розыск: ' + '★'.repeat(this.stars));
  },
  clear() { this.heat = 0; this.stars = 0; },

  update(dt) {
    const pl = Game.player;
    // спад жары вне поля зрения
    let seen = false;
    for (const u of this.units) if (!u.v.dead && dist2(u.v.x, u.v.z, pl.x, pl.z) < 60 * 60) seen = true;
    if (!seen) this.heat = Math.max(0, this.heat - dt * 3.5);
    const want = this.stars;
    const before = this.stars;
    this.stars = this.heat > 90 ? 4 : this.heat > 60 ? 2 + (this.heat > 75 ? 1 : 0) : this.heat > 32 ? 1 : 0;
    if (want && !this.stars) { this.clear(); HUD.toast('Розыск снят'); }

    // спавн патрулей по звёздам
    this.spawnT -= dt;
    const active = this.units.filter(u => !u.v.dead).length;
    if (this.stars > 0 && active < this.stars + 1 && this.spawnT <= 0) {
      this.spawnT = 3.5;
      const p = World.spawnPts[(Math.random() * World.spawnPts.length) | 0];
      const d = dist(p.x, p.z, pl.x, pl.z);
      if (d > 70 && d < 190) {
        const v = Vehicles.add(new Vehicle('police', p.x, p.z, Math.random() * 6.28));
        v.driver = 'cop'; v.ai = { chase: true };
        this.units.push({ v, state: 'chase' });
      }
    }

    for (const u of [...this.units]) {
      if (u.v.dead) { this.units.splice(this.units.indexOf(u), 1); continue; }
      const d = dist(u.v.x, u.v.z, pl.x, pl.z);
      // погоня: цель — игрок
      if (d < 140) {
        u.v.ai.tx = pl.x; u.v.ai.tz = pl.z; u.v.ai.target = 1;
        if (d < 16 && this.stars >= 3) {
          u.fireT = (u.fireT || 0) - dt;
          if (u.fireT <= 0) {
            u.fireT = rand(0.5, 1.1);
            AudioSys.shot(false);
            if (Math.random() < 0.45) { pl.damage(rand(4, 9)); HUD.toast('Под обстрелом!'); }
          }
        }
      }
      // арест: игрок пешком рядом, стоим
      if (!pl.car && d < 3.5 && u.v.speed < 3 && this.stars > 0) {
        u.bustT = (u.bustT || 0) + dt;
        if (u.bustT > 1.2) Game.busted();
      } else u.bustT = 0;
    }
  },
  clearAll() { for (const u of [...this.units]) Vehicles.remove(u.v); this.units = []; }
};
