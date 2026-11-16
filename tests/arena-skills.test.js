// 摸鱼大作战（A4）：老板怒气与分阶段技能、员工技能与升级、补给
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/match'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
// 安静对局：没有 AI，补给不自动刷
const quiet = o => { const m = new A.Match(Object.assign({ bossWait: 0, rng: mulberry32(31), playerRole: 'employee', playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false }, o)); m.supplyT = 1e9; return m; };
function enter(m, a, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(a, c.c + 0.5, c.r + 0.5), '能走去 ' + id); for (let i = 0; i < 1500 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }
function bossInto(m, id) { const b = m.boss, c = m.grid.roomCells(id).slice(-1)[0]; assert.ok(m.pathTo(b, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 2400 && b.room !== id; i++) m.update(1 / 60); assert.strictEqual(b.room, id); }
const give = (m, ...ids) => { m.offer = null; m.boss.skills = ids; m.boss.anger = 100; };

test('阶段：开局和每 80 秒给老板 3 个技能选；AI 老板自动选，玩家老板 10 秒不选就随机；加倍罚款第 2 阶段才出现', () => {
  const ai = quiet(); tick(ai, 0.1); assert.strictEqual(ai.boss.skills.length, 1); assert.strictEqual(ai.offer, null);
  const m = quiet({ playerRole: 'boss' }); tick(m, 0.1);
  assert.strictEqual(m.offer.options.length, 3); assert.ok(!m.offer.options.includes('fine'), '第 1 阶段没有加倍罚款');
  assert.ok(m.pickBossSkill(m.offer.options[1])); assert.strictEqual(m.boss.skills.length, 1); assert.strictEqual(m.offer, null);
  tick(m, 80); assert.ok(m.offer && m.phaseIdx === 1); tick(m, 10.2); assert.strictEqual(m.offer, null); assert.strictEqual(m.boss.skills.length, 2, '10 秒不选自动随机');
  tick(m, 70); m.pickBossSkill(m.offer.options[0]); assert.strictEqual(m.boss.skills.length, 3); assert.strictEqual(new Set(m.boss.skills).size, 3);
  let seenFine = false; for (let s = 1; s < 40 && !seenFine; s++) { const k = quiet({ rng: mulberry32(s), playerRole: 'boss' }); tick(k, 0.1); k.pickBossSkill(k.offer.options[0]); tick(k, 80); seenFine = k.offer.options.includes('fine'); }
  assert.ok(seenFine, '第 2 阶段可能出现加倍罚款');
});

test('怒气：每秒 +1、抓到 1 人 +10；放技能扣怒气、进冷却；怒气不够放不了', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'dash'); b.anger = 0;
  tick(m, 5); assert.ok(Math.abs(b.anger - 5) < 0.1);
  assert.strictEqual(m.useBossSkill('dash'), false); assert.strictEqual(m.drainEvents().pop().reason, 'anger');
  b.anger = 30; assert.ok(m.useBossSkill('dash')); assert.ok(Math.abs(b.anger - 10) < 0.01); assert.strictEqual(m.useBossSkill('dash'), false);
  enter(m, p, 'restroom'); const before = b.anger; bossInto(m, 'restroom'); assert.ok(b.anger >= before + 10);
});

test('冲刺：老板 5 秒内 ×1.6；兔子 3 秒内 ×1.7', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'dash');
  m.useBossSkill('dash'); b.x = 8.5; b.y = 5.5; b.path = [{ x: 20.5, y: 5.5 }]; m.update(0.1); assert.ok(Math.abs(b.x - 8.5 - A.MOVE.boss * 1.6 * 0.1) < 1e-6);
  assert.ok(m.useEmpSkill(p)); p.x = 8.5; p.y = 5.5; p.path = [{ x: 20.5, y: 5.5 }]; m.update(0.1); assert.ok(Math.abs(p.x - 8.5 - A.MOVE.employee * 1.7 * 0.1) < 1e-6);
  tick(m, 3); p.x = 8.5; p.path = [{ x: 20.5, y: 5.5 }]; m.update(0.1); assert.ok(Math.abs(p.x - 8.5 - A.MOVE.employee * 0.1) < 1e-6, '时间到恢复');
});

test('监控：偷看一个房间 3 秒；在房间里用不了', () => {
  const m = quiet(), b = m.boss; give(m, 'peek');
  assert.ok(m.useBossSkill('peek', 'pantry')); assert.strictEqual(b.peek.room, 'pantry'); tick(m, 3.1); assert.strictEqual(b.peek, null);
  b.skillCd.peek = 0; b.anger = 100; bossInto(m, 'restroom'); assert.strictEqual(m.useBossSkill('peek', 'pantry'), false); assert.strictEqual(m.drainEvents().pop().reason, 'inRoom');
});

test('回马枪：离开房间 10 秒内无视冷却杀回去，每阶段 1 次', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'revisit');
  bossInto(m, 'restroom'); tick(m, 3.1); const o = m.grid.outside('restroom'); m.pathTo(b, o.x, o.y); tick(m, 1.5);
  assert.strictEqual(b.room, null); assert.ok(b.cooldowns.restroom > 0);
  tick(m, 2); void p;
  assert.ok(m.useBossSkill('revisit')); assert.strictEqual(b.cooldowns.restroom, 0);
  for (let i = 0; i < 600 && b.room !== 'restroom'; i++) m.update(1 / 60); assert.strictEqual(b.room, 'restroom', '自动走回去');
  tick(m, 3.1); m.pathTo(b, o.x, o.y); tick(m, 1.5); b.anger = 100;
  assert.strictEqual(m.useBossSkill('revisit'), false); assert.strictEqual(m.drainEvents().filter(e => e.type === 'skillFail').pop().reason, 'used');
  const m2 = quiet(); give(m2, 'revisit'); bossInto(m2, 'pantry'); tick(m2, 4.1); m2.pathTo(m2.boss, m2.grid.outside('pantry').x, m2.grid.outside('pantry').y); tick(m2, 12);
  assert.strictEqual(m2.useBossSkill('revisit'), false); assert.strictEqual(m2.drainEvents().pop().reason, 'window');
});

test('突击检查：下一次查房无视冷却、不用逗留，但冒犯值 +40', () => {
  const m = quiet(), b = m.boss; give(m, 'raid'); b.cooldowns.pantry = 10;
  assert.ok(m.useBossSkill('raid')); assert.strictEqual(m.entryBlock(b, 'pantry'), null);
  const off = b.offense; bossInto(m, 'pantry'); assert.strictEqual(b.stay, 0); assert.ok(b.offense >= off + 40 + A.ROOMS.pantry.offenseEmpty - 1);
  assert.strictEqual(b.raidNext, false);
});

test('临时会议：随机拉走一个正在摸鱼的人开会 8 秒（口袋保留），开完 5 秒免抓；老板定身 3 秒；没人摸鱼时放不了', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'meeting');
  assert.strictEqual(m.useBossSkill('meeting'), false); assert.strictEqual(m.drainEvents().pop().reason, 'noTarget');
  enter(m, p, 'pantry'); tick(m, 4); const pocket = p.pocket;
  assert.ok(m.useBossSkill('meeting')); assert.strictEqual(p.room, null); assert.ok(m.grid.cellAt(p.x, p.y).room === 'meeting');
  assert.ok(Math.abs(p.pocket - pocket) < 1e-9, '口袋保留'); assert.ok(p.cooldowns.pantry > 0); assert.strictEqual(b.freezeT, 3);
  assert.strictEqual(m.moveTo(p, 12, 7), false); assert.strictEqual(m.moveTo(b, 12, 7), false);
  tick(m, 8.1); assert.strictEqual(p.meetingT, 0); assert.ok(p.immuneT > 4);
  assert.ok(!m.grid.cellAt(p.x, p.y).room, '回到会议室门外');
  b.cooldowns.restroom = 0; enter(m, p, 'restroom'); m.drainEvents(); bossInto(m, 'restroom');
  assert.ok(!m.drainEvents().some(e => e.type === 'caught'), '免抓期间不被抓');
});

test('加倍罚款：下一次抓人没收比例 +30%，另扣存款 15%', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'fine');
  enter(m, p, 'pantry'); p.banked = 200; tick(m, 2); m.useBossSkill('fine'); const pocket = p.pocket; m.drainEvents();
  bossInto(m, 'pantry'); const ev = m.drainEvents().find(e => e.type === 'caught');
  assert.ok(ev.ratio >= A.PENALTY.base + 0.3 - 1e-9 && ev.ratio <= 1, '比例至少 50%');
  assert.ok(Math.abs(ev.ratio - Math.min(1, A.penaltyRatio('pantry', p.roomTime) + 0.3)) < 0.03);
  assert.ok(Math.abs(p.banked - 170) < 0.01, '存款扣 15%'); assert.ok(ev.lost > 30 && pocket > 0); assert.strictEqual(b.fineNext, false);
});

test('猫替身：老板看到"在工位"；B 方向被抓少扣 30%（3 级 50%）', () => {
  const m = quiet({ playerChar: 'cat' }), p = m.player;
  assert.ok(m.useEmpSkill(p)); assert.strictEqual(p.decoyT, 15); assert.strictEqual(m.useEmpSkill(p), false);
  p.level = 2; p.branch = 'B'; assert.strictEqual(A.empSkill(p).cut, 0.3); p.level = 3; assert.strictEqual(A.empSkill(p).cut, 0.5);
  p.level = 2; p.skillCd = 0; enter(m, p, 'pantry'); tick(m, 3); m.useEmpSkill(p); m.drainEvents(); bossInto(m, 'pantry');
  const ev = m.drainEvents().find(e => e.type === 'caught'); assert.ok(Math.abs(ev.ratio - A.penaltyRatio('pantry', p.roomTime) * 0.7) < 0.03);
  const q = quiet({ playerChar: 'cat' }).player; q.level = 2; q.branch = 'A'; assert.strictEqual(A.empSkill(q).dur, 25);
});

test('熊久蹲：只能在房间里用；这一趟最长停留与收入爬升 ×1.5；B 方向被抓只扣一半', () => {
  const m = quiet({ playerChar: 'bear' }), p = m.player;
  assert.strictEqual(m.useEmpSkill(p), false); assert.strictEqual(m.drainEvents().pop().reason, 'room');
  enter(m, p, 'restroom'); assert.ok(m.useEmpSkill(p)); assert.strictEqual(p.squat.k, 1.5);
  tick(m, A.ROOMS.restroom.maxStay + 1); assert.strictEqual(p.room, 'restroom', '15 秒后还能待'); assert.ok(!p.forced);
  assert.ok(A.rate('restroom', 12, 1.5) > A.rate('restroom', 12), '爬升更久');
  tick(m, 8); assert.ok(p.forced || p.room === null, '22.5 秒到点出门');
  const m2 = quiet({ playerChar: 'bear' }), q = m2.player; q.level = 2; q.branch = 'B';
  enter(m2, q, 'pantry'); m2.useEmpSkill(q); tick(m2, 3); m2.drainEvents(); bossInto(m2, 'pantry');
  const ev = m2.drainEvents().find(e => e.type === 'caught'); assert.ok(Math.abs(ev.ratio - A.penaltyRatio('pantry', q.roomTime, 1.5) * 0.5) < 0.03);
});

test('猫头鹰锁门：门锁 4 秒，老板和别的员工都进不去（老板被弹回门外）；B 方向锁门期间收入 ×1.5', () => {
  const m = quiet({ playerChar: 'owl' }), p = m.player, b = m.boss, other = m.employees()[1];
  enter(m, p, 'rooftop'); assert.ok(m.useEmpSkill(p)); assert.ok(m.locks.rooftop);
  assert.strictEqual(m.entryBlock(b, 'rooftop'), 'lockedDoor'); assert.strictEqual(m.entryBlock(other, 'rooftop'), 'lockedDoor');
  b.x = m.grid.inside('rooftop').x; b.y = m.grid.inside('rooftop').y; m.update(1 / 60);
  assert.notStrictEqual(b.room, 'rooftop'); assert.ok(m.drainEvents().some(e => e.type === 'blocked' && e.reason === 'lockedDoor'));
  tick(m, 4.1); assert.ok(!m.locks.rooftop); assert.strictEqual(m.entryBlock(b, 'rooftop'), null);
  const m2 = quiet({ playerChar: 'owl' }), q = m2.player; q.level = 2; q.branch = 'B';
  enter(m2, q, 'pantry'); tick(m2, 0.5); const p0 = q.pocket; tick(m2, 1); const g0 = q.pocket - p0;
  m2.useEmpSkill(q); const p1 = q.pocket; tick(m2, 1); const g1 = q.pocket - p1;
  assert.ok(g1 / g0 > 1.4, '收入 ×1.5（曲线还在上升）：' + (g1 / g0).toFixed(2));
});

test('升级：累计存入 $150 升 2 级（玩家选方向、10 秒不选随机；AI 直接随机），$400 升 3 级；培训手册直接升', () => {
  const m = quiet(), p = m.player, ai = m.employees()[1];
  m.gainXp(p, 160); assert.strictEqual(p.level, 2); assert.ok(p.branchOffer); assert.strictEqual(p.branch, null);
  assert.ok(m.chooseBranch(p, 'A')); assert.strictEqual(p.branch, 'A'); assert.strictEqual(A.empSkill(p).dur, 5);
  m.gainXp(p, 250); assert.strictEqual(p.level, 3); assert.strictEqual(A.empSkill(p).dur, 6.5); m.gainXp(p, 999); assert.strictEqual(p.level, 3);
  m.gainXp(ai, 200); assert.strictEqual(ai.level, 2); assert.ok(ai.branch === 'A' || ai.branch === 'B');
  const m2 = quiet(), q = m2.player; m2.levelUp(q, 'manual'); assert.strictEqual(q.level, 2); tick(m2, 10.2); assert.ok(q.branch, '10 秒不选自动随机');
  const m3 = quiet({ playerDesk: 1 }), r = m3.player; enter(m3, r, 'restroom'); tick(m3, 10); m3.exitRoom(r); tick(m3, 2); assert.ok(m3.goDesk(r)); tick(m3, 6);
  assert.ok(r.xp > 30 && Math.abs(r.xp - (r.banked - r.stats.deposits * 0) ) >= 0, '存钱加经验');
});

test('补给：25 秒后第一次刷、全场广播；员工站上去 2 秒捡起；四种效果；老板踩到收走', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(8), playerRole: 'employee', playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false }), p = m.player;
  tick(m, 24); assert.strictEqual(m.supplies.length, 0); tick(m, 1.2); assert.strictEqual(m.supplies.length, 1); assert.ok(m.drainEvents().some(e => e.type === 'supply'));
  const s = m.supplies[0]; s.kind = 'takeout'; enter(m, p, s.room); const before = p.pocket;
  m.moveTo(p, s.x, s.y); tick(m, 1); m.setDir(p, 0, 0); tick(m, 2.2);
  assert.strictEqual(m.supplies.length, 0); assert.ok(p.pocket >= before + 30); assert.ok(m.drainEvents().some(e => e.type === 'pickup' && e.kind === 'takeout'));
  const q = quiet().player, mm = quiet(); void q;
  const e = mm.player; mm.applySupply(e, 'double'); assert.strictEqual(e.doubleT, 20);
  mm.applySupply(e, 'manual'); assert.strictEqual(e.level, 2);
  mm.applySupply(e, 'leave'); enter(mm, e, 'pantry'); tick(mm, 3); const pk = e.pocket; mm.drainEvents(); bossInto(mm, 'pantry');
  assert.ok(mm.drainEvents().some(ev => ev.type === 'excused')); assert.ok(e.pocket >= pk, '请假条：不扣钱'); assert.ok(!mm.drainEvents().some(ev => ev.type === 'caught')); assert.strictEqual(e.leaveNote, false);
  const m4 = quiet(), it = m4.spawnSupply('double', 'restroom'); bossInto(m4, 'restroom'); m4.pathTo(m4.boss, it.x, it.y); tick(m4, 3);
  assert.strictEqual(m4.supplies.length, 0); assert.ok(m4.drainEvents().some(ev => ev.type === 'supplyTaken'));
});

test('双倍卡：20 秒内收入 ×2', () => {
  const m = quiet(), p = m.player; enter(m, p, 'pantry'); tick(m, 2);
  const a0 = p.pocket; tick(m, 0.5); const g0 = p.pocket - a0; m.applySupply(p, 'double'); const a1 = p.pocket; tick(m, 0.5); const g1 = p.pocket - a1;
  assert.ok(g1 / g0 > 1.9);
});

test('全 AI 对局：老板会选技能并使用，员工会放技能、升级、捡补给', () => {
  let bossUse = 0, empUse = 0, picks = 0, lv = 0;
  for (let s = 1; s <= 4; s++) {
    const m = new A.Match({ bossWait: 0, rng: mulberry32(s * 3), playerRole: 'employee', allAI: true });
    for (let i = 0; i < 60 * 240 && m.phase === 'playing'; i++) { m.update(1 / 60); for (const e of m.drainEvents()) { if (e.type === 'bossSkill') bossUse++; if (e.type === 'empSkill') empUse++; if (e.type === 'pickup') picks++; } }
    assert.strictEqual(m.boss.skills.length, 3); lv += m.employees().filter(e => e.level >= 2).length;
  }
  assert.ok(bossUse > 8, '老板放技能 ' + bossUse); assert.ok(empUse > 20, '员工放技能 ' + empUse); assert.ok(picks > 4, '捡补给 ' + picks); assert.ok(lv > 6, '升级 ' + lv);
});

test('画面：技能按钮、阶段选技能卡、升级方向卡、补给、监控高亮、替身都能绘制', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const canvas = { width: 960, height: 540, getContext: () => ctx };
  const app = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { bossWait: 0, playerRole: 'boss', employeeAI: false } }), r = new A.Renderer(canvas, app);
  const m = app.start(); m.update(0.05); texts.length = 0; r.draw(0.016);
  assert.ok(texts.some(t => /^第 1 阶段：选一个新技能/.test(t)) && texts.some(t => /^1  /.test(t)));
  assert.ok(app.hasOffer()); assert.ok(app.pickOffer(0)); assert.ok(!app.hasOffer());
  m.boss.skills = ['peek', 'dash']; m.boss.anger = 100; assert.strictEqual(app.bossSkill(0), 'peek'); assert.ok(app.peekMode);
  const c = m.grid.roomCells('pantry')[0]; assert.ok(app.tapWorld(c.c + 0.5, c.r + 0.5)); assert.strictEqual(m.boss.peek.room, 'pantry');
  const cat = m.employees().find(e => e.id === 'cat'); cat.decoyT = 10; cat.room = 'pantry'; cat.x = c.c + 0.5; cat.y = c.r + 0.5;
  m.spawnSupply('manual', 'pantry'); texts.length = 0; r.draw(0.016);
  assert.ok(texts.some(t => /^监控中 \d+s · 1 人$/.test(t)) && texts.includes('培训手册') && texts.some(t => /^1 监控$/.test(t)) && texts.some(t => /^2 冲刺$/.test(t)));
  assert.ok(!texts.includes('替身'), '老板看到的替身没有标签');
  const app2 = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'owl', employeeAI: false, bossAI: false } }), r2 = new A.Renderer(canvas, app2);
  const m2 = app2.start(), p = m2.player; texts.length = 0; r2.draw(0.016);
  assert.ok(texts.some(t => /^E  锁门/.test(t)) && texts.includes('进了房间才能用') && texts.some(t => /Lv1$/.test(t)));
  m2.levelUp(p, 'manual'); texts.length = 0; r2.draw(0.016); assert.ok(texts.some(t => /^升到 Lv2：锁门选一个方向/.test(t)) && texts.includes('1  双重门锁'));
  assert.ok(app2.pickOffer(1)); assert.strictEqual(p.branch, 'B');
  assert.ok(texts.some(t => /^第 1 \/ 3 阶段$/.test(t)), '开局前也显示第 1 阶段');
});
