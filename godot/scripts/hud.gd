class_name Hud
extends CanvasLayer
## 界面：HUD、准星 / 雷达 / 受击方向（自绘）、购买菜单、计分板、主菜单。

const C_HUD := Color("ffd27a")
const C_BLUE := Color("6fb1ff")
const C_RED := Color("ff7b6b")

var main: Main
var root: Control
var overlay: Control
var vignette: ColorRect
var L := {}            # 文本标签
var feed: RichTextLabel
var feed_items: Array = []
var buy_panel: PanelContainer
var buy_text: RichTextLabel
var board_panel: PanelContainer
var board_text: RichTextLabel
var menu: Control
var end_panel: Control
var pause_label: Label
var hud_nodes: Array = []
var radar_tex: ImageTexture
var msg_until := 0.0
var toast_t := 0.0
var hit_t := 0.0
var hit_hs := false
var dir_t := 0.0
var dir_ang := 0.0
var dmg_flash := 0.0
var seen: Array = []
var seen_t := 0.0
var show_fps := false
var choice := {"team": "blue", "diff": "normal"}


func build(m: Main) -> void:
	main = m
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var th := Theme.new()
	if ResourceLoader.exists("res://fonts/cjk.ttf"):
		th.default_font = load("res://fonts/cjk.ttf")
	th.default_font_size = 16
	root.theme = th
	add_child(root)

	vignette = ColorRect.new()
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sm := ShaderMaterial.new()
	var sh := Shader.new()
	sh.code = "shader_type canvas_item;\nuniform float hurt = 0.0;\nvoid fragment(){ vec2 q = UV - 0.5; float r = length(q * vec2(1.6, 1.0)); float v = smoothstep(0.45, 1.05, r) * 0.42; float h = hurt * smoothstep(0.25, 0.85, r) * 0.75; COLOR = vec4(mix(vec3(0.0), vec3(0.55, 0.0, 0.0), h / max(v + h, 0.001)), min(1.0, v + h)); }"
	sm.shader = sh
	vignette.material = sm
	root.add_child(vignette)

	overlay = Control.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.draw.connect(_draw_overlay)
	root.add_child(overlay)

	for def in [
		["hp", 38, C_HUD], ["armor", 38, C_HUD], ["hp_t", 12, C_HUD], ["armor_t", 12, C_HUD], ["ammo", 38, C_HUD], ["resmax", 12, C_HUD],
		["money", 24, Color("8fe08a")], ["wname", 14, Color.WHITE], ["score", 22, Color.WHITE], ["alive", 12, Color.WHITE],
		["msg", 30, Color.WHITE], ["sub", 15, Color.WHITE], ["hint", 15, Color.WHITE], ["kc", 16, C_HUD], ["fps", 12, Color.WHITE]]:
		var lb := Label.new()
		var ls := LabelSettings.new()
		ls.font_size = def[1]
		ls.font_color = def[2]
		ls.outline_size = 5
		ls.outline_color = Color(0, 0, 0, 0.75)
		lb.label_settings = ls
		lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(lb)
		L[def[0]] = lb
		hud_nodes.append(lb)
	L.hp_t.text = "生命"
	L.armor_t.text = "护甲"
	for k in ["msg", "sub", "hint", "kc", "score", "alive"]:
		L[k].horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for k in ["ammo", "resmax", "money", "wname"]:
		L[k].horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	L.fps.visible = false

	feed = _rich()
	feed.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(feed)
	hud_nodes.append(feed)

	buy_panel = _panel()
	buy_text = _rich()
	buy_panel.add_child(buy_text)
	board_panel = _panel()
	board_text = _rich()
	board_panel.add_child(board_text)

	pause_label = Label.new()
	pause_label.text = "已暂停\n点击任意位置继续"
	pause_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pause_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	pause_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_label.add_theme_font_size_override("font_size", 34)
	pause_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pause_label.visible = false
	root.add_child(pause_label)

	_build_radar()
	_build_menu()
	_build_end()
	set_hud_visible(false)


func _rich() -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.autowrap_mode = TextServer.AUTOWRAP_OFF
	return r


func _panel() -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.07, 0.086, 0.93)
	sb.border_color = Color(1, 0.82, 0.48, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	sb.set_content_margin_all(18)
	p.add_theme_stylebox_override("panel", sb)
	p.visible = false
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(p)
	return p


func _build_radar() -> void:
	var img := Image.create(MapData.gw, MapData.gh, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0.5))
	for z in MapData.gh:
		for x in MapData.gw:
			var c := MapData.cell_char(x, z)
			if c == "#":
				img.set_pixel(x, z, Color(0.82, 0.78, 0.7, 0.8))
			elif c == "x" or c == "X":
				img.set_pixel(x, z, Color(0.59, 0.43, 0.24, 0.85))
	radar_tex = ImageTexture.create_from_image(img)


func _row(parent: Control, title: String, opts: Array, key: String) -> void:
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_theme_constant_override("separation", 10)
	var lb := Label.new()
	lb.text = title
	lb.custom_minimum_size.x = 90
	lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hb.add_child(lb)
	var grp := ButtonGroup.new()
	for o in opts:
		var b := Button.new()
		b.text = o[1]
		b.toggle_mode = true
		b.button_group = grp
		b.custom_minimum_size = Vector2(80, 36)
		b.button_pressed = choice[key] == o[0]
		b.pressed.connect(func(): choice[key] = o[0])
		hb.add_child(b)
	parent.add_child(hb)


func _build_menu() -> void:
	menu = ColorRect.new()
	(menu as ColorRect).color = Color(0.03, 0.04, 0.05, 0.72)
	menu.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(menu)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	menu.add_child(cc)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 12)
	cc.add_child(vb)
	var t := Label.new()
	t.text = "破 晓 行 动"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 54)
	t.add_theme_color_override("font_color", C_HUD)
	vb.add_child(t)
	var st := Label.new()
	st.text = "DAYBREAK OPS · 5v5 团队歼灭 · Godot 版"
	st.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	st.modulate.a = 0.65
	vb.add_child(st)
	_row(vb, "阵营", [["blue", "蓝队"], ["red", "红队"]], "team")
	_row(vb, "电脑难度", [["easy", "简单"], ["normal", "普通"], ["hard", "困难"]], "diff")
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_theme_constant_override("separation", 10)
	var sl := Label.new()
	sl.text = "灵敏度"
	sl.custom_minimum_size.x = 90
	sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hb.add_child(sl)
	var s := HSlider.new()
	s.min_value = 0.3
	s.max_value = 3.0
	s.step = 0.1
	s.value = main.sens
	s.custom_minimum_size = Vector2(220, 24)
	s.value_changed.connect(func(v): main.sens = v)
	hb.add_child(s)
	vb.add_child(hb)
	var go := Button.new()
	go.text = "开 始 战 斗"
	go.custom_minimum_size = Vector2(240, 52)
	go.add_theme_font_size_override("font_size", 22)
	go.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	go.pressed.connect(func(): main.new_match(choice.team, choice.diff))
	vb.add_child(go)
	var help := Label.new()
	help.text = "W A S D 移动　空格 跳跃　C 蹲下　Shift 静步\n左键 开火　右键 按住机瞄 / 狙击枪开镜　R 换弹　V 单发/连发\n1 2 3 / 滚轮 / Q 切换武器　E 拾取或更换　G 丢弃主武器\nB 购买（回合开始阶段）　Tab 计分板　F3 帧率　Esc 暂停\n先赢得 8 个回合的队伍获胜"
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	help.add_theme_font_size_override("font_size", 13)
	help.modulate.a = 0.75
	vb.add_child(help)


func _build_end() -> void:
	end_panel = ColorRect.new()
	(end_panel as ColorRect).color = Color(0.03, 0.04, 0.05, 0.85)
	end_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	end_panel.visible = false
	root.add_child(end_panel)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	end_panel.add_child(cc)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 16)
	cc.add_child(vb)
	var t := Label.new()
	t.name = "Title"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 54)
	t.add_theme_color_override("font_color", C_HUD)
	vb.add_child(t)
	var s := Label.new()
	s.name = "Sub"
	s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(s)
	var b := Button.new()
	b.text = "再来一局"
	b.custom_minimum_size = Vector2(200, 48)
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	b.pressed.connect(func():
		end_panel.visible = false
		menu.visible = true
		main.state = "menu")
	vb.add_child(b)


func show_end(win: bool, sub: String) -> void:
	end_panel.visible = true
	(end_panel.find_child("Title", true, false) as Label).text = "胜利" if win else "失败"
	(end_panel.find_child("Sub", true, false) as Label).text = sub
	set_hud_visible(false)


func set_hud_visible(v: bool) -> void:
	for n in hud_nodes:
		n.visible = v
	overlay.visible = v
	L.fps.visible = v and show_fps
	if not v:
		buy_panel.visible = false
		board_panel.visible = false


func set_msg(t: String, sub := "", dur := 3.0) -> void:
	L.msg.text = t
	L.sub.text = sub
	msg_until = main.time + dur


func toast(t: String) -> void:
	L.kc.text = t
	toast_t = 1.8


func add_feed(att: Fighter, v: Fighter, w: Dictionary, head: bool) -> void:
	var ca := "#6fb1ff" if att.team == "blue" else "#ff7b6b"
	var cv := "#6fb1ff" if v.team == "blue" else "#ff7b6b"
	var wn: String = (w.name as String).split(" ")[0]
	feed_items.append({"t": "[color=%s]%s[/color]  %s%s  [color=%s]%s[/color]" % [ca, att.fname, wn, " 爆头" if head else "", cv, v.fname], "until": main.time + 6.0})
	if feed_items.size() > 6:
		feed_items.pop_front()
	_refresh_feed()


func _refresh_feed() -> void:
	var s := ""
	for it in feed_items:
		s += "[right]" + it.t + "[/right]\n"
	feed.text = s


func on_hit(head: bool) -> void:
	hit_t = 0.18
	hit_hs = head


func on_hurt(att: Fighter, v: Fighter) -> void:
	dmg_flash = 1.0
	var d := att.global_position - v.global_position
	dir_ang = atan2(d.x * cos(v.yaw) - d.z * sin(v.yaw), -d.x * sin(v.yaw) - d.z * cos(v.yaw))
	dir_t = 1.2


func _place(n: Control, x: float, y: float, w: float, h: float) -> void:
	n.position = Vector2(x, y)
	n.size = Vector2(w, h)


func update(dt: float) -> void:
	var p := main.player
	var vs := root.size
	var w := p.cur_w()
	# 布局
	_place(L.hp_t, 22, vs.y - 76, 60, 16)
	_place(L.hp, 22, vs.y - 62, 90, 46)
	_place(L.armor_t, 118, vs.y - 76, 60, 16)
	_place(L.armor, 118, vs.y - 62, 90, 46)
	_place(L.ammo, vs.x - 262, vs.y - 62, 240, 46)
	_place(L.resmax, vs.x - 262, vs.y - 84, 240, 16)
	_place(L.money, vs.x - 262, vs.y - 122, 240, 30)
	_place(L.wname, vs.x - 322, vs.y - 148, 300, 20)
	_place(L.score, vs.x * 0.5 - 160, 10, 320, 30)
	_place(L.alive, vs.x * 0.5 - 160, 40, 320, 16)
	_place(L.msg, 0, vs.y * 0.24, vs.x, 40)
	_place(L.sub, 0, vs.y * 0.24 + 46, vs.x, 22)
	_place(L.kc, 0, vs.y * 0.57, vs.x, 24)
	_place(L.hint, 0, vs.y * 0.62, vs.x, 22)
	_place(L.fps, 14, 142, 300, 16)
	_place(feed, vs.x - 416, 12, 400, 160)
	# 数值
	L.hp.text = str(maxi(0, p.hp))
	L.armor.text = str(p.armor)
	L.money.text = "$%d" % p.money
	var mode := ""
	if w.get("auto", false):
		mode = "[单发] " if p.semi.get(w.id, false) else "[连发] "
	L.wname.text = mode + w.name + ("　换弹中…" if p.reload_end > 0.0 else "")
	if w.has("melee"):
		L.ammo.text = "—"
		L.resmax.text = ""
	else:
		L.ammo.text = "%d / %d" % [p.ammo[w.id].mag, p.ammo[w.id].res]
		L.resmax.text = "备弹上限 %d" % w.max
	var tt := maxi(0, ceili(main.freeze_t if main.state == "freeze" else main.round_t))
	L.score.text = "%d   %d:%02d   %d" % [main.score.blue, tt / 60, tt % 60, main.score.red]
	L.alive.text = "蓝队 %d　　　　　　　红队 %d" % [main.alive_n.blue, main.alive_n.red]
	if main.time > msg_until:
		L.msg.text = ""
		L.sub.text = "" if p.alive else (("观战中：%s（点击切换）" % main.spec_target.fname) if main.spec_target else "你已阵亡")
	if not feed_items.is_empty() and feed_items[0].until < main.time:
		feed_items.pop_front()
		_refresh_feed()
	toast_t -= dt
	L.kc.modulate.a = clampf(toast_t * 2.5, 0.0, 1.0)
	L.hint.text = ""
	if main.near_item != null:
		L.hint.text = "按 E %s %s" % ["更换为" if p.inv[0] != null else "拾取", Weapons.D[main.near_item.id].name]
	hit_t -= dt
	dir_t -= dt
	dmg_flash = maxf(0.0, dmg_flash - dt * 1.8)
	var hv := dmg_flash
	if p.alive and p.hp < 35:
		hv = maxf(hv, (35 - p.hp) / 35.0 * (0.4 + 0.12 * sin(main.time * 6.0)))
	(vignette.material as ShaderMaterial).set_shader_parameter("hurt", hv)
	# 面板
	if p.buy_open and not p.can_buy():
		p.buy_open = false
	buy_panel.visible = p.buy_open
	board_panel.visible = p.board_open
	if p.buy_open:
		buy_text.text = _buy_bb()
		buy_panel.reset_size()
		buy_panel.position = (vs - buy_panel.size) * 0.5
	if p.board_open:
		board_text.text = _board_bb()
		board_panel.reset_size()
		board_panel.position = (vs - board_panel.size) * 0.5
	if show_fps:
		L.fps.text = "%d FPS · %d×%d" % [Engine.get_frames_per_second(), get_viewport().size.x, get_viewport().size.y]
	# 雷达上可见的敌人
	if main.time >= seen_t:
		seen_t = main.time + 0.25
		seen.clear()
		var viewer: Fighter = p if p.alive else main.spec_target
		if viewer:
			for f in main.fighters:
				if f.alive and f.team != p.team and main.can_see(viewer, f):
					seen.append(f)
	overlay.queue_redraw()


func _buy_bb() -> String:
	var p := main.player
	var s := "[color=#ffd27a][font_size=18]装备购买　$%d[/font_size][/color]\n\n" % p.money
	for it in Weapons.BUY:
		var price: int = Weapons.D[it.w].price if it.has("w") else it.price
		var nm: String = Weapons.D[it.w].name if it.has("w") else it.name
		var col := "#e9e4d8" if p.money >= price else "#6a6a6a"
		s += "[color=%s][color=#ffd27a]%s[/color]　%s　　$%d[/color]\n" % [col, it.key, nm, price]
	s += "\n[font_size=12][color=#b0aca0]当前弹药"
	for id in p.inv:
		if id != null and not Weapons.D[id].has("melee"):
			s += "　%s：弹匣 %d/%d，备弹 %d/%d" % [(Weapons.D[id].name as String).split(" ")[-1], p.ammo[id].mag, Weapons.D[id].mag, p.ammo[id].res, Weapons.D[id].max]
	s += "\n按数字键购买，按 B 关闭。仅回合开始阶段可购买。[/color][/font_size]"
	return s


func _board_bb() -> String:
	var s := ""
	for t in ["blue", "red"]:
		var c := "#6fb1ff" if t == "blue" else "#ff7b6b"
		s += "[color=%s][font_size=18]%s　%d[/font_size][/color]\n" % [c, Main.TEAM_CN[t], main.score[t]]
		s += "[table=4][cell][color=#888]名称　　　　[/color][/cell][cell][color=#888]击杀　　[/color][/cell][cell][color=#888]死亡　　[/color][/cell][cell][color=#888]状态[/color][/cell]"
		var list: Array = main.fighters.filter(func(f): return f.team == t)
		list.sort_custom(func(a, b): return a.kills > b.kills)
		for f in list:
			var col := "#ffffff" if f == main.player else ("#e9e4d8" if f.alive else "#666666")
			s += "[cell][color=%s]%s[/color][/cell][cell][color=%s]%d[/color][/cell][cell][color=%s]%d[/color][/cell][cell][color=%s]%s[/color][/cell]" % [col, f.fname, col, f.kills, col, f.deaths, col, "存活" if f.alive else "阵亡"]
		s += "[/table]\n\n"
	return s


func _draw_overlay() -> void:
	var p := main.player
	if p == null:
		return
	var vs := overlay.size
	var c := vs * 0.5
	var w := p.cur_w()
	# 开镜遮罩
	if p.scoped and p.alive:
		var R := vs.y * 0.34
		overlay.draw_arc(c, R + 1500.0, 0, TAU, 96, Color.BLACK, 3000.0, true)
		overlay.draw_line(Vector2(0, c.y), Vector2(vs.x, c.y), Color.BLACK, 1.0)
		overlay.draw_line(Vector2(c.x, 0), Vector2(c.x, vs.y), Color.BLACK, 1.0)
	# 准星
	if p.alive and not p.scoped and not w.has("scope") and p.ads < 0.5:
		var gap := 4.0
		if not w.has("melee"):
			gap += (w.spread + p.heat * w.heat + Vector2(p.velocity.x, p.velocity.z).length() / Fighter.RUN * w.move + (0.0 if p.is_on_floor() else 0.07)) * 420.0
		var g := Color("7dff7d")
		for d in [Vector2(0, -1), Vector2(0, 1), Vector2(-1, 0), Vector2(1, 0)]:
			overlay.draw_line(c + d * gap, c + d * (gap + 9.0), Color(0, 0, 0, 0.6), 4.0)
			overlay.draw_line(c + d * gap, c + d * (gap + 9.0), g, 2.0)
	# 命中标记
	if hit_t > 0.0:
		var hc := Color(1, 0.25, 0.2) if hit_hs else Color.WHITE
		hc.a = clampf(hit_t / 0.1, 0.0, 1.0)
		for d in [Vector2(1, 1), Vector2(1, -1), Vector2(-1, 1), Vector2(-1, -1)]:
			overlay.draw_line(c + d * 6.0, c + d * 13.0, hc, 2.0)
	# 受击方向
	if dir_t > 0.0:
		var a := dir_ang - PI / 2
		overlay.draw_arc(c, 150.0, a - 0.35, a + 0.35, 20, Color(1, 0.16, 0.12, clampf(dir_t * 2.0, 0.0, 0.9)), 6.0, true)
	# 雷达
	var rs := 4.0
	var ro := Vector2(14, 14)
	overlay.draw_texture_rect(radar_tex, Rect2(ro, Vector2(MapData.gw, MapData.gh) * rs), false)
	overlay.draw_rect(Rect2(ro, Vector2(MapData.gw, MapData.gh) * rs), Color(1, 1, 1, 0.25), false, 1.0)
	var k := rs / MapData.CELL
	for f in main.fighters:
		if not f.alive or f == p:
			continue
		if f.team != p.team and not seen.has(f):
			continue
		overlay.draw_circle(ro + Vector2(f.global_position.x, f.global_position.z) * k, 2.6, C_BLUE if f.team == "blue" else Color("ff6b5b"))
	if p.alive:
		var pp := ro + Vector2(p.global_position.x, p.global_position.z) * k
		var fw := Vector2(-sin(p.yaw), -cos(p.yaw))
		var rt := Vector2(-fw.y, fw.x)
		overlay.draw_colored_polygon(PackedVector2Array([pp + fw * 6.0, pp - fw * 4.0 + rt * 4.0, pp - fw * 4.0 - rt * 4.0]), Color.WHITE)
