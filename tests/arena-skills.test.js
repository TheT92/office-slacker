// 摸鱼大作战（A4）：老板怒气与分阶段技能、员工技能与升级、补给
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/events', 'arena/match'].forEach(m => require('../src/' + m + '.js'));
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

test('怒气（2.5.0 加强）：每秒 +1.2、抓到 1 人 +12；放技能扣怒气、进冷却；怒气不够放不了', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'dash'); b.anger = 0;
  tick(m, 5); assert.ok(Math.abs(b.anger - 6) < 0.1);
  b.anger = 5; assert.strictEqual(m.useBossSkill('dash'), false); assert.strictEqual(m.drainEvents().pop().reason, 'anger');
  b.anger = 30; assert.ok(m.useBossSkill('dash')); assert.ok(Math.abs(b.anger - 10) < 0.01); assert.strictEqual(m.useBossSkill('dash'), false);
  enter(m, p, 'print'); const before = b.anger; bossInto(m, 'print'); assert.ok(b.anger >= before + 12);
});

test('冲刺：老板 6 秒内 ×1.8（2.5.0 加强）；兔子插队冲刺 3 秒内 ×1.7（再乘被动腿长 ×1.1）', () => {
  const m = quiet(), b = m.boss, p = m.player, V = A.PASSIVES.rabbit.speed; give(m, 'dash');
  m.useBossSkill('dash'); b.x = 9.5; b.y = 10.5; b.path = [{ x: 25.5, y: 10.5 }]; m.update(0.1); assert.ok(Math.abs(b.x - 9.5 - A.MOVE.boss * 1.8 * 0.1) < 1e-6);
  assert.ok(m.useEmpSkill(p)); p.x = 9.5; p.y = 10.5; p.path = [{ x: 25.5, y: 10.5 }]; m.update(0.1); assert.ok(Math.abs(p.x - 9.5 - A.MOVE.employee * 1.7 * V * 0.1) < 1e-6);
  tick(m, 3); p.x = 9.5; p.path = [{ x: 25.5, y: 10.5 }]; m.update(0.1); assert.ok(Math.abs(p.x - 9.5 - A.MOVE.employee * V * 0.1) < 1e-6, '时间到恢复（被动腿长一直在）');
});

test('监控（2.5.0）：按一下就放，6 秒内走到哪个房间门口（4 格内）就能看到里面；离远了看不到', () => {
  const m = quiet(), b = m.boss; give(m, 'peek');
  assert.ok(m.useBossSkill('peek')); assert.ok(b.peek && b.peek.t === 6);
  const o = m.grid.outside('pantry'); b.x = o.x + 3; b.y = o.y; b.path = [];
  assert.deepStrictEqual(m.peekRooms(), ['pantry']);
  b.x = o.x + 6; assert.deepStrictEqual(m.peekRooms(), [], '离远了看不到');
  tick(m, 6.1); assert.strictEqual(b.peek, null); b.x = o.x + 1; assert.deepStrictEqual(m.peekRooms(), [], '时间到了看不到');
});

test('回马枪（2.5.0）：离开房间 15 秒内无视冷却杀回去，每阶段 2 次', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'revisit');
  bossInto(m, 'print'); tick(m, 3.1); const o = m.grid.outside('print'); m.pathTo(b, o.x, o.y); tick(m, 1.5);
  assert.strictEqual(b.room, null); assert.ok(b.cooldowns.print > 0);
  tick(m, 2); void p;
  assert.ok(m.useBossSkill('revisit')); assert.strictEqual(b.cooldowns.print, 0);
  for (let i = 0; i < 600 && b.room !== 'print'; i++) m.update(1 / 60); assert.strictEqual(b.room, 'print', '自动走回去');
  tick(m, 3.1); m.pathTo(b, o.x, o.y); tick(m, 1.5); b.anger = 100;
  assert.ok(m.useBossSkill('revisit'), '同一阶段第 2 次'); for (let i = 0; i < 600 && b.room !== 'print'; i++) m.update(1 / 60);
  tick(m, 3.1); m.pathTo(b, o.x, o.y); tick(m, 1.5); b.anger = 100;
  assert.strictEqual(m.useBossSkill('revisit'), false); assert.strictEqual(m.drainEvents().filter(e => e.type === 'skillFail').pop().reason, 'used');
  const m2 = quiet(); give(m2, 'revisit'); bossInto(m2, 'pantry'); tick(m2, 4.1); m2.pathTo(m2.boss, m2.grid.outside('pantry').x, m2.grid.outside('pantry').y); tick(m2, 17);
  assert.strictEqual(m2.useBossSkill('revisit'), false); assert.strictEqual(m2.drainEvents().pop().reason, 'window');
});

test('突击检查：下一次查房无视冷却、不用逗留；2.5.0 起抓到的人没收比例再 +10%', () => {
  const m = quiet(), b = m.boss; give(m, 'raid'); b.cooldowns.pantry = 10;
  assert.ok(m.useBossSkill('raid')); assert.strictEqual(m.entryBlock(b, 'pantry'), null);
  bossInto(m, 'pantry'); assert.strictEqual(b.stay, 0); assert.strictEqual(b.raidNext, false);
  const m2 = quiet(), p2 = m2.player; give(m2, 'raid'); enter(m2, p2, 'pantry'); tick(m2, 4); m2.useBossSkill('raid'); m2.drainEvents(); bossInto(m2, 'pantry');
  const ev = m2.drainEvents().find(e => e.type === 'caught'); assert.ok(Math.abs(ev.ratio - (A.penaltyRatio('pantry', p2.roomTime) + 0.1)) < 0.03, '突击检查 +10%');
});

test('临时会议：把一个正在摸鱼的人叫到门口原地开会 10 秒（口袋保留），开完 5 秒免抓；老板定身 1 秒；没人摸鱼时放不了', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'meeting');
  assert.strictEqual(m.useBossSkill('meeting'), false); assert.strictEqual(m.drainEvents().pop().reason, 'noTarget');
  enter(m, p, 'pantry'); tick(m, 4); const pocket = p.pocket, o = m.grid.outside('pantry');
  assert.ok(m.useBossSkill('meeting')); assert.strictEqual(p.room, null); assert.ok(Math.hypot(p.x - o.x, p.y - o.y) < 1e-9, '站在茶水间门口开会');
  assert.ok(Math.abs(p.pocket - pocket) < 1e-9, '口袋保留'); assert.ok(p.cooldowns.pantry > 0); assert.strictEqual(b.freezeT, 1);
  assert.strictEqual(m.moveTo(p, 12, 10), false); assert.strictEqual(m.moveTo(b, 12, 10), false);
  tick(m, 10.1); assert.strictEqual(p.meetingT, 0); assert.ok(p.immuneT > 4);
  const ro = m.grid.outside('print'); p.x = ro.x; p.y = ro.y + 0.5;
  b.cooldowns.print = 0; enter(m, p, 'print'); m.drainEvents(); bossInto(m, 'print');
  assert.ok(!m.drainEvents().some(e => e.type === 'caught'), '免抓期间不被抓');
  const m2 = quiet(); give(m2, 'meeting'); enter(m2, m2.player, 'toilet'); assert.strictEqual(m2.useBossSkill('meeting'), false, '厕所里的人拉不走');
});

test('加倍罚款（2.5.0）：下一次抓人没收比例 +40%，另扣存款 20%', () => {
  const m = quiet(), b = m.boss, p = m.player; give(m, 'fine');
  enter(m, p, 'pantry'); p.banked = 200; tick(m, 2); m.useBossSkill('fine'); const pocket = p.pocket; m.drainEvents();
  bossInto(m, 'pantry'); const ev = m.drainEvents().find(e => e.type === 'caught');
  assert.ok(ev.ratio >= A.PENALTY.base + 0.4 - 1e-9 && ev.ratio <= 1, '比例至少 60%');
  assert.ok(Math.abs(ev.ratio - Math.min(1, A.penaltyRatio('pantry', p.roomTime) + 0.4)) < 0.03);
  assert.ok(Math.abs(p.banked - 160) < 0.01, '存款扣 20%'); assert.ok(ev.lost > 30 && pocket > 0); assert.strictEqual(b.fineNext, false);
});

test('兔子插队：冲刺中能挤进满员的房间，里面的人被挤出门（口袋保留、这间进冷却）；没冲刺进不去', () => {
  const m = quiet(), p = m.player, q = m.employees()[1]; enter(m, q, 'print'); tick(m, 3); const qp = q.pocket;
  assert.strictEqual(m.entryBlock(p, 'print'), 'full');
  assert.ok(m.useEmpSkill(p)); assert.strictEqual(m.entryBlock(p, 'print'), null, '冲刺中可以插队');
  const o = m.grid.outside('print'); p.x = o.x; p.y = o.y + 1; m.drainEvents(); enter(m, p, 'print');
  const ev = m.drainEvents().find(e => e.type === 'bumped'); assert.ok(ev && ev.who === q.id && ev.by === p.id);
  assert.ok(q.forced); tick(m, 2); assert.strictEqual(q.room, null); assert.ok(q.pocket >= qp - 1e-9, '口袋保留'); assert.ok(q.cooldowns.print > 0);
  p.level = 2; p.branch = 'B'; assert.strictEqual(A.empSkill(p).cd, 12); p.level = 3; assert.strictEqual(A.empSkill(p).cd, 8);
});

test('猫打翻水杯：只能在办公区用，锁住视野里存款最多的同事的工位 8 秒，期间到了工位也存不了；B 方向一次锁 2 个', () => {
  const m = quiet({ playerChar: 'cat' }), p = m.player, others = m.employees().filter(e => e !== p);
  others[0].banked = 50; others[1].banked = 300; others[2].banked = 100;
  assert.ok(m.useEmpSkill(p)); const victim = others[1]; assert.strictEqual(m.deskLocked(victim), 8, '优先锁存款最多的');
  assert.strictEqual(m.deskLocked(others[0]), 0);
  victim.pocket = 40; const s = A.seatOf(victim.desk); victim.x = s.x; victim.y = s.y; m.drainEvents(); assert.ok(m.goDesk(victim)); tick(m, 1);
  assert.strictEqual(victim.pocket, 40, '工位被锁存不了'); assert.ok(m.drainEvents().some(e => e.type === 'deskLocked' && e.who === victim.id));
  tick(m, 7.2); assert.strictEqual(victim.pocket, 0, '锁解开后自动存进去');
  const m2 = quiet({ playerChar: 'cat' }), q = m2.player; q.level = 2; q.branch = 'B'; assert.ok(m2.useEmpSkill(q));
  assert.strictEqual(Object.keys(m2.deskLocks).length, 2);
  const m3 = quiet({ playerChar: 'cat' }), r = m3.player; enter(m3, r, 'pantry'); tick(m3, 4.2); assert.strictEqual(m3.useEmpSkill(r), false); assert.strictEqual(m3.drainEvents().pop().reason, 'office');
  assert.strictEqual(A.PASSIVES.cat.pick, 1);
});

test('熊堵门：只能在摸鱼房间里用，堵 4 秒，老板和别的员工都进不去（老板被弹回门外）；B 方向堵门期间收入 ×1.5；被动最长停留 +20%', () => {
  const m = quiet({ playerChar: 'bear' }), p = m.player, b = m.boss, other = m.employees()[1];
  assert.strictEqual(m.useEmpSkill(p), false); assert.strictEqual(m.drainEvents().pop().reason, 'room');
  enter(m, p, 'rooftop'); assert.ok(m.useEmpSkill(p)); assert.ok(m.locks.rooftop);
  assert.strictEqual(m.entryBlock(b, 'rooftop'), 'lockedDoor'); assert.strictEqual(m.entryBlock(other, 'rooftop'), 'lockedDoor');
  b.x = m.grid.inside('rooftop').x; b.y = m.grid.inside('rooftop').y; m.update(1 / 60);
  assert.notStrictEqual(b.room, 'rooftop'); assert.ok(m.drainEvents().some(e => e.type === 'blocked' && e.reason === 'lockedDoor'));
  tick(m, 4.1); assert.ok(!m.locks.rooftop); assert.strictEqual(m.entryBlock(b, 'rooftop'), null);
  const m2 = quiet({ playerChar: 'bear' }), q = m2.player; q.level = 2; q.branch = 'B';
  enter(m2, q, 'pantry'); tick(m2, 0.5); const p0 = q.pocket; tick(m2, 1); const g0 = q.pocket - p0;
  m2.useEmpSkill(q); const p1 = q.pocket; tick(m2, 1); const g1 = q.pocket - p1;
  assert.ok(g1 / g0 > 1.4, '收入 ×1.5（曲线还在上升）：' + (g1 / g0).toFixed(2));
  const m3 = quiet({ playerChar: 'bear' }), r = m3.player; enter(m3, r, 'print'); tick(m3, A.ROOMS.print.maxStay + 1); assert.strictEqual(r.room, 'print', '15 秒后还能待（被动 ×1.2）');
  tick(m3, 2.5); assert.ok(r.forced || r.room === null, '18 秒到点出门');
});

test('猫头鹰夜视：视野放大 1.6 倍（被动视野本来就 +2 格）；B 方向放大 2 倍；AI 老板的视野也大 2 格', () => {
  const m = quiet({ playerChar: 'owl' }), p = m.player, base = A.sightOf(p);
  assert.strictEqual(base.w, A.SIGHT.w + 2); assert.strictEqual(A.sightOf(m.boss).w, A.SIGHT.w + 2); assert.strictEqual(A.sightOf(m.employees()[1]).w, A.SIGHT.w);
  assert.ok(m.useEmpSkill(p)); assert.ok(Math.abs(A.sightOf(p).w - base.w * 1.6) < 1e-9);
  tick(m, 4.1); assert.strictEqual(A.sightOf(p).w, base.w);
  p.level = 2; p.branch = 'B'; p.skillCd = 0; m.useEmpSkill(p); assert.ok(Math.abs(A.sightOf(p).w - base.w * 2) < 1e-9);
});

test('升级：累计存入 $150 升 2 级（玩家选方向、10 秒不选随机；AI 直接随机），$400 升 3 级；培训手册直接升', () => {
  const m = quiet(), p = m.player, ai = m.employees()[1];
  m.gainXp(p, 160); assert.strictEqual(p.level, 2); assert.ok(p.branchOffer); assert.strictEqual(p.branch, null);
  assert.ok(m.chooseBranch(p, 'A')); assert.strictEqual(p.branch, 'A'); assert.strictEqual(A.empSkill(p).dur, 5);
  m.gainXp(p, 250); assert.strictEqual(p.level, 3); assert.strictEqual(A.empSkill(p).dur, 6.5); m.gainXp(p, 999); assert.strictEqual(p.level, 3);
  m.gainXp(ai, 200); assert.strictEqual(ai.level, 2); assert.ok(ai.branch === 'A' || ai.branch === 'B');
  const m2 = quiet(), q = m2.player; m2.levelUp(q, 'manual'); assert.strictEqual(q.level, 2); tick(m2, 10.2); assert.ok(q.branch, '10 秒不选自动随机');
  const m3 = quiet({ playerDesk: 1 }), r = m3.player; enter(m3, r, 'print'); tick(m3, 10); m3.exitRoom(r); tick(m3, 2); assert.ok(m3.goDesk(r)); tick(m3, 6);
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
  const m4 = quiet(), it = m4.spawnSupply('double', 'print'); bossInto(m4, 'print'); m4.pathTo(m4.boss, it.x, it.y); tick(m4, 3);
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

test('画面：技能按钮、阶段选技能卡、升级方向卡、补给、监控高亮、被打翻的工位都能绘制', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const canvas = { width: 960, height: 540, getContext: () => ctx };
  const app = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { bossWait: 0, playerRole: 'boss', employeeAI: false } }), r = new A.Renderer(canvas, app);
  const m = app.start(); m.update(0.05); texts.length = 0; r.draw(0.016);
  assert.ok(texts.some(t => /^第 1 阶段：选一个新技能/.test(t)) && texts.some(t => /^1  /.test(t)));
  assert.ok(app.hasOffer()); assert.ok(app.pickOffer(0)); assert.ok(!app.hasOffer());
  m.boss.skills = ['peek', 'dash']; m.boss.anger = 100; assert.ok(app.bossSkill(0)); assert.ok(m.boss.peek, '监控按一下就放');
  const c = m.grid.roomCells('pantry')[0], o = m.grid.outside('pantry'); m.boss.x = o.x + 2; m.boss.y = o.y;
  const cat = m.employees().find(e => e.id === 'cat'); cat.room = 'pantry'; cat.x = c.c + 0.5; cat.y = c.r + 0.5;
  m.deskLocks[m.employees()[0].desk.id] = 6;
  m.spawnSupply('manual', 'pantry'); texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('监控 茶水间：1 人') && texts.includes('培训手册') && texts.some(t => /^1 监控$/.test(t)) && texts.some(t => /^2 冲刺$/.test(t)));
  assert.ok(texts.includes('打翻了 6s'), '被打翻的工位挂着倒计时');
  const app2 = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'owl', employeeAI: false, bossAI: false } }), r2 = new A.Renderer(canvas, app2);
  const m2 = app2.start(), p = m2.player; texts.length = 0; r2.draw(0.016);
  assert.ok(texts.includes('夜视') && texts.includes('就绪') && texts.some(t => /Lv1 \$0\/150$/.test(t)));
  m2.levelUp(p, 'manual'); texts.length = 0; r2.draw(0.016); assert.ok(texts.some(t => /^升到 Lv2：夜视选一个方向/.test(t)) && texts.includes('1  看得更久'));
  const app3 = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'bear', employeeAI: false, bossAI: false } }), r3 = new A.Renderer(canvas, app3);
  app3.start(); texts.length = 0; r3.draw(0.016); assert.ok(texts.includes('堵门') && texts.includes('进房间才能用'));
  assert.ok(app2.pickOffer(1)); assert.strictEqual(p.branch, 'B');
});
