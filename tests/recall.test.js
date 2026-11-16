const test = require('node:test'), assert = require('node:assert');
const { OS, newGame, run } = require('./helper');
// rng=0：老板 9s 后预警厕所，预警 2s → 11s 出发 → 12s 到厕所

test('预警中点击厕所：房内全部员工返回，躲过查房，各自进入冷却', () => {
  const g = newGame(); run(g, 6); g.useSolo('rabbit'); g.useSolo('fox'); run(g, 3.5);   // 9.5s：两人都在厕所，老板预警厕所
  assert.ok(OS.hints.roomDanger(g, 'restroom'));
  assert.strictEqual(g.recallRoom('restroom'), 2);
  for (const id of ['rabbit', 'fox']) { const e = g.get(id); assert.strictEqual(e.state, 'returning'); assert.strictEqual(e.cd, e.solo.cooldown); }
  assert.deepStrictEqual(g.drainEvents().filter(e => e.type === 'recall'), [{ type: 'recall', room: 'restroom', count: 2 }]);
  run(g, 6); assert.strictEqual(g.caught, 0);
});
test('不召回则被抓（对照）', () => {
  const g = newGame(); run(g, 6); g.useSolo('rabbit'); run(g, 7); assert.strictEqual(g.caught, 1);
});
test('只召回被点的房间；正在走向该房间的人原地掉头（返回时间 = 已走路程）', () => {
  const g = newGame(); g.useSolo('cat'); g.useSolo('rabbit'); run(g, 0.25);
  const r = g.get('rabbit'); assert.strictEqual(r.state, 'going');
  assert.strictEqual(g.recallRoom('restroom'), 1);
  assert.strictEqual(r.state, 'returning'); assert.ok(Math.abs(r.timer - 0.25) < 1e-9);
  assert.strictEqual(g.get('cat').state, 'going');
  run(g, 0.25); assert.strictEqual(r.state, 'working');
});
test('会议室、开放办公区不能召回；房间没人返回 0；非 playing 阶段无效', () => {
  const g = newGame(); g.useTeam('fox');
  assert.strictEqual(g.recallRoom('meeting'), 0); assert.strictEqual(g.get('fox').state, 'escorting');
  assert.strictEqual(g.recallRoom('office'), 0); assert.strictEqual(g.recallRoom('pantry'), 0); assert.strictEqual(g.recallRoom('nope'), 0);
  const h = newGame(); h.useSolo('cat'); h.phase = 'win'; assert.strictEqual(h.recallRoom('pantry'), 0);
});
test('提示：全体技能可用为 ready，老板预警时为 golden，不可用为 none；危险员工与房间', () => {
  const g = newGame(), fox = g.get('fox');
  assert.strictEqual(OS.hints.teamHint(g, fox), 'ready'); assert.strictEqual(OS.hints.teamHint(g, g.get('cat')), 'none');
  run(g, 3.5); g.useSolo('rabbit'); run(g, 5.75); assert.strictEqual(g.boss.state, 'warning');
  assert.strictEqual(OS.hints.teamHint(g, fox), 'golden');
  assert.ok(OS.hints.inDanger(g, g.get('rabbit'))); assert.ok(!OS.hints.inDanger(g, g.get('cat')));
  assert.ok(OS.hints.roomDanger(g, 'restroom')); assert.ok(!OS.hints.roomDanger(g, 'pantry'));
  g.useTeam('fox'); assert.strictEqual(OS.hints.teamHint(g, fox), 'none');
  assert.ok(!OS.hints.roomDanger(g, 'restroom'));                                     // 汇报取消了查房
});

test('特殊技能角色在摸鱼途中不能释放（必须回到工位）；timeToDesk 给出回到工位的剩余时间', () => {
  const g = newGame(), fox = g.get('fox');
  g.useSolo('fox'); run(g, 0.5); assert.strictEqual(fox.state, 'going');
  assert.strictEqual(OS.skills.teamStatus(g, fox), 'busy'); assert.strictEqual(g.useTeam('fox'), false);
  assert.ok(Math.abs(fox.timeToDesk() - (0.5 + fox.solo.stay + 1)) < 1e-9);
  run(g, 1); assert.strictEqual(fox.state, 'in_room'); assert.strictEqual(OS.skills.teamStatus(g, fox), 'busy');
  run(g, fox.solo.stay + 1); assert.strictEqual(fox.state, 'working'); assert.strictEqual(fox.timeToDesk(), 0);
  assert.strictEqual(OS.skills.teamStatus(g, fox), 'ok'); assert.ok(g.useTeam('fox'));
  assert.strictEqual(OS.skills.teamStatus(g, fox), 'busy');
});
