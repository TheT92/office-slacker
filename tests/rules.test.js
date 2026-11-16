const test = require('node:test'), assert = require('node:assert');
const { OS, newGame, run, TEST_LEVEL } = require('./helper');

function setupCatch() {                     // 兔子 6s 出发 → 7~13s 在厕所；老板 12s 到厕所
  const g = newGame(); run(g, 6); g.useSolo('rabbit'); g.money = 100; return g;
}
test('老板查房时房内的人被抓：罚款 + 被抓次数 + 事件', () => {
  const g = setupCatch(); run(g, 7);
  assert.strictEqual(g.caught, 1); assert.strictEqual(g.fined, 40);
  assert.ok(g.money < 100 && g.money >= 0);
  assert.ok(g.drainEvents().some(e => e.type === 'caught' && e.who === 'rabbit'));
  assert.notStrictEqual(g.get('rabbit').state, 'in_room');
});
test('去的是另一个房间：不会被抓', () => {
  const g = newGame(); run(g, 6); g.useSolo('cat'); run(g, 8);   // 猫去茶水间，老板去厕所
  assert.strictEqual(g.caught, 0);
});
test('普通关：被抓多少次都不会失败，只看金额与时间', () => {
  const g = setupCatch(); g.caught = 50; run(g, 7);
  assert.strictEqual(g.caught, 51); assert.strictEqual(g.phase, 'playing');
});
test('考核关：被抓次数超过 maxCaught 立即失败（等于上限时不失败），原因为 caught', () => {
  const lvl = Object.assign({}, TEST_LEVEL, { maxCaught: 2 });
  const g = new OS.Game(lvl, { rng: () => 0, autoSolo: false }); g.start(); assert.ok(g.isExam());
  run(g, 6); g.useSolo('rabbit'); g.caught = 1; run(g, 7);
  assert.strictEqual(g.caught, 2); assert.strictEqual(g.phase, 'playing');
  g.caught = 2; g.get('rabbit').state = 'in_room'; g.get('rabbit').room = 'restroom'; g.get('rabbit').timer = 5; g.boss.state = 'in_room'; g.boss.zone = 'restroom'; g.boss.timer = 1;
  g.money = 9999; g.update(0.25);                         // 同一步里金额也达标：超限优先判负
  assert.strictEqual(g.phase, 'lose'); assert.strictEqual(g.endReason, 'caught');
});
test('关卡 fine 覆盖罚款，且不污染全局', () => {
  const g = new OS.Game(Object.assign({}, TEST_LEVEL, { fine: 70 }), { rng: () => 0 });
  assert.strictEqual(g.bal.fine, 70); assert.strictEqual(OS.balance.fine, 40);
});
test('金额达标 → 胜利；之后 update 不再变化', () => {
  const g = newGame(); g.money = 450; g.update(0.25); assert.strictEqual(g.phase, 'win');
  const m = g.money; g.update(1); assert.strictEqual(g.money, m);
});
test('时间耗尽未达标 → 失败，原因为 time', () => {
  const g = newGame(); g.timeLeft = 0.1; g.update(0.25); assert.strictEqual(g.phase, 'lose'); assert.strictEqual(g.endReason, 'time');
});
test('累计摸鱼时长目标', () => {
  const g = new OS.Game({ id: 9, roster: ['rabbit'], timeLimit: 60, goal: { slackSeconds: 2 } }, { rng: () => 0 });
  g.start(); g.boss.state = 'returning'; g.boss.timer = 99; run(g, 2.25);
  assert.strictEqual(g.phase, 'win');
});
test('start() 重置所有状态', () => {
  const g = newGame(); g.money = 450; g.update(0.25); g.start();
  assert.strictEqual(g.phase, 'playing'); assert.strictEqual(g.money, 0); assert.strictEqual(g.caught, 0);
});
