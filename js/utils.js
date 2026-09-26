'use strict';
/* ================= Утилиты ================= */

// Детерминированный ГПСЧ (mulberry32) — для генерации мира
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr, rng) => arr[Math.floor((rng || Math.random)() * arr.length)];

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
const angLerp = (a, b, t) => a + angDiff(a, b) * t;

const fmtMoney = n => '$' + Math.max(0, Math.floor(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtTime = s => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// точка-отрезок (XZ)
function ptSeg2D(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-8 ? clamp((dx * (px - x1) + dz * (pz - z1)) / l2, 0, 1) : 0;
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}
// расстояние между двумя отрезками на плоскости XZ (строго)
function segSeg2D(p1x, p1z, p2x, p2z, q1x, q1z, q2x, q2z) {
  const d1x = p2x - p1x, d1z = p2z - p1z;
  const d2x = q2x - q1x, d2z = q2z - q1z;
  const rx = p1x - q1x, rz = p1z - q1z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z;
  if (a <= 1e-8 && e <= 1e-8) return Math.hypot(rx, rz);
  const b = d1x * d2x + d1z * d2z;
  const c = d1x * rx + d1z * rz;
  const f = d2x * rx + d2z * rz;
  let d = Infinity;
  // минимум на концах (покрывает все случаи, кроме пересечения)
  d = Math.min(d, ptSeg2D(p1x, p1z, q1x, q1z, q2x, q2z));
  d = Math.min(d, ptSeg2D(p2x, p2z, q1x, q1z, q2x, q2z));
  d = Math.min(d, ptSeg2D(q1x, q1z, p1x, p1z, p2x, p2z));
  d = Math.min(d, ptSeg2D(q2x, q2z, p1x, p1z, p2x, p2z));
  // внутренняя стационарная точка (пересечение)
  const denom = a * e - b * b;
  if (denom > 1e-8) {
    const s = clamp((b * f - c * e) / denom, 0, 1);
    const t = clamp((a * f - b * c) / denom, 0, 1);
    d = Math.min(d, Math.hypot((p1x + d1x * s) - (q1x + d2x * t), (p1z + d1z * s) - (q1z + d2z * t)));
  }
  return d;
}
// «капля»: машина = отрезок с центром (x,z), направлением angle, полу-длина hl
const carSeg = (x, z, angle, hl) => {
  const dx = Math.sin(angle) * hl, dz = Math.cos(angle) * hl;
  return [x - dx, z - dz, x + dx, z + dz];
};

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Оффскрин-канвас
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
