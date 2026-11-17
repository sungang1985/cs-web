class_name GunMesh
## 武器模型：由侧面轮廓挤出 + 方块 + 圆柱拼成，使用顶点色，一把枪一个网格。

const METAL := Color("3a3f46")
const METAL2 := Color("50565e")
const POLY := Color("22252a")
const WOOD := Color("7d4f27")
const WOOD2 := Color("5e3a1b")
const OLIVE := Color("4c5a3c")
const STEEL := Color("c2c7cc")
const LENS := Color("25506b")

static var _cache := {}
static var _mat: StandardMaterial3D
static var _st: SurfaceTool


static func material() -> StandardMaterial3D:
	if _mat == null:
		_mat = StandardMaterial3D.new()
		_mat.vertex_color_use_as_albedo = true
		_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		_mat.roughness = 0.42
		_mat.metallic = 0.45
	return _mat


static func _tri(a: Vector3, b: Vector3, c: Vector3, col: Color) -> void:
	_st.set_color(col)
	_st.add_vertex(a)
	_st.add_vertex(b)
	_st.add_vertex(c)


static func _quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, col: Color) -> void:
	_tri(a, b, c, col)
	_tri(a, c, d, col)


## 方块：中心 p，尺寸 (w,h,d)，可绕 X 轴旋转 rx
static func box(w: float, h: float, d: float, col: Color, p: Vector3, rx := 0.0) -> void:
	var bs := Basis(Vector3.RIGHT, rx)
	var v: Array[Vector3] = []
	for sx in [-0.5, 0.5]:
		for sy in [-0.5, 0.5]:
			for sz in [-0.5, 0.5]:
				v.append(p + bs * Vector3(sx * w, sy * h, sz * d))
	# 索引：x*4 + y*2 + z
	_quad(v[4], v[6], v[7], v[5], col)
	_quad(v[0], v[1], v[3], v[2], col)
	_quad(v[2], v[3], v[7], v[6], col)
	_quad(v[0], v[4], v[5], v[1], col)
	_quad(v[1], v[5], v[7], v[3], col)
	_quad(v[0], v[2], v[6], v[4], col)


## 圆柱：沿 Z 轴，中心 p；axis=1 时沿 Y 轴，axis=0 时沿 X 轴
static func cyl(r1: float, r2: float, length: float, col: Color, p: Vector3, axis := 2) -> void:
	var n := 12
	for i in n:
		var a0 := TAU * i / n
		var a1 := TAU * (i + 1) / n
		var c0 := Vector2(cos(a0), sin(a0))
		var c1 := Vector2(cos(a1), sin(a1))
		var pts: Array[Vector3] = [
			Vector3(c0.x * r1, c0.y * r1, -length * 0.5), Vector3(c1.x * r1, c1.y * r1, -length * 0.5),
			Vector3(c1.x * r2, c1.y * r2, length * 0.5), Vector3(c0.x * r2, c0.y * r2, length * 0.5),
			Vector3(0, 0, -length * 0.5), Vector3(0, 0, length * 0.5)]
		for k in pts.size():
			var q := pts[k]
			if axis == 1:
				q = Vector3(q.x, q.z, q.y)
			elif axis == 0:
				q = Vector3(q.z, q.y, q.x)
			pts[k] = q + p
		_quad(pts[0], pts[1], pts[2], pts[3], col)
		_tri(pts[4], pts[1], pts[0], col)
		_tri(pts[5], pts[3], pts[2], col)


## 侧面轮廓挤出：pts 为 [前向 u, 向上 v]，thick 为厚度（X 方向）
static func prof(pts: Array, thick: float, col: Color, x := 0.0) -> void:
	var poly := PackedVector2Array()
	for q in pts:
		poly.append(Vector2(q[0], q[1]))
	var idx := Geometry2D.triangulate_polygon(poly)
	var h := thick * 0.5
	for i in range(0, idx.size(), 3):
		var a := poly[idx[i]]
		var b := poly[idx[i + 1]]
		var c := poly[idx[i + 2]]
		_tri(Vector3(x + h, a.y, -a.x), Vector3(x + h, b.y, -b.x), Vector3(x + h, c.y, -c.x), col)
		_tri(Vector3(x - h, a.y, -a.x), Vector3(x - h, c.y, -c.x), Vector3(x - h, b.y, -b.x), col)
	for i in poly.size():
		var a := poly[i]
		var b := poly[(i + 1) % poly.size()]
		_quad(Vector3(x - h, a.y, -a.x), Vector3(x + h, a.y, -a.x), Vector3(x + h, b.y, -b.x), Vector3(x - h, b.y, -b.x), col)


static func get_mesh(id: String) -> ArrayMesh:
	if _cache.has(id):
		return _cache[id]
	_st = SurfaceTool.new()
	_st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_st.set_smooth_group(-1)
	match id:
		"rifle":
			prof([[-0.10, 0], [0.17, 0], [0.17, 0.05], [0.12, 0.066], [-0.10, 0.066]], 0.042, METAL)
			box(0.034, 0.012, 0.2, METAL2, Vector3(0, 0.07, -0.02))
			box(0.014, 0.016, 0.02, POLY, Vector3(0, 0.08, -0.1))
			prof([[0.17, 0.004], [0.38, 0.012], [0.38, 0.056], [0.17, 0.062]], 0.046, WOOD)
			for i in 3:
				box(0.05, 0.012, 0.03, WOOD2, Vector3(0, 0.034, -0.22 - i * 0.05))
			cyl(0.009, 0.009, 0.2, METAL2, Vector3(0, 0.068, -0.27))
			cyl(0.0095, 0.0095, 0.22, METAL, Vector3(0, 0.036, -0.47))
			cyl(0.012, 0.014, 0.05, POLY, Vector3(0, 0.036, -0.585))
			box(0.008, 0.045, 0.012, METAL, Vector3(0, 0.06, -0.52))
			box(0.026, 0.008, 0.012, METAL, Vector3(0, 0.084, -0.52))
			prof([[-0.10, 0.06], [-0.30, 0.045], [-0.30, -0.065], [-0.27, -0.07], [-0.10, 0.0]], 0.038, WOOD)
			box(0.04, 0.115, 0.01, POLY, Vector3(0, -0.01, 0.302))
			prof([[-0.075, 0.0], [-0.035, 0.0], [-0.06, -0.105], [-0.105, -0.095]], 0.032, WOOD2)
			box(0.006, 0.006, 0.07, METAL, Vector3(0, -0.036, 0.0))
			box(0.006, 0.03, 0.006, METAL, Vector3(0, -0.02, -0.035))
			box(0.005, 0.022, 0.006, POLY, Vector3(0, -0.014, 0.005), 0.3)
			prof([[0.03, 0.0], [0.09, 0.0], [0.135, -0.17], [0.085, -0.185]], 0.028, METAL2)
			box(0.02, 0.008, 0.022, STEEL, Vector3(0.028, 0.05, -0.06))
		"smg":
			prof([[-0.12, 0], [0.16, 0], [0.16, 0.06], [0.13, 0.07], [-0.12, 0.07]], 0.044, POLY)
			box(0.02, 0.01, 0.22, METAL2, Vector3(0, 0.076, -0.02))
			box(0.012, 0.018, 0.014, METAL, Vector3(0, 0.088, 0.07))
			box(0.008, 0.02, 0.01, METAL, Vector3(0, 0.088, -0.12))
			cyl(0.018, 0.018, 0.1, METAL, Vector3(0, 0.04, -0.21))
			for i in 3:
				box(0.04, 0.008, 0.012, POLY, Vector3(0, 0.04, -0.18 - i * 0.028))
			cyl(0.011, 0.011, 0.05, POLY, Vector3(0, 0.04, -0.285))
			prof([[0.02, 0], [0.06, 0], [0.066, -0.2], [0.026, -0.2]], 0.026, METAL2)
			prof([[-0.085, 0], [-0.045, 0], [-0.065, -0.1], [-0.11, -0.09]], 0.032, POLY)
			prof([[0.1, 0], [0.135, 0], [0.13, -0.085], [0.1, -0.085]], 0.03, POLY)
			box(0.006, 0.006, 0.06, METAL, Vector3(0, -0.035, 0.01))
			box(0.008, 0.012, 0.17, METAL, Vector3(0.018, 0.045, 0.2))
			box(0.008, 0.012, 0.17, METAL, Vector3(-0.018, 0.045, 0.2))
			box(0.044, 0.1, 0.014, POLY, Vector3(0, 0.015, 0.285))
			box(0.016, 0.01, 0.02, STEEL, Vector3(-0.026, 0.045, -0.05))
		"shotgun":
			prof([[-0.08, 0], [0.14, 0], [0.14, 0.065], [-0.08, 0.065]], 0.042, METAL)
			box(0.03, 0.006, 0.07, POLY, Vector3(0.02, 0.03, -0.03))
			cyl(0.012, 0.012, 0.5, METAL, Vector3(0, 0.05, -0.39))
			cyl(0.011, 0.011, 0.42, METAL2, Vector3(0, 0.022, -0.35))
			cyl(0.023, 0.023, 0.16, WOOD, Vector3(0, 0.02, -0.32))
			for i in 5:
				cyl(0.0245, 0.0245, 0.008, WOOD2, Vector3(0, 0.02, -0.26 - i * 0.03))
			box(0.03, 0.02, 0.012, METAL, Vector3(0, 0.036, -0.56))
			box(0.008, 0.008, 0.008, STEEL, Vector3(0, 0.066, -0.63))
			prof([[-0.08, 0.06], [-0.32, 0.03], [-0.32, -0.085], [-0.29, -0.09], [-0.15, -0.03], [-0.13, -0.07], [-0.09, -0.06], [-0.08, 0.0]], 0.04, WOOD)
			box(0.042, 0.12, 0.012, POLY, Vector3(0, -0.028, 0.322))
			box(0.006, 0.006, 0.06, METAL, Vector3(0, -0.034, 0.0))
			box(0.006, 0.03, 0.006, METAL, Vector3(0, -0.018, -0.03))
		"sniper":
			prof([[-0.36, 0.05], [-0.36, -0.07], [-0.32, -0.075], [-0.15, -0.025], [-0.1, -0.02], [0.3, 0.0], [0.3, 0.034], [-0.1, 0.044], [-0.2, 0.06]], 0.046, OLIVE)
			box(0.032, 0.022, 0.12, POLY, Vector3(0, 0.066, 0.27))
			box(0.046, 0.125, 0.014, POLY, Vector3(0, -0.01, 0.365))
			prof([[-0.125, -0.015], [-0.085, -0.015], [-0.1, -0.115], [-0.145, -0.105]], 0.034, OLIVE)
			cyl(0.019, 0.019, 0.26, METAL, Vector3(0, 0.05, -0.05))
			cyl(0.009, 0.0105, 0.46, METAL, Vector3(0, 0.05, -0.41))
			box(0.03, 0.028, 0.055, POLY, Vector3(0, 0.05, -0.665))
			cyl(0.017, 0.017, 0.26, POLY, Vector3(0, 0.114, -0.04))
			cyl(0.027, 0.02, 0.08, POLY, Vector3(0, 0.114, -0.19))
			cyl(0.021, 0.024, 0.05, POLY, Vector3(0, 0.114, 0.1))
			cyl(0.022, 0.022, 0.004, LENS, Vector3(0, 0.114, 0.126))
			cyl(0.024, 0.024, 0.004, LENS, Vector3(0, 0.114, -0.231))
			cyl(0.011, 0.011, 0.02, METAL2, Vector3(0, 0.138, -0.04), 1)
			cyl(0.011, 0.011, 0.02, METAL2, Vector3(0.024, 0.114, -0.04), 0)
			box(0.016, 0.034, 0.018, METAL, Vector3(0, 0.084, 0.03))
			box(0.016, 0.034, 0.018, METAL, Vector3(0, 0.084, -0.11))
			box(0.045, 0.009, 0.009, STEEL, Vector3(0.035, 0.05, 0.04))
			box(0.02, 0.02, 0.02, POLY, Vector3(0.06, 0.046, 0.04))
			box(0.028, 0.05, 0.07, METAL2, Vector3(0, -0.034, -0.03))
			box(0.006, 0.006, 0.06, METAL, Vector3(0, -0.045, 0.05))
			cyl(0.004, 0.004, 0.2, METAL, Vector3(0.014, -0.006, -0.2))
			cyl(0.004, 0.004, 0.2, METAL, Vector3(-0.014, -0.006, -0.2))
		"pistol":
			prof([[-0.085, 0.0], [0.1, 0.0], [0.1, 0.032], [0.09, 0.04], [-0.085, 0.04]], 0.028, METAL2)
			for i in 5:
				box(0.03, 0.026, 0.004, METAL, Vector3(0, 0.02, 0.04 + i * 0.008))
			box(0.031, 0.016, 0.03, METAL, Vector3(0, 0.024, -0.02))
			prof([[-0.08, -0.024], [0.1, -0.024], [0.1, 0.0], [-0.08, 0.0]], 0.026, POLY)
			prof([[-0.085, -0.02], [-0.035, -0.02], [-0.055, -0.125], [-0.11, -0.115]], 0.03, POLY)
			box(0.006, 0.006, 0.05, POLY, Vector3(0, -0.052, -0.005))
			box(0.006, 0.032, 0.006, POLY, Vector3(0, -0.038, -0.03))
			box(0.004, 0.02, 0.006, STEEL, Vector3(0, -0.032, 0.0), 0.3)
			box(0.004, 0.007, 0.006, STEEL, Vector3(0, 0.043, -0.09))
			box(0.016, 0.007, 0.006, POLY, Vector3(0, 0.043, 0.075))
			cyl(0.006, 0.006, 0.012, POLY, Vector3(0, 0.022, -0.103))
		"knife":
			prof([[0.0, -0.018], [0.13, -0.018], [0.19, 0.006], [0.13, 0.018], [0.0, 0.018]], 0.005, STEEL)
			box(0.014, 0.062, 0.012, METAL, Vector3.ZERO)
			prof([[-0.11, -0.014], [0, -0.016], [0, 0.016], [-0.11, 0.014]], 0.024, POLY)
			for i in 4:
				box(0.026, 0.034, 0.005, METAL2, Vector3(0, 0, 0.02 + i * 0.022))
	_st.generate_normals()
	var m := _st.commit()
	m.surface_set_material(0, material())
	_cache[id] = m
	_st = null
	return m
