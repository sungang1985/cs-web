class_name Player
extends Fighter
## 玩家：输入、移动、射击与后坐力、机瞄 / 开镜、第一人称武器。

var mouse_down := false
var fire_pressed := false
var rmb := false
var scoped := false
var ads := 0.0
var sway := Vector2.ZERO
var vm_kick := 0.0
var vm_switch := 0.0
var bob := 0.0
var flash_t := 0.0
var vm_dip := 0.0
var was_ground := true
var punch_p := 0.0
var punch_y := 0.0
var last_slot := 1
var semi := {}
var buy_open := false
var board_open := false
var sens := 1.0

var cam: Camera3D
var vm_root: Node3D
var vm_guns := {}
var flash: MeshInstance3D
var flash_light: OmniLight3D


func build_view(camera: Camera3D) -> void:
	cam = camera
	vm_root = Node3D.new()
	cam.add_child(vm_root)
	var sleeve: Color = Soldier.PAL[team].uni
	for id in Weapons.D.keys():
		var g := Node3D.new()
		var gm := MeshInstance3D.new()
		gm.mesh = GunMesh.get_mesh(id)
		gm.material_override = _vm_mat(GunMesh.material())
		gm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		g.add_child(gm)
		var info: Dictionary = Weapons.GUN[id]
		var rh: Vector3 = info.grip + Vector3(0.012, -0.012, 0.012)
		_limb(g, Vector3(0.11, -0.2, 0.42), rh, 0.043, sleeve)
		_hand(g, rh, 0.85)
		if id != "knife":
			var lh: Vector3 = info.fore + (Vector3(-0.012, -0.03, 0) if info.long else Vector3.ZERO)
			var elb := Vector3(-0.24, -0.26, lh.z + 0.36) if info.long else Vector3(-0.2, -0.24, 0.4)
			_limb(g, elb, lh, 0.043, sleeve)
			_hand(g, lh, 1.1 if info.long else 0.85)
		g.visible = false
		vm_root.add_child(g)
		vm_guns[id] = g
	flash = MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(0.26, 0.26)
	flash.mesh = qm
	flash.material_override = _vm_mat(main.flash_material())
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	flash.visible = false
	vm_root.add_child(flash)
	flash_light = OmniLight3D.new()
	flash_light.light_color = Color(1.0, 0.75, 0.4)
	flash_light.omni_range = 9.0
	flash_light.light_energy = 0.0
	flash_light.position = Vector3(0.1, 0, -0.9)
	cam.add_child(flash_light)


## 第一人称材质：单独的视野并压缩深度，避免枪穿进墙里（需要引擎支持，不支持时自动忽略）
func _vm_mat(base: StandardMaterial3D) -> StandardMaterial3D:
	var m: StandardMaterial3D = base.duplicate()
	if "use_fov_override" in m:
		m.set("use_fov_override", true)
		m.set("fov_override", 52.0)
	if "use_z_clip_scale" in m:
		m.set("use_z_clip_scale", true)
		m.set("z_clip_scale", 0.12)
	return m


func _limb(parent: Node3D, a: Vector3, b: Vector3, r: float, c: Color) -> void:
	var d := b - a
	var mi := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = r
	cm.height = maxf(d.length(), r * 2.0)
	cm.radial_segments = 10
	cm.rings = 3
	mi.mesh = cm
	mi.material_override = _vm_mat(Soldier.mat(c))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.transform = Transform3D(Basis(Quaternion(Vector3.UP, d.normalized())), (a + b) * 0.5)
	parent.add_child(mi)


func _hand(parent: Node3D, p: Vector3, sx: float) -> void:
	var mi := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.042
	sm.height = 0.084
	sm.radial_segments = 10
	sm.rings = 5
	mi.mesh = sm
	mi.material_override = _vm_mat(Soldier.mat(Color("1c1c1e")))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.transform = Transform3D(Basis.IDENTITY.scaled(Vector3(sx, 1.05, 1.15)), p)
	parent.add_child(mi)


func can_buy() -> bool:
	return alive and (main.state == "freeze" or (main.state == "live" and main.round_t > Main.ROUND_TIME - Main.BUY_WINDOW))


func switch_to(slot: int) -> void:
	if not alive or inv[slot] == null or slot == cur:
		return
	last_slot = cur
	cur = slot
	reload_end = 0.0
	scoped = false
	next_fire = maxf(next_fire, main.time + 0.3)
	vm_switch = 1.0
	heat = 0.0


func equip_primary() -> void:
	var ls := last_slot if cur == 0 else cur
	cur = -1
	switch_to(0)
	last_slot = ls


func look(rel: Vector2) -> void:
	if not alive:
		return
	var s := 0.0022 * sens * (0.28 if scoped else 1.0 - 0.3 * ads)
	sway.x = clampf(sway.x + rel.x * 0.00012, -0.05, 0.05)
	sway.y = clampf(sway.y + rel.y * 0.00012, -0.04, 0.04)
	yaw -= rel.x * s
	view_pitch = clampf(view_pitch - rel.y * s, -1.5, 1.5)


func on_key(code: Key) -> void:
	if code == KEY_TAB:
		board_open = true
	if not alive:
		return
	if code == KEY_B:
		if not buy_open and not can_buy():
			main.hud.toast("只能在回合开始阶段购买")
		buy_open = can_buy() and not buy_open
	elif buy_open and ((code >= KEY_1 and code <= KEY_6) or (code >= KEY_KP_1 and code <= KEY_KP_6)):
		main.buy(Weapons.BUY[(code - KEY_1) if code <= KEY_9 else (code - KEY_KP_1)])
	elif code >= KEY_1 and code <= KEY_3:
		switch_to(code - KEY_1)
	elif code == KEY_Q:
		switch_to(last_slot)
	elif code == KEY_R:
		start_reload()
		if reload_end > 0.0:
			scoped = false
	elif code == KEY_E:
		if main.near_item != null:
			main.take_item(self, main.near_item)
	elif code == KEY_G:
		if inv[0] != null:
			main.drop_loose(self)
			if cur == 0:
				cur = -1
				switch_to(1)
			last_slot = 1
	elif code == KEY_V:
		var w := cur_w()
		if w.get("auto", false):
			semi[w.id] = not semi.get(w.id, false)
			main.sfx.ui("click")
			main.hud.toast("射击模式：单发" if semi[w.id] else "射击模式：连发")


func on_mouse(button: int, pressed: bool) -> void:
	if button == MOUSE_BUTTON_LEFT:
		mouse_down = pressed
		if pressed:
			fire_pressed = true
			if not alive:
				main.cycle_spec()
	elif button == MOUSE_BUTTON_RIGHT:
		rmb = pressed
		if pressed and alive and cur_w().has("scope") and reload_end <= 0.0:
			scoped = not scoped
	elif pressed and alive and (button == MOUSE_BUTTON_WHEEL_UP or button == MOUSE_BUTTON_WHEEL_DOWN):
		var dir := 1 if button == MOUSE_BUTTON_WHEEL_DOWN else -1
		for i in range(1, 4):
			var s := (cur + dir * i + 6) % 3
			if inv[s] != null:
				switch_to(s)
				break


func tick(dt: float) -> void:
	var w := cur_w()
	var act := main.state == "live" or main.state == "roundEnd"
	var ix := 0.0
	var iz := 0.0
	if act:
		ix = float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A))
		iz = float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
	var il := maxf(1.0, Vector2(ix, iz).length())
	ix /= il
	iz /= il
	set_crouch(Input.is_physical_key_pressed(KEY_C) or Input.is_physical_key_pressed(KEY_CTRL))
	var walking := Input.is_physical_key_pressed(KEY_SHIFT)
	sneak = walking
	# 机瞄：按住右键（狙击枪为开镜）
	var want_ads := rmb and not w.has("scope") and not w.has("melee") and reload_end <= 0.0 and not buy_open and vm_switch <= 0.0
	ads += ((1.0 if want_ads else 0.0) - ads) * (1.0 - exp(-16.0 * dt))
	if ads < 0.002:
		ads = 0.0
	var sp: float = RUN * w.speed * (0.42 if crouch else (0.5 if walking else 1.0)) * (0.5 if scoped else 1.0) * (1.0 - 0.32 * ads)
	var sn := sin(yaw)
	var cs := cos(yaw)
	var wish := Vector3((ix * cs + iz * sn) * sp, 0, (-ix * sn + iz * cs) * sp)
	var k := 1.0 - exp(-(14.0 if is_on_floor() else 2.5) * dt)
	velocity.x += (wish.x - velocity.x) * k
	velocity.z += (wish.z - velocity.z) * k
	if Input.is_physical_key_pressed(KEY_SPACE) and act:
		jump()
	var fall_v := velocity.y
	move(dt)
	if is_on_floor() and not was_ground and fall_v < -3.0:   # 落地下沉
		vm_dip = minf(1.0, -fall_v / 9.0)
		main.sfx.step(global_position, true)
	was_ground = is_on_floor()
	eye_h += ((1.05 if crouch else 1.6) - eye_h) * (1.0 - exp(-14.0 * dt))
	var hs := Vector2(velocity.x, velocity.z).length()
	if is_on_floor():
		bob += hs * dt * 1.9
		if hs > 3.5 and not crouch:
			step_d += hs * dt
			if step_d > 2.3:
				step_d = 0.0
				main.sfx.step(global_position, true)

	# 武器
	if reload_end > 0.0 and main.time >= reload_end:
		finish_reload(w)
	if main.time - last_shot > w.rate * 1.6:
		heat = maxf(0.0, heat - dt * 9.0)
	var want: bool = mouse_down and ((w.get("auto", false) and not semi.get(w.id, false)) or fire_pressed) and not buy_open
	if want and w.has("shell") and reload_end > 0.0 and ammo[w.id].mag > 0:
		reload_end = 0.0   # 开火打断装填
	fire_pressed = false
	if want and act and main.time >= next_fire and reload_end <= 0.0:
		var fwd := -cam.global_transform.basis.z
		if w.has("melee"):
			next_fire = main.time + w.rate
			vm_kick = 1.6
			main.sfx.ui("swish")
			var best: Fighter = null
			var bt: float = w.range
			for e in main.fighters:
				if not e.alive or e.team == team:
					continue
				var t := e.ray_hit(eye(), fwd)
				if t >= 0.0 and t < bt:
					bt = t
					best = e
			if best:
				main.fx_blood(best.global_position + Vector3(0, 1.2, 0))
				main.hurt(best, w.dmg, self, false, w)
		else:
			var a: Dictionary = ammo[w.id]
			if a.mag > 0:
				a.mag -= 1
				next_fire = main.time + w.rate
				var s: float = (w.unscoped if (w.has("scope") and not scoped) else w.spread * (1.0 - 0.5 * ads)) + heat * w.heat * (1.0 - 0.3 * ads) + (hs / RUN) * w.move + (0.0 if is_on_floor() else 0.07)
				if crouch:
					s *= 0.7
				main.fire_weapon(self, fwd, w, s)
				# 后坐力轨迹：前几发主要上跳，之后左右摆动
				var n := heat
				var kk: float = w.kick * (1.0 - 0.35 * ads) * (0.8 if crouch else 1.0)
				punch_p += kk * ((0.75 + n * 0.06) if n < 9.0 else 0.45)
				punch_y += kk * (randf_range(-0.12, 0.12) if n < 3.0 else sin((n - 3.0) * 0.55) * 0.55 + randf_range(-0.1, 0.1))
				heat = minf(12.0, heat + 1.0)
				vm_kick = 1.0
				flash_t = 0.045
				flash.rotation.z = randf() * 6.0
				flash.scale = Vector3.ONE * randf_range(0.8, 1.3) * (1.6 if (w.id == "shotgun" or w.id == "sniper") else 1.0)
				if w.has("scope"):
					scoped = false
				if a.mag == 0 and a.res > 0:
					start_reload()
			else:
				main.sfx.ui("click")
				next_fire = main.time + 0.25
				start_reload()
	var dec := exp(-7.0 * dt)
	punch_p *= dec
	punch_y *= dec


func update_view(dt: float) -> void:
	var fov := 75.0
	cam.global_position = eye() - Vector3(0, vm_dip * 0.07, 0)
	cam.rotation = Vector3(clampf(view_pitch + punch_p, -1.55, 1.55), yaw + punch_y, 0)
	if scoped:
		fov = 18.0
	else:
		fov = 75.0 - 20.0 * ads
	cam.fov += (fov - cam.fov) * (1.0 - exp(-22.0 * dt))
	var show := not scoped
	vm_root.visible = show
	flash_t -= dt
	flash_light.light_energy = 2.5 if flash_t > 0.0 else 0.0
	if not show:
		return
	var id: String = inv[cur]
	for kk in vm_guns:
		vm_guns[kk].visible = kk == id
	vm_kick = maxf(0.0, vm_kick - dt * 9.0)
	vm_switch = maxf(0.0, vm_switch - dt * 4.0)
	vm_dip = maxf(0.0, vm_dip - dt * 4.5)
	sway *= exp(-9.0 * dt)
	var hs := Vector2(velocity.x, velocity.z).length() / RUN
	var rl := 0.0
	if reload_end > 0.0:
		rl = sin(minf(1.0, 1.0 - (reload_end - main.time) / maxf(reload_dur, 0.01)) * PI)
	var melee := id == "knife"
	var G: Dictionary = Weapons.GUN[id]
	var lng: bool = G.long
	var k := ads * ads * (3.0 - 2.0 * ads)
	var bk := 1.0 - 0.8 * k
	var hx := 0.15 if lng else (0.17 if melee else 0.13)
	var hy := -0.16 if lng else (-0.17 if melee else -0.12)
	var hz := -0.45 if lng else -0.5
	var ay: float = -G.sight - 0.004
	var az := -0.42 if lng else -0.45
	vm_root.position = Vector3(
		hx + (0.0 - hx) * k + cos(bob) * 0.006 * hs * bk - sway.x * 0.5 * bk,
		hy + (ay - hy) * k - absf(sin(bob)) * 0.01 * hs * bk - vm_switch * 0.3 - rl * 0.16 + sway.y * 0.4 * bk - vm_dip * 0.05,
		hz + (az - hz) * k + vm_kick * (-0.12 if melee else 0.035 * (1.0 - 0.4 * k)))
	vm_root.rotation_order = EULER_ORDER_XYZ
	vm_root.rotation = Vector3(
		vm_kick * (-0.5 if melee else 0.05 * (1.0 - 0.6 * k)) - rl * 0.7 - vm_switch * 0.6 + sway.y * 0.8 * bk - vm_dip * 0.12,
		0.03 * (1.0 - k) + (vm_kick * 0.4 + 0.25 if melee else 0.0) + sway.x * 1.2 * bk,
		rl * 0.4 + (0.5 if melee else 0.0) + sway.x * 0.8 * bk)
	flash.visible = flash_t > 0.0 and not melee
	if flash.visible:
		flash.position = Vector3(0, G.mv, G.mz - 0.05)
