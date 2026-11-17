// 摸鱼大作战：平衡模拟。跑 N 局全 AI 对局（1 个 AI 老板 + 4 个 AI 员工），输出平衡指标。
// 用法：
//   node tools/arena-sim.js 200                      # 普通难度 200 局
//   node tools/arena-sim.js 200 --difficulty=all     # 简单 / 普通 / 困难各 200 局
//   node tools/arena-sim.js 200 --set ROOMS.rooftop.peak=10 --set WIN.catchMult=[1,1.1,1.2,1.4]
//   node tools/arena-sim.js 100 --json               # 输出 JSON（方便比较）
const path = require('path');
global.OS = global.OS || {};
['config', 'path', 'bossai', 'empai', 'skills', 'supply', 'events', 'match'].forEach(m => require(path.join(__dirname, '../src/arena', m + '.js')));
const A = OS.arena;

const args = process.argv.slice(2), N = parseInt(args.find(a => /^\d+$/.test(a)) || '100', 10);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const json = args.includes('--json');
// --set A.路径=值（值按 JSON 解析，解析失败当字符串）
args.forEach((a, i) => {
  if (a !== '--set') return; const [k, v] = args[i + 1].split('='), keys = k.split('.'); let o = A;
  for (const key of keys.slice(0, -1)) o = o[key];
  let val; try { val = JSON.parse(v); } catch (e) { val = v; } o[keys[keys.length - 1]] = val;
});
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function run(difficulty, n, seed0) {
  const R = { n, bossFirst: 0, bossScore: 0, topEmp: 0, checks: 0, catches: 0, empty: 0, room: { print: 0, pantry: 0, rooftop: 0, toilet: 0 }, ev: { bumped: 0, deskLock: 0, deskLocked: 0, knock: 0, toilet: 0, lockedDoor: 0, event: 0, bag: 0, slip: 0, itemUse: 0, stolen: 0, bounty: 0 }, chars: {},
    pers: {}, gap: 0, spread: 0, deposits: 0, comboHi: 0, supplies: 0, picks: 0, taken: 0, awards: {}, empSum: 0 };
  for (let s = 0; s < n; s++) {
    const m = new A.Match({ rng: mulberry(seed0 + s * 7919), playerRole: 'employee', allAI: true, difficulty });
    for (let i = 0; i < 60 * (A.ECON.matchTime + 10) && m.phase !== 'over'; i++) {
      m.update(1 / 60);
      for (const e of m.drainEvents()) {
        if (e.type in R.ev) R.ev[e.type]++;
        if (e.type === 'enter' && e.room === 'toilet') R.ev.toilet++;
        if (e.type === 'caught' && e.bounty) R.ev.bounty++;
        if (e.type === 'blocked' && e.reason === 'lockedDoor' && e.who === 'boss') R.ev.lockedDoor++;
        if (e.type === 'deposit') { R.deposits++; if (e.mult >= 1.4) R.comboHi++; }
      }
    }
    const rank = m.finalRanking(), bs = m.boss.stats;
    if (rank[0].a === m.boss) R.bossFirst++;
    R.bossScore += m.bossScore(); R.topEmp += Math.max(...m.employees().map(e => e.banked));
    { const bs = m.employees().map(e => e.banked).sort((a, b) => b - a); R.gap += bs[0] - bs[1]; R.spread += bs[0] - bs[3]; }
    R.checks += bs.checks; R.catches += bs.catches; R.empty += bs.empty;
    R.supplies += m.stats.supplies; R.picks += m.stats.picks; R.taken += m.stats.taken;
    for (const e of m.employees()) {
      R.empSum += e.banked;
      for (const r in R.room) R.room[r] += e.stats.roomTime[r];
      const P = R.pers[e.personality] = R.pers[e.personality] || { n: 0, bank: 0, caught: 0, first: 0 };
      P.n++; P.bank += e.banked; P.caught += e.stats.caught || 0; if (rank[0].a === e) P.first++;
      const Ch = R.chars[e.id] = R.chars[e.id] || { n: 0, bank: 0, first: 0 }; Ch.n++; Ch.bank += e.banked; if (rank[0].a === e) Ch.first++;
    }
    for (const w of m.awards()) R.awards[w.title] = (R.awards[w.title] || 0) + 1;
  }
  return R;
}

function report(name, R) {
  const n = R.n, pct = v => (100 * v).toFixed(0) + '%', f = v => (v / n).toFixed(1);
  const roomTot = Object.values(R.room).reduce((a, b) => a + b, 0);
  const out = {
    difficulty: name, games: n,
    bossFirst: pct(R.bossFirst / n), bossScore: Math.round(R.bossScore / n), topEmployee: Math.round(R.topEmp / n), avgEmployee: Math.round(R.empSum / n / 4),
    gap: Math.round(R.gap / n), spread: Math.round(R.spread / n), checks: f(R.checks), catches: f(R.catches), empty: f(R.empty), events: Object.fromEntries(Object.entries(R.ev).map(([k, v]) => [k, f(v)])),
    characters: Object.fromEntries(Object.entries(R.chars).map(([k, C]) => [k, { bank: Math.round(C.bank / C.n), first: pct(C.first / n) }])),
    roomShare: Object.fromEntries(Object.entries(R.room).map(([k, v]) => [k, pct(v / roomTot)])),
    personality: Object.fromEntries(Object.entries(R.pers).map(([k, P]) => [k, { bank: Math.round(P.bank / P.n), caught: (P.caught / P.n).toFixed(1), first: pct(P.first / n) }])),
    depositsPerGame: f(R.deposits), comboAtLeast14: pct(R.comboHi / Math.max(1, R.deposits)),
    supplies: f(R.supplies), picked: pct(R.picks / Math.max(1, R.supplies)), takenByBoss: pct(R.taken / Math.max(1, R.supplies)),
    awards: Object.fromEntries(Object.entries(R.awards).map(([k, v]) => [k, pct(v / n)])),
  };
  if (json) { console.log(JSON.stringify(out)); return out; }
  console.log('\n=== ' + A.DIFFICULTY[name].name + '（' + n + ' 局）===');
  console.log('老板拿第一 ' + out.bossFirst + ' · 老板收益 $' + out.bossScore + ' · 员工第一 $' + out.topEmployee + ' · 员工平均 $' + out.avgEmployee);
  console.log('员工竞争：第 1 名比第 2 名多 $' + out.gap + ' · 第 1 名比第 4 名多 $' + out.spread);
  console.log('每局：查房 ' + out.checks + ' · 抓到 ' + out.catches + ' 人次 · 查空 ' + out.empty);
  console.log('房间时长占比：打印室 ' + out.roomShare.print + ' · 茶水间 ' + out.roomShare.pantry + ' · 天台 ' + out.roomShare.rooftop + ' · 厕所 ' + out.roomShare.toilet);
  console.log('每局互动：进厕所 ' + out.events.toilet + ' · 敲门 ' + out.events.knock + ' · 插队 ' + out.events.bumped + ' · 打翻工位 ' + out.events.deskLock + '（有人因此等着存钱 ' + out.events.deskLocked + '）· 老板被堵在门外 ' + out.events.lockedDoor);
  console.log('事件与道具：随机事件 ' + out.events.event + ' 轮 · 红包被捡 ' + out.events.bag + ' · 用道具 ' + out.events.itemUse + ' · 滑倒 ' + out.events.slip + ' · 被抢功劳 ' + out.events.stolen + ' · 抓到头名 ' + out.events.bounty);
  console.log('角色：' + Object.entries(out.characters).map(([k, C]) => A.CHARACTERS[k].name + ' $' + C.bank + '（第一 ' + C.first + '）').join(' · '));
  for (const [k, P] of Object.entries(out.personality)) console.log('  ' + A.PERSONALITIES[k].name + '：平均存款 $' + P.bank + ' · 被抓 ' + P.caught + ' 次 · 拿第一 ' + P.first);
  console.log('存钱 ' + out.depositsPerGame + ' 次/局 · 连摸 ×1.4 以上 ' + out.comboAtLeast14 + ' · 补给 ' + out.supplies + ' 个/局（被捡 ' + out.picked + '，被老板收走 ' + out.takenByBoss + '）');
  console.log('称号出现率：' + Object.entries(out.awards).map(([k, v]) => k + ' ' + v).join(' · '));
  return out;
}

const which = opt('difficulty') || 'normal', list = which === 'all' ? A.DIFFICULTY_IDS : [which];
for (const d of list) report(d, run(d, N, parseInt(opt('seed') || '1', 10)));
