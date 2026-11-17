shader_type spatial;
// 程序化场景材质：按世界坐标生成，任意距离都清晰。kind: 0 内墙 1 外墙 2 地面 3 木箱 4 集装箱
uniform int kind = 0;
uniform float wall_h = 5.0;

varying vec3 wpos;
varying vec3 wnrm;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
	float s = 0.0, a = 0.5;
	for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; }
	return s / 0.875;
}

void concrete_floor(vec2 uv, out vec3 col, out float h) {
	float n1 = fbm(uv * 1.1), n2 = fbm(uv * 14.0), n3 = fbm(uv * 2.3 + 40.0);
	vec2 t = fract(uv / 2.0);
	float seam = smoothstep(0.004, 0.012, min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y)));
	float tid = hash(floor(uv / 2.0));
	col = mix(vec3(0.53, 0.49, 0.41), vec3(0.66, 0.61, 0.5), n1 * 0.7 + tid * 0.3);
	float sand = smoothstep(0.52, 0.7, n3);
	col = mix(col, vec3(0.74, 0.65, 0.46), sand * 0.6);
	float crack = (1.0 - smoothstep(0.0, 0.012, abs(fbm(uv * 1.6 + 7.0) - 0.5))) * smoothstep(0.4, 0.55, n1);
	col = mix(col, vec3(0.2, 0.17, 0.13), crack * 0.8 + (1.0 - seam) * 0.75);
	col += (n2 - 0.5) * 0.1;
	h = 0.5 * seam - crack * 0.3 + n2 * 0.1;
}

void fragment() {
	vec3 an = abs(wnrm);
	bool top = an.y > 0.5;
	vec2 uv = top ? wpos.xz : (an.x > 0.5 ? vec2(wpos.z, wpos.y) : vec2(wpos.x, wpos.y));
	vec3 col = vec3(0.5);
	float h = 0.5, rough = 0.92, metal = 0.0;
	if (kind == 2 || (top && kind < 2)) {
		concrete_floor(uv, col, h);
	} else if (kind == 0) {
		float v = clamp(wpos.y / wall_h, 0.0, 1.0);
		float n1 = fbm(uv * 1.0), n2 = fbm(uv * 9.0), n3 = fbm(uv * 1.5 + 23.0), en = fbm(uv * 4.0 + 5.0);
		float pk = n3 + (0.3 - v) * 0.3 + en * 0.08;
		float peel = smoothstep(0.66, 0.69, pk);
		float dado = 1.0 - smoothstep(-0.02, 0.02, wpos.y - 1.2 - (en - 0.5) * 0.06);
		col = mix(vec3(0.76, 0.66, 0.47), vec3(0.86, 0.78, 0.6), n1);
		col = mix(col, vec3(0.5, 0.39, 0.3), dado * 0.8);
		h = 0.6 + n2 * 0.08;
		float crack = (1.0 - smoothstep(0.0, 0.01, abs(fbm(uv * 1.3 + 3.0) - 0.5))) * smoothstep(0.5, 0.65, n1);
		col = mix(col, vec3(0.36, 0.3, 0.22), crack * 0.5);
		h -= crack * 0.25;
		// 砖
		vec2 b = vec2(uv.x * 4.0, uv.y * 8.0);
		float row = floor(b.y);
		b.x += mod(row, 2.0) * 0.5;
		vec2 f = fract(b);
		float edge = min(min(f.x, 1.0 - f.x) * 0.5, min(f.y, 1.0 - f.y));
		float m = smoothstep(0.03, 0.1, edge);
		vec3 bc = mix(vec3(0.62, 0.6, 0.55), mix(vec3(0.5, 0.31, 0.24), vec3(0.6, 0.4, 0.31), hash(floor(b))), m);
		col = mix(col, bc, peel);
		h = mix(h, 0.25 + m * 0.2, peel);
		col = mix(col, vec3(0.45, 0.38, 0.28), smoothstep(0.63, 0.66, pk) * (1.0 - peel) * 0.5);
		float dirt = (1.0 - smoothstep(0.0, 0.7, wpos.y)) * (0.5 + n1 * 0.5);
		float drip = smoothstep(wall_h - 0.9, wall_h, wpos.y) * smoothstep(0.45, 0.7, fbm(vec2(uv.x * 12.0, uv.y * 0.6)));
		col = mix(col, vec3(0.33, 0.27, 0.2), dirt * 0.6 + drip * 0.35);
		col += (n2 - 0.5) * 0.08;
	} else if (kind == 1) {
		float n1 = fbm(uv * 0.8), n2 = fbm(uv * 12.0);
		vec2 pv = fract(vec2(uv.x / 2.0, uv.y / 2.17));
		float seam = smoothstep(0.004, 0.02, min(min(pv.x, 1.0 - pv.x), min(pv.y, 1.0 - pv.y)));
		col = mix(vec3(0.47, 0.45, 0.42), vec3(0.62, 0.6, 0.55), n1);
		col = mix(col, vec3(0.25, 0.24, 0.22), (1.0 - seam) * 0.8);
		float stain = smoothstep(0.5, 0.75, fbm(vec2(uv.x * 6.0, uv.y * 0.5))) * 0.3 + (1.0 - smoothstep(0.0, 0.6, wpos.y)) * 0.5;
		col = mix(col, vec3(0.31, 0.28, 0.23), stain);
		col += (n2 - 0.5) * 0.1;
		h = 0.5 * seam + n2 * 0.1;
	} else if (kind == 3) {
		vec2 q = top ? fract(uv / 2.0) : vec2(fract(uv.x / 2.0), clamp(uv.y, 0.0, 1.0));
		float fr = 0.085;
		vec2 cq = min(q, 1.0 - q);
		bool frame = cq.x < fr || cq.y < fr;
		bool diag = abs(q.x - q.y) < 0.055 && !frame;
		float pl = q.y * 6.0, pf = fract(pl);
		bool horiz = !frame && !diag;
		float grain = fbm(vec2(q.x * 3.0 + (horiz ? floor(pl) * 1.7 : 0.5), q.y * 40.0));
		col = mix(vec3(0.46, 0.31, 0.16), vec3(0.67, 0.49, 0.28), grain * 0.7 + (horiz ? hash(vec2(floor(pl), 3.0)) : 0.5) * 0.3);
		if (!horiz) col = mix(col, vec3(0.37, 0.25, 0.13), 0.45);
		h = horiz ? 0.4 : 0.75;
		float gap = horiz ? 1.0 - smoothstep(0.0, 0.05, min(pf, 1.0 - pf)) : 0.0;
		col = mix(col, vec3(0.15, 0.1, 0.05), gap * 0.85);
		h -= gap * 0.3;
		if (cq.x < 0.16 && cq.y < 0.16 && frame) { col = mix(vec3(0.28, 0.3, 0.31), vec3(0.44, 0.45, 0.47), fbm(q * 40.0)); h = 0.95; rough = 0.5; metal = 0.7; }
		col *= mix(0.3, 1.0, smoothstep(0.0, 0.012, min(cq.x, cq.y)));
		rough = min(rough, 0.82);
	} else {
		vec2 q = top ? fract(uv / 2.0) : vec2(fract(uv.x / 2.0), clamp(uv.y / 2.2, 0.0, 1.0));
		vec2 cq = min(q, 1.0 - q);
		float frame = smoothstep(0.05, 0.065, min(cq.x, cq.y));
		float rib = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(q.x * 62.83));
		float n1 = fbm(q * 5.0 + floor(uv.x / 2.0));
		col = mix(vec3(0.17, 0.33, 0.29), vec3(0.27, 0.48, 0.41), rib * 0.6 + n1 * 0.4);
		col = mix(vec3(0.13, 0.24, 0.21), col, frame);
		float rust = smoothstep(0.56, 0.72, fbm(vec2(q.x * 10.0, q.y * 4.0) + floor(uv.x / 2.0) * 3.1) + (1.0 - q.y) * 0.12);
		col = mix(col, vec3(0.51, 0.29, 0.16), rust * 0.8);
		h = frame * (0.3 + rib * 0.6) + (1.0 - frame);
		rough = mix(0.55, 0.9, rust);
		metal = 0.5 * (1.0 - rust);
	}
	ALBEDO = clamp(col, 0.0, 1.0);
	ROUGHNESS = rough;
	METALLIC = metal;
	// 由高度的屏幕空间导数扰动法线（凹凸）
	vec3 dpx = dFdx(VERTEX), dpy = dFdy(VERTEX);
	float dhx = dFdx(h), dhy = dFdy(h);
	vec3 r1 = cross(dpy, NORMAL), r2 = cross(NORMAL, dpx);
	float det = dot(dpx, r1);
	vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
	NORMAL = normalize(abs(det) * NORMAL - 0.03 * grad);
}
