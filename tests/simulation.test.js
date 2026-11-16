const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32, newGame } = require('./helper');

test('脚本机器人整局模拟：必然结束，数值始终合法', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = newGame({ rng: mulberry32(seed) }); let steps = 0;
    while (g.phase === 'playing' && steps++ < 20000) {
      const b = g.boss;
      for (const e of g.employees) {
        if (OS.skills.teamStatus(g, e) === 'ok' && b.state === 'office' && b.timer < 3) g.useTeam(e.id);
        else if (OS.skills.soloStatus(g, e) === 'ok' && b.state !== 'warning' && !(b.state === 'office' && b.timer < 4)) g.useSolo(e.id);
      }
      g.update(1 / 60);
      assert.ok(Number.isFinite(g.money) && g.money >= 0);
      assert.ok(Number.isInteger(g.caught) && g.caught >= 0);
    }
    assert.ok(g.phase === 'win' || g.phase === 'lose', 'seed ' + seed + ' 应已结束');
  }
});
