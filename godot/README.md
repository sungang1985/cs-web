# 破晓行动 · Godot 版

用 [Godot 4.7](https://godotengine.org)（开源，MIT 授权）重写的桌面版本，玩法与网页版一致，
改用引擎自带的物理、光照阴影、3D 音频和后期处理。

## 运行

1. 下载 Godot 4.7 或更新版本（标准版即可，不需要 .NET 版）。
2. 打开 Godot，点击"导入"，选择本目录下的 `project.godot`。
3. 按 F5 运行。

也可以用命令行直接运行：`godot --path godot`

## 在线试玩（GitHub Pages）

推送到仓库后，`.github/workflows/pages.yml` 会自动把本工程导出为网页并发布到 GitHub Pages：

- 站点根目录：Godot 版
- `/classic/`：纯前端的网页版

首次使用需要在仓库 Settings → Pages 把 Source 设为 **GitHub Actions**。

## 导出

在编辑器的"项目 → 导出"里添加预设即可导出 Windows / macOS / Linux 桌面版，
也可以导出网页版（网页版自动使用兼容渲染器）。首次导出需要按提示下载导出模板。

## 与网页版的差异

- 碰撞与移动使用引擎物理（角色胶囊体、静态碰撞盒），弹壳是真实刚体；
- 实时阴影、环境光遮蔽、泛光、ACES 色调映射由引擎渲染管线提供；
- 场景材质是按世界坐标计算的着色器，近看不会模糊；
- 枪声是带距离衰减和混响的 3D 音频；
- 寻路使用引擎的 AStarGrid2D。

玩法逻辑（回合、经济、弹道、穿透、部位伤害、换弹、拾取、电脑 AI、角色动画）从网页版逐项移植。

## 目录

- `scripts/main.gd` — 场景搭建、回合与经济、弹道、伤害、地面武器、特效、摄像机
- `scripts/fighter.gd` / `player.gd` / `bot.gd` — 战斗单位基类、玩家、电脑 AI
- `scripts/soldier.gd` — 角色骨架、持枪 IK、行走 / 蹲 / 跳 / 倒地动画
- `scripts/gun_mesh.gd` — 武器模型
- `scripts/hud.gd` — HUD、菜单、购买面板、计分板、雷达
- `scripts/sfx.gd` — 程序化合成的音效
- `scripts/weapons.gd` / `map_data.gd` — 武器数据、地图
- `shaders/surface.gdshader` — 场景材质
- `fonts/cjk.ttf` — Noto Sans SC 的精简子集（SIL OFL 1.1，见同目录许可文件）

## 自动化测试

```bash
# 无界面跑 60 秒对局（电脑互相对战），输出回合进展
godot --headless --path godot --fixed-fps 60 -- --autotest=60
```
