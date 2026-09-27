'use strict';
/* ================= UI: меню/пауза/загрузка ================= */

const UI = {
  el: null,

  init() { this.el = document.getElementById('overlay'); },

  hide() { this.el.classList.add('hidden'); },
  show() { this.el.classList.remove('hidden'); },

  panel(html) {
    this.el.innerHTML = '<div class="panel">' + html + '</div>';
    this.show();
    return this.el.firstChild;
  },
  btn(text, cb, cls) {
    const b = document.createElement('button');
    b.className = 'menu-btn' + (cls ? ' ' + cls : '');
    b.textContent = text;
    b.onclick = () => { AudioSys.init(); AudioSys.resume(); AudioSys.ui(); cb(); };
    return b;
  },

  loading(p) {
    if (!this._lb) {
      this.panel('<div class="logo">LIBERTY STATE <span class="l2">II</span></div><div class="subtitle">ЗАГРУЗКА ГОРОДА…</div><div id="loadbar"><div></div></div>');
      this._lb = this.el.querySelector('#loadbar>div');
    }
    this._lb.style.width = (p * 100).toFixed(0) + '%';
  },

  title() {
    const p = this.panel(
      '<div class="logo">LIBERTY STATE <span class="l2">II</span></div>' +
      '<div class="subtitle">ОТКРЫТЫЙ МИР · БРАУЗЕР · СВОБОДНЫЕ АССЕТЫ</div>');
    p.appendChild(this.btn('НОВАЯ ИГРА', () => { this.hide(); Game.newGame(); }));
    p.appendChild(this.btn('УПРАВЛЕНИЕ', () => this.help()));
    p.appendChild(this.btn('О ИГРЕ', () => this.about()));
    const c = document.createElement('div'); c.className = 'credits';
    c.innerHTML = 'Модели города и машин: KayKit — Kay Lousberg (CC0)<br>Персонажи: Kenney (CC0) · Текстуры: ambientCG (CC0)<br>Музыка: Kevin MacLeod — Funkorama, Elevator (CC-BY, incompetech.com)';
    p.appendChild(c);
  },

  help() {
    const p = this.panel('<h2 class="menu-title">УПРАВЛЕНИЕ</h2><div class="help">' +
      '<b>WASD</b> движение / машина<br><b>Мышь</b> камера (орбита) · ЛКМ огонь<br>' +
      '<b>ПКМ</b> прицел «в плечо»<br><b>Shift</b> бег · <b>Space</b> прыжок / ручник<br>' +
      '<b>E</b> сесть/выйти из машины · <b>F</b> сигнал<br>' +
      '<b>1/2/3</b> оружие · <b>N</b> радио · <b>M</b> пауза</div>');
    p.appendChild(this.btn('НАЗАД', () => this.title(), 'small'));
  },

  about() {
    const p = this.panel('<h2 class="menu-title">О ИГРЕ</h2><div class="help">' +
      'Оригинальная браузерная GTA-подобная песочница.<br>Вся логика — клиентский JavaScript (three.js, MIT).<br>' +
      'Все ассеты — свободные лицензии (CC0 / CC-BY),<br>никаких материалов Rockstar Games.</div>');
    p.appendChild(this.btn('НАЗАД', () => this.title(), 'small'));
  },

  pause() {
    const p = this.panel('<h2 class="menu-title">ПАУЗА</h2>');
    p.appendChild(this.btn('ПРОДОЛЖИТЬ', () => Game.togglePause(false)));
    p.appendChild(this.btn('УПРАВЛЕНИЕ', () => this.help()));
    p.appendChild(this.btn('ГЛАВНОЕ МЕНЮ', () => Game.toTitle()));
  },

  wasted(cb, title) {
    const p = this.panel('<h2 class="menu-title">' + title + '</h2>');
    p.appendChild(this.btn('ПОПРОБОВАТЬ СНОВА', () => { this.hide(); cb(); }));
  }
};
