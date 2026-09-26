'use strict';
/* ================= 3D-модели: машины, пешеходы, игрок =================
   Всё собирается из примитивов в ОДНУ геометрию с вершинными цветами
   (один draw call на машину/пешехода) — быстро даже на слабых ПК. */

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
  _palm: null,

  /* ---------- Машина: возвращает Group ---------- */
  car(type, paintHex, opts) {
    const T = this.CAR_TYPES[type];
    const L = T.L, W = T.W;
    const paint = paintHex != null ? paintHex : pick(this.PAINTS);
    const group = new THREE.Group();
    const b = City3D._builder();
    const bodyY = T.low ? 0.26 : 0.32;
    const bodyH = T.low ? 0.42 : 0.5;

    // корпус
    City3D._boxRaw(b, L, bodyH, W, 0, bodyY + bodyH / 2, 0, paint);
    // капот/крылья чуть светлее — верхняя грань
    City3D._boxRaw(b, L * 0.98, 0.06, W * 0.94, 0, bodyY + bodyH + 0.03, 0, 0xffffff);
    // кабина
    if (T.boxy) {
      City3D._boxRaw(b, T.cab, 0.62, W * 0.96, -L / 2 + 0.5, bodyY + bodyH + 0.31, 0, paint);
      City3D._boxRaw(b, T.cab * 0.85, 0.4, W * 0.8, -L / 2 + 0.5, bodyY + bodyH + 0.36, 0, 0x39485a);
    } else {
      const cx = T.cab * 0.5 + 0.15;
      City3D._boxRaw(b, T.cab, 0.44, W * 0.86, cx - 0.2, bodyY + bodyH + 0.22, 0, 0x39485a);
      City3D._boxRaw(b, T.cab * 0.9, 0.1, W * 0.9, cx - 0.25, bodyY + bodyH + 0.47, 0, paint);
    }
    // спойлер для спорткара
    if (T.low) {
      City3D._boxRaw(b, 0.12, 0.3, W * 0.9, -L / 2 + 0.25, bodyY + bodyH + 0.3, 0, paint);
      City3D._boxRaw(b, 0.5, 0.08, 0.2, -L / 2 + 0.25, bodyY + bodyH + 0.12, W * 0.32, 0x22262c);
      City3D._boxRaw(b, 0.5, 0.08, 0.2, -L / 2 + 0.25, bodyY + bodyH + 0.12, -W * 0.32, 0x22262c);
    }
    // фара/хвост
    City3D._boxRaw(b, 0.14, 0.16, 0.4, L / 2 - 0.05, bodyY + bodyH * 0.65, W * 0.3, 0xffedb0);
    City3D._boxRaw(b, 0.14, 0.16, 0.4, L / 2 - 0.05, bodyY + bodyH * 0.65, -W * 0.3, 0xffedb0);
    City3D._boxRaw(b, 0.1, 0.14, 0.45, -L / 2 + 0.03, bodyY + bodyH * 0.6, W * 0.3, 0xb03028);
    City3D._boxRaw(b, 0.1, 0.14, 0.45, -L / 2 + 0.03, bodyY + bodyH * 0.6, -W * 0.3, 0xb03028);
    // колёса
    for (const [wx, wz] of [[L * 0.32, W * 0.46], [L * 0.32, -W * 0.46], [-L * 0.32, W * 0.46], [-L * 0.32, -W * 0.46]]) {
      City3D._cylXZ(b, 0.34, 0.26, wx, 0.34, wz, 0x181a1e, 8);
    }
    const mesh = new THREE.Mesh(b.build(), City3D.matDetail);
    group.add(mesh);

    let lightbar = null;
    if (type === 'police') {
      // полицейские полосы
      const sb = City3D._builder();
      City3D._boxRaw(sb, L * 0.5, 0.12, W + 0.02, 0.2, bodyY + 0.1, 0, 0x1a2438);
      const sm = new THREE.Mesh(sb.build(), City3D.matDetail);
      group.add(sm);
      // мигалка (эмиссивная, анимируется)
      const barMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
      lightbar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.34), barMat);
      lightbar.position.set(0.15, bodyY + bodyH + (T.boxy ? 0.72 : 0.56), 0);
      group.add(lightbar);
    }
    if (type === 'taxi') {
      const sb = City3D._builder();
      City3D._boxRaw(sb, 0.7, 0.28, 0.4, 0, bodyY + bodyH + 0.62, 0, 0xf5d76e);
      group.add(new THREE.Mesh(sb.build(), City3D.matDetail));
    }
    // грузовик: кузов
    if (type === 'truck') {
      const sb = City3D._builder();
      City3D._boxRaw(sb, L - 2.2, 1.1, W * 0.96, -(L - 2.2) / 2 - 0.55, bodyY + bodyH + 0.55, 0, 0x9aa0a8);
      group.add(new THREE.Mesh(sb.build(), City3D.matDetail));
    }

    group.userData = {
      type, paint, len: L, wid: W,
      lightbar,
      bodyY,
      radius: Math.max(L, W) * 0.42
    };
    return group;
  },

  /* ---------- Пешеход (одна геометрия) ---------- */
  ped(shirtHex, skinHex, hasGun) {
    const b = City3D._builder();
    City3D._boxRaw(b, 0.22, 0.78, 0.22, -0.12, 0.39, 0, 0x2e3440);
    City3D._boxRaw(b, 0.22, 0.78, 0.22, 0.12, 0.39, 0, 0x2e3440);
    City3D._boxRaw(b, 0.52, 0.62, 0.3, 0, 1.1, 0, shirtHex);
    City3D._boxRaw(b, 0.56, 0.18, 0.34, 0, 1.32, 0, shirtHex);
    City3D._boxRaw(b, 0.3, 0.3, 0.3, 0, 1.68, 0, skinHex);
    City3D._boxRaw(b, 0.15, 0.55, 0.17, -0.36, 1.08, 0, shirtHex);
    City3D._boxRaw(b, 0.15, 0.55, 0.17, 0.36, 1.08, 0, shirtHex);
    if (hasGun) City3D._boxRaw(b, 0.1, 0.1, 0.42, 0.42, 1.15, 0.12, 0x181a1e);
    return new THREE.Mesh(b.build(), City3D.matDetail);
  },

  /* ---------- Игрок (с анимацией конечностей) ---------- */
  player(shirtHex) {
    const group = new THREE.Group();
    const skin = 0xd8a878;
    const legGeo = new THREE.BoxGeometry(0.22, 0.78, 0.22);
    legGeo.translate(0, -0.39, 0);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x39415a });
    const legL = new THREE.Mesh(legGeo, legMat);
    const legR = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.12, 0.78, 0);
    legR.position.set(0.12, 0.78, 0);
    const bodyB = City3D._builder();
    City3D._boxRaw(bodyB, 0.56, 0.66, 0.32, 0, 1.12, 0, shirtHex);
    City3D._boxRaw(bodyB, 0.32, 0.32, 0.32, 0, 1.74, 0, skin);
    City3D._boxRaw(bodyB, 0.16, 0.58, 0.18, -0.38, 1.12, 0, shirtHex);
    const body = new THREE.Mesh(bodyB.build(), City3D.matDetail);
    const armGeo = new THREE.BoxGeometry(0.15, 0.56, 0.17);
    armGeo.translate(0, -0.26, 0);
    const armMat = new THREE.MeshLambertMaterial({ color: shirtHex });
    const armL = new THREE.Mesh(armGeo, armMat);
    const armR = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.38, 1.38, 0);
    armR.position.set(0.38, 1.38, 0);
    // оружие в правой руке
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x181a1e }));
    gun.position.set(0, -0.52, 0.22);
    armR.add(gun);
    group.add(legL, legR, body, armL, armR);
    group.userData = { legL, legR, armL, armR, gun, walkT: 0 };
    return group;
  },

  /* ---------- вспомогательные push в билдер ---------- */
};

// примитивы для билдера (без UV-атласа)
City3D._boxRaw = function (b, w, h, d, cx, cy, cz, hex) {
  const tmp = new THREE.BoxGeometry(w, h, d);
  const p = tmp.attributes.position.array, n = tmp.attributes.normal.array;
  const c = new THREE.Color(hex);
  for (let i = 0; i < 24; i++) {
    b.pos.push(p[i * 3] + cx, p[i * 3 + 1] + cy, p[i * 3 + 2] + cz);
    b.norm.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
    b.uv.push(0, 0);
    b.col.push(c.r, c.g, c.b);
  }
  tmp.dispose();
};
City3D._cylXZ = function (b, r, h, cx, cy, cz, hex, seg) {
  const tmp = new THREE.CylinderGeometry(r, r, h, seg || 8);
  tmp.rotateX(Math.PI / 2);
  const p = tmp.attributes.position.array, n = tmp.attributes.normal.array;
  const c = new THREE.Color(hex);
  for (let i = 0; i < p.length / 3; i++) {
    b.pos.push(p[i * 3] + cx, p[i * 3 + 1] + cy, p[i * 3 + 2] + cz);
    b.norm.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
    b.uv.push(0, 0);
    b.col.push(c.r, c.g, c.b);
  }
  tmp.dispose();
};
