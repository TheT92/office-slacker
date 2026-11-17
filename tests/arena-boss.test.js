// 摸鱼大作战（A2）：老板查房（随机、进门即抓）、没收比例、自动出门、职场边界感（逗留 / 再查冷却 / 冒犯值 / HR 约谈）
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/events', 'arena/match'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
const mk = o => new A.Match(Object.assign({ bossWait: 0, rng: mulberry32(11), playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false }, o));
function enter(m, a, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(a, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 1500 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }
// 手动把老板走进某房间（不经 AI）
function bossInto(m, id) { const b = m.boss, c = m.grid.roomCells(id).slice(-1)[0]; assert.ok(m.pathTo(b, c.c + 0.5, c.r + 0.5), '老板能走到' + id); for (let i = 0; i < 2400 && b.room !== id; i++) m.update(1 / 60); assert.strictEqual(b.room, id); }

test('没收比例：20% 起，随在当前房间待的时间线性升到 100%', () => {
  const R = A.ROOMS.print;
  assert.ok(Math.abs(A.penaltyRatio('print', 0) - 0.2) < 1e-9);
  assert.ok(Math.abs(A.penaltyRatio('print', 3) - 0.36) < 1e-9);
  assert.ok(Math.abs(A.penaltyRatio('print', 9) - 0.68) < 1e-9);
  assert.strictEqual(A.penaltyRatio('print', R.maxStay), 1); assert.strictEqual(A.penaltyRatio('print', 99), 1);
});

test('老板一进门就算抓到：房里所有员工按比例没收口袋，已存的钱不动，老板记一次抓人', () => {
  const m = mk(), p = m.player; enter(m, p, 'pantry'); tick(m, 4);
  const bank = p.banked; m.drainEvents();
  bossInto(m, 'pantry');
  const ev = m.drainEvents().find(e => e.type === 'caught'); assert.ok(ev, '有被抓事件');
  const pocketBefore = p.pocket + ev.lost;
  assert.ok(Math.abs(ev.ratio - A.penaltyRatio('pantry', p.roomTime)) < 0.02);
  assert.ok(Math.abs(p.pocket - pocketBefore * (1 - ev.ratio)) < 1e-6, '只没收一部分');
  assert.ok(Math.abs(p.banked - bank) < 1e-9, '存款不受影响');
  assert.strictEqual(m.boss.stats.catches, 1); assert.ok(Math.abs(m.boss.stats.confiscated - ev.lost) < 1e-9);
});

test('被抓后不罚站：立刻自动出门（出门途中不能操作），出来后这个房间进入冷却', () => {
  const m = mk(), p = m.player; enter(m, p, 'print'); tick(m, 2); bossInto(m, 'print');
  assert.ok(!(p.stun > 0)); assert.ok(p.forced, '立刻自动出门'); assert.strictEqual(m.moveTo(p, 12, 7), false);
  tick(m, 2.5); assert.strictEqual(p.room, null); assert.ok(p.cooldowns.print > 0); assert.ok(!p.forced);
  assert.ok(m.boss.room === 'print' && m.boss.stay > 0, '员工出来时老板还在里面逗留');
});

test('老板在房间里时员工进不去（提示"老板在里面"）', () => {
  const m = mk(), p = m.player; bossInto(m, 'pantry');
  assert.strictEqual(m.entryBlock(p, 'pantry'), 'boss');
  const c = m.grid.roomCells('pantry')[0]; assert.strictEqual(m.moveTo(p, c.c + 0.5, c.r + 0.5), false);
  assert.strictEqual(m.drainEvents().pop().reason, 'boss');
});

test('职场边界感：进门必须逗留；出来后同一房间要冷却，其他房间可以查', () => {
  const m = mk(), b = m.boss; bossInto(m, 'print');
  assert.strictEqual(b.stay, A.ROOMS.print.bossStay - 0 > 0 ? b.stay : -1); assert.ok(b.stay > 2.9);
  const o = m.grid.outside('print'); assert.strictEqual(m.pathTo(b, o.x, o.y), false, '逗留期间出不去');
  tick(m, 3.1); assert.ok(m.pathTo(b, o.x, o.y)); tick(m, 3);
  assert.strictEqual(b.room, null); const R = A.ROOMS.print; assert.ok(b.cooldowns.print > R.bossCdMin - 3 && b.cooldowns.print <= R.bossCdMax, '冷却在随机范围内');
  assert.strictEqual(m.entryBlock(b, 'print'), 'cooldown'); assert.strictEqual(m.entryBlock(b, 'pantry'), null);
});

test('查空房扣 15 点怒气，抓到人 +10（2.2.0 取消冒犯值和 HR 约谈）', () => {
  const m = mk(), b = m.boss; b.anger = 50; bossInto(m, 'print');
  assert.ok(Math.abs(b.anger - (50 + m.time * A.ANGER.perSec - A.BOSS.emptyAnger)) < 0.1, '查空扣怒气：' + b.anger.toFixed(1));
  assert.ok(m.drainEvents().some(e => e.type === 'check' && e.empty));
  const m2 = mk(), p2 = m2.player; enter(m2, p2, 'print'); m2.boss.anger = 50; bossInto(m2, 'print');
  assert.ok(m2.boss.anger > 59, '抓到人加怒气'); assert.strictEqual(m2.boss.offense, undefined); assert.strictEqual(m2.boss.hr, undefined);
  const m3 = mk(), b3 = m3.boss; b3.anger = 5; bossInto(m3, 'pantry'); assert.ok(b3.anger >= 0 && b3.anger < 5, '怒气不会扣成负数');
});

test('厕所：老板进不去，里面的人安全；固定 $2/秒直接存入，最多 10 秒，出来腿麻、冷却 45 秒', () => {
  const m = mk(), p = m.player, R = A.ROOMS.toilet; enter(m, p, 'toilet');
  assert.strictEqual(m.entryBlock(m.boss, 'toilet'), 'locked'); assert.strictEqual(p.combo, 0, '进厕所不算连摸');
  const bank = p.banked; tick(m, 5); assert.ok(Math.abs(p.banked - bank - R.wage * 5) < 0.2, '直接存入'); assert.strictEqual(p.pocket, 0);
  tick(m, 5.2); assert.ok(p.forced || !p.room, '10 秒到了自动出门'); tick(m, 2); assert.strictEqual(p.room, null);
  assert.ok(p.cooldowns.toilet > R.cooldown - 3); assert.ok(p.numbT > 0, '腿麻');
  const x = p.x; m.setDir(p, -1, 0); m.update(0.1); assert.ok(Math.abs((x - p.x) - A.MOVE.employee * A.PASSIVES.rabbit.speed * R.numbMult * 0.1) < 1e-6, '腿麻移动 ×0.6');
});

test('敲厕所门：门口站 2 秒，里面的人剩余时间减半（只能敲一次）', () => {
  const m = mk(), p = m.player, q = m.employees()[1], R = A.ROOMS.toilet; enter(m, p, 'toilet'); tick(m, 2);
  const o = m.grid.outside('toilet'); q.x = o.x; q.y = o.y; q.path = []; m.drainEvents();
  tick(m, R.knock + 0.1); const ev = m.drainEvents().find(e => e.type === 'knock'); assert.ok(ev && ev.who === p.id && ev.by === q.id);
  assert.ok(Math.abs(p.toiletCap - (2 + R.knock + (R.maxStay - 2 - R.knock) / 2)) < 0.1, '剩余时间减半：' + p.toiletCap.toFixed(2));
  tick(m, 3); assert.ok(!m.drainEvents().some(e => e.type === 'knock'), '只能敲一次');
});

test('AI 老板：随机查房，几分钟内三个房间都会查到，并遵守逗留与冷却', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(5), playerChar: 'cat', playerDesk: 1, employeeAI: false }), seen = new Set(); let last = {};
  const checks = [];
  for (let i = 0; i < 60 * 180; i++) {
    m.update(1 / 60);
    for (const e of m.drainEvents()) if (e.type === 'check') { seen.add(e.room); checks.push({ room: e.room, t: m.time }); if (last[e.room] != null) assert.ok(m.time - last[e.room] >= A.ROOMS[e.room].bossStay + A.ROOMS[e.room].bossCdMin, '再查冷却'); last[e.room] = m.time; }
  }
  assert.deepStrictEqual([...seen].sort(), ['pantry', 'print', 'rooftop']);
  assert.ok(checks.length >= 8, '3 分钟至少查 8 次：' + checks.length);
});

test('简单难度的 AI 老板完全随机（不看任何人、不用监控技能时）：同一随机种子下，有没有人在房间里，查房顺序都一样', () => {
  const order = sit => {
    const m = new A.Match({ bossWait: 0, rng: mulberry32(9), playerChar: 'bear', playerDesk: 3, time: 120, employeeAI: false, noBossSkills: true, difficulty: 'easy' }); const out = [];   // 不含"监控"技能（那是合法的偷看）
    if (sit) { const p = m.player; p.x = m.grid.roomCells('rooftop')[0].c + 0.5; p.y = m.grid.roomCells('rooftop')[0].r + 0.5; m.setDir(p, 0, 0); p.cooldowns.rooftop = 0; }
    for (let i = 0; i < 60 * 60; i++) { m.update(1 / 60); for (const e of m.drainEvents()) if (e.type === 'check') out.push(e.room); }
    return out.slice(0, 4).join(',');
  };
  assert.strictEqual(order(false), order(true));
});

test('员工走到半路老板先进去了：被弹回门外，不算被抓', () => {
  const m = mk(), p = m.player, o = m.grid.outside('print'); m.boss.x = o.x; m.boss.y = o.y + 1;   // 老板就在门口
  const c = m.grid.roomCells('print')[0]; assert.ok(m.moveTo(p, c.c + 0.5, c.r + 0.5));
  bossInto(m, 'print'); m.drainEvents(); tick(m, 6);
  assert.strictEqual(p.room, null); assert.ok(!p.stats.caught);
});

test('画面：老板红名牌（查房！）、门上"老板在里面"、结算里老板也在排行中', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(4), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'owl', playerDesk: 0, bossAI: false, employeeAI: false, time: 60 } }), r = new A.Renderer({ width: 960, height: 540, getContext: () => ctx }, app);
  const m = app.start(); bossInto(m, 'pantry'); const po = m.grid.outside('pantry'); m.player.x = po.x + 2; m.player.y = po.y; texts.length = 0; r.draw(0.016);   // 站到茶水间门口附近（门在视野里）
  assert.ok(texts.includes('老板 · 查房！') && texts.includes('老板在里面') && !texts.includes('老板冒犯值'), '员工看不到冒犯值');
  m.boss.stay = 0; const o = m.grid.outside('pantry'); m.pathTo(m.boss, o.x, o.y); tick(m, 4);
  enter(m, m.player, 'print'); m.boss.cooldowns.print = 0; bossInto(m, 'print'); texts.length = 0; r.draw(0.016);
  for (let i = 0; i < 60 * 70; i++) m.update(1 / 60); r.draw(0.016); r.draw(3); texts.length = 0; r.draw(0.016);   // 结算逐行揭晓，先让动画走完
  assert.ok(texts.includes('老板') && texts.some(t => /^没收 \$\d+ · 抓到 1 人次$/.test(t)), '结算里老板一栏');
});

test('在房间里看不到外面：门上的"老板在里面"、别的房间满没满都看不到', () => {
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(8), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'owl', playerDesk: 2, bossAI: false, employeeAI: false } }), r = new A.Renderer({ width: 960, height: 540, getContext: () => ctx }, app);
  const m = app.start(); bossInto(m, 'pantry'); const po = m.grid.outside('pantry'); m.player.x = po.x + 2; m.player.y = po.y;
  texts.length = 0; r.draw(0.016); assert.ok(texts.includes('老板在里面'), '在办公区、门在视野里能看到');
  m.player.x = m.grid.outside('toilet').x - 1; texts.length = 0; r.draw(0.016); assert.ok(!texts.includes('老板在里面'), '门不在视野里就看不到');
  enter(m, m.player, 'rooftop'); texts.length = 0; r.draw(0.016);
  assert.ok(!texts.includes('老板在里面') && !texts.includes('满了') && texts.includes('在天台摸鱼'));
});

test('连摸途中被抓：按比例没收整个口袋，连摸加成清零', () => {
  const m = mk(), p = m.player;
  enter(m, p, 'pantry'); tick(m, 4.1); m.exitRoom(p); tick(m, 1.5); enter(m, p, 'print'); assert.strictEqual(p.combo, 2);
  tick(m, 1); bossInto(m, 'print'); assert.strictEqual(p.combo, 0); assert.ok(p.pocket > 0, '没扣光');
});

test('玩家当老板：开局"老板还在路上"用完全不透明的底色盖住场景，员工名字和飘字都不画', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], fills = [];
  const ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)), fillRect() { fills.push(ctx.fillStyle); } }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(6), matchOpts: { bossWait: 5, playerRole: 'boss' } }), r = new A.Renderer({ width: 540, height: 960, getContext: () => ctx }, app);
  const m = app.start(); tick(m, 1); r.float(10, 10, '+$5', '#000');
  texts.length = 0; fills.length = 0; r.draw(0.016);
  assert.ok(texts.includes('老板还在路上'));
  const i = fills.lastIndexOf('#4A3A2E'); assert.ok(i >= 0, '用不透明颜色盖住');
  const after = texts.slice(texts.indexOf('老板还在路上'));
  m.employees().forEach(e => assert.ok(!after.includes(e.name), '盖住以后不再画员工名字：' + e.name));
  assert.ok(!texts.includes('+$5'), '飘字不画');
});
