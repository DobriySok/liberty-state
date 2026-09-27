'use strict';
/* ================= УТИЛИТЫ + склейка геометрии ================= */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (x1, z1, x2, z2) => (x1 - x2) * (x1 - x2) + (z1 - z2) * (z1 - z2);
const dist = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const angLerp = (a, b, t) => a + angDiff(a, b) * clamp(t, 0, 1);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

/* Склеить список {geo, matrix} в один BufferGeometry (позиции/нормали/uv/color/индексы) */
function mergeGeos(list) {
  const pos = [], norm = [], uv = [], col = [], idx = [];
  let vi = 0, hasColor = false;
  const nm = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (const it of list) {
    const g = it.geo, m = it.matrix;
    nm.getNormalMatrix(m);
    const p = g.attributes.position, no = g.attributes.normal, u = g.attributes.uv, cc = g.attributes.color;
    const gi = g.index;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      n.fromBufferAttribute(no, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z); norm.push(n.x, n.y, n.z);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      if (cc) { hasColor = true; col.push(cc.getX(i), cc.getY(i), cc.getZ(i)); }
      else if (hasColor) col.push(1, 1, 1);
    }
    if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + vi);
    else for (let i = 0; i < p.count; i++) idx.push(i + vi);
    vi += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col.length) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

/* Матрица «позиция/поворот Y/масштаб» — частый случай */
function trs(x, y, z, ry, s, sy) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0);
  const sc = new THREE.Vector3(s == null ? 1 : s, sy == null ? (s == null ? 1 : s) : sy, s == null ? 1 : s);
  return m.compose(new THREE.Vector3(x, y, z), q, sc);
}
