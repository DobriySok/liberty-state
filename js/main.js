'use strict';
/* ================= ГЛАВНЫЙ МОДУЛЬ: цикл, ввод, состояния ================= */

const Game = {
  state: 'title',
  time: 0,
  fps: 60,
  keys: {},
  mouse: { x: 0, y: 0, down: false },
  bigMap: false,
  deadT: 0,
  bustT: 0,
  prompt: '',
  saveT: 0,
  remotes: new Map(),

  init() {
    const canvas = document.getElementById('game');
    // сначала мир (City3D.init читает World.tiles при сборке земли)
    World.gen(this._seed0());
    City3D.init(canvas);
    HUD.init(document.getElementById('hud'));
    UI.init();
    Bullets.init();
    City3D.update(World.START.x, World.START.z);
    Player.init(World.START.x, World.START.z);

    /* ---------- ввод ---------- */
    addEventListener('keydown', e => {
      AudioSys.init(); AudioSys.resume();
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') {
        if (this.bigMap) { this.bigMap = false; return; }
        if (this.state === 'playing') this.togglePause(true);
        else if (this.state === 'paused' || this.state === 'shop') this.togglePause(false);
        return;
      }
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyM') this.bigMap = !this.bigMap;
      if (e.code === 'KeyN') { AudioSys.radio(!AudioSys.radioOn); AudioSys.radioOn = !AudioSys.radioOn; }
      if (e.code === 'KeyF' && Player.inCar) AudioSys.horn();
      for (let i = 0; i < 5; i++)
        if (e.code === 'Digit' + (i + 1) && Player.weapons.length > i) { Player.wi = i; AudioSys.ui(); }
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (innerWidth / Math.max(1, r.width));
      this.mouse.y = (e.clientY - r.top) * (innerHeight / Math.max(1, r.height));
    });
    canvas.addEventListener('mousedown', e => {
      AudioSys.init(); AudioSys.resume();
      if (e.button === 0) this.mouse.down = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    addEventListener('contextmenu', e => e.preventDefault());

    UI.title();

    /* ---------- цикл: логика 30 Гц, рендер каждый кадр ---------- */
    let last = performance.now(), acc = 0;
    const frame = now => {
      requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;
      this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-4), 0.04);
      acc += dt;
      let n = 0;
      while (acc >= 1 / 30 && n < 3) { this.update(1 / 30); acc -= 1 / 30; n++; }
      if (n === 3) acc = 0;
    };
    requestAnimationFrame(frame);
  },

  _seed0() { return 10000 + (Date.now() % 90000); },

  /* ---------- жизненный цикл игры ---------- */
  _cleanupWorld() {
    for (const c of [...Cars.list]) Cars.remove(c);
    for (let i = Peds.list.length - 1; i >= 0; i--) { City3D.scene.remove(Peds.list[i].group); Peds.list.splice(i, 1); }
    for (const p of Pickups.list) City3D.scene.remove(p.mesh);
    Pickups.list = [];
    Traffic.cars = [];
    Police.cars = []; Police.patrol = null;
    Rivals.clear();
    Missions.active = false; Missions.targets = []; Missions.mCar = null;
  },
  _setupPlayer() {
    Player.x = World.START.x; Player.z = World.START.z; Player.angle = 0;
    Player.money = 250; Player.health = 100; Player.armor = 0;
    Player.weapons = [{ id: 'fists', ammo: Infinity }, { id: 'pistol', ammo: 36 }];
    Player.wi = 0; Player.inCar = null; Player.alive = true; Player.arrestT = 0;
    if (!Player.group) Player.init(Player.x, Player.z);
    else Player.group.visible = true;
  },

  newGame() {
    this._cleanupWorld();
    World.gen(this._seed0());
    City3D.resetStatics();
    this._setupPlayer();
    Missions.idx = 0;
    Crimes.level = 0;
    this.state = 'playing';
    Save.save();
    HUD.banner('LIBERTY STATE\nДелай что хочешь. Город наблюдает.');
    AudioSys.jingle();
  },
  loadGame() {
    const s = Save.load();
    if (!s) { this.newGame(); return; }
    this._cleanupWorld();
    World.gen(s.seed);
    City3D.resetStatics();
    this._setupPlayer();
    Player.setPos(s.x, s.z);
    Player.money = s.money;
    Player.health = s.health;
    Player.armor = s.armor;
    Player.weapons = s.weapons.map(w => ({ id: w.id, ammo: w.ammo }));
    Missions.idx = s.mission;
    Crimes.level = 0;
    this.state = 'playing';
    HUD.banner('С возвращением в Либерти');
  },
  reseedWorld(seed) {
    if (seed === World.seed || !seed) return;
    this._cleanupWorld();
    World.gen(seed);
    City3D.resetStatics();
    const c = World.collideCircle(Player.x, Player.z, 0.5);
    Player.setPos(c.x, c.z);
    HUD.toast('Мир синхронизирован (сид ' + seed + ')');
  },

  togglePause(on) {
    if (on) {
      this.state = 'paused';
      UI.pause();
      AudioSys.setEngine(false, 0);
      AudioSys.setSiren(0);
      AudioSys.setSkid(0);
      if (AudioSys.radioOn) { AudioSys.radio(false); AudioSys.radioOn = false; }
    } else {
      this.state = 'playing';
      UI.hide();
    }
  },
  toTitle() {
    Net.stop();
    this.state = 'title';
    UI.title();
    if (AudioSys.radioOn) { AudioSys.radio(false); AudioSys.radioOn = false; }
    AudioSys.setEngine(false, 0);
    AudioSys.setSiren(0);
  },
  toComplete() { this.state = 'complete'; UI.complete(); },

  /* ---------- взаимодействие ---------- */
  interact() {
    if (!Player.alive) return;
    if (Player.inCar) {
      const c = Player.inCar;
      c.occupied = false;
      // выход: ищем свободное место рядом
      const fx = Math.sin(c.angle), fz = Math.cos(c.angle);
      const rx = fz, rz = -fx; // вправо от носа
      for (const s of [1, -1]) {
        const px = c.x + rx * 2.3 * s, pz = c.z + rz * 2.3 * s;
        if (World.walkableAt(px, pz)) {
          Player.setPos(px, pz);
          Player.inCar = null;
          return;
        }
      }
      c.occupied = true; // тесно — остаёмся
      HUD.toast('Тесно, выйти некуда');
      return;
    }
    // POI?
    for (const poi of World.pois) {
      if (dist(poi.doorX, poi.doorZ, Player.x, Player.z) < 5) { this.openPoi(poi); return; }
    }
    const c = Cars.nearest(Player.x, Player.z, 3.6);
    if (c) {
      c.occupied = true;
      Player.inCar = c;
      HUD.toast(Meshes.CAR_TYPES[c.type].name + ' — WASD езда, SPACE ручник');
    }
  },
  openPoi(poi) {
    switch (poi.type) {
      case 'hospital': {
        const cost = Player.health < 30 ? 0 : 100;
        if (Player.health >= 100) HUD.toast('Ты здоров');
        else if (Player.money >= cost) {
          Player.money -= cost;
          Player.health = 100;
          HUD.toast(cost ? 'Лечение: -$' + cost : 'Бесплатное лечение');
        } else HUD.toast('Нужно $' + cost);
        break;
      }
      case 'police':
        Crimes.level = 0;
        Player.money = Math.max(0, Player.money - 500);
        HUD.toast('Розыск снят. Штраф: $500');
        break;
      case 'shop':
        this.state = 'shop';
        UI.shop();
        break;
      case 'garage':
        HUD.toast('Твой гараж. Здесь появляются машины для миссий.');
        break;
      case 'cafe':
        if (Player.money >= 5 && Player.health < 100) {
          Player.money -= 5;
          Player.health = Math.min(100, Player.health + 30);
          HUD.toast('Кофе: +30 здоровья');
        } else HUD.toast(Player.money >= 5 ? 'Ты полон сил' : 'Нужно $5');
        break;
    }
  },

  /* ---------- прицел: луч камеры → плоскость земли ---------- */
  aimRay() {
    const cam = City3D.camera;
    const v = new THREE.Vector3(
      this.mouse.x / innerWidth * 2 - 1,
      -(this.mouse.y / innerHeight) * 2 + 1,
      0.5
    ).unproject(cam);
    const dir = v.sub(cam.position).normalize();
    if (dir.y >= -0.001) return null;
    const t = (1.2 - cam.position.y) / dir.y;
    if (t < 0 || t > 200) return null;
    return { x: cam.position.x + dir.x * t, z: cam.position.z + dir.z * t };
  },

  /* ---------- смерть / арест ---------- */
  onPlayerDeath() {
    if (Missions.active) Missions.fail('смерть');
    Rivals.clear();
    if (Player.inCar) { Player.inCar.occupied = false; Player.inCar = null; }
    Player.arrestT = 0;
    Player.group.visible = false;
    this.state = 'dead';
    this.deadT = 3.2;
    AudioSys.setEngine(false, 0);
  },
  onBusted() {
    if (Missions.active) Missions.fail('арест');
    Rivals.clear();
    if (Player.inCar) { Player.inCar.occupied = false; Player.inCar = null; }
    Player.arrestT = 0;
    this.state = 'busted';
    this.bustT = 3;
    AudioSys.setEngine(false, 0);
  },
  _respawn(hp, fine) {
    const c = World.collideCircle(hp.doorX + 2, hp.doorZ + 2, 0.5);
    Player.setPos(c.x, c.z);
    Player.health = 100;
    Player.armor = 0;
    Player.alive = true;
    Player.money = Math.max(0, Player.money - fine);
    Crimes.level = 0;
    Player.group.visible = true;
    this.state = 'playing';
  },

  /* ---------- удалённые игроки ---------- */
  _removeRemoteVis(id) {
    const v = this.remotes.get(id);
    if (!v) return;
    if (v.carVis) City3D.scene.remove(v.carVis);
    if (v.ped) City3D.scene.remove(v.ped);
    this.remotes.delete(id);
  },
  updateRemotes(dt) {
    const now = performance.now();
    if (!Net.on) {
      for (const [id] of this.remotes) this._removeRemoteVis(id);
      return;
    }
    for (const [id, r] of Net.remotes) {
      if (now - r.last > 3500) { Net.remotes.delete(id); this._removeRemoteVis(id); continue; }
      let vis = this.remotes.get(id);
      if (!vis) { vis = { carVis: null, carType: null, carPaint: null, ped: null }; this.remotes.set(id, vis); }
      // интерполяция (буфер 120 мс)
      let sx = r.x, sz = r.z, sa = r.a;
      const b = r.buf;
      const t = now - 120;
      for (let i = b.length - 1; i > 0; i--) {
        if (b[i - 1].t <= t) {
          const k = (t - b[i - 1].t) / Math.max(1, b[i].t - b[i - 1].t);
          sx = lerp(b[i - 1].x, b[i].x, clamp(k, 0, 1));
          sz = lerp(b[i - 1].z, b[i].z, clamp(k, 0, 1));
          sa = angLerp(b[i - 1].a, b[i].a, clamp(k, 0, 1));
          break;
        }
      }
      if (r.car) {
        if (vis.ped) { City3D.scene.remove(vis.ped); vis.ped = null; }
        if (!vis.carVis || vis.carType !== r.car.type || vis.carPaint !== r.car.paint) {
          this._removeRemoteVis(id);
          vis = { carVis: null, carType: null, carPaint: null, ped: null };
          this.remotes.set(id, vis);
          vis.carVis = Meshes.car(r.car.type, r.car.paint);
          City3D.scene.add(vis.carVis);
          vis.carType = r.car.type;
          vis.carPaint = r.car.paint;
        }
        vis.carVis.position.set(sx, 0, sz);
        vis.carVis.rotation.y = sa;
        if (r.car.hp < 40 && Math.random() < 0.25)
          City3D.puff(sx + rand(-0.5, 0.5), 1.2, sz + rand(-0.5, 0.5), 0, 2, 0, 0.7, 0.25, 0.25, 0.27, 0.8);
      } else {
        if (vis.carVis) { City3D.scene.remove(vis.carVis); vis.carVis = null; }
        if (!vis.ped) { vis.ped = Meshes.ped(0xe0703f, 0xd8a878, false); City3D.scene.add(vis.ped); }
        vis.ped.position.set(sx, 0, sz);
        vis.ped.rotation.y = sa;
      }
    }
    for (const [id] of this.remotes) if (!Net.remotes.has(id)) this._removeRemoteVis(id);
  },

  /* ---------- обновление ---------- */
  update(dt) {
    this.time += dt;
    HUD.update(dt);

    if (this.state === 'title') {
      const t = this.time * 0.05;
      const cx = WORLD_M / 2, cz = WORLD_M / 2;
      City3D.update(cx, cz);
      City3D.camera.position.set(cx + Math.cos(t) * 120, 70, cz + Math.sin(t) * 120);
      City3D.camera.lookAt(cx, 8, cz);
      City3D.render(dt);
      HUD.draw(this);
      return;
    }

    if (this.state === 'paused' || this.state === 'shop' || this.state === 'complete') {
      City3D.render(dt);
      HUD.draw(this);
      return;
    }

    const playing = this.state === 'playing';

    if (playing && Player.alive) Player.update(dt);
    Cars.updateAll(dt);
    Peds.updateAll(dt);
    Traffic.update(dt);
    Police.update(dt);
    Rivals.update(dt);
    Bullets.update(dt);
    Pickups.update(dt);
    Crimes.update(dt);
    if (playing) Missions.update(dt);

    if (playing) {
      Net.tick();
      this.saveT += dt;
      if (this.saveT > 45) { this.saveT = 0; Save.save(); }
      // сирена по близости
      let siren = 0;
      for (const c of Cars.list)
        if (c.ai && c.ai.kind === 'police' && !c.dead) {
          const d = dist(c.x, c.z, Player.x, Player.z);
          if (d < 90) siren = Math.max(siren, 1 - d / 90);
        }
      AudioSys.setSiren(siren);
      if (Player.inCar)
        AudioSys.setEngine(true, clamp(Math.abs(Player.inCar.v) / Meshes.CAR_TYPES[Player.inCar.type].max, 0, 1));
      else AudioSys.setEngine(false, 0);
      // подсказка
      this.prompt = '';
      if (Player.inCar) this.prompt = '[E] Выйти из машины';
      else {
        for (const poi of World.pois)
          if (dist(poi.doorX, poi.doorZ, Player.x, Player.z) < 5) {
            this.prompt = { hospital: '[E] Больница', police: '[E] Полиция (снять розыск)', shop: '[E] Магазин', garage: '[E] Гараж', cafe: '[E] Кофейня' }[poi.type] || '';
            break;
          }
        if (!this.prompt && Cars.nearest(Player.x, Player.z, 3.6)) this.prompt = '[E] Сесть в машину';
      }
      // камера
      const onFoot = !Player.inCar;
      const speed01 = Player.inCar ? clamp(Math.abs(Player.inCar.v) / 30, 0, 1) : 0;
      City3D.updateCamera(Player.x, Player.z, onFoot ? Player.angle : Player.inCar.angle, speed01, onFoot, dt);
      City3D.update(Player.x, Player.z);
    } else if (this.state === 'dead') {
      this.deadT -= dt;
      if (this.deadT <= 0) {
        const h = World.pois.find(p => p.type === 'hospital');
        this._respawn(h, Math.floor(Player.money * 0.15));
      }
    } else if (this.state === 'busted') {
      this.bustT -= dt;
      if (this.bustT <= 0) {
        const p = World.pois.find(poi => poi.type === 'police');
        this._respawn(p, 500);
      }
    } else {
      City3D.update(Player.x, Player.z);
    }

    this.updateRemotes(dt);
    City3D.updateShadows();
    City3D.render(dt);
    HUD.draw(this);
  }
};

addEventListener('DOMContentLoaded', () => Game.init());
