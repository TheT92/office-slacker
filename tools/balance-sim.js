// 用脚本机器人模拟每一关，输出通关率/平均金额/平均被抓/星级分布/失败原因，辅助调数值。
// 用法：node tools/balance-sim.js [局数=200] [关卡范围，如 11-15]
// 每关假设之前各关都已通关（角色按解锁表可用）。阵容：默认（按角色表顺序填满）/ 高薪（按时薪从高到低）。
// 普通技能由游戏自动释放。机器人只负责玩家的操作：
//   挂机：什么都不做（不放特殊技能、不召回）。
//   玩家：看到房间危险后经过 0.4~1.6 秒真实时间的反应才召回 + 最佳时机放特殊技能（优先带走/拖住，其次打掩护；掩护中不召回）。
//   玩家×2：同上，但开着 2 倍速，同样的真实反应时间折算成游戏时间翻倍（体现倍速的风险）。
const { OS, mulberry32 } = require('../tests/helper');
const N = +process.argv[2] || 200;
const idle = () => () => {};
function player(seed, speed) {
  speed = speed || 1;
  const r = mulberry32(seed * 7919 + 13), seen = {};   // seen[room] = 发现危险后的反应期限
  return g => {
    // 最佳时机放特殊技能：优先"带走/拖住"（能取消查房），取消不了再"打掩护"
    const gold = g.employees.filter(e => OS.hints.teamHint(g, e) === 'golden');
    const pick = gold.find(e => e.team.type !== 'shield') || gold.find(e => e.team.type === 'shield');
    if (pick) g.useTeam(pick.id);
    for (const room of g.map.recallRooms().map(z => z.id)) {
      if (g.shield > 0) break;                              // 掩护生效中不必召回
      if (!OS.hints.roomDanger(g, room)) { delete seen[room]; continue; }
      const now = g.level.timeLimit - g.timeLeft;
      if (seen[room] == null) seen[room] = now + (0.4 + 1.2 * r()) * speed;
      if (now >= seen[room]) { g.recallRoom(room); delete seen[room]; }
    }
  };
}
const BOTS = [['挂机', idle], ['玩家', s => player(s, 1)], ['玩家×2', s => player(s, 2)]];
const available = lv => Object.values(OS.characters).filter(c => OS.lineup.allowedByLevel(lv, c.id) && !(lv.banned || []).includes(c.id));
const LINEUPS = {
  默认: lv => available(lv).map(c => c.id).slice(0, lv.desks),
  高薪: lv => available(lv).sort((a, b) => b.wage - a.wage).map(c => c.id).slice(0, lv.desks),
};
function play(level, roster, seed, bot) {
  const g = new OS.Game(level, { rng: mulberry32(seed), roster }); g.start(); let n = 0;
  while (g.phase === 'playing' && n++ < 30000) { bot(g); g.update(1 / 60); }
  return g;
}
console.log('关卡  阵容 机器人    通关率  平均金额  平均被抓  星级分布(1/2/3)  失败(时间/被抓)');
const pct = x => (100 * x / N).toFixed(0).padStart(3) + '%';
const [lo, hi] = (process.argv[3] || '1-999').split('-').map(Number);
for (const level of OS.levels.filter(l => l.id >= lo && l.id <= (hi || lo))) {
  const seen = new Set();
  for (const [ln, pick] of Object.entries(LINEUPS)) {
    const roster = pick(level), key = roster.slice().sort().join();
    if (seen.has(key)) continue; seen.add(key);
    for (const [name, make] of BOTS) {
      let win = 0, money = 0, caught = 0; const stars = [0, 0, 0, 0], why = { time: 0, caught: 0 };
      for (let s = 1; s <= N; s++) {
        const g = play(level, roster, s, make(s)); win += g.phase === 'win'; money += g.money; caught += g.caught;
        if (g.phase === 'win') stars[OS.calcStars(g)]++; else why[g.endReason]++;
      }
      console.log(`${String(level.id).padEnd(3)}${level.maxCaught ? '考' : '  '} ${ln}  ${name.padEnd(5, '　')} ${pct(win)}   ${(money / N).toFixed(0).padStart(6)}   ${(caught / N).toFixed(2).padStart(6)}    ${stars.slice(1).map(pct).join(' ')}   ${pct(why.time)} ${pct(why.caught)}`);
    }
  }
}
