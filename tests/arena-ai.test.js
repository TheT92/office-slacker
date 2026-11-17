// 摸鱼大作战（A3）：随机身份、玩家当老板、AI 员工三种性格、空房诱惑、办公区工资递减、老板随机冷却
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/events', 'arena/match'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
A.BOSS.wage = 0;   // 2.6.1 老板底薪：这些用例只核对抓人 / 红包收益，底薪单独在 arena-boss 里测
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
const quiet = o => new A.Match(Object.assign({ bossWait: 0, rng: mulberry32(21), playerRole: 'employee', playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false }, o));
function enter(m, a, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(a, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 1500 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }

test('随机身份：约 1/5 当老板；当老板时 4 名员工都由 AI 扮演、没有 AI 老板', () => {
  let boss = 0; for (let s = 1; s <= 400; s++) if (new A.Match({ bossWait: 0, rng: mulberry32(s), playerRole: 'random' }).role === 'boss') boss++;
  assert.ok(boss > 50 && boss < 110, '400 局里当老板 ' + boss + ' 次');
  const m = new A.Match({ bossWait: 0, rng: mulberry32(2), playerRole: 'boss' });
  assert.strictEqual(m.player, m.boss); assert.ok(m.boss.isPlayer); assert.strictEqual(m.bossAI, null);
  assert.strictEqual(m.empAI.length, 4); assert.ok(m.employees().every(e => !e.isPlayer && e.personality));
  const e = new A.Match({ bossWait: 0, rng: mulberry32(2), playerRole: 'employee' }); assert.strictEqual(e.empAI.length, 3); assert.ok(e.bossAI);
});

test('玩家当老板：点房间去查房、逗留期间走不了、出来后冷却在随机范围内且点了会提示', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(3), playerRole: 'boss', employeeAI: false }), b = m.player, c = m.grid.roomCells('pantry')[0];
  assert.ok(m.moveTo(b, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 2400 && b.room !== 'pantry'; i++) m.update(1 / 60);
  assert.strictEqual(b.room, 'pantry'); assert.ok(b.stay > 0);
  assert.strictEqual(m.moveTo(b, 12, 8), false); assert.strictEqual(m.exitRoom(b), false);
  assert.strictEqual(m.drainEvents().filter(e => e.type === 'blocked' && e.reason === 'stay').length, 2);
  tick(m, 4.1); assert.ok(m.action(b), '空格离开房间'); tick(m, 3); assert.strictEqual(b.room, null);
  const R = A.ROOMS.pantry; assert.ok(b.cooldowns.pantry > R.bossCdMin - 3 && b.cooldowns.pantry <= R.bossCdMax);
  assert.strictEqual(m.moveTo(b, c.c + 0.5, c.r + 0.5), false); assert.strictEqual(m.drainEvents().pop().reason, 'cooldown');
});

test('老板再查冷却每次随机、都在范围内，而且短于员工最长停留（跟在老板后面进去只是前几秒安全）', () => {
  const m = quiet(), b = m.boss, seen = new Set();
  for (let i = 0; i < 30; i++) { b.room = 'print'; b.stay = 0; b.x = 12.5; b.y = 7.5; m.update(1 / 60); const v = b.cooldowns.print; assert.ok(v >= 6 - 0.1 && v <= 12); seen.add(v.toFixed(2)); b.cooldowns.print = 0; }
  assert.ok(seen.size > 10, '每次不一样');
  for (const id of A.SLACK_ROOMS) assert.ok(A.ROOMS[id].bossCdMax + A.ROOMS[id].bossStay < A.ROOMS[id].maxStay + 3 && A.ROOMS[id].bossCdMax < A.ROOMS[id].maxStay);
});

test('空房诱惑：房间空着倍率上涨（最多 ×2），进去的人这一趟按倍率赚，然后清零', () => {
  const m = quiet(), p = m.player;
  assert.strictEqual(m.lure('pantry'), 1); tick(m, 10); assert.ok(Math.abs(m.lure('pantry') - 1.3) < 0.01);
  tick(m, 30); assert.strictEqual(m.lure('pantry'), 2);
  const m2 = quiet(), q = m2.player; tick(m2, 10); enter(m2, q, 'pantry');
  assert.ok(q.lure > 1.3 && q.lure < 1.6, '空了 10 秒多（含走路时间）'); assert.ok(m2.lure('pantry') < 1.01, '有人进去后清零');
  const before = q.pocket; tick(m2, 1); const gain = q.pocket - before;
  assert.ok(Math.abs(gain - A.rate('pantry', q.roomTime - 0.5) * q.lure) < 0.3, '收入乘以倍率');
  tick(m2, 5); assert.ok(m2.lure('pantry') < 1.01, '有人在里面时不涨'); void p;
});

test('办公区待太久工资变低：连续 20 秒后 $0.3/秒，进一次房间恢复', () => {
  const m = quiet(), p = m.player;
  tick(m, 20); const b20 = p.banked; tick(m, 10); assert.ok(Math.abs(p.banked - b20 - 3) < 0.1, '20 秒后每秒 $0.3');
  enter(m, p, 'print'); assert.strictEqual(p.officeTime, 0); tick(m, 4.1); m.exitRoom(p); tick(m, 2);
  const b1 = p.banked; tick(m, 2); assert.ok(Math.abs(p.banked - b1 - 2) < 0.1, '恢复 $1/秒');
});

test('AI 员工（全 AI 对局）：三种性格都会去摸鱼、存钱、也会被抓；贪心型平均口袋更大', () => {
  const agg = {};
  for (let s = 1; s <= 6; s++) {
    const m = new A.Match({ bossWait: 0, rng: mulberry32(s * 7), playerRole: 'employee', allAI: true, personalities: ['steady', 'greedy', 'savvy', ['steady', 'greedy', 'savvy'][s % 3]] });
    const dep = {};
    for (let i = 0; i < 60 * 240 && m.phase === 'playing'; i++) { m.update(1 / 60); for (const e of m.drainEvents()) if (e.type === 'deposit') (dep[e.who] = dep[e.who] || []).push(e.amount); }
    for (const ai of m.empAI) {
      const a = agg[ai.kind] = agg[ai.kind] || { n: 0, entries: 0, caught: 0, bank: 0, dep: [] };
      a.n++; a.entries += ai.e.stats.entries; a.caught += ai.e.stats.caught || 0; a.bank += ai.e.banked; a.dep.push(...(dep[ai.e.id] || []));
    }
  }
  const avg = k => agg[k].dep.reduce((s, v) => s + v, 0) / Math.max(1, agg[k].dep.length);
  for (const k of A.PERSONALITY_IDS) { const a = agg[k]; assert.ok(a.entries / a.n > 5, k + ' 会摸鱼'); assert.ok(a.bank / a.n > 300, k + ' 赚到钱'); assert.ok(a.dep.length > 0, k + ' 会回工位存钱'); }
  assert.ok(Object.values(agg).reduce((s, a) => s + a.caught, 0) > 10, 'AI 也会被抓');
  assert.ok(avg('greedy') > avg('steady'), '贪心型每次存得更多：' + avg('greedy').toFixed(0) + ' vs ' + avg('steady').toFixed(0));
});

test('精明型会跟在老板后面进刚查过的房间', () => {
  let follow = 0, total = 0;
  for (let s = 1; s <= 4; s++) {
    const m = new A.Match({ bossWait: 0, rng: mulberry32(s), playerRole: 'employee', allAI: true, personalities: ['savvy', 'savvy', 'savvy', 'savvy'] }); let lastLeave = {};
    for (let i = 0; i < 60 * 240 && m.phase === 'playing'; i++) {
      m.update(1 / 60);
      for (const e of m.drainEvents()) { if (e.type === 'bossLeave') lastLeave[e.room] = m.time; if (e.type === 'enter') { total++; if (lastLeave[e.room] != null && m.time - lastLeave[e.room] < 6) follow++; } }
    }
  }
  assert.ok(follow / total > 0.15, '跟进比例 ' + (follow / total).toFixed(2));
});

test('AI 员工在房间里看不到外面：老板就站在门口，它也照原计划待满才出来', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(5), playerRole: 'employee', bossAI: false, personalities: ['greedy', 'steady', 'savvy'] });
  const ai = m.empAI[0]; for (let i = 0; i < 60 * 30 && !ai.e.room; i++) m.update(1 / 60);
  assert.ok(ai.e.room, 'AI 进了房间'); const room = ai.e.room, plan = ai.plan;
  const o = m.grid.outside(room); m.boss.x = o.x; m.boss.y = o.y;   // 老板就在门外（不进去）
  let exitAt = null; for (let i = 0; i < 60 * 30 && exitAt === null; i++) { m.update(1 / 60); if (ai.mode === 'out' || !ai.e.room) exitAt = m.time; if (ai.e.room) var rt = ai.e.roomTime; }
  assert.ok(Math.abs(rt - plan) < 0.1, '按计划 ' + plan.toFixed(2) + ' 秒出门，实际 ' + rt.toFixed(2));
});

test('画面：老板视角看不见房间里的人、门牌不显示人数、工位显示"不在"；员工视角显示空房倍率和"工资变低了"', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const canvas = { width: 960, height: 540, getContext: () => ctx };
  const app = new A.App({ prep: 0, rng: mulberry32(6), matchOpts: { bossWait: 0, playerRole: 'boss', employeeAI: false } }), r = new A.Renderer(canvas, app);
  const m = app.start(), e = m.employees()[0]; enter(m, e, 'print'); tick(m, 1);
  texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('老板（你）') && texts.includes('$0') && !texts.includes('存款排行') && texts.includes('点房间门去查房'));
  assert.ok(!texts.includes(e.name), '房间里的员工不画（排行里的名字带序号）');
  assert.ok(texts.includes(e.name + ' 不在'), '工位显示不在');
  assert.ok(!texts.some(t => /^厕所 \d\/1/.test(t)), '门牌不显示人数');
  assert.strictEqual(r.cam.room, null, '老板不切换房间视角');
  for (let i = 0; i < 60 * 250; i++) m.update(1 / 60); texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('员工赢了') || texts.includes('老板胜利！'));
  const app2 = new A.App({ prep: 0, rng: mulberry32(6), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'cat', playerDesk: 1, employeeAI: false, bossAI: false } }), r2 = new A.Renderer(canvas, app2);
  const m2 = app2.start(); tick(m2, 21); texts.length = 0; r2.draw(0.016);
  assert.ok(texts.some(t => /^茶水间 0\/2 ×1\.6$/.test(t)), '空房倍率');
  assert.ok(texts.includes('工资变低了'));
});

test('老板也上排行榜：收益 = 每次没收 × 当次倍数（×1、×1.15、×1.3、×1.45、之后 ×1.5），和员工一起排名；不提前结束', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(4), playerRole: 'boss', employeeAI: false, time: 10 }); tick(m, 1);
  assert.deepStrictEqual([0, 1, 2, 3, 4, 9].map(A.catchMult), [1, 1.15, 1.3, 1.45, 1.5, 1.5]);
  const e = m.employees(); e[0].banked = 500; e[1].banked = 300;
  m.boss.stats.score = 480; assert.strictEqual(m.bossScore(), 480); assert.strictEqual(m.bossWin(), false); assert.strictEqual(m.finalRanking()[0].a, e[0]);
  m.boss.stats.score = 520; assert.strictEqual(m.bossWin(), true); assert.strictEqual(m.finalRanking().length, 5);
  m.boss.stats.score = 99999; m.update(1 / 60); assert.strictEqual(m.phase, 'playing', '不提前结束');
  tick(m, 10); assert.strictEqual(m.phase, 'over');
});

test('老板进了房间也看不到外面：切换成房间视角，别的员工不画', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(6), matchOpts: { bossWait: 0, playerRole: 'boss', employeeAI: false } }), r = new A.Renderer({ width: 960, height: 540, getContext: () => ctx }, app);
  const m = app.start(), b = m.player, c = m.grid.roomCells('print')[0];
  m.moveTo(b, c.c + 0.5, c.r + 0.5); for (let i = 0; i < 2400 && b.room !== 'print'; i++) m.update(1 / 60);
  texts.length = 0; r.draw(0.016);
  assert.strictEqual(r.cam.room, 'print');
  assert.ok(texts.includes('打印室查房') && texts.some(t => /^再待 \ds$/.test(t)));
  assert.ok(!m.employees().some(e => texts.includes(e.name)), '外面的员工不画');
});
