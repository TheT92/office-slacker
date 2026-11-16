const test = require('node:test'), assert = require('node:assert');
const { OS, newGame, run } = require('./helper');

test('个人技能完整周期：going→in_room→returning→working，并进入冷却', () => {
  const g = newGame(), e = g.get('rabbit');
  assert.ok(g.useSolo('rabbit')); assert.strictEqual(e.state, 'going');
  run(g, 1);    assert.strictEqual(e.state, 'in_room');
  run(g, 6);    assert.strictEqual(e.state, 'returning'); assert.strictEqual(e.cd, 12);
  run(g, 1);    assert.strictEqual(e.state, 'working');
  assert.strictEqual(OS.skills.soloStatus(g, e), 'cooldown');
  run(g, 12);   assert.strictEqual(OS.skills.soloStatus(g, e), 'ok');
});
test('忙碌中不能重复释放', () => {
  const g = newGame(); g.useSolo('cat');
  assert.strictEqual(g.useSolo('cat'), false); assert.strictEqual(OS.skills.soloStatus(g, g.get('cat')), 'busy');
});
test('房间容量已满时不能再去', () => {
  const g = newGame(), z = g.map.zones.restroom, old = z.capacity;
  try { z.capacity = 1; assert.ok(g.useSolo('rabbit')); assert.strictEqual(OS.skills.soloStatus(g, g.get('fox')), 'full'); }
  finally { z.capacity = old; }
});
test('全体技能：次数、冷却、老板不在时不可用', () => {
  const g = newGame(), fox = g.get('fox');
  assert.strictEqual(OS.skills.teamStatus(g, g.get('rabbit')), 'none');
  assert.ok(g.useTeam('fox')); assert.strictEqual(fox.teamCharges, 1);
  run(g, 9.25); assert.strictEqual(fox.state, 'working'); assert.strictEqual(OS.skills.teamStatus(g, fox), 'cooldown');
  fox.teamCd = 0; g.boss.state = 'in_room'; assert.strictEqual(OS.skills.teamStatus(g, fox), 'boss_away');
  g.boss.state = 'office'; assert.ok(g.useTeam('fox')); assert.strictEqual(fox.teamCharges, 0);
  fox.state = 'working'; fox.teamCd = 0; g.boss.state = 'office'; assert.strictEqual(OS.skills.teamStatus(g, fox), 'no_charges');
});
test('汇报期间：施法者不摸鱼，其他人在工位上摸鱼', () => {
  const g = newGame(); g.useTeam('fox'); run(g, 1);
  assert.ok(Math.abs(g.money - (20 + 30 + 40) / 10) < 1e-6);
  assert.strictEqual(g.get('fox').earned, 0);
});
