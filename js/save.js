'use strict';
/* ================= СОХРАНЕНИЯ (localStorage) ================= */

const Save = {
  key: 'liberty-state-save-v1',
  data() {
    return {
      v: 1,
      seed: World.seed,
      x: Player.x, z: Player.z,
      money: Player.money,
      health: Player.health,
      armor: Player.armor,
      weapons: Player.weapons.map(w => ({ id: w.id, ammo: w.ammo })),
      mission: Missions.idx,
      time: Date.now()
    };
  },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data())); } catch (e) {}
  },
  load() {
    try {
      const s = localStorage.getItem(this.key);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },
  has() { return !!this.load(); },
  clear() { try { localStorage.removeItem(this.key); } catch (e) {} }
};
