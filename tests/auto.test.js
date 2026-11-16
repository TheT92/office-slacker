const test = require('node:test'), assert = require('node:assert');
const { OS, newGame, run } = require('./helper');

test('冷却好了就自动出发（老板在开放办公区时）', () => {
  const g = newGame();
  OS.auto.step(g); assert.ok(['rabbit', 'cat', 'bear', 'fox'].every(id => g.get(id).state === 'going'));
});
test('不去老板预警/正前往的房间，其他房间照去', () => {
  const g = newGame(); run(g, 9.25);       // rng=0：预警目标是厕所
  assert.strictEqual(g.boss.state, 'warning'); assert.strictEqual(g.boss.target, 'restroom');
  OS.auto.step(g);
  assert.strictEqual(g.get('rabbit').state, 'working'); assert.strictEqual(g.get('fox').state, 'working');   // 都去厕所
  assert.strictEqual(g.get('cat').state, 'going'); assert.strictEqual(g.get('bear').state, 'going');         // 去茶水间
});
test('老板不在开放办公区时不出门（工位上本来就能摸鱼）', () => {
  const g = newGame(); g.boss.state = 'escorted'; g.boss.timer = 5;
  OS.auto.step(g); assert.ok(g.employees.every(e => e.state === 'working'));
});
test('全体技能是关键技能：自动施放永远不放，也永远不召回', () => {
  const g = newGame(); OS.auto.step(g); assert.strictEqual(g.get('fox').teamCharges, 2); assert.strictEqual(g.boss.state, 'office');
  const h = newGame(); run(h, 3.5); h.useSolo('rabbit'); run(h, 6); assert.strictEqual(h.boss.target, 'restroom');
  OS.auto.step(h); assert.strictEqual(h.get('rabbit').state, 'in_room');            // 老板预警厕所，兔子仍在里面：自动不救
});
test('step 在非 playing 阶段什么都不做', () => {
  const h = newGame(); h.phase = 'win'; OS.auto.step(h); assert.ok(h.employees.every(e => e.state === 'working'));
});
test('Game 默认开启普通技能自动（autoSolo），update 时自动出发', () => {
  const g = new OS.Game(require('./helper').TEST_LEVEL, { rng: () => 0 }); g.start(); g.update(1 / 60);
  assert.ok(g.employees.every(e => e.state === 'going'));
});
test('自动施放整局：20 个种子都能正常结束，且不预判老板（仍可能被抓）', () => {
  const { mulberry32 } = require('./helper'); let caughtTotal = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = newGame({ rng: mulberry32(seed) }); let n = 0;
    while (g.phase === 'playing' && n++ < 20000) { OS.auto.step(g); g.update(1 / 60); }
    assert.ok(g.phase === 'win' || g.phase === 'lose'); caughtTotal += g.caught;
  }
  assert.ok(caughtTotal > 0, '自动施放不应是完美躲避');
});
