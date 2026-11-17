class_name Sfx
extends Node
## 音效：全部程序化合成后缓存为音频流；枪声走带混响的 3D 音频总线。

const SR := 22050
const SND := {
	"pistol": {"f": 2600.0, "d": 0.16, "v": 0.0}, "smg": {"f": 3200.0, "d": 0.12, "v": -1.5}, "rifle": {"f": 1900.0, "d": 0.22, "v": 1.5},
	"shotgun": {"f": 1100.0, "d": 0.36, "v": 3.5}, "sniper": {"f": 850.0, "d": 0.6, "v": 4.5},
}

var streams := {}
var p3d: Array[AudioStreamPlayer3D] = []
var p2d: Array[AudioStreamPlayer] = []
var i3 := 0
var i2 := 0


func _ready() -> void:
	if AudioServer.get_bus_index("SFX") < 0:
		AudioServer.add_bus()
		var bi := AudioServer.bus_count - 1
		AudioServer.set_bus_name(bi, "SFX")
		var rv := AudioEffectReverb.new()
		rv.room_size = 0.55
		rv.damping = 0.6
		rv.wet = 0.16
		rv.dry = 1.0
		AudioServer.add_bus_effect(bi, rv)
	for id in SND:
		streams[id] = _shot(SND[id])
	streams["step"] = _step()
	streams["whiz"] = _whiz()
	streams["click"] = _tones([[1400.0, 0.03, 0.0]], 1)
	streams["reload"] = _tones([[700.0, 0.04, 0.0], [1100.0, 0.05, 0.25]], 1)
	streams["hit"] = _tones([[1300.0, 0.06, 0.0]], 0)
	streams["hs"] = _tones([[2200.0, 0.06, 0.0]], 0)
	streams["hurt"] = _tones([[140.0, 0.15, 0.0]], 2)
	streams["swish"] = _tones([[500.0, 0.08, 0.0]], 0)
	streams["buy"] = _tones([[900.0, 0.08, 0.0]], 0)
	streams["pickup"] = _tones([[650.0, 0.06, 0.0]], 0)
	streams["go"] = _tones([[880.0, 0.2, 0.0]], 0)
	streams["kill"] = _tones([[880.0, 0.07, 0.0], [1320.0, 0.12, 0.07]], 0)
	streams["killhs"] = _tones([[1320.0, 0.07, 0.0], [1980.0, 0.12, 0.07]], 0)
	streams["win"] = _tones([[523.0, 0.22, 0.0], [659.0, 0.22, 0.16], [784.0, 0.22, 0.32]], 0)
	streams["lose"] = _tones([[392.0, 0.22, 0.0], [330.0, 0.22, 0.16], [262.0, 0.22, 0.32]], 0)
	for i in 16:
		var p := AudioStreamPlayer3D.new()
		p.bus = "SFX"
		p.unit_size = 14.0
		p.max_distance = 140.0
		p.attenuation_filter_cutoff_hz = 6000.0
		add_child(p)
		p3d.append(p)
	for i in 8:
		var p := AudioStreamPlayer.new()
		add_child(p)
		p2d.append(p)


static func _wav(s: PackedFloat32Array) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(s.size() * 2)
	for i in s.size():
		data.encode_s16(i * 2, int(clampf(s[i], -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = SR
	w.stereo = false
	w.data = data
	return w


func _shot(p: Dictionary) -> AudioStreamWAV:
	var n := int(SR * (p.d + 0.1))
	var s := PackedFloat32Array()
	s.resize(n)
	var lp := 0.0
	var lp2 := 0.0
	var ph := 0.0
	for i in n:
		var t := float(i) / SR
		var cutoff: float = 200.0 + (p.f - 200.0) * exp(-t / (p.d * 0.3))
		var a := 1.0 - exp(-TAU * cutoff / SR)
		lp += a * (randf() * 2.0 - 1.0 - lp)
		lp2 += a * (lp - lp2)
		ph += TAU * (45.0 + 130.0 * exp(-t / 0.025)) / SR
		var crack := (1.0 - t / 0.004) * (randf() * 2.0 - 1.0) if t < 0.004 else 0.0
		var tail: float = exp(-t / (p.d * 0.2)) + 0.25 * exp(-t / (p.d * 0.6))
		s[i] = tanh((lp2 * 3.2 * tail + sin(ph) * exp(-t / 0.04) * 0.9 + crack) * 1.4) * 0.8 * minf(1.0, (n - i) / 200.0)
	return _wav(s)


func _step() -> AudioStreamWAV:
	var n := int(SR * 0.12)
	var s := PackedFloat32Array()
	s.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / SR
		lp += 0.2 * (randf() * 2.0 - 1.0 - lp)
		s[i] = (lp * 2.2 * exp(-t / 0.02) + sin(TAU * 95.0 * t) * exp(-t / 0.03) * 0.5) * minf(1.0, (n - i) / 100.0)
	return _wav(s)


func _whiz() -> AudioStreamWAV:
	var n := int(SR * 0.22)
	var s := PackedFloat32Array()
	s.resize(n)
	var ph := 0.0
	var lp := 0.0
	for i in n:
		var t := float(i) / n
		ph += TAU * (2600.0 - 1700.0 * t) / SR
		lp += 0.5 * (randf() * 2.0 - 1.0 - lp)
		s[i] = (sin(ph) * 0.35 + lp * 0.5) * pow(sin(PI * t), 2.0)
	return _wav(s)


## notes: [[频率, 时长, 起始时间], ...]；kind: 0 正弦 1 方波 2 锯齿
func _tones(notes: Array, kind: int) -> AudioStreamWAV:
	var total := 0.0
	for nt in notes:
		total = maxf(total, nt[2] + nt[1] + 0.03)
	var n := int(SR * total)
	var s := PackedFloat32Array()
	s.resize(n)
	for nt in notes:
		var i0 := int(nt[2] * SR)
		var cnt := int((nt[1] + 0.02) * SR)
		for i in cnt:
			if i0 + i >= n:
				break
			var t := float(i) / SR
			var ph: float = fmod(t * nt[0], 1.0)
			var v := sin(TAU * ph)
			if kind == 1:
				v = 0.5 if ph < 0.5 else -0.5
			elif kind == 2:
				v = ph * 1.4 - 0.7
			s[i0 + i] += v * 0.35 * exp(-t / (nt[1] * 0.35))
	return _wav(s)


func shot(id: String, pos: Vector3, own: bool) -> void:
	if own:
		_play2d(streams[id], SND[id].v - 4.0, randf_range(0.94, 1.06))
		return
	var p := p3d[i3 % p3d.size()]
	i3 += 1
	p.stream = streams[id]
	p.global_position = pos
	p.volume_db = SND[id].v + 2.0
	p.pitch_scale = randf_range(0.94, 1.06)
	p.play()


func step(pos: Vector3, own: bool) -> void:
	if own:
		_play2d(streams["step"], -16.0, randf_range(0.85, 1.15))
		return
	var p := p3d[i3 % p3d.size()]
	i3 += 1
	p.stream = streams["step"]
	p.global_position = pos
	p.volume_db = -6.0
	p.pitch_scale = randf_range(0.85, 1.15)
	p.play()


func ui(n: String, db := -8.0) -> void:
	_play2d(streams[n], db, 1.0)


func _play2d(st: AudioStream, db: float, pitch: float) -> void:
	var p := p2d[i2 % p2d.size()]
	i2 += 1
	p.stream = st
	p.volume_db = db
	p.pitch_scale = pitch
	p.play()
