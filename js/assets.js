'use strict';
/* ================= ASSETS: загрузка фото-текстур (ambientCG, CC0),
   GLB-город KayKit (CC0), персонажи Kenney (CC0). Ничего процедурного. ================= */
THREE.Cache.enabled = true;

const Assets = {
  ready: false,
  tex: {},          // фототекстуры
  cityMat: null,    // общий материал KayKit (атлас вшит в GLB)
  bMat: null,       // материал зданий (отдельный, с emissive для ночи)
  geo: {},          // 'name' -> merged BufferGeometry
  size: {},         // 'name' -> {x,y,z}
  charClips: null,  // анимации персонажа
  charFiles: null,

  load(onProgress) {
    if (this.ready) return Promise.resolve();
    const jobs = [];
    let done = 0, total = 0;
    const tick = () => { done++; onProgress && onProgress(done / Math.max(total, 1)); };
    const add = p => { total++; return p.then(r => { tick(); return r; }).catch(e => { tick(); throw e; }); };

    const texL = new THREE.TextureLoader();
    const tex = (url, rep) => add(new Promise((res, rej) => texL.load(url, t => {
      t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
      if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      res(t);
    }, undefined, () => rej(new Error('tex ' + url)))));
    jobs.push(tex('assets/tex/grass.jpg', true).then(t => this.tex.grass = t));
    jobs.push(tex('assets/tex/concrete.jpg', true).then(t => this.tex.concrete = t));
    jobs.push(tex('assets/tex/asphalt.jpg', true).then(t => this.tex.asphalt = t));

    // KayKit GLB -> merged geometry per file (дороги больше не нужны — свой асфальт)
    const names = ['building-A','building-B','building-C','building-D','building-E','building-F','building-G','building-H',
      'bench','bush','dumpster','firehydrant','streetlight','watertower',
      'car-sedan','car-taxi','car-police','car-hatchback','car-stationwagon'];
    const loader = new THREE.GLTFLoader();
    for (const n of names) {
      add(loader.loadAsync('assets/kaykit/' + n + '.glb').then(g => {
        const list = [];
        g.scene.updateMatrixWorld(true);
        g.scene.traverse(o => { if (o.isMesh && o.geometry) list.push({ geo: o.geometry, matrix: o.matrixWorld }); });
        const merged = mergeGeos(list);
        merged.computeBoundingBox();
        const s = new THREE.Vector3(); merged.boundingBox.getSize(s);
        this.geo[n] = merged; this.size[n] = s;
      }));
    }

    // деревья Kenney: у них своя палитра (assets/trees/Textures/colormap.png) —
    // сохраняем РОДНОЙ материал из загрузчика
    jobs.push(add(loader.loadAsync('assets/trees/tree-large.glb').then(g => {
      const list = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => { if (o.isMesh && o.geometry) { list.push({ geo: o.geometry, matrix: o.matrixWorld }); if (!this.treeMat) this.treeMat = o.material; } });
      const merged = mergeGeos(list);
      merged.computeBoundingBox();
      const s = new THREE.Vector3(); merged.boundingBox.getSize(s);
      this.geo['tree-large'] = merged; this.size['tree-large'] = s;
    })));
    jobs.push(add(loader.loadAsync('assets/trees/tree-small.glb').then(g => {
      const list = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => { if (o.isMesh && o.geometry) list.push({ geo: o.geometry, matrix: o.matrixWorld }); });
      const merged = mergeGeos(list);
      merged.computeBoundingBox();
      const s = new THREE.Vector3(); merged.boundingBox.getSize(s);
      this.geo['tree-small'] = merged; this.size['tree-small'] = s;
    })));

    // город: два материала — обычный и «ночные окна» (emissive по атласу)
    // GLB-атлас: flipY=false (как у всех glTF), иначе семпллинг зеркалится
    jobs.push(tex('assets/kaykit/Textures/colormap.png', false).then(t => {
      t.flipY = false; t.needsUpdate = true;
      this.cityMat = new THREE.MeshLambertMaterial({ map: t });
      this.bMat = new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 });
      this.roadTex = t;
    }));

    // персонаж: файл + клипы (по одному референсу; инстансы грузят файл сами — THREE.Cache)
    const fbxL = new THREE.FBXLoader();
    jobs.push(add((async () => {
      const m = await fbxL.loadAsync('assets/people/characterMedium.fbx');
      const clips = {};
      for (const a of ['idle', 'run', 'jump']) {
        const f = await fbxL.loadAsync('assets/people/Animations/' + a + '.fbx');
        for (const c of f.animations) if (!(c.name || '').includes('Targeting')) clips[a] = c;
      }
      let h = 1.8;
      m.updateMatrixWorld(true);
      const wb = new THREE.Box3().setFromObject(m);   // мировой размер (масштаб FBX учтён)
      h = Math.max(0.5, wb.max.y - wb.min.y);
      this.charProto = { scene: m, clips, h, scale: 1.78 / h };
      this.charFiles = ['humanMaleA', 'humanFemaleA', 'zombieMaleA', 'zombieFemaleA'];
      // скины
      this.charSkins = {};
      for (const s of this.charFiles) {
        this.charSkins[s] = await tex('assets/people/skins/' + s + '.png', false);
      }
    })()));

    return Promise.all(jobs).then(() => { this.ready = true; onProgress && onProgress(1); });
  },

  /* готовый меш из named-геометрии */
  mesh(name, mat) {
    const g = this.geo[name];
    const m = new THREE.Mesh(g, mat || this.cityMat);
    m.userData.geoName = name;
    return m;
  }
};
