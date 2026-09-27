'use strict';
/* ================= GAME: состояние, камера SA-стиля, хиты, эффекты, цикл ================= */

const Game = {
  state: 'boot', time: 0, fps: 60, money: 350,
  keys: {}, mouseDown: false,
  player: null,
  camYaw: 0, camDist: 7, camShakeV: 0,
  _bullets: [], _puffs: [],

  async boot() {
    const canvas = document.getElementById('game');
    UI.init();
    UI.loading(0.02);
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.3, 700);

    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

    await Assets.load(p => UI.loading(p));
    UI.hide();
    UI.title();
    this.state = 'title';
    HUD.init();
    World.gen(20260927);
    World.timeOfDay = 10.0;
    World.updateSky();
    City.update();

    // ввод
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight, false);
      HUD.resize();
    });
    addEventListener('keydown', e => {
      AudioSys.init(); AudioSys.resume();
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') { if (this.state === 'playing') this.togglePause(true); else if (this.state === 'paused') this.togglePause(false); }
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyN') AudioSys.radioToggle();
      if (e.code === 'KeyM') AudioSys.next();
      if (e.code === 'KeyF' && this.player.car) AudioSys._osc('sawtooth', 420, 380, 0.4, 0.15);
      for (let i = 0; i < 3; i++) if (e.code === 'Digit' + (i + 1) && this.player.weapons.length > i) { this.player.wi = i; HUD.toast(this.player.weapon.name); }
    });
    addEventListener('keyup', e => this.keys[e.code] = false);
    canvas.addEventListener('mousedown', e => {
      AudioSys.init(); AudioSys.resume();
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.player.aiming = true;
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2 && this.player) this.player.aiming = false;
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas || this.state !== 'playing') return;
      const pl = this.player;
      pl.yaw -= e.movementX * 0.0026;
      pl.pitch = clamp(pl.pitch + e.movementY * 0.0022, -0.15, 1.1);
    });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.8, 3.5, 14); });

    // цикл
    let last = performance.now(), acc = 0;
    const frame = now => {
      requestAnimationFrame(frame);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25;
      this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-4), 0.05);
      acc += dt;
      let n = 0;
      while (acc >= 1 / 30 && n < 3) { this.update(1 / 30); acc -= 1 / 30; n++; }
      if (n === 3) acc = 0;
      this.render();
    };
    requestAnimationFrame(frame);
  },

  newGame() {
    this.money = 350;
    Player.hp = 100; Player.armor = 0; Player.money = 350;
    Player.weapons = [{ id: 'fist', ammo: Infinity }, { id: 'pistol', ammo: 60 }]; Player.wi = 1;
    Vehicles.clear(); Peds.clear(); Police.clearAll();
    Missions.abort(false);
    const start = World.spawnPts[Math.floor(World.spawnPts.length * 0.3)];
    Player.x = start.x + 3; Player.z = start.z + 3;
    if (!Player.group) Player.init(start.x + 3, start.z + 3);
    else { Player.group.position.set(Player.x, 0, Player.z); Player.group.visible = true; }
    Player.yaw = 0;
    this.camYaw = 0;
    Police.clear();
    this.state = 'playing';
    HUD.toast('LIBERTY STATE II. Делай что хочешь.');
    AudioSys.jingle();
    AudioSys.playTrack(0);
  },

  togglePause(on) {
    if (on) { this.state = 'paused'; UI.pause(); document.exitPointerLock && document.exitPointerLock(); }
    else { this.state = 'playing'; UI.hide(); }
  },

  toTitle() { this.state = 'title'; UI.title(); document.exitPointerLock && document.exitPointerLock(); },

  interact() {
    const pl = this.player;
    if (pl.car) { pl.leaveCar(); return; }
    const v = Vehicles.nearest(pl.x, pl.z, 4);
    if (v) {
      if (Math.random() < 0.7) { // водитель убегает
        Peds.spawnOne(v.x + 2, v.z + 2).then(p => { p.panicT = 5; });
        HUD.toast('Водитель выбежал из машины!');
      }
      this.crime(0.4);
      pl.enterCar(v);
    }
  },

  /* ---------- попадания ---------- */
  hitscan(x, z, ang, range, dmg, by) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    // пешеходы
    for (const p of Peds.list) {
      if (p.dead) continue;
      const t = (p.x - x) * dx + (p.z - z) * dz;
      if (t < 0.5 || t > range) continue;
      const px = x + dx * t, pz = z + dz * t;
      if (dist2(px, pz, p.x, p.z) < 0.65) {
        p.hp -= dmg;
        Peds.panic(p.x, p.z, 26);
        if (p.hp <= 0) Peds.kill(p, by);
        return;
      }
    }
    // машины
    for (const v of Vehicles.list) {
      if (v.dead) continue;
      const t = (v.x - x) * dx + (v.z - z) * dz;
      if (t < 0.5 || t > range) continue;
      if (dist2(x + dx * t, z + dz * t, v.x, v.z) < 3.4) {
        v.hp -= dmg * 0.8;
        if (v.driver === 'ai') { v.ai.tx = v.x + rand(-30, 30); v.ai.tz = v.z + rand(-30, 30); v.ai.target = null; }
        return;
      }
    }
  },

  /* ---------- эффекты ---------- */
  muzzle(x, y, z, ang) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd070, transparent: true, opacity: 0.9 }));
    s.position.set(x, y, z); s.scale.setScalar(0.5);
    this.scene.add(s);
    setTimeout(() => this.scene.remove(s), 45);
  },
  puff(x, y, z, fire) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: fire ? 0xff7020 : 0x888888, transparent: true, opacity: 0.5 }));
    s.position.set(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4));
    s.scale.setScalar(0.8);
    s.userData.life = 1;
    this.scene.add(s);
    this._puffs.push({ s, vy: rand(1.2, 2.2) });
  },
  boom(x, z) {
    AudioSys.boom();
    for (let i = 0; i < 10; i++) setTimeout(() => this.puff(x + rand(-1.5, 1.5), rand(0.5, 2.5), z + rand(-1.5, 1.5), i < 5), i * 60);
    this.camShake(0.8);
    Peds.panic(x, z, 40);
    for (const v of Vehicles.list) if (!v.dead && dist2(v.x, v.z, x, z) < 7 * 7) v.hp -= 55;
    const pl = this.player;
    if (!pl.car && dist2(pl.x, pl.z, x, z) < 6 * 6) pl.damage(45);
  },
  camShake(v) { this.camShakeV = Math.min(1, this.camShakeV + v); },

  /* ---------- события ---------- */
  crime(n) { Police.crime(n); },
  wasted() {
    this.state = 'dead';
    AudioSys.siren(false);
    UI.wasted(() => this.newGame(), 'ТЕБЯ УБИЛИ');
    document.exitPointerLock && document.exitPointerLock();
  },
  busted() {
    this.state = 'dead';
    UI.wasted(() => { this.money = Math.max(0, this.money - 150); this.newGame(); }, 'АРЕСТ · штраф $150');
    document.exitPointerLock && document.exitPointerLock();
  },

  /* ---------- камера (SA-стиль: орбита вокруг героя/машины) ---------- */
  updateCamera(dt) {
    const pl = this.player, C = this.camera;
    const tx = pl.x, tz = pl.z;
    const inCar = !!pl.car;
    const aim = pl.aiming && !inCar;
    const dist = aim ? 2.6 : (inCar ? 8.5 + pl.car.speed * 0.12 : this.camDist);
    const h = aim ? 1.7 : (inCar ? 3.4 : 2.6);
    // в машине камера плавно догоняет курсор
    if (inCar) this.camYaw = angLerp(this.camYaw, pl.yaw - Math.PI, Math.min(1, 2.2 * dt));
    const yaw = this.camYaw;
    const cx = tx - Math.sin(yaw) * Math.cos(pl.pitch) * dist;
    const cz = tz - Math.cos(yaw) * Math.cos(pl.pitch) * dist;
    const cy = h + Math.sin(pl.pitch) * dist;
    const k = 1 - Math.exp(-9 * dt);
    C.position.lerp(new THREE.Vector3(cx, cy, cz), k);
    const sh = this.camShakeV * 0.25;
    this.camShakeV = Math.max(0, this.camShakeV - dt * 2.5);
    C.position.x += rand(-sh, sh); C.position.y += rand(-sh, sh);
    const look = new THREE.Vector3(tx, (aim ? 1.5 : 1.1), tz);
    if (aim) { look.x += Math.sin(pl.yaw) * 8; look.z += Math.cos(pl.yaw) * 8; }
    C.lookAt(look);
  },

  /* ---------- update ---------- */
  update(dt) {
    this.time += dt;
    if (this.state === 'playing') {
      World.timeOfDay = (World.timeOfDay + dt / 60) % 24;   // сутки = 24 минуты
      if ((this.time * 2 | 0) % 2 === 0) World.updateSky();
      Player.update(dt);
      Vehicles.update(dt);
      Vehicles.traffic(dt);
      Peds.update(dt);
      Police.update(dt);
      AudioSys.siren(Police.stars > 0 && this.player.car != null);
      Missions.update(dt);
      if (Player.car) AudioSys.engine(clamp(Player.car.speed / 30, 0, 1), true);
      else AudioSys.engine(0, false);
    }
    for (const p of [...this._puffs]) {
      p.s.position.y += p.vy * dt;
      p.s.scale.multiplyScalar(1 + 1.6 * dt);
      p.s.material.opacity -= 0.7 * dt;
      if (p.s.material.opacity <= 0) { this.scene.remove(p.s); this._puffs.splice(this._puffs.indexOf(p), 1); }
    }
    if (this.player) this.updateCamera(dt);
    HUD.update(dt);
  },

  render() {
    if (this.state === 'title') {
      const t = this.time * 0.06;
      const c = CITY / 2;
      this.camera.position.set(c + Math.cos(t) * 150, 90, c + Math.sin(t) * 150);
      this.camera.lookAt(c, 0, c);
    }
    this.renderer.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'paused' || this.state === 'dead') && this.player && HUD.x) HUD.draw();
  }
};

/* мини-алиасы */
const City = { update() { World.updateSky(); } };
Game.player = Player;

Game.boot();
