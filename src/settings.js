// 画质设置：在菜单中选择后保存到 localStorage 并重新加载页面生效。
let q = 'medium';
try { q = localStorage.getItem('dbo_quality') || 'medium'; } catch (e) {}
export const QUALITY = ['low', 'medium', 'high'].includes(q) ? q : 'medium';
// pixels: 渲染像素上限；shadow: 0 关 / 1 普通 / 2 柔和高清；pbr: 物理材质 + 环境反射
export const Q = {
  low:    { pixels: 1.0e6, aa: false, shadow: 0, pbr: false, normal: false, aniso: 2 },
  medium: { pixels: 2.1e6, aa: true,  shadow: 1, pbr: false, normal: true,  aniso: 4 },
  high:   { pixels: 3.7e6, aa: true,  shadow: 2, pbr: true,  normal: true,  aniso: 8 },
}[QUALITY];
export function setQuality(v) { try { localStorage.setItem('dbo_quality', v); } catch (e) {} location.reload(); }
