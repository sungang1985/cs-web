// 音频：枪声预先渲染成缓冲区，播放时只需 3 个节点，并限制同时发声数量，避免混战时卡顿。
const SND = {
  pistol: { f: 2600, d: 0.16, v: 0.5 }, smg: { f: 3200, d: 0.12, v: 0.42 }, rifle: { f: 1900, d: 0.22, v: 0.62 },
  shotgun: { f: 1100, d: 0.36, v: 0.85 }, sniper: { f: 850, d: 0.6, v: 0.95 },
};
let actx = null, master = null, dry = null, voices = 0;
const bufs = {};

function renderShot(p, sr, far) {
  const n = (sr * (p.d + 0.1)) | 0, buf = actx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let lp = 0, lp2 = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const cutoff = (far ? 0.35 : 1) * (200 + (p.f - 200) * Math.exp(-t / (p.d * 0.3)));
    const a = 1 - Math.exp(-2 * Math.PI * cutoff / sr);
    lp += a * (Math.random() * 2 - 1 - lp); lp2 += a * (lp - lp2);
    ph += 2 * Math.PI * (45 + 130 * Math.exp(-t / 0.025)) / sr;
    const crack = t < 0.004 ? (far ? 0.2 : 1) * (1 - t / 0.004) * (Math.random() * 2 - 1) : 0;
    const tail = far ? Math.exp(-t / (p.d * 0.5)) : Math.exp(-t / (p.d * 0.2)) + 0.25 * Math.exp(-t / (p.d * 0.6));
    d[i] = Math.tanh((lp2 * 3.2 * tail + Math.sin(ph) * Math.exp(-t / 0.04) * 0.9 + crack) * 1.4) * 0.8 * Math.min(1, (n - i) / 200);
  }
  return buf;
}
function renderStep(sr) {
  const n = (sr * 0.12) | 0, buf = actx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; lp += 0.12 * (Math.random() * 2 - 1 - lp); d[i] = (lp * 2.2 * Math.exp(-t / 0.02) + Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t / 0.03) * 0.5) * Math.min(1, (n - i) / 100); }
  return buf;
}
let steps = 0;
export function stepSound(dist, pan) {
  if (!actx || steps >= 6) return;
  const vol = (dist < 0.5 ? 0.1 : 0.32) / (1 + (dist / 7) ** 2);
  if (vol < 0.01) return;
  const src = actx.createBufferSource(); src.buffer = bufs.step; src.playbackRate.value = 0.85 + Math.random() * 0.3;
  const g = actx.createGain(); g.gain.value = vol;
  let out = g;
  if (dist > 0.5 && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  src.connect(g); out.connect(master);
  steps++; src.onended = () => { steps--; src.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
  src.start();
}
export function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(actx.destination);
    master = actx.createGain(); master.gain.value = 0.55; master.connect(comp);
    dry = actx.createGain(); dry.gain.value = 0.55; dry.connect(comp);   // 界面提示音不走混响
    // 混响：用衰减噪声生成脉冲响应，让枪声带有空间回响
    const sr = actx.sampleRate, n = (sr * 1.5) | 0, ir = actx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr; lp += 0.35 * (Math.random() * 2 - 1 - lp); d[i] = lp * Math.exp(-t / 0.32) * (t < 0.012 ? t / 0.012 : 1); } }
    const conv = actx.createConvolver(); conv.buffer = ir; const wet = actx.createGain(); wet.gain.value = 0.5; master.connect(conv); conv.connect(wet); wet.connect(comp);
    { const m = (sr * 0.22) | 0, wb = actx.createBuffer(1, m, sr), d = wb.getChannelData(0); let ph = 0, lp = 0;
      for (let i = 0; i < m; i++) { const t = i / m; ph += 2 * Math.PI * (2600 - 1700 * t) / sr; lp += 0.5 * (Math.random() * 2 - 1 - lp); d[i] = (Math.sin(ph) * 0.35 + lp * 0.5) * Math.sin(Math.PI * t) ** 2; }
      bufs.whiz = wb; }
    bufs.step = renderStep(actx.sampleRate);
    for (const id in SND) { bufs[id] = renderShot(SND[id], actx.sampleRate, false); bufs[id + '_far'] = renderShot(SND[id], actx.sampleRate, true); }
  } catch (e) { actx = null; }
}
export function shotSound(id, dist, pan) {
  if (!actx) return;
  const vol = SND[id].v / (1 + (dist / 18) ** 2);
  if (vol < 0.012 || voices >= (dist < 1 ? 20 : 12)) return;
  const src = actx.createBufferSource(); src.buffer = bufs[dist > 22 ? id + '_far' : id]; src.playbackRate.value = 0.94 + Math.random() * 0.12;
  const g = actx.createGain(); g.gain.value = vol;
  let out = g;
  if (dist > 0 && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  src.connect(g); out.connect(master);
  voices++; src.onended = () => { voices--; src.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
  src.start();
}
export function beep(freq, dur, vol = 0.2, type = 'square', delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dry); o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(t); o.stop(t + dur + 0.02);
}
export const sndClick = () => beep(1400, 0.03, 0.15);
export const sndReload = () => { beep(700, 0.04, 0.15); beep(1100, 0.05, 0.15, 'square', 0.25); };
export const sndHit = (hs) => beep(hs ? 2200 : 1300, 0.06, 0.18, 'sine');
export const sndHurt = () => beep(140, 0.15, 0.3, 'sawtooth');
export const sndSwish = () => beep(500, 0.08, 0.08, 'sine');
export const sndJingle = (win) => (win ? [523, 659, 784] : [392, 330, 262]).forEach((f, i) => beep(f, 0.22, 0.14, 'triangle', i * 0.16));
export function whizSound(pan) {
  if (!actx) return;
  const src = actx.createBufferSource(); src.buffer = bufs.whiz; src.playbackRate.value = 0.8 + Math.random() * 0.5;
  const g = actx.createGain(); g.gain.value = 0.28; let out = g;
  if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  src.connect(g); out.connect(master); src.onended = () => { src.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
  src.start();
}
export const sndKill = (hs) => { beep(hs ? 1320 : 880, 0.07, 0.16, 'triangle'); beep(hs ? 1980 : 1320, 0.12, 0.16, 'triangle', 0.07); };
