class_name Fighter
extends CharacterBody3D
## 战斗单位基类（玩家与电脑共用）：生命、武器、弹药、换弹、碰撞体与命中判定。

const GRAV := 20.0
const JUMP_V := 6.8
const RUN := 5.4
const R_BODY := 0.35

var main: Main
var fname := ""
var team := "blue"
var is_player := false
var hp := 100
var armor := 0
var alive := false
var money := 800
var kills := 0
var deaths := 0
var inv: Array = [null, "pistol", "knife"]
var cur := 1
var ammo := {}
var next_fire := 0.0
var reload_end := 0.0
var reload_dur := 1.0
var last_shot := -9.0
var heat := 0.0
var shot_n := 0
var death_t := 1.0
var ground_y := 0.0
var last_death := 0.0
var crouch := false
var eye_h := 1.6
var yaw := 0.0
var view_pitch := 0.0
var sneak := false
var aim_pitch := 0.0
var step_d := 0.0
var rig: Soldier
var shape: CapsuleShape3D
var col: CollisionShape3D
# 命中判定输出
var hit_head := false
var hit_zone := 1.0


func setup(m: Main, n: String, t: String, player: bool) -> void:
	main = m
	fname = n
	team = t
	is_player = player
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = 0.15
	shape = CapsuleShape3D.new()
	shape.radius = R_BODY
	shape.height = 1.8
	col = CollisionShape3D.new()
	col.shape = shape
	col.position.y = 0.9
	add_child(col)
	rig = Soldier.new()
	main.add_child(rig)
	rig.build(team, main)


func cur_w() -> Dictionary:
	return Weapons.D[inv[cur]]


func eye() -> Vector3:
	return global_position + Vector3(0, eye_h, 0)


func give_weapon(id: String) -> void:
	var w: Dictionary = Weapons.D[id]
	inv[w.slot] = id
	if not w.has("melee"):
		ammo[id] = {"mag": w.mag, "res": w.res}


func set_crouch(c: bool) -> void:
	if c == crouch:
		return
	if not c:
		# 头顶有遮挡时不能站起
		var q := PhysicsRayQueryParameters3D.create(global_position + Vector3(0, 1.0, 0), global_position + Vector3(0, 1.85, 0), 1)
		if not get_world_3d().direct_space_state.intersect_ray(q).is_empty():
			return
	crouch = c
	shape.height = 1.25 if c else 1.8
	col.position.y = shape.height * 0.5


func start_reload() -> void:
	var w := cur_w()
	if w.has("melee") or reload_end > 0.0:
		return
	var a: Dictionary = ammo[w.id]
	if a.mag >= w.mag:
		return
	if a.res <= 0:
		if is_player:
			return
		a.res = w.mag * 2
	reload_dur = w.reload + 0.35 if w.has("shell") else w.reload
	reload_end = main.time + reload_dur
	if is_player:
		main.sfx.ui("reload")


func finish_reload(w: Dictionary) -> void:
	var a: Dictionary = ammo[w.id]
	if w.has("shell"):   # 霰弹枪逐发装填，可开火打断
		a.mag += 1
		a.res -= 1
		if a.mag < w.mag and a.res > 0:
			reload_dur = w.reload
			reload_end = main.time + w.reload
			if is_player:
				main.sfx.ui("click")
		else:
			reload_end = 0.0
		return
	var cap: int = w.mag + (1 if a.mag > 0 else 0)   # 弹匣未打空时换弹，膛内保留一发
	var n: int = mini(cap - a.mag, a.res)
	a.mag += n
	a.res -= n
	reload_end = 0.0


## 重力 + 移动。调用前先设置 velocity.x / velocity.z
func move(dt: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAV * dt
	move_and_slide()


func jump() -> void:
	if is_on_floor():
		velocity.y = JUMP_V


## 射线与身体（包围盒）和头部（球）求交，返回距离；未命中返回 -1。结果写入 hit_head / hit_zone
func ray_hit(o: Vector3, d: Vector3) -> float:
	var p := global_position
	var hh := eye_h + 0.15
	var t_body := INF
	var t_head := INF
	var t0 := 0.0
	var t1 := INF
	var ok := true
	var lo := Vector3(p.x - 0.3, p.y, p.z - 0.3)
	var hi := Vector3(p.x + 0.3, p.y + hh - 0.34, p.z + 0.3)
	for i in 3:
		if absf(d[i]) < 1e-9:
			if o[i] < lo[i] or o[i] > hi[i]:
				ok = false
				break
		else:
			var ta := (lo[i] - o[i]) / d[i]
			var tb := (hi[i] - o[i]) / d[i]
			if ta > tb:
				var tmp := ta
				ta = tb
				tb = tmp
			t0 = maxf(t0, ta)
			t1 = minf(t1, tb)
	if ok and t0 <= t1:
		t_body = t0
	var c := Vector3(p.x, p.y + hh - 0.17, p.z) - o
	var b := c.dot(d)
	var disc := b * b - c.length_squared() + 0.04
	if disc >= 0.0 and b > 0.0:
		t_head = maxf(0.0, b - sqrt(disc))
	if t_head == INF and t_body == INF:
		return -1.0
	hit_head = t_head <= t_body + 0.35
	if hit_head:
		hit_zone = 4.0
		return t_head
	var rel := (o.y + d.y * t_body - p.y) / hh   # 腿 0.75 / 腹 1.25 / 胸 1
	hit_zone = 0.75 if rel < 0.45 else (1.25 if rel < 0.6 else 1.0)
	return t_body
