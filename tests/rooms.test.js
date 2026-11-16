const test = require('node:test'), assert = require('node:assert');
const { OS, run, TEST_LEVEL } = require('./helper');
const mk = (rooms, roster, extra) => { const g = new OS.Game(Object.assign({}, TEST_LEVEL, { rooms }, extra || {}), { rng: () => 0, autoSolo: false, roster }); g.start(); return g; };
const ALL = ['restroom', 'meeting', 'pantry', 'printer', 'rooftop'];

test('makeMap：房间按列表等宽排开、不重叠且在场景区内；默认 3 个房间', () => {
  assert.deepStrictEqual(OS.map.roomIds(), ['restroom', 'meeting', 'pantry']);
  for (const ids of [OS.DEFAULT_ROOMS, ALL]) {
    const m = OS.makeMap(ids), zs = ids.map(id => m.zones[id]);
    zs.forEach((z, i) => { assert.ok(z.x >= 0 && z.x + z.w <= OS.map.sceneW); if (i) assert.ok(zs[i - 1].x + zs[i - 1].w <= z.x); });
  }
});
test('查房目标：只查可摸鱼且非 noRaid 的房间——打印室、会议室永远不被查', () => {
  const g = mk(ALL, ['rabbit']);
  assert.deepStrictEqual(g.bal.boss.raidTargets, ['restroom', 'pantry', 'rooftop']);
  const seen = new Set();
  for (let s = 1; s <= 60; s++) { const h = new OS.Game(Object.assign({}, TEST_LEVEL, { rooms: ALL }), { rng: require('./helper').mulberry32(s), autoSolo: false, roster: ['rabbit'] }); h.start(); run(h, 40); seen.add(h.boss.target || h.boss.zone); }
  assert.ok(!seen.has('printer') && !seen.has('meeting'));
  assert.deepStrictEqual(OS.makeMap(OS.DEFAULT_ROOMS).raidRooms().map(z => z.id), ['restroom', 'pantry']);
});
test('打印室：老板不查、不能召回、收入 ×0.6', () => {
  const g = mk(ALL, ['parrot']), p = g.get('parrot');
  assert.strictEqual(g.canRecall('printer'), false);
  p.state = 'in_room'; p.room = 'printer';
  assert.ok(Math.abs(OS.economy.incomeRate(p, g.boss, g.bal, g.map) - p.wage / 10 * p.solo.multiplier * 0.6) < 1e-9);
});
test('天台：往返各 2 秒（召回时也一样）、收入 ×1.3、容量 3、可召回（W）', () => {
  const g = mk(ALL, ['raccoon']), r = g.get('raccoon');
  assert.strictEqual(r.travel(), 2); assert.strictEqual(g.map.zones.rooftop.capacity, 3); assert.ok(g.canRecall('rooftop'));
  g.useSolo('raccoon'); run(g, 1.75); assert.strictEqual(r.state, 'going'); run(g, 0.5); assert.strictEqual(r.state, 'in_room');
  assert.ok(Math.abs(OS.economy.incomeRate(r, g.boss, g.bal, g.map) - r.wage / 10 * 1.3) < 1e-9);
  assert.strictEqual(g.recallRoom('rooftop'), 1); assert.strictEqual(r.timer, 2);
});
test('老板去天台也要走 2 秒（going/returning 用目标房间的路程）', () => {
  const g = mk(ALL, ['rabbit'], { boss: { raidMin: 1, raidMax: 1, warnTime: 0.5, raidTargets: ['rooftop'] } });
  run(g, 1.25); assert.strictEqual(g.boss.state, 'warning'); run(g, 0.5); assert.strictEqual(g.boss.state, 'going');
  run(g, 1.5); assert.strictEqual(g.boss.state, 'going'); run(g, 0.75); assert.strictEqual(g.boss.state, 'in_room');
});
test('拖住老板：老板在办公区时推迟下一次查房；预警中直接取消；用完立即冷却，本人留在工位', () => {
  const g = mk(OS.DEFAULT_ROOMS, ['parrot', 'rabbit'], { rooms: ['restroom', 'meeting', 'pantry', 'printer'] }), p = g.get('parrot'), t0 = g.boss.timer;
  assert.strictEqual(OS.skills.teamStatus(g, p), 'ok'); assert.ok(g.useTeam('parrot'));
  assert.strictEqual(g.boss.timer, t0 + p.team.delay); assert.strictEqual(g.boss.distracted, p.team.delay);
  assert.strictEqual(p.state, 'working'); assert.strictEqual(p.teamCd, p.team.cooldown); assert.strictEqual(p.teamCharges, p.team.charges - 1);
  assert.strictEqual(OS.skills.teamStatus(g, p), 'cooldown');
  p.teamCd = 0; g.boss.state = 'warning'; g.boss.target = 'restroom';
  assert.strictEqual(OS.hints.teamHint(g, p), 'golden'); assert.ok(g.useTeam('parrot'));
  assert.strictEqual(g.boss.state, 'office'); assert.strictEqual(g.boss.target, null); assert.strictEqual(g.boss.timer, p.team.delay);
  p.teamCd = 0; g.boss.state = 'in_room'; assert.strictEqual(OS.skills.teamStatus(g, p), 'no_charges');
});
test('拖住老板：老板不在开放办公区时不能用', () => {
  const g = mk(['restroom', 'meeting', 'pantry', 'printer'], ['parrot']); g.boss.state = 'escorted';
  assert.strictEqual(OS.skills.teamStatus(g, g.get('parrot')), 'boss_away');
});
test('打掩护：生效期间被查到的人不罚款、不计次数（仍被送回）；过期后恢复；生效中不能重复放', () => {
  const g = mk(['restroom', 'meeting', 'pantry'], ['hedgehog', 'rabbit']), h = g.get('hedgehog');
  run(g, 6); g.useSolo('rabbit'); run(g, 3.5);                         // 9.5s：兔子在厕所（7~13s），老板预警厕所，12s 到
  assert.strictEqual(OS.hints.teamHint(g, h), 'golden');
  assert.ok(g.useTeam('hedgehog')); assert.strictEqual(g.shield, h.team.duration); assert.strictEqual(OS.skills.teamStatus(g, h), 'no_charges');
  h.teamCharges = 1; assert.strictEqual(OS.skills.teamStatus(g, h), 'cooldown'); h.teamCd = 0; assert.strictEqual(OS.skills.teamStatus(g, h), 'active'); h.teamCharges = 0;
  g.money = 100; run(g, 3.5);
  assert.strictEqual(g.caught, 0); assert.strictEqual(g.money >= 100, true); assert.strictEqual(g.shielded, 1);
  assert.notStrictEqual(g.get('rabbit').state, 'in_room');
  assert.ok(g.drainEvents().some(e => e.type === 'shielded' && e.who === 'rabbit'));
  run(g, 10); assert.strictEqual(g.shield, 0);
});
