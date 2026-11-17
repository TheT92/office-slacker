// 摸鱼大作战 B4：3D 画面层——可见性规则、剖墙、设置开关、模型在 Node 里也能搭（不渲染）
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/events', 'arena/match', 'arena/app', 'arena/view3d'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
function enter(m, a, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(a, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 1500 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }
const memStore = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };

test('3D 可见性：老板看不到房间里的人（监控的房间除外）；房间视角只看同一房间；视野外不画；老板没到公司不画', () => {
  const m = new A.Match({ bossWait: 0, rng: mulberry32(3), playerRole: 'boss', bossAI: false, employeeAI: false }); tick(m, 0.1);
  const b = m.boss, e = m.employees()[0]; enter(m, e, 'print');
  b.x = 18; b.y = 7; assert.strictEqual(A.visible3d(m, b, e, {}), false, '房间里的员工老板看不到');
  assert.strictEqual(A.visible3d(m, b, e, { peek: ['print'] }), true, '监控中的房间看得到');
  const out = m.employees()[1]; out.room = null; out.x = 18; out.y = 9; assert.strictEqual(A.visible3d(m, b, out, {}), true);
  out.x = 2; out.y = 30; assert.strictEqual(A.visible3d(m, b, out, {}), false, '视野外不画');
  assert.strictEqual(A.visible3d(m, e, out, { room: 'print' }), false, '房间视角只看同一个房间');
  assert.strictEqual(A.visible3d(m, e, e, { room: 'print' }), true);
  b.waitT = 3; assert.strictEqual(A.visible3d(m, e, b, {}), false, '老板还没到');
});

test('3D 剖墙：进打印室时，打印室下方办公区那排高墙压矮，别的墙不动', () => {
  const g = A.buildGrid(A.MAP), cut = A.cutawayFor(g, 'print');
  assert.ok(cut(g.at(16, 5)) && cut(g.at(21, 5)), '打印室门两边的墙');
  assert.ok(!cut(g.at(10, 5)) && !cut(g.at(16, 0)), '远处的墙和打印室后墙不动');
  assert.strictEqual(A.cutawayFor(g, null)(g.at(16, 5)), false);
});

test('画面设置：默认 3D，可切换到经典并存档；?gfx 之外的存档不受影响', () => {
  const st = memStore(), app = new A.App({ prep: 0, storage: st });
  assert.strictEqual(app.gfx, '3d'); assert.strictEqual(app.toggleGfx(), '2d');
  assert.strictEqual(JSON.parse(st.getItem('office-slacker:progress:v1')).settings.gfx, '2d');
  assert.strictEqual(new A.App({ prep: 0, storage: st }).gfx, '2d');
});

test('3D 模型：地图、家具、四个员工和老板在 Node 里都能搭出来（不渲染）；剖墙改的是墙的实例矩阵', () => {
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => ((t[k] = v), true) });
  global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
  const T = require('../lib/three.min.js'); global.THREE = T; require('../src/arena/world3d.js');
  const g = A.buildGrid(A.MAP), W = A.W3.makeScene(T, g); let n = 0; W.scene.traverse(o => { if (o.isMesh) n++; });
  assert.ok(n > 300, '场景里有 ' + n + ' 个网格');
  for (const id of A.EMPLOYEE_IDS) { const a = A.W3.animal(W.kit, id); a.set('shock'); assert.ok(a.faces.shock.visible && !a.faces.open.visible && a.sweat.visible); a.set('happy'); assert.ok(a.phone.visible); }
  const lion = A.W3.lion(W.kit); lion.set('angry'); assert.ok(lion.fire.visible); lion.tick(1); lion.set('stern'); assert.ok(!lion.fire.visible);
  const w = W.map.userData.walls.find(x => x.list.some(k => k.r === 5 && k.c === 16)), i = w.list.findIndex(k => k.r === 5 && k.c === 16);
  A.W3.cutaway(T, W.map, A.cutawayFor(g, 'print')); const m4 = new T.Matrix4(); w.im.getMatrixAt(i, m4); const s = new T.Vector3(); m4.decompose(new T.Vector3(), new T.Quaternion(), s);
  assert.ok(s.y < 0.5, '打印室前面的墙变矮了');
  A.W3.cutaway(T, W.map, () => false); w.im.getMatrixAt(i, m4); m4.decompose(new T.Vector3(), new T.Quaternion(), s); assert.ok(Math.abs(s.y - 1) < 1e-6, '出来后恢复');
  delete global.document; delete global.THREE;
});

test('没有 WebGL / three.js 时 View3D 不可用，游戏照常用经典画面', () => {
  const v = new A.View3D({}, {}, null); assert.ok(!v.ok); v.setEnabled(true); assert.strictEqual(v.on, false);
});

test('3D 模式的贴图标签：门牌、门上的状态、我的工位、红包金额、补给名字、自己的口袋和老板名牌都画在投影位置上', () => {
  ['render/theme', 'render/sprites', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(6), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'cat', playerDesk: 0, employeeAI: false, bossAI: false } });
  const r = new A.Renderer({ width: 540, height: 960, getContext: () => ctx }, app), m = app.start(); tick(m, 1);
  // 假的 3D 层：正交投影（每格 54 像素，以自己为中心），足够检查画了什么
  const p = m.player, proj = (x, y, h) => ({ X: 270 + (x - p.x) * 54, Y: 500 + (y - p.y) * 54 - (h || 0) * 40 });
  r.v3 = { on: true, project: proj, onScreen: (x, y, h) => { const q = proj(x, y, h); return q.X > 0 && q.X < 540 && q.Y > 108 && q.Y < 812; }, seesSpot: (x, y, room) => !room && A.inSight(p, x, y), toWorld: () => ({ x: 0, y: 0 }) };
  p.x = 17.5; p.y = 9.5; p.pocket = 30; m.bags = [{ x: 18.5, y: 9.5, cash: 30 }]; m.supplies.push({ id: 7, kind: 'double', x: 16.5, y: 10.5, room: null, prog: 0 }); m.boss.x = 19; m.boss.y = 11;
  texts.length = 0; r.draw(0.016);
  assert.ok(texts.some(t => /^打印室 \d\/1/.test(t)), '门牌');
  assert.ok(texts.includes('$30'), '红包金额'); assert.ok(texts.includes(A.SUPPLY.items.double.name), '补给名字');
  assert.ok(texts.includes('▼') && texts.some(t => t.startsWith('$30')), '自己的箭头和口袋'); assert.ok(texts.includes('老板'), '老板名牌');
  p.x = 17; p.y = 13.6; texts.length = 0; r.draw(0.016); assert.ok(texts.includes('我的工位'));
});

test('3D 特效：被抓有冲击波和星星、存钱有金币飞回工位、老板查房门口冒灰；放完自动清掉', () => {
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => ((t[k] = v), true) });
  global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
  const T = require('../lib/three.min.js'); global.THREE = T; require('../src/arena/world3d.js');
  const m = new A.Match({ bossWait: 0, rng: mulberry32(3), playerRole: 'employee', bossAI: false, employeeAI: false }); tick(m, 0.1);
  const grid = A.buildGrid(A.MAP), v = Object.create(A.View3D.prototype);
  Object.assign(v, { T, on: true, ok: true, app: { match: m }, grid, W: A.W3.makeScene(T, grid), fx: [], models: new Map(), cam: new T.PerspectiveCamera() });
  const e = m.employees()[0];
  v.onEvent({ type: 'caught', who: e.id }); const n1 = v.fx.length; assert.ok(n1 >= 10, '冲击波 + 星星 ' + n1);
  v.onEvent({ type: 'check', room: 'pantry', caught: [] }); assert.ok(v.fx.length > n1, '门口冒灰');
  v.models.set(e, { group: { visible: true } }); const n2 = v.fx.length; v.onEvent({ type: 'deposit', who: e.id, amount: 60 }); assert.ok(v.fx.length - n2 >= 3, '金币');
  for (let i = 0; i < 120; i++) v.tickFx(1 / 30); assert.strictEqual(v.fx.length, 0, '放完清掉');
  delete global.document; delete global.THREE;
});

test('标题页右上角有喇叭按钮：点一下切换音效并存档（和暂停菜单、M 键是同一个开关）', () => {
  ['render/theme', 'render/sprites', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const b = A.UI.titleSound; assert.ok(b && b.x + b.w <= 540 && b.y < 108, '在右上角');
  const st = memStore(), app = new A.App({ prep: 0, storage: st }); assert.strictEqual(app.muted, false);
  app.toggleMute(); assert.strictEqual(JSON.parse(st.getItem('office-slacker:progress:v1')).settings.mute, true);
  const calls = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), arc: (...a) => calls.push(a) }, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => ((t[k] = v), true) });
  const r = new A.Renderer({ width: 540, height: 960, getContext: () => ctx }, app); r.draw(0.016);   // 关着时画红叉，不报错
});
