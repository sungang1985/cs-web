class_name MapData
## 原创地图「旧仓库区」：上半部分手工绘制，下半部分 180° 旋转对称生成。
## '#' 墙  'X' 集装箱  'x' 矮木箱(可跳上)  'A' 蓝队出生点  'B' 红队出生点  '.' 地面

const CELL := 2.0
const WALL_H := 5.0
const TOP := [
	"########################################",
	"#.......#..........x.........#.........#",
	"#.......#..........x...................#",
	"#AAA........XX...........XX..#.........#",
	"#AAA....#...XX...........XX..#.....x...#",
	"#.......#....................#.....x...#",
	"#..xx...####..######..####..####..######",
	"#.......#......#........#......#.......#",
	"#..............#........#..............#",
	"####..###..x...#...XX...#...x..#..xx...#",
	"#.......#..x.......XX..........#.......#",
	"#.......#......#........#......#.......#",
	"#..X....###..###..x..x..###..###..#..###",
	"#..X......#..#............#..#....#....#",
	"#.........#..#.....XX.....#..#.........#",
]

static var rows: Array[String] = []
static var gw := 40
static var gh := 30
static var spawns := {"blue": [], "red": []}


static func setup() -> void:
	if not rows.is_empty():
		return
	for r in TOP:
		rows.append(r)
	for i in range(TOP.size() - 1, -1, -1):
		var src: String = TOP[i]
		var out := ""
		for k in range(src.length() - 1, -1, -1):
			var c := src[k]
			out += "B" if c == "A" else c
		rows.append(out)
	gw = rows[0].length()
	gh = rows.size()
	for z in gh:
		for x in gw:
			var c := rows[z][x]
			if c == "A":
				spawns.blue.append(Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL))
			elif c == "B":
				spawns.red.append(Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL))


static func cell_char(cx: int, cz: int) -> String:
	if cx < 0 or cz < 0 or cx >= gw or cz >= gh:
		return "#"
	return rows[cz][cx]


static func cell_h(cx: int, cz: int) -> float:
	var c := cell_char(cx, cz)
	if c == "#":
		return WALL_H
	if c == "X":
		return 2.2
	if c == "x":
		return 1.0
	return 0.0


static func height_at(x: float, z: float) -> float:
	return cell_h(int(floor(x / CELL)), int(floor(z / CELL)))


static func inside_solid(p: Vector3) -> bool:
	return p.y < height_at(p.x, p.z)


static func center() -> Vector3:
	return Vector3(gw * CELL * 0.5, 0, gh * CELL * 0.5)
