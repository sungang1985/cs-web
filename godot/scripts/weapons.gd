class_name Weapons
## 武器数据。v 初速(m/s)，fall 每百米伤害衰减，pen 可穿透木箱厚度(m)，max 备弹上限。

const D := {
	"smg": {"id": "smg", "name": "蜂鸟 冲锋枪", "slot": 0, "dmg": 22.0, "rate": 0.075, "auto": true, "mag": 30, "res": 60, "max": 150, "reload": 2.1, "spread": 0.011, "heat": 0.0035, "kick": 0.016, "move": 0.012, "speed": 0.98, "price": 1500, "v": 400.0, "fall": 0.5, "pen": 0.0},
	"shotgun": {"id": "shotgun", "name": "铁砧 霰弹枪", "slot": 0, "dmg": 14.0, "rate": 0.85, "auto": false, "mag": 7, "res": 14, "max": 35, "reload": 0.55, "spread": 0.05, "heat": 0.0, "kick": 0.09, "move": 0.01, "speed": 0.95, "price": 1700, "v": 400.0, "fall": 2.2, "pen": 0.0, "pellets": 8, "shell": true},
	"rifle": {"id": "rifle", "name": "雷鸣 突击步枪", "slot": 0, "dmg": 33.0, "rate": 0.1, "auto": true, "mag": 30, "res": 60, "max": 120, "reload": 2.4, "spread": 0.004, "heat": 0.0045, "kick": 0.028, "move": 0.03, "speed": 0.93, "price": 2700, "v": 720.0, "fall": 0.18, "pen": 2.3},
	"sniper": {"id": "sniper", "name": "鹰眼 狙击步枪", "slot": 0, "dmg": 105.0, "rate": 1.3, "auto": false, "mag": 5, "res": 10, "max": 30, "reload": 3.0, "spread": 0.0005, "heat": 0.0, "kick": 0.07, "move": 0.08, "speed": 0.85, "price": 4500, "v": 850.0, "fall": 0.06, "pen": 4.5, "scope": true, "unscoped": 0.07},
	"pistol": {"id": "pistol", "name": "P9 手枪", "slot": 1, "dmg": 28.0, "rate": 0.14, "auto": false, "mag": 12, "res": 36, "max": 72, "reload": 1.7, "spread": 0.007, "heat": 0.006, "kick": 0.03, "move": 0.012, "speed": 1.0, "price": 0, "v": 360.0, "fall": 0.55, "pen": 0.0},
	"knife": {"id": "knife", "name": "战术匕首", "slot": 2, "dmg": 45.0, "rate": 0.45, "melee": true, "range": 2.4, "speed": 1.05},
}

const BUY := [
	{"key": "1", "w": "smg"}, {"key": "2", "w": "shotgun"}, {"key": "3", "w": "rifle"}, {"key": "4", "w": "sniper"},
	{"key": "5", "name": "防弹衣", "price": 650, "armor": true},
	{"key": "6", "name": "补充弹药（装满弹匣，备弹补到上限）", "price": 200, "ammo": true},
]

## 握持点（武器局部坐标，-Z 为枪口方向）
const GUN := {
	"rifle": {"grip": Vector3(0, -0.055, 0.07), "fore": Vector3(0, 0.005, -0.27), "butt": 0.30, "mz": -0.61, "mv": 0.036, "long": true, "sight": 0.092},
	"smg": {"grip": Vector3(0, -0.05, 0.075), "fore": Vector3(0, -0.05, -0.115), "butt": 0.29, "mz": -0.31, "mv": 0.04, "long": true, "sight": 0.1},
	"shotgun": {"grip": Vector3(0, -0.02, 0.115), "fore": Vector3(0, 0.01, -0.32), "butt": 0.32, "mz": -0.65, "mv": 0.05, "long": true, "sight": 0.072},
	"sniper": {"grip": Vector3(0, -0.06, 0.11), "fore": Vector3(0, -0.012, -0.2), "butt": 0.36, "mz": -0.70, "mv": 0.05, "long": true, "sight": 0.08},
	"pistol": {"grip": Vector3(0, -0.07, 0.07), "fore": Vector3(-0.03, -0.085, 0.06), "butt": 0.0, "mz": -0.115, "mv": 0.022, "long": false, "sight": 0.05},
	"knife": {"grip": Vector3(0, 0, 0.055), "fore": Vector3.ZERO, "butt": 0.0, "mz": -0.2, "mv": 0.0, "long": false, "sight": 0.08},
}

const DIFF := {
	"easy": {"react": 0.8, "err": 0.075, "turn": 4.0},
	"normal": {"react": 0.45, "err": 0.045, "turn": 7.0},
	"hard": {"react": 0.24, "err": 0.026, "turn": 11.0},
}
