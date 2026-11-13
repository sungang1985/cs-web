// 程序化贴图：逐像素生成颜色 + 高度，再由高度推导法线贴图。
import * as THREE from '../vendor/three.module.min.js';

// ---------- 可平铺的值噪声 ----------
const NS = 256, lattice = new Float32Array(NS * NS);
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
function vnoise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice[y0 * NS + x0], b = lattice[y0 * NS + x1], c = lattice[y1 * NS + x0], d = lattice[y1 * NS + x1];
  return a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy;
}
// u,v ∈ [0,1)，freq 为基础频率（整数，保证平铺）
function fbm(u, v, freq, oct = 4) {
  let s = 0, amp = 0.5, f = freq;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(u * f + i * 17, v * f + i * 31, f); amp *= 0.5; f *= 2; }
  return s / (1 - Math.pow(0.5, oct));
}
const hash2 = (x, y) => lattice[(((y * 57 + x * 131) % 65536) + 65536) % 65536];
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// fn(u, v) -> [r, g, b, height(0..1)]，v=0 为贴图底部
function generate(w, h, fn, bump) {
  const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
  const cg = cc.getContext('2d'), img = cg.createImageData(w, h), H = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = fn((x + 0.5) / w, 1 - (y + 0.5) / h), i = (y * w + x) * 4;
      img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255;
      H[y * w + x] = p[3];
    }
  cg.putImageData(img, 0, 0);
  const nc = document.createElement('canvas'); nc.width = w; nc.height = h;
  const ng = nc.getContext('2d'), nimg = ng.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const xl = (x + w - 1) % w, xr = (x + 1) % w, yu = (y + h - 1) % h, yd = (y + 1) % h;
      const dx = (H[y * w + xr] - H[y * w + xl]) * bump, dy = (H[yd * w + x] - H[yu * w + x]) * bump;
      const l = 1 / Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      nimg.data[i] = (-dx * l * 0.5 + 0.5) * 255; nimg.data[i + 1] = (dy * l * 0.5 + 0.5) * 255; nimg.data[i + 2] = (l * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
    }
  ng.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(cc), normalMap = new THREE.CanvasTexture(nc);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normalMap };
}

function brick(u, v, cols, rows) {
  const by = v * rows, row = Math.floor(by), bx = u * cols + (row % 2 ? 0.5 : 0), col = Math.floor(bx);
  const fx = bx - col, fy = by - row;
  const edge = Math.min(Math.min(fx, 1 - fx) * (rows / cols) * 2.2, Math.min(fy, 1 - fy));
  return { m: sstep(0.03, 0.1, edge), id: hash2(((col % cols) + cols) % cols, row) };
}

// 内墙：灰泥抹面 + 剥落露砖 + 墙裙 + 污渍。贴图纵向对应整面墙高。
export function wallTexture() {
  return generate(1024, 1024, (u, v) => {
    const n1 = fbm(u, v, 4, 5), n2 = fbm(u, v, 32, 3), n3 = fbm(u, v, 6, 4);
    const edgeN = fbm(u, v, 16, 3);
    const peel = sstep(0.68, 0.71, n3 + (0.3 - v) * 0.3 + edgeN * 0.08);
    const dadoLine = 0.24 + (edgeN - 0.5) * 0.012;
    const dado = 1 - sstep(dadoLine - 0.004, dadoLine + 0.004, v);
    let col = mix3([206, 180, 132], [226, 204, 160], n1);
    col = mix3(col, [128, 100, 78], dado * 0.8);
    const grain = (n2 - 0.5) * 26;
    let hgt = 0.6 + n2 * 0.08;
    const crack = Math.abs(fbm(u, v, 5, 4) - 0.5);
    const cr = (1 - sstep(0.0, 0.004, crack)) * sstep(0.5, 0.65, n1);
    col = mix3(col, [96, 80, 60], cr * 0.5); hgt -= cr * 0.25;
    if (peel > 0) {
      const b = brick(u, v, 16, 40);
      const bc = mix3(mix3([134, 86, 66], [160, 108, 84], b.id), [168, 160, 146], 1 - b.m);
      col = mix3(col, bc, peel);
      hgt = mix(hgt, 0.25 + b.m * 0.2 + n2 * 0.05, peel);
    }
    const rim = sstep(0.65, 0.68, n3 + (0.3 - v) * 0.3 + edgeN * 0.08) * (1 - peel);
    col = mix3(col, [120, 100, 74], rim * 0.5);
    const dirt = (1 - sstep(0, 0.14, v)) * (0.5 + n1 * 0.5), drip = sstep(0.82, 1, v) * sstep(0.45, 0.7, fbm(u, v * 0.15, 48, 2));
    col = mix3(col, [88, 72, 52], dirt * 0.6 + drip * 0.35);
    const cap = sstep(0.975, 0.985, v);
    col = mix3(col, [120, 108, 92], cap);
    return [col[0] + grain, col[1] + grain, col[2] + grain, hgt + cap * 0.2];
  }, 5);
}

// 外墙：混凝土预制板
export function outerWallTexture() {
  return generate(1024, 1024, (u, v) => {
    const n1 = fbm(u, v, 3, 5), n2 = fbm(u, v, 48, 3);
    const pu = (u * 2) % 1, pv = (v * 3) % 1;
    const seam = Math.min(Math.min(pu, 1 - pu) * 1.5, Math.min(pv, 1 - pv));
    const sm = sstep(0.004, 0.02, seam);
    let col = mix3([128, 124, 116], [164, 158, 146], n1);
    const bx = Math.abs(pu - 0.5) - 0.38, by = Math.abs(pv - 0.5) - 0.36;
    const bolt = 1 - sstep(0.012, 0.018, Math.hypot(bx * 0.5, by * 0.333) * 2);
    col = mix3(col, [70, 66, 60], (1 - sm) * 0.8 + bolt * 0.6);
    const stain = sstep(0.5, 0.75, fbm(u, v * 0.2, 24, 3)) * sstep(0.3, 1, v) * 0.35 + (1 - sstep(0, 0.1, v)) * 0.5;
    col = mix3(col, [84, 76, 62], stain);
    const g = (n2 - 0.5) * 30;
    return [col[0] + g, col[1] + g, col[2] + g, 0.5 * sm + n2 * 0.1 - bolt * 0.3];
  }, 5);
}

// 地面：混凝土地砖 + 裂缝 + 沙尘
export function floorTexture() {
  return generate(1024, 1024, (u, v) => {
    const n1 = fbm(u, v, 4, 5), n2 = fbm(u, v, 64, 3), n3 = fbm(u, v, 8, 4);
    const tu = (u * 2) % 1, tv = (v * 2) % 1;
    const seam = sstep(0.004, 0.014, Math.min(Math.min(tu, 1 - tu), Math.min(tv, 1 - tv)));
    const tid = hash2(Math.floor(u * 2), Math.floor(v * 2) + 7);
    let col = mix3([150, 138, 116], [182, 168, 140], n1 * 0.7 + tid * 0.3);
    const sand = sstep(0.52, 0.7, n3);
    col = mix3(col, [202, 178, 128], sand * 0.6);
    const crack = 1 - sstep(0, 0.008, Math.abs(fbm(u, v, 6, 4) - 0.5));
    const ck = crack * sstep(0.4, 0.55, n1);
    col = mix3(col, [64, 56, 44], ck * 0.8 + (1 - seam) * 0.75);
    const oil = sstep(0.72, 0.8, fbm(u + 0.3, v + 0.7, 5, 3));
    col = mix3(col, [78, 72, 62], oil * 0.5);
    const g = (n2 - 0.5) * 34;
    return [col[0] + g, col[1] + g, col[2] + g, 0.5 * seam - ck * 0.3 + n2 * 0.12 + sand * 0.05];
  }, 4);
}

// 木箱：木板 + 边框 + 斜撑 + 金属包角
export function crateTexture() {
  return generate(512, 512, (u, v) => {
    const fr = 0.085, inFrame = u < fr || u > 1 - fr || v < fr || v > 1 - fr;
    const diag = Math.abs(u - v) < 0.055 && !inFrame;
    const pl = v * 6, pid = Math.floor(pl), pf = pl - pid;
    const horiz = !inFrame && !diag;
    const along = inFrame ? (u < fr || u > 1 - fr ? v : u) : diag ? (u + v) * 0.7 : u;
    const across = inFrame ? (u < fr || u > 1 - fr ? u : v) : diag ? (u - v) : v;
    const grain = fbm(along * 0.25 + (horiz ? pid * 0.13 : 0.5), across * 4, 32, 4);
    const tone = horiz ? hash2(pid, 3) : 0.5;
    let col = mix3([122, 84, 44], [176, 130, 74], grain * 0.7 + tone * 0.3);
    if (!horiz) col = mix3(col, [98, 66, 34], 0.45);
    let h = horiz ? 0.4 : 0.75;
    const gap = horiz ? 1 - sstep(0.0, 0.05, Math.min(pf, 1 - pf)) : 0;
    col = mix3(col, [40, 26, 12], gap * 0.85); h -= gap * 0.3;
    const cu = Math.min(u, 1 - u), cv = Math.min(v, 1 - v);
    if (cu < 0.16 && cv < 0.16 && (cu < fr || cv < fr)) {
      const m = fbm(u, v, 40, 2);
      col = mix3([72, 76, 80], [112, 116, 120], m); h = 0.95;
      if (Math.hypot(cu - 0.045, cv - 0.045) < 0.016 || Math.hypot(cu - 0.125, cv - 0.045) < 0.013 || Math.hypot(cu - 0.045, cv - 0.125) < 0.013) { col = [40, 42, 46]; h = 1; }
    }
    const edge = sstep(0, 0.012, Math.min(cu, cv));
    col = mix3([30, 20, 10], col, edge);
    const d = (fbm(u, v, 6, 3) - 0.5) * 30;
    return [col[0] + d, col[1] + d, col[2] + d, h * edge + grain * 0.12];
  }, 3.5);
}

// 集装箱：波纹钢板 + 锈迹
export function containerTexture() {
  return generate(512, 512, (u, v) => {
    const cu = Math.min(u, 1 - u), cv = Math.min(v, 1 - v), frame = sstep(0.05, 0.065, Math.min(cu, cv));
    const rib = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 10);
    const ribS = sstep(0.2, 0.8, rib);
    const n1 = fbm(u, v, 5, 4), n2 = fbm(u, v, 48, 3);
    let col = mix3([44, 84, 74], [70, 122, 104], ribS * 0.6 + n1 * 0.4);
    col = mix3([34, 60, 54], col, frame);
    const rust = sstep(0.56, 0.72, fbm(u, v * 0.4 + 0.2, 10, 4) + (1 - v) * 0.12);
    col = mix3(col, [130, 74, 40], rust * 0.8);
    const scr = sstep(0.8, 0.86, fbm(u * 0.2, v, 60, 2)) * 0.25;
    col = mix3(col, [170, 180, 176], scr);
    const g = (n2 - 0.5) * 22;
    return [col[0] + g, col[1] + g, col[2] + g, frame * (0.3 + ribS * 0.6) + (1 - frame) * 1 + n2 * 0.06 - rust * 0.05];
  }, 6);
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const skyTexture = () => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d'), img = g.createImageData(1024, 512);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 1024; x++) {
      const u = x / 1024, v = 1 - y / 512, el = Math.max(0, (v - 0.5) * 2);
      let col = mix3([226, 214, 190], [98, 150, 214], Math.pow(el, 0.55));
      const cl = sstep(0.52, 0.78, fbm(u, v * 2, 6, 5)) * sstep(0.02, 0.3, el) * (1 - sstep(0.75, 1, el));
      col = mix3(col, [255, 252, 244], cl * 0.85);
      if (v < 0.5) col = [214, 200, 172];
      const i = (y * 1024 + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
};
export const decalTexture = () => canvasTex(64, 64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(8,8,8,1)'); gr.addColorStop(0.3, 'rgba(26,22,18,.85)'); gr.addColorStop(0.55, 'rgba(60,50,40,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
export const flashTexture = () => canvasTex(128, 128, (g, s) => {
  g.translate(s / 2, s / 2);
  const gr = g.createRadialGradient(0, 0, 1, 0, 0, s / 2);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, 'rgba(255,226,140,.95)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr;
  for (let i = 0; i < 5; i++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.moveTo(0, -9); g.lineTo(s / 2, 0); g.lineTo(0, 9); g.fill(); }
  g.beginPath(); g.arc(0, 0, s / 4.5, 0, 7); g.fill();
});
export const blobTexture = () => canvasTex(64, 64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
export const softTexture = () => canvasTex(64, 64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
