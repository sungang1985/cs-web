class_name Soldier
extends Node3D
## 角色模型与动画：关节骨架 + 双手持枪 IK + 奔跑/静步/蹲行/跳跃 + 倒地。

const PAL := {
	"blue": {"uni": Color("2c436f"), "pants": Color("25334f"), "vest": Color("1a2231"), "gear": Color("0f1319"), "helm": Color("1e2c45"), "boot": Color("141518"), "glove": Color("18191b"), "skin": Color("c9976f"), "accent": Color("5fa8ff")},
	"red": {"uni": Color("8f4a36"), "pants": Color("6a5a3d"), "vest": Color("40301f"), "gear": Color("231a12"), "helm": Color("7a2a20"), "boot": Color("2a1e14"), "glove": Color("2a2018"), "skin": Color("b98660"), "accent": Color("ff6a55")},
}
const UA := 0.30
const FA := 0.33
const TH := 0.45
const HIP_Y := 0.96
const SH := [Vector3(0.2, 0.38, 0), Vector3(-0.2, 0.38, 0)]
const POLE := [Vector3(0.55, -1, 0.25), Vector3(-0.7, -0.9, 0.1)]

static var _mats := {}
static var _meshes := {}
static var POSE := {}
static var _bone_meshes := {}     # "队伍:骨骼序号" → 合并后的网格（所有角色共用）
static var _body_mat: StandardMaterial3D

var _acc := {}                    # 构建时：骨骼节点 → MeshAcc
var _bones: Array[Node3D] = []

var hips: Node3D
var upper: Node3D
var chest: Node3D
var head: Node3D
var sh: Array[Node3D] = []
var el: Array[Node3D] = []
var th: Array[Node3D] = []
var kn: Array[Node3D] = []
var anchor: Node3D
var holder: Node3D
var guns := {}
var gun_id := "pistol"
var aim := 0.0
var cr := 0.0
var ab := 0.0
var rn := 0.0
var sf := 0.0
var fw := 1.0
var rt := 0.0
var land := 0.0
var was_air := false
var vy_prev := 0.0
var phase := 0.0
var death := {}
var drop := {}
var world_root: Node3D


static func _static_init() -> void:
	POSE = {
		"long": {"aimP": Vector3(0.085, 0.385, -0.02), "aimQ": Quaternion.IDENTITY, "lowP": Vector3(0.1, 0.22, -0.06), "lowQ": _q(-0.55, 0.45, 0.12), "twA": -0.6, "twL": -0.3, "runP": Vector3(0.04, 0.27, -0.13), "runQ": _q(0.5, 0.95, 0.25)},
		"pistol": {"aimP": Vector3(0.0, 0.43, -0.5), "aimQ": Quaternion.IDENTITY, "lowP": Vector3(0.02, 0.13, -0.3), "lowQ": _q(-0.85, 0.1, 0), "twA": 0.0, "twL": 0.0, "runP": Vector3(0.1, 0.2, -0.27), "runQ": _q(-0.2, 0.35, 0)},
	}


static func _q(x: float, y: float, z: float) -> Quaternion:
	return Basis.from_euler(Vector3(x, y, z), EULER_ORDER_YXZ).get_rotation_quaternion()


static func mat(c: Color) -> StandardMaterial3D:
	if not _mats.has(c):
		var m := StandardMaterial3D.new()
		m.albedo_color = c
		m.roughness = 0.9
		_mats[c] = m
	return _mats[c]


static func _capsule(r: float, length: float) -> Mesh:
	var k := "c%.3f_%.3f" % [r, length]
	if not _meshes.has(k):
		var m := CapsuleMesh.new()
		m.radius = r
		m.height = length + r * 2.0
		m.radial_segments = 10
		m.rings = 3
		_meshes[k] = m
	return _meshes[k]


static func _sphere(r: float) -> Mesh:
	var k := "s%.3f" % r
	if not _meshes.has(k):
		var m := SphereMesh.new()
		m.radius = r
		m.height = r * 2.0
		m.radial_segments = 12
		m.rings = 6
		_meshes[k] = m
	return _meshes[k]


static func _box(s: Vector3) -> Mesh:
	var k := "b%.3f_%.3f_%.3f" % [s.x, s.y, s.z]
	if not _meshes.has(k):
		var m := BoxMesh.new()
		m.size = s
		_meshes[k] = m
	return _meshes[k]


static func _cyl(rt2: float, rb: float, h: float) -> Mesh:
	var k := "y%.3f_%.3f_%.3f" % [rt2, rb, h]
	if not _meshes.has(k):
		var m := CylinderMesh.new()
		m.top_radius = rt2
		m.bottom_radius = rb
		m.height = h
		m.radial_segments = 10
		m.rings = 1
		_meshes[k] = m
	return _meshes[k]


func _part(parent: Node3D, mesh: Mesh, col: Color, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> void:
	if not _acc.has(parent):
		return   # 该骨骼的合并网格已有缓存
	(_acc[parent] as MeshAcc).add(mesh, Transform3D(Basis.from_euler(rot, EULER_ORDER_XYZ).scaled_local(scl), pos), col)


func _bone(parent: Node3D, pos: Vector3, order := EULER_ORDER_YXZ) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	n.rotation_order = order
	parent.add_child(n)
	_bones.append(n)
	return n


func build(team: String, root: Node3D) -> void:
	world_root = root
	var c: Dictionary = PAL[team]
	var cached := _bone_meshes.has(team + ":0")
	hips = _bone(self, Vector3(0, HIP_Y, 0))
	upper = _bone(hips, Vector3(0, 0.08, 0), EULER_ORDER_XYZ)
	chest = _bone(upper, Vector3.ZERO)
	head = _bone(chest, Vector3(0, 0.46, 0))
	if not cached:
		for b in [hips, chest, head]:
			_acc[b] = MeshAcc.new()
	# 骨盆
	_part(hips, _capsule(0.115, 0.14), c.pants, Vector3(0, -0.01, 0), Vector3(0, 0, PI / 2), Vector3(1, 1, 0.85))
	_part(hips, _box(Vector3(0.37, 0.05, 0.25)), c.gear, Vector3(0, 0.075, 0))
	_part(hips, _box(Vector3(0.06, 0.15, 0.1)), c.gear, Vector3(0.2, -0.04, 0))
	_part(hips, _box(Vector3(0.07, 0.09, 0.05)), c.gear, Vector3(-0.19, 0.03, 0.03))
	# 躯干
	_part(chest, _capsule(0.15, 0.2), c.uni, Vector3(0, 0.19, 0), Vector3.ZERO, Vector3(1.12, 1, 0.74))
	_part(chest, _capsule(0.165, 0.1), c.vest, Vector3(0, 0.2, 0), Vector3.ZERO, Vector3(1.1, 1, 0.8))
	for x in [-0.105, 0.0, 0.105]:
		_part(chest, _box(Vector3(0.085, 0.11, 0.05)), c.gear, Vector3(x, 0.1, -0.145))
	_part(chest, _box(Vector3(0.2, 0.06, 0.03)), c.gear, Vector3(0, 0.27, -0.135))
	_part(chest, _box(Vector3(0.22, 0.24, 0.08)), c.gear, Vector3(0, 0.23, 0.15))
	_part(chest, _box(Vector3(0.055, 0.04, 0.24)), c.vest, Vector3(0.105, 0.385, 0))
	_part(chest, _box(Vector3(0.055, 0.04, 0.24)), c.vest, Vector3(-0.105, 0.385, 0))
	_part(chest, _cyl(0.052, 0.058, 0.09), c.skin, Vector3(0, 0.43, 0.005))
	_part(chest, _cyl(0.066, 0.075, 0.035), c.uni, Vector3(0, 0.405, 0.005))
	# 头
	_part(head, _sphere(0.1), c.skin, Vector3(0, 0.13, 0), Vector3.ZERO, Vector3(0.9, 1.1, 1))
	_part(head, _box(Vector3(0.022, 0.03, 0.024)), c.skin, Vector3(0, 0.115, -0.1))
	if team == "blue":
		_part(head, _sphere(0.118), c.helm, Vector3(0, 0.165, 0.006), Vector3.ZERO, Vector3(1, 0.82, 1.06))
		_part(head, _box(Vector3(0.2, 0.012, 0.06)), c.helm, Vector3(0, 0.165, -0.1))
		_part(head, _box(Vector3(0.03, 0.075, 0.08)), c.gear, Vector3(0.103, 0.12, 0.01))
		_part(head, _box(Vector3(0.03, 0.075, 0.08)), c.gear, Vector3(-0.103, 0.12, 0.01))
		_part(head, _box(Vector3(0.175, 0.05, 0.03)), c.gear, Vector3(0, 0.142, -0.088))
		_part(head, _box(Vector3(0.15, 0.034, 0.012)), Color("3b5d78"), Vector3(0, 0.142, -0.104))
	else:
		_part(head, _sphere(0.108), c.helm, Vector3(0, 0.15, 0.008), Vector3.ZERO, Vector3(0.98, 0.9, 1.04))
		_part(head, _box(Vector3(0.2, 0.035, 0.2)), c.helm, Vector3(0, 0.165, 0.004))
		_part(head, _sphere(0.094), c.gear, Vector3(0, 0.085, -0.012), Vector3.ZERO, Vector3(0.95, 0.62, 1))
		_part(head, _box(Vector3(0.15, 0.012, 0.02)), c.gear, Vector3(0, 0.142, -0.093))
	# 四肢
	for i in 2:
		var side := 1.0 if i == 0 else -1.0
		var s := _bone(chest, Vector3(0.2 * side, 0.38, 0))
		var e := _bone(s, Vector3(0, -UA, 0))
		var t := _bone(hips, Vector3(0.095 * side, -0.02, 0), EULER_ORDER_XYZ)
		var k := _bone(t, Vector3(0, -TH, 0))
		if not cached:
			for b in [s, e, t, k]:
				_acc[b] = MeshAcc.new()
		_part(s, _sphere(0.072), c.uni, Vector3.ZERO)
		_part(s, _capsule(0.05, 0.2), c.uni, Vector3(0, -0.15, 0))
		if i == 1:
			_part(s, _cyl(0.056, 0.056, 0.04), c.accent, Vector3(0, -0.12, 0))
		_part(e, _sphere(0.054), c.gear, Vector3(0, 0, 0.004))
		_part(e, _capsule(0.044, 0.19), c.uni, Vector3(0, -0.14, 0))
		_part(e, _cyl(0.047, 0.044, 0.05), c.glove, Vector3(0, -0.265, 0))
		_part(e, _sphere(0.047), c.glove, Vector3(0, -0.325, 0), Vector3.ZERO, Vector3(0.85, 1.15, 1.05))
		sh.append(s)
		el.append(e)
		_part(t, _capsule(0.09, 0.27), c.pants, Vector3(0, -0.22, 0), Vector3.ZERO, Vector3(1, 1, 1.08))
		_part(t, _box(Vector3(0.05, 0.13, 0.11)), c.gear, Vector3(side * 0.085, -0.2, 0))
		_part(k, _sphere(0.07), c.gear, Vector3(0, 0, -0.018), Vector3.ZERO, Vector3(1, 1.1, 0.9))
		_part(k, _capsule(0.068, 0.24), c.pants, Vector3(0, -0.2, 0.008))
		_part(k, _capsule(0.07, 0.08), c.boot, Vector3(0, -0.37, 0.008))
		_part(k, _capsule(0.056, 0.13), c.boot, Vector3(0, -0.44, -0.05), Vector3(PI / 2, 0, 0), Vector3(1, 1, 0.8))
		_part(k, _box(Vector3(0.11, 0.03, 0.27)), Color("0c0c0d"), Vector3(0, -0.478, -0.045))
		th.append(t)
		kn.append(k)
	# 每根骨骼一个合并网格（同队共用），每个角色约 12 次绘制
	if _body_mat == null:
		_body_mat = StandardMaterial3D.new()
		_body_mat.vertex_color_use_as_albedo = true
		_body_mat.vertex_color_is_srgb = true
		_body_mat.roughness = 0.9
	for i in _bones.size():
		var key := "%s:%d" % [team, i]
		if _acc.has(_bones[i]):
			_bone_meshes[key] = (_acc[_bones[i]] as MeshAcc).commit(_body_mat)
		if _bone_meshes.has(key):
			var mi := MeshInstance3D.new()
			mi.mesh = _bone_meshes[key]
			_bones[i].add_child(mi)
	_acc.clear()
	anchor = _bone(upper, Vector3.ZERO)
	holder = Node3D.new()
	anchor.add_child(holder)
	for id in ["pistol", "smg", "rifle", "shotgun", "sniper"]:
		var mi := MeshInstance3D.new()
		mi.mesh = GunMesh.get_mesh(id)
		mi.visible = false
		holder.add_child(mi)
		guns[id] = mi
	phase = randf() * 6.0


func set_gun(id: String) -> void:
	gun_id = id
	for k in guns:
		guns[k].visible = k == id


func reset() -> void:
	death = {}
	drop = {}
	aim = 0.0
	cr = 0.0
	ab = 0.0
	rn = 0.0
	land = 0.0
	was_air = false
	if holder.get_parent() != anchor:
		holder.reparent(anchor, false)
	holder.transform = Transform3D.IDENTITY
	holder.visible = true
	hips.position = Vector3(0, HIP_Y, 0)
	hips.rotation = Vector3.ZERO
	head.rotation = Vector3.ZERO
	upper.rotation = Vector3.ZERO


func muzzle() -> Vector3:
	var g: Dictionary = Weapons.GUN[gun_id]
	return holder.global_transform * Vector3(0, g.mv, g.mz)


func _solve_arm(s: Node3D, e: Node3D, S: Vector3, T: Vector3, pole: Vector3) -> void:
	var d := T - S
	var L := maxf(d.length(), 0.0001)
	var Lc := clampf(L, 0.1, UA + FA - 0.004)
	d /= L
	var cos_a := clampf((UA * UA + Lc * Lc - FA * FA) / (2.0 * UA * Lc), -1.0, 1.0)
	var h := UA * sqrt(1.0 - cos_a * cos_a)
	var pp := (pole - d * pole.dot(d)).normalized()
	var elbow := S + d * (UA * cos_a) + pp * h
	var tc := S + d * Lc
	var q := Quaternion(Vector3.DOWN, (elbow - S).normalized())
	s.quaternion = q
	e.quaternion = Quaternion(Vector3.DOWN, (q.inverse() * (tc - elbow).normalized()).normalized())


## 存活状态动画：站立 / 奔跑 / 静步 / 蹲姿与蹲行 / 起跳、下落、落地，再叠加持枪 IK
func animate(dt: float, pos: Vector3, yaw: float, vel: Vector3, aiming: bool, pitch: float, crouch: bool, air: bool, sneak: bool) -> void:
	global_position = pos
	rotation = Vector3(0, yaw, 0)
	var g: Dictionary = Weapons.GUN[gun_id]
	var P: Dictionary = POSE["long"] if g.long else POSE["pistol"]
	var speed := Vector2(vel.x, vel.z).length()
	var f := 1.0
	var r := 0.0
	if speed > 0.3:
		f = (-sin(yaw) * vel.x - cos(yaw) * vel.z) / speed
		r = (cos(yaw) * vel.x - sin(yaw) * vel.z) / speed
	fw += (f - fw) * (1.0 - exp(-10.0 * dt))
	rt += (r - rt) * (1.0 - exp(-10.0 * dt))
	var shoulder := aiming or (sneak and speed > 0.3)
	aim += ((1.0 if shoulder else 0.0) - aim) * (1.0 - exp(-(14.0 if shoulder else 5.0) * dt))
	var a := aim
	cr += ((1.0 if crouch else 0.0) - cr) * (1.0 - exp(-11.0 * dt))
	var c := cr
	ab += ((1.0 if air else 0.0) - ab) * (1.0 - exp(-(18.0 if air else 12.0) * dt))
	if was_air and not air:
		land = minf(1.0, 0.35 + maxf(0.0, -vy_prev) / 8.0)
	was_air = air
	vy_prev = vel.y
	land = maxf(0.0, land - dt * 3.2)
	sf += (minf(1.0, speed / 1.6) - sf) * (1.0 - exp(-10.0 * dt))
	var mv := sf
	rn += ((1.0 if (speed > 3.4 and not crouch) else 0.0) - rn) * (1.0 - exp(-8.0 * dt))
	var gnd := 1.0 - ab
	var stn := (1.0 - c) * gnd
	var ck := c * (1.0 - mv) * gnd
	var cw := c * mv * gnd
	var jb := ab
	var ld := land * gnd
	phase += speed * dt * (lerpf(3.9, 2.45, rn) + 1.6 * c)
	var sn := sin(phase)
	var cs := cos(phase)
	var dir_s := -1.0 if fw < -0.3 else 1.0
	# 腿
	var A := (0.36 + 0.5 * rn) * mv * (1.0 - 0.45 * c) * gnd
	var K := (0.75 + 0.8 * rn) * mv * gnd * (1.0 - 0.5 * c)
	var up := clampf(vel.y / 5.0, -1.0, 1.0) * 0.5 + 0.5
	var idle := (1.0 - mv) * stn
	var snk := 0.16 * stn if sneak else 0.0
	th[0].rotation = Vector3(sn * A * fw + (0.26 * a + 0.04) * idle + 0.1 * rn * stn + ck * 1.35 + cw * 1.2 + jb * lerpf(0.3, 0.95, up) + ld * 0.4, 0, 0.035 + 0.08 * c + sn * A * 0.5 * rt)
	th[1].rotation = Vector3(-sn * A * fw - (0.2 * a + 0.02) * idle + 0.1 * rn * stn + ck * 0.25 + cw * 1.2 + jb * lerpf(-0.12, 0.25, up) + ld * 0.4, 0, -0.035 - 0.12 * c - sn * A * 0.5 * rt)
	kn[0].rotation.x = -(maxf(0.0, cs * dir_s) * K + (0.3 * a + 0.06) * idle + 0.12 * mv * stn + snk) - ck * 2.2 - cw * 2.1 + jb * lerpf(-0.45, -1.45, up) - ld * 0.8
	kn[1].rotation.x = -(maxf(0.0, -cs * dir_s) * K + (0.2 * a + 0.06) * idle + 0.12 * mv * stn + snk) - ck * 1.9 - cw * 2.1 + jb * lerpf(-0.3, -0.95, up) - ld * 0.8
	var bob := absf(cs) * (0.025 + 0.045 * rn) * mv
	var sneak_drop := 0.05 * mv if sneak else 0.0
	hips.position = Vector3(0, HIP_Y - (0.035 * a * (1.0 - mv) + 0.012 + 0.03 * mv + 0.02 * rn + sneak_drop) * stn + bob * (1.0 - c) * gnd - 0.5 * ck - 0.47 * cw - 0.15 * ld + 0.05 * jb * up, 0)
	hips.rotation = Vector3(0, sn * (0.07 + 0.1 * rn) * mv * (1.0 - c) * gnd, sn * 0.03 * rn * gnd)
	# 上身
	var tw := lerpf(P.twL, P.twA, a)
	var lean := (0.06 * mv + 0.2 * rn) * fw * stn
	upper.rotation = Vector3(clampf(pitch, -0.7, 0.7) * a - lean * (1.0 - 0.55 * a) - 0.03 - (0.14 * (1.0 - a) + 0.04) * c - 0.12 * ld + 0.1 * jb * (up - 0.4), 0, -rt * 0.07 * rn * stn)
	chest.rotation.y = tw - sn * (0.05 + 0.1 * rn) * mv * gnd * (1.0 - 0.5 * a)
	head.rotation = Vector3(0.06 * a + 0.1 * c * (1.0 - a) + lean * 0.6 * (1.0 - a), -tw * 0.9, -0.2 * a if g.long else 0.0)
	# 武器位置：低姿持枪 → 奔跑斜持 → 抵肩瞄准
	var rr := rn * (1.0 - a) * (1.0 - c)
	var ap: Vector3 = (P.lowP as Vector3).lerp(P.runP, rr).lerp(P.aimP, a)
	var aq: Quaternion = (P.lowQ as Quaternion).slerp(P.runQ, rr).slerp(P.aimQ, a)
	if g.long:
		ap.z -= g.butt * lerpf(lerpf(0.8, 0.45, rr), 1.0, a)
	var sw2 := mv * gnd * (1.0 - 0.75 * a)
	ap.y += sin(phase * 2.0) * (0.008 + 0.022 * rn) * sw2 - 0.05 * ld * (1.0 - a)
	ap.x += cs * (0.006 + 0.03 * rn) * sw2
	ap.z += sn * 0.03 * rn * sw2
	anchor.position = ap
	anchor.quaternion = aq
	# 手臂 IK（在胸腔坐标系中求解）
	var inv := Basis(Vector3.UP, -chest.rotation.y)
	for i in 2:
		var src: Vector3 = g.grip if i == 0 else g.fore
		var t: Vector3 = inv * (aq * src + ap)
		if i == 1 and g.long:
			t.y -= 0.02
		_solve_arm(sh[i], el[i], SH[i], t, POLE[i])


static func _eul(x: float, y: float, z: float) -> Quaternion:
	return Basis.from_euler(Vector3(x, y, z), EULER_ORDER_ZYX).get_rotation_quaternion()


## 开始倒地：dir=+1 向后仰倒 / -1 向前扑倒；space 为该方向可用空间
func start_death(dir: float, space: float, ground_y: float) -> void:
	var full := space >= 1.65
	var sit := not full
	var phi := PI / 2 if full else clampf(0.35 + (space - 0.5) * 0.6, 0.3, 0.75)
	var m := 1.0 if randf() < 0.5 else -1.0
	var back := dir > 0 or sit
	var sh_to: Array
	var el_to: Array
	var head_to: Vector3
	var th_to: Array
	var kn_to: Array
	if sit:
		sh_to = [_eul(0.15, 0, 0.25), _eul(0.1, 0, -0.3)]
		el_to = [_eul(0.5, 0, 0), _eul(0.7, 0, 0)]
		head_to = Vector3(0.5, m * 0.3, m * 0.2)
	elif back:
		sh_to = [_eul(-0.28, 0, randf_range(0.9, 1.6)), _eul(-0.28, 0, -randf_range(0.5, 1.3))]
		el_to = [_eul(0, 0, randf_range(-0.9, 0.3)), _eul(0, 0, randf_range(-0.3, 0.9))]
		head_to = Vector3(-0.1, m * randf_range(0.5, 0.9), 0)
	else:
		sh_to = [_eul(0.3, 0, randf_range(2.0, 2.6)), _eul(0.3, 0, -randf_range(1.9, 2.5))]
		el_to = [_eul(0, 0, 0.9), _eul(0, 0, -0.9)]
		head_to = Vector3(0, m * 1.15, 0)
	if back:
		var base := [0.5, 0.05] if m > 0 else [0.05, 0.5]
		var kb := [-0.95, -0.1] if m > 0 else [-0.1, -0.95]
		th_to = [base[0] * (0.3 if sit else 1.0) + (PI / 2 - phi), base[1] * (0.3 if sit else 1.0) + (PI / 2 - phi)]
		kn_to = [kb[0] * (0.5 if sit else 1.0), kb[1] * (0.5 if sit else 1.0)]
	else:
		th_to = [0.0, -0.04]
		kn_to = [-0.12, -0.55] if m > 0 else [-0.55, -0.12]
	death = {
		"dir": 1.0 if back else -1.0, "phi": phi, "slide": 0.82 if full else clampf(space - 0.75, 0.0, 0.3),
		"roll": randf_range(-0.1, 0.1), "yaw": randf_range(-0.25, 0.25), "hipY0": hips.position.y,
		"up0": upper.rotation.x, "ch0": chest.rotation.y, "head0": head.rotation, "headTo": head_to,
		"upTo": 0.25 if sit else randf_range(-0.04, 0.06), "chTo": randf_range(-0.2, 0.2),
		"sh0": [sh[0].quaternion, sh[1].quaternion], "el0": [el[0].quaternion, el[1].quaternion],
		"shTo": sh_to, "elTo": el_to, "th0": [th[0].rotation.x, th[1].rotation.x], "kn0": [kn[0].rotation.x, kn[1].rotation.x],
		"thTo": th_to, "knTo": kn_to, "thZ": randf_range(0.08, 0.22) if back else 0.1,
	}
	# 武器脱手
	var gt := holder.global_transform
	holder.reparent(world_root, false)
	holder.global_transform = gt
	var yaw := rotation.y
	drop = {
		"vy": 1.2, "vx": -sin(yaw) * randf_range(0.6, 1.4) + randf_range(-0.5, 0.5), "vz": -cos(yaw) * randf_range(0.6, 1.4) + randf_range(-0.5, 0.5),
		"g": ground_y + 0.024, "done": false,
		"q": Basis.from_euler(Vector3(0, randf() * TAU, (1.0 if randf() < 0.5 else -1.0) * PI / 2), EULER_ORDER_YXZ).get_rotation_quaternion(),
	}


## t: 0..1
func animate_death(t: float, dt: float) -> void:
	if death.is_empty():
		return
	var D := death
	var f := pow(t, 2.1)
	var bounce := sin((t - 0.86) / 0.14 * PI) * 0.035 if t > 0.86 else 0.0
	var ff := f - bounce
	var fa := minf(1.0, t * 2.2)
	var fs := fa * fa * (3.0 - 2.0 * fa)
	var buckle := sin(PI * minf(1.0, t * 1.2)) * (1.0 - f)
	var phi: float = D.dir * D.phi * ff
	hips.rotation = Vector3(phi, D.yaw * f, D.roll * f)
	hips.position = Vector3(0, 0.135 + (D.hipY0 - 0.135) * maxf(0.0, cos(absf(phi) * (PI / 2 / D.phi))) * (1.0 - 0.42 * buckle), D.dir * D.slide * f)
	upper.rotation = Vector3(lerpf(D.up0, D.upTo, f), 0, 0)
	chest.rotation.y = lerpf(D.ch0, D.chTo, fs)
	head.rotation = (D.head0 as Vector3).lerp(D.headTo, f)
	for i in 2:
		sh[i].quaternion = (D.sh0[i] as Quaternion).slerp(D.shTo[i], fs)
		el[i].quaternion = (D.el0[i] as Quaternion).slerp(D.elTo[i], fs)
		th[i].rotation = Vector3(lerpf(D.th0[i], D.thTo[i], f) + buckle * (0.55 if D.dir > 0 else 0.3), 0, (1.0 if i == 0 else -1.0) * lerpf(0.035, D.thZ, f))
		kn[i].rotation.x = lerpf(D.kn0[i], D.knTo[i], f) - buckle
	if not drop.is_empty() and not drop.done:
		drop.vy -= 16.0 * dt
		holder.global_position += Vector3(drop.vx, drop.vy, drop.vz) * dt
		holder.quaternion = holder.quaternion.slerp(drop.q, 1.0 - exp(-9.0 * dt))
		if holder.global_position.y <= drop.g:
			holder.global_position.y = drop.g
			holder.quaternion = drop.q
			drop.done = true
