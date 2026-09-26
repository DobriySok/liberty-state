'use strict';
/* ================= МИССИИ =================
   Контент полностью оригинальный. 6 миссий, открываются по порядку. */

function spawnMissionCar(type, x, z, angle, paint) {
  const c = new Car(x, z, angle || 0, type, paint);
  c.ai = null;
  Cars.add(c);
  return c;
}

const Missions = {
  idx: 0,
  active: false,
  data: null,
  step: 0,
  time: 0,
  targets: [],
  mCar: null,
  wave: 0,
  waveCd: 0,
  pts: [],
  pt: 0,

  list: [
    {
      name: 'ПЕРВАЯ МАШИНА',
      reward: 500,
      brief: 'У гаража стоит мускул-кар. Забери его и доставь на парковку в центре города.',
      run(M) {
        M.mCar = spawnMissionCar('muscle', 282, 421, Math.PI, 0xc0392b);
        M.step = 0;
      },
      update(M) {
        if (M.mCar.dead) return 'машина уничтожена';
        if (M.step === 0) {
          if (Player.inCar === M.mCar) M.step = 1;
        } else if (M.step === 1) {
          if (dist2(Player.x, Player.z, 272, 216) < 49) return 'complete';
        }
      },
      text: M => M.step === 0 ? 'Сядь в машину у гаража' : 'Доставь машину на парковку в центре',
      marker: M => M.step === 0 ? { x: 282, z: 421, r: 5 } : { x: 272, z: 216, r: 7 }
    },
    {
      name: 'КУРЬЕРСКАЯ СЛУЖБА',
      reward: 1000,
      brief: 'Возьми такси с парковки и объезжай четыре точки. Время — 80 секунд.',
      run(M) {
        M.mCar = spawnMissionCar('taxi', 272, 216, 0, 0xf5d76e);
        M.step = 0; M.time = 0;
        M.pts = [[120, 260], [300, 150], [340, 300], [272, 216]];
        M.pt = 0;
      },
      update(M) {
        if (M.mCar.dead) return 'такси уничтожено';
        if (M.step === 0) {
          if (Player.inCar === M.mCar) M.step = 1;
          return;
        }
        if (M.time > 80) return 'время вышло';
        if (M.pt < M.pts.length && dist2(Player.x, Player.z, M.pts[M.pt][0], M.pts[M.pt][1]) < 49) {
          M.pt++;
          if (M.pt >= M.pts.length) return 'complete';
        }
      },
      text: M => M.step === 0 ? 'Сядь в такси' : 'Точка ' + (M.pt + 1) + '/' + M.pts.length + '   (' + fmtTime(80 - M.time) + ')',
      marker: M => M.step === 0 ? { x: 272, z: 216, r: 5 } : (M.pt < M.pts.length ? { x: M.pts[M.pt][0], z: M.pts[M.pt][1], r: 7 } : null)
    },
    {
      name: 'ЗАЩИТНИК РАЙОНА',
      reward: 1500,
      brief: 'Приди на точку пешком и отбей три волны налётчиков. Возьми ПП в магазине, если нужен.',
      run(M) {
        const hasSmg = Player.weapons.find(w => w.id === 'smg');
        if (hasSmg) Player.wi = Player.weapons.indexOf(hasSmg);
        else Player.giveWeapon('smg');
        M.step = 0; M.wave = 0; M.waveCd = 1.5;
      },
      update(M, dt) {
        if (M.time > 180) return 'время вышло';
        if (M.step === 0) {
          if (!Player.inCar && dist2(Player.x, Player.z, 100, 180) < 36) { M.step = 1; }
          return;
        }
        if (M.targets.length === 0) {
          M.waveCd -= dt;
          if (M.waveCd <= 0) {
            M.wave++;
            if (M.wave > 3) return 'complete';
            HUD.toast('Волна ' + M.wave);
            for (let i = 0; i < 2 + M.wave; i++) {
              const a = Math.random() * TAU, r = rand(22, 34);
              const x = 100 + Math.sin(a) * r, z = 180 + Math.cos(a) * r;
              if (World.walkableAt(x, z)) M.targets.push(new Ped(x, z, { rival: true, mission: true }));
            }
            M.waveCd = 4;
          }
        }
      },
      text: M => M.step === 0 ? 'Приди на точку пешком' : 'Врагов осталось: ' + M.targets.length + '   (волна ' + Math.min(M.wave, 3) + '/3)',
      marker: M => M.step === 0 ? { x: 100, z: 180, r: 6 } : null
    },
    {
      name: 'ГОРЯЧИЕ КОЛЁСА',
      reward: 2000,
      brief: 'Спорткар на месте. Шесть точек по кругу — промзона и аэродром. 110 секунд.',
      run(M) {
        M.mCar = spawnMissionCar('sport', 282, 425, Math.PI, 0xd63031);
        M.step = 0; M.time = 0;
        M.pts = [[280, 80], [480, 28], [380, 110], [420, 180], [280, 190], [282, 414]];
        M.pt = 0;
      },
      update(M) {
        if (M.mCar.dead) return 'машина уничтожена';
        if (M.step === 0) {
          if (Player.inCar === M.mCar) M.step = 1;
          return;
        }
        if (M.time > 110) return 'время вышло';
        if (M.pt < M.pts.length && dist2(Player.x, Player.z, M.pts[M.pt][0], M.pts[M.pt][1]) < 49) {
          M.pt++;
          if (M.pt >= M.pts.length) return 'complete';
        }
      },
      text: M => M.step === 0 ? 'Сядь в спорткар' : 'Точка ' + (M.pt + 1) + '/' + M.pts.length + '   (' + fmtTime(110 - M.time) + ')',
      marker: M => M.step === 0 ? { x: 282, z: 425, r: 5 } : (M.pt < M.pts.length ? { x: M.pts[M.pt][0], z: M.pts[M.pt][1], r: 7 } : null)
    },
    {
      name: 'БОСС РАЙОНА',
      reward: 3000,
      brief: 'Приедь в северный район, устрани троих ривалей и сбеги к гаражу, пока полиция не закрыла.',
      run(M) {
        M.mCar = spawnMissionCar('muscle', 282, 429, Math.PI, 0x6c5ce7);
        M.step = 0; M.time = 0;
      },
      update(M, dt) {
        if (M.mCar.dead) return 'машина уничтожена';
        if (M.step === 0) {
          if (Player.inCar === M.mCar) M.step = 1;
          return;
        }
        if (M.step === 1) {
          if (dist2(Player.x, Player.z, 150, 130) < 25 * 25) {
            M.step = 2;
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * TAU, r = rand(18, 38);
              const x = 150 + Math.sin(a) * r, z = 130 + Math.cos(a) * r;
              if (World.walkableAt(x, z)) M.targets.push(new Ped(x, z, { rival: true, mission: true }));
            }
            HUD.toast('Устрани ривалей');
          }
          return;
        }
        if (M.step === 2) {
          Crimes.level = Math.max(Crimes.level, 3);
          if (M.targets.length === 0) { M.step = 3; M.time = 0; HUD.toast('Уезжай к гаражу!'); }
          return;
        }
        if (M.step === 3) {
          if (M.time > 75) return 'время вышло';
          Crimes.level = Math.max(Crimes.level, 3);
          if (dist2(Player.x, Player.z, 282, 414) < 49) return 'complete';
        }
      },
      text: M => M.step === 0 ? 'Сядь в машину' : M.step === 1 ? 'Приезжай в северный район'
        : M.step === 2 ? 'Ривалей осталось: ' + M.targets.length : 'К гаражу!  (' + fmtTime(75 - M.time) + ')',
      marker: M => M.step === 1 ? { x: 150, z: 130, r: 25 } : M.step === 3 ? { x: 282, z: 414, r: 8 } : null
    },
    {
      name: 'КОРОЛЬ ЛИБЕРТИ',
      reward: 5000,
      brief: 'Финал. Бронированный мускул-кар. Доберись до вертолётной площадки, выдерживай удары.',
      run(M) {
        M.mCar = spawnMissionCar('muscle', 282, 433, Math.PI, 0x2d3436);
        M.mCar.health = 240;
        M.step = 0; M.time = 0;
      },
      update(M, dt) {
        if (M.mCar.dead) return 'машина уничтожена';
        if (M.step === 0) {
          if (Player.inCar === M.mCar) M.step = 1;
          return;
        }
        if (M.step === 1) {
          if (dist2(Player.x, Player.z, 304, 28) < 15 * 15) { M.step = 2; M.time = 0; HUD.toast('Держись 45 секунд!'); }
          return;
        }
        if (M.step === 2) {
          Crimes.level = 3;
          if (Rivals.cars.length < 2 && M.time < 5) { Rivals.spawn(345, 62); Rivals.spawn(268, 62); }
          if (M.time > 45) M.step = 3;
          return;
        }
        if (M.step === 3) {
          if (dist2(Player.x, Player.z, 304, 28) < 6 * 6) return 'complete';
        }
      },
      text: M => M.step === 0 ? 'Сядь в бронированный автомобиль' : M.step === 1 ? 'Доберись до вертолётной площадки'
        : M.step === 2 ? 'ВЫДЕРЖИВАЙ!  (' + fmtTime(45 - M.time) + ')' : 'На площадку!',
      marker: M => M.step === 1 ? { x: 304, z: 28, r: 15 } : M.step === 3 ? { x: 304, z: 28, r: 6 } : null
    }
  ],

  start() {
    if (this.idx >= this.list.length) return;
    this.data = this.list[this.idx];
    this.active = true;
    this.step = 0;
    this.time = 0;
    this.targets = [];
    this.mCar = null;
    HUD.banner(this.data.name + '\n' + this.data.brief);
    AudioSys.jingle();
    this.data.run(this);
  },

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const res = this.data.update(this, dt);
    if (res === 'complete') this.complete();
    else if (res) this.fail(res);
  },

  complete() {
    const m = this.data;
    this.active = false;
    Player.money += m.reward;
    Rivals.clear();
    this.cleanup();
    HUD.banner('МИССИЯ ВЫПОЛНЕНА\n+' + fmtMoney(m.reward));
    AudioSys.jingle();
    this.idx++;
    Save.save();
    if (this.idx >= this.list.length)
      setTimeout(() => { if (Game.state === 'playing') Game.toComplete(); }, 3500);
  },

  fail(reason) {
    this.active = false;
    Rivals.clear();
    this.cleanup();
    HUD.banner('МИССИЯ ПРОВАЛЕНА\n' + (reason || ''));
    AudioSys.fail();
  },

  cleanup() {
    this.mCar = null;
    for (const t of this.targets) {
      const i = Peds.list.indexOf(t);
      if (i >= 0) { City3D.scene.remove(t.group); Peds.list.splice(i, 1); }
    }
    this.targets = [];
  },

  onRivalKilled(p) {
    if (!this.active) return;
    const i = this.targets.indexOf(p);
    if (i >= 0) this.targets.splice(i, 1);
  },

  marker() {
    if (!this.active) return null;
    return this.data.marker(this);
  },
  text() {
    if (!this.active) return null;
    return this.data.text(this);
  }
};
