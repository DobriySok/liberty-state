'use strict';
/* ================= ГОРОД 3D: Three.js, стриминг чанков =================
   Мир разбит на чанки 16x16 тайлов (64x64 м). Каждый чанк — минимальный
   набор мешей (1 геометрия зданий, 1 детальная, instanced-деревья),
   что держит количество draw calls низким даже на слабых ПК. */

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
  atlasTex: null, signTex: null,
  matDetail: null, matBuilding: null, matTree: null, matTrunk: null,
  matSign: null, matShadow: null, matDecal: null, matWater: null,
  groundMesh: null, waterMesh: null,
  signMesh: null,
  shadowMesh: null, decalMesh: null,
  sparks: null, smoke: null,
  cam: null,
  shake: 0,
  time: 0,
  _bIdx: null, _tIdx: null,

  init(canvas) {
    const W = this, scene = W.scene = new THREE.Scene();
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
    grad.addColorStop(0, '#3a72c0');
    grad.addColorStop(0.55, '#9fc4e4');
    grad.addColorStop(0.85, '#e6d9c2');
    grad.addColorStop(1, '#e6d9c2');
    sg.fillStyle = grad; sg.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(skyC);
    scene.background = skyTex;
    scene.fog = new THREE.Fog(0xd8d2c4, 60, q.fogFar);

    // свет
    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x44503c, 0.85));
    const sun = new THREE.DirectionalLight(0xffe9c9, 1.05);
    sun.position.set(140, 200, 70);
    scene.add(sun);

    W.buildAtlas();
    W.matDetail = new THREE.MeshLambertMaterial({ vertexColors: true });
    W.matBuilding = new THREE.MeshLambertMaterial({ vertexColors: true, map: W.atlasTex });
    W.matTree = new THREE.MeshLambertMaterial({ color: 0xffffff });
    W.matTrunk = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
    W.matPalm = new THREE.MeshLambertMaterial({ vertexColors: true });
    W.matSign = new THREE.MeshBasicMaterial({ map: W.signTex });
    W.matShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
    W.matDecal = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false });

    W.buildGround();
    W.buildWater();
    W.buildSigns();
    W.buildShadows();
    W.buildDecals();
    W.buildParticles();
    W.buildIndex();
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

  /* ---------- атлас текстур (процедурный) ---------- */
  buildAtlas() {
    const c = makeCanvas(1024, 1024);
    const g = c.getContext('2d');
    const S = 256;
    const cell = (ix, iy, fn) => { g.save(); g.translate(ix * S, iy * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fn(); g.restore(); };
    const rng = mulberry32(777);

    // Фасад A: сетка окон
    cell(0, 0, () => {
      g.fillStyle = '#c6cbd2'; g.fillRect(0, 0, S, S);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.fillStyle = ((x * 7 + y * 13) % 5 === 0) ? '#ffd98f' : '#3d4c5c';
        g.fillRect(8 + x * 32, 8 + y * 32, 18, 20);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(8 + x * 32, 8 + y * 32, 18, 4);
      }
    });
    // Фасад B: большие окна
    cell(1, 0, () => {
      g.fillStyle = '#cac4ba'; g.fillRect(0, 0, S, S);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = ((x + y * 3) % 4 === 1) ? '#ffdf9e' : '#41525f';
        g.fillRect(12 + x * 64, 14 + y * 64, 42, 34);
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillRect(12 + x * 64, 14 + y * 64, 42, 8);
      }
    });
    // Фасад C: магазин (навес + витрина)
    cell(2, 0, () => {
      g.fillStyle = '#d2c9b6'; g.fillRect(0, 0, S, S);
      for (let x = 0; x < 8; x++) {
        g.fillStyle = '#41525f'; g.fillRect(8 + x * 32, 10, 18, 22);
        g.fillStyle = '#c8452f'; g.fillRect(0, 96, S, 10);
        g.fillStyle = (x % 2 === 0) ? '#e8e0d0' : '#c8452f';
        g.fillRect(x * 32, 106, 32, 26);
      }
      g.fillStyle = '#2c3844'; g.fillRect(0, 156, S, S - 156);
      g.fillStyle = 'rgba(160,200,230,0.35)';
      for (let x = 0; x < 4; x++) g.fillRect(16 + x * 62, 168, 46, 60);
      g.fillStyle = '#f0e8d8'; g.fillRect(104, 40, 48, 44);
    });
    // Фасад D: стеклянная башня
    cell(3, 0, () => {
      g.fillStyle = '#aeb8c4'; g.fillRect(0, 0, S, S);
      for (let x = 0; x < 8; x++) {
        g.fillStyle = '#4a5e70'; g.fillRect(8 + x * 32, 0, 20, S);
        for (let y = 0; y < 8; y++) { g.fillStyle = 'rgba(220,240,255,0.28)'; g.fillRect(8 + x * 32, y * 32 + 2, 20, 3); }
      }
    });
    // Крыши
    cell(0, 1, () => {
      g.fillStyle = '#878c94'; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, S); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(S, i * 64); g.stroke(); }
      for (let i = 0; i < 3; i++) {
        const ax = 24 + i * 80, ay = 40 + (i % 2) * 90;
        g.fillStyle = '#9aa0a8'; g.fillRect(ax, ay, 44, 44);
        g.fillStyle = '#6f757d'; g.beginPath(); g.arc(ax + 22, ay + 22, 13, 0, TAU); g.fill();
      }
    });
    cell(1, 1, () => {
      g.fillStyle = '#92989e'; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2;
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, S); g.stroke(); }
      g.fillStyle = '#666c74'; g.beginPath(); g.arc(70, 80, 18, 0, TAU); g.fill();
      g.beginPath(); g.arc(180, 170, 14, 0, TAU); g.fill();
      g.fillStyle = '#a8aeb6'; g.fillRect(120, 120, 50, 34);
    });
    for (let ix = 0; ix < 4; ix++) for (let iy = 2; iy < 4; iy++)
      cell(ix, iy, () => { g.fillStyle = '#70747a'; g.fillRect(0, 0, S, S); });
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    this.atlasTex = tex;

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
      0: ['#1c3c56', -0.6], 1: ['#d8c07a', -0.15], 2: ['#3a3a40', 0], 3: ['#9a9da1', 0.06],
      4: ['#4d8f3f', 0], 5: ['#55555a', 0], 6: ['#46464c', 0], 7: ['#84868c', 0.06], 8: ['#6b6257', 0], 9: ['#3f7d36', 0]
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

  /* ---------- индексация чанков ---------- */
  buildIndex() {
    this._bIdx = new Map(); this._tIdx = new Map();
    for (let i = 0; i < World.buildings.length; i++) {
      const b = World.buildings[i];
      const cx = Math.floor(b.x0 / this.CH), cy = Math.floor(b.y0 / this.CH);
      const cx1 = Math.floor((b.x0 + b.w - 1) / this.CH), cy1 = Math.floor((b.y0 + b.h - 1) / this.CH);
      for (let c = cx; c <= cx1; c++) for (let d = cy; d <= cy1; d++) {
        const k = c + ',' + d;
        if (!this._bIdx.has(k)) this._bIdx.set(k, []);
        this._bIdx.get(k).push(i);
      }
    }
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
      // фонари вдоль дороги
      if (inZ(L * TILE)) for (let x = x0 * TILE + 4; x < x1 * TILE; x += 20) {
        this._dbox(db, 0.14, 3.6, 0.14, x, 1.8, (L + 2) * TILE + 1.0, 0x2e3238);
        this._dbox(db, 0.14, 0.14, 1.4, x, 3.55, (L + 2) * TILE + 0.4, 0x2e3238);
        this._dbox(db, 0.4, 0.12, 0.6, x, 3.45, (L + 2) * TILE - 0.1, 0xffe9b0);
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
    // резервуары
    for (const pr of World.props) {
      if (pr.x < x0 * TILE || pr.x >= x1 * TILE || pr.z < z0 * TILE || pr.z >= z1 * TILE) continue;
      this._cyl(db, 2.2, 3.2, pr.x, 1.6, pr.z, 0x8f959c, 12);
      this._cyl(db, 2.25, 0.3, pr.x, 3.3, pr.z, 0x6f757c, 12);
    }
    if (db.pos.length) group.add(new THREE.Mesh(db.build(), this.matDetail));

    // --- здания (один меш, атлас) ---
    const bi = this._bIdx.get(cx + ',' + cy);
    if (bi && bi.length) {
      const bb = this._builder();
      // [u0, u1, v0, v1]; canvas-строка 0 (фасады) = v 0.75..1, строка 1 (крыши) = v 0.5..0.75
      const F = [[0, 0.25, 0.75, 1], [0.25, 0.5, 0.75, 1], [0.5, 0.75, 0.75, 1], [0.75, 1, 0.75, 1]];
      const R = [[0, 0.25, 0.5, 0.75], [0.25, 0.5, 0.5, 0.75]];
      for (const i of bi) {
        const b = World.buildings[i];
        const w = b.w * TILE, h = b.h * TILE;
        const cxp = (b.x0 + b.w / 2) * TILE, czp = (b.y0 + b.h / 2) * TILE;
        const f = F[b.facade % F.length], r = R[b.roof % R.length];
        const sides = [f[0], f[1], f[2], f[3]];
        this._box(bb, w, b.ht, h, cxp, b.ht / 2, czp, b.tint, { sides, roof: r });
        // небольшой козырёк у двери POI
        if (b.poi) this._dbox(bb, 2.6, 0.18, 1.4, cxp, b.ht + 0.4, czp + h / 2 + 0.5, 0x3a3f46);
      }
      group.add(new THREE.Mesh(bb.build(), this.matBuilding));
    }

    // --- деревья (instancing) ---
    const ti = this._tIdx.get(cx + ',' + cy);
    if (ti && ti.length) {
      let nTree = 0, nPalm = 0;
      for (const i of ti) if (World.trees[i].kind === 'palm') nPalm++; else nTree++;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
      const c = new THREE.Color();
      let k = 0;
      if (nTree) {
        const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 2.4, 5), this.matTrunk, nTree);
        const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 0), this.matTree, nTree);
        for (const i of ti) {
          const t = World.trees[i];
          if (t.kind !== 'tree') continue;
          const sc = 0.8 + (i % 7) * 0.06;
          v.set(t.x, 1.2 * sc, t.z); s.set(sc, sc, sc); q.identity();
          m4.compose(v, q, s); trunk.setMatrixAt(k, m4);
          v.set(t.x, 2.6 * sc + 1.1, t.z); s.set(sc * 1.15, sc, sc * 1.15);
          m4.compose(v, q, s); canopy.setMatrixAt(k, m4);
          c.setHSL(0.32 + (i % 5) * 0.012, 0.45, 0.3 + (i % 3) * 0.04);
          canopy.setColorAt(k, c);
          k++;
        }
        trunk.frustumCulled = false; canopy.frustumCulled = false;
        group.add(trunk); group.add(canopy);
      }
      if (nPalm) {
        const pg = this._palmGeo();
        const palm = new THREE.InstancedMesh(pg, this.matPalm, nPalm);
        k = 0;
        for (const i of ti) {
          const t = World.trees[i];
          if (t.kind !== 'palm') continue;
          const sc = 0.9 + (i % 5) * 0.05;
          v.set(t.x, 0, t.z); s.set(sc, sc, sc);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 0.7) % TAU);
          m4.compose(v, q, s); palm.setMatrixAt(k, m4);
          k++;
        }
        palm.frustumCulled = false;
        group.add(palm);
      }
    }

    group.position.set(0, 0, 0);
    return group;
  },
  _palmGeo() {
    if (this._palmCache) return this._palmCache;
    const b = this._builder();
    this._cyl(b, 0.16, 3.6, 0, 1.8, 0, 0x9a7b52, 6);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const dx = Math.cos(a) * 1.4, dz = Math.sin(a) * 1.4;
      this._dbox(b, 2.2, 0.08, 0.7, dx * 0.7, 3.7 - Math.abs(dx) * 0.25, dz * 0.7, 0x3f7d36);
    }
    const geo = b.build();
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
      if (o.geometry) o.geometry.dispose();
    });
  },

  /* пересборка статичных объектов после смены сида (мультиплеер) */
  resetStatics() {
    for (const [k, g] of this.chunks) { this.scene.remove(g); this._disposeGroup(g); }
    this.chunks.clear();
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh.geometry.dispose(); this.groundMesh = null; }
    if (this.signMesh) { this.scene.remove(this.signMesh); this.signMesh.geometry.dispose(); this.signMesh = null; }
    this.buildGround();
    this.buildSigns();
    this.buildIndex();
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
