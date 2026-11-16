const test = require('node:test'), assert = require('node:assert');
const { OS, newGame, run } = require('./helper');

test('老板在开放办公区：工位上的人不摸鱼，收入为 0', () => {
  const g = newGame(); run(g, 5);
  assert.strictEqual(g.money, 0);
});
test('老板不在开放办公区：工位上的人自动摸鱼，收入 = 时薪/每小时秒数', () => {
  const g = newGame(); g.boss.state = 'returning'; g.boss.timer = 99;
  assert.strictEqual(OS.economy.incomeRate(g.get('rabbit'), g.boss, g.bal), 20 / g.bal.secondsPerHour);
});
test('在房间里：老板在开放办公区也计收入，并带技能倍率', () => {
  const g = newGame(); const cat = g.get('cat'); cat.state = 'in_room';
  assert.ok(Math.abs(OS.economy.incomeRate(cat, g.boss, g.bal) - 30 / g.bal.secondsPerHour * 1.2) < 1e-9);
});
test('路上或陪老板汇报：不计收入', () => {
  const g = newGame(); g.boss.state = 'returning';
  for (const s of ['going', 'returning', 'escorting']) { const e = g.get('bear'); e.state = s; assert.strictEqual(OS.economy.incomeRate(e, g.boss, g.bal), 0); }
});
test('game.update 累计金额与摸鱼秒数', () => {
  const g = newGame(); g.boss.state = 'returning'; g.boss.timer = 99; run(g, 2);
  assert.ok(Math.abs(g.money - (20 + 30 + 40 + 50) / 10 * 2) < 1e-6);
  assert.ok(Math.abs(g.slackSeconds - 8) < 1e-6);
});
