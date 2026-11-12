import * as THREE from '../vendor/three.module.min.js';
import { ROWS, CELL, GW, GH, WALL_H, cellH, walkable, spawns, collides, groundH, raycastWorld, findPath } from './map.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; return d - Math.PI; };
const NOLOCK = new URLSearchParams(location.search).has('nolock');

// ======================= 配置 =======================
const W = {
  smg:     { id: 'smg',     name: '蜂鸟 冲锋枪',   slot: 0, dmg: 21,  rate: 0.075, auto: true,  mag: 30, res: 120, reload: 2.1, spread: 0.013, heat: 0.0035, kick: 0.016, move: 0.012, speed: 0.98, price: 1500 },
  shotgun: { id: 'shotgun', name: '铁砧 霰弹枪',   slot: 0, dmg: 13,  rate: 0.85,  auto: false, mag: 7,  res: 28,  reload: 2.6, spread: 0.055, heat: 0,      kick: 0.09,  move: 0.01,  speed: 0.95, price: 1700, pellets: 8 },
  rifle:   { id: 'rifle',   name: '雷鸣 突击步枪', slot: 0, dmg: 32,  rate: 0.1,   auto: true,  mag: 30, res: 90,  reload: 2.4, spread: 0.005, heat: 0.0045, kick: 0.028, move: 0.03,  speed: 0.93, price: 2700 },
  sniper:  { id: 'sniper',  name: '鹰眼 狙击步枪', slot: 0, dmg: 105, rate: 1.3,   auto: false, mag: 5,  res: 20,  reload: 3.0, spread: 0.0006, heat: 0,     kick: 0.07,  move: 0.08,  speed: 0.85, price: 4500, scope: true, unscoped: 0.07 },
  pistol:  { id: 'pistol',  name: 'P9 手枪',       slot: 1, dmg: 27,  rate: 0.14,  auto: false, mag: 12, res: 60,  reload: 1.7, spread: 0.008, heat: 0.006,  kick: 0.03,  move: 0.012, speed: 1 },
  knife:   { id: 'knife',   name: '战术匕首',      slot: 2, dmg: 45,  rate: 0.45,  melee: true, range: 2.4, speed: 1.05 },
};
const BUY = [
  { key: '1', w: 'smg' }, { key: '2', w: 'shotgun' }, { key: '3', w: 'rifle' }, { key: '4', w: 'sniper' },
  { key: '5', name: '防弹衣', price: 650, armor: true }, { key: '6', name: '补充弹药', price: 200, ammo: true },
];
const SND = {
  pistol: { f: 2400, d: 0.14, v: 0.45 }, smg: { f: 3000, d: 0.1, v: 0.4 }, rifle: { f: 1700, d: 0.18, v: 0.6 },
  shotgun: { f: 1000, d: 0.32, v: 0.8 }, sniper: { f: 800, d: 0.55, v: 0.9 },
};
const DIFF = {
  easy:   { react: 0.8,  err: 0.075, turn: 4 },
  normal: { react: 0.45, err: 0.045, turn: 7 },
  hard:   { react: 0.24, err: 0.026, turn: 11 },
};
const TEAM_CN = { blue: '蓝队', red: '红队' };
const TEAM_CSS = { blue: 'b', red: 'r' };
const NAMES = ['猎鹰', '山猫', '铁壁', '夜枭', '赤狐', '孤狼', '雪豹', '飞隼', '黑熊', '灰鲨'];
const TEAM_SIZE = 5, WIN_ROUNDS = 8, ROUND_TIME = 120, FREEZE_TIME = 5, BUY_WINDOW = 20;
const GRAV = 20, JUMP_V = 6.8, RUN = 5.4, R_BODY = 0.35;

// ======================= 渲染基础 =======================
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e6);
scene.fog = new THREE.Fog(0x9fc3e6, 40, 150);
const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 300);
camera.rotation.order = 'YXZ';

const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 1.6));
const vmSun = new THREE.DirectionalLight(0xfff2d8, 1.5); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);

scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x8a7655, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
sun.position.set(GW * CELL / 2 + 30, 60, GH * CELL / 2 + 22);
sun.target.position.set(GW * CELL / 2, 0, GH * CELL / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -58, right: 58, top: 58, bottom: -58, near: 1, far: 160 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = vmCam.aspect = w / h;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ======================= 程序化贴图 =======================
function makeTex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, s, n, a) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
const brickTex = (base, mortar) => makeTex(256, (g, s) => {
  g.fillStyle = mortar; g.fillRect(0, 0, s, s);
  const bh = 32, bw = 64;
  for (let r = 0; r < s / bh; r++)
    for (let c = -1; c < s / bw + 1; c++) {
      const l = 0.85 + Math.random() * 0.3;
      g.fillStyle = `rgb(${base.map((v) => Math.min(255, v * l) | 0).join(',')})`;
      g.fillRect(c * bw + (r % 2 ? bw / 2 : 0) + 2, r * bh + 2, bw - 4, bh - 4);
    }
  speckle(g, s, 2500, 0.1);
});
const texWall = brickTex([196, 168, 124], '#8f7b5c');
const texWallOuter = brickTex([150, 138, 122], '#6f665a');
const texFloor = makeTex(256, (g, s) => {
  g.fillStyle = '#b29b74'; g.fillRect(0, 0, s, s);
  speckle(g, s, 9000, 0.09);
  g.strokeStyle = 'rgba(60,45,25,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
});
const texCrate = makeTex(128, (g, s) => {
  g.fillStyle = '#8a6336'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`; g.fillRect(0, i * s / 6, s, 2); }
  speckle(g, s, 1200, 0.1);
  g.strokeStyle = '#5a3d1c'; g.lineWidth = 12; g.strokeRect(6, 6, s - 12, s - 12);
  g.lineWidth = 9; g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.stroke();
});
const texCrate2 = makeTex(128, (g, s) => {
  g.fillStyle = '#4f6a58'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(i * s / 8, 0, 3, s); }
  speckle(g, s, 1500, 0.1);
  g.strokeStyle = '#33473a'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
});
const texDecal = makeTex(32, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(10,10,10,1)'); gr.addColorStop(0.4, 'rgba(30,25,20,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}, false);
const texFlash = makeTex(64, (g, s) => {
  g.translate(s / 2, s / 2);
  const gr = g.createRadialGradient(0, 0, 1, 0, 0, s / 2);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, 'rgba(255,220,120,.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr;
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, -5); g.lineTo(s / 2, 0); g.lineTo(0, 5); g.fill(); }
  g.beginPath(); g.arc(0, 0, s / 4, 0, 7); g.fill();
}, false);

// ======================= 场景构建 =======================
function boxGeo(w, h, d, s) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / s, uv.getY(k) * dims[f][1] / s);
    }
  return g;
}
(function buildWorld() {
  const mWall = new THREE.MeshLambertMaterial({ map: texWall });
  const mOuter = new THREE.MeshLambertMaterial({ map: texWallOuter });
  const mCrate = new THREE.MeshLambertMaterial({ map: texCrate });
  const mCrate2 = new THREE.MeshLambertMaterial({ map: texCrate2 });
  texFloor.repeat.set(GW * CELL / 4, GH * CELL / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GW * CELL, GH * CELL), new THREE.MeshLambertMaterial({ map: texFloor }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(GW * CELL / 2, 0, GH * CELL / 2); floor.receiveShadow = true;
  scene.add(floor);
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m);
  };
  for (let z = 0; z < GH; z++) {
    let x = 0;
    while (x < GW) {
      const c = ROWS[z][x];
      if (c === '#') {
        let e = x; while (e < GW && ROWS[z][e] === '#') e++;
        const outer = z === 0 || z === GH - 1 || (e - x === 1 && (x === 0 || x === GW - 1));
        const h = outer ? WALL_H + 1.5 : WALL_H;
        add(boxGeo((e - x) * CELL, h, CELL, 2), outer ? mOuter : mWall, (x + e) / 2 * CELL, h / 2, (z + 0.5) * CELL);
        x = e;
      } else {
        if (c === 'x') add(boxGeo(CELL, 1, CELL, CELL), mCrate, (x + 0.5) * CELL, 0.5, (z + 0.5) * CELL);
        if (c === 'X') add(boxGeo(CELL, 2.2, CELL, CELL), mCrate2, (x + 0.5) * CELL, 1.1, (z + 0.5) * CELL);
        x++;
      }
    }
  }
})();

// ======================= 模型 =======================
const matCache = {};
const mat = (c) => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c }));
function part(g, w, h, d, c, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); g.add(m); return m;
}
const METAL = 0x2a2e33, WOOD = 0x6e4a26, STEEL = 0xb8bcc2;
function gunModel(id) {
  const g = new THREE.Group();
  if (id === 'pistol') { part(g, .045, .055, .24, METAL, 0, 0, -.1); part(g, .04, .12, .055, 0x1b1d20, 0, -.075, 0).rotation.x = -.25; g.userData.mz = -.24; }
  if (id === 'smg') { part(g, .055, .08, .38, METAL, 0, 0, -.08); part(g, .035, .17, .045, 0x1b1d20, 0, -.11, -.1); part(g, .035, .1, .045, 0x1b1d20, 0, -.08, .07).rotation.x = -.3; part(g, .03, .04, .2, METAL, 0, .01, .2); part(g, .025, .025, .12, 0x111, 0, .01, -.32); g.userData.mz = -.4; }
  if (id === 'rifle') { part(g, .055, .085, .46, METAL, 0, 0, -.05); part(g, .06, .06, .24, WOOD, 0, -.005, -.36); part(g, .022, .022, .26, 0x111, 0, .012, -.58); part(g, .04, .19, .065, 0x1b1d20, 0, -.12, -.1).rotation.x = .3; part(g, .04, .1, .045, WOOD, 0, -.08, .1).rotation.x = -.3; part(g, .045, .09, .26, WOOD, 0, -.02, .3); part(g, .012, .04, .012, 0x111, 0, .06, -.44); g.userData.mz = -.72; }
  if (id === 'shotgun') { part(g, .04, .04, .7, METAL, 0, .015, -.3); part(g, .035, .035, .5, 0x1b1d20, 0, -.03, -.3); part(g, .06, .06, .2, WOOD, 0, -.03, -.36); part(g, .055, .085, .24, METAL, 0, 0, .08); part(g, .045, .09, .3, WOOD, 0, -.03, .32).rotation.x = -.12; g.userData.mz = -.66; }
  if (id === 'sniper') { part(g, .055, .08, .5, 0x3c4a3a, 0, 0, -.02); part(g, .02, .02, .62, 0x111, 0, .012, -.56); part(g, .04, .04, .26, 0x111, 0, .085, -.04); part(g, .05, .05, .05, 0x111, 0, .085, -.19); part(g, .015, .04, .015, METAL, 0, .05, -.1); part(g, .015, .04, .015, METAL, 0, .05, .04); part(g, .04, .1, .07, 0x1b1d20, 0, -.08, -.06); part(g, .05, .11, .34, 0x3c4a3a, 0, -.025, .36); g.userData.mz = -.88; }
  if (id === 'knife') { part(g, .008, .045, .24, STEEL, 0, 0, -.16); part(g, .03, .04, .12, 0x1b1d20, 0, 0, .02); part(g, .04, .06, .012, METAL, 0, 0, -.04); g.userData.mz = -.3; }
  return g;
}
const TEAM_COL = { blue: { body: 0x2f4f86, vest: 0x1d2c44, leg: 0x26344e, helm: 0x22344f }, red: { body: 0x93452f, vest: 0x4a2a1c, leg: 0x5b4a33, helm: 0x6b3222 } };
function soldierModel(team) {
  const c = TEAM_COL[team], g = new THREE.Group();
  g.rotation.order = 'YXZ';
  part(g, .5, .62, .28, c.body, 0, 1.12, 0);
  part(g, .54, .4, .32, c.vest, 0, 1.18, 0);
  part(g, .22, .22, .22, 0xd9a877, 0, 1.56, 0);
  part(g, .27, .12, .27, c.helm, 0, 1.68, 0);
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group(); p.position.set(s * .13, .82, 0); part(p, .2, .82, .22, c.leg, 0, -.41, 0); g.add(p); return p;
  });
  const arm = (s, rz, rx) => { const p = new THREE.Group(); p.position.set(s * .31, 1.36, 0); part(p, .14, .5, .14, c.body, 0, -.2, 0); p.rotation.set(rx, 0, rz); g.add(p); };
  arm(1, 0, -1.25); arm(-1, .55, -1.35);
  const guns = {};
  for (const id of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) {
    const m = gunModel(id); m.scale.setScalar(1.25); m.position.set(.2, 1.3, -.5); m.visible = false; g.add(m); guns[id] = m;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { legs, guns };
  scene.add(g);
  return g;
}

// 第一人称武器
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
const vmGuns = {};
for (const id of Object.keys(W)) {
  const g = new THREE.Group(), m = gunModel(id);
  g.add(m);
  const sleeve = part(g, .085, .085, .42, 0x2f4f86, .035, -.1, .2); sleeve.rotation.set(.25, -.12, 0);
  part(g, .07, .09, .09, 0x2a2a2a, .01, -.06, .02);
  g.userData = { mz: m.userData.mz, sleeve };
  g.visible = false; vmRoot.add(g); vmGuns[id] = g;
}
const flash = new THREE.Mesh(new THREE.PlaneGeometry(.22, .22), new THREE.MeshBasicMaterial({ map: texFlash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
flash.visible = false; vmRoot.add(flash);

// ======================= 特效池 =======================
const tracers = [];
for (let i = 0; i < 32; i++) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true }));
  l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, life: 0 });
}
let tracerI = 0;
function tracer(ax, ay, az, bx, by, bz) {
  const t = tracers[tracerI++ % tracers.length], p = t.l.geometry.attributes.position;
  p.setXYZ(0, ax, ay, az); p.setXYZ(1, bx, by, bz); p.needsUpdate = true;
  t.life = 0.07; t.l.visible = true;
}
const decals = [];
const decalMat = new THREE.MeshBasicMaterial({ map: texDecal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.16, .16), decalMat); m.visible = false; scene.add(m); decals.push(m); }
let decalI = 0;
const _v = new THREE.Vector3();
function decal(x, y, z, nx, ny, nz) {
  const m = decals[decalI++ % decals.length];
  m.position.set(x + nx * .012, y + ny * .012, z + nz * .012);
  m.lookAt(_v.set(x + nx, y + ny, z + nz)); m.visible = true;
}
const puffs = [];
for (let i = 0; i < 24; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xa01010, transparent: true }));
  m.visible = false; scene.add(m); puffs.push({ m, life: 0 });
}
let puffI = 0;
function puff(x, y, z, color) {
  const p = puffs[puffI++ % puffs.length];
  p.m.position.set(x, y, z); p.m.material.color.set(color); p.life = 0.25; p.m.visible = true;
}
const botFlash = new THREE.PointLight(0xffc060, 0, 12); scene.add(botFlash);

// ======================= 音频 =======================
let actx = null, master = null, noiseBuf = null;
function initAudio() {
  if (actx) { actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function shotSound(id, dist, pan) {
  if (!actx) return;
  const p = SND[id], t = actx.currentTime, vol = p.v / (1 + (dist / 16) ** 2);
  if (vol < 0.004) return;
  const out = actx.createStereoPanner ? actx.createStereoPanner() : actx.createGain();
  if (out.pan) out.pan.value = pan;
  out.connect(master);
  const src = actx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rand(0.8, 1.1);
  const f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(p.f * (dist > 25 ? 0.45 : 1), t); f.frequency.exponentialRampToValueAtTime(180, t + p.d);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + p.d);
  src.connect(f).connect(g).connect(out); src.start(t, Math.random() * 0.4); src.stop(t + p.d + 0.05);
  const o = actx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
  const og = actx.createGain(); og.gain.setValueAtTime(vol * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(og).connect(out); o.start(t); o.stop(t + 0.12);
}
function beep(freq, dur, vol = 0.2, type = 'square', delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const sndClick = () => beep(1400, 0.03, 0.15);
const sndReload = () => { beep(700, 0.04, 0.15); beep(1100, 0.05, 0.15, 'square', 0.25); };
const sndHit = (hs) => beep(hs ? 2200 : 1300, 0.06, 0.18, 'sine');
const sndHurt = () => beep(140, 0.15, 0.3, 'sawtooth');
const sndSwish = () => beep(500, 0.08, 0.08, 'sine');
const sndJingle = (win) => (win ? [523, 659, 784] : [392, 330, 262]).forEach((f, i) => beep(f, 0.22, 0.14, 'triangle', i * 0.16));

// ======================= 战斗单位 =======================
const fighters = [];
let player = null;
let time = 0, state = 'menu', freezeT = 0, roundT = 0, endT = 0, roundNo = 0;
const score = { blue: 0, red: 0 };
let diff = DIFF.normal;

function makeFighter(name, team, isPlayer) {
  const f = {
    name, team, isPlayer, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, crouch: false, eyeH: 1.6,
    hp: 100, armor: 0, alive: true, money: 800, kills: 0, deaths: 0,
    inv: [null, 'pistol', 'knife'], cur: 1, ammo: {}, nextFire: 0, reloadEnd: 0, lastShot: -9, heat: 0, deathT: 0, walk: 0,
    mesh: soldierModel(team),
    // AI
    path: null, pi: 0, target: null, react: 0, thinkT: 0, strafeDir: 0, strafeT: 0, burst: 0, pauseT: 0, stuckT: 0, sx: 0, sz: 0, look: null,
  };
  fighters.push(f);
  return f;
}
const curW = (f) => W[f.inv[f.cur]];
function giveWeapon(f, id) {
  const w = W[id]; f.inv[w.slot] = id;
  if (!w.melee) f.ammo[id] = { mag: w.mag, res: w.res };
}
function setBotGun(f) {
  const g = f.mesh.userData.guns, id = f.inv[f.cur];
  for (const k in g) g[k].visible = k === id;
}
function startReload(f) {
  const w = curW(f), a = f.ammo[w.id];
  if (w.melee || f.reloadEnd || a.mag >= w.mag) return;
  if (a.res <= 0) { if (f.isPlayer) return; a.res = w.mag * 2; }
  f.reloadEnd = time + w.reload;
  if (f.isPlayer) { sndReload(); scoped = false; }
}
function moveFighter(f, dx, dz, dt) {
  if (!collides(f.x + dx, f.y, f.z, R_BODY)) f.x += dx; else f.vx = 0;
  if (!collides(f.x, f.y, f.z + dz, R_BODY)) f.z += dz; else f.vz = 0;
  f.vy -= GRAV * dt; f.y += f.vy * dt;
  const g = groundH(f.x, f.z, R_BODY);
  if (f.y <= g) { f.y = g; f.vy = 0; f.onGround = true; } else f.onGround = false;
}

// ---------- 命中检测 ----------
function rayFighter(ox, oy, oz, dx, dy, dz, f) {
  const hh = f.eyeH + 0.15;
  let tBody = Infinity, tHead = Infinity;
  // 身体 AABB
  const bx0 = f.x - .3, bx1 = f.x + .3, by0 = f.y, by1 = f.y + hh - .34, bz0 = f.z - .3, bz1 = f.z + .3;
  let t0 = 0, t1 = Infinity, ok = true;
  for (const [o, d, a, b] of [[ox, dx, bx0, bx1], [oy, dy, by0, by1], [oz, dz, bz0, bz1]]) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) { ok = false; break; } continue; }
    let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
  }
  if (ok) tBody = t0;
  // 头部球体
  const cx = f.x - ox, cy = f.y + hh - .17 - oy, cz = f.z - oz, b = cx * dx + cy * dy + cz * dz;
  const disc = b * b - (cx * cx + cy * cy + cz * cz) + .2 * .2;
  if (disc >= 0 && b > 0) tHead = Math.max(0, b - Math.sqrt(disc));
  if (tHead === Infinity && tBody === Infinity) return null;
  return tHead <= tBody + 0.35 ? { t: tHead, head: true } : { t: tBody, head: false };
}
const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function spreadDir(dir, s, gauss) {
  _r.crossVectors(dir, UP); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize();
  _u.crossVectors(_r, dir);
  const rad = gauss ? s * Math.sqrt(-2 * Math.log(1 - Math.random() * 0.999)) : s * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  return _d.copy(dir).addScaledVector(_r, Math.cos(a) * rad).addScaledVector(_u, Math.sin(a) * rad).normalize();
}
function fireWeapon(f, dir, w, spread) {
  const ox = f.x, oy = f.y + f.eyeH, oz = f.z;
  f.lastShot = time;
  // 枪口位置（用于曳光）
  const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
  const mx = ox + rx * .18 + dir.x * .7, my = oy - .14 + dir.y * .7, mz = oz + rz * .18 + dir.z * .7;
  const base = dir.clone();
  for (let i = 0; i < (w.pellets || 1); i++) {
    const d = spreadDir(base, spread, false);
    const wh = raycastWorld(ox, oy, oz, d.x, d.y, d.z, 300);
    let tHit = wh ? wh.t : 300, victim = null, head = false;
    for (const e of fighters) {
      if (e === f || !e.alive || e.team === f.team) continue;
      const r = rayFighter(ox, oy, oz, d.x, d.y, d.z, e);
      if (r && r.t < tHit) { tHit = r.t; victim = e; head = r.head; }
    }
    const ex = ox + d.x * tHit, ey = oy + d.y * tHit, ez = oz + d.z * tHit;
    if (victim) {
      puff(ex, ey, ez, 0xa01010);
      hurt(victim, w.dmg * (head ? 3 : 1) * (1 - Math.min(0.3, tHit / 250)), f, head, w);
    } else if (wh) { decal(ex, ey, ez, wh.nx, wh.ny, wh.nz); puff(ex + wh.nx * .05, ey + wh.ny * .05, ez + wh.nz * .05, 0xc8b89a); }
    tracer(mx, my, mz, ex, ey, ez);
  }
  if (f.isPlayer) shotSound(w.id, 0, 0);
  else {
    const dx = f.x - camera.position.x, dz = f.z - camera.position.z, dist = Math.hypot(dx, dz) || 1;
    shotSound(w.id, dist, clamp((dx * Math.cos(camera.rotation.y) - dz * Math.sin(camera.rotation.y)) / dist, -1, 1) * 0.8);
    botFlash.position.set(mx, my, mz); botFlash.intensity = 6;
  }
  // 枪声惊动敌方电脑
  for (const b of fighters) {
    if (b.isPlayer || !b.alive || b.team === f.team || b.target) continue;
    if (Math.hypot(b.x - f.x, b.z - f.z) < 45 && Math.random() < 0.5) { b.look = { x: f.x, z: f.z, until: time + 1.5 }; goTo(b, f.x, f.z); }
  }
}
function hurt(v, dmg, att, head, w) {
  if (state !== 'live' && state !== 'roundEnd') return;
  if (v.armor > 0 && !w.melee) { const ab = dmg * 0.45; v.armor = Math.max(0, Math.round(v.armor - ab * 0.6)); dmg -= ab; }
  v.hp -= Math.max(1, Math.round(dmg));
  if (v === player) { dmgFlash = 1; sndHurt(); punchP += 0.03; }
  if (att === player) { hitT = 0.18; hitHS = head; sndHit(head); }
  if (v.hp <= 0) return kill(v, att, head, w);
  if (!v.isPlayer && !v.target) { v.look = { x: att.x, z: att.z, until: time + 2 }; goTo(v, att.x, att.z); }
}
function kill(v, att, head, w) {
  v.hp = 0; v.alive = false; v.deaths++; v.deathT = 0; v.target = null; v.reloadEnd = 0;
  att.kills++; att.money = Math.min(16000, att.money + 300);
  feed(att, v, w, head);
  if (v === player) { scoped = false; buyOpen = false; specTarget = null; }
  v.mesh.visible = true;
}

// ======================= 玩家输入 =======================
const keys = {};
let mouseDown = false, firePressed = false, locked = false, paused = false, scoped = false;
let sens = 1, lastSlot = 1, buyOpen = false, boardOpen = false;
let punchP = 0, punchY = 0, vmKick = 0, vmSwitch = 0, bob = 0, flashT = 0, dmgFlash = 0, hitT = 0, hitHS = false;
let specTarget = null;
try { sens = parseFloat(localStorage.getItem('dbo_sens')) || 1; } catch (e) {}
$('sens').value = sens;
$('sens').oninput = (e) => { sens = +e.target.value; try { localStorage.setItem('dbo_sens', sens); } catch (er) {} };

const inGame = () => state !== 'menu' && state !== 'matchEnd';
const canBuy = () => player.alive && (state === 'freeze' || (state === 'live' && roundT > ROUND_TIME - BUY_WINDOW));

function switchTo(slot) {
  if (!player.alive || !player.inv[slot] || slot === player.cur) return;
  lastSlot = player.cur; player.cur = slot; player.reloadEnd = 0; scoped = false;
  player.nextFire = Math.max(player.nextFire, time + 0.3); vmSwitch = 1; player.heat = 0;
}
function buy(item) {
  if (!canBuy()) return;
  const price = item.w ? W[item.w].price : item.price;
  if (player.money < price) return sndClick();
  if (item.w) { if (player.inv[0] === item.w) return; giveWeapon(player, item.w); const ls = player.cur === 0 ? lastSlot : player.cur; player.cur = -1; switchTo(0); lastSlot = ls; }
  else if (item.armor) { if (player.armor >= 100) return; player.armor = 100; }
  else if (item.ammo) {
    let need = false;
    for (const id of player.inv) if (id && !W[id].melee && player.ammo[id].res < W[id].res) { player.ammo[id].res = W[id].res; need = true; }
    if (!need) return;
  }
  player.money -= price; beep(900, 0.08, 0.15, 'triangle');
}
addEventListener('keydown', (e) => {
  if (!inGame()) return;
  if (['Tab', 'Space', 'ControlLeft', 'KeyC'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Tab') boardOpen = true;
  if (paused || !player.alive) return;
  if (e.code === 'KeyB') buyOpen = canBuy() && !buyOpen;
  else if (buyOpen && /^Digit[1-6]$/.test(e.code)) buy(BUY[+e.code.slice(5) - 1]);
  else if (/^Digit[1-3]$/.test(e.code)) switchTo(+e.code.slice(5) - 1);
  else if (e.code === 'KeyQ') switchTo(lastSlot);
  else if (e.code === 'KeyR') startReload(player);
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') boardOpen = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (!locked || paused || !inGame()) return;
  const s = 0.0022 * sens * (scoped ? 0.28 : 1);
  if (player.alive) {
    player.yaw -= e.movementX * s;
    player.pitch = clamp(player.pitch - e.movementY * s, -1.5, 1.5);
  }
});
addEventListener('mousedown', (e) => {
  if (!inGame() || paused) return;
  if (!locked) return;
  if (e.button === 0) {
    mouseDown = true; firePressed = true;
    if (!player.alive) cycleSpec();
  }
  if (e.button === 2 && player.alive && curW(player).scope && !player.reloadEnd) scoped = !scoped;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!inGame() || paused || !player.alive) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  for (let i = 1; i <= 3; i++) { const s = (player.cur + dir * i + 6) % 3; if (player.inv[s]) return switchTo(s); }
});
function lock() { initAudio(); if (NOLOCK) { locked = true; paused = false; $('pause').classList.add('hidden'); return; } const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  paused = !locked && inGame();
  $('pause').classList.toggle('hidden', !paused);
  if (paused) { mouseDown = false; for (const k in keys) keys[k] = false; }
});
$('pause').onclick = lock;
canvas.onclick = () => { if (inGame() && !locked) lock(); };

function cycleSpec() {
  const mates = fighters.filter((f) => f.alive && f.team === player.team);
  if (!mates.length) { specTarget = null; return; }
  specTarget = mates[(mates.indexOf(specTarget) + 1) % mates.length];
}

// ======================= 玩家更新 =======================
const _fwd = new THREE.Vector3();
function updatePlayer(dt) {
  const p = player, w = curW(p), act = state === 'live' || state === 'roundEnd';
  // 移动
  let ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  if (!act) ix = iz = 0;
  const il = Math.hypot(ix, iz) || 1; ix /= il; iz /= il;
  p.crouch = !!(keys.KeyC || keys.ControlLeft);
  let sp = RUN * w.speed * (p.crouch ? 0.42 : keys.ShiftLeft ? 0.5 : 1) * (scoped ? 0.5 : 1);
  const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
  const wx = (ix * cs + iz * sn) * sp, wz = (-ix * sn + iz * cs) * sp;
  const k = 1 - Math.exp(-(p.onGround ? 14 : 2.5) * dt);
  p.vx += (wx - p.vx) * k; p.vz += (wz - p.vz) * k;
  if (keys.Space && p.onGround && act) { p.vy = JUMP_V; p.onGround = false; }
  moveFighter(p, p.vx * dt, p.vz * dt, dt);
  p.eyeH += ((p.crouch ? 1.05 : 1.6) - p.eyeH) * (1 - Math.exp(-14 * dt));
  const hs = Math.hypot(p.vx, p.vz);
  if (p.onGround) bob += hs * dt * 1.9;

  // 武器
  if (p.reloadEnd && time >= p.reloadEnd) {
    const a = p.ammo[w.id], n = Math.min(w.mag - a.mag, a.res); a.mag += n; a.res -= n; p.reloadEnd = 0;
  }
  if (time - p.lastShot > w.rate * 1.6) p.heat = Math.max(0, p.heat - dt * 9);
  const want = mouseDown && (w.auto || firePressed) && !buyOpen;
  firePressed = false;
  if (want && act && time >= p.nextFire && !p.reloadEnd) {
    camera.getWorldDirection(_fwd);
    if (w.melee) {
      p.nextFire = time + w.rate; vmKick = 1.6; sndSwish();
      let best = null, bt = w.range;
      for (const e of fighters) {
        if (!e.alive || e.team === p.team) continue;
        const r = rayFighter(p.x, p.y + p.eyeH, p.z, _fwd.x, _fwd.y, _fwd.z, e);
        if (r && r.t < bt) { bt = r.t; best = e; }
      }
      if (best) { puff(best.x, best.y + 1.2, best.z, 0xa01010); hurt(best, w.dmg, p, false, w); }
    } else {
      const a = p.ammo[w.id];
      if (a.mag > 0) {
        a.mag--; p.nextFire = time + w.rate;
        let s = (w.scope && !scoped ? w.unscoped : w.spread) + p.heat * w.heat + (hs / RUN) * w.move + (p.onGround ? 0 : 0.07);
        if (p.crouch) s *= 0.7;
        fireWeapon(p, _fwd, w, s);
        p.heat = Math.min(12, p.heat + 1);
        punchP += w.kick * (0.7 + Math.min(p.heat, 8) * 0.07); punchY += rand(-1, 1) * w.kick * 0.35;
        vmKick = 1; flashT = 0.045;
        flash.rotation.z = Math.random() * 6; flash.scale.setScalar(rand(0.8, 1.3) * (w.id === 'shotgun' || w.id === 'sniper' ? 1.6 : 1));
        if (w.scope) scoped = false;
        if (a.mag === 0 && a.res > 0) startReload(p);
      } else { sndClick(); p.nextFire = time + 0.25; startReload(p); }
    }
  }
  const dec = Math.exp(-7 * dt); punchP *= dec; punchY *= dec;
}

// ======================= 电脑 AI =======================
function goTo(b, x, z) {
  let gx = clamp(Math.floor(x / CELL), 0, GW - 1), gz = clamp(Math.floor(z / CELL), 0, GH - 1);
  if (!walkable(gx, gz)) {
    let found = false;
    for (let r = 1; r < 4 && !found; r++)
      for (let dz = -r; dz <= r && !found; dz++)
        for (let dx = -r; dx <= r && !found; dx++) if (walkable(gx + dx, gz + dz)) { gx += dx; gz += dz; found = true; }
    if (!found) return;
  }
  const p = findPath(Math.floor(b.x / CELL), Math.floor(b.z / CELL), gx, gz, 0.6);
  if (p) { b.path = p; b.pi = 1; b.stuckT = 0; b.sx = b.x; b.sz = b.z; }
}
function pickGoal(b) {
  const r = Math.random();
  if (r < 0.5) { const s = spawns[b.team === 'blue' ? 'red' : 'blue'][(Math.random() * 6) | 0]; goTo(b, s.x, s.z); }
  else if (r < 0.7) goTo(b, GW * CELL / 2 + rand(-8, 8), GH * CELL / 2 + rand(-8, 8));
  else goTo(b, rand(2, GW * CELL - 2), rand(2, GH * CELL - 2));
}
function canSee(a, b) {
  const ox = a.x, oy = a.y + a.eyeH, oz = a.z;
  for (const h of [b.eyeH, b.eyeH * 0.55]) {
    const dx = b.x - ox, dy = b.y + h - oy, dz = b.z - oz, d = Math.hypot(dx, dy, dz);
    if (d < 0.01 || !raycastWorld(ox, oy, oz, dx / d, dy / d, dz / d, d)) return true;
  }
  return false;
}
const _aim = new THREE.Vector3();
function updateBot(b, dt) {
  const w = curW(b), act = state === 'live' || state === 'roundEnd';
  if (b.reloadEnd && time >= b.reloadEnd) { const a = b.ammo[w.id], n = Math.min(w.mag - a.mag, a.res); a.mag += n; a.res -= n; b.reloadEnd = 0; }
  if (!act) { moveFighter(b, 0, 0, dt); return; }

  // 感知
  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = rand(0.1, 0.2);
    let best = null, bd = 80;
    for (const e of fighters) {
      if (!e.alive || e.team === b.team) continue;
      const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
      if (d >= bd) continue;
      const ang = Math.abs(angDiff(Math.atan2(-dx, -dz), b.yaw));
      if (!(ang < 1.25 || d < 5 || e === b.target)) continue;
      if (canSee(b, e)) { bd = d; best = e; }
    }
    if (best) {
      if (b.target !== best) { b.react = diff.react * rand(0.7, 1.4); b.burst = 0; b.pauseT = 0; }
      b.target = best; b.lastSeen = { x: best.x, z: best.z };
    } else if (b.target) { b.target = null; if (b.lastSeen) goTo(b, b.lastSeen.x, b.lastSeen.z); }
  }

  let mx = 0, mz = 0;
  const speed = RUN * 0.92 * w.speed;
  if (b.target && b.target.alive) {
    const t = b.target, dx = t.x - b.x, dz = t.z - b.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz), da = angDiff(want, b.yaw);
    b.yaw += clamp(da, -diff.turn * dt, diff.turn * dt);
    b.react -= dt;
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeDir = [-1, 0, 1][(Math.random() * 3) | 0]; b.strafeT = rand(0.4, 1.1); }
    const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    mx = rx * b.strafeDir * speed * 0.55; mz = rz * b.strafeDir * speed * 0.55;
    const pref = w.id === 'shotgun' ? 7 : 28;
    if (dist > pref) { mx += dx / dist * speed * 0.6; mz += dz / dist * speed * 0.6; }
    // 开火
    const a = b.ammo[w.id];
    if (a.mag <= 0) startReload(b);
    else if (b.react <= 0 && Math.abs(da) < 0.3 && !b.reloadEnd && time >= b.nextFire) {
      b.pauseT -= dt;
      if (b.burst <= 0 && b.pauseT <= 0) b.burst = w.auto ? 2 + ((Math.random() * 5) | 0) : 1;
      if (b.burst > 0) {
        b.burst--; a.mag--;
        b.nextFire = time + (w.auto ? w.rate : w.rate * rand(1.6, 3));
        if (b.burst === 0) b.pauseT = w.auto ? rand(0.25, 0.6) : 0;
        _aim.set(dx, t.y + t.eyeH * 0.72 - (b.y + b.eyeH), dz).normalize();
        const ts = Math.hypot(t.vx, t.vz);
        const err = diff.err * (1 + ts * 0.1) * (w.id === 'sniper' ? 0.5 : 1);
        _aim.copy(spreadDir(_aim, err, true));
        fireWeapon(b, _aim, w, w.spread);
      }
    }
  } else {
    if (!b.reloadEnd && !w.melee && b.ammo[w.id].mag < w.mag * 0.4) startReload(b);
    if (!b.path || b.pi >= b.path.length) pickGoal(b);
    if (b.path && b.pi < b.path.length) {
      const wp = b.path[b.pi], dx = wp.x - b.x, dz = wp.z - b.z, d = Math.hypot(dx, dz);
      if (d < 0.45) b.pi++;
      else {
        mx = dx / d * speed; mz = dz / d * speed;
        let want = Math.atan2(-dx, -dz);
        if (b.look && time < b.look.until) want = Math.atan2(-(b.look.x - b.x), -(b.look.z - b.z));
        b.yaw += clamp(angDiff(want, b.yaw), -6 * dt, 6 * dt);
      }
      b.stuckT += dt;
      if (b.stuckT > 1.2) {
        if (Math.hypot(b.x - b.sx, b.z - b.sz) < 0.5) b.path = null;
        b.stuckT = 0; b.sx = b.x; b.sz = b.z;
      }
    }
  }
  // 互相避让
  for (const o of fighters) {
    if (o === b || !o.alive) continue;
    const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz);
    if (d < 0.8 && d > 0.001) { mx += dx / d * 2; mz += dz / d * 2; }
  }
  b.vx = mx; b.vz = mz;
  moveFighter(b, mx * dt, mz * dt, dt);
}
function botBuy(b) {
  if (b.inv[0]) { const a = b.ammo[b.inv[0]]; a.mag = W[b.inv[0]].mag; a.res = W[b.inv[0]].res; }
  else {
    const opts = [];
    if (b.money >= 4500 + 650 && Math.random() < 0.15) opts.push('sniper');
    else if (b.money >= 2700) opts.push('rifle', 'rifle', 'smg');
    else if (b.money >= 1700) opts.push('smg', 'shotgun', 'smg');
    if (opts.length) { const id = opts[(Math.random() * opts.length) | 0]; b.money -= W[id].price; giveWeapon(b, id); }
  }
  if (b.armor < 100 && b.money >= 650) { b.money -= 650; b.armor = 100; }
  b.ammo.pistol = { mag: W.pistol.mag, res: W.pistol.res };
  b.cur = b.inv[0] ? 0 : 1;
  setBotGun(b);
}

// ======================= 回合流程 =======================
let msgUntil = 0;
function setMsg(t, sub = '', dur = 3) { $('msg').textContent = t; $('sub').textContent = sub; msgUntil = time + dur; }
function startRound() {
  roundNo++; state = 'freeze'; freezeT = FREEZE_TIME; roundT = ROUND_TIME;
  for (const team of ['blue', 'red']) {
    const sp = spawns[team].slice().sort(() => Math.random() - 0.5);
    fighters.filter((f) => f.team === team).forEach((f, i) => {
      if (!f.alive) { f.inv[0] = null; f.armor = 0; f.cur = 1; giveWeapon(f, 'pistol'); }
      Object.assign(f, {
        x: sp[i].x, y: 0, z: sp[i].z, vx: 0, vz: 0, vy: 0, yaw: team === 'blue' ? -Math.PI / 2 : Math.PI / 2, pitch: 0,
        hp: 100, alive: true, reloadEnd: 0, nextFire: 0, heat: 0, target: null, path: null, look: null, lastSeen: null, crouch: false, eyeH: 1.6,
      });
      f.mesh.rotation.set(0, f.yaw, 0); f.mesh.visible = !f.isPlayer;
      if (!f.isPlayer) botBuy(f);
    });
  }
  for (const d of decals) d.visible = false;
  scoped = false; buyOpen = false; specTarget = null; punchP = punchY = 0;
  setMsg(`第 ${roundNo} 回合`, '按 B 购买装备', FREEZE_TIME);
}
function endRound(winner, why) {
  state = 'roundEnd'; endT = 4.5;
  if (winner) score[winner]++;
  for (const f of fighters) f.money = Math.min(16000, f.money + (winner ? (f.team === winner ? 2600 : 1500) : 1500));
  setMsg(winner ? `${TEAM_CN[winner]}获胜` : '平局', why, 4.5);
  sndJingle(winner === player.team);
  buyOpen = false;
}
function updateRound(dt) {
  if (state === 'freeze') {
    freezeT -= dt;
    if (freezeT <= 0) { state = 'live'; setMsg('行动开始', '', 1.5); beep(880, 0.2, 0.15, 'triangle'); }
  } else if (state === 'live') {
    roundT -= dt;
    const nb = fighters.filter((f) => f.alive && f.team === 'blue').length, nr = fighters.filter((f) => f.alive && f.team === 'red').length;
    if (!nb || !nr) endRound(nb ? 'blue' : nr ? 'red' : null, '敌方全员被歼灭');
    else if (roundT <= 0) endRound(nb > nr ? 'blue' : nr > nb ? 'red' : null, '时间耗尽，存活人数多的一方获胜');
  } else if (state === 'roundEnd') {
    endT -= dt;
    if (endT <= 0) {
      if (score.blue >= WIN_ROUNDS || score.red >= WIN_ROUNDS) return endMatch();
      startRound();
    }
  }
}
function endMatch() {
  state = 'matchEnd';
  const win = score[player.team] >= WIN_ROUNDS;
  $('endTitle').textContent = win ? '胜利' : '失败';
  $('endSub').textContent = `蓝队 ${score.blue} : ${score.red} 红队　·　你的战绩 ${player.kills} 杀 / ${player.deaths} 死`;
  $('end').classList.remove('hidden'); $('hud').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function newMatch(team, diffKey) {
  for (const f of fighters) scene.remove(f.mesh);
  fighters.length = 0; score.blue = score.red = 0; roundNo = 0; time = 0; msgUntil = 0;
  diff = DIFF[diffKey];
  $('feed').innerHTML = '';
  const names = NAMES.slice().sort(() => Math.random() - 0.5);
  player = makeFighter('你', team, true);
  for (const t of ['blue', 'red'])
    for (let i = t === team ? 1 : 0; i < TEAM_SIZE; i++) makeFighter(names.pop(), t, false);
  for (const f of fighters) { f.alive = false; }
  const col = TEAM_COL[team].body;
  for (const id in vmGuns) vmGuns[id].userData.sleeve.material = mat(col);
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  lastSlot = 1;
  startRound();
  lock();
}

// ======================= HUD =======================
const feedItems = [];
function feed(att, v, w, head) {
  const d = document.createElement('div');
  d.innerHTML = `<span class="${TEAM_CSS[att.team]}">${att.name}</span><i>${w.name.split(' ')[0]}${head ? ' ✦爆头' : ''}</i><span class="${TEAM_CSS[v.team]}">${v.name}</span>`;
  $('feed').appendChild(d); feedItems.push({ d, until: time + 6 });
  if (feedItems.length > 6) feedItems.shift().d.remove();
}
const radar = $('radar'), rg = radar.getContext('2d'), RS = 4;
const radarBg = document.createElement('canvas'); radarBg.width = GW * RS; radarBg.height = GH * RS;
(() => {
  const g = radarBg.getContext('2d');
  for (let z = 0; z < GH; z++)
    for (let x = 0; x < GW; x++) {
      const c = ROWS[z][x]; if (c === '.' || c === 'A' || c === 'B') continue;
      g.fillStyle = c === '#' ? 'rgba(210,200,180,.75)' : 'rgba(150,110,60,.8)';
      g.fillRect(x * RS, z * RS, RS, RS);
    }
})();
let seenT = 0; const seen = new Set();
function drawRadar(dt) {
  rg.clearRect(0, 0, radar.width, radar.height); rg.drawImage(radarBg, 0, 0);
  seenT -= dt;
  const viewer = player.alive ? player : specTarget;
  if (seenT <= 0) {
    seenT = 0.2; seen.clear();
    if (viewer) for (const f of fighters) if (f.alive && f.team !== player.team && canSee(viewer, f)) seen.add(f);
  }
  const k = RS / CELL;
  for (const f of fighters) {
    if (!f.alive || f === player) continue;
    if (f.team !== player.team && !seen.has(f)) continue;
    rg.fillStyle = f.team === 'blue' ? '#6fb1ff' : '#ff6b5b';
    rg.beginPath(); rg.arc(f.x * k, f.z * k, 2.6, 0, 7); rg.fill();
  }
  if (player.alive) {
    rg.save(); rg.translate(player.x * k, player.z * k); rg.rotate(-player.yaw);
    rg.fillStyle = '#fff'; rg.beginPath(); rg.moveTo(0, -6); rg.lineTo(4, 4); rg.lineTo(-4, 4); rg.fill(); rg.restore();
  }
}
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function renderBuy() {
  let h = `<h3>装备购买　$${player.money}</h3>`;
  for (const it of BUY) {
    const price = it.w ? W[it.w].price : it.price, name = it.w ? W[it.w].name : it.name;
    h += `<div class="it${player.money < price ? ' no' : ''}"><span><b>${it.key}</b>${name}</span><span>$${price}</span></div>`;
  }
  return h + '<p>按数字键购买，按 B 关闭。仅回合开始阶段可购买。</p>';
}
function renderBoard() {
  let h = '';
  for (const t of ['blue', 'red']) {
    h += `<h3 class="${TEAM_CSS[t]}">${TEAM_CN[t]}　${score[t]}</h3><table><tr><th>名称</th><th>击杀</th><th>死亡</th><th>状态</th></tr>`;
    for (const f of fighters.filter((x) => x.team === t).sort((a, b) => b.kills - a.kills))
      h += `<tr class="${f.alive ? '' : 'dead'}${f === player ? ' me' : ''}"><td>${f.name}</td><td>${f.kills}</td><td>${f.deaths}</td><td>${f.alive ? '存活' : '阵亡'}</td></tr>`;
    h += '</table>';
  }
  return h;
}
let panelT = 0;
function updateHUD(dt) {
  const p = player, w = curW(p);
  setText('hp', Math.max(0, p.hp)); setText('armor', p.armor); setText('money', '$' + p.money);
  setText('wname', w.name + (p.reloadEnd ? '　换弹中…' : ''));
  if (w.melee) { setText('mag', '—'); setText('res', ''); }
  else { setText('mag', p.ammo[w.id].mag); setText('res', '/ ' + p.ammo[w.id].res); }
  const tt = Math.max(0, Math.ceil(state === 'freeze' ? freezeT : roundT));
  setText('timer', `${(tt / 60) | 0}:${String(tt % 60).padStart(2, '0')}`);
  setText('scoreBlue', score.blue); setText('scoreRed', score.red);
  setText('aliveBlue', fighters.filter((f) => f.alive && f.team === 'blue').length);
  setText('aliveRed', fighters.filter((f) => f.alive && f.team === 'red').length);
  if (time > msgUntil && $('msg').textContent) { $('msg').textContent = ''; $('sub').textContent = ''; }
  if (!p.alive && time > msgUntil) { $('sub').textContent = specTarget ? `观战中：${specTarget.name}（点击切换）` : '你已阵亡'; }
  while (feedItems.length && feedItems[0].until < time) feedItems.shift().d.remove();
  // 准星
  const cross = $('cross'), hs = Math.hypot(p.vx, p.vz);
  const showCross = p.alive && !scoped && !w.scope;
  cross.classList.toggle('hidden', !showCross);
  if (showCross) cross.style.setProperty('--gap', (4 + (w.melee ? 0 : (w.spread + p.heat * w.heat + hs / RUN * w.move + (p.onGround ? 0 : 0.07)) * 420)).toFixed(1) + 'px');
  $('scope').classList.toggle('hidden', !scoped);
  hitT -= dt; $('hit').className = hitT > 0 ? (hitHS ? 'on hs' : 'on') : '';
  dmgFlash = Math.max(0, dmgFlash - dt * 1.8); $('dmg').style.opacity = dmgFlash.toFixed(2);
  if (buyOpen && !canBuy()) buyOpen = false;
  $('buy').classList.toggle('hidden', !buyOpen); $('board').classList.toggle('hidden', !boardOpen);
  panelT -= dt;
  if (panelT <= 0) { panelT = 0.15; if (buyOpen) $('buy').innerHTML = renderBuy(); if (boardOpen) $('board').innerHTML = renderBoard(); }
  drawRadar(dt);
}

// ======================= 画面更新 =======================
function updateMeshes(dt) {
  for (const f of fighters) {
    const m = f.mesh;
    if (f.alive) {
      if (f.isPlayer) { m.visible = false; continue; }
      m.position.set(f.x, f.y, f.z); m.rotation.set(0, f.yaw, 0);
      const sp = Math.hypot(f.vx, f.vz);
      f.walk += sp * dt * 2.2;
      const sw = Math.sin(f.walk) * Math.min(1, sp / 3) * 0.7;
      m.userData.legs[0].rotation.x = sw; m.userData.legs[1].rotation.x = -sw;
    } else if (f.deathT < 1) {
      f.deathT = Math.min(1, f.deathT + dt * 2.8);
      f.vy -= GRAV * dt; f.y = Math.max(groundH(f.x, f.z, 0.1), f.y + f.vy * dt);
      m.position.set(f.x, f.y + 0.14 * f.deathT, f.z);
      m.rotation.set(f.deathT * Math.PI / 2, f.yaw, 0);
      m.userData.legs[0].rotation.x = m.userData.legs[1].rotation.x = 0;
    }
  }
  for (const t of tracers) if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / 0.07); if (t.life <= 0) t.l.visible = false; }
  for (const p of puffs) if (p.life > 0) {
    p.life -= dt; const k = 1 - p.life / 0.25;
    p.m.scale.setScalar(1 + k * 3); p.m.material.opacity = 1 - k; if (p.life <= 0) p.m.visible = false;
  }
  botFlash.intensity = Math.max(0, botFlash.intensity - dt * 120);
}
function updateCamera(dt) {
  const p = player;
  let fov = 75;
  if (p.alive) {
    camera.position.set(p.x, p.y + p.eyeH, p.z);
    camera.rotation.set(clamp(p.pitch + punchP, -1.55, 1.55), p.yaw + punchY, 0);
    if (scoped) fov = 18;
  } else {
    if (specTarget && !specTarget.alive) specTarget = null;
    if (!specTarget && p.deathT >= 1) cycleSpec();
    const t = specTarget || p, ey = t.y + (specTarget ? 1.7 : 0.6);
    const yaw = t.yaw, bx = Math.sin(yaw), bz = Math.cos(yaw), len = Math.hypot(bx * 3.2, 1.3, bz * 3.2);
    const hit = raycastWorld(t.x, ey, t.z, bx * 3.2 / len, 1.3 / len, bz * 3.2 / len, len);
    const d = (hit ? Math.max(0.3, hit.t - 0.25) : len) / len;
    camera.position.set(t.x + bx * 3.2 * d, ey + 1.3 * d, t.z + bz * 3.2 * d);
    camera.lookAt(t.x, ey, t.z);
  }
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-22 * dt)); camera.updateProjectionMatrix(); }

  // 第一人称武器
  const show = p.alive && !scoped;
  vmRoot.visible = show;
  if (show) {
    const id = p.inv[p.cur];
    for (const k in vmGuns) vmGuns[k].visible = k === id;
    vmKick = Math.max(0, vmKick - dt * 9); vmSwitch = Math.max(0, vmSwitch - dt * 4);
    const hs = Math.hypot(p.vx, p.vz) / RUN;
    let rl = 0;
    if (p.reloadEnd) { const w = W[id], k = 1 - (p.reloadEnd - time) / w.reload; rl = Math.sin(Math.min(1, k) * Math.PI); }
    const melee = id === 'knife';
    vmRoot.position.set(0.19 + Math.cos(bob) * 0.008 * hs, -0.19 - Math.abs(Math.sin(bob)) * 0.012 * hs - vmSwitch * 0.3 - rl * 0.16, -0.42 + vmKick * (melee ? -0.12 : 0.05));
    vmRoot.rotation.set(vmKick * (melee ? -0.5 : 0.09) - rl * 0.7 - vmSwitch * 0.6, 0.04 + (melee ? vmKick * 0.4 : 0), rl * 0.4);
    flashT -= dt; flash.visible = flashT > 0 && !melee;
    if (flash.visible) flash.position.set(0, 0.01, vmGuns[id].userData.mz - 0.04);
  }
}

// ======================= 主循环 =======================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (inGame() && !paused) {
    time += dt;
    updateRound(dt);
    if (state !== 'matchEnd') {
      if (player.alive) updatePlayer(dt);
      for (const f of fighters) if (!f.isPlayer && f.alive) updateBot(f, dt);
      updateMeshes(dt); updateCamera(dt); updateHUD(dt);
    }
  } else if (state === 'menu') {
    const a = now / 9000;
    camera.position.set(GW + Math.cos(a) * 30, 22, GH + Math.sin(a) * 26); camera.lookAt(GW, 0, GH);
    vmRoot.visible = false;
  }
  renderer.clear();
  renderer.render(scene, camera);
  if (vmRoot.visible && inGame()) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}
requestAnimationFrame(frame);

// ======================= 菜单 =======================
const choice = { teamSel: 'blue', diffSel: 'normal' };
for (const id of ['teamSel', 'diffSel'])
  $(id).querySelectorAll('button').forEach((b) => (b.onclick = () => {
    choice[id] = b.dataset.v;
    $(id).querySelectorAll('button').forEach((o) => o.classList.toggle('sel', o === b));
  }));
$('start').onclick = () => newMatch(choice.teamSel, choice.diffSel);
$('again').onclick = () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); state = 'menu'; };

window.__game = { get state() { return state; }, get player() { return player; }, fighters, get time() { return time; }, score };
