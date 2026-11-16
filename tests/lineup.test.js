const test = require('node:test'), assert = require('node:assert');
const { OS } = require('./helper');
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const prog = cleared => { const p = new OS.Progress(mem()); for (let i = 1; i <= cleared; i++) p.record(i, 1); return p; };
const L = (desks, extra) => Object.assign({ id: 99, desks }, extra || {});   // id 99：所有角色都允许

test('解锁时机：仓鼠 3、企鹅 5、树懒 6、猫头鹰 8、鹦鹉 10、小狗 11、浣熊 12、刺猬 13；按角色表顺序返回', () => {
  const ids = n => OS.lineup.unlockedIds(prog(n));
  assert.deepStrictEqual(ids(0), ['rabbit', 'cat', 'bear', 'fox']);
  assert.deepStrictEqual(ids(3), ['rabbit', 'cat', 'bear', 'fox', 'hamster']);
  assert.deepStrictEqual(ids(5).slice(4), ['hamster', 'penguin']);
  assert.deepStrictEqual(ids(6).slice(4), ['hamster', 'penguin', 'sloth']);
  assert.deepStrictEqual(ids(8).length, 8);
  assert.strictEqual(OS.lineup.nextUnlock(prog(3)).id, 'penguin'); assert.strictEqual(OS.lineup.nextUnlock(prog(8)).id, 'parrot');
  assert.deepStrictEqual(OS.lineup.unlockedIds(prog(13)).slice(8), ['parrot', 'dog', 'raccoon', 'hedgehog']); assert.strictEqual(OS.lineup.nextUnlock(prog(13)), null);
});
test('needsPick：可选人数 > 工位时才需要；banned 会减少可选人数', () => {
  assert.ok(!OS.lineup.needsPick(L(4), prog(0)));
  assert.ok(OS.lineup.needsPick(L(4), prog(3)));
  assert.ok(!OS.lineup.needsPick(L(4, { banned: ['hamster'] }), prog(3)));
});
test('defaultLineup：必选 → 上次阵容 → 按表补满；跳过未解锁/禁用/重复', () => {
  const p = prog(8);
  assert.deepStrictEqual(OS.lineup.defaultLineup(L(4), p, []), ['rabbit', 'cat', 'bear', 'fox']);
  assert.deepStrictEqual(OS.lineup.defaultLineup(L(4), p, ['owl', 'owl', 'penguin']), ['owl', 'penguin', 'rabbit', 'cat']);
  assert.deepStrictEqual(OS.lineup.defaultLineup(L(3, { required: ['sloth'], banned: ['owl'] }), p, ['owl', 'fox']), ['sloth', 'fox', 'rabbit']);
  assert.deepStrictEqual(OS.lineup.defaultLineup(L(4), prog(0), ['owl']), ['rabbit', 'cat', 'bear', 'fox']);
});
test('toggle / validate：必选角色不能下场；禁用、未解锁、超员加不进；各种校验结果', () => {
  const p = prog(8), lv = L(3, { required: ['fox'], banned: ['owl'] });
  assert.deepStrictEqual(OS.lineup.toggle(lv, p, ['fox'], 'fox'), ['fox']);
  assert.deepStrictEqual(OS.lineup.toggle(lv, p, ['fox'], 'owl'), ['fox']);
  assert.deepStrictEqual(OS.lineup.toggle(lv, p, ['fox', 'cat', 'bear'], 'rabbit'), ['fox', 'cat', 'bear']);
  assert.deepStrictEqual(OS.lineup.toggle(lv, prog(0), ['fox'], 'sloth'), ['fox']);
  assert.deepStrictEqual(OS.lineup.toggle(lv, p, ['fox', 'cat'], 'cat'), ['fox']);
  assert.strictEqual(OS.lineup.validate(lv, p, []), 'empty');
  assert.strictEqual(OS.lineup.validate(lv, p, ['fox', 'cat', 'bear', 'rabbit']), 'too_many');
  assert.strictEqual(OS.lineup.validate(lv, p, ['cat']), 'missing_required');
  assert.strictEqual(OS.lineup.validate(lv, p, ['fox', 'owl']), 'invalid');
  assert.strictEqual(OS.lineup.validate(lv, p, ['fox', 'fox']), 'invalid');
  assert.strictEqual(OS.lineup.validate(lv, p, ['fox', 'cat']), 'ok');
});
test('隔间布局：2×3 隔间位于办公区中央，四周留出走道；n 人坐前 n 个隔间', () => {
  const o = OS.map.zones.office, gr = OS.map.grid(), cells = OS.map.cells(), m = OS.map.margin;
  assert.strictEqual(cells.length, OS.map.maxDesks);
  assert.ok(gr.x - o.x === m && o.x + o.w - (gr.x + gr.w) === m && gr.y - o.y === m && o.y + o.h - (gr.y + gr.h) === m);
  assert.ok(Math.abs(cells.reduce((s, c) => s + c.w * c.h, 0) - gr.w * gr.h) < 1e-6);
  for (const n of [1, 4, 6]) OS.map.deskPositions(n).forEach((d, i) => { const c = cells[i]; assert.ok(d.x > c.x && d.x < c.x + c.w && d.y > c.y && d.y < c.y + c.h); });
});
test('老板巡视路线：始终在外圈走道上（隔间区之外、办公区之内），绕一圈回到原点', () => {
  const o = OS.map.zones.office, gr = OS.map.grid(), r = OS.map.patrolRect(), per = 2 * (r.w + r.h) / OS.map.patrolSpeed;
  for (let t = 0; t < per; t += 0.37) {
    const p = OS.map.patrolPos(t);
    assert.ok(p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h);
    assert.ok(!(p.x > gr.x && p.x < gr.x + gr.w && p.y > gr.y && p.y < gr.y + gr.h), 't=' + t);
  }
  const a = OS.map.patrolPos(0), b = OS.map.patrolPos(per);
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6);
});
test('场景区与右侧员工栏不重叠：房间和办公区都在 sceneW 以内', () => {
  for (const z of Object.values(OS.map.zones)) assert.ok(z.x >= 0 && z.x + z.w <= OS.map.sceneW && z.y + z.h <= OS.map.height, z.id);
});
test('两个全体技能角色同场：一人带走老板后，另一人不能叠加（老板已离开）', () => {
  const g = new OS.Game({ id: 0, timeLimit: 60, goal: { money: 9999 } }, { rng: () => 0, roster: ['fox', 'owl', 'cat'] }); g.start();
  assert.ok(g.useTeam('owl')); assert.strictEqual(OS.skills.teamStatus(g, g.get('fox')), 'boss_away');
  assert.strictEqual(g.boss.timer, 12);
});
test('Game 没有阵容时报错', () => {
  assert.throws(() => new OS.Game({ id: 7, timeLimit: 60, goal: { money: 1 } }, {}));
});

test('关卡允许角色：只有解锁关卡号 < 本关的角色可用；全解锁后回到第 4 关也看不到企鹅/树懒/猫头鹰', () => {
  const p = prog(9), lv = id => OS.levels.find(l => l.id === id);
  assert.deepStrictEqual(OS.lineup.pool(lv(1), p), ['rabbit', 'cat', 'bear', 'fox']);
  assert.deepStrictEqual(OS.lineup.pool(lv(4), p), ['rabbit', 'cat', 'bear', 'fox', 'hamster']);
  assert.deepStrictEqual(OS.lineup.pool(lv(6), p), ['rabbit', 'cat', 'bear', 'fox', 'hamster', 'penguin']);
  assert.deepStrictEqual(OS.lineup.pool(lv(9), p).length, 8);
  assert.ok(!OS.lineup.needsPick(lv(3), p));                                 // 第 3 关仍然只有 4 人 → 直接开局
  assert.deepStrictEqual(OS.lineup.defaultLineup(lv(4), p, ['owl', 'penguin', 'hamster']), ['hamster', 'rabbit', 'cat', 'bear']);
  assert.deepStrictEqual(OS.lineup.toggle(lv(4), p, ['rabbit'], 'owl'), ['rabbit']);
});
test('关卡 allowed 字段覆盖默认规则', () => {
  const p = prog(9), lv = L(3, { allowed: ['cat', 'owl', 'sloth', 'fox'] });
  assert.deepStrictEqual(OS.lineup.pool(lv, p), ['cat', 'fox', 'sloth', 'owl']);
  assert.ok(OS.lineup.needsPick(lv, p));
});

test('角色普通技能房间不在本关时不能上场：天台出现前浣熊不可用，打印室出现前鹦鹉/小狗不可用', () => {
  const p = prog(14), lv = id => OS.levels.find(l => l.id === id);
  assert.ok(!OS.lineup.pool(lv(11), p).includes('raccoon') && OS.lineup.pool(lv(11), p).includes('parrot'));
  assert.ok(!OS.lineup.pool(lv(12), p).includes('raccoon') && OS.lineup.pool(lv(12), p).includes('dog'));
  assert.ok(OS.lineup.pool(lv(13), p).includes('raccoon') && !OS.lineup.pool(lv(13), p).includes('hedgehog'));
  assert.strictEqual(OS.lineup.pool(lv(14), p).length, 12);
  assert.ok(!OS.lineup.allowedByLevel({ id: 99, desks: 4 }, 'parrot'));                       // 默认 3 房间没有打印室
});
