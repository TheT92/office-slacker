// 摸鱼大作战（1 老板 + 4 员工）的配置：地图、房间、角色、经济数值。
// 坐标单位是"格"（1 格 = 渲染时 36 像素），格子中心为 (c + 0.5, r + 0.5)。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // 地图图例：# 墙（地图外也是墙）  . 公共办公区（安全区）  k 工位桌（障碍）
  //           D 打印室  P 茶水间  R 天台  S 天台楼梯（算天台，走得慢、没有收入）  W 厕所（安全房间，老板进不去）
  //           小写字母是门：d 打印室门  p 茶水间门  r 天台门  w 厕所门
  // 2.1.0 竖屏版：去掉老板办公室；中间是 20×18 的公共办公区，四个房间分在上下左右。
  // 2.2.0：上方原来的厕所改成打印室（照样会被抓），右边原来的会议室改成厕所（安全、有时间限制）
  A.MAP = [
    '####################################',
    '###############DDDDDD###############',
    '###############DDDDDD###############',
    '###############DDDDDD###############',
    '###############DDDDDD###############',
    '#################dd#################',
    '########....................########',
    '########....................########',
    '########....................########',
    '########....................########',
    '########....................########',
    '#PPPPPP#....................#WWWWWW#',
    '#PPPPPP#........kk.kk.......#WWWWWW#',
    '#PPPPPP#....................#WWWWWW#',
    '#PPPPPPp....................wWWWWWW#',
    '#PPPPPPp....................wWWWWWW#',
    '#PPPPPP#........kk.kk.......#WWWWWW#',
    '#PPPPPP#....................#WWWWWW#',
    '#PPPPPP#....................#WWWWWW#',
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
  // 布局上下左右对称：上排工位离打印室近、下排离天台近，左列离茶水间近、右列离厕所近
  A.COLS = A.MAP[0].length; A.ROWS = A.MAP.length;

  // 摸鱼房间（3 个会被抓的摸鱼房间 + 1 个安全厕所；5 个摸鱼位置给 4 名员工，故意偏紧）
  // peak：收入峰值（$/秒）；rise：收入爬到峰值所需秒数；maxStay：最长停留；cooldown：出来后再进这个房间的冷却（按人）
  A.ROOMS = {
    // 老板：bossStay 进门后必须逗留的秒数；bossCdMin~bossCdMax 出来后再查这个房间的冷却（每次随机，员工看不到；故意短于员工最长停留，跟在老板后面进去只是前几秒安全）
    print:    { name: '打印室', zone: 'D', door: 'd', slack: true, cap: 1, peak: 9, rise: 9, maxStay: 15, cooldown: 20, floor: 0.35, bossStay: 3, bossCdMin: 6, bossCdMax: 12 },
    pantry:   { name: '茶水间', zone: 'P', door: 'p', slack: true, cap: 2, peak: 7, rise: 12, maxStay: 20, cooldown: 15, floor: 0.35, bossStay: 4, bossCdMin: 5, bossCdMax: 10 },
    rooftop:  { name: '天台', zone: 'R', door: 'r', slack: true, cap: 2, peak: 12, rise: 14, maxStay: 25, cooldown: 30, floor: 0.35, stairs: 'S', bossStay: 4, bossCdMin: 8, bossCdMax: 15 },
    // 厕所（2.2.0）：安全房间，老板进不去也抓不到；收入固定 $2/秒直接存入；最多待 10 秒，出来腿麻 4 秒（移动 ×0.6），45 秒冷却；
    // 有人时别的员工在门口站 2 秒 = 敲门，里面的人剩余时间减半（每次只能被敲一次）
    toilet:   { name: '厕所', zone: 'W', door: 'w', slack: false, safe: true, cap: 1, wage: 2, maxStay: 10, cooldown: 45, numb: 4, numbMult: 0.6, knock: 2 },
  };
  A.SLACK_ROOMS = ['print', 'pantry', 'rooftop'];
  A.SAFE_ROOMS = ['toilet'];
  A.ENTER_ROOMS = A.SLACK_ROOMS.concat(A.SAFE_ROOMS);   // 员工能进的房间

  A.ECON = {
    baseWage: 1,        // 公共办公区基础工资（$/秒，直接存入）
    idleWage: 0.3, idleAfter: 20,   // 在办公区连续待满 20 秒后工资降到 $0.3/秒（进一次房间恢复）
    lurePerSec: 0.03, lureMax: 2,   // 空房诱惑：房间每空着 1 秒收入峰值 +3%，最多 ×2；有人进去时按当时倍率算这一趟，然后清零
    depositRange: 0.75, // 离自己工位座位多近算"送到工位"（格）；只有按空格 / 回工位按钮 / 点自己的桌子才会存（路过不存）
    minStay: 4,         // 进房间后最少停留 4 秒才能出来（防止快速进出叠连摸层数）
    matchTime: 240,     // 一局 4 分钟
  };
  // 老板（2.2.0 取消冒犯值和 HR 约谈）：查空房直接扣 15 点怒气（怒气是放技能的资源）
  A.BOSS = { emptyAnger: 15, idleMin: 2.5, idleMax: 6, wage: 0.6 };   // wage：老板底薪（$/秒，到公司后无论在哪都涨，直接算进收益；2.6.1）
  // 连摸加成：不回工位连续进第 N 个房间，存钱时整个口袋 ×(1 + 0.2 × (N − 1))，最多 ×1.8；被抓清零
  A.COMBO = { step: 0.2, max: 1.8 };
  A.comboMult = n => Math.min(A.COMBO.max, 1 + A.COMBO.step * Math.max(0, n - 1));
  // 老板也上排行榜：老板收益 = 没收金额 × 1，5 人一起排名，老板第一 = 老板赢（1.8.0 起 ×1，即没收多少算多少；A6 再调）
  // 老板收益 = 每次抓人没收的钱 × 当次倍数：本局第 1 人次 ×1、第 2 人次 ×1.15、第 3 人次 ×1.3、第 4 人次 ×1.45、之后 ×1.5（员工被扣的钱不变；2.5.0 加强）
  A.WIN = { catchMult: [1, 1.15, 1.3, 1.45, 1.5] };
  A.catchMult = n => A.WIN.catchMult[Math.min(n, A.WIN.catchMult.length - 1)];   // n = 本局已抓人次（从 0 开始）
  // 结算称号门槛（2.0.0 按模拟中位数设定）
  A.AWARDS = { print: 42, rooftop: 60, combo: 1.4, caught: 9, picks: 3, bossCatches: 24, bossEmpty: 6 };
  A.BOUNTY = { min: 50, mult: 1.25 };   // 头名悬赏（2.2.0 B2）：存款第一且至少 $50 的员工头上戴皇冠，老板抓到他收益 ×1.25（计划是 ×1.5，模拟后老板太强，降到 ×1.25）
  A.PREP = { time: 20, min: 15, max: 30, countdown: 3, auto: false };   // auto：倒计时结束自动开局（2.6.3 单人版关掉，要玩家点「准备好了」）   // 开局准备：读身份卡（默认 20 秒，可配 15–30），最后 3 秒倒数
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
  // 每个人的视野：老板被动 +2 格；猫头鹰被动 +2 格，夜视时再放大；（B2 停电事件会缩小）
  A.sightOf = a => {
    let w = A.SIGHT.w, h = A.SIGHT.h;
    const P = a && A.PASSIVES && A.PASSIVES[a.kind === 'boss' ? 'boss' : a.id];
    if (P && P.sight) { w += P.sight; h += P.sight; }
    if (a && a.nightT > 0 && A.empSkill) { const k = A.empSkill(a).range || 1; w *= k; h *= k; }
    if (a && a.sightMult) { w *= a.sightMult; h *= a.sightMult; }
    return { w, h };
  };
  A.inSight = (a, x, y) => { const S = A.sightOf(a); return Math.abs(x - a.x) <= S.w / 2 && Math.abs(y - a.y) <= S.h / 2; };

  // 首版 4 名员工角色（技能在 A4 加入，这里只放说明）
  A.CHARACTERS = {
    rabbit: { name: '兔子', skill: '插队', desc: '冲刺 3 秒，冲刺中能挤进满员的房间' },
    cat:    { name: '猫', skill: '打翻水杯', desc: '锁住视野里一个同事的工位 8 秒' },
    bear:   { name: '熊', skill: '堵门', desc: '在房间里堵住门，谁都进不来' },
    owl:    { name: '猫头鹰', skill: '夜视', desc: '几秒内看到外面一大片' },
  };
  A.EMPLOYEE_IDS = ['rabbit', 'cat', 'bear', 'owl'];
})(typeof window !== 'undefined' ? window : globalThis);
