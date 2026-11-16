// 武器与角色模型（按骨骼合并网格 + 顶点色），以及持枪 IK、行走与倒地动画。
import * as THREE from '../vendor/three.module.min.js';
import { Q } from './settings.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _col = new THREE.Color();
const DOWN = new THREE.Vector3(0, -1, 0), UPY = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- 网格合并器 ----------
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  addM(geo, color, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(matrix);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    _col.set(color);
    for (let i = 0; i < P.length; i += 3) {
      this.p.push(P[i], P[i + 1], P[i + 2]); this.n.push(N[i], N[i + 1], N[i + 2]); this.c.push(_col.r, _col.g, _col.b);
    }
    if (g !== geo) g.dispose(); geo.dispose();
    return this;
  }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return this.addM(geo, color, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  }
  box(w, h, d, color, ...t) { return this.add(new THREE.BoxGeometry(w, h, d), color, ...t); }
  // 圆柱：沿 Z 轴（枪管方向）
  cyl(r1, r2, len, color, ...t) { const g = new THREE.CylinderGeometry(r1, r2, len, 12); g.rotateX(Math.PI / 2); return this.add(g, color, ...t); }
  capsule(r, len, color, ...t) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 10), color, ...t); }
  sphere(r, color, ...t) { return this.add(new THREE.SphereGeometry(r, 12, 9), color, ...t); }
  // 侧面轮廓挤出：pts 为 [前向 u, 向上 v]，thick 为厚度（X 方向）
  prof(pts, thick, color, x = 0, bevel = 0.003) {
    const sh = new THREE.Shape(); pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
    g.translate(0, 0, -(thick - bevel * 2) / 2); g.rotateY(Math.PI / 2);
    return this.add(g, color, x, 0, 0);
  }
  // 两点之间的胶囊（手臂等）
  limb(a, b, r, color) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 10);
    _m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UPY, d.normalize()), _s.set(1, 1, 1));
    return this.addM(g, color, _m);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export const gunMat = Q.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 })
  : new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x666666 });
export const bodyMat = Q.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  : new THREE.MeshLambertMaterial({ vertexColors: true });

// ======================= 武器 =======================
const METAL = 0x3a3f46, METAL2 = 0x50565e, POLY = 0x22252a, WOOD = 0x7d4f27, WOOD2 = 0x5e3a1b, OLIVE = 0x4c5a3c, STEEL = 0xc2c7cc, LENS = 0x25506b;
// 抓握点（武器局部坐标，-Z 为枪口方向）
export const GUN = {
  rifle:   { grip: [0, -0.055, 0.07],  fore: [0, 0.005, -0.27],  butt: 0.30, mz: -0.61, mv: 0.036, long: true, sight: 0.092 },
  smg:     { grip: [0, -0.05, 0.075],  fore: [0, -0.05, -0.115], butt: 0.29, mz: -0.31, mv: 0.04,  long: true, sight: 0.1 },
  shotgun: { grip: [0, -0.02, 0.115],  fore: [0, 0.01, -0.32],   butt: 0.32, mz: -0.65, mv: 0.05,  long: true, sight: 0.072 },
  sniper:  { grip: [0, -0.06, 0.11],   fore: [0, -0.012, -0.2],  butt: 0.36, mz: -0.70, mv: 0.05,  long: true },
  pistol:  { grip: [0, -0.07, 0.07],   fore: [-0.03, -0.085, 0.06], butt: 0, mz: -0.115, mv: 0.022, long: false, sight: 0.05 },
  knife:   { grip: [0, 0, 0.055],      fore: null, butt: 0, mz: -0.2, mv: 0, long: false },
};
function buildGun(id) {
  const b = new Builder();
  if (id === 'rifle') {
    b.prof([[-0.10, 0], [0.17, 0], [0.17, 0.05], [0.12, 0.066], [-0.10, 0.066]], 0.042, METAL);
    b.box(0.034, 0.012, 0.2, METAL2, 0, 0.07, -0.02);
    b.box(0.014, 0.016, 0.02, POLY, 0, 0.08, -0.1);
    b.prof([[0.17, 0.004], [0.38, 0.012], [0.38, 0.056], [0.17, 0.062]], 0.046, WOOD);
    for (let i = 0; i < 3; i++) b.box(0.05, 0.012, 0.03, WOOD2, 0, 0.034, -0.22 - i * 0.05);
    b.cyl(0.009, 0.009, 0.2, METAL2, 0, 0.068, -0.27);
    b.cyl(0.0095, 0.0095, 0.22, METAL, 0, 0.036, -0.47);
    b.cyl(0.014, 0.012, 0.05, POLY, 0, 0.036, -0.585);
    b.box(0.008, 0.045, 0.012, METAL, 0, 0.06, -0.52); b.box(0.026, 0.008, 0.012, METAL, 0, 0.084, -0.52);
    b.prof([[-0.10, 0.06], [-0.30, 0.045], [-0.30, -0.065], [-0.27, -0.07], [-0.10, 0.0]], 0.038, WOOD, 0, 0.005);
    b.box(0.04, 0.115, 0.01, POLY, 0, -0.01, 0.302);
    b.prof([[-0.075, 0.0], [-0.035, 0.0], [-0.06, -0.105], [-0.105, -0.095]], 0.032, WOOD2, 0, 0.005);
    b.box(0.006, 0.006, 0.07, METAL, 0, -0.036, -0.0); b.box(0.006, 0.03, 0.006, METAL, 0, -0.02, -0.035); b.box(0.005, 0.022, 0.006, POLY, 0, -0.014, 0.005, 0.3);
    b.prof([[0.03, 0.0], [0.09, 0.0], [0.135, -0.17], [0.085, -0.185]], 0.028, METAL2);
    b.box(0.02, 0.008, 0.022, STEEL, 0.028, 0.05, -0.06);
  } else if (id === 'smg') {
    b.prof([[-0.12, 0], [0.16, 0], [0.16, 0.06], [0.13, 0.07], [-0.12, 0.07]], 0.044, POLY);
    b.box(0.02, 0.01, 0.22, METAL2, 0, 0.076, -0.02);
    b.box(0.012, 0.018, 0.014, METAL, 0, 0.088, 0.07); b.box(0.008, 0.02, 0.01, METAL, 0, 0.088, -0.12);
    b.cyl(0.018, 0.018, 0.1, METAL, 0, 0.04, -0.21);
    for (let i = 0; i < 3; i++) b.box(0.04, 0.008, 0.012, POLY, 0, 0.04, -0.18 - i * 0.028);
    b.cyl(0.011, 0.011, 0.05, POLY, 0, 0.04, -0.285);
    b.prof([[0.02, 0], [0.06, 0], [0.066, -0.2], [0.026, -0.2]], 0.026, METAL2);
    b.prof([[-0.085, 0], [-0.045, 0], [-0.065, -0.1], [-0.11, -0.09]], 0.032, POLY, 0, 0.005);
    b.prof([[0.1, 0], [0.135, 0], [0.13, -0.085], [0.1, -0.085]], 0.03, POLY, 0, 0.005);
    b.box(0.006, 0.006, 0.06, METAL, 0, -0.035, 0.01);
    b.box(0.008, 0.012, 0.17, METAL, 0.018, 0.045, 0.2); b.box(0.008, 0.012, 0.17, METAL, -0.018, 0.045, 0.2);
    b.box(0.044, 0.1, 0.014, POLY, 0, 0.015, 0.285);
    b.box(0.016, 0.01, 0.02, STEEL, -0.026, 0.045, -0.05);
  } else if (id === 'shotgun') {
    b.prof([[-0.08, 0], [0.14, 0], [0.14, 0.065], [-0.08, 0.065]], 0.042, METAL);
    b.box(0.03, 0.006, 0.07, POLY, 0.02, 0.03, -0.03);
    b.cyl(0.012, 0.012, 0.5, METAL, 0, 0.05, -0.39);
    b.cyl(0.011, 0.011, 0.42, METAL2, 0, 0.022, -0.35);
    b.cyl(0.023, 0.023, 0.16, WOOD, 0, 0.02, -0.32);
    for (let i = 0; i < 5; i++) b.cyl(0.0245, 0.0245, 0.008, WOOD2, 0, 0.02, -0.26 - i * 0.03);
    b.box(0.03, 0.02, 0.012, METAL, 0, 0.036, -0.56);
    b.sphere(0.005, STEEL, 0, 0.066, -0.63);
    b.prof([[-0.08, 0.06], [-0.32, 0.03], [-0.32, -0.085], [-0.29, -0.09], [-0.15, -0.03], [-0.13, -0.07], [-0.09, -0.06], [-0.08, 0.0]], 0.04, WOOD, 0, 0.005);
    b.box(0.042, 0.12, 0.012, POLY, 0, -0.028, 0.322);
    b.box(0.006, 0.006, 0.06, METAL, 0, -0.034, 0.0); b.box(0.006, 0.03, 0.006, METAL, 0, -0.018, -0.03);
  } else if (id === 'sniper') {
    b.prof([[-0.36, 0.05], [-0.36, -0.07], [-0.32, -0.075], [-0.15, -0.025], [-0.1, -0.02], [0.3, 0.0], [0.3, 0.034], [-0.1, 0.044], [-0.2, 0.06]], 0.046, OLIVE, 0, 0.006);
    b.box(0.032, 0.022, 0.12, POLY, 0, 0.066, 0.27);
    b.box(0.046, 0.125, 0.014, POLY, 0, -0.01, 0.365);
    b.prof([[-0.125, -0.015], [-0.085, -0.015], [-0.1, -0.115], [-0.145, -0.105]], 0.034, OLIVE, 0, 0.005);
    b.cyl(0.019, 0.019, 0.26, METAL, 0, 0.05, -0.05);
    b.cyl(0.0105, 0.009, 0.46, METAL, 0, 0.05, -0.41);
    b.box(0.03, 0.028, 0.055, POLY, 0, 0.05, -0.665);
    b.cyl(0.017, 0.017, 0.26, POLY, 0, 0.114, -0.04);
    b.cyl(0.027, 0.02, 0.08, POLY, 0, 0.114, -0.19);
    b.cyl(0.021, 0.024, 0.05, POLY, 0, 0.114, 0.1);
    b.cyl(0.022, 0.022, 0.004, LENS, 0, 0.114, 0.126); b.cyl(0.024, 0.024, 0.004, LENS, 0, 0.114, -0.231);
    b.add(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), METAL2, 0, 0.138, -0.04);
    b.add(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), METAL2, 0.024, 0.114, -0.04, 0, 0, Math.PI / 2);
    b.box(0.016, 0.034, 0.018, METAL, 0, 0.084, 0.03); b.box(0.016, 0.034, 0.018, METAL, 0, 0.084, -0.11);
    b.box(0.045, 0.009, 0.009, STEEL, 0.035, 0.05, 0.04); b.sphere(0.011, POLY, 0.06, 0.046, 0.04);
    b.box(0.028, 0.05, 0.07, METAL2, 0, -0.034, -0.03);
    b.box(0.006, 0.006, 0.06, METAL, 0, -0.045, 0.05);
    b.cyl(0.004, 0.004, 0.2, METAL, 0.014, -0.006, -0.2); b.cyl(0.004, 0.004, 0.2, METAL, -0.014, -0.006, -0.2);
  } else if (id === 'pistol') {
    b.prof([[-0.085, 0.0], [0.1, 0.0], [0.1, 0.032], [0.09, 0.04], [-0.085, 0.04]], 0.028, METAL2);
    for (let i = 0; i < 5; i++) b.box(0.03, 0.026, 0.004, METAL, 0, 0.02, 0.04 + i * 0.008);
    b.box(0.031, 0.016, 0.03, METAL, 0, 0.024, -0.02);
    b.prof([[-0.08, -0.024], [0.1, -0.024], [0.1, 0.0], [-0.08, 0.0]], 0.026, POLY);
    b.prof([[-0.085, -0.02], [-0.035, -0.02], [-0.055, -0.125], [-0.11, -0.115]], 0.03, POLY, 0, 0.005);
    b.box(0.006, 0.006, 0.05, POLY, 0, -0.052, -0.005); b.box(0.006, 0.032, 0.006, POLY, 0, -0.038, -0.03);
    b.box(0.004, 0.02, 0.006, STEEL, 0, -0.032, 0.0, 0.3);
    b.box(0.004, 0.007, 0.006, STEEL, 0, 0.043, -0.09); b.box(0.016, 0.007, 0.006, POLY, 0, 0.043, 0.075);
    b.cyl(0.006, 0.006, 0.012, POLY, 0, 0.022, -0.103);
  } else if (id === 'knife') {
    b.prof([[0.0, -0.018], [0.13, -0.018], [0.19, 0.006], [0.13, 0.018], [0.0, 0.018]], 0.005, STEEL, 0, 0.0015);
    b.box(0.014, 0.062, 0.012, METAL, 0, 0, 0);
    b.prof([[-0.11, -0.014], [0, -0.016], [0, 0.016], [-0.11, 0.014]], 0.024, POLY, 0, 0.006);
    for (let i = 0; i < 4; i++) b.box(0.026, 0.034, 0.005, METAL2, 0, 0, 0.02 + i * 0.022);
  }
  return b.geometry();
}
const gunGeos = {};
export const gunGeo = (id) => gunGeos[id] || (gunGeos[id] = buildGun(id));

// 第一人称武器（武器 + 双臂）
export function viewModel(id, sleeveColor) {
  const g = new THREE.Group(), info = GUN[id];
  g.add(new THREE.Mesh(gunGeo(id), gunMat));
  const b = new Builder(), GLOVE = 0x1c1c1e, V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const hand = (p, sx) => b.add(new THREE.SphereGeometry(0.042, 10, 8), GLOVE, p.x, p.y, p.z, 0, 0, 0, sx, 1.05, 1.15);
  const grip = V(info.grip);
  const rh = grip.clone().add(new THREE.Vector3(0.012, -0.012, 0.012));
  b.limb(new THREE.Vector3(0.11, -0.2, 0.42), rh, 0.043, sleeveColor); hand(rh, 0.85);
  b.limb(new THREE.Vector3(0.105, -0.185, 0.385), rh.clone().lerp(new THREE.Vector3(0.11, -0.2, 0.42), 0.25), 0.046, GLOVE);
  if (info.fore) {
    const lh = V(info.fore).add(new THREE.Vector3(info.long ? -0.012 : 0, info.long ? -0.03 : 0, 0));
    const el = info.long ? new THREE.Vector3(-0.24, -0.26, lh.z + 0.36) : new THREE.Vector3(-0.2, -0.24, 0.4);
    b.limb(el, lh, 0.043, sleeveColor); hand(lh, info.long ? 1.1 : 0.85);
  }
  g.add(new THREE.Mesh(b.geometry(), bodyMat));
  return g;
}

// ======================= 角色 =======================
const PAL = {
  blue: { uni: 0x2c436f, pants: 0x25334f, vest: 0x1a2231, gear: 0x0f1319, helm: 0x1e2c45, boot: 0x141518, glove: 0x18191b, skin: 0xc9976f, accent: 0x5fa8ff },
  red:  { uni: 0x8f4a36, pants: 0x6a5a3d, vest: 0x40301f, gear: 0x231a12, helm: 0x7a2a20, boot: 0x2a1e14, glove: 0x2a2018, skin: 0xb98660, accent: 0xff6a55 },
};
const UA = 0.30, FA = 0.33, TH = 0.45, HIP_Y = 0.96;
const geoCache = {};
function soldierGeos(team) {
  if (geoCache[team]) return geoCache[team];
  const c = PAL[team], G = {};
  let b = new Builder();                                   // 骨盆
  b.capsule(0.115, 0.14, c.pants, 0, -0.01, 0, 0, 0, Math.PI / 2, 1, 1, 0.85);
  b.box(0.37, 0.05, 0.25, c.gear, 0, 0.075, 0);
  b.box(0.05, 0.035, 0.02, 0x8a8f96, 0, 0.075, -0.127);
  b.box(0.06, 0.15, 0.1, c.gear, 0.2, -0.04, 0.0);
  b.box(0.07, 0.09, 0.05, c.gear, -0.19, 0.03, 0.03);
  G.pelvis = b.geometry();
  b = new Builder();                                       // 躯干
  b.capsule(0.15, 0.2, c.uni, 0, 0.19, 0, 0, 0, 0, 1.12, 1, 0.74);
  b.capsule(0.165, 0.1, c.vest, 0, 0.2, 0, 0, 0, 0, 1.1, 1, 0.8);
  for (const x of [-0.105, 0, 0.105]) { b.box(0.085, 0.11, 0.05, c.gear, x, 0.1, -0.145); b.box(0.087, 0.03, 0.054, c.vest, x, 0.15, -0.145); }
  b.box(0.2, 0.06, 0.03, c.gear, 0, 0.27, -0.135);
  b.box(0.22, 0.24, 0.08, c.gear, 0, 0.23, 0.15); b.box(0.16, 0.1, 0.05, c.vest, 0, 0.18, 0.2);
  b.box(0.055, 0.04, 0.24, c.vest, 0.105, 0.385, 0); b.box(0.055, 0.04, 0.24, c.vest, -0.105, 0.385, 0);
  b.add(new THREE.CylinderGeometry(0.052, 0.058, 0.09, 10), c.skin, 0, 0.43, 0.005);
  b.add(new THREE.CylinderGeometry(0.066, 0.075, 0.035, 10), c.uni, 0, 0.405, 0.005);
  b.box(0.03, 0.09, 0.03, c.gear, -0.13, 0.33, -0.12); b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 5), c.gear, -0.13, 0.42, -0.12);
  G.chest = b.geometry();
  b = new Builder();                                       // 头部（原点为颈根）
  b.sphere(0.1, c.skin, 0, 0.13, 0, 0, 0, 0, 0.9, 1.1, 1);
  b.box(0.022, 0.03, 0.024, c.skin, 0, 0.115, -0.1);
  if (team === 'blue') {
    b.sphere(0.118, c.helm, 0, 0.165, 0.006, 0, 0, 0, 1, 0.82, 1.06);
    b.box(0.2, 0.012, 0.06, c.helm, 0, 0.165, -0.1);
    b.box(0.03, 0.075, 0.08, c.gear, 0.103, 0.12, 0.01); b.box(0.03, 0.075, 0.08, c.gear, -0.103, 0.12, 0.01);
    b.box(0.175, 0.05, 0.03, c.gear, 0, 0.142, -0.088); b.box(0.15, 0.034, 0.012, 0x3b5d78, 0, 0.142, -0.104);
    b.box(0.012, 0.02, 0.2, c.gear, 0.1, 0.15, 0.0); b.box(0.012, 0.02, 0.2, c.gear, -0.1, 0.15, 0.0);
    b.box(0.006, 0.01, 0.05, c.gear, -0.1, 0.075, -0.06, 0.5);
  } else {
    b.sphere(0.108, c.helm, 0, 0.15, 0.008, 0, 0, 0, 0.98, 0.9, 1.04);
    b.box(0.2, 0.035, 0.2, c.helm, 0, 0.165, 0.004);
    b.box(0.07, 0.03, 0.06, c.helm, 0.05, 0.14, 0.11, 0.5, 0, 0.3); b.box(0.04, 0.09, 0.02, c.helm, 0.03, 0.08, 0.115, 0.2);
    b.sphere(0.094, c.gear, 0, 0.085, -0.012, 0, 0, 0, 0.95, 0.62, 1);
    b.box(0.15, 0.012, 0.02, c.gear, 0, 0.142, -0.093);
  }
  G.head = b.geometry();
  for (const side of [1, -1]) {                            // 手臂
    b = new Builder();
    b.sphere(0.072, c.uni, 0, 0, 0); b.capsule(0.05, 0.2, c.uni, 0, -0.15, 0);
    if (side === -1) b.add(new THREE.CylinderGeometry(0.056, 0.056, 0.04, 10), c.accent, 0, -0.12, 0);
    b.box(0.03, 0.07, 0.07, c.vest, side * 0.05, -0.02, 0);
    G['ua' + side] = b.geometry();
    b = new Builder();
    b.sphere(0.054, c.gear, 0, 0, 0.004); b.capsule(0.044, 0.19, c.uni, 0, -0.14, 0);
    b.add(new THREE.CylinderGeometry(0.047, 0.044, 0.05, 10), c.glove, 0, -0.265, 0);
    b.sphere(0.047, c.glove, 0, -0.325, 0, 0, 0, 0, 0.85, 1.15, 1.05);
    G['fa' + side] = b.geometry();
    b = new Builder();                                     // 大腿
    b.capsule(0.09, 0.27, c.pants, 0, -0.22, 0, 0, 0, 0, 1, 1, 1.08);
    b.box(0.05, 0.13, 0.11, c.gear, side * 0.085, -0.2, 0);
    G['th' + side] = b.geometry();
    b = new Builder();                                     // 小腿 + 靴
    b.sphere(0.07, c.gear, 0, 0, -0.018, 0, 0, 0, 1, 1.1, 0.9);
    b.capsule(0.068, 0.24, c.pants, 0, -0.2, 0.008);
    b.capsule(0.07, 0.08, c.boot, 0, -0.37, 0.008);
    b.capsule(0.056, 0.13, c.boot, 0, -0.44, -0.05, Math.PI / 2, 0, 0, 1, 1, 0.8);
    b.box(0.11, 0.03, 0.27, 0x0c0c0d, 0, -0.478, -0.045);
    G['sh' + side] = b.geometry();
  }
  return (geoCache[team] = G);
}

const POSE = {
  long:   { aimP: new THREE.Vector3(0.085, 0.385, -0.02), aimQ: new THREE.Quaternion(), lowP: new THREE.Vector3(0.1, 0.22, -0.06), lowQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0.45, 0.12, 'YXZ')), twA: -0.6, twL: -0.3,
            runP: new THREE.Vector3(0.04, 0.27, -0.13), runQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.95, 0.25, 'YXZ')) },
  pistol: { aimP: new THREE.Vector3(0.0, 0.43, -0.5), aimQ: new THREE.Quaternion(), lowP: new THREE.Vector3(0.02, 0.13, -0.3), lowQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.85, 0.1, 0, 'YXZ')), twA: 0, twL: 0,
            runP: new THREE.Vector3(0.1, 0.2, -0.27), runQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.35, 0, 'YXZ')) },
};
const SH = [new THREE.Vector3(0.2, 0.38, 0), new THREE.Vector3(-0.2, 0.38, 0)];
const POLE = [new THREE.Vector3(0.55, -1, 0.25), new THREE.Vector3(-0.7, -0.9, 0.1)];
const _d = new THREE.Vector3(), _pp = new THREE.Vector3(), _el = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _qi = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function solveArm(sh, el, S, T, pole) {
  _d.subVectors(T, S); const L = _d.length() || 1e-4, Lc = clamp(L, 0.1, UA + FA - 0.004); _d.multiplyScalar(1 / L);
  const cosA = clamp((UA * UA + Lc * Lc - FA * FA) / (2 * UA * Lc), -1, 1), h = UA * Math.sqrt(1 - cosA * cosA);
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _el.copy(S).addScaledVector(_d, UA * cosA).addScaledVector(_pp, h);
  _t.copy(S).addScaledVector(_d, Lc);
  sh.quaternion.setFromUnitVectors(DOWN, _u.subVectors(_el, S).normalize());
  _u.subVectors(_t, _el).normalize().applyQuaternion(_qi.copy(sh.quaternion).invert());
  el.quaternion.setFromUnitVectors(DOWN, _u);
}

export class Soldier {
  constructor(team, scene) {
    const G = soldierGeos(team), mk = (geo, parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group(); g.position.set(x, y, z); if (geo) g.add(new THREE.Mesh(geo, bodyMat)); parent.add(g); return g;
    };
    this.scene = scene;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.hips = mk(G.pelvis, this.root, 0, HIP_Y, 0); this.hips.rotation.order = 'YXZ';
    this.upper = mk(null, this.hips, 0, 0.08, 0);
    this.chest = mk(G.chest, this.upper);
    this.head = mk(G.head, this.chest, 0, 0.46, 0); this.head.rotation.order = 'YXZ';
    this.sh = [mk(G.ua1, this.chest, 0.2, 0.38, 0), mk(G['ua-1'], this.chest, -0.2, 0.38, 0)];
    this.el = [mk(G.fa1, this.sh[0], 0, -UA, 0), mk(G['fa-1'], this.sh[1], 0, -UA, 0)];
    this.th = [mk(G.th1, this.hips, 0.095, -0.02, 0), mk(G['th-1'], this.hips, -0.095, -0.02, 0)];
    this.kn = [mk(G.sh1, this.th[0], 0, -TH, 0), mk(G['sh-1'], this.th[1], 0, -TH, 0)];
    this.anchor = mk(null, this.upper);
    this.holder = new THREE.Group(); this.anchor.add(this.holder);
    this.guns = {};
    for (const id of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) {
      const m = new THREE.Mesh(gunGeo(id), gunMat); m.visible = false; this.holder.add(m); this.guns[id] = m;
    }
    this.gunId = 'pistol'; this.aim = 0; this.cr = 0; this.ab = 0; this.rn = 0; this.fw = 1; this.rt = 0; this.land = 0; this.wasAir = false; this.vyPrev = 0; this.phase = Math.random() * 6; this.sf = 0; this.death = null; this.drop = null;
    scene.add(this.root);
  }
  dispose() { this.scene.remove(this.root); this.scene.remove(this.holder); }
  setGun(id) { this.gunId = id; for (const k in this.guns) this.guns[k].visible = k === id; }
  reset() {
    this.death = null; this.drop = null; this.aim = 0; this.cr = 0; this.ab = 0; this.rn = 0; this.land = 0; this.wasAir = false; this.upper.rotation.set(0, 0, 0); this.holder.visible = true;
    this.anchor.add(this.holder); this.holder.position.set(0, 0, 0); this.holder.quaternion.identity(); this.holder.scale.setScalar(1);
    this.hips.position.set(0, HIP_Y, 0); this.hips.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0); this.upper.rotation.set(0, 0, 0);
  }
  muzzle(out) {
    const g = GUN[this.gunId]; this.holder.updateWorldMatrix(true, false);
    return out.set(0, g.mv, g.mz).applyMatrix4(this.holder.matrixWorld);
  }
  // 存活状态：持枪 IK + 行走
  // 存活状态动画：站立 / 奔跑 / 静步 / 蹲姿与蹲行 / 起跳、下落、落地，再叠加持枪 IK
  update(dt, x, y, z, yaw, vx, vz, vy, aiming, pitch, crouch, air, sneak) {
    this.root.position.set(x, y, z); this.root.rotation.set(0, yaw, 0);
    const g = GUN[this.gunId], P = g.long ? POSE.long : POSE.pistol, ex = (r) => 1 - Math.exp(-r * dt);
    const speed = Math.hypot(vx, vz);
    // 相对朝向的移动方向：fw 前后、rt 左右（用于侧移和后退的步伐）
    let fw = 1, rt = 0;
    if (speed > 0.3) { fw = (-Math.sin(yaw) * vx - Math.cos(yaw) * vz) / speed; rt = (Math.cos(yaw) * vx - Math.sin(yaw) * vz) / speed; }
    this.fw += (fw - this.fw) * ex(10); this.rt += (rt - this.rt) * ex(10); fw = this.fw; rt = this.rt;
    const shoulder = aiming || (sneak && speed > 0.3);            // 静步时端枪警戒
    this.aim += ((shoulder ? 1 : 0) - this.aim) * ex(shoulder ? 14 : 5);
    const a = this.aim;
    const c = (this.cr += ((crouch ? 1 : 0) - this.cr) * ex(11));
    const ab = (this.ab += ((air ? 1 : 0) - this.ab) * ex(air ? 18 : 12));
    if (this.wasAir && !air) this.land = Math.min(1, 0.35 + Math.max(0, -this.vyPrev) / 8);   // 落地缓冲
    this.wasAir = air; this.vyPrev = vy; this.land = Math.max(0, this.land - dt * 3.2);
    const mv = (this.sf += (Math.min(1, speed / 1.6) - this.sf) * ex(10));                       // 是否在移动
    const rn = (this.rn += ((speed > 3.4 && !crouch ? 1 : 0) - this.rn) * ex(8));                // 奔跑权重
    const gnd = 1 - ab, stn = (1 - c) * gnd, ck = c * (1 - mv) * gnd, cw = c * mv * gnd, jb = ab, ld = this.land * gnd;
    this.phase += speed * dt * (lerp(3.9, 2.45, rn) + 1.6 * c);
    const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph), dirS = fw < -0.3 ? -1 : 1;
    // ---- 腿 ----
    const A = (0.36 + 0.5 * rn) * mv * (1 - 0.45 * c) * gnd, K = (0.75 + 0.8 * rn) * mv * gnd * (1 - 0.5 * c);
    const up = clamp(vy / 5, -1, 1) * 0.5 + 0.5;                                                  // 上升 1 → 下落 0
    const jT0 = lerp(0.3, 0.95, up), jK0 = lerp(-0.45, -1.45, up), jT1 = lerp(-0.12, 0.25, up), jK1 = lerp(-0.3, -0.95, up);
    const idle = (1 - mv) * stn;
    this.th[0].rotation.x = sn * A * fw + (0.26 * a + 0.04) * idle + 0.1 * rn * stn + ck * 1.35 + cw * 1.2 + jb * jT0 + ld * 0.4;
    this.th[1].rotation.x = -sn * A * fw - (0.2 * a + 0.02) * idle + 0.1 * rn * stn + ck * 0.25 + cw * 1.2 + jb * jT1 + ld * 0.4;
    this.th[0].rotation.z = 0.035 + 0.08 * c + sn * A * 0.5 * rt; this.th[1].rotation.z = -0.035 - 0.12 * c - sn * A * 0.5 * rt;
    this.kn[0].rotation.x = -(Math.max(0, cs * dirS) * K + (0.3 * a + 0.06) * idle + 0.12 * mv * stn + (sneak ? 0.16 * stn : 0)) - ck * 2.2 - cw * 2.1 + jb * jK0 - ld * 0.8;
    this.kn[1].rotation.x = -(Math.max(0, -cs * dirS) * K + (0.2 * a + 0.06) * idle + 0.12 * mv * stn + (sneak ? 0.16 * stn : 0)) - ck * 1.9 - cw * 2.1 + jb * jK1 - ld * 0.8;
    const bob = Math.abs(cs) * (0.025 + 0.045 * rn) * mv;
    this.hips.position.set(0, HIP_Y - (0.035 * a * (1 - mv) + 0.012 + 0.03 * mv + 0.02 * rn + (sneak ? 0.05 * mv : 0)) * stn + bob * (1 - c) * gnd - 0.5 * ck - 0.47 * cw - 0.15 * ld + 0.05 * jb * up, 0);
    this.hips.rotation.set(0, sn * (0.07 + 0.1 * rn) * mv * (1 - c) * gnd, sn * 0.03 * rn * gnd);
    // ---- 上身 ----
    const tw = lerp(P.twL, P.twA, a), lean = (0.06 * mv + 0.2 * rn) * fw * stn;
    this.upper.rotation.x = clamp(pitch, -0.7, 0.7) * a - lean * (1 - 0.55 * a) - 0.03 - (0.14 * (1 - a) + 0.04) * c - 0.12 * ld + 0.1 * jb * (up - 0.4);
    this.upper.rotation.z = -rt * 0.07 * rn * stn;
    this.chest.rotation.y = tw - sn * (0.05 + 0.1 * rn) * mv * gnd * (1 - 0.5 * a);
    this.head.rotation.set(0.06 * a + 0.1 * c * (1 - a) + lean * 0.6 * (1 - a), -tw * 0.9, g.long ? -0.2 * a : 0);
    // ---- 武器位置：低姿持枪 → 奔跑持枪（斜持于胸前）→ 抵肩瞄准 ----
    const an = this.anchor, rr = rn * (1 - a) * (1 - c);
    an.position.lerpVectors(P.lowP, P.runP, rr); an.quaternion.slerpQuaternions(P.lowQ, P.runQ, rr);
    an.position.lerp(P.aimP, a); an.quaternion.slerp(P.aimQ, a);
    if (g.long) an.position.z -= g.butt * lerp(lerp(0.8, 0.45, rr), 1, a);
    const sw2 = mv * gnd * (1 - 0.75 * a);
    an.position.y += Math.sin(ph * 2) * (0.008 + 0.022 * rn) * sw2 - 0.05 * ld * (1 - a); an.position.x += cs * (0.006 + 0.03 * rn) * sw2;
    an.position.z += sn * 0.03 * rn * sw2;
    // 手臂 IK（在胸腔坐标系中求解）
    const ct = Math.cos(-this.chest.rotation.y), st = Math.sin(-this.chest.rotation.y);
    for (let i = 0; i < 2; i++) {
      const src = i === 0 ? g.grip : g.fore;
      _t.set(src[0], src[1], src[2]).applyQuaternion(an.quaternion).add(an.position);
      const tx = _t.x * ct + _t.z * st, tz = -_t.x * st + _t.z * ct;
      _t.x = tx; _t.z = tz;
      if (i === 1 && g.long) _t.y -= 0.02;
      solveArm(this.sh[i], this.el[i], SH[i], _p.copy(_t), POLE[i]);
    }
  }
  // 开始倒地：dir=+1 向后仰倒 / -1 向前扑倒；space 为该方向可用空间
  startDeath(dir, space, groundY) {
    const full = space >= 1.65, sit = !full;
    const phi = full ? Math.PI / 2 : clamp(0.35 + (space - 0.5) * 0.6, 0.3, 0.75);
    const m = Math.random() < 0.5 ? 1 : -1, back = dir > 0 || sit;
    const eul = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'ZYX'));
    this.death = {
      dir: back ? 1 : -1, phi, slide: full ? 0.82 : clamp(space - 0.75, 0, 0.3), roll: sit ? rand(-0.12, 0.12) : rand(-0.1, 0.1), yaw: rand(-0.25, 0.25),
      hipY0: this.hips.position.y, up0: this.upper.rotation.x, ch0: this.chest.rotation.y,
      head0: this.head.rotation.clone(), headTo: sit ? [0.5, m * 0.3, m * 0.2] : back ? [-0.1, m * rand(0.5, 0.9), 0] : [0, m * 1.15, 0],
      upTo: sit ? 0.25 : rand(-0.04, 0.06), chTo: rand(-0.2, 0.2),
      sh0: this.sh.map((s) => s.quaternion.clone()), el0: this.el.map((s) => s.quaternion.clone()),
      shTo: sit ? [eul(0.15, 0, 0.25), eul(0.1, 0, -0.3)]
        : back ? [eul(-0.28, 0, rand(0.9, 1.6)), eul(-0.28, 0, -rand(0.5, 1.3))]
        : [eul(0.3, 0, rand(2.0, 2.6)), eul(0.3, 0, -rand(1.9, 2.5))],
      elTo: sit ? [eul(0.5, 0, 0), eul(0.7, 0, 0)] : back ? [eul(0, 0, rand(-0.9, 0.3)), eul(0, 0, rand(-0.3, 0.9))] : [eul(0, 0, 0.9), eul(0, 0, -0.9)],
      th0: this.th.map((s) => s.rotation.x), kn0: this.kn.map((s) => s.rotation.x),
      thTo: back ? (m > 0 ? [0.5, 0.05] : [0.05, 0.5]).map((v) => v * (sit ? 0.3 : 1) + (Math.PI / 2 - phi)) : [0, -0.04],
      knTo: back ? (m > 0 ? [-0.95, -0.1] : [-0.1, -0.95]).map((v) => v * (sit ? 0.5 : 1)) : (m > 0 ? [-0.12, -0.55] : [-0.55, -0.12]),
      thZ: back ? rand(0.08, 0.22) : 0.1,
    };
    // 武器脱手
    this.holder.updateWorldMatrix(true, false);
    this.scene.attach(this.holder);
    const yaw = this.root.rotation.y;
    this.drop = { vy: 1.2, vx: -Math.sin(yaw) * rand(0.6, 1.4) + rand(-0.5, 0.5), vz: -Math.cos(yaw) * rand(0.6, 1.4) + rand(-0.5, 0.5), g: groundY + 0.024, done: false,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 6.28, (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2, 'YXZ')) };
  }
  // t: 0..1
  updateDeath(t, dt, y) {
    const D = this.death; if (!D) return;
    this.root.position.y = y;
    const f = Math.pow(t, 2.1), bounce = t > 0.86 ? Math.sin((t - 0.86) / 0.14 * Math.PI) * 0.035 : 0, ff = f - bounce;
    const fa = Math.min(1, t * 2.2), fs = fa * fa * (3 - 2 * fa), buckle = Math.sin(Math.PI * Math.min(1, t * 1.2)) * (1 - f);
    const phi = D.dir * D.phi * ff;
    this.hips.rotation.set(phi, D.yaw * f, D.roll * f);
    this.hips.position.set(0, 0.135 + (D.hipY0 - 0.135) * Math.max(0, Math.cos(Math.abs(phi) * (Math.PI / 2 / D.phi))) * (1 - 0.42 * buckle) , D.dir * D.slide * f);
    this.upper.rotation.x = lerp(D.up0, D.upTo, f); this.chest.rotation.y = lerp(D.ch0, D.chTo, fs);
    this.head.rotation.set(lerp(D.head0.x, D.headTo[0], f), lerp(D.head0.y, D.headTo[1], f), lerp(D.head0.z, D.headTo[2], f));
    for (let i = 0; i < 2; i++) {
      this.sh[i].quaternion.slerpQuaternions(D.sh0[i], D.shTo[i], fs); this.el[i].quaternion.slerpQuaternions(D.el0[i], D.elTo[i], fs);
      this.th[i].rotation.x = lerp(D.th0[i], D.thTo[i], f) + buckle * (D.dir > 0 ? 0.55 : 0.3);
      this.th[i].rotation.z = (i ? -1 : 1) * lerp(0.035, D.thZ, f);
      this.kn[i].rotation.x = lerp(D.kn0[i], D.knTo[i], f) - buckle * 1.0;
    }
    const d = this.drop;
    if (d && !d.done) {
      const h = this.holder; d.vy -= 16 * dt;
      h.position.x += d.vx * dt; h.position.z += d.vz * dt; h.position.y += d.vy * dt;
      h.quaternion.slerp(d.q, 1 - Math.exp(-9 * dt));
      if (h.position.y <= d.g) { h.position.y = d.g; h.quaternion.copy(d.q); d.done = true; }
    }
  }
}
