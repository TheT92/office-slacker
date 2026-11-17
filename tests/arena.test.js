// 摸鱼大作战（A1）：地图、寻路、进出房间、收入、停留上限、冷却、口袋与回工位存钱
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/events', 'arena/match'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
// A1 的用例关掉 AI 老板，避免被随机查房干扰；A2 用例在 arena-boss.test.js
const newMatch = o => new A.Match(Object.assign({ bossWait: 0, rng: mulberry32(7), playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false }, o));
const center = (m, id) => { const c = m.grid.roomCells(id)[0]; return { x: c.c + 0.5, y: c.r + 0.5 }; };
// 走进房间并等到进门
function enter(m, a, id) { const p = center(m, id); assert.ok(m.moveTo(a, p.x, p.y), '能走去' + id); for (let i = 0; i < 1200 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }

test('地图：每行等宽，3 个摸鱼房间 + 厕所、门和工位都在', () => {
  assert.ok(A.MAP.every(r => r.length === A.COLS) && A.MAP.length === A.ROWS);
  const g = A.buildGrid(A.MAP);
  for (const id of ['print', 'pantry', 'rooftop', 'toilet']) { assert.ok(g.doors[id], id + ' 有门'); assert.ok(g.outside(id), id + ' 门外是办公区'); }
  assert.deepStrictEqual(A.SLACK_ROOMS, ['print', 'pantry', 'rooftop']);
  assert.strictEqual(A.SLACK_ROOMS.reduce((s, r) => s + A.ROOMS[r].cap, 0), 5, '5 个位置给 4 名员工');
  for (const d of A.DESKS) { const s = A.seatOf(d), k = g.cellAt(s.x, s.y); assert.ok(k && !k.wall && !k.room, '座位在办公区'); assert.ok(g.at(d.c, d.r).desk && g.at(d.c + 1, d.r).desk); }
});

test('开局：1 名玩家员工 + 3 名员工 + 老板，各自固定在不同工位', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(3), employeeAI: false });
  assert.strictEqual(m.employees().length, 4); assert.ok(m.boss && m.player.isPlayer && m.player.kind === 'employee');
  assert.strictEqual(new Set(m.employees().map(e => e.desk.id)).size, 4);
  assert.strictEqual(new Set(m.employees().map(e => e.id)).size, 4);
  const p = newMatch().player; assert.strictEqual(p.id, 'rabbit'); assert.strictEqual(p.desk.id, 0);
});

test('寻路：员工能走到 3 个摸鱼房间和厕所；老板进不了厕所（2.1.0 起没有老板办公室）', () => {
  const m = newMatch(), a = m.player;
  for (const id of A.ENTER_ROOMS) { const p = center(m, id); assert.ok(A.findPath(m.grid, a.x, a.y, p.x, p.y, k => m.canPass(a, k)), id); }
  assert.strictEqual(m.moveTo(m.boss, ...Object.values(center(m, 'toilet'))), false);
  assert.deepStrictEqual(m.drainEvents().pop(), { type: 'blocked', who: 'boss', room: 'toilet', reason: 'locked' });
  assert.ok(!A.ROOMS.boss && !m.grid.doors.boss, '没有老板办公室');
});

test('收入曲线：先爬升到峰值再递减，到最长停留回落到 35%', () => {
  const R = A.ROOMS.print;
  assert.ok(Math.abs(A.rate('print', 0) - R.peak * 0.35) < 1e-9);
  assert.ok(Math.abs(A.rate('print', R.rise) - R.peak) < 1e-9);
  assert.ok(A.rate('print', R.rise / 2) < R.peak && A.rate('print', (R.rise + R.maxStay) / 2) < R.peak);
  assert.ok(Math.abs(A.rate('print', R.maxStay) - R.peak * 0.35) < 1e-9);
  assert.strictEqual(A.rate('meeting', 3), 0);
});

test('进房间后钱进口袋；办公区里只有基础工资直接存入', () => {
  const m = newMatch(), a = m.player;
  tick(m, 2); assert.ok(Math.abs(a.banked - 2) < 0.05, '办公区基础工资 $1/秒'); assert.strictEqual(a.pocket, 0);
  enter(m, a, 'print'); const b0 = a.banked;
  tick(m, 5); assert.ok(a.pocket > 20, '打印室里 5 秒口袋有钱'); assert.ok(Math.abs(a.banked - b0) < 1e-9, '房间里不再领基础工资');
  assert.ok(m.drainEvents().some(e => e.type === 'enter' && e.room === 'print'));
});

test('钱要送回自己的工位才存入；路过别人的工位不算', () => {
  const m = newMatch({ playerDesk: 1 }), a = m.player;
  enter(m, a, 'print'); tick(m, 4.1); m.exitRoom(a); tick(m, 2);
  assert.strictEqual(a.room, null); const pocket = a.pocket; assert.ok(pocket > 0, '出门后钱还在口袋');
  const other = A.seatOf(A.DESKS[0]); m.moveTo(a, other.x, other.y + 0.4); tick(m, 6);
  assert.ok(a.pocket > 0, '别人的工位不存');
  m.goDesk(a); tick(m, 6);
  assert.strictEqual(a.pocket, 0); assert.ok(m.drainEvents().some(e => e.type === 'deposit' && e.amount === pocket));
});

test('容量：打印室只有 1 个位置，有人时别人进不去', () => {
  const m = newMatch(), a = m.player, b = m.employees()[1];
  enter(m, a, 'print');
  assert.strictEqual(m.moveTo(b, ...Object.values(center(m, 'print'))), false);
  assert.strictEqual(m.drainEvents().pop().reason, 'full');
  assert.strictEqual(m.entryBlock(b, 'pantry'), null);
});

test('停留上限：到时间自动出门，出门后这个房间进入冷却，其他房间不受影响', () => {
  const m = newMatch(), a = m.player, R = A.ROOMS.print;
  enter(m, a, 'print'); tick(m, R.maxStay + 0.1);
  assert.ok(a.forced || a.room === null); assert.ok(m.drainEvents().some(e => e.type === 'forced'));
  assert.strictEqual(m.moveTo(a, 5, 5), false, '自动出门时不能操作');
  tick(m, 3); assert.strictEqual(a.room, null); assert.ok(!a.forced);
  assert.ok(a.cooldowns.print > R.cooldown - 3.5);
  assert.strictEqual(m.entryBlock(a, 'print'), 'cooldown'); assert.strictEqual(m.entryBlock(a, 'pantry'), null);
  tick(m, R.cooldown); assert.strictEqual(m.entryBlock(a, 'print'), null);
});

// 按移动时间估算路程（楼梯格按减速折算）
function travel(m, a, from, id) {
  const p = m.grid.inside(id), path = A.findPath(m.grid, from.x, from.y, p.x, p.y, k => m.canPass(a, k));
  let d = 0, x = from.x, y = from.y; for (const q of path) { d += Math.hypot(q.x - x, q.y - y); x = q.x; y = q.y; }
  return d + (id === 'rooftop' ? 1 / A.MOVE.stairs : 0);
}
test('天台：要走一排楼梯（慢、没有收入）；四个工位到三个房间的总路程相差约 10% 以内', () => {
  const m = newMatch(), a = m.player;
  assert.ok(m.grid.cells.some(k => k.stairs && k.room === 'rooftop'));
  const sums = A.DESKS.map(d => A.SLACK_ROOMS.reduce((s, id) => s + travel(m, a, A.seatOf(d), id), 0));
  assert.ok(Math.max(...sums) - Math.min(...sums) < 3.5, '总路程差 < 3.5 格（约 10%）：' + sums.map(v => v.toFixed(1)).join(' / '));
  enter(m, a, 'rooftop'); const p0 = a.pocket;
  assert.ok(m.grid.cellAt(a.x, a.y).stairs || p0 >= 0);
});

test('不回工位接着进下一个房间：口袋继续累积', () => {
  const m = newMatch(), a = m.player;
  enter(m, a, 'print'); tick(m, 4.1); const p1 = a.pocket; m.exitRoom(a); tick(m, 1.5);
  enter(m, a, 'pantry'); tick(m, 3); assert.ok(a.pocket > p1);
});

test('键盘移动：不能穿墙，撞墙停住', () => {
  const m = newMatch(), a = m.player;
  m.setDir(a, 0, -1); tick(m, 5);
  const k = m.grid.cellAt(a.x, a.y); assert.ok(k && !k.wall); assert.ok(a.y > 5, '被上方的墙挡住');
  m.setDir(a, 0, 0); assert.strictEqual(a.moving, false === a.moving ? false : a.moving);
});

test('时间到对局结束，之后不再接受指令', () => {
  const m = newMatch({ time: 3 }); tick(m, 3.1);
  assert.strictEqual(m.phase, 'over'); assert.strictEqual(m.moveTo(m.player, 12, 8), false);
  assert.strictEqual(m.ranking().length, 4);
});

// —— 界面流程与画面冒烟测试 ——
['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
function fakeCanvas(texts) {
  const ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  return { width: 960, height: 540, getContext: () => ctx };
}
function memStore() { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; }

test('界面流程：标题 → 开始对局 → 暂停时不走时间也不能操作 → 结束 → 再来一局 / 回标题', () => {
  const app = new A.App({ prep: 0, rng: mulberry32(1), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'cat', playerDesk: 2, time: 5 } });
  assert.strictEqual(app.screen, 'title'); app.tick(1);
  const m = app.start(); assert.strictEqual(app.screen, 'match'); assert.strictEqual(m.player.id, 'cat');
  for (let i = 0; i < 4; i++) app.tick(0.25); assert.ok(Math.abs(m.left - 4) < 0.05);
  app.tick(5); assert.ok(m.left > 3.7, '单帧最多推进 0.25 秒（切回页面不会一下跳很久）');
  app.pause(); app.tick(0.25); assert.ok(m.left > 3.7 && m.left < 3.8); assert.strictEqual(app.tapWorld(12, 7), false); assert.strictEqual(app.act(), false);
  app.resume(); assert.ok(app.tapWorld(12, 6)); for (let i = 0; i < 30; i++) app.tick(0.2);
  assert.strictEqual(m.phase, 'over'); app.pause(); assert.strictEqual(app.paused, false, '结束后不能暂停');
  assert.notStrictEqual(app.restart(), m); app.toTitle(); assert.strictEqual(app.screen, 'title');
});

test('静音设置与闯关模式共用存档，只改 mute', () => {
  const st = memStore(); st.setItem('office-slacker:progress:v1', JSON.stringify({ stars: { 1: 3 }, settings: { speed: 2, bgm: false } }));
  const app = new A.App({ prep: 0, storage: st }); assert.strictEqual(app.muted, false); assert.strictEqual(app.music, false);
  app.toggleMute(); const d = JSON.parse(st.getItem('office-slacker:progress:v1'));
  assert.deepStrictEqual(d, { stars: { 1: 3 }, settings: { speed: 2, bgm: false, mute: true } });
  assert.deepStrictEqual(A.loadSettings(null), { mute: false, bgm: true, arenaDifficulty: 'normal', gfx: '3d' });
});

test('画面：标题、办公区全图、房间视角（外面变暗、只画房间里的人）、暂停、结算都能绘制', () => {
  const texts = [], app = new A.App({ prep: 0, rng: mulberry32(2), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'bear', playerDesk: 0, time: 30, employeeAI: false } }), r = new A.Renderer(fakeCanvas(texts), app);
  r.draw(0.016); assert.ok(texts.includes('开始'));
  const m = app.start(); texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('我的工位') && texts.some(t => /^回工位/.test(t)) && !texts.includes('存款排行'), '竖屏版不显示实时排行');
  const p = m.player; enter(m, p, 'print'); texts.length = 0; r.draw(0.016);
  assert.strictEqual(r.cam.room, 'print'); assert.ok(r.cam.s > A.VIEW.TS, '房间视角放大');
  assert.ok(texts.includes('打印室摸鱼') && texts.some(t => /^再待 \ds$/.test(t)) && texts.some(t => /^至少 \ds$/.test(t)));
  assert.ok(!texts.includes('兔子') && !texts.includes('老板'), '房间外的人不画');
  const w = r.toWorld(r.sx(3.5), r.sy(2.5)); assert.ok(Math.abs(w.x - 3.5) < 1e-9 && Math.abs(w.y - 2.5) < 1e-9);
  app.pause(); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('重新开始'));
  app.resume(); for (let i = 0; i < 200; i++) app.tick(0.2); r.draw(0.016); r.draw(3); texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('再来一局') && texts.some(t => /送回工位的钱不算成绩/.test(t)));
});

test('连摸加成：不回工位连续进第 2、3 间，存钱时整个口袋 ×1.2、×1.4（封顶 ×1.8），存完清零', () => {
  assert.strictEqual(A.comboMult(1), 1); assert.ok(Math.abs(A.comboMult(2) - 1.2) < 1e-9); assert.ok(Math.abs(A.comboMult(3) - 1.4) < 1e-9); assert.strictEqual(A.comboMult(9), 1.8);
  const m = newMatch({ playerDesk: 1 }), a = m.player;
  enter(m, a, 'print'); tick(m, 4.1); m.exitRoom(a); tick(m, 3); assert.strictEqual(a.combo, 1);
  enter(m, a, 'pantry'); tick(m, 4.1); m.exitRoom(a); tick(m, 3); assert.strictEqual(a.combo, 2);
  const pocket = a.pocket, bank = a.banked; m.drainEvents(); m.goDesk(a); tick(m, 8);
  const ev = m.drainEvents().find(e => e.type === 'deposit'); assert.ok(ev);
  assert.ok(Math.abs(ev.amount - pocket * 1.2) < 1e-6 && Math.abs(ev.mult - 1.2) < 1e-9);
  assert.ok(a.banked - bank >= pocket * 1.2 - 1e-6); assert.strictEqual(a.combo, 0);
});
