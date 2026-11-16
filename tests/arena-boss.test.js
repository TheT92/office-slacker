// 摸鱼大作战（A2）：老板查房（随机、进门即抓）、没收比例、自动出门、职场边界感（逗留 / 再查冷却 / 冒犯值 / HR 约谈）
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/match'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
const mk = o => new A.Match(Object.assign({ bossWait: 0, rng: mulberry32(11), playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false }, o));
function enter(m, a, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(a, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 1500 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }
// 手动把老板走进某房间（不经 AI）
function bossInto(m, id) { const b = m.boss, c = m.grid.roomCells(id).slice(-1)[0]; assert.ok(m.pathTo(b, c.c + 0.5, c.r + 0.5), '老板能走到' + id); for (let i = 0; i < 2400 && b.room !== id; i++) m.update(1 / 60); assert.strictEqual(b.room, id); }

test('没收比例：20% 起，随在当前房间待的时间线性升到 100%', () => {
  const R = A.ROOMS.restroom;
  assert.ok(Math.abs(A.penaltyRatio('restroom', 0) - 0.2) < 1e-9);
  assert.ok(Math.abs(A.penaltyRatio('restroom', 3) - 0.36) < 1e-9);
  assert.ok(Math.abs(A.penaltyRatio('restroom', 9) - 0.68) < 1e-9);
  assert.strictEqual(A.penaltyRatio('restroom', R.maxStay), 1); assert.strictEqual(A.penaltyRatio('restroom', 99), 1);
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
  const m = mk(), p = m.player; enter(m, p, 'restroom'); tick(m, 2); bossInto(m, 'restroom');
  assert.ok(!(p.stun > 0)); assert.ok(p.forced, '立刻自动出门'); assert.strictEqual(m.moveTo(p, 12, 7), false);
  tick(m, 2.5); assert.strictEqual(p.room, null); assert.ok(p.cooldowns.restroom > 0); assert.ok(!p.forced);
  assert.ok(m.boss.room === 'restroom' && m.boss.stay > 0, '员工出来时老板还在里面逗留');
});

test('老板在房间里时员工进不去（提示"老板在里面"）', () => {
  const m = mk(), p = m.player; bossInto(m, 'pantry');
  assert.strictEqual(m.entryBlock(p, 'pantry'), 'boss');
  const c = m.grid.roomCells('pantry')[0]; assert.strictEqual(m.moveTo(p, c.c + 0.5, c.r + 0.5), false);
  assert.strictEqual(m.drainEvents().pop().reason, 'boss');
});

test('职场边界感：进门必须逗留；出来后同一房间要冷却，其他房间可以查', () => {
  const m = mk(), b = m.boss; bossInto(m, 'restroom');
  assert.strictEqual(b.stay, A.ROOMS.restroom.bossStay - 0 > 0 ? b.stay : -1); assert.ok(b.stay > 2.9);
  const o = m.grid.outside('restroom'); assert.strictEqual(m.pathTo(b, o.x, o.y), false, '逗留期间出不去');
  tick(m, 3.1); assert.ok(m.pathTo(b, o.x, o.y)); tick(m, 3);
  assert.strictEqual(b.room, null); const R = A.ROOMS.restroom; assert.ok(b.cooldowns.restroom > R.bossCdMin - 3 && b.cooldowns.restroom <= R.bossCdMax, '冷却在随机范围内');
  assert.strictEqual(m.entryBlock(b, 'restroom'), 'cooldown'); assert.strictEqual(m.entryBlock(b, 'pantry'), null);
});

test('冒犯值：查空比抓到人涨得多、随时间回落；过半移动变慢', () => {
  const m = mk(), b = m.boss, p = m.player;
  bossInto(m, 'restroom'); const empty = b.offense;
  assert.ok(empty > A.ROOMS.restroom.offenseEmpty - 2);
  tick(m, 5); assert.ok(b.offense < empty, '会回落');
  const m2 = mk(), p2 = m2.player; enter(m2, p2, 'restroom'); bossInto(m2, 'restroom');
  assert.ok(m2.boss.offense < empty, '抓到人涨得少');
  void p;
  const m3 = mk(), b3 = m3.boss; b3.offense = 90; b3.path = [{ x: 5.5, y: 5.5 }]; b3.x = 7.5; b3.y = 5.5; m3.update(0.1);
  assert.ok(Math.abs((7.5 - b3.x) - A.MOVE.boss * A.BOSS.slowMult * 0.1) < 1e-6, '冒犯值过半变慢');
});

test('冒犯值满：员工投诉，老板被 HR 约谈 10 秒不能动，之后冒犯值回到 40', () => {
  const m = mk(), b = m.boss; b.offense = 95; m.drainEvents();
  bossInto(m, 'restroom');
  assert.ok(m.drainEvents().some(e => e.type === 'complaint')); assert.ok(b.hr > 9.9);
  const x = b.x; assert.strictEqual(m.moveTo(b, 12, 7), false); tick(m, 5); assert.strictEqual(b.x, x);
  tick(m, 5.1); assert.strictEqual(b.hr, 0); assert.ok(Math.abs(b.offense - A.BOSS.hrReset) < 0.5);
});

test('AI 老板：随机查房，几分钟内三个房间都会查到，并遵守逗留与冷却', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(5), playerChar: 'cat', playerDesk: 1, employeeAI: false }), seen = new Set(); let last = {};
  const checks = [];
  for (let i = 0; i < 60 * 180; i++) {
    m.update(1 / 60);
    for (const e of m.drainEvents()) if (e.type === 'check') { seen.add(e.room); checks.push({ room: e.room, t: m.time }); if (last[e.room] != null) assert.ok(m.time - last[e.room] >= A.ROOMS[e.room].bossStay + A.ROOMS[e.room].bossCdMin, '再查冷却'); last[e.room] = m.time; }
  }
  assert.deepStrictEqual([...seen].sort(), ['pantry', 'restroom', 'rooftop']);
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
  const m = mk(), p = m.player;
  const c = m.grid.roomCells('restroom')[0]; assert.ok(m.moveTo(p, c.c + 0.5, c.r + 0.5));
  bossInto(m, 'restroom'); m.drainEvents(); tick(m, 6);
  assert.strictEqual(p.room, null); assert.ok(!p.stats.caught);
});

test('画面：查房气泡、门上"老板在里面"、冒犯值条、训话中、HR 约谈、结算里老板也在排行中', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(4), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'owl', playerDesk: 0, bossAI: false, employeeAI: false, time: 60 } }), r = new A.Renderer({ width: 960, height: 540, getContext: () => ctx }, app);
  const m = app.start(); bossInto(m, 'pantry'); texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('查房！') && texts.includes('老板在里面') && texts.includes('老板冒犯值'));
  m.boss.stay = 0; const o = m.grid.outside('pantry'); m.pathTo(m.boss, o.x, o.y); tick(m, 4);
  enter(m, m.player, 'restroom'); m.boss.cooldowns.restroom = 0; bossInto(m, 'restroom'); texts.length = 0; r.draw(0.016);
  m.boss.hr = 5; texts.length = 0; r.draw(0.016); assert.ok(texts.includes('HR 约谈中'));
  m.boss.hr = 0; for (let i = 0; i < 60 * 70; i++) m.update(1 / 60); r.draw(0.016); r.draw(3); texts.length = 0; r.draw(0.016);   // 结算逐行揭晓，先让动画走完
  assert.ok(texts.includes('老板') && texts.some(t => /^没收 \$\d+ · 抓到 1 人次$/.test(t)), '结算里老板一栏'); assert.ok(texts.some(t => /老板收益 = 每次没收 × 当次倍数/.test(t)));
});

test('在房间里看不到外面：状态卡不显示老板在哪、别的房间有没有人，冒犯值条也隐藏', () => {
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(8), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'owl', playerDesk: 2, bossAI: false, employeeAI: false } }), r = new A.Renderer({ width: 960, height: 540, getContext: () => ctx }, app);
  const m = app.start(); bossInto(m, 'pantry');
  texts.length = 0; r.draw(0.016); assert.ok(texts.includes('老板在里面') && texts.includes('老板冒犯值'), '在办公区能看到');
  enter(m, m.player, 'rooftop'); texts.length = 0; r.draw(0.016);
  assert.ok(!texts.includes('老板在里面') && !texts.includes('老板冒犯值') && !texts.includes('满了'));
  assert.ok(texts.includes('看不到') && texts.includes('在房间里看不到老板') && texts.includes('你在这里'));
});

test('连摸途中被抓：按比例没收整个口袋，连摸加成清零', () => {
  const m = mk(), p = m.player;
  enter(m, p, 'pantry'); tick(m, 4.1); m.exitRoom(p); tick(m, 1.5); enter(m, p, 'restroom'); assert.strictEqual(p.combo, 2);
  tick(m, 1); bossInto(m, 'restroom'); assert.strictEqual(p.combo, 0); assert.ok(p.pocket > 0, '没扣光');
});
