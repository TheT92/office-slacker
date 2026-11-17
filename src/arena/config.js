// 摸鱼大作战（1 老板 + 4 员工）的配置：地图、房间、角色、经济数值。
// 坐标单位是"格"（1 格 = 渲染时 36 像素），格子中心为 (c + 0.5, r + 0.5)。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // 地图图例：# 墙（地图外也是墙）  . 公共办公区（安全区）  k 工位桌（障碍）
  //           T 厕所  P 茶水间  R 天台  S 天台楼梯（算天台，走得慢、没有收入）  M 会议室（摸鱼不能进）
  //           小写字母是门：t 厕所门  p 茶水间门  r 天台门  m 会议室门
  // 2.1.0 竖屏版：去掉老板办公室；中间是 20×18 的公共办公区，四个房间分在上（厕所）、左（茶水间）、右（会议室）、下（天台）
  A.MAP = [
    '####################################',
    '###############TTTTTT###############',
    '###############TTTTTT###############',
    '###############TTTTTT###############',
    '###############TTTTTT###############',
    '#################tt#################',
    '########....................########',
    '########....................########',
    '########....................########',
    '########....................########',
    '########....................########',
    '#PPPPPP#....................#MMMMMM#',
    '#PPPPPP#........kk.kk.......#MMMMMM#',
    '#PPPPPP#....................#MMMMMM#',
    '#PPPPPPp....................mMMMMMM#',
    '#PPPPPPp....................mMMMMMM#',
    '#PPPPPP#........kk.kk.......#MMMMMM#',
    '#PPPPPP#....................#MMMMMM#',
    '#PPPPPP#....................#MMMMMM#',
    '########....................########',
    '########....................########',
    '########....................########',
    '########....................########',
    '########....................########',
    '#################rr#################',
    '############SSSSSSSSSSSS############',
    '############RRRRRRRRRRRR############',
    '############RRRRRRRRRRRR############',
    '############RRRRRRRRRRRR############',
    '############RRRRRRRRRRRR############',
    '############RRRRRRRRRRRR############',
    '############RRRRRRRRRRRR############',
    '####################################',
  ];
  // 布局上下左右对称：上排工位离厕所近、下排离天台近，左列离茶水间近（右边是会议室，不能摸鱼）
  A.COLS = A.MAP[0].length; A.ROWS = A.MAP.length;

  // 摸鱼房间（首版 3 个，5 个位置给 4 名员工，故意偏紧）
  // peak：收入峰值（$/秒）；rise：收入爬到峰值所需秒数；maxStay：最长停留；cooldown：出来后再进这个房间的冷却（按人）
  A.ROOMS = {
    // 老板：bossStay 进门后必须逗留的秒数；bossCdMin~bossCdMax 出来后再查这个房间的冷却（每次随机，员工看不到；故意短于员工最长停留，跟在老板后面进去只是前几秒安全）；offenseEmpty / offenseCatch 查空 / 抓到人时冒犯值增加
    restroom: { name: '厕所', zone: 'T', door: 't', slack: true, cap: 1, peak: 9, rise: 9, maxStay: 15, cooldown: 20, floor: 0.35, bossStay: 3, bossCdMin: 6, bossCdMax: 12, offenseEmpty: 30, offenseCatch: 10 },
    pantry:   { name: '茶水间', zone: 'P', door: 'p', slack: true, cap: 2, peak: 7, rise: 12, maxStay: 20, cooldown: 15, floor: 0.35, bossStay: 4, bossCdMin: 5, bossCdMax: 10, offenseEmpty: 12, offenseCatch: 4 },
    rooftop:  { name: '天台', zone: 'R', door: 'r', slack: true, cap: 2, peak: 12, rise: 14, maxStay: 25, cooldown: 30, floor: 0.35, stairs: 'S', bossStay: 5, bossCdMin: 8, bossCdMax: 15, offenseEmpty: 20, offenseCatch: 7 },
    meeting:  { name: '会议室', zone: 'M', door: 'm', slack: false },
  };
  A.SLACK_ROOMS = ['restroom', 'pantry', 'rooftop'];

  A.ECON = {
    baseWage: 1,        // 公共办公区基础工资（$/秒，直接存入）
    idleWage: 0.3, idleAfter: 20,   // 在办公区连续待满 20 秒后工资降到 $0.3/秒（进一次房间恢复）
    lurePerSec: 0.03, lureMax: 2,   // 空房诱惑：房间每空着 1 秒收入峰值 +3%，最多 ×2；有人进去时按当时倍率算这一趟，然后清零
    depositRange: 0.75, // 离自己工位座位多近算"送到工位"（格）；只有按空格 / 回工位按钮 / 点自己的桌子才会存（路过不存）
    minStay: 4,         // 进房间后最少停留 4 秒才能出来（防止快速进出叠连摸层数）
    matchTime: 240,     // 一局 4 分钟
  };
  // 老板的"职场边界感"与处罚
  A.BOSS = {
    offenseMax: 100, offenseDecay: 0.8,   // 冒犯值上限；每秒回落（2.0.0 起 0.8：大约每 4 局有 1 次员工投诉）
    slowAt: 50, slowMult: 0.8,            // 冒犯值过半：移动变慢
    hrTime: 10, hrReset: 40,              // 满值触发员工投诉：被 HR 约谈 10 秒，之后冒犯值回到 40
    idleMin: 2.5, idleMax: 6,             // AI 老板两次查房之间在办公区转悠的时间
  };
  // 连摸加成：不回工位连续进第 N 个房间，存钱时整个口袋 ×(1 + 0.2 × (N − 1))，最多 ×1.8；被抓清零
  A.COMBO = { step: 0.2, max: 1.8 };
  A.comboMult = n => Math.min(A.COMBO.max, 1 + A.COMBO.step * Math.max(0, n - 1));
  // 老板也上排行榜：老板收益 = 没收金额 × 1，5 人一起排名，老板第一 = 老板赢（1.8.0 起 ×1，即没收多少算多少；A6 再调）
  // 老板收益 = 每次抓人没收的钱 × 当次倍数：本局第 1 人次 ×1、第 2 人次 ×1.1、第 3 人次 ×1.2、第 4 人次起 ×1.3（员工被扣的钱不变）
  A.WIN = { catchMult: [1, 1.1, 1.2, 1.3] };
  A.catchMult = n => A.WIN.catchMult[Math.min(n, A.WIN.catchMult.length - 1)];   // n = 本局已抓人次（从 0 开始）
  // 结算称号门槛（2.0.0 按模拟中位数设定）
  A.AWARDS = { restroom: 42, rooftop: 60, combo: 1.4, caught: 9, picks: 3, bossCatches: 24, bossEmpty: 6 };
  A.PREP = { time: 20, min: 15, max: 30, countdown: 3 };   // 开局准备：读身份卡（默认 20 秒，可配 15–30），最后 3 秒倒数
  A.RUSH = { time: 30, income: 2, bossSpeed: 1.3 };        // 下班冲刺：最后 30 秒员工收入 ×2、老板移动 ×1.3
  A.PENALTY = { base: 0.2, span: 0.8, stun: 0 };   // 没收比例 = 20% + 80% × 已待时间 / 最长停留；1.7.1 起不罚站，被抓立刻自动出门（老板还在逗留、看不到外面，不知道他去了哪）
  A.MOVE = { employee: 4, boss: 3.6, stairs: 0.45, radius: 0.3 };   // 速度（格/秒）；楼梯速度倍率；碰撞半径

  // 工位：桌子左格坐标；座位在桌子下方一格中间（两格桌的中线）
  A.DESKS = [
    { id: 0, c: 16, r: 12 }, { id: 1, c: 19, r: 12 },
    { id: 2, c: 16, r: 16 }, { id: 3, c: 19, r: 16 },
  ];
  A.seatOf = d => ({ x: d.c + 1, y: d.r + 1.5 });
  // 开局老板还没到公司（不在地图上、什么都看不见）：5 秒后直接出现在公共办公区正中间——去哪个房间都一样远，查房更随机
  A.BOSS_ARRIVE = { wait: 5, x: 18, y: 14.5 };
  A.BOSS_SPAWN = { x: A.BOSS_ARRIVE.x, y: A.BOSS_ARRIVE.y };
  // 视野（格）：竖屏一屏能看到的范围（宽 10 格、高约 13 格），人在办公区时只看得到以自己为中心的这一块。
  // AI 老板也只记得住这个范围里看到的事（谁走进了哪扇门）
  A.SIGHT = { w: 10, h: 13.2 };
  A.inSight = (a, x, y) => Math.abs(x - a.x) <= A.SIGHT.w / 2 && Math.abs(y - a.y) <= A.SIGHT.h / 2;

  // 首版 4 名员工角色（技能在 A4 加入，这里只放说明）
  A.CHARACTERS = {
    rabbit: { name: '兔子', skill: '冲刺', desc: '3 秒内移动加速' },
    cat:    { name: '猫', skill: '替身', desc: '在工位留一个假身，老板以为你还在' },
    bear:   { name: '熊', skill: '久蹲', desc: '本次停留上限 +50%' },
    owl:    { name: '猫头鹰', skill: '听风', desc: '在房间里时显示老板位置 4 秒' },
  };
  A.EMPLOYEE_IDS = ['rabbit', 'cat', 'bear', 'owl'];
})(typeof window !== 'undefined' ? window : globalThis);
