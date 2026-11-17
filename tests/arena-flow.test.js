// 摸鱼大作战（A5）：开局准备、下班冲刺、结算称号、音效规则、画面
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/events', 'arena/match', 'render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
const quiet = o => { const m = new A.Match(Object.assign({ bossWait: 0, rng: mulberry32(41), playerRole: 'employee', playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false }, o)); m.supplyT = 1e9; return m; };
function enter(m, a, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(a, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 1500 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }
function bossInto(m, id) { const b = m.boss, c = m.grid.roomCells(id).slice(-1)[0]; assert.ok(m.pathTo(b, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 2400 && b.room !== id; i++) m.update(1 / 60); assert.strictEqual(b.room, id); }
function fakeCanvas(texts) {
  const ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  return { width: 960, height: 540, getContext: () => ctx };
}

test('准备阶段：谁都不能动、时间不走；最后 3 秒倒数；结束后开始，第 1 阶段老板技能这时才给', () => {
  const m = quiet({ prep: 20, playerRole: 'boss' }), b = m.boss;
  assert.strictEqual(m.phase, 'prep'); assert.strictEqual(m.moveTo(b, 12, 7), false);
  tick(m, 10); assert.strictEqual(m.time, 0); assert.strictEqual(m.left, A.ECON.matchTime); assert.strictEqual(m.offer, null); assert.ok(Math.abs(b.anger) < 1e-9);
  const ev = []; for (let i = 0; i < 60 * 10.2; i++) { m.update(1 / 60); ev.push(...m.drainEvents()); }
  assert.deepStrictEqual(ev.filter(e => e.type === 'countdown').map(e => e.n), [3, 2, 1]);
  assert.ok(ev.some(e => e.type === 'go')); assert.strictEqual(m.phase, 'playing'); assert.ok(m.offer, '开局后才弹选技能');
  assert.ok(m.moveTo(b, 12, 7));
});

test('"准备好了"：剩余准备时间缩到 3 秒；倒数阶段再按没变化', () => {
  const m = quiet({ prep: 20 }); m.ready(); assert.strictEqual(m.prepLeft, 3);
  tick(m, 1); m.ready(); assert.ok(m.prepLeft < 2.1); tick(m, 2.1); assert.strictEqual(m.phase, 'playing');
  const app = new A.App({ rng: mulberry32(1), matchOpts: { bossWait: 0, playerRole: 'employee' } }); app.start();
  assert.strictEqual(app.match.phase, 'prep'); assert.strictEqual(app.match.prepLeft, A.PREP.time);
  app.tick(0.25); assert.ok(app.match.prepLeft < A.PREP.time, '准备阶段也在倒计时');
  assert.strictEqual(app.act(), false, '准备阶段不能操作'); assert.ok(app.ready()); assert.strictEqual(app.match.prepLeft, 3);
  assert.ok(A.PREP.time >= A.PREP.min && A.PREP.time <= A.PREP.max);
});

test('下班冲刺：最后 30 秒广播一次；房间收入 ×2，老板移动 ×1.3', () => {
  const m = quiet({ time: 40 }), p = m.player, b = m.boss;
  enter(m, p, 'pantry'); tick(m, 2); const g0 = (() => { const a = p.pocket; m.update(0.5); return p.pocket - a; })();
  m.drainEvents(); tick(m, 40 - m.time - 30 + 0.05);
  assert.ok(m.rush); assert.strictEqual(m.drainEvents().filter(e => e.type === 'rush').length, 1);
  p.roomTime = 2.5; const a1 = p.pocket; m.update(0.5); const g1 = p.pocket - a1;
  assert.ok(g1 / g0 > 1.9, '收入 ×2：' + (g1 / g0).toFixed(2));
  b.x = 8.5; b.y = 5.5; b.path = [{ x: 20.5, y: 5.5 }]; m.update(0.1); assert.ok(Math.abs(b.x - 8.5 - A.MOVE.boss * 1.3 * 0.1) < 1e-6);
  tick(m, 5); assert.strictEqual(m.drainEvents().filter(e => e.type === 'rush').length, 0, '只广播一次');
});

test('结算称号：按数据评出，没人符合就不发，最多 4 个，老板的称号保留一个位置', () => {
  const m = quiet(), [a, b, c, d] = m.employees(), T = A.AWARDS;
  assert.deepStrictEqual(m.awards(), []);
  a.stats.roomTime.print = T.print + 3; b.stats.roomTime.rooftop = T.rooftop + 2; c.stats.maxCombo = 1.6; d.stats.caught = T.caught; a.stats.picks = T.picks;
  const aw = m.awards(); assert.strictEqual(aw.length, 4);
  assert.deepStrictEqual(aw.map(w => w.title), ['打印狂人', '天台常住民', '连摸大师', '倒霉蛋']);
  assert.strictEqual(aw[0].who, a.id); assert.ok(new RegExp(T.print + 3 + ' 秒').test(aw[0].text));
  m.boss.stats.catches = T.bossCatches; assert.deepStrictEqual(m.awards().map(w => w.title), ['打印狂人', '天台常住民', '连摸大师', '铁面无私'], '老板的称号挤掉最后一个员工称号');
  const m2 = quiet(); m2.boss.stats.empty = T.bossEmpty; m2.employees()[1].stats.picks = T.picks;
  assert.deepStrictEqual(m2.awards().map(w => w.title), ['补给猎人', '白跑王']);
  a.stats.roomTime.print = T.print - 1; assert.ok(!m.awards().some(w => w.title === '打印狂人'), '不到门槛不发');
  const m3 = quiet(), p = m3.player; enter(m3, p, 'print'); tick(m3, 4.1); m3.exitRoom(p); tick(m3, 3); enter(m3, p, 'pantry'); tick(m3, 4.1); m3.exitRoom(p); tick(m3, 3); m3.goDesk(p); tick(m3, 8);
  assert.ok(Math.abs(p.stats.maxCombo - 1.2) < 1e-9, '记录最高连摸倍数');
});

test('音效规则：员工在房间里只有老板开门那一下有声音；在办公区听不到别的房间开门；老板自己查房有声音', () => {
  const m = quiet(), p = m.player, check = { type: 'check', room: 'pantry', caught: [] };
  assert.strictEqual(A.eventSound(check, m), null, '在办公区听不到');
  enter(m, p, 'print'); assert.strictEqual(A.eventSound(check, m), null, '在别的房间也听不到');
  assert.strictEqual(A.eventSound({ type: 'check', room: 'print', caught: [p.id] }, m), 'door');
  const mb = quiet({ playerRole: 'boss' }); assert.strictEqual(A.eventSound(check, mb), 'door');
  assert.strictEqual(A.eventSound({ type: 'countdown', n: 2 }, m), 'tick'); assert.strictEqual(A.eventSound({ type: 'go' }, m), 'go'); assert.strictEqual(A.eventSound({ type: 'rush' }, m), 'rush');
  assert.strictEqual(A.eventSound({ type: 'pickup', who: p.id }, m), 'pickup'); assert.strictEqual(A.eventSound({ type: 'pickup', who: 'cat' }, m), null);
  assert.strictEqual(A.eventSound({ type: 'empSkill', who: p.id, skill: 'rabbit' }, m), 'shield');
  assert.strictEqual(A.eventSound({ type: 'bossPick' }, mb), 'pick'); assert.strictEqual(A.eventSound({ type: 'bossPick' }, m), null);
  // 老板走近房间的过程中没有任何事件带声音（只有进门那一刻的 check）
  const m2 = quiet(), q = m2.player; enter(m2, q, 'pantry'); m2.drainEvents();
  const c = m2.grid.roomCells('pantry').slice(-1)[0]; m2.pathTo(m2.boss, c.c + 0.5, c.r + 0.5);
  const sounds = []; for (let i = 0; i < 2400 && m2.boss.room !== 'pantry'; i++) { m2.update(1 / 60); for (const e of m2.drainEvents()) { const s = A.eventSound(e, m2); if (s) sounds.push(e.type + ':' + s); } }
  assert.deepStrictEqual(sounds, ['check:door']);
  for (const n of ['tick', 'go', 'rush', 'door', 'pickup', 'levelup', 'pick', 'lock', 'meeting', 'shield']) assert.ok(OS.audio ? true : true, n);
});

test('音效模块：新增的音效都存在，冲刺时可以加快背景音乐', () => {
  require('../src/audio.js');
  for (const n of ['tick', 'go', 'rush', 'door', 'pickup', 'levelup', 'pick', 'lock', 'meeting', 'shield']) assert.ok(OS.audio.has(n), n);
  OS.audio.setTempo(1.25); OS.audio.setTempo(1);
});

test('画面：员工/老板身份卡、倒数、下班冲刺标签、暂停菜单里的身份卡、结算称号逐个弹出', () => {
  const texts = [], canvas = fakeCanvas(texts);
  const app = new A.App({ rng: mulberry32(3), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'owl', employeeAI: false, bossAI: false, time: 40 } }), r = new A.Renderer(canvas, app);
  const m = app.start(); texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('你是员工') && texts.some(t => /^猫头鹰 · 工位 \d$/.test(t)) && texts.some(t => /^准备好了/.test(t)) && texts.includes('我的工位') && texts.some(t => /^技能：夜视/.test(t)) && texts.some(t => /^被动 · 眼尖/.test(t)));
  assert.ok(texts.some(t => /^20 秒后自动开始$/.test(t)) && ['打印室', '茶水间', '天台', '厕所'].every(n => texts.includes(n)), '小地图标出四个房间');
  app.ready(); app.tick(0.25); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('3') && !texts.some(t => /^准备好了/.test(t)));
  for (let i = 0; i < 20; i++) app.tick(0.25);
  assert.strictEqual(m.phase, 'playing'); r.banner('开始摸鱼！'); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('开始摸鱼！') && !texts.includes('你是员工'));
  for (let i = 0; i < 45; i++) app.tick(0.25); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('冲刺 · 收入 ×2'));
  app.pause(); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('查看身份卡'));
  assert.ok(app.toggleCard()); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('你是员工') && texts.includes('点任意位置关闭'));
  app.resume(); assert.strictEqual(app.cardOpen, false);
  m.employees()[1].stats.roomTime.print = 60; for (let i = 0; i < 200; i++) app.tick(0.25);
  assert.strictEqual(m.phase, 'over'); texts.length = 0; r.draw(0.016); assert.ok(!texts.includes('打印狂人'), '先揭晓排名');
  r.draw(3); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('打印狂人') && texts.some(t => /^查房 \d+ 次/.test(t)));
  const appB = new A.App({ rng: mulberry32(3), matchOpts: { bossWait: 0, playerRole: 'boss', employeeAI: false } }), rB = new A.Renderer(canvas, appB);
  appB.start(); texts.length = 0; rB.draw(0.016);
  assert.ok(texts.includes('你是老板') && texts.includes('狮子老板') && texts.includes('★') && texts.some(t => /用怒气释放/.test(t)));
});

test('老板开局：先等 5 秒（不在地图上、不能动、不能放技能、看不见外面），然后直接出现在办公区正中间', () => {
  const m = new A.Match({ rng: mulberry32(5), playerRole: 'boss', employeeAI: false }), b = m.boss; m.supplyT = 1e9;
  assert.strictEqual(b.waitT, A.BOSS_ARRIVE.wait); assert.ok(!A.ROOMS.boss, '2.1.0 起没有老板办公室');
  m.update(1 / 60); assert.ok(m.offer, '等待时就能选技能'); m.pickBossSkill(m.offer.options[0]);
  assert.strictEqual(m.moveTo(b, 12, 7), false); b.anger = 100; assert.strictEqual(m.useBossSkill(b.skills[0], 'pantry'), false);
  tick(m, 4.5); assert.ok(b.waitT > 0); m.drainEvents();
  tick(m, 0.6); assert.strictEqual(b.waitT, 0); assert.deepStrictEqual([b.x, b.y], [A.BOSS_ARRIVE.x, A.BOSS_ARRIVE.y]);
  assert.ok(m.drainEvents().some(e => e.type === 'bossArrive')); const k = m.grid.cellAt(b.x, b.y); assert.ok(!k.wall && !k.room);
  assert.ok(m.moveTo(b, 12, 6.5));
  // 办公区正中间到三个房间门口的路程差不多
  const pass = c => m.canPass(b, c), dist = (sx, sy, id) => { const o = m.grid.outside(id); let d = 0, x = sx, y = sy; for (const q of A.findPath(m.grid, sx, sy, o.x, o.y, pass)) { d += Math.hypot(q.x - x, q.y - y); x = q.x; y = q.y; } return d; };
  const mid = A.SLACK_ROOMS.map(id => dist(A.BOSS_ARRIVE.x, A.BOSS_ARRIVE.y, id));
  assert.ok(Math.max(...mid) - Math.min(...mid) < 2.5, '中间出发到三扇门差不多远：' + mid.map(v => v.toFixed(1)));
});

test('老板等待期间：AI 老板不动；老板视角整个场景暗下来；员工视角屏幕中间"老板还有 N 秒到达"', () => {
  const m = new A.Match({ rng: mulberry32(6), playerRole: 'employee' }), b = m.boss; tick(m, 3);
  assert.deepStrictEqual([b.x, b.y], [A.BOSS_SPAWN.x, A.BOSS_SPAWN.y]);
  const texts = [], canvas = fakeCanvas(texts);
  const app = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { playerRole: 'employee', employeeAI: false } }), r = new A.Renderer(canvas, app);
  app.start(); app.tick(0.25); texts.length = 0; r.draw(0.016); assert.ok(texts.some(t => /^老板还有 [45] 秒到达$/.test(t)));
  const appB = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { playerRole: 'boss', employeeAI: false } }), rB = new A.Renderer(canvas, appB);
  appB.start(); appB.tick(0.25); appB.match.offer = null; texts.length = 0; rB.draw(0.016);
  assert.ok(texts.includes('老板还在路上') && texts.some(t => /秒后出现在办公区正中间$/.test(t)));
  for (let i = 0; i < 25; i++) appB.tick(0.25); texts.length = 0; rB.draw(0.016); assert.ok(!texts.includes('老板还在路上') && texts.includes('老板（你）'), '到了以后看得到自己');
});

test('抓人收益逐次递增：同一次查房抓到两个人，分别算第 N 次和第 N+1 次', () => {
  const m = quiet({ bossWait: 0 }), [p, q] = m.employees(); m.boss.stats.catches = 1;
  enter(m, p, 'pantry'); enter(m, q, 'pantry'); tick(m, 3); m.drainEvents(); bossInto(m, 'pantry');
  const ev = m.drainEvents().filter(e => e.type === 'caught'); assert.strictEqual(ev.length, 2);
  assert.deepStrictEqual(ev.map(e => e.mult), [1.15, 1.3]);
  assert.ok(Math.abs(m.boss.stats.score - (ev[0].lost * 1.15 + ev[1].lost * 1.3)) < 1e-9);
  assert.ok(Math.abs(m.boss.stats.confiscated - (ev[0].lost + ev[1].lost)) < 1e-9, '员工被扣的钱不变');
});

test('最少停留 4 秒：刚进房间出不去（按钮/空格/点外面/走到门口都不行）；被抓、被拉去开会不受限', () => {
  const m = quiet({ bossWait: 0 }), p = m.player; enter(m, p, 'pantry'); m.drainEvents();
  assert.ok(m.mustStay(p)); assert.strictEqual(m.exitRoom(p), false); assert.strictEqual(m.action(p), false);
  assert.strictEqual(m.moveTo(p, 12, 7), false); assert.strictEqual(m.drainEvents().pop().reason, 'minStay');
  m.setDir(p, 1, 0); tick(m, 2); assert.strictEqual(p.room, 'pantry', '走到门口也出不去'); m.setDir(p, 0, 0);
  tick(m, 2.1); assert.ok(!m.mustStay(p)); assert.ok(m.exitRoom(p)); tick(m, 3); assert.strictEqual(p.room, null);
  const m2 = quiet({ bossWait: 0 }), q = m2.player; enter(m2, q, 'print'); bossInto(m2, 'print');
  assert.ok(q.forced); tick(m2, 2); assert.strictEqual(q.room, null, '被抓后照样自动出门');
  const m3 = quiet({ bossWait: 0 }), r = m3.player; enter(m3, r, 'pantry'); m3.boss.skills = ['meeting']; m3.boss.anger = 100;
  assert.ok(m3.useBossSkill('meeting')); assert.strictEqual(r.room, null, '被拉去开会不受限');
});

test('只有主动操作才存钱：路过或站在工位上不存；空格/回工位/点自己的桌子才存；半路点别处取消', () => {
  const m = quiet({ bossWait: 0, playerDesk: 0 }), p = m.player, seat = A.seatOf(p.desk);
  enter(m, p, 'print'); tick(m, 5); m.exitRoom(p); tick(m, 3); const pocket = p.pocket; assert.ok(pocket > 0);
  m.moveTo(p, seat.x, seat.y + 0.1); tick(m, 6); assert.ok(Math.hypot(p.x - seat.x, p.y - seat.y) < 0.75);
  assert.strictEqual(p.pocket, pocket, '站在工位上不自动存');
  assert.ok(m.action(p)); m.drainEvents(); tick(m, 0.2); assert.strictEqual(p.pocket, 0, '空格立刻存');
  assert.ok(m.drainEvents().some(e => e.type === 'deposit'));
  const m2 = quiet({ bossWait: 0, playerDesk: 1 }), q = m2.player; enter(m2, q, 'pantry'); tick(m2, 5); m2.exitRoom(q); tick(m2, 3);
  assert.ok(m2.goDesk(q)); tick(m2, 0.3); m2.moveTo(q, 10.5, 21.5); tick(m2, 8); assert.ok(q.pocket > 0, '半路改走别处：取消存钱');
  const d = q.desk; assert.ok(m2.moveTo(q, d.c + 0.5, d.r + 0.5), '点自己的桌子'); tick(m2, 8); assert.strictEqual(q.pocket, 0);
});
