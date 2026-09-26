'use strict';
/* ================= МИР: карта, тайлы, граф дорог, POI =================
   Все данные процедурные и детерминированные (сид).
   Единицы: 1 тайл = 4 метра. Мир 128x128 тайлов = 512x512 м. */

const TILE = 4;
const MAPW = 128, MAPH = 128;
const WORLD_M = MAPW * TILE;

const T = {
  WATER: 0, SAND: 1, ROAD: 2, SIDEWALK: 3, GRASS: 4,
  BUILDING: 5, RUNWAY: 6, PAVEMENT: 7, LOT: 8, PARK: 9
};
const SOLID_T = { 0: 1, 5: 1 }; // вода и здания непроходимы

const LINES = [14, 30, 46, 62, 78, 94, 110]; // центральные линии улиц (каждая 2 тайла шириной)
const RUNWAY = { x0: 70, x1: 122, y0: 5, y1: 10 };
const HELIPAD = { x: 75, y: 6 }; // в тайлах

const World = {
  seed: 0,
  rng: null,
  tiles: null,
  buildings: [],  // {x0,y0,w,h, ht, facade, roof, tint, poi}
  trees: [],      // {x, z, kind}  (метры)
  props: [],      // {x, z, kind}  (метры)
  pois: [],       // {x, z, w, h, type, doorX, doorZ}  (метры)
  nodes: [],      // узлы графа дорог {x, z, i, adj:[]}
  minimap: null,  // canvas 128x128 для HUD
  aabbs: [],      // AABB зданий для камеры
  START: { x: 75 * TILE, z: 105 * TILE },

  gen(seed) {
    this.seed = seed;
    const rng = mulberry32(seed);
    // детерминированный randi (тень глобального!) — критично для мультиплеера
    const randi = (a, b) => a + Math.floor(rng() * (b - a + 1));
    this.rng = rng;
    const W = this;
    W.tiles = new Uint8Array(MAPW * MAPH).fill(T.GRASS);
    W.buildings = []; W.trees = []; W.props = []; W.pois = []; W.aabbs = [];

    const set = (x, y, t) => {
      if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return;
      W.tiles[y * MAPW + x] = t;
    };
    const get = (x, y) => (x < 0 || y < 0 || x >= MAPW || y >= MAPH) ? T.WATER : W.tiles[y * MAPW + x];

    // --- граница: вода (2), песок (1) ---
    for (let x = 0; x < MAPW; x++) { set(x, 0, T.WATER); set(x, 1, T.WATER); set(x, 2, T.SAND); set(x, 125, T.SAND); set(x, 126, T.WATER); set(x, 127, T.WATER); }
    for (let y = 3; y < 125; y++) { set(0, y, T.WATER); set(1, y, T.WATER); set(2, y, T.SAND); set(125, y, T.SAND); set(126, y, T.WATER); set(127, y, T.WATER); }

    // --- дороги ---
    for (const L of LINES) {
      for (let x = 3; x < 125; x++) { set(x, L, T.ROAD); set(x, L + 1, T.ROAD); }
      for (let y = 3; y < 125; y++) { set(L, y, T.ROAD); set(L + 1, y, T.ROAD); }
    }
    // тротуары: кольцо вокруг дорог
    const mark = [];
    for (let y = 3; y < 125; y++) for (let x = 3; x < 125; x++) {
      if (get(x, y) !== T.ROAD) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const t = get(nx, ny);
        if (t !== T.ROAD && t !== T.WATER && t !== T.SAND) mark.push([nx, ny]);
      }
    }
    for (const [x, y] of mark) if (get(x, y) !== T.ROAD && get(x, y) !== T.WATER && get(x, y) !== T.SAND) set(x, y, T.SIDEWALK);

    // --- ВПП ---
    for (let y = RUNWAY.y0; y <= RUNWAY.y1; y++)
      for (let x = RUNWAY.x0; x <= RUNWAY.x1; x++)
        if (get(x, y) !== T.ROAD) set(x, y, T.RUNWAY);

    /* --- расчёт «естественной» высоты: модель масштабируется под габарит квартала,
          высота = высота модели * sxz (без неестественного растяжения) --- */
    const natH = (varId, w, h, margin) => {
      const v = Assets3D.v[varId];
      if (!v) return 8;
      const sxz = Math.min((w * TILE) / v.bb.w, (h * TILE) / v.bb.d) * margin;
      return Math.max(4, v.bb.h * sxz);
    };

    // --- POI (построим первыми, чтобы случайные здания не мешали) ---
    const POI_DEFS = [
      { x0: 50, y0: 50, w: 6, h: 4, type: 'hospital', var: 'commercial/building-n' },
      { x0: 86, y0: 50, w: 5, h: 4, type: 'police', var: 'commercial/building-k' },
      { x0: 52, y0: 68, w: 4, h: 3, type: 'shop', var: 'commercial/building-c' },
      { x0: 88, y0: 68, w: 4, h: 3, type: 'shop', var: 'commercial/building-j' },
      { x0: 68, y0: 100, w: 5, h: 3, type: 'garage', var: 'industrial/building-f' },
      { x0: 54, y0: 102, w: 3, h: 3, type: 'cafe', var: 'commercial/building-d' }
    ];
    for (const p of POI_DEFS) {
      for (let y = p.y0; y < p.y0 + p.h; y++) for (let x = p.x0; x < p.x0 + p.w; x++) set(x, y, T.BUILDING);
      const ht = natH(p.var, p.w, p.h, 0.95);
      W.buildings.push({ x0: p.x0, y0: p.y0, w: p.w, h: p.h, ht, cls: 'mid', var: p.var, poi: p.type });
      W.pois.push({
        x: (p.x0 + p.w / 2) * TILE, z: (p.y0 + p.h / 2) * TILE,
        w: p.w * TILE, h: p.h * TILE, type: p.type,
        doorX: (p.x0 + p.w / 2) * TILE, doorZ: (p.y0 + p.h + 0.6) * TILE,
        wallZ: (p.y0 + p.h) * TILE + 0.12,
        ht: ht
      });
    }
    // хангары и башня на аэродроме
    const hangar = (x0, y0, w, h, varId) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, T.BUILDING);
      const ht = natH(varId, w, h, 0.95);
      W.buildings.push({ x0, y0, w, h, ht, cls: 'ind', var: varId, poi: null });
    };
    hangar(114, 4, 8, 2, 'industrial/building-a');
    hangar(103, 4, 6, 2, 'industrial/building-c');
    W.buildings.push({ x0: 121, y0: 4, w: 1, h: 1, ht: 24, cls: 'tower', var: 'commercial/building-skyscraper-d', poi: null }); // диспетчерская башня

    // --- клетки (кварталы) ---
    const cells = [[3, 13], [17, 29], [33, 45], [49, 61], [65, 77], [81, 93], [97, 109], [113, 124]];

    const free = (x, y) => {
      const t = get(x, y);
      return t === T.GRASS || t === T.PARK || t === T.LOT || t === T.PAVEMENT;
    };
    const placeB = (x0, y0, w, h, cls, ht, poi, fixedVar) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!free(x, y)) return false;
      const pool = Assets3D.POOLS[cls];
      const varId = fixedVar || pool[randi(0, pool.length - 1)];
      const v = Assets3D.v[varId];
      const finalHt = (cls === 'tower' && ht) ? ht : natH(varId, w, h, 0.85);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, T.BUILDING);
      W.buildings.push({ x0, y0, w, h, ht: finalHt, cls, var: varId, poi: poi || null });
      return true;
    };
    const tree = (tx, tz) => {
      if (!free(tx, tz) && get(tx, tz) !== T.SAND) return;
      W.trees.push({ x: (tx + 0.5) * TILE + (rng() - 0.5) * 2, z: (tz + 0.5) * TILE + (rng() - 0.5) * 2,
        kind: 'tree', sz: randi(0, 1) });
    };
    const palm = (tx, tz) => {
      if (get(tx, tz) !== T.SAND && get(tx, tz) !== T.GRASS) return;
      W.trees.push({ x: (tx + 0.5) * TILE + (rng() - 0.5) * 2, z: (tz + 0.5) * TILE + (rng() - 0.5) * 2, kind: 'palm' });
    };

    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
      const [x0, x1] = cells[cx], [y0, y1] = cells[cy];
      let district;
      if (cy === 0 && cx >= 4) district = 'airport';
      else if (cy === 0) district = 'countryside';
      else if (cy >= 6) district = 'south';
      else if (cx >= 6) district = 'industrial';
      else if (cx <= 2) district = 'residential';
      else if (cy >= 2 && cy <= 5) district = 'downtown';
      else district = 'suburbs';

      if (district === 'downtown') {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (free(x, y)) set(x, y, T.PAVEMENT);
        const dCenter = dist(cx + 0.5, cy + 0.5, 3.5, 3.5);
        const nB = 3 + (rng() < 0.5 ? 1 : 0);
        for (let i = 0; i < nB; i++) {
          const w = 4 + randi(0, 2), h = 3 + randi(0, 2);
          const bx = x0 + randi(0, x1 - x0 - w + 1), by = y0 + randi(0, y1 - y0 - h + 1);
          if (rng() < 0.5) {
            // небоскрёб: чем ближе к центру, тем выше
            const ht = Math.round(lerp(54, 26, clamp(dCenter / 4, 0, 1)) + rng() * 8);
            placeB(bx, by, w, h, 'tower', ht);
          } else placeB(bx, by, w, h, 'mid');
        }
        for (let i = 0; i < 3; i++) tree(x0 + randi(0, x1 - x0), y0 + randi(0, y1 - y0));
      }
      else if (district === 'residential') {
        const nH = 4 + randi(0, 2);
        for (let i = 0; i < nH; i++) {
          const w = 2 + (rng() < 0.4 ? 1 : 0), h = 2 + (rng() < 0.4 ? 1 : 0);
          placeB(x0 + randi(0, x1 - x0 - w + 1), y0 + randi(0, y1 - y0 - h + 1), w, h, 'house');
        }
        for (let i = 0; i < 5; i++) tree(x0 + randi(0, x1 - x0), y0 + randi(0, y1 - y0));
      }
      else if (district === 'suburbs') {
        for (let i = 0; i < 3; i++) {
          const w = 2, h = 2 + (rng() < 0.5 ? 1 : 0);
          placeB(x0 + randi(0, x1 - x0 - w + 1), y0 + randi(0, y1 - y0 - h + 1), w, h, 'house');
        }
        for (let i = 0; i < 4; i++) tree(x0 + randi(0, x1 - x0), y0 + randi(0, y1 - y0));
      }
      else if (district === 'industrial') {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (free(x, y) && rng() < 0.5) set(x, y, T.LOT);
        const nW = 2 + (rng() < 0.5 ? 1 : 0);
        for (let i = 0; i < nW; i++) {
          const w = 5 + randi(0, 2), h = 3 + randi(0, 2);
          placeB(x0 + randi(0, x1 - x0 - w + 1), y0 + randi(0, y1 - y0 - h + 1), w, h, 'ind');
        }
        for (let i = 0; i < 2; i++)
          W.props.push({ x: (x0 + randi(2, x1 - 2) + 0.5) * TILE, z: (y0 + randi(2, y1 - 2) + 0.5) * TILE, kind: 'tank' });
      }
      else if (district === 'south') {
        if (cy === 7) {
          for (let y = Math.max(y0, 118); y <= y1; y++)
            for (let x = x0; x <= x1; x++) if (x > 8 && x < 120) set(x, y, T.SAND);
          for (let i = 0; i < 3; i++) palm(x0 + randi(1, x1 - 1), 119 + randi(0, 3));
          for (let i = 0; i < 2; i++) tree(x0 + randi(0, x1 - x0), y0 + randi(0, 1));
        } else {
          // парк
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (free(x, y)) set(x, y, T.PARK);
          // дорожки-аллеи
          for (let x = x0; x <= x1; x++) set(x, (y0 + y1) >> 1, T.PAVEMENT);
          for (let i = 0; i < 14; i++) tree(x0 + randi(0, x1 - x0), y0 + randi(0, y1 - y0));
          // пруд в клетке (3,6)
          if (cx === 3) for (let y = y0 + 3; y < y0 + 6; y++) for (let x = x0 + 4; x < x0 + 8; x++) if (get(x, y) === T.PARK) set(x, y, T.WATER);
        }
      }
      else if (district === 'countryside') {
        for (let i = 0; i < 4; i++) tree(x0 + randi(0, x1 - x0), y0 + randi(0, y1 - x0 > y1 - y0 ? y1 - y0 : x1 - x0));
        if (rng() < 0.8) {
          const w = 3, h = 2;
          placeB(x0 + randi(1, x1 - x0 - w), y0 + randi(1, y1 - y0 - h), w, h, 'house');
        }
      }
      // 'airport' — травяная зона + ВПП уже проставлены
    }

    // броварная полоса (променад) у пляжа
    for (let x = 16; x < 112; x++) { set(x, 115, T.PAVEMENT); set(x, 116, T.PAVEMENT); }

    // --- гарантированные «чистые» зоны для миссий (не зависят от сида) ---
    const RESERVES = [
      { x0: 65, x1: 72, y0: 51, y1: 58, t: T.PAVEMENT }, // парковка миссий в центре
      { x0: 23, x1: 27, y0: 43, y1: 47, t: T.GRASS },    // точка «Защитника района»
      { x0: 68, x1: 72, y0: 18, y1: 22, t: T.GRASS },
      { x0: 73, x1: 77, y0: 36, y1: 40, t: T.GRASS },
      { x0: 83, x1: 87, y0: 73, y1: 77, t: T.GRASS },
      { x0: 103, x1: 107, y0: 43, y1: 47, t: T.LOT },
      { x0: 98, x1: 100, y0: 21, y1: 23, t: T.LOT },   // водонапорная башня
      { x0: 103, x1: 106, y0: 42, y1: 45, t: T.LOT }   // ветряк
    ];
    for (const r of RESERVES)
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++)
          if (get(x, y) !== T.ROAD) set(x, y, r.t);
    // убираем здания, зацепившие резервные зоны
    W.buildings = W.buildings.filter(b => {
      const bx1 = b.x0 + b.w - 1, by1 = b.y0 + b.h - 1;
      return !RESERVES.some(r => b.x0 <= r.x1 && bx1 >= r.x0 && b.y0 <= r.y1 && by1 >= r.y0);
    });
    // деревья не сажать в зарезервированных зонах (пересаживаем лишние)
    W.trees = W.trees.filter(t => {
      const tx = Math.floor(t.x / TILE), ty = Math.floor(t.z / TILE);
      return !RESERVES.some(r => tx >= r.x0 - 1 && tx <= r.x1 + 1 && ty >= r.y0 - 1 && ty <= r.y1 + 1);
    });

    // фиксированные промышленные ориентиры (не зависят от сида)
    W.props.push({ x: 99.5 * TILE, z: 22.5 * TILE, kind: 'water-tower' });
    W.props.push({ x: 104.5 * TILE, z: 43.5 * TILE, kind: 'windmill' });

    W.buildRoadGraph();
    // AABB зданий (для камеры)
    for (const b of W.buildings)
      W.aabbs.push({ minX: b.x0 * TILE, minZ: b.y0 * TILE, maxX: (b.x0 + b.w) * TILE, maxZ: (b.y0 + b.h) * TILE, h: b.ht });
    W.buildMinimap();
  },

  tileAt(px, pz) {
    const tx = Math.floor(px / TILE), ty = Math.floor(pz / TILE);
    if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return T.WATER;
    return this.tiles[ty * MAPW + tx];
  },
  solidAt(px, pz) { return !!SOLID_T[this.tileAt(px, pz)]; },
  walkableAt(px, pz) { return !this.solidAt(px, pz); },
  isRoadArea(px, pz) {
    const t = this.tileAt(px, pz);
    return t === T.ROAD || t === T.RUNWAY;
  },

  // круг против твёрдых тайлов (XZ). Возвращает {x, z, hit}
  collideCircle(px, pz, r) {
    const tx0 = Math.floor((px - r) / TILE), tx1 = Math.floor((px + r) / TILE);
    const ty0 = Math.floor((pz - r) / TILE), ty1 = Math.floor((pz + r) / TILE);
    let nx = px, nz = pz, hit = false;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) continue;
      if (!SOLID_T[this.tiles[ty * MAPW + tx]]) continue;
      const cx = clamp(px, tx * TILE, (tx + 1) * TILE);
      const cz = clamp(pz, ty * TILE, (ty + 1) * TILE);
      const dx = px - cx, dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        const d = Math.sqrt(d2);
        if (d < 0.001) { nx = tx * TILE + (dx < 0 ? 0 : TILE) + (dx < 0 ? 0 : r); nz = cz; }
        else { const p = r - d; nx += dx / d * p; nz += dz / d * p; }
      }
    }
    nx = clamp(nx, TILE + r, WORLD_M - TILE - r);
    nz = clamp(nz, TILE + r, WORLD_M - TILE - r);
    return { x: nx, z: nz, hit };
  },

  /* --- граф дорог: узлы на перекрёстках --- */
  buildRoadGraph() {
    const W = this;
    W.nodes = [];
    const N = LINES.length;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
      W.nodes.push({ x: (LINES[i] + 1) * TILE, z: (LINES[j] + 1) * TILE, i: j * N + i, adj: [] });
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      if (i + 1 < N) { W.nodes[idx].adj.push(j * N + i + 1); W.nodes[j * N + i + 1].adj.push(idx); }
      if (j + 1 < N) { W.nodes[idx].adj.push((j + 1) * N + i); W.nodes[(j + 1) * N + i].adj.push(idx); }
    }
    W._N = N;
  },
  // ближайший узел к точке
  nearestNode(x, z) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = dist2(x, z, this.nodes[i].x, this.nodes[i].z);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  },
  // BFS по графу узлов: путь из a в b (массив индексов узлов)
  pathTo(a, b) {
    const n = this.nodes.length, parent = new Int16Array(n).fill(-1);
    const q = [a]; parent[a] = a;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur === b) break;
      for (const nb of this.nodes[cur].adj)
        if (parent[nb] < 0) { parent[nb] = cur; q.push(nb); }
    }
    if (parent[b] < 0) return [b];
    const path = [];
    for (let cur = b; cur !== a; cur = parent[cur]) path.push(cur);
    path.push(a);
    path.reverse();
    return path;
  },

  /* --- миникарта (2D canvas, для HUD) --- */
  buildMinimap() {
    if (typeof document === 'undefined') return;
    const c = makeCanvas(MAPW, MAPH);
    const g = c.getContext('2d');
    const cols = [
      '#204a6e', // вода
      '#d8c07a', // песок
      '#3f3f44', // дорога
      '#8f9296', // тротуар
      '#4d8f3f', // трава
      '#77777e', // здание
      '#4a4a50', // ВПП
      '#84868c', // мощение
      '#6b6257', // площадка
      '#3f7d36'  // парк
    ];
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      g.fillStyle = cols[this.tiles[y * MAPW + x]];
      g.fillRect(x, y, 1, 1);
    }
    this.minimap = c;
  }
};
