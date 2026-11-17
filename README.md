# 一起来摸鱼（Office Slacker）

策略 / 时间管理类小游戏：一群小动物员工在狮子老板眼皮底下摸鱼赚钱。小清新 2D 画风（界面参考《胡闹厨房》的厚描边风格，关卡地图选关），15 个关卡、12 个角色、5 种房间、3 类特殊技能、出战阵容、考核关、紧急召回、暂停与倍速、合成音效。所有图形与声音都由代码生成，无外部素材。

## 运行
- 直接双击 `index.html`（无需服务器、无需构建，不依赖第三方库）。
- 新模式「摸鱼大作战」（1 老板 + 4 员工，竖屏、主推手机；打印室 / 茶水间 / 天台 / 安全厕所、四个角色的主动 + 被动技能、每 30 秒的随机事件、头名悬赏和捣乱道具、原创背景音乐；标题页可选 AI 老板难度；`arena.html?role=boss` 直接当老板）。员工按 `E` 放技能，老板按 `1/2/3`：选关页右上角按钮进入，或直接打开 `arena.html`。电脑点击/WASD 移动、空格出门或回工位；手机竖屏点哪走哪。
- 在线试玩（GitHub Pages）：https://thet92.github.io/office-slacker/ ，摸鱼大作战：https://thet92.github.io/office-slacker/arena.html
- URL 末尾加 `?debug` 可显示老板状态调试信息。

## 操作
- 选关界面：点击关卡卡片，或按 `1-9`、`0`（第 10 关），`Shift+1-5`（第 11–15 关）。第 1 关默认开放，通关（≥1 星）后解锁下一关；进度保存在浏览器 localStorage。
- 阵容界面（本关可用同事多于工位时出现，只列出本关可用的同事）：点击卡片让同事上场/下场，`Enter` 开始，`Esc` 返回。阵容会被记住。
- 游戏中：普通技能（去厕所、喝咖啡等）**自动**进行。你负责：点右侧**特殊技能卡片**任意位置释放（整张卡片变亮绿、出现黄色"点我释放"按钮 = 可释放）——带走老板（狐狸、猫头鹰）、拖住老板（鹦鹉）、打掩护（刺猬）；**点击厕所/茶水间/天台或按 `Q`/`E`/`W` 紧急召回**房里的人（打印室老板不查）；`P`/空格 暂停（暂停时不能操作，切走窗口会自动暂停）；`R` 重来；`Esc` 或右上角"选关"返回。
- 通关第 2 关后解锁 **倍速**：`S` 或右上角按钮切换 ×1 / ×1.5 / ×2。
- 规则：普通关只要时间内金额达标就过关；每 5 关一个**考核关**，被抓次数超过上限立即失败。星级只看被抓次数（详见 docs/DESIGN.md）。
- 结算界面：`N` 下一关、`R` 重玩/重试（沿用阵容）、`L` 换阵容、`Esc` 选关，或点击按钮。
- 声音：首次点击后开始播放音效；`M` 或右上角按钮静音；`B` 或暂停菜单开关背景音乐（默认开启，全程播放）。
- 每关第一次开局会弹出"本关新内容"（新同事、新房间、新规则）；暂停菜单"本关说明"或按 `I` 可再看。
- 清空进度与设置：浏览器控制台执行 `__app.progress.reset()`。

## 测试
```
npm test                       # 等价于 node --test，需要 Node 18+，无需 npm install
node tools/balance-sim.js 200  # 机器人模拟各关通关率，辅助调数值
node tools/arena-sim.js 200 --difficulty=all  # 摸鱼大作战平衡模拟（老板胜率、各性格存款、房间占比……）
```

## 目录
```
index.html            入口（普通 script 标签加载）
src/config/           数据：balance 数值 / map 区域 / characters 角色 / levels 关卡
src/core/             纯逻辑（不碰 DOM）：app(选关/流程/倍速), progress(星级/存档/设置), lineup(解锁/阵容), hints(提示状态), auto(普通技能自动), game, boss, employee, skills, economy, rules
arena.html            新模式「摸鱼大作战」入口
src/arena/            新模式：config 地图房间 / path 寻路 / bossai AI 老板 / empai AI 员工 / skills 技能与升级 / supply 补给 / match 对局逻辑 / app 流程 / render 画面（界面 + 经典 2D 场景）/ world3d 3D 场景和角色模型 / view3d 3D 画面层（同步、镜头、点击换算）/ main 输入与主循环
lib/three.min.js      three.js r159 单文件版（MIT，见 lib/THREE-LICENSE.txt），摸鱼大作战的 3D 画面用；不需要打包，双击 arena.html 也能运行
src/render/           theme（配色）、sprites（动物/老板/道具绘制）、renderer（全部界面与特效）、ui（布局与命中检测）
src/audio.js          WebAudio 合成音效与背景音乐
src/input.js          鼠标/触屏/键盘
src/main.js           主循环（固定 1/60s 步长）
tests/                Node 自动化测试
tools/                开发工具（balance-sim 平衡模拟）
docs/                 DESIGN / TESTING / CHANGELOG
```
