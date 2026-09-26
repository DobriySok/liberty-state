'use strict';
/* ================= 3D-ВИЗУАЛ Сущностей: машины, пешеходы, игрок =================
   Машины и люди — 3D-модели Kenney (CC0) из Assets3D; физика не зависит от визуала
   (габариты берутся из CAR_TYPES). */

const Meshes = {
  CAR_TYPES: {
    sedan:  { name: 'Седан',     L: 4.4, W: 1.8,  max: 27, acc: 9,  turn: 2.3, mass: 1.0, cab: 2.2 },
    sport:  { name: 'Спорткар',  L: 4.3, W: 1.85, max: 34, acc: 14, turn: 2.9, mass: 0.9, cab: 2.0, low: true },
    muscle: { name: 'Мускул',    L: 4.7, W: 1.85, max: 31, acc: 12, turn: 2.5, mass: 1.05, cab: 2.1 },
    taxi:   { name: 'Такси',     L: 4.4, W: 1.8,  max: 27, acc: 9,  turn: 2.3, mass: 1.0, cab: 2.2 },
    van:    { name: 'Фургон',    L: 4.9, W: 1.9,  max: 24, acc: 8,  turn: 1.9, mass: 1.4, cab: 2.6, boxy: true },
    truck:  { name: 'Грузовик',  L: 6.3, W: 2.0,  max: 20, acc: 6,  turn: 1.5, mass: 1.9, cab: 1.8, boxy: true },
    police: { name: 'Полиция',   L: 4.5, W: 1.85, max: 30, acc: 11, turn: 2.5, mass: 1.0, cab: 2.2 }
  },
  PAINTS: [0x8899aa, 0xaa6644, 0x667788, 0xbbb444, 0x778899, 0x996666, 0x556677, 0xcccccc, 0x886644],

  /* ---------- Машина: 3D-модель + (для полиции) мигалка ---------- */
  car(type, paintHex) {
    const T = this.CAR_TYPES[type];
    const group = Assets3D.car(type);
    return group;
  },

  /* ---------- Пешеход: 3D-персонаж со скином и анимациями ---------- */
  ped(shirtHex, skinHex, hasGun) {
    const skins = [
      { id: 'humanMaleA', tint: 0xffffff },
      { id: 'humanFemaleA', tint: 0xffffff },
      { id: 'zombieMaleA', tint: 0x3a3f46 }  // «соперник» — тёмный
    ];
    const skin = hasGun ? skins[2] : skins[Math.floor(Math.random() * 2)];
    const group = Assets3D.person(skin.id, hasGun);
    // лёгкая тонировка одежды под «цвет рубашки» (материалы клонированы на инстанцию)
    if (!hasGun && shirtHex) {
      const c = new THREE.Color(shirtHex).lerp(new THREE.Color(0xffffff), 0.45);
      group.traverse(o => {
        if (o.isMesh && o.material && o.material.map) o.material.color.copy(c);
      });
    }
    return group;
  },

  /* ---------- Игрок: персонаж + оружие в правой руке ---------- */
  player(shirtHex) {
    const group = Assets3D.person('humanMaleA', true);
    return group;
  }
};
