'use strict';
/* ================= ГОРОД 3D: Three.js, стриминг чанков + 3D-модели =================
   Мир разбит на чанки 16x16 тайлов (64x64 м): разметка/мебель стримятся по чанкам.
   Здания и деревья — 3D-модели Kenney (CC0), scene-wide InstancedMesh по вариантам
   (один draw call на вариант) — мало батчей даже на слабых ПК. */

const City3D = {
  scene: null, camera: null, renderer: null,
  CH: 16,               // тайлов в чанке
  CHM: 16 * TILE,       // метров
  chunks: new Map(),    // "cx,cy" -> {group, loadedAt}
  quality: 'high',
  QUAL: {
    high: { radius: 4, fogFar: 340, dpr: 2, traffic: 18, particles: 1 },
    med:  { radius: 3, fogFar: 280, dpr: 1, traffic: 14, particles: 0.6 },
    low:  { radius: 2, fogFar: 210, dpr: 1, traffic: 10, particles: 0.35 }
  },
  signTex: null,
  matDetail: null, matTree: null,
  matSign: null, matShadow: null, matDecal: null, matWater: null,
  groundMesh: null, waterMesh: null,
  signMesh: null,
  shadowMesh: null, decalMesh: null,
  sparks: null, smoke: null,
  cam: null,
  shake: 0,
  time: 0,
  bGroup: null,         // instanced-здания (статичные, на весь мир)
  landmarks: null,      // водонапорка/ветряк
  _tIdx: null,
  UP: null,
  _m4: null, _q: null, _v: null, _s: null,

  init(canvas) {
    const W = this, scene = W.scene = new THREE.Scene();
    W.seed = World.seed;
    const q = W.QUAL[W.quality];
    W.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 600);
    W.camera.position.set(0, 10, 0);

    W.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    W.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
    W.renderer.setSize(innerWidth, innerHeight, false);

    // небо (градиент) + туман
    const skyC = makeCanvas(2, 256);
    const sg = skyC.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2f6fb8');
    grad.addColorStop(0.45, '#7db4e2');
    grad.addColorStop(0.78, '#cfe4ee');
    grad.addColorStop(0.92, '#e8ddc6');
    grad.addColorStop(1, '#e8ddc6');
    sg.fillStyle = grad; sg.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(skyC);
    scene.background = skyTex;
    scene.fog = new THREE.Fog(0xcfd8dc, 70, q.fogFar);

    // свет
    scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x4a5244, 0.72));
    const sun = new THREE.DirectionalLight(0xffe3b8, 1.18);
    sun.position.set(140, 200, 70);
    scene.add(sun);

    W.buildSignAtlas();
    W.matDetail = new THREE.MeshLambertMaterial({ vertexColors: true });
    W.matTree = new THREE.MeshLambertMaterial({ color: 0xffffff });
    W.matPalm = new THREE.MeshLambertMaterial({ vertexColors: true });
    W.matSign = new THREE.MeshBasicMaterial({ map: W.signTex });
    W.matShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    W.matDecal = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false });

    W.UP = new THREE.Vector3(0, 1, 0);
    W._m4 = new THREE.Matrix4(); W._q = new THREE.Quaternion(); W._v = new THREE.Vector3(); W._s = new THREE.Vector3();

    W.buildGround();
    W.buildWater();
    W.buildSigns();
    W.buildShadows();
    W.buildDecals();
    W.buildParticles();
    W.buildIndex();
    W.buildBuildings();
    W.buildLandmarks();
    W.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };

    addEventListener('resize', () => {
      W.camera.aspect = innerWidth / innerHeight;
      W.camera.updateProjectionMatrix();
      W.renderer.setSize(innerWidth, innerHeight, false);
    });
  },

  setQuality(qname) {
    this.quality = qname;
    const q = this.QUAL[qname];
    this.scene.fog.far = q.fogFar;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
    if (this.matWater) this.matWater.uniforms.uFogFar.value = q.fogFar;
  },

  /* ---------- атлас вывесок (процедурный) ---------- */
  buildSignAtlas() {
    // Атлас вывесок
    const sc = makeCanvas(640, 128);
    const s = sc.getContext('2d');
    const sign = (i, bg, draw) => {
      s.save(); s.translate(i * 128, 0);
      s.fillStyle = '#222'; s.fillRect(0, 0, 128, 128);
      s.fillStyle = bg; s.fillRect(4, 4, 120, 120);
      draw(s);
      s.restore();
    };
    sign(0, '#f2f4f6', s => { s.fillStyle = '#d22f2f'; s.fillRect(52, 24, 24, 80); s.fillRect(24, 52, 80, 24); });
    sign(1, '#f2f4f6', s => { s.fillStyle = '#2244aa'; s.fillRect(4, 70, 120, 30); s.fillStyle = '#fff'; s.font = 'bold 26px monospace'; s.textAlign = 'center'; s.fillText('POLICE', 64, 58); });
    sign(2, '#e08a2e', s => { s.fillStyle = '#fff'; s.font = 'bold 72px monospace'; s.textAlign = 'center'; s.fillText('$', 64, 88); });
    sign(3, '#9aa0a8', s => { s.fillStyle = '#fff'; s.font = 'bold 24px monospace'; s.textAlign = 'center'; s.fillText('GARAGE', 64, 72); });
    sign(4, '#3f7d4a', s => { s.fillStyle = '#fff'; s.font = 'bold 30px monospace'; s.textAlign = 'center'; s.fillText('CAFE', 64, 76); });
    this.signTex = new THREE.CanvasTexture(sc);
  },

  /* ---------- геометрия: помощники ---------- */
  _builder() {
    return { pos: [], norm: [], uv: [], col: [],
      build() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        return geo;
      }
    };
  },
  // прямоугольник на земле
  _quad(b, x0, z0, x1, z1, y, hex) {
    const c = new THREE.Color(hex);
    const push = (x, z) => { b.pos.push(x, y, z); b.norm.push(0, 1, 0); b.uv.push(0, 0); b.col.push(c.r, c.g, c.b); };
    push(x0, z0); push(x1, z0); push(x1, z1);
    push(x0, z0); push(x1, z1); push(x0, z1);
  },
  // бокс с UV-атласом (для зданий)
  _box(b, w, h, d, cx, cy, cz, hex, uvSpec) {
    const tmp = new THREE.BoxGeometry(w, h, d);
    const p = tmp.attributes.position.array, u = tmp.attributes.uv.array, n = tmp.attributes.normal.array;
    const c = new THREE.Color(hex);
    for (let i = 0; i < 24; i++) {
      b.pos.push(p[i * 3] + cx, p[i * 3 + 1] + cy, p[i * 3 + 2] + cz);
      b.norm.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
      const face = i >> 2; // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
      let uu, vv;
      if (face === 2 || face === 3) {
        const r = uvSpec.roof;
        uu = r[0] + u[i * 2] * (r[1] - r[0]);
        vv = r[2] + u[i * 2 + 1] * (r[3] - r[2]);
      } else {
        const s = uvSpec.sides;
        const repX = (face < 2) ? d / 8 : w / 8;
        const repY = h / 4;
        uu = s[0] + (((u[i * 2] * repX) % 1 + 1) % 1) * (s[1] - s[0]);
        vv = s[2] + (((u[i * 2 + 1] * repY) % 1 + 1) % 1) * (s[3] - s[2]);
      }
      b.uv.push(uu, vv);
      b.col.push(c.r, c.g, c.b);
    }
    tmp.dispose();
  },
  // бокс в детальную геометрию (без текстур)
  _dbox(b, w, h, d, cx, cy, cz, hex) {
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
  },
  _cyl(b, r, h, cx, cy, cz, hex, seg) {
    const tmp = new THREE.CylinderGeometry(r, r, h, seg || 10);
    const p = tmp.attributes.position.array, n = tmp.attributes.normal.array;
    const c = new THREE.Color(hex);
    for (let i = 0; i < p.length / 3; i++) {
      b.pos.push(p[i * 3] + cx, p[i * 3 + 1] + cy, p[i * 3 + 2] + cz);
      b.norm.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
      b.uv.push(0, 0);
      b.col.push(c.r, c.g, c.b);
    }
    tmp.dispose();
  },

  /* ---------- земля (один меш на весь мир) ---------- */
  buildGround() {
    const geo = new THREE.PlaneGeometry(WORLD_M, WORLD_M, MAPW, MAPH);
    geo.rotateX(-Math.PI / 2);
    geo.translate(WORLD_M / 2, 0, WORLD_M / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const rng = mulberry32(this.seed + 1);
    const TCOL = {
      0: ['#14324a', -0.6], 1: ['#d9c489', -0.15], 2: ['#2e3036', 0], 3: ['#a09c92', 0.06],
      4: ['#4f8a3c', 0], 5: ['#4a4a50', 0], 6: ['#3c3e44', 0], 7: ['#8e8a82', 0.06], 8: ['#5d564c', 0], 9: ['#457f33', 0]
    };
    const c = new THREE.Color();
    for (let iy = 0; iy <= MAPH; iy++) for (let ix = 0; ix <= MAPW; ix++) {
      const idx = iy * (MAPW + 1) + ix;
      const tx = Math.min(MAPW - 1, Math.floor(ix)), ty = Math.min(MAPH - 1, Math.floor(iy));
      const t = World.tiles[ty * MAPW + tx];
      const [hex, y] = TCOL[t];
      pos.setY(idx, y);
      c.set(hex);
      const v = 0.93 + rng() * 0.14;
      cols[idx * 3] = c.r * v; cols[idx * 3 + 1] = c.g * v; cols[idx * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    this.groundMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.groundMesh);
  },

  /* ---------- вода (GPU-шейдер) ---------- */
  buildWater() {
    const geo = new THREE.PlaneGeometry(WORLD_M, WORLD_M, 96, 96);
    geo.rotateX(-Math.PI / 2);
    geo.translate(WORLD_M / 2, -0.12, WORLD_M / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uFog: { value: new THREE.Color(0xd8d2c4) },
        uFogFar: { value: this.QUAL[this.quality].fogFar }
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.y += sin(position.x * 0.25 + uTime) * 0.06 + cos(position.z * 0.31 - uTime * 0.8) * 0.05;
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        varying vec3 vW;
        uniform vec3 uFog; uniform float uFogFar;
        void main() {
          float w = sin(vW.x * 0.35) * sin(vW.z * 0.28) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.10, 0.24, 0.38), vec3(0.24, 0.45, 0.60), w * 0.7);
          col += pow(w, 9.0) * 0.12;
          float f = smoothstep(uFogFar * 0.35, uFogFar, distance(vW, cameraPosition));
          gl_FragColor = vec4(mix(col, uFog, f), 0.94);
        }`
    });
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.waterMesh);
    this.matWater = mat;
  },

  /* ---------- вывески POI (один меш) ---------- */
  buildSigns() {
    const b = this._builder();
    const SIGNS = { hospital: 0, police: 1, shop: 2, garage: 3, cafe: 4 };
    for (const poi of World.pois) {
      const ci = SIGNS[poi.type];
      if (ci == null) continue;
      const tmp = new THREE.PlaneGeometry(3.4, 1.4);
      const p = tmp.attributes.position.array, u = tmp.attributes.uv.array;
      const u0 = ci * 0.2, u1 = (ci + 1) * 0.2;
      const sy = Math.min(4.6, poi.h * 0.55);
      for (let i = 0; i < 4; i++) {
        b.pos.push(p[i * 3] + poi.doorX, sy, p[i * 3 + 2] + poi.wallZ);
        b.norm.push(0, 0, 1);
        b.uv.push(u0 + u[i * 2] * (u1 - u0), u[i * 2 + 1]);
        b.col.push(1, 1, 1);
      }
      tmp.dispose();
    }
    this.signMesh = new THREE.Mesh(b.build(), this.matSign);
    this.scene.add(this.signMesh);
  },

  /* ---------- тени-«бобы» и декали (InstancedMesh) ---------- */
  buildShadows() {
    const geo = new THREE.CircleGeometry(1, 14);
    geo.rotateX(-Math.PI / 2);
    this.shadowMesh = new THREE.InstancedMesh(geo, this.matShadow, 96);
    this.shadowMesh.count = 0;
    this.shadowMesh.frustumCulled = false;
    this.scene.add(this.shadowMesh);
  },
  buildDecals() {
    const geo = new THREE.CircleGeometry(1, 12);
    geo.rotateX(-Math.PI / 2);
    this.decalMesh = new THREE.InstancedMesh(geo, this.matDecal, 160);
    this.decalMesh.count = 0;
    this.decalMesh.frustumCulled = false;
    this.scene.add(this.decalMesh);
    this._decalHead = 0;
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  },
  addDecal(x, z, r, hex) {
    const m = this.decalMesh;
    const i = this._decalHead;
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * TAU);
    this._v.set(x, 0.08 + Math.random() * 0.03, z);
    this._s.set(r, 1, r);
    this._m4.compose(this._v, this._q, this._s);
    m.setMatrixAt(i, this._m4);
    m.setColorAt(i, new THREE.Color(hex));
    m.count = Math.min(160, Math.max(m.count, i + 1));
    this._decalHead = (i + 1) % 160;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  },

  buildParticles() {
    const N = 320;
    // искры (аддитивные)
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sm = new THREE.PointsMaterial({ size: 0.4, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new THREE.Points(sg, sm);
    this.sparks.frustumCulled = false;
    this.sparks.userData.pool = [];
    for (let i = 0; i < N; i++) this.sparks.userData.pool.push({ on: false });
    this.scene.add(this.sparks);
    // дым (шейдер с альфой)
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(N * 3), ms = new Float32Array(N), ma = new Float32Array(N), mc = new Float32Array(N * 3);
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aSize', new THREE.BufferAttribute(ms, 1));
    mg.setAttribute('aAlpha', new THREE.BufferAttribute(ma, 1));
    mg.setAttribute('aColor', new THREE.BufferAttribute(mc, 3));
    const mm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        varying float vA; varying vec3 vC;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / -mv.z);
          vA = aAlpha; vC = aColor;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.12, d) * vA;
          gl_FragColor = vec4(vC, a);
        }`
    });
    this.smoke = new THREE.Points(mg, mm);
    this.smoke.frustumCulled = false;
    this.smoke.userData.pool = [];
    for (let i = 0; i < N; i++) this.smoke.userData.pool.push({ on: false });
    this.scene.add(this.smoke);
  },
  _spawn(sys, x, y, z, vx, vy, vz, life, r, g, b, size) {
    const pool = sys.userData.pool;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].on) continue;
      pool[i] = { on: true, i, x, y, z, vx, vy, vz, life, max: life, r, g, b, size };
      return;
    }
  },
  spark(x, y, z, vx, vy, vz, life, r, g, b) { this._spawn(this.sparks, x, y, z, vx, vy, vz, life, r, g, b, 0); },
  puff(x, y, z, vx, vy, vz, life, r, g, b, size) { this._spawn(this.smoke, x, y, z, vx, vy, vz, life, r, g, b, size); },

  updateParticles(dt) {
    const budget = this.QUAL[this.quality].particles;
    for (const sys of [this.sparks, this.smoke]) {
      const arr = sys.userData.pool, attr = sys.geometry.attributes;
      const isSmoke = sys === this.smoke;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p.on) {
          // гасим мёртвые точки, иначе они останутся на экране
          if (isSmoke) attr.aAlpha.setX(i, 0);
          else attr.color.setXYZ(i, 0, 0, 0);
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (isSmoke) {
          p.vy += 0.6 * dt; p.vx *= 0.98; p.vz *= 0.98;
          p.size += dt * 1.6;
        } else {
          p.vy -= 14 * dt;
          if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; }
        }
        const t = p.life / p.max;
        if (isSmoke) {
          attr.position.setXYZ(i, p.x, p.y, p.z);
          attr.aSize.setX(i, p.size);
          attr.aAlpha.setX(i, t * 0.5 * budget);
          attr.aColor.setXYZ(i, p.r, p.g, p.b);
        } else {
          attr.position.setXYZ(i, p.x, p.y, p.z);
          attr.color.setXYZ(i, p.r * t, p.g * t, p.b * t);
        }
      }
      attr.position.needsUpdate = true;
      if (isSmoke) { attr.aSize.needsUpdate = true; attr.aAlpha.needsUpdate = true; attr.aColor.needsUpdate = true; }
      else attr.color.needsUpdate = true;
    }
  },

  /* ---------- индексация чанков (деревья) ---------- */
  buildIndex() {
    this._tIdx = new Map();
    for (let i = 0; i < World.trees.length; i++) {
      const t = World.trees[i];
      const k = Math.floor(t.x / this.CHM) + ',' + Math.floor(t.z / this.CHM);
      if (!this._tIdx.has(k)) this._tIdx.set(k, []);
      this._tIdx.get(k).push(i);
    }
  },

  /* ---------- построение чанка ---------- */
  buildChunk(cx, cy) {
    const group = new THREE.Group();
    const x0 = cx * this.CH, z0 = cy * this.CH;
    const x1 = x0 + this.CH, z1 = z0 + this.CH;

    // --- детали: разметка, фонари, резервуары ---
    const db = this._builder();
    const inX = x => x >= x0 * TILE && x < x1 * TILE;
    const inZ = z => z >= z0 * TILE && z < z1 * TILE;
    // продольные дороги
    for (const L of LINES) {
      const ly = (L + 1) * TILE;
      if (inZ(L * TILE)) for (let x = x0 * TILE; x < x1 * TILE; x += 8) {
        if (LINES.some(v => x >= v * TILE - 1 && x < (v + 2) * TILE + 1)) continue;
        this._quad(db, x + 2, ly - 0.18, x + 6, ly + 0.18, 0.025, 0xd8c860);
      }
      if (inX(L * TILE)) for (let z = z0 * TILE; z < z1 * TILE; z += 8) {
        if (LINES.some(v => z >= v * TILE - 1 && z < (v + 2) * TILE + 1)) continue;
        this._quad(db, ly - 0.18, z + 2, ly + 0.18, z + 6, 0.025, 0xd8c860);
      }
      // кромки
      for (const e of [L * TILE, (L + 2) * TILE]) {
        if (inZ(e - 1)) for (let x = x0 * TILE; x < x1 * TILE; x += 8) {
          if (LINES.some(v => x >= v * TILE - 1 && x < (v + 2) * TILE + 1)) continue;
          this._quad(db, x, e - 0.12, x + 6.5, e + 0.12, 0.025, 0xc8ccce);
        }
        if (inX(e - 1)) for (let z = z0 * TILE; z < z1 * TILE; z += 8) {
          if (LINES.some(v => z >= v * TILE - 1 && z < (v + 2) * TILE + 1)) continue;
          this._quad(db, e - 0.12, z, e + 0.12, z + 6.5, 0.025, 0xc8ccce);
        }
      }
    }
    // пешеходные переходы
    for (const n of World.nodes) {
      if (n.x < x0 * TILE || n.x >= x1 * TILE || n.z < z0 * TILE || n.z >= z1 * TILE) continue;
      const i = n.i, N = World._N, xi = i % N, zj = (i / N) | 0;
      const ix0 = LINES[xi] * TILE, iz0 = LINES[zj] * TILE;
      for (const [off, horiz] of [[(LINES[xi] + 2) * TILE - 1.6, true], [LINES[xi] * TILE + 0.9, true],
                                  [(LINES[zj] + 2) * TILE - 1.6, false], [LINES[zj] * TILE + 0.9, false]]) {
        for (let k = 0; k < 5; k++) {
          const p = (horiz ? ix0 : iz0) + 1.0 + k * 1.5;
          if (horiz) this._quad(db, p, off, p + 0.8, off + 1.8, 0.025, 0xd5d8da);
          else this._quad(db, off, p, off + 1.8, p + 0.8, 0.025, 0xd5d8da);
        }
      }
    }
    // ВПП
    if (RUNWAY.x1 * TILE > x0 * TILE && RUNWAY.x0 * TILE < x1 * TILE) {
      const rx0 = Math.max(RUNWAY.x0 * TILE, x0 * TILE), rx1 = Math.min((RUNWAY.x1 + 1) * TILE, x1 * TILE);
      const ry0 = RUNWAY.y0 * TILE, ry1 = (RUNWAY.y1 + 1) * TILE;
      for (const e of [ry0 + 0.3, ry1 - 0.3]) this._quad(db, rx0, e - 0.15, rx1, e + 0.15, 0.025, 0xd8dad8);
      for (let x = rx0 + 4; x < rx1 - 4; x += 8) this._quad(db, x, (ry0 + ry1) / 2 - 0.15, x + 4, (ry0 + ry1) / 2 + 0.15, 0.025, 0xd8dad8);
    }
    // вертолётная площадка
    {
      const hx = (HELIPAD.x + 0.5) * TILE, hz = (HELIPAD.y + 0.5) * TILE;
      if (hx > x0 * TILE - 6 && hx < x1 * TILE + 6 && hz > z0 * TILE - 6 && hz < z1 * TILE + 6) {
        const tmp = new THREE.RingGeometry(4.4, 5.0, 24);
        const p = tmp.attributes.position.array;
        for (let i = 0; i < p.length / 3; i++) {
          // RingGeometry лежит в плоскости XY: x -> x, y -> z
          db.pos.push(p[i * 3] + hx, 0.025, p[i * 3 + 1] + hz);
          db.norm.push(0, 1, 0); db.uv.push(0, 0); db.col.push(0.9, 0.9, 0.9);
        }
        tmp.dispose();
        this._quad(db, hx - 0.5, hz - 2.2, hx + 0.5, hz + 2.2, 0.03, 0xe8e8e8);
        this._quad(db, hx - 2.2, hz - 0.5, hx + 2.2, hz + 0.5, 0.03, 0xe8e8e8);
        this._quad(db, hx - 2.2, hz - 2.2, hx - 0.5, hz - 0.5, 0.03, 0xe8e8e8);
        this._quad(db, hx + 0.5, hz - 2.2, hx + 2.2, hz - 0.5, 0.03, 0xe8e8e8);
      }
    }
    if (db.pos.length) group.add(new THREE.Mesh(db.build(), this.matDetail));

    // --- 3D-мебель: фонари, светофоры, знаки, резервуары (instanced по типу) ---
    const buckets = {};
    const push = (varId, x, z, ry) => { (buckets[varId] = buckets[varId] || []).push([x, z, ry || 0]); };
    const PROP_H = {
      'light-curved': 4.6, 'light-square': 4.0, 'traffic-light': 3.2, 'electricity-pole': 3.5,
      'road-sign-stop': 1.8, 'road-sign-street': 1.8, 'road-sign-warning': 1.8,
      'construction-cone': 0.7, 'dumpster': 1.2, 'detail-tank': 3.4
    };
    // фонари вдоль дорог (детерминированная сетка 24 м)
    const nearCross = (p) => LINES.some(v => Math.abs(p - (v + 1) * TILE) < 9);
    const lampSide = (x, z) => { const t = World.tileAt(x, z); return t === T.SIDEWALK || t === T.PAVEMENT; };
    for (const L of LINES) {
      if (inZ(L * TILE)) for (let x = Math.ceil(x0 * TILE / 24) * 24; x < x1 * TILE - 4; x += 24) {
        if (nearCross(x)) continue;
        if (lampSide(x + 3, (L + 2) * TILE + 1.1)) push('roads/light-curved', x + 3, (L + 2) * TILE + 1.1, Math.PI);
        if (lampSide(x + 12, L * TILE - 1.1)) push('roads/light-square', x + 12, L * TILE - 1.1, 0);
      }
      if (inX(L * TILE)) for (let z = Math.ceil(z0 * TILE / 24) * 24; z < z1 * TILE - 4; z += 24) {
        if (nearCross(z)) continue;
        if (lampSide((L + 2) * TILE + 1.1, z + 3)) push('roads/light-square', (L + 2) * TILE + 1.1, z + 3, Math.PI);
        if (lampSide(L * TILE - 1.1, z + 12)) push('roads/light-curved', L * TILE - 1.1, z + 12, 0);
      }
    }
    // светофоры и знаки на перекрёстках
    for (const n of World.nodes) {
      if (n.x < x0 * TILE || n.x >= x1 * TILE || n.z < z0 * TILE || n.z >= z1 * TILE) continue;
      const h = (n.i * 2654435761) >>> 0;
      if (lampSide(n.x + 5.3, n.z + 5.3)) push('roads/traffic-light', n.x + 5.3, n.z + 5.3, 2.35);
      if (lampSide(n.x - 5.3, n.z - 5.3)) push('roads/traffic-light', n.x - 5.3, n.z - 5.3, 0.79);
      if (h % 4 < 2) push(['roads/road-sign-stop', 'roads/road-sign-street', 'roads/road-sign-warning'][h % 3], n.x + 5.3, n.z + 0.6, Math.PI);
    }
    // промышленность: опоры, конусы, мусорные контейнеры
    const isInd = cx >= 6 && cy >= 1 && cy <= 5;
    if (isInd) {
      for (const L of LINES)
        if (inZ(L * TILE)) for (let x = Math.ceil(x0 * TILE / 32) * 32; x < x1 * TILE - 6; x += 32)
          if (!nearCross(x)) push('roads/electricity-pole', x, (L + 2) * TILE + 1.6, 0);
      const crng = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ 11);
      for (let i = 0; i < 3; i++) {
        const L = LINES[Math.floor(crng() * LINES.length)];
        const along = x0 * TILE + 4 + crng() * (this.CH * TILE - 8);
        if (crng() < 0.5) push('roads/construction-cone', along, (L + 2) * TILE + 0.8, crng() * TAU);
        else push('roads/construction-cone', (L + 2) * TILE + 0.8, along, crng() * TAU);
      }
      const dx = x0 * TILE + (2 + Math.floor(crng() * 12)) * TILE;
      const dz = z0 * TILE + (2 + Math.floor(crng() * 12)) * TILE;
      if (World.tileAt(dx, dz) === T.LOT) push('roads/dumpster', dx, dz, crng() * TAU);
    }
    // резервуары у заводов
    for (const pr of World.props) {
      if (pr.kind !== 'tank') continue;
      if (pr.x < x0 * TILE || pr.x >= x1 * TILE || pr.z < z0 * TILE || pr.z >= z1 * TILE) continue;
      push('industrial/detail-tank', pr.x, pr.z, (pr.x * 0.7) % TAU);
    }
    for (const [varId, list] of Object.entries(buckets)) {
      const vv = Assets3D.v[varId];
      const mat = Assets3D.mats[varId.split('/')[0]];
      if (!vv || !mat) continue;
      const s = (PROP_H[varId.split('/')[1]] || 3) / vv.bb.h;
      const im = new THREE.InstancedMesh(vv.geo, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        this._v.set(list[i][0], 0, list[i][1]);
        this._q.setFromAxisAngle(this.UP, list[i][2]);
        this._s.set(s, s, s);
        this._m4.compose(this._v, this._q, this._s);
        im.setMatrixAt(i, this._m4);
      }
      im.frustumCulled = false;
      group.add(im);
    }

    // --- деревья (3D-модели + пальмы, instancing) ---
    const ti = this._tIdx.get(cx + ',' + cy);
    if (ti && ti.length) {
      const groups = { 'suburban/tree-large': [], 'suburban/tree-small': [], palm: [] };
      for (const i of ti) {
        const t = World.trees[i];
        if (t.kind === 'palm') groups.palm.push(i);
        else groups[t.sz ? 'suburban/tree-large' : 'suburban/tree-small'].push(i);
      }
      for (const [key, list] of Object.entries(groups)) {
        if (!list.length) continue;
        if (key === 'palm') {
          const palm = new THREE.InstancedMesh(this._palmGeo(), this.matPalm, list.length);
          for (let i = 0; i < list.length; i++) {
            const t = World.trees[list[i]];
            const sc = 0.9 + (list[i] % 5) * 0.05;
            this._v.set(t.x, 0, t.z); this._s.set(sc, sc, sc);
            this._q.setFromAxisAngle(this.UP, (list[i] * 0.7) % TAU);
            this._m4.compose(this._v, this._q, this._s);
            palm.setMatrixAt(i, this._m4);
          }
          palm.frustumCulled = false;
          group.add(palm);
        } else {
          const vv = Assets3D.v[key], mat = Assets3D.mats.suburban;
          if (!vv || !mat) continue;
          const baseH = key.includes('large') ? 6.5 : 4.6;
          const im = new THREE.InstancedMesh(vv.geo, mat, list.length);
          for (let i = 0; i < list.length; i++) {
            const t = World.trees[list[i]];
            const s = (baseH / vv.bb.h) * (0.85 + ((list[i] * 37) % 10) * 0.04);
            this._v.set(t.x, 0, t.z); this._s.set(s, s, s);
            this._q.setFromAxisAngle(this.UP, (list[i] * 0.7) % TAU);
            this._m4.compose(this._v, this._q, this._s);
            im.setMatrixAt(i, this._m4);
          }
          im.frustumCulled = false;
          group.add(im);
        }
      }
    }

    group.position.set(0, 0, 0);
    return group;
  },

  /* ---------- здания (3D-модели, scene-wide instancing по вариантам) ---------- */
  buildBuildings() {
    if (this.bGroup) { this.scene.remove(this.bGroup); this._disposeGroup(this.bGroup); this.bGroup = null; }
    if (!Assets3D.ready) return;
    const byVar = new Map();
    for (const b of World.buildings) {
      if (!byVar.has(b.var)) byVar.set(b.var, []);
      byVar.get(b.var).push(b);
    }
    const g = new THREE.Group();
    for (const [varId, list] of byVar) {
      const vv = Assets3D.v[varId];
      const mat = Assets3D.mats[varId.split('/')[0]];
      if (!vv || !mat) continue;
      const im = new THREE.InstancedMesh(vv.geo, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const w = b.w * TILE, d = b.h * TILE;
        const cxp = (b.x0 + b.w / 2) * TILE, czp = (b.y0 + b.h / 2) * TILE;
        // ориентация: подгоняем модель под габарит квартала
        const f0 = Math.min(w / vv.bb.w, d / vv.bb.d);
        const f90 = Math.min(w / vv.bb.d, d / vv.bb.w);
        const swap = f90 > f0 * 1.15;
        const sxz = (swap ? f90 : f0) * (b.cls === 'tower' ? 0.95 : 0.85);
        const sy = b.cls === 'tower' ? b.ht / vv.bb.h : sxz;
        const hsh = (b.x0 * 31 + b.y0 * 17 + 3) % 4;
        const ry = (swap ? Math.PI / 2 : 0) + (hsh % 2 ? Math.PI : 0);
        this._q.setFromAxisAngle(this.UP, ry);
        this._v.set(cxp, 0, czp);
        this._s.set(sxz, sy, sxz);
        this._m4.compose(this._v, this._q, this._s);
        im.setMatrixAt(i, this._m4);
      }
      im.frustumCulled = false;
      g.add(im);
    }
    this.bGroup = g;
    this.scene.add(g);
  },

  /* ---------- промышленные ориентиры (водонапорка, ветряк) ---------- */
  buildLandmarks() {
    if (this.landmarks) { this.scene.remove(this.landmarks); this._disposeGroup(this.landmarks); this.landmarks = null; }
    if (!Assets3D.ready) return;
    const g = new THREE.Group();
    const LFILE = { 'water-tower': 'industrial/water-tower', 'windmill': 'industrial/windmill-low' };
    for (const pr of World.props) {
      if (!LFILE[pr.kind]) continue;
      const vv = Assets3D.v[LFILE[pr.kind]], mat = Assets3D.mats.industrial;
      if (!vv || !mat) continue;
      const s = (pr.kind === 'water-tower' ? 14 : 22) / vv.bb.h;
      const mesh = new THREE.Mesh(vv.geo, mat);
      mesh.scale.setScalar(s);
      mesh.position.set(pr.x, 0, pr.z);
      g.add(mesh);
    }
    this.landmarks = g;
    this.scene.add(g);
  },
  _palmGeo() {
    if (this._palmCache) return this._palmCache;
    const b = this._builder();
    // изогнутый ствол (4 сегмента)
    let px = 0, py = 0;
    for (let i = 0; i < 4; i++) {
      const h = 1.05, lean = 0.06 + i * 0.05;
      this._cyl(b, 0.15 - i * 0.015, h, px + lean * 0.5, py + h / 2, 0, 0x9a7b52, 6);
      px += lean; py += h;
    }
    // листья: 8 «язычков», опущенных к низу
    const topY = py + 0.1;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.3;
      const dx = Math.cos(a), dz = Math.sin(a);
      const len = 2.1;
      const midX = px + dx * len * 0.5, midZ = dz * len * 0.5;
      const midY = topY - 0.35;
      const ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2);
      const seg = (x0, z0, x1, z1, y, wdt) => {
        const len2 = Math.hypot(x1 - x0, z1 - z0);
        const ang = Math.atan2(x1 - x0, z1 - z0);
        // параллелограмм листа
        const nx = -Math.sin(ang) * wdt / 2, nz = Math.cos(ang) * wdt / 2;
        const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
        const p = [[cxm + (x1 - x0) * 0.5 - nx, czm + (z1 - z0) * 0.5 - nz],
                   [cxm + (x1 - x0) * 0.5 + nx, czm + (z1 - z0) * 0.5 + nz],
                   [cxm - (x1 - x0) * 0.5 + nx, czm - (z1 - z0) * 0.5 + nz],
                   [cxm - (x1 - x0) * 0.5 - nx, czm - (z1 - z0) * 0.5 - nz]];
        const push = (X, Z, Y) => { b.pos.push(X, Y, Z); b.norm.push(0, 1, 0); b.uv.push(0, 0); };
        push(p[0][0], p[0][1], y); push(p[1][0], p[1][1], y); push(p[3][0], p[3][1], y);
        push(p[0][0], p[0][1], y); push(p[3][0], p[3][1], y); push(p[2][0], p[2][1], y);
        b.col.push(0.32, 0.52, 0.26, 0.32, 0.52, 0.26, 0.32, 0.52, 0.26, 0.32, 0.52, 0.26, 0.32, 0.52, 0.26, 0.32, 0.52, 0.26);
      };
      seg(px, 0, midX, midZ, topY - 0.05, 0.55);
      seg(midX, midZ, px + dx * len, dz * len, topY - 0.55, 0.4);
    }
    const geo = b.build();
    geo.userData.shared = true; // одна геометрия на все чанки — не dispose-ить
    this._palmCache = geo;
    return geo;
  },

  /* ---------- стриминг ---------- */
  update(px, pz) {
    const R = this.QUAL[this.quality].radius;
    const pcx = Math.floor(px / this.CHM), pcz = Math.floor(pz / this.CHM);
    const need = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const cx = pcx + dx, cz = pcz + dy;
      if (cx < 0 || cz < 0 || cx >= MAPW / this.CH || cz >= MAPH / this.CH) continue;
      if (dx * dx + dy * dy > (R + 0.4) * (R + 0.4)) continue;
      need.push(cx + ',' + cz);
    }
    let loaded = 0;
    for (const k of need) {
      if (this.chunks.has(k)) continue;
      if (loaded >= 3) break;
      const [cx, cy] = k.split(',').map(Number);
      const group = this.buildChunk(cx, cy);
      this.scene.add(group);
      this.chunks.set(k, group);
      loaded++;
    }
    const unR = R + 1.5;
    for (const [k, group] of this.chunks) {
      const [cx, cy] = k.split(',').map(Number);
      const dx = cx + 0.5 - px / this.CHM, dz = cy + 0.5 - pz / this.CHM;
      if (dx * dx + dz * dz > unR * unR) {
        this.scene.remove(group);
        this._disposeGroup(group);
        this.chunks.delete(k);
      }
    }
  },
  _disposeGroup(g) {
    g.traverse(o => {
      // геометрию 3D-моделей не трогаем — она общая (Assets3D.v)
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
  },

  /* пересборка статичных объектов после смены сида (мультиплеер) */
  resetStatics() {
    this.seed = World.seed;
    for (const [k, g] of this.chunks) { this.scene.remove(g); this._disposeGroup(g); }
    this.chunks.clear();
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh.geometry.dispose(); this.groundMesh = null; }
    if (this.signMesh) { this.scene.remove(this.signMesh); this.signMesh.geometry.dispose(); this.signMesh = null; }
    this.buildGround();
    this.buildSigns();
    this.buildIndex();
    this.buildBuildings();
    this.buildLandmarks();
  },

  render(dt) {
    this.time += dt;
    this.matWater.uniforms.uTime.value = this.time;
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
  },

  /* ---------- blob-тени (один InstancedMesh на всё) ---------- */
  updateShadows() {
    const m = this.shadowMesh;
    if (!m) return;
    let k = 0;
    const put = (x, z, r) => {
      if (k >= 96) return;
      this._v.set(x, 0.09, z);
      this._s.set(r, 1, r);
      this._q.identity();
      this._m4.compose(this._v, this._q, this._s);
      m.setMatrixAt(k, this._m4);
      k++;
    };
    if (typeof Player !== 'undefined' && Player.group && !Player.inCar && Player.alive) put(Player.x, Player.z, 0.75);
    for (const c of Cars.list) put(c.x, c.z, c.group.userData.len * 0.55);
    for (const p of Peds.list) if (p.state !== 'dead') put(p.x, p.z, 0.55);
    if (typeof Game !== 'undefined' && Game.remotes)
      for (const [id, v] of Game.remotes) {
        if (v.carVis) put(v.carVis.position.x, v.carVis.position.z, v.carVis.userData.len * 0.55);
        else if (v.ped) put(v.ped.position.x, v.ped.position.z, 0.55);
      }
    m.count = k;
    if (k) m.instanceMatrix.needsUpdate = true;
  },

  /* ---------- камера-преследователь ---------- */
  updateCamera(tx, tz, angle, speed01, onFoot, dt, mouseOff) {
    const cam = this.cam, C = this.camera;
    if (!cam.init) { cam.pos.set(tx, 6, tz - 8); cam.look.set(tx, 1, tz); cam.init = true; }
    const dist = onFoot ? 6.5 : 8.5 + speed01 * 3;
    const height = onFoot ? 2.6 : 3.2 + speed01 * 0.8;
    const fx = Math.sin(angle), fz = Math.cos(angle);
    const lookX = tx + fx * (onFoot ? 2 : 3.5 + speed01 * 2);
    const lookZ = tz + fz * (onFoot ? 2 : 3.5 + speed01 * 2);
    const lookY = onFoot ? 1.2 : 0.9;
    let dx = tx - fx * dist, dz = tz - fz * dist, dy = height;
    // уклонение от зданий
    const t = this._segVsAABBs(lookX, lookZ, dx, dz, dy);
    if (t < 0.98) {
      const f = Math.max(0.12, t - 0.03);
      dx = lookX + (dx - lookX) * f;
      dz = lookZ + (dz - lookZ) * f;
      dy = Math.max(1.2, dy * f);
    }
    const k = 1 - Math.exp(-5.5 * dt);
    cam.pos.x += (dx - cam.pos.x) * k;
    cam.pos.y += (dy - cam.pos.y) * k;
    cam.pos.z += (dz - cam.pos.z) * k;
    cam.look.x += (lookX - cam.look.x) * Math.min(1, k * 1.6);
    cam.look.y += (lookY - cam.look.y) * Math.min(1, k * 1.6);
    cam.look.z += (lookZ - cam.look.z) * Math.min(1, k * 1.6);
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.shake * 0.35;
    C.position.set(cam.pos.x + rand(-sh, sh), cam.pos.y + rand(-sh, sh), cam.pos.z + rand(-sh, sh));
    C.lookAt(cam.look);
  },
  _segVsAABBs(x0, z0, x1, z1, y) {
    let best = 1;
    const dx = x1 - x0, dz = z1 - z0;
    for (const b of World.aabbs) {
      if (y > b.h + 0.5) continue;
      // быстрый отсев
      if (b.maxX < Math.min(x0, x1) - 2 || b.minX > Math.max(x0, x1) + 2) continue;
      if (b.maxZ < Math.min(z0, z1) - 2 || b.minZ > Math.max(z0, z1) + 2) continue;
      // slab method 2D
      let tmin = 0, tmax = 1;
      if (Math.abs(dx) < 1e-6) { if (x0 < b.minX - 0.4 || x0 > b.maxX + 0.4) continue; }
      else {
        let t1 = (b.minX - 0.4 - x0) / dx, t2 = (b.maxX + 0.4 - x0) / dx;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < 1e-6) { if (z0 < b.minZ - 0.4 || z0 > b.maxZ + 0.4) continue; }
      else {
        let t1 = (b.minZ - 0.4 - z0) / dz, t2 = (b.maxZ + 0.4 - z0) / dz;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (tmax < 0 || tmin > 1) continue;
      const t = tmin > 0 ? tmin : tmax;
      if (t < best) best = t;
    }
    return best;
  },

  addShake(v) { this.shake = Math.min(1.4, this.shake + v); }
};
