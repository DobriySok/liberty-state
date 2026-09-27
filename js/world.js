'use strict';
/* ================= WORLD: город.
   Дороги — сплошное фото-асфальтовое полотно с разметкой (инстансы),
   тротуары с бордюрами, здания KayKit (CC0), деревья Kenney (CC0).
   Никаких «ковриков»: асфальт и тротуары слиты в единые меши. ================= */

const TILE = 4;
const LINES = 13;
const BLOCK = 3;
const P = TILE * BLOCK;              // шаг линий (12 м)
const ROADW = 6;                     // ширина проезда
const CITY = (LINES - 1) * P + TILE;

const World = {
  seed: 1,
  solids: [],
  spawnPts: [],
  timeOfDay: 10.0,
  sun: null, hemi: null, skyTex: null, skyCtx: null,

  gen(seed) {
    this.seed = seed >>> 0 || 1;
    const rng = mulberry32(this.seed);
    this.solids = []; this.spawnPts = []; this.lampPos = [];
    if (this.group) { Game.scene.remove(this.group); }
    const G = this.group = new THREE.Group();
    Game.scene.add(G);

    this._ground();
    this._roads(rng);
    this._blocks(rng);
    this._greenery(rng);
    this._lights();

    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x51584a, 0.75);
    G.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe8c8, 1.15);
    this.sun.position.set(120, 180, 60);
    G.add(this.sun);
    this._sky();
  },

  /* PlaneGeometry c UV, растянутыми под тайлинг (одна текстура на всё) */
  _tiledGeo(w, l, tw, tl) {
    const g = new THREE.PlaneGeometry(w, l);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tw), uv.getY(i) * (l / tl));
    uv.needsUpdate = true;
    return g;
  },

  /* ---- земля: фото-трава, тайл 5 м, мягкий тон ---- */
  _ground() {
    const mat = new THREE.MeshLambertMaterial({ map: Assets.tex.grass, color: 0xaabf8e });
    const m = new THREE.Mesh(this._tiledGeo(CITY * 1.7, CITY * 1.7, 5, 5), mat);
    m.position.set(CITY / 2, 0, CITY / 2);
    this.group.add(m);
  },

  /* ---- дороги: сплошной асфальт + разметка + тротуары с бордюрами ---- */
  _roads(rng) {
    const L = CITY + ROADW;
    // --- асфальт: 26 полотен, слитых в один меш ---
    const listA = [];
    for (let i = 0; i < LINES; i++) {
      const c = i * P;
      listA.push({ geo: this._tiledGeo(ROADW, L, 3, 6), matrix: trs(c, 0.02, CITY / 2, 0) });
      listA.push({ geo: this._tiledGeo(L, ROADW, 3, 6), matrix: trs(CITY / 2, 0.028, c, 0) });
    }
    const asphalt = new THREE.Mesh(mergeGeos(listA), new THREE.MeshLambertMaterial({ map: Assets.tex.asphalt }));
    this.group.add(asphalt);

    // --- разметка: инстансы белых полос (пунктир, края, зебры) ---
    const marks = [];   // {x, z, w, l}
    const segA = ROADW / 2 + 2, segB = P - ROADW / 2 - 2;
    for (let i = 0; i < LINES; i++) {
      const c = i * P;
      for (let j = 0; j < LINES - 1; j++) {
        const z0 = j * P + segA, z1 = (j + 1) * P - segA, sl = z1 - z0;
        const zm = (z0 + z1) / 2;
        // края (верт/гориз) + пунктир
        marks.push({ x: c - (ROADW / 2 - 0.6), z: zm, w: 0.14, l: sl }, { x: c + (ROADW / 2 - 0.6), z: zm, w: 0.14, l: sl });
        marks.push({ x: zm, z: c - (ROADW / 2 - 0.6), w: sl, l: 0.14 }, { x: zm, z: c + (ROADW / 2 - 0.6), w: sl, l: 0.14 });
        for (let z = z0 + 1; z < z1 - 1; z += 3.4) marks.push({ x: c, z, w: 0.16, l: 1.6 });
        for (let x = z0 + 1; x < z1 - 1; x += 3.4) marks.push({ x, z: c, w: 1.6, l: 0.16 });
      }
      // зебры вокруг перекрёстков
      for (let j = 0; j < LINES; j++) {
        const n = { x: c, z: j * P };
        for (let s = 0; s < 6; s++) {
          const o = -2.2 + s * 0.75;
          marks.push({ x: n.x + o, z: n.z - ROADW / 2 - 0.9, w: 0.5, l: 2.1 });
          marks.push({ x: n.x + o, z: n.z + ROADW / 2 + 0.9, w: 0.5, l: 2.1 });
          marks.push({ x: n.x - ROADW / 2 - 0.9, z: n.z + o, w: 2.1, l: 0.5 });
          marks.push({ x: n.x + ROADW / 2 + 0.9, z: n.z + o, w: 2.1, l: 0.5 });
        }
      }
    }
    const mgeo = new THREE.PlaneGeometry(1, 1); mgeo.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(mgeo, new THREE.MeshBasicMaterial({ color: 0xd6d7cf }), marks.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3();
    marks.forEach((mk, i) => {
      V.set(mk.x, 0.045, mk.z); S.set(mk.w, 1, mk.l);
      M.compose(V, Q, S); im.setMatrixAt(i, M);
    });
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);

    // --- тротуары с бордюрами: слиты в один меш ---
    const listS = [];
    const SW = 1.8;
    for (let i = 0; i < LINES; i++) {
      const c = i * P;
      for (let j = 0; j < LINES - 1; j++) {
        const z0 = j * P + ROADW / 2, z1 = (j + 1) * P - ROADW / 2, sl = z1 - z0, zm = (z0 + z1) / 2;
        listS.push({ geo: this._tiledGeo(SW, sl, 2.5, 2.5), matrix: trs(c - ROADW / 2 - SW / 2, 0.06, zm, 0) });
        listS.push({ geo: this._tiledGeo(SW, sl, 2.5, 2.5), matrix: trs(c + ROADW / 2 + SW / 2, 0.06, zm, 0) });
        listS.push({ geo: this._tiledGeo(sl, SW, 2.5, 2.5), matrix: trs(zm, 0.06, c - ROADW / 2 - SW / 2, 0) });
        listS.push({ geo: this._tiledGeo(sl, SW, 2.5, 2.5), matrix: trs(zm, 0.06, c + ROADW / 2 + SW / 2, 0) });
      }
    }
    this.concMat = new THREE.MeshLambertMaterial({ map: Assets.tex.concrete });
    this.group.add(new THREE.Mesh(mergeGeos(listS), this.concMat));

    // точки спавна на дороге
    for (let i = 0; i < LINES; i++) for (let j = 0; j < LINES; j++)
      this.spawnPts.push({ x: i * P, z: j * P });
  },

  /* ---- кварталы: здания KayKit плотнее, дворы с бетоном ---- */
  _blocks(rng) {
    const bp = new THREE.Group();
    const bDefs = ['building-A','building-B','building-C','building-D','building-E','building-F','building-G','building-H'];
    const deco = ['firehydrant', 'dumpster', 'bench'];
    const BS = 3.0;                      // масштаб зданий (2м-модель -> 6 м)
    const mid = (bi, bj) => Math.abs(bi - (LINES - 1) / 2) < 2.6 && Math.abs(bj - (LINES - 1) / 2) < 2.6;

    const place = (name, x, z, ry, tiers, scale) => {
      const s = Assets.size[name];
      const m = Assets.mesh(name, tiers > 1 ? Assets.bMat : Assets.cityMat);
      m.scale.setScalar(scale);
      m.position.set(x, 0, z); m.rotation.y = ry;
      bp.add(m);
      const rot = Math.abs(Math.sin(ry)) > 0.5;
      const hw = (rot ? s.z : s.x) * scale / 2, hd = (rot ? s.x : s.z) * scale / 2;
      this.solids.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
      for (let t = 1; t < tiers; t++) {
        const m2 = Assets.mesh(name, Assets.bMat);
        m2.scale.setScalar(scale);
        m2.position.set(x, s.y * scale * t - 0.03, z); m2.rotation.y = ry;
        bp.add(m2);
      }
      return s.y * scale * tiers;
    };

    for (let bj = 0; bj < LINES - 1; bj++) for (let bi = 0; bi < LINES - 1; bi++) {
      const x0 = bi * P + ROADW / 2 + 1.2, z0 = bj * P + ROADW / 2 + 1.2;
      const iw = P - ROADW - 2.4;                    // внутренний размер квартала (~3.6м? нет: 12-6-2.4=3.6)
      const cx = bi * P + P / 2, cz = bj * P + P / 2;
      const kind = rng();

      if (kind < 0.14) {                             // парк
        const n = 4 + (rng() * 4 | 0);
        for (let k = 0; k < n; k++) {
          const t = Assets.mesh(rng() < 0.6 ? 'tree-large' : 'tree-small', Assets.treeMat);
          t.scale.setScalar(rand(0.8, 1.25));
          t.position.set(cx + rand(-iw / 2, iw / 2) - 0, 0, cz + rand(-iw / 2, iw / 2));
          bp.add(t);
        }
        for (let k = 0; k < 2; k++) {
          const b = Assets.mesh('bench'); b.scale.setScalar(2.2);
          b.position.set(cx + (k ? 2.4 : -2.4), 0, cz); b.rotation.y = k ? 0 : Math.PI;
          bp.add(b);
        }
        if (rng() < 0.35) { const w = Assets.mesh('watertower'); w.scale.setScalar(2.6); w.position.set(cx, 0, cz); bp.add(w); }
        continue;
      }

      // двор: бетонная площадка
      const pad = new THREE.Mesh(this._tiledGeo(P - ROADW / 2 - 1, P - ROADW / 2 - 1, 2.5, 2.5), this.concMat);
      pad.position.set(cx, 0.045, cz);
      bp.add(pad);

      const rot = () => (rng() * 4 | 0) * Math.PI / 2;
      const big = mid(bi, bj);
      if (big) {
        place(pick(bDefs), cx, cz, rot(), 3, BS);
        place(pick(bDefs), cx - 5.2, cz + 5.2, rot(), 1, BS * 0.8);
        place(pick(bDefs), cx + 5.2, cz - 5.2, rot(), 1, BS * 0.8);
      } else {
        place(pick(bDefs), cx - 5.2, cz - 5.2, rot(), 1, BS);
        place(pick(bDefs), cx + 5.2, cz + 5.2, rot(), 1, BS);
        if (rng() < 0.5) place(pick(bDefs), cx + 5.2, cz - 5.2, rot(), 2, BS * 0.85);
        if (rng() < 0.5) place(pick(bDefs), cx - 5.2, cz + 5.2, rot(), 1, BS * 0.85);
      }
      // декор у тротуара
      for (let k = 0; k < 2; k++) {
        const d = Assets.mesh(pick(deco));
        d.scale.setScalar(1.8);
        d.position.set(x0 + rng() * iw, 0.06, z0 + rng() * iw);
        d.rotation.y = rng() * 6.28;
        bp.add(d);
      }
    }
    this.group.add(bp);
  },

  /* ---- зелень: деревья вдоль тротуаров ---- */
  _greenery(rng) {
    const g = new THREE.Group();
    const off = ROADW / 2 + 1.1;
    for (let i = 0; i < LINES; i++) {
      const c = i * P;
      for (let j = 0; j < LINES - 1; j++) {
        for (let t = 0; t < 2; t++) {
          const z = j * P + ROADW / 2 + 3 + t * (P - ROADW - 6) / 1;
          if (rng() < 0.45) continue;
          const side = rng() < 0.5 ? -1 : 1;
          const name = rng() < 0.6 ? 'tree-large' : 'tree-small';
          const tree = Assets.mesh(name, Assets.treeMat);
          const target = name === 'tree-large' ? rand(6.5, 8.5) : rand(4, 5.2);
          tree.scale.setScalar(target / Assets.size[name].y);
          tree.position.set(c + side * off, 0.05, z + rand(-1.5, 1.5));
          tree.rotation.y = rng() * 6.28;
          g.add(tree);
          // поперёк
          if (rng() < 0.5) {
            const t2 = Assets.mesh(rng() < 0.6 ? 'tree-large' : 'tree-small', Assets.treeMat);
            t2.scale.setScalar((rng() < 0.6 ? rand(6.5, 8.5) : rand(4, 5.2)) / Assets.size[name].y);
            t2.position.set(z + rand(-1.5, 1.5), 0.05, c + side * off);
            t2.rotation.y = rng() * 6.28;
            g.add(t2);
          }
        }
      }
    }
    this.group.add(g);
  },

  /* ---- фонари вдоль дорог ---- */
  _lights() {
    const g = new THREE.Group();
    for (let j = 0; j < LINES; j++) for (let i = 0; i < LINES - 1; i++) {
      if ((i + j) % 2) continue;
      const m = Assets.mesh('streetlight');
      m.scale.setScalar(3.4);
      m.position.set(i * P + P / 2, 0.05, j * P + ROADW / 2 + 0.9);
      m.rotation.y = Math.PI;
      g.add(m);
      this.lampPos.push({ x: m.position.x, z: m.position.z });
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

  _sky() {
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    this.skyCtx = c.getContext('2d');
    this.skyTex = new THREE.CanvasTexture(c);
    this.skyTex.encoding = THREE.sRGBEncoding;
    Game.scene.background = this.skyTex;
    Game.scene.fog = new THREE.Fog(0xcfe2ee, 90, 420);
    this.updateSky();
  },

  updateSky() {
    const stops = this._skyStops(this.timeOfDay);
    const x = this.skyCtx, g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#' + stops[0].toString(16).padStart(6, '0'));
    g.addColorStop(0.55, '#' + stops[1].toString(16).padStart(6, '0'));
    g.addColorStop(1, '#' + stops[2].toString(16).padStart(6, '0'));
    x.fillStyle = g; x.fillRect(0, 0, 2, 256);
    this.skyTex.needsUpdate = true;
    const night = (this.timeOfDay < 6.5 || this.timeOfDay > 19.5) ? 1 : 0;
    const dusk = (this.timeOfDay > 18 && this.timeOfDay < 20) || (this.timeOfDay > 5.5 && this.timeOfDay < 7.5);
    this.sun.intensity = night ? 0.12 : (dusk ? 0.7 : 1.1);
    this.hemi.intensity = night ? 0.32 : 0.75;
    Game.scene.fog.color.setHex(night ? 0x10182a : (dusk ? 0xd8b090 : 0xcfe2ee));
    if (Assets.bMat) Assets.bMat.emissiveIntensity = night ? 0.85 : (dusk ? 0.35 : 0);
  },

  collide(x, z, r) {
    let hit = false;
    for (const s of this.solids) {
      const nx = clamp(x, s.x0, s.x1), nz = clamp(z, s.z0, s.z1);
      const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) { const d = Math.sqrt(d2), push = (r - d) / d; x += dx * push; z += dz * push; }
        else {
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
