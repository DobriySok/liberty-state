'use strict';
/* ================= UI: DOM-меню поверх игры ================= */

const UI = {
  ov: null,
  _load: null,
  init() { this.ov = document.getElementById('overlay'); this.hide(); },

  /* ---------- экран загрузки 3D-ассетов ---------- */
  loading(p) {
    if (!this._load) {
      this._load = el('div', 'loading');
      this._load.innerHTML = '<div class="logo">LIBERTY STATE</div>' +
        '<div class="load-bar"><div class="load-fill"></div></div>' +
        '<div class="load-txt">Загрузка города…</div>';
      document.body.appendChild(this._load);
    }
    const f = this._load.querySelector('.load-fill');
    const t = this._load.querySelector('.load-txt');
    f.style.width = Math.round(p * 100) + '%';
    t.textContent = p >= 1 ? 'Готово' : 'Загрузка города… ' + Math.round(p * 100) + '%';
  },
  hideLoading() {
    if (!this._load) return;
    const l = this._load;
    l.classList.add('done');
    setTimeout(() => { if (l.parentNode) l.remove(); if (this._load === l) this._load = null; }, 600);
  },
  loadingError() {
    if (!this._load) this.loading(0);
    const t = this._load.querySelector('.load-txt');
    t.textContent = 'Не удалось загрузить 3D-модели. Проверь подключение к интернету и обнови страницу (Ctrl+R).';
    t.style.color = '#ff6b6b';
  },

  show(node) {
    this.ov.innerHTML = '';
    this.ov.classList.remove('hidden');
    this.ov.appendChild(node);
  },
  hide() {
    this.ov.classList.add('hidden');
    this.ov.innerHTML = '';
  },
  panel(html) { return el('div', 'panel', html || ''); },
  btn(text, cls, cb) {
    const b = el('button', 'menu-btn' + (cls ? ' ' + cls : ''), text);
    b.onclick = () => { AudioSys.ui(); cb(); };
    return b;
  },
  netStatus(text) {
    const e = document.getElementById('net-status');
    if (e) e.textContent = text;
  },

  /* ---------- главное меню ---------- */
  title() {
    const p = this.panel('<div class="logo">LIBERTY STATE</div><div class="subtitle">ОТКРЫТЫЙ МИР · 3D · ЧИСТЫЙ BROWSER · БЕЗ СЕРВЕРА</div>');
    const hasSave = Save.has();
    const b1 = this.btn(hasSave ? 'ПРОДОЛЖИТЬ' : 'НОВАЯ ИГРА', '', () => { this.hide(); hasSave ? Game.loadGame() : Game.newGame(); });
    const b2 = this.btn(hasSave ? 'НОВАЯ ИГРА' : 'ПРОДОЛЖИТЬ', '', () => { this.hide(); hasSave ? Game.newGame() : null; if (!hasSave) Game.newGame(); });
    p.appendChild(b1);
    if (hasSave) p.appendChild(b2);
    p.appendChild(this.btn('МУЛЬТИПЛЕЕР (LAN)', '', () => this.net()));
    p.appendChild(this.btn('УПРАВЛЕНИЕ', '', () => this.help()));
    p.appendChild(this.btn('О ИГРЕ', '', () => this.about()));
    p.appendChild(el('div', 'footer', 'Оригинальный проект: 3D-модели Kenney (CC0) + процедурный мир · Three.js (MIT) · WebRTC без сервера<br>Никаких ассетов, названий или кода GTA. Все совпадения с реальными марками случайны.'));
    this.show(p);
  },

  pause() {
    const p = this.panel('<h2 class="menu-title">ПАУЗА</h2>');
    p.appendChild(this.btn('ПРОДОЛЖИТЬ', '', () => Game.togglePause(false)));
    p.appendChild(this.btn('СОХРАНИТЬ', '', () => { Save.save(); this.toastInPause('Сохранено'); }));
    const qRow = el('div', 'kv');
    qRow.innerHTML = '<span>Качество графики</span>';
    const sel = el('select');
    sel.innerHTML = '<option value="high">Высокое</option><option value="med">Среднее</option><option value="low">Низкое</option>';
    sel.value = City3D.quality;
    sel.onchange = () => { City3D.setQuality(sel.value); AudioSys.ui(); };
    qRow.appendChild(sel);
    p.appendChild(qRow);
    const sRow = el('label', 'chk');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = !AudioSys.muted;
    sRow.appendChild(cb); sRow.appendChild(document.createTextNode(' Звук и радио'));
    cb.onchange = () => { if (cb.checked) { AudioSys.muted = false; if (AudioSys.master) AudioSys.master.gain.value = 0.4; } else AudioSys.toggleMute(); };
    p.appendChild(sRow);
    p.appendChild(this.btn('МАГАЗИН (уличная торговля)', '', () => this.shop()));
    p.appendChild(this.btn('УПРАВЛЕНИЕ', '', () => this.help()));
    p.appendChild(this.btn('В ГЛАВНОЕ МЕНЮ', '', () => Game.toTitle()));
    this.show(p);
  },
  toastInPause(msg) { HUD.toast(msg); },

  help() {
    const rows = [
      ['WASD / стрелки', 'движение / руль'],
      ['Shift', 'бег'],
      ['Мышь (ЛКМ)', 'прицел / стрельба'],
      ['E', 'сесть / выйти из машины, взаимодействовать (больница, магазин, полиция)'],
      ['Пробел', 'ручник (в машине)'],
      ['F', 'гудок (в машине)'],
      ['1…5', 'смена оружия'],
      ['M', 'карта города'],
      ['N', 'радио вкл/выкл'],
      ['Esc', 'пауза']
    ];
    const p = this.panel('<h2 class="menu-title">УПРАВЛЕНИЕ</h2>');
    for (const [k, v] of rows) p.appendChild(el('div', 'kv', '<b>' + k + '</b><span>' + v + '</span>'));
    const back = this.btn('НАЗАД', 'small', () => {
      if (Game.state === 'paused') Game.togglePause(false);
      else UI.title();
    });
    p.appendChild(back);
    this.show(p);
  },

  about() {
    const p = this.panel('<h2 class="menu-title">О ИГРЕ</h2>');
    p.appendChild(el('div', 'note', `
      <b>LIBERTY STATE</b> — полностью браузерный open-world экшен с видом от третьего лица.
      <br><br>
      • Всё написано с нуля на чистом JavaScript + Three.js (лицензия MIT).
      • 3D-модели — бесплатные CC0-наборы Kenney (kenney.nl): здания, машины, персонажи, природа.
      • Мир, дороги, ландшафт и эффекты генерируются кодом детерминированно (сид).
      • Никаких ассетов, музыки, названий и кода из GTA или других игр.
      • Работает без сервера: открой index.html в браузере.
      • Мультиплеер — WebRTC P2P (LAN или интернет), сигналинг копируешь в мессенджер.
      • Производительность: стриминг чанков мира, instancing, low-poly — рассчитано на слабые ПК.
      <br><br>
      Город: центр, жилые кварталы, промзона, парк, пляж и аэродром.
      6 миссий, розыск, полиция, трафик, магазины, сохранения.
    `));
    p.appendChild(this.btn('НАЗАД', 'small', () => UI.title()));
    this.show(p);
  },

  complete() {
    const p = this.panel('<h2 class="menu-title">ТЫ — КОРОЛЬ ЛИБЕРТИ</h2>');
    p.appendChild(el('div', 'note', 'Все 6 миссий выполнены. Город твой.<br>Казна: <b>' + fmtMoney(Player.money) + '</b><br><br>Дальше — свободная игра: город, полиция, трафик и друзья по сети.'));
    p.appendChild(this.btn('ИГРАТЬ В ГОРОДЕ', '', () => { this.hide(); Game.state = 'playing'; }));
    p.appendChild(this.btn('В ГЛАВНОЕ МЕНЮ', '', () => Game.toTitle()));
    this.show(p);
  },

  shop() {
    if (Game.state === 'paused') Game.state = 'shop';
    const p = this.panel('<h2 class="menu-title">МАГАЗИН · <span id="shop-money"></span></h2>');
    const moneyEl = () => {
      const e = document.getElementById('shop-money');
      if (e) e.textContent = fmtMoney(Player.money);
    };
    const item = (title, price, canBuy, cb) => {
      const row = el('div', 'shop-row');
      const left = el('span', null, title);
      const right = el('span', 'price', fmtMoney(price));
      const b = el('button', null, canBuy ? 'КУПИТЬ' : 'НЕТ ДЕНЕГ');
      b.disabled = !canBuy;
      b.onclick = () => { cb(); UI.shop(); };
      row.append(left, right, b);
      p.appendChild(row);
      return row;
    };
    for (const w of WEAPONS) {
      if (w.id === 'fists') continue;
      const own = Player.weapons.find(x => x.id === w.id);
      if (own) {
        const price = Math.max(60, Math.round(w.price * 0.15));
        item(w.name + ' — патроны до ' + w.ammo + ' (' + own.ammo + ')', price, Player.money >= price, () => {
          Player.money -= price; own.ammo = w.ammo; AudioSys.buy();
        });
      } else {
        item(w.name + ' — ' + w.ammo + ' патронов', w.price, Player.money >= w.price, () => {
          Player.money -= w.price; Player.giveWeapon(w.id); AudioSys.buy();
        });
      }
    }
    item('Бронежилот (+50 защиты)', 100, Player.money >= 100 && Player.armor < 100, () => {
      Player.money -= 100; Player.armor = Math.min(100, Player.armor + 50); AudioSys.buy();
    });
    moneyEl();
    p.appendChild(this.btn('ЗАКРЫТЬ', 'small', () => Game.togglePause(false)));
    this.show(p);
  },

  /* ---------- мультиплеер ---------- */
  net() {
    const p = this.panel('<h2 class="menu-title">МУЛЬТИПЛЕЕР · LAN БЕЗ СЕРВЕРА</h2>');
    const nameInp = el('input');
    nameInp.type = 'text';
    nameInp.placeholder = 'Твой позывной';
    nameInp.value = Net.name;
    p.appendChild(nameInp);

    const tabs = el('div', 'tab-row');
    const tabLocal = el('div', 'tab active', 'ЛОКАЛЬНО (2 вкладки)');
    const tabLan = el('div', 'tab', 'LAN (WEBRTC)');
    tabs.append(tabLocal, tabLan);
    p.appendChild(tabs);

    const localPane = el('div');
    const lanPane = el('div', 'hidden');
    p.append(localPane, lanPane);
    const switchTab = (which) => {
      tabLocal.classList.toggle('active', which === 'local');
      tabLan.classList.toggle('active', which === 'lan');
      localPane.classList.toggle('hidden', which !== 'local');
      lanPane.classList.toggle('hidden', which !== 'lan');
    };
    tabLocal.onclick = () => switchTab('local');
    tabLan.onclick = () => switchTab('lan');

    // --- локальный ---
    localPane.appendChild(el('div', 'note', 'BroadcastChannel: открой эту игру во ВТОРОЙ вкладке того же браузера. Соединение мгновенное, идеино для проверки.'));
    const row = el('div', 'btn-row');
    row.appendChild(this.btn('ПОДКЛЮЧИТЬСЯ', 'small', () => {
      Net.stop();
      Net.startLocal(nameInp.value.trim() || 'Игрок');
      UI.netStatus('Готово. Открой вторую вкладку.');
      Game.togglePause(false);
    }));
    row.appendChild(this.btn('ОТКЛЮЧИТЬ', 'small', () => { Net.stop(); UI.netStatus('Отключено.'); }));
    localPane.appendChild(row);

    // --- LAN ---
    const status = el('div', 'hidden', '');
    status.id = 'net-status';
    lanPane.appendChild(status);

    const hBlock = el('div');
    hBlock.appendChild(el('div', 'note', '<b>ХОСТ (первый игрок):</b> создай слот → отправь OFFER-код игроку (в мессенджер). Он пришлёт ANSWER-код → вставь и нажми «Применить». Повторяй для каждого нового игрока (до 5).'));
    const hRow = el('div', 'btn-row');
    const bHost = this.btn('СОЗДАТЬ СЛОТ (OFFER)', 'small', async () => {
      try {
        Net.stopLocal();
        const offer = await Net.hostOffer();
        offerBox.value = offer;
        UI.netStatus('OFFER готов. Отправь код игроку.');
      } catch (e) { UI.netStatus('Ошибка: ' + e.message); }
    });
    hRow.appendChild(bHost);
    hBlock.appendChild(hRow);
    const offerBox = el('textarea');
    offerBox.rows = 4; offerBox.readOnly = true;
    offerBox.placeholder = 'OFFER-код появится здесь';
    hBlock.appendChild(offerBox);
    const ansBox = el('textarea');
    ansBox.rows = 4;
    ansBox.placeholder = 'Вставь сюда ANSWER-код от игрока';
    hBlock.appendChild(ansBox);
    const aRow = el('div', 'btn-row');
    aRow.appendChild(this.btn('ПРИМЕНИТЬ ANSWER', 'small', async () => {
      try {
        await Net.hostAddPeer(ansBox.value);
        ansBox.value = '';
      } catch (e) { UI.netStatus('Ошибка: ' + e.message); }
    }));
    aRow.appendChild(this.btn('ОТКРЫТЬ В НОВОМ ОКНЕ', 'small', () => {
      const t = el('textarea'); t.value = offerBox.value;
      const w = window.open('', '_blank');
      if (w) { w.document.write('<pre>' + offerBox.value + '</pre>'); }
    }));
    hBlock.appendChild(aRow);
    lanPane.appendChild(hBlock);

    const jBlock = el('div');
    jBlock.appendChild(el('div', 'note', '<b>ИГРОК (подключение):</b> вставь OFFER-код от хоста → «Подключиться» → отправь хосту свой ANSWER-код.'));
    const jOffer = el('textarea');
    jOffer.rows = 4;
    jOffer.placeholder = 'OFFER-код от хоста';
    jBlock.appendChild(jOffer);
    const jRow = el('div', 'btn-row');
    const bJoin = this.btn('ПОДКЛЮЧИТЬСЯ', 'small', async () => {
      try {
        Net.stopLocal();
        const ans = await Net.joinOffer(jOffer.value);
        joinBox.value = ans;
        UI.netStatus('Отправь ANSWER-код хосту.');
      } catch (e) { UI.netStatus('Ошибка: ' + e.message); }
    });
    jRow.appendChild(bJoin);
    jBlock.appendChild(jRow);
    const joinBox = el('textarea');
    joinBox.rows = 4; joinBox.readOnly = true;
    joinBox.placeholder = 'Твой ANSWER-код появится здесь — отправь его хосту';
    jBlock.appendChild(joinBox);
    lanPane.appendChild(jBlock);

    const bottom = el('div', 'btn-row');
    bottom.appendChild(this.btn('ВЫЙТИ ИЗ МУЛЬТИПЛЕЕРА', 'small', () => { Net.stop(); UI.netStatus('Отключено.'); }));
    bottom.appendChild(this.btn('ЗАКРЫТЬ', 'small', () => {
      if (Game.state === 'paused' || Game.state === 'shop') Game.togglePause(false);
      else UI.title();
    }));
    lanPane.appendChild(bottom);
    p.appendChild(el('div', 'note', 'Все игроки должны быть в одной сети (LAN) или иметь доступ друг к другу через интернет. STUN/TURN не требуются для LAN.'));
    this.show(p);
  }
};
