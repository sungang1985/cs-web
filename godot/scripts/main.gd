class_name Main
extends Node3D
## 主流程：场景搭建、回合与经济、弹道、伤害、地面武器、特效、摄像机。

const TEAM_SIZE := 5
const WIN_ROUNDS := 8
const ROUND_TIME := 120.0
const FREEZE_TIME := 5.0
const BUY_WINDOW := 20.0
const TEAM_CN := {"blue": "蓝队", "red": "红队"}
const NAMES := ["猎鹰", "山猫", "铁壁", "夜枭", "赤狐", "孤狼", "雪豹", "飞隼", "黑熊", "灰鲨"]
const BN := 96

var time := 0.0
var state := "menu"
var freeze_t := 0.0
var round_t := 0.0
var end_t := 0.0
var round_no := 0
var score := {"blue": 0, "red": 0}
var alive_n := {"blue": 0, "red": 0}
var fighters: Array[Fighter] = []
var player: Player = null
var items: Array = []
var near_item = null
var item_t := 0.0
var diff: Dictionary = Weapons.DIFF.normal
var sens := 1.0
var paused := false
var spec_target: Fighter = null
var whiz_t := 0.0
var unlocked_t := 0.0
var auto_paused := false

var hud: Hud
var sfx: Sfx
var cam: Camera3D
var nav: AStarGrid2D
var space: PhysicsDirectSpaceState3D

# 特效
var bullets: Array = []
var bullet_i := 0
var bullets_on := false
var tracer_mesh: ImmediateMesh
var decals: MultiMesh
var decal_i := 0
var dust: Array[CPUParticles3D] = []
var blood: Array[CPUParticles3D] = []
var dust_i := 0
var blood_i := 0
var flashes: Array = []
var flash_i := 0
var casings: Array = []
var casing_i := 0
var _flash_mat: StandardMaterial3D

# 自动化测试 / 截图（命令行： -- --autotest=秒数  或  -- --shot=路径 --scene=名称）
var test_args := {}
var test_frames := 0


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=")
		test_args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	MapData.setup()
	_build_env()
	_build_world()
	_build_nav()
	_build_fx()
	cam = Camera3D.new()
	cam.fov = 75.0
	cam.near = 0.03
	cam.far = 400.0
	add_child(cam)
	cam.make_current()
	sfx = Sfx.new()
	add_child(sfx)
	hud = Hud.new()
	add_child(hud)
	hud.build(self)
	space = get_world_3d().direct_space_state
	if test_args.has("autotest") or test_args.has("shot"):
		new_match(test_args.get("team", "blue"), "normal")


# ======================= 场景 =======================
func _build_env() -> void:
	var env := Environment.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.3, 0.5, 0.82)
	sky_mat.sky_horizon_color = Color(0.82, 0.8, 0.72)
	sky_mat.ground_bottom_color = Color(0.55, 0.5, 0.42)
	sky_mat.ground_horizon_color = Color(0.82, 0.8, 0.72)
	sky_mat.sun_angle_max = 6.0
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.66, 0.68, 0.72)
	env.ambient_light_energy = 0.62
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 0.95
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.glow_bloom = 0.05
	env.glow_hdr_threshold = 1.0
	env.ssao_enabled = true
	env.ssao_radius = 1.2
	env.ssao_intensity = 1.6
	env.fog_enabled = true
	env.fog_light_color = Color(0.82, 0.78, 0.68)
	env.fog_density = 0.004
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.08
	env.adjustment_saturation = 1.1
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, 55, 0)
	sun.light_color = Color(1.0, 0.94, 0.82)
	sun.light_energy = 1.05
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 90.0
	sun.shadow_bias = 0.04
	add_child(sun)


func _surface(kind: int) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/surface.gdshader")
	m.set_shader_parameter("kind", kind)
	return m


func _add_box(body: StaticBody3D, mat: Material, a: Vector3, b: Vector3) -> void:
	var size := b - a
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = (a + b) * 0.5
	body.add_child(mi)
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	cs.position = mi.position
	body.add_child(cs)


func _build_world() -> void:
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	add_child(body)
	var m_wall := _surface(0)
	var m_outer := _surface(1)
	var m_floor := _surface(2)
	var m_crate := _surface(3)
	var m_cont := _surface(4)
	var C := MapData.CELL
	var gw := MapData.gw
	var gh := MapData.gh
	_add_box(body, m_floor, Vector3(-4, -1, -4), Vector3(gw * C + 4, 0, gh * C + 4))
	for z in gh:
		var x := 0
		while x < gw:
			var c := MapData.rows[z][x]
			if c == "#":
				var e := x
				while e < gw and MapData.rows[z][e] == "#":
					e += 1
				var outer := z == 0 or z == gh - 1 or (e - x == 1 and (x == 0 or x == gw - 1))
				_add_box(body, m_outer if outer else m_wall, Vector3(x * C, 0, z * C), Vector3(e * C, MapData.WALL_H + (1.5 if outer else 0.0), (z + 1) * C))
				x = e
			else:
				if c == "x":
					_add_box(body, m_crate, Vector3(x * C + 0.02, 0, z * C + 0.02), Vector3((x + 1) * C - 0.02, 1.0, (z + 1) * C - 0.02))
				elif c == "X":
					_add_box(body, m_cont, Vector3(x * C, 0, z * C), Vector3((x + 1) * C, 2.2, (z + 1) * C))
				x += 1


func _build_nav() -> void:
	nav = AStarGrid2D.new()
	nav.region = Rect2i(0, 0, MapData.gw, MapData.gh)
	nav.cell_size = Vector2(MapData.CELL, MapData.CELL)
	nav.offset = Vector2(MapData.CELL, MapData.CELL) * 0.5
	nav.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	nav.update()
	for z in MapData.gh:
		for x in MapData.gw:
			var c := MapData.cell_char(x, z)
			if c == "#" or c == "X":
				nav.set_point_solid(Vector2i(x, z), true)
			elif c == "x":
				nav.set_point_weight_scale(Vector2i(x, z), 2.5)   # 矮箱可以跳上去，但代价更高


func _free_cell(p: Vector3) -> Vector2i:
	var c := Vector2i(clampi(int(floor(p.x / MapData.CELL)), 0, MapData.gw - 1), clampi(int(floor(p.z / MapData.CELL)), 0, MapData.gh - 1))
	if not nav.is_point_solid(c):
		return c
	for r in range(1, 4):
		for dz in range(-r, r + 1):
			for dx in range(-r, r + 1):
				var q := c + Vector2i(dx, dz)
				if nav.is_in_boundsv(q) and not nav.is_point_solid(q):
					return q
	return Vector2i(-1, -1)


func find_path(from: Vector3, to: Vector3) -> PackedVector3Array:
	var out := PackedVector3Array()
	var a := _free_cell(from)
	var b := _free_cell(to)
	if a.x < 0 or b.x < 0:
		return out
	for p in nav.get_point_path(a, b):
		out.append(Vector3(p.x, 0, p.y))
	return out


# ======================= 特效 =======================
func flash_material() -> StandardMaterial3D:
	if _flash_mat == null:
		var gr := Gradient.new()
		gr.set_color(0, Color(1, 1, 1, 1))
		gr.add_point(0.3, Color(1, 0.88, 0.55, 0.9))
		gr.set_color(gr.get_point_count() - 1, Color(1, 0.45, 0.0, 0.0))
		var gt := GradientTexture2D.new()
		gt.gradient = gr
		gt.fill = GradientTexture2D.FILL_RADIAL
		gt.fill_from = Vector2(0.5, 0.5)
		gt.fill_to = Vector2(1.0, 0.5)
		_flash_mat = StandardMaterial3D.new()
		_flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_flash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_flash_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_flash_mat.albedo_texture = gt
		_flash_mat.albedo_color = Color(2.5, 2.2, 1.6)
		_flash_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		_flash_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	return _flash_mat


func _puff_pool(col: Color, n: int, grav: float) -> Array[CPUParticles3D]:
	var arr: Array[CPUParticles3D] = []
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	var qm := QuadMesh.new()
	qm.size = Vector2(0.07, 0.07)
	qm.material = mat
	var ramp := Gradient.new()
	ramp.set_color(0, col)
	ramp.set_color(1, Color(col.r, col.g, col.b, 0.0))
	for i in n:
		var p := CPUParticles3D.new()
		p.mesh = qm
		p.emitting = false
		p.one_shot = true
		p.amount = 10
		p.lifetime = 0.5
		p.explosiveness = 1.0
		p.spread = 55.0
		p.initial_velocity_min = 0.6
		p.initial_velocity_max = 3.0
		p.gravity = Vector3(0, -grav, 0)
		p.scale_amount_min = 0.5
		p.scale_amount_max = 2.2
		p.color_ramp = ramp
		add_child(p)
		arr.append(p)
	return arr


func _build_fx() -> void:
	for i in BN:
		bullets.append({"on": false, "pos": Vector3.ZERO, "vel": Vector3.ZERO, "off": Vector3.ZERO, "dist": 0.0, "dmg": 0.0, "w": {}, "owner": null, "skip": null, "whiz": false, "tr": true})
	tracer_mesh = ImmediateMesh.new()
	var tm := MeshInstance3D.new()
	tm.mesh = tracer_mesh
	var tmat := StandardMaterial3D.new()
	tmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	tmat.vertex_color_use_as_albedo = true
	tmat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	tmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	tmat.albedo_color = Color(3, 2.6, 1.6)
	tm.material_override = tmat
	tm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(tm)
	# 弹孔
	var dg := Gradient.new()
	dg.set_color(0, Color(0.03, 0.03, 0.03, 1))
	dg.add_point(0.35, Color(0.1, 0.09, 0.07, 0.85))
	dg.set_color(dg.get_point_count() - 1, Color(0, 0, 0, 0))
	var dt := GradientTexture2D.new()
	dt.gradient = dg
	dt.fill = GradientTexture2D.FILL_RADIAL
	dt.fill_from = Vector2(0.5, 0.5)
	dt.fill_to = Vector2(1.0, 0.5)
	var dmat := StandardMaterial3D.new()
	dmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dmat.albedo_texture = dt
	dmat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var dq := QuadMesh.new()
	dq.size = Vector2(0.2, 0.2)
	dq.material = dmat
	decals = MultiMesh.new()
	decals.transform_format = MultiMesh.TRANSFORM_3D
	decals.mesh = dq
	decals.instance_count = 120
	decals.visible_instance_count = 0
	var dmi := MultiMeshInstance3D.new()
	dmi.multimesh = decals
	dmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dmi.custom_aabb = AABB(Vector3(-10, -2, -10), Vector3(120, 20, 100))
	add_child(dmi)
	dust = _puff_pool(Color(0.8, 0.74, 0.6, 0.9), 10, 6.0)
	blood = _puff_pool(Color(0.6, 0.04, 0.04, 1.0), 8, 9.0)
	# 电脑的枪口火焰
	for i in 6:
		var q := MeshInstance3D.new()
		var qm := QuadMesh.new()
		qm.size = Vector2(0.45, 0.45)
		q.mesh = qm
		q.material_override = flash_material()
		q.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		q.visible = false
		var l := OmniLight3D.new()
		l.light_color = Color(1, 0.75, 0.4)
		l.omni_range = 7.0
		l.light_energy = 2.0
		q.add_child(l)
		add_child(q)
		flashes.append({"n": q, "t": 0.0})
	# 弹壳：真实刚体
	var brass := StandardMaterial3D.new()
	brass.albedo_color = Color(0.79, 0.63, 0.29)
	brass.metallic = 0.8
	brass.roughness = 0.35
	for i in 24:
		var rb := RigidBody3D.new()
		rb.collision_layer = 4
		rb.collision_mask = 1
		rb.mass = 0.02
		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(0.012, 0.012, 0.03)
		cs.shape = bs
		rb.add_child(cs)
		var mi := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.0055
		cm.bottom_radius = 0.0055
		cm.height = 0.028
		cm.radial_segments = 6
		cm.rings = 1
		mi.mesh = cm
		mi.rotation.x = PI / 2
		mi.material_override = brass
		rb.add_child(mi)
		rb.freeze = true
		rb.visible = false
		add_child(rb)
		casings.append({"n": rb, "t": 0.0})


func fx_decal(p: Vector3, n: Vector3) -> void:
	var bs := Basis(Vector3.UP, PI) if n.z < -0.999 else Basis(Quaternion(Vector3(0, 0, 1), n))
	bs = bs.rotated(n, randf() * TAU).scaled_local(Vector3.ONE * randf_range(0.7, 1.2))
	decals.set_instance_transform(decal_i % 120, Transform3D(bs, p + n * 0.012))
	decal_i += 1
	decals.visible_instance_count = mini(decal_i, 120)


func fx_impact(p: Vector3, n: Vector3) -> void:
	fx_decal(p, n)
	var d := dust[dust_i % dust.size()]
	dust_i += 1
	d.global_position = p + n * 0.04
	d.direction = n
	d.restart()


func fx_blood(p: Vector3) -> void:
	var b := blood[blood_i % blood.size()]
	blood_i += 1
	b.global_position = p
	b.direction = Vector3.UP
	b.restart()


func fx_casing(p: Vector3, v: Vector3) -> void:
	var c: Dictionary = casings[casing_i % casings.size()]
	casing_i += 1
	var rb: RigidBody3D = c.n
	rb.freeze = false
	rb.visible = true
	rb.global_position = p
	rb.linear_velocity = v
	rb.angular_velocity = Vector3(randf_range(-20, 20), randf_range(-20, 20), randf_range(-20, 20))
	c.t = 3.0


# ======================= 射线 / 视线 =======================
func ray_world(from: Vector3, dir: Vector3, dist: float) -> Dictionary:
	return space.intersect_ray(PhysicsRayQueryParameters3D.create(from, from + dir * dist, 1))


func can_see(a: Fighter, b: Fighter) -> bool:
	var o := a.eye()
	for k in [1.0, 0.55]:
		var t: Vector3 = b.global_position + Vector3(0, b.eye_h * k, 0)
		if space.intersect_ray(PhysicsRayQueryParameters3D.create(o, t, 1)).is_empty():
			return true
	return false


func spread_dir(dir: Vector3, s: float, gauss: bool) -> Vector3:
	var r := dir.cross(Vector3.UP)
	if r.length_squared() < 1e-6:
		r = Vector3.RIGHT
	r = r.normalized()
	var u := r.cross(dir)
	var rad := s * sqrt(-2.0 * log(1.0 - randf() * 0.999)) if gauss else s * sqrt(randf())
	var a := randf() * TAU
	return (dir + r * cos(a) * rad + u * sin(a) * rad).normalized()


# ======================= 弹道 =======================
func fire_weapon(f: Fighter, dir: Vector3, w: Dictionary, spread: float) -> void:
	var o := f.eye()
	f.last_shot = time
	var mz: Vector3
	if f.is_player:
		var side := 0.16 * (1.0 - player.ads)
		mz = o + Vector3(cos(f.yaw), 0, -sin(f.yaw)) * side + Vector3(0, -0.13 * (1.0 - player.ads) - 0.03, 0) + dir * 0.7
	else:
		mz = f.rig.muzzle()
	var n: int = w.get("pellets", 1)
	f.shot_n += 1
	for i in n:
		var d := spread_dir(dir, spread, false)
		var b: Dictionary = bullets[bullet_i % BN]
		bullet_i += 1
		b.on = true
		b.pos = o
		b.vel = d * w.v * randf_range(0.97, 1.03)
		b.off = mz - o - d * 0.7
		b.dist = 0.0
		b.dmg = w.dmg
		b.w = w
		b.owner = f
		b.skip = null
		b.whiz = false
		b.tr = (i < 3) if n > 1 else ((f.shot_n % 3 == 0) if w.get("auto", false) else true)   # 连发武器每三发一发曳光弹
	bullets_on = true
	# 抛壳
	var right := Vector3(cos(f.yaw), 0, -sin(f.yaw))
	fx_casing(mz - dir * 0.45 + right * 0.05, right * randf_range(1.2, 2.2) + Vector3(f.velocity.x, randf_range(1.6, 2.6), f.velocity.z))
	sfx.shot(w.id, mz, f.is_player)
	if not f.is_player:
		var fl: Dictionary = flashes[flash_i % flashes.size()]
		flash_i += 1
		fl.n.global_position = mz
		fl.n.scale = Vector3.ONE * randf_range(0.8, 1.2) * (1.5 if n > 1 else 1.0)
		fl.n.visible = true
		fl.t = 0.05
	# 枪声惊动敌方电脑（有冷却，避免混战时反复寻路）
	for e in fighters:
		if e.is_player or not e.alive or e.team == f.team:
			continue
		var bot := e as Bot
		if bot.target != null or time < bot.hear_t:
			continue
		if absf(bot.global_position.x - o.x) + absf(bot.global_position.z - o.z) < 55.0:
			bot.hear_t = time + randf_range(1.5, 2.5)
			if randf() < 0.6:
				bot.look_toward(f.global_position, 1.5)
				bot.go_to(f.global_position, randf() < 0.12)


func _update_bullets(dt: float) -> void:
	tracer_mesh.clear_surfaces()
	if not bullets_on:
		return
	bullets_on = false
	var drawn := false
	for b in bullets:
		if not b.on:
			continue
		var vel: Vector3 = b.vel
		vel.y -= 9.81 * dt                                # 重力下坠
		var sp := vel.length()
		var drag := exp(-0.0011 * sp * dt)                # 空气阻力
		vel *= drag
		sp *= drag
		b.vel = vel
		var dir := vel / sp
		var remain := sp * dt
		var start: Vector3 = b.pos
		var start_dist: float = b.dist
		var w: Dictionary = b.w
		var owner: Fighter = b.owner
		var guard := 0
		while b.on and remain > 0.0 and guard < 4:
			guard += 1
			var pos: Vector3 = b.pos
			var wh := ray_world(pos, dir, remain)
			var t_hit := remain
			if not wh.is_empty():
				t_hit = (wh.position - pos).length()
			var victim: Fighter = null
			var head := false
			var zone := 1.0
			for e in fighters:
				if e == owner or e == b.skip or not e.alive or e.team == owner.team:
					continue
				var t := e.ray_hit(pos, dir)
				if t >= 0.0 and t < t_hit:
					t_hit = t
					victim = e
					head = e.hit_head
					zone = e.hit_zone
			# 从玩家耳边擦过
			if not b.whiz and player.alive and victim != player and owner.team != player.team and time >= whiz_t:
				var pp := player.eye() - pos
				var tt := pp.dot(dir)
				if tt > 0.0 and tt < t_hit and b.dist + tt > 3.0 and (pp - dir * tt).length_squared() < 2.2:
					b.whiz = true
					whiz_t = time + 0.1
					sfx.ui("whiz", -10.0)
			pos += dir * t_hit
			b.pos = pos
			b.dist += t_hit
			remain -= t_hit
			if victim:
				fx_blood(pos)
				hurt(victim, b.dmg * zone * maxf(0.3, 1.0 - w.fall * b.dist / 100.0), owner, head, w)
				if w.pen > 0.0 and b.dmg > w.dmg * 0.3:   # 步枪弹穿过人体
					b.skip = victim
					b.dmg *= 0.55
				else:
					b.on = false
			elif not wh.is_empty():
				var nrm: Vector3 = wh.normal
				fx_impact(pos, nrm)
				# 穿透：木箱 / 集装箱可被步枪和狙击枪打穿，墙体不行
				var probe := pos + dir * 0.03
				var h := MapData.height_at(probe.x, probe.z)
				var through := 0.0
				if w.pen > 0.0 and h > 0.0 and h < MapData.WALL_H and probe.y > 0.0:
					var t := 0.15
					while t <= w.pen:
						if not MapData.inside_solid(pos + dir * t):
							through = t
							break
						t += 0.15
				if through > 0.0 and (pos + dir * through).y > 0.02:
					pos += dir * through
					b.pos = pos
					b.dist += through
					remain -= through
					b.dmg *= 1.0 - 0.65 * through / w.pen
					b.vel = vel * (1.0 - 0.4 * through / w.pen)
					fx_impact(pos, dir)
				else:
					b.on = false
			if b.dist > 260.0 or pos.y < -1.0:
				b.on = false
		# 曳光：上一帧位置 → 当前位置；刚出膛时从枪口位置过渡
		if b.tr:
			if not drawn:
				tracer_mesh.surface_begin(Mesh.PRIMITIVE_LINES)
				drawn = true
			var off: Vector3 = b.off
			tracer_mesh.surface_set_color(Color(1, 0.9, 0.6))
			tracer_mesh.surface_add_vertex(start + off * maxf(0.0, 1.0 - start_dist / 12.0))
			tracer_mesh.surface_set_color(Color(1, 0.9, 0.6))
			tracer_mesh.surface_add_vertex(b.pos + off * maxf(0.0, 1.0 - b.dist / 12.0))
		if b.on:
			bullets_on = true
	if drawn:
		tracer_mesh.surface_end()


# ======================= 伤害 =======================
func hurt(v: Fighter, dmg: float, att: Fighter, head: bool, w: Dictionary) -> void:
	if state != "live" and state != "roundEnd":
		return
	if v.armor > 0 and not w.has("melee"):
		var ab := dmg * 0.45
		v.armor = maxi(0, roundi(v.armor - ab * 0.6))
		dmg -= ab
	v.hp -= maxi(1, roundi(dmg))
	if v == player:
		hud.on_hurt(att, v)
		sfx.ui("hurt", -6.0)
		player.punch_p += 0.03
	if att == player:
		hud.on_hit(head)
		sfx.ui("hs" if head else "hit", -8.0)
	if v.hp <= 0:
		kill(v, att, head, w)
		return
	if not v.is_player:
		var bot := v as Bot
		if bot.target == null and time >= bot.hear_t - 1.0:
			bot.hear_t = time + 1.5
			bot.look_toward(att.global_position, 2.0)
			bot.go_to(att.global_position)


func kill(v: Fighter, att: Fighter, head: bool, w: Dictionary) -> void:
	v.hp = 0
	v.alive = false
	v.deaths += 1
	v.death_t = 0.0
	v.reload_end = 0.0
	v.last_death = time
	v.col.disabled = true
	alive_n[v.team] -= 1
	att.kills += 1
	att.money = mini(16000, att.money + 300)
	hud.add_feed(att, v, w, head)
	if att == player:
		hud.toast("爆头击杀  +$300" if head else "击杀  +$300")
		sfx.ui("killhs" if head else "kill")
	var rig := v.rig
	var did: String = v.inv[0] if v.inv[0] != null else "pistol"
	if v == player:
		player.scoped = false
		player.buy_open = false
		spec_target = null
		rig.visible = true
		rig.set_gun(did)
		rig.aim = 1.0
		rig.cr = 1.0 if v.crouch else 0.0
		rig.animate(0.016, v.global_position, v.yaw, Vector3.ZERO, true, v.view_pitch, v.crouch, false, false)
	else:
		(v as Bot).target = null
	# 倒地方向：正面中弹向后仰，背后中弹向前扑；并检查该方向是否有空间
	var fwd := Vector3(-sin(v.yaw), 0, -cos(v.yaw))
	var to_att := att.global_position - v.global_position
	var dir := 1.0 if to_att.dot(fwd) >= 0.0 else -1.0
	var origin := v.global_position + Vector3(0, 0.4, 0)
	var sp := func(d: float) -> float:
		var h := ray_world(origin, -fwd * d, 2.0)
		return 2.0 if h.is_empty() else (h.position - origin).length()
	var room: float = sp.call(dir)
	if room < 1.65:
		var o: float = sp.call(-dir)
		if o > room:
			dir = -dir
			room = o
	var down := ray_world(v.global_position + Vector3(0, 0.5, 0), Vector3.DOWN, 6.0)
	v.ground_y = down.position.y if not down.is_empty() else 0.0
	rig.start_death(dir, room, v.ground_y)
	# 手中的枪掉在地上，可被拾取
	items.append({"id": did, "mag": v.ammo[did].mag, "res": v.ammo[did].res, "node": rig.holder, "loose": false, "no_auto": false})


# ======================= 地面武器 =======================
func clear_items() -> void:
	for it in items:
		if it.loose:
			it.node.queue_free()
		else:
			it.node.visible = true
	items.clear()
	near_item = null


func drop_loose(f: Fighter) -> void:
	var id = f.inv[0]
	if id == null:
		return
	var mi := MeshInstance3D.new()
	mi.mesh = GunMesh.get_mesh(id)
	add_child(mi)
	var fwd := Vector3(-sin(f.yaw), 0, -cos(f.yaw))
	var p := f.global_position + fwd * 0.9
	if not ray_world(f.global_position + Vector3(0, 0.5, 0), fwd, 1.2).is_empty():
		p = f.global_position
	var down := ray_world(p + Vector3(0, 0.6, 0), Vector3.DOWN, 6.0)
	p.y = (down.position.y if not down.is_empty() else 0.0) + 0.024
	mi.global_position = p
	mi.rotation_order = EULER_ORDER_YXZ
	mi.rotation = Vector3(0, randf() * TAU, PI / 2)
	items.append({"id": id, "mag": f.ammo[id].mag, "res": f.ammo[id].res, "node": mi, "loose": true, "no_auto": f.is_player})
	f.inv[0] = null


func take_item(f: Fighter, it: Dictionary) -> void:
	if not items.has(it):
		return
	items.erase(it)
	if it.loose:
		it.node.queue_free()
	else:
		it.node.visible = false
	var w: Dictionary = Weapons.D[it.id]
	if w.slot == 0:
		if f.inv[0] != null:
			drop_loose(f)
		f.inv[0] = it.id
		f.ammo[it.id] = {"mag": it.mag, "res": it.res}
		if f.is_player:
			player.equip_primary()
		else:
			f.cur = 0
			f.reload_end = 0.0
			f.rig.set_gun(it.id)
	else:
		var a: Dictionary = f.ammo["pistol"]
		a.res = mini(Weapons.D.pistol.max, a.res + it.mag + it.res)
	if f.is_player:
		sfx.ui("pickup")
	if near_item == it:
		near_item = null


func _item_near(f: Fighter, it: Dictionary, r: float) -> bool:
	var o: Vector3 = it.node.global_position
	var p := f.global_position
	return absf(o.x - p.x) < r and absf(o.z - p.z) < r and absf(o.y - p.y) < 1.6


func _update_items(dt: float) -> void:
	item_t -= dt
	if item_t > 0.0:
		return
	item_t = 0.1
	near_item = null
	if player.alive:
		var bd := 1e9
		for it in items.duplicate():
			if not _item_near(player, it, 1.5):
				it.no_auto = false
				continue
			var w: Dictionary = Weapons.D[it.id]
			if w.slot == 0 and player.inv[0] == null and not it.no_auto:   # 没有主武器：自动拾取
				take_item(player, it)
				continue
			if w.slot == 1:                                               # 手枪：补充弹药
				if player.ammo["pistol"].res < Weapons.D.pistol.max:
					take_item(player, it)
				continue
			var d: float = (it.node.global_position - player.global_position).length()
			if d < bd:
				bd = d
				near_item = it
	# 只有手枪的电脑路过时会捡起主武器
	for f in fighters:
		if f.is_player or not f.alive or f.inv[0] != null:
			continue
		for it in items:
			if Weapons.D[it.id].slot == 0 and _item_near(f, it, 1.3):
				take_item(f, it)
				break


# ======================= 购买 =======================
func buy(item: Dictionary) -> void:
	var p := player
	if not p.can_buy():
		hud.toast("购买时间已过")
		return
	var price: int = Weapons.D[item.w].price if item.has("w") else item.price
	var nm: String = Weapons.D[item.w].name if item.has("w") else item.name
	if item.has("w"):
		if p.inv[0] == item.w:
			hud.toast("已持有该武器")
			return
		if p.money < price:
			sfx.ui("click")
			hud.toast("资金不足")
			return
		if p.inv[0] != null:
			drop_loose(p)
		p.give_weapon(item.w)
		p.equip_primary()
	elif item.has("armor"):
		if p.armor >= 100:
			hud.toast("护甲已满")
			return
		if p.money < price:
			sfx.ui("click")
			hud.toast("资金不足")
			return
		p.armor = 100
	else:
		var need := false
		for id in p.inv:
			if id != null and not Weapons.D[id].has("melee") and (p.ammo[id].res < Weapons.D[id].max or p.ammo[id].mag < Weapons.D[id].mag):
				need = true
		if not need:
			hud.toast("弹药已满（备弹已达携带上限）")
			return
		if p.money < price:
			sfx.ui("click")
			hud.toast("资金不足")
			return
		for id in p.inv:
			if id != null and not Weapons.D[id].has("melee"):
				p.ammo[id].res = Weapons.D[id].max
				p.ammo[id].mag = maxi(p.ammo[id].mag, Weapons.D[id].mag)
		p.reload_end = 0.0
	p.money -= price
	sfx.ui("buy")
	hud.toast("已购买 %s  -$%d" % [nm, price])


# ======================= 回合流程 =======================
func in_game() -> bool:
	return state != "menu" and state != "matchEnd"


func new_match(team: String, diff_key: String) -> void:
	clear_items()
	for f in fighters:
		f.rig.holder.queue_free()
		f.rig.queue_free()
		f.queue_free()
	fighters.clear()
	if player != null and player.vm_root != null:
		player.vm_root.queue_free()
		player.flash_light.queue_free()
	score = {"blue": 0, "red": 0}
	round_no = 0
	time = 0.0
	diff = Weapons.DIFF[diff_key]
	hud.feed_items.clear()
	hud._refresh_feed()
	var names := NAMES.duplicate()
	names.shuffle()
	player = Player.new()
	add_child(player)
	player.setup(self, "你", team, true)
	player.sens = sens
	player.build_view(cam)
	player.rig.visible = false
	fighters.append(player)
	for t in ["blue", "red"]:
		for i in range(1 if t == team else 0, TEAM_SIZE):
			var b := Bot.new()
			add_child(b)
			b.setup(self, names.pop_back(), t, false)
			fighters.append(b)
	hud.menu.visible = false
	hud.end_panel.visible = false
	hud.set_hud_visible(true)
	paused = false
	start_round()
	if DisplayServer.get_name() != "headless":
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func start_round() -> void:
	round_no += 1
	state = "freeze"
	freeze_t = FREEZE_TIME
	round_t = ROUND_TIME
	clear_items()
	for b in bullets:
		b.on = false
	decal_i = 0
	decals.visible_instance_count = 0
	for team in ["blue", "red"]:
		var sp: Array = MapData.spawns[team].duplicate()
		sp.shuffle()
		var i := 0
		for f in fighters:
			if f.team != team:
				continue
			if not f.alive:
				f.inv[0] = null
				f.armor = 0
				f.cur = 1
				f.give_weapon("pistol")
			f.global_position = sp[i]
			f.velocity = Vector3.ZERO
			f.yaw = -PI / 2 if team == "blue" else PI / 2
			f.view_pitch = 0.0
			f.hp = 100
			f.alive = true
			f.reload_end = 0.0
			f.next_fire = 0.0
			f.heat = 0.0
			f.death_t = 1.0
			f.aim_pitch = 0.0
			f.col.disabled = false
			f.set_crouch(false)
			f.crouch = false
			f.shape.height = 1.8
			f.col.position.y = 0.9
			f.eye_h = 1.6
			f.rig.reset()
			f.rig.visible = not f.is_player
			if not f.is_player:
				(f as Bot).reset_ai()
				(f as Bot).buy()
			i += 1
		alive_n[team] = i
	player.scoped = false
	player.buy_open = false
	player.ads = 0.0
	player.punch_p = 0.0
	player.punch_y = 0.0
	spec_target = null
	hud.set_msg("第 %d 回合" % round_no, "按 B 购买装备", FREEZE_TIME)


func end_round(winner: String, why: String) -> void:
	state = "roundEnd"
	end_t = 4.5
	if winner != "":
		score[winner] += 1
	for f in fighters:
		f.money = mini(16000, f.money + (2600 if (winner != "" and f.team == winner) else 1500))
	hud.set_msg((TEAM_CN[winner] + "获胜") if winner != "" else "平局", why, 4.5)
	sfx.ui("win" if winner == player.team else "lose")
	player.buy_open = false


func _update_round(dt: float) -> void:
	if state == "freeze":
		freeze_t -= dt
		if freeze_t <= 0.0:
			state = "live"
			hud.set_msg("行动开始", "", 1.5)
			sfx.ui("go")
	elif state == "live":
		round_t -= dt
		var nb: int = alive_n.blue
		var nr: int = alive_n.red
		if nb == 0 or nr == 0:
			end_round("blue" if nb > 0 else ("red" if nr > 0 else ""), "敌方全员被歼灭")
		elif round_t <= 0.0:
			end_round("blue" if nb > nr else ("red" if nr > nb else ""), "时间耗尽，存活人数多的一方获胜")
	elif state == "roundEnd":
		end_t -= dt
		if end_t <= 0.0:
			if score.blue >= WIN_ROUNDS or score.red >= WIN_ROUNDS:
				state = "matchEnd"
				hud.show_end(score[player.team] >= WIN_ROUNDS, "蓝队 %d : %d 红队　·　你的战绩 %d 杀 / %d 死" % [score.blue, score.red, player.kills, player.deaths])
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			else:
				start_round()


func cycle_spec() -> void:
	var start := fighters.find(spec_target) if spec_target else -1
	for i in range(1, fighters.size() + 1):
		var f := fighters[(start + i) % fighters.size()]
		if f.alive and f.team == player.team:
			spec_target = f
			return
	spec_target = null


# ======================= 每帧 =======================
func _update_rigs(dt: float) -> void:
	for f in fighters:
		var rig := f.rig
		if f.alive:
			if f.is_player:
				continue
			var bot := f as Bot
			var sp := Vector2(f.velocity.x, f.velocity.z).length()
			rig.animate(dt, f.global_position, f.yaw, f.velocity, bot.target != null or time - f.last_shot < 1.2, f.aim_pitch, f.crouch, not f.is_on_floor(), f.sneak and bot.target == null)
			if sp > 3.5 and f.is_on_floor() and not f.crouch:   # 跑动脚步声
				f.step_d += sp * dt
				if f.step_d > 2.3:
					f.step_d = 0.0
					sfx.step(f.global_position, false)
		elif not rig.death.is_empty() and (f.death_t < 1.0 or not rig.drop.done):
			f.death_t = minf(1.0, f.death_t + dt / 0.85)
			if rig.global_position.y > f.ground_y:
				rig.global_position.y = maxf(f.ground_y, rig.global_position.y - 6.0 * dt)
			rig.animate_death(f.death_t, dt)
	for fl in flashes:
		if fl.t > 0.0:
			fl.t -= dt
			if fl.t <= 0.0:
				fl.n.visible = false
	for c in casings:
		if c.t > 0.0:
			c.t -= dt
			if c.t <= 0.0:
				c.n.freeze = true
				c.n.visible = false


func _update_camera(dt: float) -> void:
	if player.alive:
		player.update_view(dt)
		return
	player.vm_root.visible = false
	player.flash_light.light_energy = 0.0
	if spec_target and not spec_target.alive:
		spec_target = null
	if spec_target == null and time - player.last_death > 2.5:
		cycle_spec()
	var t: Fighter = spec_target if spec_target else player
	var tp := t.global_position if spec_target else player.rig.global_position
	var focus := tp + Vector3(0, 1.7 if spec_target else 0.7, 0)
	var back := Vector3(sin(t.yaw) * 3.2, 1.3, cos(t.yaw) * 3.2)
	var hit := ray_world(focus, back.normalized(), back.length())
	var k := 1.0
	if not hit.is_empty():
		k = maxf(0.3, (hit.position - focus).length() - 0.25) / back.length()
	cam.global_position = focus + back * k
	cam.look_at(focus)
	cam.fov += (75.0 - cam.fov) * (1.0 - exp(-22.0 * dt))


func _process(delta: float) -> void:
	var dt := minf(delta, 0.05)
	if in_game() and not paused:
		time += dt
		_update_round(dt)
		if state != "matchEnd":
			if player.alive:
				player.tick(dt)
			for f in fighters:
				if not f.is_player and f.alive:
					(f as Bot).tick(dt)
			_update_bullets(dt)
			_update_items(dt)
			_update_rigs(dt)
			_update_camera(dt)
			hud.update(dt)
	elif state == "menu":
		var a := Time.get_ticks_msec() / 9000.0
		var c := MapData.center()
		cam.global_position = c + Vector3(cos(a) * 30.0, 22.0, sin(a) * 26.0)
		cam.look_at(c)
	# 浏览器里按 Esc 会直接释放鼠标且不把按键传给游戏：鼠标持续未锁定就进入暂停。
	# 锁定是异步的，所以留半秒宽限；自动暂停后一旦重新锁定就自动继续。
	if in_game() and test_args.is_empty() and DisplayServer.get_name() != "headless":
		var captured := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
		if not paused:
			unlocked_t = 0.0 if captured else unlocked_t + delta
			if unlocked_t > 0.5:
				paused = true
				auto_paused = true
				hud.pause_label.visible = true
		elif auto_paused and captured:
			paused = false
			auto_paused = false
			unlocked_t = 0.0
			hud.pause_label.visible = false
	_test_hooks()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var code: Key = event.physical_keycode
		if code == KEY_F3:
			hud.show_fps = not hud.show_fps
			hud.L.fps.visible = hud.show_fps and in_game()
		if not in_game():
			return
		if code == KEY_ESCAPE:
			paused = true
			hud.pause_label.visible = true
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif not paused:
			player.on_key(code)
	elif event is InputEventKey and not event.pressed:
		if event.physical_keycode == KEY_TAB and player != null:
			player.board_open = false
	elif event is InputEventMouseButton and in_game():
		if paused:
			if event.pressed:
				paused = false
				auto_paused = false
				unlocked_t = 0.0
				hud.pause_label.visible = false
				Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		else:
			player.on_mouse(event.button_index, event.pressed)
	elif event is InputEventMouseMotion and in_game() and not paused and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		player.look(event.relative)


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and in_game() and not paused and test_args.is_empty():
		paused = true
		hud.pause_label.visible = true
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


# ======================= 自动化测试 / 截图 =======================
func _test_hooks() -> void:
	if test_args.is_empty():
		return
	test_frames += 1
	if test_args.has("autotest"):
		if player.alive:
			player.hp = 100
		if test_frames % 600 == 0:
			var moving := 0
			for f in fighters:
				if f.alive and not f.is_player and Vector2(f.velocity.x, f.velocity.z).length() > 3.4:
					moving += 1
			print("t=%.0f state=%s score=%d:%d alive=%d/%d items=%d running=%d" % [time, state, score.blue, score.red, alive_n.blue, alive_n.red, items.size(), moving])
		if time > float(test_args.autotest):
			print("AUTOTEST DONE")
			get_tree().quit()
	elif test_args.has("shot"):
		DebugScenes.run(self, test_args, test_frames)
