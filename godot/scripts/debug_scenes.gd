class_name DebugScenes
## 仅用于自动截图检查画面（命令行： -- --shot=路径 --scene=poses|vm|fight|death）。


static func run(m: Main, args: Dictionary, frame: int) -> void:
	var scene: String = args.get("scene", "poses")
	var shot_frame := int(args.get("frame", "150"))
	var p := m.player
	p.hp = 100
	if scene != "fight":
		var a: Fighter = m.fighters[1]
		var b: Fighter = m.fighters[6]
		p.global_position = Vector3(9, 0, 15)
		p.yaw = -PI / 2
		p.view_pitch = -0.12
		for i in range(2, m.fighters.size()):
			if i != 6:
				m.fighters[i].global_position.x = 60.0
		if scene == "poses" or scene == "vm":
			a.global_position = Vector3(11.4, 0, 14.1)
			a.yaw = PI / 2 + 0.6
			b.global_position = Vector3(11.6, 0, 16.0)
			b.yaw = PI / 2 - 1.0
			a.rig.set_gun("rifle")
			b.rig.set_gun("smg")
			if args.has("aim"):
				a.last_shot = m.time
				b.last_shot = m.time
			if args.has("gun") and frame == 5:
				p.give_weapon(args.gun)
				p.cur = Weapons.D[args.gun].slot
			if args.has("ads"):
				p.rmb = true
		elif scene == "death":
			if frame < 20:
				a.global_position = Vector3(11.4, 0, 14.1)
				a.yaw = PI / 2 + 0.6
				b.global_position = Vector3(11.6, 0, 16.0)
				b.yaw = PI / 2 - 1.0
				p.view_pitch = -0.3
			if frame == 20:
				m.state = "live"
				m.kill(a, p, false, Weapons.D.pistol)
				m.kill(b, m.fighters[2], false, Weapons.D.pistol)
			p.view_pitch = -0.3
	if frame == shot_frame:
		m.get_viewport().get_texture().get_image().save_png(args.shot)
		print("SHOT SAVED")
		m.get_tree().quit()
