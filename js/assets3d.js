'use strict';
/* ================= 3D-АССЕТЫ: Kenney (CC0) — загрузка, геометрия, материалы =================
   Все модели — бесплатные CC0-паки Kenney (kenney.nl), легальны для коммерческого использования.
   Каждый GLB склеивается в ОДНУ геометрию (один draw call на instanced-вариант).
   Персонаж — FBX с ригами и анимациями Idle/Run/Jump (нужен fflate). */

const Assets3D = {
  ready: false,
  v: {},        // 'cat/file' -> { geo, bb: {w,h,d}, minY }
  mats: {},     // cat -> material
  char: null,   // { proto, clips, skins, scale, bbH, handBone }
  _m4: new THREE.Matrix4(), _q: new THREE.Quaternion(), _v: new THREE.Vector3(), _s: new THREE.Vector3(), _c: new THREE.Color(),

  CATS: {
    commercial: ['building-a','building-b','building-c','building-d','building-e','building-f','building-g','building-h',
                 'building-i','building-j','building-k','building-l','building-m','building-n',
                 'building-skyscraper-a','building-skyscraper-b','building-skyscraper-c','building-skyscraper-d','building-skyscraper-e'],
    suburban:   ['building-type-a','building-type-b','building-type-c','building-type-d','building-type-e','building-type-f',
                 'building-type-g','building-type-h','building-type-i','building-type-j','building-type-k','building-type-l',
                 'tree-large','tree-small'],
    industrial: ['building-a','building-b','building-c','building-d','building-e','building-f','building-g','building-h',
                 'building-i','building-j','water-tower','detail-tank','shipping-container-a','chimney-basic','windmill-low'],
    modular:    ['building-sample-tower-a','building-sample-tower-b','building-sample-tower-c','building-sample-tower-d'],
    roads:      ['light-curved','light-square','traffic-light','electricity-pole','road-sign-stop','road-sign-street',
                 'road-sign-warning','construction-cone','dumpster'],
    cars:       ['sedan','sedan-sports','hatchback-sports','race','taxi','van','truck','police','suv']
  },

  /* пулы вариантов для генерации мира */
  POOLS: {
    tower: ['modular/building-sample-tower-a','modular/building-sample-tower-b','modular/building-sample-tower-c','modular/building-sample-tower-d',
            'commercial/building-skyscraper-a','commercial/building-skyscraper-b','commercial/building-skyscraper-c',
            'commercial/building-skyscraper-d','commercial/building-skyscraper-e'],
    mid:   ['commercial/building-a','commercial/building-b','commercial/building-c','commercial/building-d','commercial/building-e',
            'commercial/building-f','commercial/building-g','commercial/building-h','commercial/building-i','commercial/building-j',
            'commercial/building-k','commercial/building-l','commercial/building-m','commercial/building-n'],
    house: ['suburban/building-type-a','suburban/building-type-b','suburban/building-type-c','suburban/building-type-d',
            'suburban/building-type-e','suburban/building-type-f','suburban/building-type-g','suburban/building-type-h',
            'suburban/building-type-i','suburban/building-type-j','suburban/building-type-k','suburban/building-type-l'],
    ind:   ['industrial/building-a','industrial/building-b','industrial/building-c','industrial/building-d','industrial/building-e',
            'industrial/building-f','industrial/building-g','industrial/building-h','industrial/building-i','industrial/building-j']
  },

  load(onProgress) {
    if (this.ready) return Promise.resolve();
    const loader = new THREE.GLTFLoader();
    const fbx = new THREE.FBXLoader();
    const texL = new THREE.TextureLoader();
    const jobs = [];
    const done = { n: 0 };

    const progress = () => onProgress && onProgress(done.n / jobs.length);

    // --- текстуры и GLB по пакетам ---
    for (const [cat, files] of Object.entries(this.CATS)) {
      const texPath = 'assets/' + cat + '/Textures/colormap.png';
      jobs.push(texL.loadAsync(texPath).then(tex => {
        tex.anisotropy = 4;
        tex.magFilter = THREE.LinearFilter;
        this.mats[cat] = new THREE.MeshLambertMaterial({ map: tex });
      }).catch(e => { this.mats[cat] = new THREE.MeshLambertMaterial({ color: 0xb8b2a8 }); }));
      for (const f of files) {
        const id = cat + '/' + f;
        // ресурсный путь — относительный к файлу GLB (иначе все паки
        // подхватят текстуры первой загруженной категории)
        loader.setResourcePath('assets/' + cat + '/');
        jobs.push(loader.loadAsync('assets/' + cat + '/' + f + '.glb').then(gltf => {
          const geo = this._mergeScene(gltf.scene);
          geo.computeBoundingBox();
          const box = geo.boundingBox;
          const s = box.getSize(new THREE.Vector3());
          this.v[id] = { geo, bb: { w: s.x, h: s.y, d: s.z }, minY: box.min.y };
        }).catch(e => console.warn('assets3d: нет файла ' + id, e.message))
         .then(() => { done.n++; progress(); }));
      }
    }

    // --- персонаж (FBX) ---
    jobs.push((async () => {
      const base = 'assets/people/';
      const model = await fbx.loadAsync(base + 'characterMedium.fbx');
      const clips = {};
      for (const a of ['idle', 'run', 'jump']) {
        const f = await fbx.loadAsync(base + 'Animations/' + a + '.fbx');
        for (const c of f.animations) {
          const nm = c.name || '';
          if (nm.includes('Targeting')) continue;
          clips[a] = c;
        }
      }
      // bbox только видимого меша (контрольные IK-кости искажают общий bbox)
      let meshBBH = 1, minY = 0;
      model.traverse(o => {
        if (o.isMesh && o.geometry) {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox;
          meshBBH = Math.max(meshBBH, b.max.y - b.min.y);
          minY = Math.min(minY, b.min.y);
        }
      });
      // в FBX юниты сантиметры
      const scale = 1.78 / (meshBBH * 0.01);
      let handBone = null;
      model.traverse(o => { if (o.isBone && /Righthand$/i.test(o.name)) handBone = o.name; });
      const skinTex = {};
      for (const s of ['humanMaleA','humanFemaleA','zombieMaleA','zombieFemaleA']) {
        skinTex[s] = await new THREE.TextureLoader().loadAsync(base + 'skins/' + s + '.png');
      }
      this.char = { proto: model, clips, skinTex, scale, bbH: meshBBH, minY, handBone };
    })().then(() => { done.n++; progress(); }));

    return Promise.all(jobs).then(() => { this.ready = true; onProgress && onProgress(1); });
  },

  /* склейка GLB-сцены в одну геометрию (все меши — один материал пакета) */
  _mergeScene(root) {
    root.updateMatrixWorld(true);
    const pos = [], norm = [], uv = [], idx = [];
    let vi = 0;
    const m3 = new THREE.Matrix3();
    root.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g.attributes.normal) g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      const m = o.matrixWorld;
      m3.getNormalMatrix(m);
      const v = new THREE.Vector3(), nn = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m);
        nn.fromBufferAttribute(n, i).applyMatrix3(m3).normalize();
        pos.push(v.x, v.y, v.z);
        norm.push(nn.x, nn.y, nn.z);
        uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      }
      const gi = g.index;
      if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + vi);
      else for (let i = 0; i < p.count; i++) idx.push(i + vi);
      vi += p.count;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.userData.shared = true; // не dispose-ить при разборе чанков
    return geo;
  },

  /* ---------- фабрики сущностей ---------- */

  /* Машина: тип -> GLB-модель, маштаб под физический бокс */
  car(type) {
    const T = Meshes.CAR_TYPES[type];
    const model = {
      sedan: 'cars/sedan', sport: 'cars/sedan-sports', muscle: 'cars/race',
      taxi: 'cars/taxi', van: 'cars/van', truck: 'cars/truck', police: 'cars/police'
    }[type] || 'cars/sedan';
    const v = this.v[model];
    const bb = v.bb;
    const sx = T.W / bb.w, sz = T.L / bb.d, sy = (T.low ? 1.25 : 1.5) / bb.h;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(v.geo, this.mats.cars);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
    let lightbar = null;
    if (type === 'police') {
      const barMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
      lightbar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), barMat);
      lightbar.position.set(0, T.low ? 1.35 : 1.55, 0);
      group.add(lightbar);
    }
    group.userData = {
      type, len: T.L, wid: T.W, lightbar,
      radius: Math.max(T.L, T.W) * 0.42
    };
    return group;
  },

  /* Персонаж: skin ('humanMaleA' и пр.), gun — давить ствол в правую руку */
  person(skin, gun) {
    const C = this.char;
    const group = new THREE.Group();
    const inst = C.proto.clone(true);
    // материал скина — клонируем, чтобы каждая инстанция могла иметь свой скин
    inst.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.map = C.skinTex[skin] || C.skinTex.humanMaleA;
      }
    });
    inst.scale.setScalar(C.scale);
    group.add(inst);
    if (gun) {
      const g = new THREE.Group();
      const gm = new THREE.MeshLambertMaterial({ color: 0x181a1e });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.42), gm);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), gm);
      grip.position.set(0, -0.1, -0.12);
      g.add(body, grip);
      if (C.handBone) {
        let hand = null;
        inst.traverse(o => { if (o.isBone && o.name === C.handBone) hand = o; });
        if (hand) { g.position.set(0, -0.05, 0.16); g.rotation.x = -Math.PI / 2; hand.add(g); }
        else group.add(g);
      } else group.add(g);
    }
    const mixer = new THREE.AnimationMixer(inst);
    const act = {
      idle: C.clips.idle ? mixer.clipAction(C.clips.idle) : null,
      run:  C.clips.run  ? mixer.clipAction(C.clips.run)  : null,
      jump: C.clips.jump ? mixer.clipAction(C.clips.jump) : null
    };
    if (act.idle) act.idle.play();
    group.userData = { mixer, act, inst };
    return group;
  },

  /* переключение idle/run (вызывается каждый кадр у сущности) */
  setWalk(group, spd, dt) {
    const u = group.userData;
    if (!u.mixer) return;
    u.mixer.update(dt);
    const a = u.act;
    if (!a.run || !a.idle) return;
    const want = spd > 0.5 ? a.run : a.idle;
    const other = want === a.run ? a.idle : a.run;
    if (want !== u._cur) {
      if (u._cur) u._cur.fadeOut(0.15);
      want.fadeIn(0.15).play();
      u._cur = want;
    }
    if (a.run) a.run.timeScale = clamp(spd / 4.2, 0.6, 1.8);
  }
};
