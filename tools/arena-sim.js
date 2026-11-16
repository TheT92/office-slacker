// 摸鱼大作战：平衡模拟。跑 N 局全 AI 对局（1 个 AI 老板 + 4 个 AI 员工），输出平衡指标。
// 用法：
//   node tools/arena-sim.js 200                      # 普通难度 200 局
//   node tools/arena-sim.js 200 --difficulty=all     # 简单 / 普通 / 困难各 200 局
//   node tools/arena-sim.js 200 --set ROOMS.rooftop.peak=10 --set WIN.catchMult=[1,1.1,1.2,1.4]
//   node tools/arena-sim.js 100 --json               # 输出 JSON（方便比较）
const path = require('path');
global.OS = global.OS || {};
['config', 'path', 'bossai', 'empai', 'skills', 'supply', 'match'].forEach(m => require(path.join(__dirname, '../src/arena', m + '.js')));
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
  const R = { n, bossFirst: 0, bossScore: 0, topEmp: 0, checks: 0, catches: 0, empty: 0, complaints: 0, room: { restroom: 0, pantry: 0, rooftop: 0 },
    pers: {}, deposits: 0, comboHi: 0, supplies: 0, picks: 0, taken: 0, awards: {}, empSum: 0 };
  for (let s = 0; s < n; s++) {
    const m = new A.Match({ rng: mulberry(seed0 + s * 7919), playerRole: 'employee', allAI: true, difficulty });
    for (let i = 0; i < 60 * (A.ECON.matchTime + 10) && m.phase !== 'over'; i++) {
      m.update(1 / 60);
      for (const e of m.drainEvents()) {
        if (e.type === 'complaint') R.complaints++;
        if (e.type === 'deposit') { R.deposits++; if (e.mult >= 1.4) R.comboHi++; }
      }
    }
    const rank = m.finalRanking(), bs = m.boss.stats;
    if (rank[0].a === m.boss) R.bossFirst++;
    R.bossScore += m.bossScore(); R.topEmp += Math.max(...m.employees().map(e => e.banked));
    R.checks += bs.checks; R.catches += bs.catches; R.empty += bs.empty;
    R.supplies += m.stats.supplies; R.picks += m.stats.picks; R.taken += m.stats.taken;
    for (const e of m.employees()) {
      R.empSum += e.banked;
      for (const r in R.room) R.room[r] += e.stats.roomTime[r];
      const P = R.pers[e.personality] = R.pers[e.personality] || { n: 0, bank: 0, caught: 0, first: 0 };
      P.n++; P.bank += e.banked; P.caught += e.stats.caught || 0; if (rank[0].a === e) P.first++;
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
    checks: f(R.checks), catches: f(R.catches), empty: f(R.empty), complaintsPerGame: (R.complaints / n).toFixed(2),
    roomShare: Object.fromEntries(Object.entries(R.room).map(([k, v]) => [k, pct(v / roomTot)])),
    personality: Object.fromEntries(Object.entries(R.pers).map(([k, P]) => [k, { bank: Math.round(P.bank / P.n), caught: (P.caught / P.n).toFixed(1), first: pct(P.first / n) }])),
    depositsPerGame: f(R.deposits), comboAtLeast14: pct(R.comboHi / Math.max(1, R.deposits)),
    supplies: f(R.supplies), picked: pct(R.picks / Math.max(1, R.supplies)), takenByBoss: pct(R.taken / Math.max(1, R.supplies)),
    awards: Object.fromEntries(Object.entries(R.awards).map(([k, v]) => [k, pct(v / n)])),
  };
  if (json) { console.log(JSON.stringify(out)); return out; }
  console.log('\n=== ' + A.DIFFICULTY[name].name + '（' + n + ' 局）===');
  console.log('老板拿第一 ' + out.bossFirst + ' · 老板收益 $' + out.bossScore + ' · 员工第一 $' + out.topEmployee + ' · 员工平均 $' + out.avgEmployee);
  console.log('每局：查房 ' + out.checks + ' · 抓到 ' + out.catches + ' 人次 · 查空 ' + out.empty + ' · 员工投诉 ' + out.complaintsPerGame);
  console.log('房间时长占比：厕所 ' + out.roomShare.restroom + ' · 茶水间 ' + out.roomShare.pantry + ' · 天台 ' + out.roomShare.rooftop);
  for (const [k, P] of Object.entries(out.personality)) console.log('  ' + A.PERSONALITIES[k].name + '：平均存款 $' + P.bank + ' · 被抓 ' + P.caught + ' 次 · 拿第一 ' + P.first);
  console.log('存钱 ' + out.depositsPerGame + ' 次/局 · 连摸 ×1.4 以上 ' + out.comboAtLeast14 + ' · 补给 ' + out.supplies + ' 个/局（被捡 ' + out.picked + '，被老板收走 ' + out.takenByBoss + '）');
  console.log('称号出现率：' + Object.entries(out.awards).map(([k, v]) => k + ' ' + v).join(' · '));
  return out;
}

const which = opt('difficulty') || 'normal', list = which === 'all' ? A.DIFFICULTY_IDS : [which];
for (const d of list) report(d, run(d, N, parseInt(opt('seed') || '1', 10)));
