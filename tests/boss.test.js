const test = require('node:test'), assert = require('node:assert');
const { newGame, run } = require('./helper');

test('查房完整流程：office→warning→going→in_room→returning→office（rng=0 时第一次间隔 9s）', () => {
  const g = newGame(), b = g.boss;
  assert.strictEqual(b.state, 'office'); assert.ok(b.inOffice());
  run(g, 8.75); assert.strictEqual(b.state, 'office');
  run(g, 0.5);  assert.strictEqual(b.state, 'warning'); assert.strictEqual(b.target, 'restroom'); assert.ok(b.inOffice());
  run(g, 2);    assert.strictEqual(b.state, 'going'); assert.ok(!b.inOffice());
  run(g, 1);    assert.strictEqual(b.state, 'in_room'); assert.strictEqual(b.zone, 'restroom');
  run(g, 2.5);  assert.strictEqual(b.state, 'returning');
  run(g, 1);    assert.strictEqual(b.state, 'office'); assert.strictEqual(b.target, null);
});
test('全体技能：老板被带走，结束后返回开放办公区', () => {
  const g = newGame(); assert.ok(g.useTeam('fox'));
  assert.strictEqual(g.boss.state, 'escorted'); assert.ok(!g.boss.inOffice());
  run(g, 8.25); assert.strictEqual(g.boss.state, 'returning');
  run(g, 1);    assert.strictEqual(g.boss.state, 'office');
});
test('预警期间使用全体技能会取消本次查房', () => {
  const g = newGame(); run(g, 9.25); assert.strictEqual(g.boss.state, 'warning');
  assert.ok(g.useTeam('fox')); assert.strictEqual(g.boss.target, 'meeting');
  run(g, 20); assert.ok(g.boss.zone !== 'restroom' || g.boss.state !== 'in_room');
  assert.strictEqual(g.caught, 0);
});
