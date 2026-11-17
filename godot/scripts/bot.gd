class_name Bot
extends Fighter
## 电脑 AI：感知（视野、枪声、脚步）、寻路、交火（点射、横移、蹲射、跳跃躲闪）、购买与拾取。

var path := PackedVector3Array()
var pi := 0
var target: Fighter = null
var react := 0.0
var think_t := 0.0
var strafe_dir := 0
var strafe_t := 0.0
var burst := 0
var pause_t := 0.0
var stuck_t := 0.0
var stuck_pos := Vector3.ZERO
var look_pos := Vector3.ZERO
var look_until := 0.0
var last_seen := Vector3.ZERO
var has_seen := false
var hear_t := 0.0
var stance_t := 0.0
var sneak_c := false


func reset_ai() -> void:
	path = PackedVector3Array()
	pi = 0
	target = null
	has_seen = false
	look_until = 0.0
	hear_t = 0.0
	stance_t = 0.0
	sneak = false
	burst = 0


func go_to(p: Vector3, sneak_: bool = false) -> void:
	var pth := main.find_path(global_position, p)
	if pth.size() > 1:
		sneak = sneak_
		sneak_c = sneak_ and randf() < 0.3
		path = pth
		pi = 1
		stuck_t = 0.0
		stuck_pos = global_position


func look_toward(p: Vector3, dur: float) -> void:
	look_pos = p
	look_until = main.time + dur


func pick_goal() -> void:
	var foe := "red" if team == "blue" else "blue"
	if inv[0] == null:   # 只有手枪：优先去捡附近地上的主武器
		for it in main.items:
			var ip: Vector3 = it.node.global_position
			if Weapons.D[it.id].slot == 0 and absf(ip.x - global_position.x) + absf(ip.z - global_position.z) < 30.0:
				go_to(ip)
				if path.size() > 1:
					return
	# 残局或回合后半段：主动搜索敌人的大致位置
	if (main.alive_n[foe] <= 2 or main.round_t < Main.ROUND_TIME - 30.0) and randf() < 0.75:
		var best: Fighter = null
		var bd := 1e9
		for e in main.fighters:
			if not e.alive or e.team != foe:
				continue
			var d := absf(e.global_position.x - global_position.x) + absf(e.global_position.z - global_position.z) + randf() * 20.0
			if d < bd:
				bd = d
				best = e
		if best:
			go_to(best.global_position + Vector3(randf_range(-4, 4), 0, randf_range(-4, 4)), bd < 16.0 and randf() < 0.3)
			if path.size() > 9:
				path.resize(9)
			return
	var r := randf()
	var c := MapData.center()
	if r < 0.5:
		go_to(MapData.spawns[foe][randi() % MapData.spawns[foe].size()])
	elif r < 0.7:
		go_to(c + Vector3(randf_range(-8, 8), 0, randf_range(-8, 8)))
	else:
		go_to(Vector3(randf_range(2, c.x * 2 - 2), 0, randf_range(2, c.z * 2 - 2)), randf() < 0.06)


func tick(dt: float) -> void:
	var w := cur_w()
	var act := main.state == "live" or main.state == "roundEnd"
	if reload_end > 0.0 and main.time >= reload_end:
		finish_reload(w)
	eye_h += ((1.05 if crouch else 1.6) - eye_h) * (1.0 - exp(-12.0 * dt))
	if not act:
		velocity.x = 0
		velocity.z = 0
		set_crouch(false)
		move(dt)
		return
	var pos := global_position

	# 感知
	think_t -= dt
	if think_t <= 0.0:
		think_t = randf_range(0.1, 0.2)
		var best: Fighter = null
		var bd := 80.0
		for e in main.fighters:
			if not e.alive or e.team == team:
				continue
			var dv := e.global_position - pos
			var d := Vector2(dv.x, dv.z).length()
			if d >= bd:
				continue
			var ang := absf(angle_difference(yaw, atan2(-dv.x, -dv.z)))
			if not (ang < 1.25 or d < 5.0 or e == target):
				continue
			if main.can_see(self, e):
				bd = d
				best = e
		if best:
			if target != best:
				react = main.diff.react * randf_range(0.7, 1.4)
				burst = 0
				pause_t = 0.0
			target = best
			last_seen = best.global_position
			has_seen = true
		elif target:
			target = null
			set_crouch(false)
			if has_seen:
				go_to(last_seen, randf() < 0.2)
		elif main.time >= hear_t:   # 听脚步：附近有敌人在跑动（静步/蹲行听不到）
			for e in main.fighters:
				if not e.alive or e.team == team or e.crouch or not e.is_on_floor():
					continue
				var dv := e.global_position - pos
				if absf(dv.x) + absf(dv.z) < 11.0 and Vector2(e.velocity.x, e.velocity.z).length_squared() > 12.0:
					hear_t = main.time + 2.0
					look_toward(e.global_position, 1.8)
					go_to(e.global_position, randf() < 0.5)
					break

	var mv := Vector3.ZERO
	var speed: float = RUN * 0.92 * w.speed
	if target and target.alive:
		var t := target
		var dv := t.global_position - pos
		var dist := Vector2(dv.x, dv.z).length()
		var dy := t.global_position.y + t.eye_h * 0.72 - (pos.y + eye_h)
		var want := atan2(-dv.x, -dv.z)
		var da := angle_difference(yaw, want)
		yaw += clampf(da, -main.diff.turn * dt, main.diff.turn * dt)
		aim_pitch = atan2(dy, dist)
		react -= dt
		strafe_t -= dt
		if strafe_t <= 0.0:
			strafe_dir = randi() % 3 - 1
			strafe_t = randf_range(0.4, 1.1)
			if dist < 10.0 and not crouch and randf() < 0.18:   # 近战时偶尔跳跃躲闪
				jump()
		stance_t -= dt
		if stance_t <= 0.0:   # 中远距离不时蹲下射击
			if not crouch and dist > 9.0 and is_on_floor() and randf() < 0.45:
				set_crouch(true)
				stance_t = randf_range(1.0, 2.6)
			else:
				set_crouch(false)
				stance_t = randf_range(1.2, 3.5)
		if dist < 6.0:
			set_crouch(false)
		var right := Vector3(cos(yaw), 0, -sin(yaw))
		mv = right * strafe_dir * speed * (0.18 if crouch else 0.55)
		var pref := 7.0 if w.id == "shotgun" else 28.0
		if dist > pref and not crouch:
			mv += Vector3(dv.x, 0, dv.z) / dist * speed * 0.6
		var a: Dictionary = ammo[w.id]
		if a.mag <= 0:
			start_reload()
		elif react <= 0.0 and absf(da) < 0.3 and reload_end <= 0.0 and main.time >= next_fire:
			pause_t -= dt
			if burst <= 0 and pause_t <= 0.0:
				burst = (2 + randi() % 5) if w.auto else 1
			if burst > 0:
				burst -= 1
				a.mag -= 1
				next_fire = main.time + (w.rate if w.auto else w.rate * randf_range(1.6, 3.0))
				if burst == 0:
					pause_t = randf_range(0.25, 0.6) if w.auto else 0.0
				var ft: float = dist / w.v   # 提前量 + 弹道下坠补偿
				var aim := Vector3(dv.x + t.velocity.x * ft, dy + 4.9 * ft * ft, dv.z + t.velocity.z * ft).normalized()
				var err: float = main.diff.err * (1.0 + Vector2(t.velocity.x, t.velocity.z).length() * 0.1)
				if w.id == "sniper":
					err *= 0.5
				if crouch:
					err *= 0.75
				if not is_on_floor():
					err *= 2.0
				main.fire_weapon(self, main.spread_dir(aim, err, true), w, w.spread)
	else:
		aim_pitch = 0.0
		set_crouch(sneak and sneak_c and is_on_floor())   # 部分静步改为蹲行
		if reload_end <= 0.0 and not w.has("melee") and ammo[w.id].mag < w.mag * 0.4:
			start_reload()
		if path.size() < 2 or pi >= path.size():
			pick_goal()
		if pi < path.size():
			var wp := path[pi]
			var dv := Vector3(wp.x - pos.x, 0, wp.z - pos.z)
			var d := dv.length()
			if d < 0.45:
				pi += 1
			else:
				var sp2 := speed * (0.42 if crouch else (0.5 if sneak else 1.0))   # 默认奔跑；静步 / 蹲行接近
				mv = dv / d * sp2
				if is_on_floor() and MapData.height_at(wp.x, wp.z) > pos.y + 0.1 and d < 1.9:   # 前方是矮箱：起跳
					jump()
				var want := atan2(-dv.x, -dv.z)
				if main.time < look_until:
					want = atan2(-(look_pos.x - pos.x), -(look_pos.z - pos.z))
				yaw += clampf(angle_difference(yaw, want), -6.0 * dt, 6.0 * dt)
			stuck_t += dt
			if stuck_t > 1.2:
				if Vector2(pos.x - stuck_pos.x, pos.z - stuck_pos.z).length() < 0.5:
					path = PackedVector3Array()
					if randf() < 0.5:
						jump()
				stuck_t = 0.0
				stuck_pos = pos
	# 互相避让
	for o in main.fighters:
		if o == self or not o.alive:
			continue
		var dv := Vector3(pos.x - o.global_position.x, 0, pos.z - o.global_position.z)
		var d := dv.length()
		if d < 0.8 and d > 0.001:
			mv += dv / d * 2.0
	velocity.x = mv.x
	velocity.z = mv.z
	move(dt)


func buy() -> void:
	if inv[0] != null:
		var w: Dictionary = Weapons.D[inv[0]]
		ammo[inv[0]] = {"mag": w.mag, "res": w.max}
	else:
		var opts: Array = []
		if money >= 4500 + 650 and randf() < 0.15:
			opts = ["sniper"]
		elif money >= 2700:
			opts = ["rifle", "rifle", "smg"]
		elif money >= 1700:
			opts = ["smg", "shotgun", "smg"]
		if not opts.is_empty():
			var id: String = opts[randi() % opts.size()]
			money -= Weapons.D[id].price
			give_weapon(id)
	if armor < 100 and money >= 650:
		money -= 650
		armor = 100
	ammo["pistol"] = {"mag": Weapons.D.pistol.mag, "res": Weapons.D.pistol.res}
	cur = 0 if inv[0] != null else 1
	rig.set_gun(inv[cur])
