const test = require('node:test'), assert = require('node:assert');
const { OS } = require('./helper');
const normal = OS.levels.filter(l => !l.maxCaught), exams = OS.levels.filter(l => l.maxCaught);
// 打到第 i 关时（前面各关都已通关）已解锁的角色
const unlockedAt = lv => Object.values(OS.characters).filter(c => OS.lineup.allowedByLevel(lv, c.id) && (!c.unlockAfter || c.unlockAfter < lv.id)).map(c => c.id);

test('关卡配置合法：id 连续唯一、有目标、工位 1~maxDesks', () => {
  OS.levels.forEach((l, i) => assert.strictEqual(l.id, i + 1));
  for (const l of OS.levels) {
    assert.ok(l.timeLimit > 0 && l.goal && (l.goal.money > 0 || l.goal.slackSeconds > 0), 'level ' + l.id);
    assert.ok(Number.isInteger(l.desks) && l.desks >= 1 && l.desks <= OS.map.maxDesks, 'level ' + l.id);
    assert.ok(l.boss.raidMin <= l.boss.raidMax);
    for (const c of (l.required || []).concat(l.banned || [], l.allowed || [])) assert.ok(OS.characters[c], l.id + ' 缺少角色 ' + c);
  }
});
test('角色配置合法：解锁关卡存在；required 角色在该关之前已解锁；每关可用角色 ≥ 工位数', () => {
  for (const c of Object.values(OS.characters)) {
    assert.ok(c.unlockAfter === 0 || OS.levels.some(l => l.id === c.unlockAfter), c.id);
    assert.ok(OS.ROOMS[c.solo.room] && OS.ROOMS[c.solo.room].capacity > 0, c.id); if (c.team) assert.ok(c.team.short && c.team.charges >= 1 && (c.team.type === 'delay' ? c.team.delay > 0 : c.team.duration > 0) && ['escort', 'delay', 'shield'].includes(c.team.type), c.id);
  }
  assert.ok(Object.values(OS.characters).filter(c => !c.unlockAfter).length >= OS.levels[0].desks);
  for (const l of OS.levels) {
    const have = unlockedAt(l).filter(id => !(l.banned || []).includes(id));
    for (const id of l.required || []) assert.ok(have.includes(id), '第' + l.id + '关要求的 ' + id + ' 尚未解锁');
    assert.ok(have.length >= l.desks, '第' + l.id + '关可用角色不足');
  }
});
test('考核关约定：5 的倍数关必须配置 maxCaught（≥ examMinCaught），其余关不得配置', () => {
  for (const l of OS.levels) {
    if (l.id % 5 === 0) assert.ok(Number.isInteger(l.maxCaught) && l.maxCaught >= OS.balance.examMinCaught, '第' + l.id + '关应为考核关');
    else assert.strictEqual(l.maxCaught, undefined, '第' + l.id + '关不应配置 maxCaught');
  }
});
// 目标金额只和"房间配置相同"的上一关比较：新房间（如打印室收入 ×0.6）会改变收入上限，目标可以下调
const roomsKey = l => (l.rooms || OS.DEFAULT_ROOMS).join(',');
test('普通关难度单调：工位不减、限时不增、查房间隔不增、预警不增；同房间配置下目标不降', () => {
  for (let i = 1; i < normal.length; i++) {
    const a = normal[i - 1], b = normal[i];
    assert.ok(b.desks >= a.desks && b.timeLimit <= a.timeLimit, a.id + '→' + b.id);
    if (roomsKey(a) === roomsKey(b)) assert.ok(b.goal.money >= a.goal.money, a.id + '→' + b.id + ' 目标');
    assert.ok(b.boss.raidMax <= a.boss.raidMax && b.boss.raidMin <= a.boss.raidMin && b.boss.warnTime <= a.boss.warnTime, a.id + '→' + b.id);
  }
});
test('考核关逐个变难：被抓上限不增、罚款不降、查房更频繁', () => {
  const fine = l => l.fine || OS.balance.fine;
  for (let i = 1; i < exams.length; i++) {
    const a = exams[i - 1], b = exams[i];
    assert.ok(b.maxCaught <= a.maxCaught && fine(b) >= fine(a) && b.boss.raidMax <= a.boss.raidMax && b.boss.warnTime <= a.boss.warnTime);
  }
});
