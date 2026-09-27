'use strict';
/* ================= WORLD: город из KayKit-деталей (CC0).
   Дороги — реальные модели road-*, кварталы — реальные здания,
   земля — фото-текстуры ambientCG. Коллизии — AABB. ================= */

const TILE = 4;              // метров между узлами дорожной сетки KayKit
const LINES = 13;            // линий дорог по каждой оси
const BLOCK = 3;             // клеток между линиями (размер квартала)
const CITY = (LINES - 1) * BLOCK * TILE + TILE;  // размер города, м

const World = {
  seed: 1,
  solids: [],      // AABB {x0,z0,x1,z1}
  spawnPts: [],    // точки на дорогах для трафика
  timeOfDay: 10.0, // часы
  sun: null, hemi: null, skyTex: null, skyCtx: null,

  gen(seed) {
    this.seed = seed >>> 0 || 1;
    const rng = mulberry32(this.seed);
    this.solids = []; this.spawnPts = [];
    if (this.group) { Game.scene.remove(this.group); this._dispose(this.group); }
    const G = this.group = new THREE.Group();
    Game.scene.add(G);

    this._ground();
    this._roads(rng);
    this._blocks(rng);
    this._lights();

    // свет
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x51584a, 0.75);
    G.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe8c8, 1.15);
    this.sun.position.set(120, 180, 60);
    G.add(this.sun);
    this._sky();
  },

  _dispose(g) { g.traverse(o => { }); },

  /* ---- земля: фото-трава ---- */
  _ground() {
    const t = Assets.tex.grass;
    t.repeat.set(CITY / 14, CITY / 14);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 1.6, CITY * 1.6), new THREE.MeshLambertMaterial({ map: t }));
    g.rotation.x = -Math.PI / 2; g.position.set(CITY / 2, 0, CITY / 2);
    this.group.add(g);
  },

  /* ---- дорожная сетка из моделей KayKit ---- */
  _roads(rng) {
    const P = TILE * BLOCK;        // шаг линий
    const list = [];               // {name, x, z, ry}
    const roadY = 0.02;
    const cross = (i, j) => list.push({ n: 'road-junction', x: i * P, z: j * P, ry: 0 });
    const straight = (x, z, vert) => list.push({ n: 'road-straight', x, z, ry: vert ? Math.PI / 2 : 0 });

    for (let j = 0; j < LINES; j++) for (let i = 0; i < LINES; i++) {
      const x = i * P, z = j * P;
      cross(i, j);
      if (i < LINES - 1) for (let k = 1; k <= BLOCK - 1; k++) straight(x + k * TILE, z, false);
      if (j < LINES - 1) for (let k = 1; k <= BLOCK - 1; k++) straight(x, z + k * TILE, true);
    }
    const g = new THREE.Group();
    // дорогам KayKit слегка возвращаем асфальтовую серость (атлас у них палёвый)
    const roadTint = new THREE.MeshLambertMaterial({ map: Assets.cityMat.map, color: 0x9aa0a8 });
    for (const it of list) {
      const m = Assets.mesh(it.n, it.n.startsWith('road') ? roadTint : Assets.cityMat);
      m.position.set(it.x, roadY, it.z); m.rotation.y = it.ry;
      g.add(m);
      this.spawnPts.push({ x: it.x, z: it.z });
    }
    this.group.add(g);
  },

  /* ---- кварталы: здания KayKit + пропсы, AABB-коллизии ---- */
  _blocks(rng) {
    const P = TILE * BLOCK;
    const bp = new THREE.Group();
    const bDefs = ['building-A','building-B','building-C','building-D','building-E','building-F','building-G','building-H'];
    const deco = ['bench', 'dumpster', 'firehydrant', 'bush'];
    const tConc = Assets.tex.concrete; tConc.repeat.set(2, 2);

    for (let bj = 0; bj < LINES - 1; bj++) for (let bi = 0; bi < LINES - 1; bi++) {
      const x0 = bi * P + TILE, z0 = bj * P + TILE;   // внутренняя область квартала
      const cx = x0 + (P - TILE) / 2, cz = z0 + (P - TILE) / 2;
      const kind = rng();
      if (kind < 0.12) { // парк:Concrete-дорожка, кусты, лавки, водонапорка в центре карты
        const bushN = 3 + (rng() * 4 | 0);
        for (let k = 0; k < bushN; k++) {
          const m = Assets.mesh('bush');
          m.position.set(x0 + rng() * (P - TILE), 0, z0 + rng() * (P - TILE));
          const s = 0.8 + rng() * 0.6; m.scale.setScalar(s);
          bp.add(m);
        }
        if (rng() < 0.4) { const w = Assets.mesh('watertower'); w.position.set(cx, 0, cz); bp.add(w); this._aabbModel(w); }
        for (let k = 0; k < 2; k++) { const b = Assets.mesh('bench'); b.position.set(cx + (k ? 3 : -3), 0, cz); b.rotation.y = rng() * 6.28; bp.add(b); }
        continue;
      }
      // бетонная площадка квартала
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(P - TILE + 1.2, P - TILE + 1.2), new THREE.MeshLambertMaterial({ map: tConc.clone() }));
      pad.material.map.needsUpdate = true; pad.material.map.repeat.set(3, 3);
      pad.rotation.x = -Math.PI / 2; pad.position.set(cx, 0.015, cz);
      bp.add(pad);

      // здания: 1 крупный или 2 поменьше; «башня» — ярусы реальных моделей
      // KayKit-мини-масштаб: здание 2x2x1.65 -> масштаб BS приводит к городским габаритам
      const BS = 2.2;
      const mid = Math.abs(bi - (LINES - 1) / 2) < 2.5 && Math.abs(bj - (LINES - 1) / 2) < 2.5; // центр — высотки
      const place = (name, x, z, ry, tier2) => {
        const m = Assets.mesh(name, tier2 ? Assets.bMat : Assets.cityMat);
        const s = Assets.size[name];
        m.scale.setScalar(BS);
        m.position.set(x, 0, z); m.rotation.y = ry;
        bp.add(m);
        const hw = (ry % Math.PI === 0 ? s.x : s.z) * BS / 2, hd = (ry % Math.PI === 0 ? s.z : s.x) * BS / 2;
        this.solids.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
        if (tier2) { // ярусы сверху
          const m2 = Assets.mesh(name, Assets.bMat);
          m2.scale.setScalar(BS);
          m2.position.set(x, s.y * BS - 0.02, z); m2.rotation.y = ry; bp.add(m2);
          if (mid && rng() < 0.5) { const m3 = Assets.mesh(name, Assets.bMat); m3.scale.setScalar(BS); m3.position.set(x, s.y * 2 * BS - 0.04, z); m3.rotation.y = ry; bp.add(m3); }
        }
      };
      const big = mid || rng() < 0.45;
      if (big) place(pick(bDefs), cx, cz, (rng() * 4 | 0) * Math.PI / 2, true);
      else {
        place(pick(bDefs), cx - 3.4, cz - 3.2, (rng() * 4 | 0) * Math.PI / 2, false);
        place(pick(bDefs), cx + 3.4, cz + 3.2, (rng() * 4 | 0) * Math.PI / 2, false);
      }
      // декор по углам
      for (let k = 0; k < 2; k++) {
        const d = Assets.mesh(pick(deco));
        d.scale.setScalar(1.7);
        d.position.set(x0 + rng() * (P - TILE), 0, z0 + rng() * (P - TILE));
        d.rotation.y = rng() * 6.28; bp.add(d);
      }
    }
    this.group.add(bp);
  },

  _aabbModel(m) {
    const s = Assets.size[m.userData.geoName];
    this.solids.push({ x0: m.position.x - s.x / 2, z0: m.position.z - s.z / 2, x1: m.position.x + s.x / 2, z1: m.position.z + s.z / 2 });
  },

  /* ---- фонари вдоль дорог (модели KayKit) ---- */
  _lights() {
    const P = TILE * BLOCK, g = new THREE.Group();
    for (let j = 0; j < LINES; j++) for (let i = 0; i < LINES - 1; i++) {
      if ((i + j) % 2) continue;
      const m = Assets.mesh('streetlight');
      m.position.set(i * P + TILE * 1.5, 0, j * P + 2.6);
      m.rotation.y = Math.PI;
      g.add(m);
      this.lampPos = this.lampPos || []; this.lampPos.push({ x: m.position.x, z: m.position.z });
    }
    this.group.add(g);
  },

  _skyStops(day) {
    const keys = [
      [0, [0x0a1226, 0x101c38, 0x1a2a4a]], [5, [0x0a1226, 0x1c2a4e, 0x3a4a6e]],
      [6.5, [0x31508c, 0xc46a3a, 0xf0b26a]], [9, [0x3f7ec4, 0x8db8e2, 0xcfe2ee]],
      [16, [0x3f7ec4, 0x8db8e2, 0xd8e4ea]], [19, [0x4a5ea0, 0xd07a40, 0xf2b968]],
      [20.5, [0x182448, 0x2a3a62, 0x4a4a6e]], [24, [0x0a1226, 0x101c38, 0x1a2a4a]]
    ];
    for (let i = 0; i < keys.length - 1; i++) {
      if (day >= keys[i][0] && day <= keys[i + 1][0]) {
        const t = (day - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
        const mix = (a, b) => {
          const r = ((a >> 16) + (((b >> 16) - (a >> 16)) * t)) | 0;
          const g = ((a >> 8 & 255) + (((b >> 8 & 255) - (a >> 8 & 255)) * t)) | 0;
          const bl = ((a & 255) + (((b & 255) - (a & 255)) * t)) | 0;
          return (r << 16) | (g << 8) | bl;
        };
        return [mix(keys[i][1][0], keys[i + 1][1][0]), mix(keys[i][1][1], keys[i + 1][1][1]), mix(keys[i][1][2], keys[i + 1][1][2])];
      }
    }
    return [0x3f7ec4, 0x8db8e2, 0xcfe2ee];
  },

  /* ---- небо: canvas-градиент, перекрашивается временем суток ---- */
  _sky() {
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    this.skyCtx = c.getContext('2d');
    this.skyTex = new THREE.CanvasTexture(c);
    this.skyTex.encoding = THREE.sRGBEncoding;
    Game.scene.background = this.skyTex;
    Game.scene.fog = new THREE.Fog(0xcfe2ee, 90, 420);
  },

  updateSky() {
    const stops = this._skyStops(this.timeOfDay);
    const x = this.skyCtx, g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#' + stops[0].toString(16).padStart(6, '0'));
    g.addColorStop(0.55, '#' + stops[1].toString(16).padStart(6, '0'));
    g.addColorStop(1, '#' + stops[2].toString(16).padStart(6, '0'));
    x.fillStyle = g; x.fillRect(0, 0, 2, 256);
    this.skyTex.needsUpdate = true;
    const night = clamp((this.timeOfDay < 6.5 || this.timeOfDay > 19.5) ? 1 : 0, 0, 1);
    const dusk = (this.timeOfDay > 18 && this.timeOfDay < 20) || (this.timeOfDay > 5.5 && this.timeOfDay < 7.5);
    this.sun.intensity = night ? 0.12 : (dusk ? 0.7 : 1.1);
    this.hemi.intensity = night ? 0.32 : 0.75;
    Game.scene.fog.color.setHex(night ? 0x10182a : (dusk ? 0xd8b090 : 0xcfe2ee));
    if (Assets.bMat) Assets.bMat.emissiveIntensity = night ? 0.85 : (dusk ? 0.35 : 0);
  },

  /* ---- коллизии: окружность против AABB ---- */
  collide(x, z, r) {
    let hit = false;
    for (const s of this.solids) {
      const nx = clamp(x, s.x0, s.x1), nz = clamp(z, s.z0, s.z1);
      const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) { const d = Math.sqrt(d2), push = (r - d) / d; x += dx * push; z += dz * push; }
        else { // центр внутри — выталкиваем к ближайшей грани
          const l = x - s.x0, rr = s.x1 - x, t = z - s.z0, b = s.z1 - z;
          const m = Math.min(l, rr, t, b);
          if (m === l) x = s.x0 - r; else if (m === rr) x = s.x1 + r; else if (m === t) z = s.z0 - r; else z = s.z1 + r;
        }
      }
    }
    const b = CITY - 2;
    x = clamp(x, 2, b); z = clamp(z, 2, b);
    return { x, z, hit };
  },
  solidAt(x, z) {
    for (const s of this.solids) if (x > s.x0 - .4 && x < s.x1 + .4 && z > s.z0 - .4 && z < s.z1 + .4) return true;
    return false;
  }
};
