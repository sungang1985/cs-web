import * as THREE from '../vendor/three.module.min.js';
import { ROWS, CELL, GW, GH, WALL_H, cellH, walkable, spawns, collides, groundH, raycastWorld, findPath } from './map.js';
import * as TEX from './textures.js';
import { Soldier, viewModel, GUN, gunGeo, gunMat } from './models.js';
import { Q, QUALITY, setQuality } from './settings.js';
import { initAudio, shotSound, beep, sndClick, sndReload, sndHit, sndHurt, sndSwish, sndJingle, stepSound, whizSound, sndKill } from './audio.js';

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
const DIFF = {
  easy:   { react: 0.8,  err: 0.075, turn: 4 },
  normal: { react: 0.45, err: 0.045, turn: 7 },
  hard:   { react: 0.24, err: 0.026, turn: 11 },
};
const TEAM_CN = { blue: '蓝队', red: '红队' };
const TEAM_CSS = { blue: 'b', red: 'r' };
const SLEEVE = { blue: 0x2c436f, red: 0x8f4a36 };
const NAMES = ['猎鹰', '山猫', '铁壁', '夜枭', '赤狐', '孤狼', '雪豹', '飞隼', '黑熊', '灰鲨'];
const TEAM_SIZE = 5, WIN_ROUNDS = 8, ROUND_TIME = 120, FREEZE_TIME = 5, BUY_WINDOW = 20;
const GRAV = 20, JUMP_V = 6.8, RUN = 5.4, R_BODY = 0.35;

// ======================= 渲染基础 =======================
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa && QUALITY === 'low', powerPreference: 'high-performance' });
// 渲染像素有上限（按画质档位），高分屏不会按原生分辨率硬算；resScale 为自动降档系数
let resScale = 1, pixelRatio = 1;
const calcPR = () => Math.min(devicePixelRatio || 1, Math.sqrt(Q.pixels / (innerWidth * innerHeight))) * resScale;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = Q.shadow === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;           // 场景静态，阴影只渲染一次
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;

const HORIZON = 0xd8cbb0;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON, 45, 190);
const camera = new THREE.PerspectiveCamera(75, 1, 0.06, 500);
camera.rotation.order = 'YXZ';

const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xeaf2ff, 0x9a8462, Q.pbr ? 1.2 : 2.0));
const vmSun = new THREE.DirectionalLight(0xfff0d8, 2.4); vmSun.position.set(1.5, 2, 1); vmScene.add(vmSun);

scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x9a8260, Q.pbr ? 1.1 : Q.shadow ? 1.6 : 1.9));
const sun = new THREE.DirectionalLight(0xffedcc, 3.0);
sun.position.set(GW * CELL / 2 + 34, 62, GH * CELL / 2 + 24);
sun.target.position.set(GW * CELL / 2, 0, GH * CELL / 2);
sun.castShadow = Q.shadow > 0;
sun.shadow.mapSize.set(Q.shadow === 2 ? 4096 : 2048, Q.shadow === 2 ? 4096 : 2048);
Object.assign(sun.shadow.camera, { left: -58, right: 58, top: 58, bottom: -58, near: 1, far: 170 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- 后期处理：HDR 渲染 → 泛光 → ACES 色调映射 / 调色 / 暗角 / 颗粒 ----------
const POST = QUALITY !== 'low';
const post = { rt: null, a: null, b: null, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad: null };
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const matBright = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, px: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
  fragmentShader: 'varying vec2 vUv; uniform sampler2D t; uniform vec2 px; void main(){ vec3 c = (texture2D(t, vUv + px * vec2(-1., -1.)).rgb + texture2D(t, vUv + px * vec2(1., -1.)).rgb + texture2D(t, vUv + px * vec2(-1., 1.)).rgb + texture2D(t, vUv + px * vec2(1., 1.)).rgb) * 0.25; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(0.82, 1.5, l), 1.0); }' });
const matBlur = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, d: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
  fragmentShader: 'varying vec2 vUv; uniform sampler2D t; uniform vec2 d; void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227; c += (texture2D(t, vUv + d * 1.385).rgb + texture2D(t, vUv - d * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + d * 3.231).rgb + texture2D(t, vUv - d * 3.231).rgb) * 0.07; gl_FragColor = vec4(c, 1.0); }' });
const matFinal = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, bloom: { value: null }, time: { value: 0 }, hurt: { value: 0 }, aspect: { value: 1 } }, vertexShader: VS, depthTest: false, depthWrite: false,
  fragmentShader: `varying vec2 vUv; uniform sampler2D t; uniform sampler2D bloom; uniform float time; uniform float hurt; uniform float aspect;
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(t, vUv).rgb + texture2D(bloom, vUv).rgb * 0.55;
      c = aces(c * 1.12);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.12);                                   // 饱和度
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);                   // 对比度
      c *= mix(vec3(0.96, 0.99, 1.06), vec3(1.05, 1.0, 0.94), l);  // 暗部偏冷、亮部偏暖
      vec2 q = (vUv - 0.5) * vec2(aspect, 1.0); float r = length(q);
      c *= 1.0 - smoothstep(0.45, 1.05, r) * 0.42;                 // 暗角
      c = mix(c, vec3(0.55, 0.0, 0.0), hurt * smoothstep(0.25, 0.85, r) * 0.75);   // 受伤 / 低血量红晕
      c = pow(c, vec3(1.0 / 2.2));
      c += (hash(vUv * 917.0 + time) - 0.5) * 0.022;               // 胶片颗粒
      gl_FragColor = vec4(c, 1.0);
    }` });
post.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matFinal); post.quad.frustumCulled = false; post.scene.add(post.quad);
function makeTargets() {
  const w = Math.max(8, Math.round(innerWidth * pixelRatio)), h = Math.max(8, Math.round(innerHeight * pixelRatio));
  for (const k of ['rt', 'a', 'b']) if (post[k]) post[k].dispose();
  post.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.aa ? 4 : 0 });
  const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  post.a = new THREE.WebGLRenderTarget(w >> 2, h >> 2, o); post.b = new THREE.WebGLRenderTarget(w >> 2, h >> 2, o);
  matBright.uniforms.px.value.set(1 / w, 1 / h);
}
function pass(mat, target) { post.quad.material = mat; renderer.setRenderTarget(target); renderer.render(post.scene, post.cam); }
function renderFrame(withVM) {
  if (!POST) {
    renderer.clear(); renderer.render(scene, camera);
    if (withVM) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
    return;
  }
  renderer.setRenderTarget(post.rt); renderer.clear(); renderer.render(scene, camera);
  if (withVM) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
  matBright.uniforms.t.value = post.rt.texture; pass(matBright, post.a);
  const bw = 1 / post.a.width, bh = 1 / post.a.height;
  for (let i = 0; i < 2; i++) {
    matBlur.uniforms.t.value = post.a.texture; matBlur.uniforms.d.value.set(bw * (1 + i), 0); pass(matBlur, post.b);
    matBlur.uniforms.t.value = post.b.texture; matBlur.uniforms.d.value.set(0, bh * (1 + i)); pass(matBlur, post.a);
  }
  matFinal.uniforms.t.value = post.rt.texture; matFinal.uniforms.bloom.value = post.a.texture;
  matFinal.uniforms.time.value = (performance.now() % 1000) / 1000; matFinal.uniforms.aspect.value = camera.aspect;
  pass(matFinal, null);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pixelRatio = calcPR());
  renderer.setSize(w, h, false);
  if (POST) makeTargets();
  camera.aspect = vmCam.aspect = w / h;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ======================= 场景构建（按材质合并为少量网格）=======================
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: TEX.skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
// 用天空贴图生成环境反射，让金属与布料有更自然的受光
if (Q.pbr) {
  const pm = new THREE.PMREMGenerator(renderer), eq = sky.material.map.clone(); eq.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = vmScene.environment = pm.fromEquirectangular(eq).texture; pm.dispose(); eq.dispose();
}

(function buildWorld() {
  const B = {};
  const buf = (k) => B[k] || (B[k] = { p: [], n: [], uv: [] });
  const quad = (k, P, UV) => {
    const b = buf(k), ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2], bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    for (const i of [0, 1, 2, 0, 2, 3]) { b.p.push(P[i][0], P[i][1], P[i][2]); b.n.push(nx, ny, nz); b.uv.push(UV[i][0], UV[i][1]); }
  };
  // mode 'wall'：横向按世界坐标平铺，纵向铺满墙高；'unit'：每个面 0..1
  const S = 4;
  const box = (k, kTop, x0, x1, y0, y1, z0, z1, mode) => {
    const U = (a, b) => (mode === 'wall' ? [[a / S, 0], [b / S, 0], [b / S, 1], [a / S, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]]);
    quad(k, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], U(z1, z0));
    quad(k, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], U(z0, z1));
    quad(k, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], U(x0, x1));
    quad(k, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], U(x1, x0));
    quad(kTop, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], mode === 'wall' ? [[x0 / S, z1 / S], [x1 / S, z1 / S], [x1 / S, z0 / S], [x0 / S, z0 / S]] : [[0, 0], [1, 0], [1, 1], [0, 1]]);
  };
  for (let z = 0; z < GH; z++) {
    let x = 0;
    while (x < GW) {
      const c = ROWS[z][x];
      if (c === '#') {
        let e = x; while (e < GW && ROWS[z][e] === '#') e++;
        const outer = z === 0 || z === GH - 1 || (e - x === 1 && (x === 0 || x === GW - 1));
        box(outer ? 'outer' : 'wall', 'floor', x * CELL, e * CELL, 0, outer ? WALL_H + 1.5 : WALL_H, z * CELL, (z + 1) * CELL, 'wall');
        x = e;
      } else {
        const x0 = x * CELL, z0 = z * CELL;
        if (c === 'x') box('crate', 'crate', x0 + 0.02, x0 + CELL - 0.02, 0, 1, z0 + 0.02, z0 + CELL - 0.02, 'unit');
        if (c === 'X') box('cont', 'cont', x0, x0 + CELL, 0, 2.2, z0, z0 + CELL, 'unit');
        x++;
      }
    }
  }
  const fw = GW * CELL, fh = GH * CELL;
  quad('floor', [[0, 0, fh], [fw, 0, fh], [fw, 0, 0], [0, 0, 0]], [[0, fh / S], [fw / S, fh / S], [fw / S, 0], [0, 0]]);
  const mk = (tex, std) => (Q.pbr ? new THREE.MeshStandardMaterial({ ...tex, ...std }) : new THREE.MeshLambertMaterial(tex));
  const mats = {
    wall: mk(TEX.wallTexture(), { roughness: 0.95, normalScale: new THREE.Vector2(1.2, 1.2) }),
    outer: mk(TEX.outerWallTexture(), { roughness: 0.92 }),
    floor: mk(TEX.floorTexture(), { roughness: 0.93 }),
    crate: mk(TEX.crateTexture(), { roughness: 0.85 }),
    cont: mk(TEX.containerTexture(), { roughness: 0.6, metalness: 0.25 }),
  };
  for (const k in B) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B[k].p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B[k].n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B[k].uv, 2));
    const m = new THREE.Mesh(g, mats[k]); m.castShadow = Q.shadow > 0 && k !== 'floor'; m.receiveShadow = Q.shadow > 0; m.matrixAutoUpdate = false; m.frustumCulled = false;
    scene.add(m);
  }
  renderer.shadowMap.needsUpdate = true;
})();

// ======================= 特效（全部池化，少量绘制调用）=======================
const texFlash = TEX.flashTexture(), texSoft = TEX.softTexture();
const TR_N = 40, trPos = new Float32Array(TR_N * 6), trCol = new Float32Array(TR_N * 6), trLife = new Float32Array(TR_N);
const trGeo = new THREE.BufferGeometry();
trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
const tracerMesh = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
tracerMesh.frustumCulled = false; scene.add(tracerMesh);
let tracerI = 0, tracersActive = 0;
function tracer(ax, ay, az, bx, by, bz) {
  const i = tracerI++ % TR_N, o = i * 6;
  trPos[o] = ax; trPos[o + 1] = ay; trPos[o + 2] = az; trPos[o + 3] = bx; trPos[o + 4] = by; trPos[o + 5] = bz;
  trLife[i] = 0.07; tracersActive = 2;
}
const DEC_N = 120;
const decalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: TEX.decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), DEC_N);
decalMesh.count = 0; decalMesh.frustumCulled = false; scene.add(decalMesh);
let decalI = 0;
const _dummy = new THREE.Object3D(), _v = new THREE.Vector3();
function decal(x, y, z, nx, ny, nz) {
  _dummy.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
  _dummy.lookAt(_v.set(x + nx, y + ny, z + nz)); _dummy.rotateZ(Math.random() * 6.28); _dummy.scale.setScalar(rand(0.7, 1.2)); _dummy.updateMatrix();
  decalMesh.setMatrixAt(decalI % DEC_N, _dummy.matrix); decalI++;
  decalMesh.count = Math.min(decalI, DEC_N); decalMesh.instanceMatrix.needsUpdate = true;
}
const puffs = [];
for (let i = 0; i < 28; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSoft, transparent: true, depthWrite: false })); s.visible = false; scene.add(s);
  puffs.push({ s, life: 0, max: 0.3, size: 0.2 });
}
let puffI = 0;
function puff(x, y, z, color, size, life) {
  const p = puffs[puffI++ % puffs.length];
  p.s.position.set(x, y, z); p.s.material.color.set(color); p.life = p.max = life; p.size = size; p.s.visible = true;
}
const botFlashes = [];
for (let i = 0; i < 8; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFlash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.visible = false; scene.add(s);
  botFlashes.push({ s, life: 0 });
}
let botFlashI = 0;
const PT_N = 160, ptMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), PT_N);
ptMesh.frustumCulled = false; ptMesh.count = PT_N; scene.add(ptMesh);
const pts = []; let ptI = 0, ptActive = false;
const _zero = new THREE.Matrix4().makeScale(0, 0, 0), _pc = new THREE.Color();
for (let i = 0; i < PT_N; i++) { pts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, sx: 0.02, sz: 0.02, g: 0, r: 0 }); ptMesh.setMatrixAt(i, _zero); ptMesh.setColorAt(i, _pc.set(0xffffff)); }
function particle(x, y, z, vx, vy, vz, life, sx, sz, color) {
  const i = ptI++ % PT_N, p = pts[i];
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.sx = sx; p.sz = sz; p.g = groundH(x, z, 0.02); p.r = Math.random() * 6;
  ptMesh.setColorAt(i, _pc.set(color)); ptMesh.instanceColor.needsUpdate = true; ptActive = true;
}
function updateParticles(dt) {
  if (!ptActive) return;
  let any = false;
  for (let i = 0; i < PT_N; i++) {
    const p = pts[i]; if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { ptMesh.setMatrixAt(i, _zero); continue; }
    any = true;
    p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += dt * 14;
    if (p.y < p.g + 0.01) { p.y = p.g + 0.01; p.vy = Math.abs(p.vy) * 0.35; p.vx *= 0.5; p.vz *= 0.5; if (p.vy < 0.4) { p.vy = 0; p.r -= dt * 14; } }
    _dummy.position.set(p.x, p.y, p.z); _dummy.rotation.set(p.r, p.r * 0.7, 0); _dummy.scale.set(p.sx, p.sx, p.sz); _dummy.updateMatrix();
    ptMesh.setMatrixAt(i, _dummy.matrix);
  }
  ptMesh.instanceMatrix.needsUpdate = true; ptActive = any;
}
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: TEX.blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

// 第一人称武器
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
let vmGuns = {};
const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: texFlash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
flash.visible = false; vmRoot.add(flash);
// 开镜遮罩：用一个全屏着色器绘制，避免切换大面积 DOM 图层造成停顿
const scopeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { aspect: { value: 1 } }, transparent: true, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform float aspect; void main(){ vec2 p = (vUv - 0.5) * vec2(aspect, 1.0); float r = length(p); float a = smoothstep(0.338, 0.343, r); float l = (1.0 - step(0.0011, min(abs(p.x), abs(p.y)))) * 0.9; float v = smoothstep(0.2, 0.34, r) * 0.35; gl_FragColor = vec4(0.0, 0.0, 0.0, max(max(a, l), v)); }',
}));
scopeMesh.frustumCulled = false; scopeMesh.renderOrder = 10; scopeMesh.visible = false; vmScene.add(scopeMesh);
function buildViewModels(team) {
  for (const id in vmGuns) { vmRoot.remove(vmGuns[id]); vmGuns[id].children[1].geometry.dispose(); }
  vmGuns = {};
  for (const id of Object.keys(W)) { const g = viewModel(id, SLEEVE[team]); g.visible = false; vmRoot.add(g); vmGuns[id] = g; }
}
// 预编译着色器，避免首次开火/出现特效时卡顿
function warmUp() {
  const shown = [];
  for (const o of [...puffs.map((p) => p.s), ...botFlashes.map((p) => p.s), flash]) { if (!o.visible) { o.visible = true; shown.push(o); } }
  const vis = vmRoot.visible; vmRoot.visible = true;
  const dc = decalMesh.count; decalMesh.count = 1; scopeMesh.visible = true;
  renderer.compile(scene, camera); renderer.compile(vmScene, vmCam);
  if (POST) for (const m of [matBright, matBlur, matFinal]) { post.quad.material = m; renderer.compile(post.scene, post.cam); }
  decalMesh.count = dc; vmRoot.visible = vis; scopeMesh.visible = false;
  for (const o of shown) o.visible = false;
}

// ======================= 战斗单位 =======================
const fighters = [];
const aliveN = { blue: 0, red: 0 };
let player = null;
let time = 0, state = 'menu', freezeT = 0, roundT = 0, endT = 0, roundNo = 0;
const score = { blue: 0, red: 0 };
let diff = DIFF.normal;

function makeFighter(name, team, isPlayer) {
  const f = {
    name, team, isPlayer, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, crouch: false, eyeH: 1.6,
    hp: 100, armor: 0, alive: false, money: 800, kills: 0, deaths: 0,
    inv: [null, 'pistol', 'knife'], cur: 1, ammo: {}, nextFire: 0, reloadEnd: 0, lastShot: -9, heat: 0, deathT: 1, gy: 0, lastDeath: 0,
    rig: new Soldier(team, scene), blob: new THREE.Mesh(blobGeo, blobMat),
    // AI
    path: null, pi: 0, target: null, react: 0, thinkT: 0, strafeDir: 0, strafeT: 0, burst: 0, pauseT: 0, stuckT: 0, sx: 0, sz: 0, look: null, lastSeen: null, hearT: 0, aimPitch: 0, stanceT: 0, sneak: false, stepD: 0,
  };
  f.rig.root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  f.blob.frustumCulled = false; scene.add(f.blob);
  fighters.push(f);
  return f;
}
const curW = (f) => W[f.inv[f.cur]];
function giveWeapon(f, id) {
  const w = W[id]; f.inv[w.slot] = id;
  if (!w.melee) f.ammo[id] = { mag: w.mag, res: w.res };
}
function startReload(f) {
  const w = curW(f), a = f.ammo[w.id];
  if (w.melee || f.reloadEnd || a.mag >= w.mag) return;
  if (a.res <= 0) { if (f.isPlayer) return; a.res = w.mag * 2; }
  f.reloadEnd = time + w.reload;
  if (f.isPlayer) { sndReload(); scoped = false; }
}
function finishReload(f, w) { const a = f.ammo[w.id], n = Math.min(w.mag - a.mag, a.res); a.mag += n; a.res -= n; f.reloadEnd = 0; }
function moveFighter(f, dx, dz, dt) {
  if (!collides(f.x + dx, f.y, f.z, R_BODY)) f.x += dx; else f.vx = 0;
  if (!collides(f.x, f.y, f.z + dz, R_BODY)) f.z += dz; else f.vz = 0;
  f.vy -= GRAV * dt; f.y += f.vy * dt;
  const g = groundH(f.x, f.z, R_BODY);
  if (f.y <= g) { f.y = g; f.vy = 0; f.onGround = true; } else f.onGround = false;
}

// ---------- 命中检测（无临时对象）----------
let rfHead = false;
function rayFighter(ox, oy, oz, dx, dy, dz, f) {
  const hh = f.eyeH + 0.15;
  let tBody = Infinity, tHead = Infinity, t0 = 0, t1 = Infinity, ok = true, ta, tb, tmp;
  if (Math.abs(dx) < 1e-9) { if (ox < f.x - 0.3 || ox > f.x + 0.3) ok = false; }
  else { ta = (f.x - 0.3 - ox) / dx; tb = (f.x + 0.3 - ox) / dx; if (ta > tb) { tmp = ta; ta = tb; tb = tmp; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; }
  if (ok) {
    if (Math.abs(dy) < 1e-9) { if (oy < f.y || oy > f.y + hh - 0.34) ok = false; }
    else { ta = (f.y - oy) / dy; tb = (f.y + hh - 0.34 - oy) / dy; if (ta > tb) { tmp = ta; ta = tb; tb = tmp; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; }
  }
  if (ok) {
    if (Math.abs(dz) < 1e-9) { if (oz < f.z - 0.3 || oz > f.z + 0.3) ok = false; }
    else { ta = (f.z - 0.3 - oz) / dz; tb = (f.z + 0.3 - oz) / dz; if (ta > tb) { tmp = ta; ta = tb; tb = tmp; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; }
  }
  if (ok && t0 <= t1) tBody = t0;
  const cx = f.x - ox, cy = f.y + hh - 0.17 - oy, cz = f.z - oz, b = cx * dx + cy * dy + cz * dz;
  const disc = b * b - (cx * cx + cy * cy + cz * cz) + 0.2 * 0.2;
  if (disc >= 0 && b > 0) tHead = Math.max(0, b - Math.sqrt(disc));
  if (tHead === Infinity && tBody === Infinity) return -1;
  rfHead = tHead <= tBody + 0.35;
  return rfHead ? tHead : tBody;
}
const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _base = new THREE.Vector3(), _mz = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
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
  let mx, my, mz;
  if (f.isPlayer) { const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw); mx = ox + rx * 0.16 + dir.x * 0.7; my = oy - 0.13 + dir.y * 0.7; mz = oz + rz * 0.16 + dir.z * 0.7; }
  else { f.rig.muzzle(_mz); mx = _mz.x; my = _mz.y; mz = _mz.z; }
  _base.copy(dir);
  const n = w.pellets || 1;
  for (let i = 0; i < n; i++) {
    const d = spreadDir(_base, spread, false);
    const wh = raycastWorld(ox, oy, oz, d.x, d.y, d.z, 300);
    let tHit = wh ? wh.t : 300, victim = null, head = false;
    for (let k = 0; k < fighters.length; k++) {
      const e = fighters[k];
      if (e === f || !e.alive || e.team === f.team) continue;
      const t = rayFighter(ox, oy, oz, d.x, d.y, d.z, e);
      if (t >= 0 && t < tHit) { tHit = t; victim = e; head = rfHead; }
    }
    const ex = ox + d.x * tHit, ey = oy + d.y * tHit, ez = oz + d.z * tHit;
    if (victim) {
      puff(ex, ey, ez, 0x9a0c0c, 0.28, 0.28);
      hurt(victim, w.dmg * (head ? 3 : 1) * (1 - Math.min(0.3, tHit / 250)), f, head, w);
    } else if (wh) { decal(ex, ey, ez, wh.nx, wh.ny, wh.nz); if (i < 3) {
        puff(ex + wh.nx * 0.06, ey + wh.ny * 0.06, ez + wh.nz * 0.06, 0xcdbd9c, 0.3, 0.35);
        for (let k = 0; k < 3; k++) particle(ex + wh.nx * 0.03, ey + wh.ny * 0.03, ez + wh.nz * 0.03, wh.nx * rand(0.5, 2.5) + rand(-1.2, 1.2), wh.ny * rand(0.5, 2.5) + rand(0.2, 2.2), wh.nz * rand(0.5, 2.5) + rand(-1.2, 1.2), rand(0.35, 0.7), rand(0.012, 0.03), rand(0.012, 0.03), 0x8a7a62);
      } }
    // 子弹从玩家耳边擦过的呼啸声
    if (!f.isPlayer && player.alive && victim !== player && f.team !== player.team && time >= whizT) {
      const px = player.x - ox, py = player.y + player.eyeH - oy, pz = player.z - oz, tt = px * d.x + py * d.y + pz * d.z;
      if (tt > 2 && tt < tHit) { const qx = px - d.x * tt, qy = py - d.y * tt, qz = pz - d.z * tt; if (qx * qx + qy * qy + qz * qz < 2.2) { whizT = time + 0.12; whizSound(clamp(-(qx * Math.cos(player.yaw) - qz * Math.sin(player.yaw)), -1, 1)); } }
    }
    if (i < 4) tracer(mx, my, mz, ex, ey, ez);
  }
  { // 抛壳
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw), sh = w.pellets ? 0xa02a20 : 0xc9a24a;
    particle(mx - dir.x * 0.45 + rx * 0.05, my + 0.03, mz - dir.z * 0.45 + rz * 0.05, rx * rand(1.2, 2.2) + f.vx, rand(1.6, 2.6), rz * rand(1.2, 2.2) + f.vz, 1.6, w.pellets ? 0.016 : 0.009, w.pellets ? 0.05 : 0.026, sh);
  }
  if (f.isPlayer) shotSound(w.id, 0, 0);
  else {
    const dx = f.x - camera.position.x, dz = f.z - camera.position.z, dist = Math.hypot(dx, dz) || 1;
    shotSound(w.id, dist, clamp((dx * Math.cos(camera.rotation.y) - dz * Math.sin(camera.rotation.y)) / dist, -1, 1) * 0.8);
    const bf = botFlashes[botFlashI++ % botFlashes.length];
    bf.s.position.set(mx, my, mz); bf.s.scale.setScalar(rand(0.35, 0.55) * (w.pellets ? 1.5 : 1)); bf.s.material.rotation = Math.random() * 6.28; bf.life = 0.05; bf.s.visible = true;
  }
  // 枪声惊动敌方电脑（每个电脑有冷却，避免混战时反复寻路）
  for (let k = 0; k < fighters.length; k++) {
    const b = fighters[k];
    if (b.isPlayer || !b.alive || b.team === f.team || b.target || time < b.hearT) continue;
    if (Math.abs(b.x - f.x) + Math.abs(b.z - f.z) < 55) {
      b.hearT = time + rand(1.5, 2.5);
      if (Math.random() < 0.6) { b.look = { x: f.x, z: f.z, until: time + 1.5 }; goTo(b, f.x, f.z, Math.random() < 0.12); }
    }
  }
}
function hurt(v, dmg, att, head, w) {
  if (state !== 'live' && state !== 'roundEnd') return;
  if (v.armor > 0 && !w.melee) { const ab = dmg * 0.45; v.armor = Math.max(0, Math.round(v.armor - ab * 0.6)); dmg -= ab; }
  v.hp -= Math.max(1, Math.round(dmg));
  if (v === player) {
    dmgFlash = 1; sndHurt(); punchP += 0.03;
    const dx = att.x - v.x, dz = att.z - v.z, cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
    $('dir').style.transform = `rotate(${Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy).toFixed(2)}rad)`; dirT = 1.2;
  }
  if (att === player) { hitT = 0.18; hitHS = head; sndHit(head); }
  if (v.hp <= 0) return kill(v, att, head, w);
  if (!v.isPlayer && !v.target && time >= v.hearT - 1) { v.hearT = time + 1.5; v.look = { x: att.x, z: att.z, until: time + 2 }; goTo(v, att.x, att.z); }
}
function kill(v, att, head, w) {
  v.hp = 0; v.alive = false; v.deaths++; v.deathT = 0; v.target = null; v.reloadEnd = 0; v.lastDeath = time; aliveN[v.team]--;
  att.kills++; att.money = Math.min(16000, att.money + 300);
  if (att === player) { kcT = 1.6; setText('kc', head ? '✦ 爆头击杀  +$300' : '击杀  +$300'); sndKill(head); }
  feed(att, v, w, head);
  const rig = v.rig;
  if (v === player) {
    scoped = false; buyOpen = false; specTarget = null;
    rig.root.visible = true; rig.setGun(v.inv[0] || 'pistol');
    rig.aim = 1; rig.cr = v.crouch ? 1 : 0; rig.update(0.016, v.x, v.y, v.z, v.yaw, 0, 0, 0, true, v.pitch, v.crouch, false, false);
  }
  // 倒地方向：正面中弹向后仰，背后中弹向前扑；并检查该方向是否有空间
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  let dir = (att.x - v.x) * fx + (att.z - v.z) * fz >= 0 ? 1 : -1;
  const sp = (d) => { const h = raycastWorld(v.x, v.y + 0.4, v.z, -fx * d, 0, -fz * d, 2); return h ? h.t : 2; };
  let space = sp(dir);
  if (space < 1.65) { const o = sp(-dir); if (o > space) { dir = -dir; space = o; } }
  v.gy = groundH(v.x, v.z, 0.1); v.vy = Math.min(v.vy, 0);
  rig.startDeath(dir, space, v.gy);
  // 手中的枪掉在地上，可被拾取
  const did = v.inv[0] || 'pistol';
  items.push({ id: did, mag: v.ammo[did].mag, res: v.ammo[did].res, obj: rig.holder, loose: false });
}

// ======================= 地面武器（拾取 / 丢弃）=======================
const items = [];
let nearItem = null, itemT = 0;
function clearItems() { for (const it of items) { if (it.loose) scene.remove(it.obj); else it.obj.visible = true; } items.length = 0; nearItem = null; }
function dropLoose(f) {
  const id = f.inv[0]; if (!id) return;
  const m = new THREE.Mesh(gunGeo(id), gunMat), fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
  let x = f.x + fx * 0.9, z = f.z + fz * 0.9;
  if (collides(x, f.y, z, 0.3)) { x = f.x; z = f.z; }
  m.position.set(x, groundH(x, z, 0.05) + 0.024, z); m.rotation.set(0, Math.random() * 6.28, Math.PI / 2, 'YXZ');
  scene.add(m);
  items.push({ id, mag: f.ammo[id].mag, res: f.ammo[id].res, obj: m, loose: true, noAuto: f.isPlayer });
  f.inv[0] = null;
}
function takeItem(f, it) {
  const w = W[it.id], i = items.indexOf(it); if (i < 0) return;
  items.splice(i, 1);
  if (it.loose) scene.remove(it.obj); else it.obj.visible = false;
  if (w.slot === 0) {
    if (f.inv[0]) dropLoose(f);
    f.inv[0] = it.id; f.ammo[it.id] = { mag: it.mag, res: it.res };
    if (f.isPlayer) { const ls = f.cur === 0 ? lastSlot : f.cur; f.cur = -1; switchTo(0); lastSlot = ls; }
    else { f.cur = 0; f.reloadEnd = 0; f.rig.setGun(it.id); }
  } else { const a = f.ammo.pistol; a.res = Math.min(W.pistol.res, a.res + it.mag + it.res); }
  if (f.isPlayer) beep(650, 0.06, 0.14, 'triangle');
}
function itemNear(f, it, r) { const o = it.obj.position; return Math.abs(o.x - f.x) < r && Math.abs(o.z - f.z) < r && Math.abs(o.y - f.y) < 1.6; }
function updateItems(dt) {
  itemT -= dt; if (itemT > 0) return; itemT = 0.1;
  nearItem = null;
  const p = player;
  if (p.alive) {
    let bd = 1e9;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; if (!itemNear(p, it, 1.5)) { it.noAuto = false; continue; }
      const w = W[it.id];
      if (w.slot === 0 && !p.inv[0] && !it.noAuto) { takeItem(p, it); continue; }           // 没有主武器：自动拾取
      if (w.slot === 1) { if (p.ammo.pistol.res < W.pistol.res) takeItem(p, it); continue; }   // 手枪：补充弹药
      const d = Math.hypot(it.obj.position.x - p.x, it.obj.position.z - p.z);
      if (d < bd) { bd = d; nearItem = it; }
    }
  }
  setText('hint', nearItem ? `按 E ${p.inv[0] ? '更换为' : '拾取'} ${W[nearItem.id].name}` : '');
  // 只有手枪的电脑路过时会捡起主武器
  for (let k = 0; k < fighters.length; k++) {
    const b = fighters[k]; if (b.isPlayer || !b.alive || b.inv[0]) continue;
    for (let i = 0; i < items.length; i++) if (W[items[i].id].slot === 0 && itemNear(b, items[i], 1.3)) { takeItem(b, items[i]); break; }
  }
}

// ======================= 玩家输入 =======================
const keys = {};
let mouseDown = false, firePressed = false, locked = false, paused = false, scoped = false;
let sens = 1, lastSlot = 1, buyOpen = false, boardOpen = false;
let punchP = 0, punchY = 0, vmKick = 0, vmSwitch = 0, bob = 0, flashT = 0, dmgFlash = 0, hitT = 0, hitHS = false;
let specTarget = null, dirT = 0, kcT = 0, whizT = 0, rmb = false, ads = 0, swayX = 0, swayY = 0, vmDip = 0, wasGround = true;
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
  if (!canBuy()) return toast('购买时间已过');
  const price = item.w ? W[item.w].price : item.price;
  const name = item.w ? W[item.w].name : item.name;
  const broke = () => { sndClick(); toast('资金不足'); };
  if (item.w) {
    if (player.inv[0] === item.w) return toast('已持有该武器');
    if (player.money < price) return broke();
    if (player.inv[0]) dropLoose(player);            // 原主武器丢在脚下
    giveWeapon(player, item.w); const ls = player.cur === 0 ? lastSlot : player.cur; player.cur = -1; switchTo(0); lastSlot = ls;
  } else if (item.armor) {
    if (player.armor >= 100) return toast('护甲已满');
    if (player.money < price) return broke();
    player.armor = 100;
  } else if (item.ammo) {
    // 补满所有枪的弹匣和备弹（以前只看备弹，弹匣打空但备弹满时买不了）
    let need = false;
    for (const id of player.inv) if (id && !W[id].melee && (player.ammo[id].res < W[id].res || player.ammo[id].mag < W[id].mag)) need = true;
    if (!need) return toast('弹药已满');
    if (player.money < price) return broke();
    for (const id of player.inv) if (id && !W[id].melee) { player.ammo[id].res = W[id].res; player.ammo[id].mag = W[id].mag; }
    player.reloadEnd = 0;
  }
  player.money -= price; beep(900, 0.08, 0.15, 'triangle');
  toast('已购买 ' + name + '  -$' + price);
}
function toast(t) { hudCache.kc = null; setText('kc', t); kcT = 1.8; }
addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); fpsShow = !fpsShow; $('fps').classList.toggle('hidden', !fpsShow); }
  if (!inGame()) return;
  if (['Tab', 'Space', 'ControlLeft', 'KeyC'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Tab') boardOpen = true;
  if (paused || !player.alive) return;
  if (e.code === 'KeyB') { if (!buyOpen && !canBuy()) toast('只能在回合开始阶段购买'); buyOpen = canBuy() && !buyOpen; }
  else if (buyOpen && /^(Digit|Numpad)[1-6]$/.test(e.code)) buy(BUY[+e.code.slice(-1) - 1]);
  else if (/^Digit[1-3]$/.test(e.code)) switchTo(+e.code.slice(5) - 1);
  else if (e.code === 'KeyQ') switchTo(lastSlot);
  else if (e.code === 'KeyR') startReload(player);
  else if (e.code === 'KeyE') { if (nearItem) takeItem(player, nearItem); }
  else if (e.code === 'KeyG') { if (player.inv[0]) { dropLoose(player); if (player.cur === 0) { player.cur = -1; switchTo(1); } lastSlot = 1; } }
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') boardOpen = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (!locked || paused || !inGame() || !player.alive) return;
  const s = 0.0022 * sens * (scoped ? 0.28 : 1 - 0.3 * ads);
  swayX = clamp(swayX + e.movementX * 0.00012, -0.05, 0.05); swayY = clamp(swayY + e.movementY * 0.00012, -0.04, 0.04);
  player.yaw -= e.movementX * s;
  player.pitch = clamp(player.pitch - e.movementY * s, -1.5, 1.5);
});
addEventListener('mousedown', (e) => {
  if (!inGame() || paused || !locked) return;
  if (e.button === 0) { mouseDown = true; firePressed = true; if (!player.alive) cycleSpec(); }
  if (e.button === 2) { rmb = true; if (player.alive && curW(player).scope && !player.reloadEnd) scoped = !scoped; }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmb = false; });
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
  const start = specTarget ? fighters.indexOf(specTarget) : -1;
  for (let i = 1; i <= fighters.length; i++) {
    const f = fighters[(start + i + fighters.length) % fighters.length];
    if (f.alive && f.team === player.team) { specTarget = f; return; }
  }
  specTarget = null;
}

// ======================= 玩家更新 =======================
const _fwd = new THREE.Vector3();
function updatePlayer(dt) {
  const p = player, w = curW(p), act = state === 'live' || state === 'roundEnd';
  let ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  if (!act) ix = iz = 0;
  const il = Math.hypot(ix, iz) || 1; ix /= il; iz /= il;
  p.crouch = !!(keys.KeyC || keys.ControlLeft);
  // 机瞄：按住右键（狙击枪为开镜）
  const wantAds = rmb && !w.scope && !w.melee && !p.reloadEnd && !buyOpen && vmSwitch <= 0;
  ads += ((wantAds ? 1 : 0) - ads) * (1 - Math.exp(-16 * dt)); if (ads < 0.002) ads = 0;
  const sp = RUN * w.speed * (p.crouch ? 0.42 : keys.ShiftLeft ? 0.5 : 1) * (scoped ? 0.5 : 1) * (1 - 0.32 * ads);
  const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
  const wx = (ix * cs + iz * sn) * sp, wz = (-ix * sn + iz * cs) * sp;
  const k = 1 - Math.exp(-(p.onGround ? 14 : 2.5) * dt);
  p.vx += (wx - p.vx) * k; p.vz += (wz - p.vz) * k;
  if (keys.Space && p.onGround && act) { p.vy = JUMP_V; p.onGround = false; }
  const fallV = p.vy;
  moveFighter(p, p.vx * dt, p.vz * dt, dt);
  if (p.onGround && !wasGround && fallV < -3) { vmDip = Math.min(1, -fallV / 9); stepSound(0, 0); }   // 落地下沉
  wasGround = p.onGround;
  p.eyeH += ((p.crouch ? 1.05 : 1.6) - p.eyeH) * (1 - Math.exp(-14 * dt));
  const hs = Math.hypot(p.vx, p.vz);
  if (p.onGround) { bob += hs * dt * 1.9; if (hs > 3.5 && !p.crouch && (p.stepD += hs * dt) > 2.3) { p.stepD = 0; stepSound(0, 0); } }

  if (p.reloadEnd && time >= p.reloadEnd) finishReload(p, w);
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
        const t = rayFighter(p.x, p.y + p.eyeH, p.z, _fwd.x, _fwd.y, _fwd.z, e);
        if (t >= 0 && t < bt) { bt = t; best = e; }
      }
      if (best) { puff(best.x, best.y + 1.2, best.z, 0x9a0c0c, 0.3, 0.3); hurt(best, w.dmg, p, false, w); }
    } else {
      const a = p.ammo[w.id];
      if (a.mag > 0) {
        a.mag--; p.nextFire = time + w.rate;
        let s = (w.scope && !scoped ? w.unscoped : w.spread * (1 - 0.5 * ads)) + p.heat * w.heat * (1 - 0.3 * ads) + (hs / RUN) * w.move + (p.onGround ? 0 : 0.07);
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
function goTo(b, x, z, sneak = false) {
  let gx = clamp(Math.floor(x / CELL), 0, GW - 1), gz = clamp(Math.floor(z / CELL), 0, GH - 1);
  if (!walkable(gx, gz)) {
    let found = false;
    for (let r = 1; r < 4 && !found; r++)
      for (let dz = -r; dz <= r && !found; dz++)
        for (let dx = -r; dx <= r && !found; dx++) if (walkable(gx + dx, gz + dz)) { gx += dx; gz += dz; found = true; }
    if (!found) return;
  }
  const p = findPath(Math.floor(b.x / CELL), Math.floor(b.z / CELL), gx, gz, 0.6, true);
  if (p) { b.sneak = sneak; b.sneakC = sneak && Math.random() < 0.3; b.path = p; b.pi = 1; b.stuckT = 0; b.sx = b.x; b.sz = b.z; }
}
function pickGoal(b) {
  // 残局或回合后半段：主动搜索敌人的大致位置，避免双方互相错过
  const foe = b.team === 'blue' ? 'red' : 'blue';
  if (!b.inv[0]) {   // 只有手枪：优先去捡附近地上的主武器
    for (const it of items) if (W[it.id].slot === 0 && Math.abs(it.obj.position.x - b.x) + Math.abs(it.obj.position.z - b.z) < 30) { goTo(b, it.obj.position.x, it.obj.position.z); if (b.path) return; }
  }
  if ((aliveN[foe] <= 2 || roundT < ROUND_TIME - 30) && Math.random() < 0.75) {
    let best = null, bd = 1e9;
    for (const e of fighters) { if (!e.alive || e.team !== foe) continue; const d = Math.abs(e.x - b.x) + Math.abs(e.z - b.z) + Math.random() * 20; if (d < bd) { bd = d; best = e; } }
    if (best) { goTo(b, best.x + rand(-4, 4), best.z + rand(-4, 4), bd < 16 && Math.random() < 0.3); if (b.path && b.path.length > 9) b.path.length = 9; return; }
  }
  const r = Math.random();
  if (r < 0.5) { const s = spawns[b.team === 'blue' ? 'red' : 'blue'][(Math.random() * 6) | 0]; goTo(b, s.x, s.z); }
  else if (r < 0.7) goTo(b, GW * CELL / 2 + rand(-8, 8), GH * CELL / 2 + rand(-8, 8));
  else goTo(b, rand(2, GW * CELL - 2), rand(2, GH * CELL - 2), Math.random() < 0.06);
}
function canSee(a, b) {
  const ox = a.x, oy = a.y + a.eyeH, oz = a.z;
  for (let i = 0; i < 2; i++) {
    const dx = b.x - ox, dy = b.y + b.eyeH * (i ? 0.55 : 1) - oy, dz = b.z - oz, d = Math.hypot(dx, dy, dz);
    if (d < 0.01 || !raycastWorld(ox, oy, oz, dx / d, dy / d, dz / d, d)) return true;
  }
  return false;
}
const _aim = new THREE.Vector3();
function updateBot(b, dt) {
  const w = curW(b), act = state === 'live' || state === 'roundEnd';
  if (b.reloadEnd && time >= b.reloadEnd) finishReload(b, w);
  b.eyeH += ((b.crouch ? 1.05 : 1.6) - b.eyeH) * (1 - Math.exp(-12 * dt));
  if (!act) { b.vx = b.vz = 0; b.crouch = false; moveFighter(b, 0, 0, dt); return; }

  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = rand(0.1, 0.2);
    let best = null, bd = 80;
    for (let k = 0; k < fighters.length; k++) {
      const e = fighters[k];
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
    } else if (b.target) { b.target = null; b.crouch = false; if (b.lastSeen) goTo(b, b.lastSeen.x, b.lastSeen.z, Math.random() < 0.2); }
    else if (time >= b.hearT) {   // 听脚步：附近有敌人在跑动（静步/蹲行听不到）
      for (let k = 0; k < fighters.length; k++) {
        const e = fighters[k];
        if (!e.alive || e.team === b.team || e.crouch || !e.onGround) continue;
        if (Math.abs(e.x - b.x) + Math.abs(e.z - b.z) < 11 && e.vx * e.vx + e.vz * e.vz > 12) { b.hearT = time + 2; b.look = { x: e.x, z: e.z, until: time + 1.8 }; goTo(b, e.x, e.z, Math.random() < 0.5); break; }
      }
    }
  }

  let mx = 0, mz = 0;
  const speed = RUN * 0.92 * w.speed;
  if (b.target && b.target.alive) {
    const t = b.target, dx = t.x - b.x, dz = t.z - b.z, dist = Math.hypot(dx, dz);
    const dy = t.y + t.eyeH * 0.72 - (b.y + b.eyeH);
    const want = Math.atan2(-dx, -dz), da = angDiff(want, b.yaw);
    b.yaw += clamp(da, -diff.turn * dt, diff.turn * dt);
    b.aimPitch = Math.atan2(dy, dist);
    b.react -= dt;
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeDir = ((Math.random() * 3) | 0) - 1; b.strafeT = rand(0.4, 1.1);
      if (dist < 10 && b.onGround && !b.crouch && Math.random() < 0.18) { b.vy = JUMP_V; b.onGround = false; }   // 近战时偶尔跳跃躲闪
    }
    // 中远距离交火时不时蹲下射击（更稳、目标更小）
    b.stanceT -= dt;
    if (b.stanceT <= 0) {
      if (!b.crouch && dist > 9 && b.onGround && Math.random() < 0.45) { b.crouch = true; b.stanceT = rand(1.0, 2.6); }
      else { b.crouch = false; b.stanceT = rand(1.2, 3.5); }
    }
    if (dist < 6) b.crouch = false;
    const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    const sk = b.crouch ? 0.18 : 0.55;
    mx = rx * b.strafeDir * speed * sk; mz = rz * b.strafeDir * speed * sk;
    const pref = w.id === 'shotgun' ? 7 : 28;
    if (dist > pref && !b.crouch) { mx += dx / dist * speed * 0.6; mz += dz / dist * speed * 0.6; }
    const a = b.ammo[w.id];
    if (a.mag <= 0) startReload(b);
    else if (b.react <= 0 && Math.abs(da) < 0.3 && !b.reloadEnd && time >= b.nextFire) {
      b.pauseT -= dt;
      if (b.burst <= 0 && b.pauseT <= 0) b.burst = w.auto ? 2 + ((Math.random() * 5) | 0) : 1;
      if (b.burst > 0) {
        b.burst--; a.mag--;
        b.nextFire = time + (w.auto ? w.rate : w.rate * rand(1.6, 3));
        if (b.burst === 0) b.pauseT = w.auto ? rand(0.25, 0.6) : 0;
        _aim.set(dx, dy, dz).normalize();
        const err = diff.err * (1 + Math.hypot(t.vx, t.vz) * 0.1) * (w.id === 'sniper' ? 0.5 : 1) * (b.crouch ? 0.75 : 1) * (b.onGround ? 1 : 2);
        _aim.copy(spreadDir(_aim, err, true));
        fireWeapon(b, _aim, w, w.spread);
      }
    }
  } else {
    b.aimPitch = 0; b.crouch = !!(b.sneak && b.sneakC && b.onGround);   // 部分静步改为蹲行
    if (!b.reloadEnd && !w.melee && b.ammo[w.id].mag < w.mag * 0.4) startReload(b);
    if (!b.path || b.pi >= b.path.length) pickGoal(b);
    if (b.path && b.pi < b.path.length) {
      const wp = b.path[b.pi], dx = wp.x - b.x, dz = wp.z - b.z, d = Math.hypot(dx, dz);
      if (d < 0.45) b.pi++;
      else {
        const sp2 = b.crouch ? speed * 0.42 : b.sneak ? speed * 0.5 : speed;   // 默认奔跑；静步 / 蹲行接近
        mx = dx / d * sp2; mz = dz / d * sp2;
        // 前方是矮箱：起跳
        if (b.onGround && cellH(Math.floor(wp.x / CELL), Math.floor(wp.z / CELL)) > b.y + 0.1 && d < 1.9) { b.vy = JUMP_V; b.onGround = false; }
        let want = Math.atan2(-dx, -dz);
        if (b.look && time < b.look.until) want = Math.atan2(-(b.look.x - b.x), -(b.look.z - b.z));
        b.yaw += clamp(angDiff(want, b.yaw), -6 * dt, 6 * dt);
      }
      b.stuckT += dt;
      if (b.stuckT > 1.2) {
        if (Math.hypot(b.x - b.sx, b.z - b.sz) < 0.5) { b.path = null; if (b.onGround && Math.random() < 0.5) { b.vy = JUMP_V; b.onGround = false; } }
        b.stuckT = 0; b.sx = b.x; b.sz = b.z;
      }
    }
  }
  for (let k = 0; k < fighters.length; k++) {
    const o = fighters[k];
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
  b.rig.setGun(b.inv[b.cur]);
}

// ======================= 回合流程 =======================
let msgUntil = 0;
function setMsg(t, sub = '', dur = 3) { $('msg').textContent = t; $('sub').textContent = sub; msgUntil = time + dur; hudCache.msg = hudCache.sub = null; }
function startRound() {
  roundNo++; state = 'freeze'; freezeT = FREEZE_TIME; roundT = ROUND_TIME;
  for (const team of ['blue', 'red']) {
    const sp = spawns[team].slice().sort(() => Math.random() - 0.5);
    let i = 0;
    for (const f of fighters) {
      if (f.team !== team) continue;
      if (!f.alive) { f.inv[0] = null; f.armor = 0; f.cur = 1; giveWeapon(f, 'pistol'); }
      Object.assign(f, {
        x: sp[i].x, y: 0, z: sp[i].z, vx: 0, vz: 0, vy: 0, yaw: team === 'blue' ? -Math.PI / 2 : Math.PI / 2, pitch: 0,
        hp: 100, alive: true, sneak: false, stanceT: 0, reloadEnd: 0, nextFire: 0, heat: 0, target: null, path: null, look: null, lastSeen: null, crouch: false, eyeH: 1.6, deathT: 1, hearT: 0, aimPitch: 0,
      });
      i++;
      f.rig.reset(); f.rig.root.visible = !f.isPlayer;
      if (!f.isPlayer) botBuy(f);
    }
    aliveN[team] = i;
  }
  decalI = 0; decalMesh.count = 0; clearItems();
  scoped = false; buyOpen = false; specTarget = null; punchP = punchY = 0; ads = 0; rmb = false;
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
    const nb = aliveN.blue, nr = aliveN.red;
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
  clearItems();
  for (const f of fighters) { f.rig.dispose(); scene.remove(f.blob); }
  fighters.length = 0; score.blue = score.red = 0; roundNo = 0; time = 0; msgUntil = 0;
  diff = DIFF[diffKey];
  $('feed').innerHTML = ''; feedItems.length = 0;
  const names = NAMES.slice().sort(() => Math.random() - 0.5);
  player = makeFighter('你', team, true);
  for (const t of ['blue', 'red'])
    for (let i = t === team ? 1 : 0; i < TEAM_SIZE; i++) makeFighter(names.pop(), t, false);
  buildViewModels(team);
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  lastSlot = 1;
  startRound();
  warmUp();
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
let seenT = 0, radarT = 0; const seen = new Set();
function drawRadar() {
  rg.clearRect(0, 0, radar.width, radar.height); rg.drawImage(radarBg, 0, 0);
  const viewer = player.alive ? player : specTarget;
  if (time >= seenT) {
    seenT = time + 0.25; seen.clear();
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
function setHidden(id, h) { const k = id + '#h'; if (hudCache[k] !== h) { hudCache[k] = h; $(id).classList.toggle('hidden', h); } }
function setStyle(id, prop, v) { const k = id + prop; if (hudCache[k] !== v) { hudCache[k] = v; $(id).style.setProperty(prop, v); } }
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
let panelT = 0, panelKey = '';
function updateHUD(dt) {
  const p = player, w = curW(p);
  setText('hp', Math.max(0, p.hp)); setText('armor', p.armor); setText('money', '$' + p.money);
  setText('wname', p.reloadEnd ? w.name + '　换弹中…' : w.name);
  if (w.melee) { setText('mag', '—'); setText('res', ''); }
  else { setText('mag', p.ammo[w.id].mag); setText('res', '/ ' + p.ammo[w.id].res); }
  const tt = Math.max(0, Math.ceil(state === 'freeze' ? freezeT : roundT));
  if (hudCache.tt !== tt) { hudCache.tt = tt; $('timer').textContent = `${(tt / 60) | 0}:${String(tt % 60).padStart(2, '0')}`; }
  setText('scoreBlue', score.blue); setText('scoreRed', score.red);
  setText('aliveBlue', aliveN.blue); setText('aliveRed', aliveN.red);
  if (time > msgUntil) { setText('msg', ''); setText('sub', p.alive ? '' : specTarget ? `观战中：${specTarget.name}（点击切换）` : '你已阵亡'); }
  while (feedItems.length && feedItems[0].until < time) feedItems.shift().d.remove();
  const showCross = p.alive && !scoped && !w.scope && ads < 0.5;
  setHidden('cross', !showCross);
  if (showCross) setStyle('cross', '--gap', Math.round(4 + (w.melee ? 0 : (w.spread + p.heat * w.heat + Math.hypot(p.vx, p.vz) / RUN * w.move + (p.onGround ? 0 : 0.07)) * 420)) + 'px');
  hitT -= dt;
  const hc = hitT > 0 ? (hitHS ? 'on hs' : 'on') : '';
  if (hudCache.hit !== hc) { hudCache.hit = hc; $('hit').className = hc; }
  dmgFlash = Math.max(0, dmgFlash - dt * 1.8);
  const hv = Math.max(dmgFlash, p.alive && p.hp < 35 ? (35 - p.hp) / 35 * (0.4 + 0.12 * Math.sin(time * 6)) : 0);   // 低血量时持续红晕
  if (POST) matFinal.uniforms.hurt.value = hv; else setStyle('dmg', 'opacity', hv.toFixed(1));
  if (dirT > 0) { dirT -= dt; setStyle('dir', 'opacity', Math.max(0, Math.min(1, dirT * 2)).toFixed(2)); }
  if (kcT > 0) { kcT -= dt; setStyle('kc', 'opacity', Math.max(0, Math.min(1, kcT * 2.5)).toFixed(2)); }
  if (buyOpen && !canBuy()) buyOpen = false;
  setHidden('buy', !buyOpen); setHidden('board', !boardOpen);
  panelT -= dt;
  if (panelT <= 0) {
    panelT = 0.2;
    if (buyOpen) { const k = 'b' + p.money; if (k !== panelKey) { panelKey = k; $('buy').innerHTML = renderBuy(); } }
    else panelKey = '';
    if (boardOpen) $('board').innerHTML = renderBoard();
  }
  radarT -= dt;
  if (radarT <= 0) { radarT = 0.066; drawRadar(); }
}

// ======================= 画面更新 =======================
function updateMeshes(dt) {
  updateParticles(dt);
  for (let i = 0; i < fighters.length; i++) {
    const f = fighters[i], rig = f.rig;
    if (f.alive) {
      f.blob.visible = !f.isPlayer;
      if (f.isPlayer) continue;
      const sp = Math.hypot(f.vx, f.vz);
      rig.update(dt, f.x, f.y, f.z, f.yaw, f.vx, f.vz, f.vy, !!f.target || time - f.lastShot < 1.2, f.aimPitch, f.crouch, !f.onGround, f.sneak && !f.target);
      if (sp > 3.5 && f.onGround && !f.crouch && (f.stepD += sp * dt) > 2.3) {   // 跑动脚步声
        f.stepD = 0;
        const dx = f.x - camera.position.x, dz = f.z - camera.position.z, dist = Math.hypot(dx, dz) || 1;
        if (dist < 22) stepSound(dist, clamp((dx * Math.cos(camera.rotation.y) - dz * Math.sin(camera.rotation.y)) / dist, -1, 1) * 0.8);
      }
      f.blob.position.set(f.x, groundH(f.x, f.z, 0.1) + 0.025, f.z); f.blob.rotation.y = 0; f.blob.scale.set(1.1, 1, 1.1);
    } else if (rig.death && (f.deathT < 1 || !rig.drop.done)) {
      f.deathT = Math.min(1, f.deathT + dt / 0.85);
      f.vy -= GRAV * dt; f.y = Math.max(f.gy, f.y + f.vy * dt);
      rig.updateDeath(f.deathT, dt, f.y);
      const D = rig.death, k = D.dir * (D.slide + 0.35) * f.deathT * f.deathT;
      f.blob.visible = true;
      f.blob.position.set(f.x + Math.sin(f.yaw) * k, f.gy + 0.025, f.z + Math.cos(f.yaw) * k);
      f.blob.rotation.y = f.yaw; f.blob.scale.set(1.1 + 0.2 * f.deathT, 1, 1.1 + 1.2 * f.deathT);
    }
  }
  if (tracersActive > 0) {
    let any = false;
    for (let i = 0; i < TR_N; i++) {
      let l = trLife[i]; if (l > 0) { l = trLife[i] = l - dt; any = any || l > 0; }
      const c = l > 0 ? l / 0.07 : 0, o = i * 6;
      trCol[o] = trCol[o + 3] = c; trCol[o + 1] = trCol[o + 4] = c * 0.9; trCol[o + 2] = trCol[o + 5] = c * 0.6;
    }
    trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
    if (!any) tracersActive--;
  }
  tracerMesh.visible = tracersActive > 0;
  for (let i = 0; i < puffs.length; i++) {
    const p = puffs[i]; if (p.life <= 0) continue;
    p.life -= dt; const k = 1 - p.life / p.max;
    p.s.scale.setScalar(p.size * (0.5 + k * 1.8)); p.s.material.opacity = (1 - k) * 0.8; p.s.position.y += dt * 0.25;
    if (p.life <= 0) p.s.visible = false;
  }
  for (let i = 0; i < botFlashes.length; i++) { const b = botFlashes[i]; if (b.life > 0 && (b.life -= dt) <= 0) b.s.visible = false; }
}
function updateCamera(dt) {
  const p = player;
  let fov = 75;
  if (p.alive) {
    camera.position.set(p.x, p.y + p.eyeH, p.z);
    camera.rotation.set(clamp(p.pitch + punchP, -1.55, 1.55), p.yaw + punchY, 0);
    if (scoped) fov = 18; else fov = 75 - 20 * ads;
    camera.position.y -= vmDip * 0.07;
  } else {
    if (specTarget && !specTarget.alive) specTarget = null;
    if (!specTarget && time - p.lastDeath > 2.5) cycleSpec();
    const t = specTarget || p, ey = t.y + (specTarget ? 1.7 : 0.7);
    const yaw = t.yaw, bx = Math.sin(yaw), bz = Math.cos(yaw), len = Math.hypot(bx * 3.2, 1.3, bz * 3.2);
    const hit = raycastWorld(t.x, ey, t.z, bx * 3.2 / len, 1.3 / len, bz * 3.2 / len, len);
    const d = (hit ? Math.max(0.3, hit.t - 0.25) : len) / len;
    camera.position.set(t.x + bx * 3.2 * d, ey + 1.3 * d, t.z + bz * 3.2 * d);
    camera.lookAt(t.x, ey, t.z);
  }
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-22 * dt)); camera.updateProjectionMatrix(); }

  scopeMesh.visible = scoped; if (scoped) scopeMesh.material.uniforms.aspect.value = camera.aspect;
  const show = p.alive && !scoped;
  vmRoot.visible = show;
  if (show) {
    const id = p.inv[p.cur];
    for (const k in vmGuns) vmGuns[k].visible = k === id;
    vmKick = Math.max(0, vmKick - dt * 9); vmSwitch = Math.max(0, vmSwitch - dt * 4);
    const hs = Math.hypot(p.vx, p.vz) / RUN;
    let rl = 0;
    if (p.reloadEnd) { const w = W[id], k = 1 - (p.reloadEnd - time) / w.reload; rl = Math.sin(Math.min(1, k) * Math.PI); }
    const melee = id === 'knife', long = GUN[id].long;
const sd = Math.exp(-9 * dt); swayX *= sd; swayY *= sd; vmDip = Math.max(0, vmDip - dt * 4.5);
    const k = ads * ads * (3 - 2 * ads), bk = 1 - 0.8 * k, G = GUN[id];
    const hx = long ? 0.15 : melee ? 0.17 : 0.13, hy = long ? -0.16 : melee ? -0.17 : -0.12, hz = long ? -0.45 : -0.5;
    const ax = 0, ay = -(G.sight || 0.08) - 0.004, az = long ? -0.42 : -0.45;          // 机瞄：照门对准屏幕中心
    vmRoot.position.set(hx + (ax - hx) * k + Math.cos(bob) * 0.006 * hs * bk - swayX * 0.5 * bk, hy + (ay - hy) * k - Math.abs(Math.sin(bob)) * 0.01 * hs * bk - vmSwitch * 0.3 - rl * 0.16 + swayY * 0.4 * bk - vmDip * 0.05, hz + (az - hz) * k + vmKick * (melee ? -0.12 : 0.035 * (1 - 0.4 * k)));
    vmRoot.rotation.set(vmKick * (melee ? -0.5 : 0.05 * (1 - 0.6 * k)) - rl * 0.7 - vmSwitch * 0.6 + swayY * 0.8 * bk - vmDip * 0.12, 0.03 * (1 - k) + (melee ? vmKick * 0.4 + 0.25 : 0) + swayX * 1.2 * bk, rl * 0.4 + (melee ? 0.5 : 0) + swayX * 0.8 * bk);
    flashT -= dt; flash.visible = flashT > 0 && !melee;
    if (flash.visible) flash.position.set(0, GUN[id].mv, GUN[id].mz - 0.05);
  }
}

// ======================= 主循环 =======================
let last = performance.now(), fAcc = 0, fN = 0, slowN = 0, fpsShow = false, fpsAvg = 16;
// 持续帧率不足时降低渲染分辨率。只降不升，避免来回切换造成周期性停顿
function adaptResolution(ms) {
  fAcc += ms; fN++;
  if (fN < 60) return;
  const avg = fAcc / fN; fAcc = 0; fN = 0; fpsAvg = avg;
  if (fpsShow) $('fps').textContent = `${Math.round(1000 / avg)} FPS · ${Math.round(innerWidth * pixelRatio)}×${Math.round(innerHeight * pixelRatio)} · 画质${{ low: '低', medium: '中', high: '高' }[QUALITY]}`;
  if (NOLOCK) return;
  slowN = avg > 23 ? slowN + 1 : 0;
  if (slowN >= 3 && resScale > 0.55) { resScale *= 0.85; slowN = 0; resize(); }
}
const perf = { frames: 0, worst: 0, sum: 0, logic: 0, logicWorst: 0, calls: 0 };
renderer.info.autoReset = false;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last; last = now;
  const dt = Math.min(0.05, raw / 1000), now0 = performance.now();
  if (inGame() && !paused) {
    if (raw < 200) adaptResolution(raw);
    time += dt;
    updateRound(dt);
    if (state !== 'matchEnd') {
      if (player.alive) updatePlayer(dt);
      for (let i = 0; i < fighters.length; i++) { const f = fighters[i]; if (!f.isPlayer && f.alive) updateBot(f, dt); }
      updateItems(dt); updateMeshes(dt); updateCamera(dt); updateHUD(dt);
    }
  } else if (state === 'menu') {
    const a = now / 9000;
    camera.position.set(GW + Math.cos(a) * 30, 22, GH + Math.sin(a) * 26); camera.lookAt(GW, 0, GH);
    vmRoot.visible = false;
  }
  const lg = performance.now() - now0; perf.logic += lg; if (lg > perf.logicWorst) perf.logicWorst = lg;
  sky.position.copy(camera.position);
  renderer.info.reset();
  renderFrame((vmRoot.visible || scopeMesh.visible) && inGame());
  const cpu = performance.now() - now0; perf.frames++; perf.sum += cpu; if (cpu > perf.worst) perf.worst = cpu; perf.calls = renderer.info.render.calls;
}
requestAnimationFrame(frame);

// ======================= 菜单 =======================
const choice = { teamSel: 'blue', diffSel: 'normal' };
for (const id of ['teamSel', 'diffSel'])
  $(id).querySelectorAll('button').forEach((b) => (b.onclick = () => {
    choice[id] = b.dataset.v;
    $(id).querySelectorAll('button').forEach((o) => o.classList.toggle('sel', o === b));
  }));
$('qualSel').querySelectorAll('button').forEach((b) => { b.classList.toggle('sel', b.dataset.v === QUALITY); b.onclick = () => { if (b.dataset.v !== QUALITY) setQuality(b.dataset.v); }; });
$('start').onclick = () => newMatch(choice.teamSel, choice.diffSel);
$('again').onclick = () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); state = 'menu'; };

window.__game = { get state() { return state; }, get player() { return player; }, fighters, get time() { return time; }, score, renderer, camera, kill, W, perf, items, get pixelRatio() { return pixelRatio; } };
