// 原创地图「旧仓库区」：上半部分手工绘制，下半部分 180° 旋转对称生成，保证双方公平。
// '#' 墙  'X' 高箱  'x' 矮箱(可跳上)  'A' 蓝队出生点  'B' 红队出生点  '.' 地面
const TOP = [
  '########################################',
  '#.......#..........x.........#.........#',
  '#.......#..........x...................#',
  '#AAA........XX...........XX..#.........#',
  '#AAA....#...XX...........XX..#.....x...#',
  '#.......#....................#.....x...#',
  '#..xx...####..######..####..####..######',
  '#.......#......#........#......#.......#',
  '#..............#........#..............#',
  '####..###..x...#...XX...#...x..#..xx...#',
  '#.......#..x.......XX..........#.......#',
  '#.......#......#........#......#.......#',
  '#..X....###..###..x..x..###..###..#..###',
  '#..X......#..#............#..#....#....#',
  '#.........#..#.....XX.....#..#.........#',
];
const rot = (s) => [...s].reverse().join('').replace(/A/g, 'B');
export const ROWS = [...TOP, ...TOP.slice().reverse().map(rot)];

export const CELL = 2;
export const GW = ROWS[0].length;
export const GH = ROWS.length;
export const WALL_H = 5;
const HEIGHTS = { '#': WALL_H, X: 2.2, x: 1.0 };

export function cellChar(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return '#';
  return ROWS[cz][cx];
}
export function cellH(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return WALL_H;
  return HEIGHTS[ROWS[cz][cx]] || 0;
}
export const walkable = (cx, cz) => cellH(cx, cz) === 0;

export const spawns = { blue: [], red: [] };
for (let z = 0; z < GH; z++)
  for (let x = 0; x < GW; x++) {
    const c = ROWS[z][x];
    if (c === 'A') spawns.blue.push({ x: (x + 0.5) * CELL, z: (z + 0.5) * CELL });
    if (c === 'B') spawns.red.push({ x: (x + 0.5) * CELL, z: (z + 0.5) * CELL });
  }

// ---------- 碰撞 ----------
export function collides(x, y, z, r) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let cz = z0; cz <= z1; cz++)
    for (let cx = x0; cx <= x1; cx++) if (cellH(cx, cz) > y + 0.01) return true;
  return false;
}
export function groundH(x, z, r) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  let g = 0;
  for (let cz = z0; cz <= z1; cz++)
    for (let cx = x0; cx <= x1; cx++) g = Math.max(g, cellH(cx, cz));
  return g;
}

// ---------- 射线检测（网格 DDA + 高度）----------
export function raycastWorld(ox, oy, oz, dx, dy, dz, maxT) {
  let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tmx = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL : cx * CELL) - ox) / dx : Infinity;
  let tmz = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL : cz * CELL) - oz) / dz : Infinity;
  const tFloor = dy < 0 ? -oy / dy : Infinity;
  let t = 0, axis = -1;
  for (let i = 0; i < 256; i++) {
    const h = cellH(cx, cz);
    const tExit = Math.min(tmx, tmz);
    if (h > 0) {
      if (oy + dy * t < h) {
        if (t > maxT) return null;
        return { t, nx: axis === 0 ? -sx : 0, ny: axis === -1 ? 1 : 0, nz: axis === 1 ? -sz : 0 };
      }
      if (dy < 0 && oy + dy * tExit < h) {
        const tt = (h - oy) / dy;
        return tt <= maxT ? { t: tt, nx: 0, ny: 1, nz: 0 } : null;
      }
    }
    if (tFloor <= tExit) return tFloor <= maxT ? { t: tFloor, nx: 0, ny: 1, nz: 0 } : null;
    if (tExit > maxT) return null;
    if (tmx < tmz) { t = tmx; tmx += tdx; cx += sx; axis = 0; }
    else { t = tmz; tmz += tdz; cz += sz; axis = 1; }
  }
  return null;
}

// ---------- A* 寻路（二叉堆）----------
const N = GW * GH;
const gScore = new Float32Array(N), fScore = new Float32Array(N), came = new Int32Array(N), closed = new Uint8Array(N);
const heap = new Int32Array(N * 8);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function findPath(sx, sz, gx, gz, noise = 0) {
  if (!walkable(gx, gz) || !walkable(sx, sz)) return null;
  gScore.fill(Infinity); closed.fill(0);
  const start = sz * GW + sx, goal = gz * GW + gx;
  gScore[start] = 0; came[start] = -1;
  let hn = 0;
  const push = (node, f) => {
    let i = hn++; heap[i] = node; fScore[node] = f;
    while (i > 0) { const p = (i - 1) >> 1; if (fScore[heap[p]] <= f) break; heap[i] = heap[p]; i = p; }
    heap[i] = node;
  };
  const pop = () => {
    const top = heap[0], last = heap[--hn], f = fScore[last];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1; if (c >= hn) break;
      if (c + 1 < hn && fScore[heap[c + 1]] < fScore[heap[c]]) c++;
      if (fScore[heap[c]] >= f) break;
      heap[i] = heap[c]; i = c;
    }
    heap[i] = last;
    return top;
  };
  push(start, 0);
  while (hn > 0) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % GW, cz = (cur / GW) | 0;
    for (let k = 0; k < 8; k++) {
      const ddx = DIRS[k][0], ddz = DIRS[k][1], nx = cx + ddx, nz = cz + ddz;
      if (!walkable(nx, nz)) continue;
      if (ddx && ddz && (!walkable(cx + ddx, cz) || !walkable(cx, cz + ddz))) continue;
      const ni = nz * GW + nx;
      if (closed[ni]) continue;
      const ng = gScore[cur] + (ddx && ddz ? 1.414 : 1) * (1 + Math.random() * noise);
      if (ng < gScore[ni] && hn < heap.length) {
        gScore[ni] = ng; came[ni] = cur;
        const ax = Math.abs(nx - gx), az = Math.abs(nz - gz);
        push(ni, ng + Math.max(ax, az) + 0.414 * Math.min(ax, az));
      }
    }
  }
  if (gScore[goal] === Infinity) return null;
  const path = [];
  for (let i = goal; i !== -1; i = came[i])
    path.push({ x: ((i % GW) + 0.5) * CELL, z: (((i / GW) | 0) + 0.5) * CELL });
  return path.reverse();
}
