const test = require('node:test'), assert = require('node:assert');
const { OS } = require('./helper');
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const enter = (app, id) => { const ok = app.openLevel(id); if (ok && app.screen === 'lineup') app.confirmLineup(); return ok; };
const winNow = app => { app.game.money = app.game.level.goal.money; app.update(0.25); };

test('初始在选关界面；锁定关卡打不开', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  assert.strictEqual(app.screen, 'select'); assert.strictEqual(app.openLevel(2), false); assert.strictEqual(app.screen, 'select');
  assert.strictEqual(app.openLevel(99), false);
});
test('通关 → 结算（星级）→ 解锁下一关 → 进入下一关', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  assert.ok(app.openLevel(1)); assert.strictEqual(app.screen, 'game'); assert.strictEqual(app.game.level.id, 1);
  assert.ok(!app.hasNext());
  winNow(app);
  assert.ok(app.result.win && app.result.stars >= 1 && app.result.newBest);
  assert.ok(app.unlocked(2)); assert.ok(app.hasNext());
  assert.ok(app.next()); assert.strictEqual(app.game.level.id, 2); assert.strictEqual(app.result, null);
});
test('关卡参数生效：第5关为考核关（被抓上限 2）、老板参数被覆盖', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  for (let i = 1; i < 5; i++) { enter(app, i); winNow(app); }
  assert.ok(enter(app, 5));
  assert.ok(app.game.isExam()); assert.strictEqual(app.game.maxCaught, 2); assert.strictEqual(app.game.bal.boss.raidMin, OS.levels[4].boss.raidMin);
  enter(app, 1); assert.ok(!app.game.isExam());
  assert.strictEqual(OS.balance.boss.raidMin, 9);            // 全局默认值未被污染
});
test('失败：给出原因，不解锁下一关；retry 重开同一关', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }); app.openLevel(1);
  app.game.timeLeft = 0.1; app.update(0.25);
  assert.deepStrictEqual(app.result, { win: false, reason: 'time' }); assert.ok(!app.unlocked(2));
  assert.ok(app.retry()); assert.strictEqual(app.game.phase, 'playing'); assert.strictEqual(app.game.money, 0);
  app.game.caught = 99; app.game.timeLeft = 5; app.update(0.25); assert.strictEqual(app.game.phase, 'playing');   // 普通关被抓不失败
  const b = new OS.App({ intros: false, storage: mem(), rng: () => 0, levels: [{ id: 1, desks: 4, timeLimit: 60, goal: { money: 999 }, maxCaught: 2 }] });
  b.openLevel(1); b.game.caught = 3; b.update(0.25); assert.deepStrictEqual(b.result, { win: false, reason: 'caught' });
});
test('进度在新的 App 实例中保留；toSelect 回到选关', () => {
  const s = mem(); const a = new OS.App({ intros: false, storage: s, rng: () => 0 }); a.openLevel(1); winNow(a); a.toSelect();
  assert.strictEqual(a.screen, 'select'); assert.strictEqual(a.game, null);
  const b = new OS.App({ intros: false, storage: s }); assert.ok(b.unlocked(2)); assert.ok(b.progress.stars(1) >= 1);
});

// —— 倍速、普通技能自动、暂停 ——
const unlockAll = app => { for (let i = 1; i < 3; i++) { enter(app, i); winNow(app); } app.toSelect(); };
test('第 3 关解锁前：倍速不可用，切换无效', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  assert.ok(!app.featuresUnlocked()); assert.strictEqual(app.cycleSpeed(), false); assert.strictEqual(app.speed(), 1);
  enter(app, 1); winNow(app); assert.ok(!app.featuresUnlocked());     // 只过第 1 关还不够
  enter(app, 2); winNow(app); assert.ok(app.featuresUnlocked());
});
test('倍速循环 1→1.5→2→1，只有三档；旧存档里的 3 倍按 1 倍处理', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }); unlockAll(app);
  const seen = []; for (let i = 0; i < 4; i++) { app.cycleSpeed(); seen.push(app.speed()); }
  assert.deepStrictEqual(seen, [1.5, 2, 1, 1.5]);
  app.progress.setSetting('speed', 3); assert.strictEqual(app.speed(), 1);
});
test('tick：游戏时间 = 真实时间 × 倍速；固定步长使 1.5 倍、2 倍与 1 倍结果完全一致', () => {
  const mk = sp => { const a = new OS.App({ intros: false, storage: mem(), rng: () => 0 }); unlockAll(a); a.progress.setSetting('speed', sp); enter(a, 1); return a; };
  const a1 = mk(1), a15 = mk(1.5), a2 = mk(2);
  for (let i = 0; i < 180; i++) a1.tick(0.05);       // 9 秒
  for (let i = 0; i < 120; i++) a15.tick(0.05);      // 6 秒 × 1.5
  for (let i = 0; i < 90; i++) a2.tick(0.05);        // 4.5 秒 × 2
  const used = a => a.game.level.timeLimit - a.game.timeLeft;
  for (const a of [a1, a15, a2]) assert.ok(Math.abs(used(a) - 9) < 0.02, String(used(a)));
  for (const a of [a15, a2]) { assert.strictEqual(a.game.boss.state, a1.game.boss.state); assert.strictEqual(a.game.money.toFixed(6), a1.game.money.toFixed(6)); }
});
test('tick：未解锁时即使存档里写着 2 倍也按 1 倍；选关界面不推进', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }); app.progress.setSetting('speed', 2);
  assert.strictEqual(app.tick(1), 0); enter(app, 1); app.tick(0.5);
  assert.ok(Math.abs(app.game.level.timeLimit - app.game.timeLeft - 0.5) < 0.02);
});
test('普通技能始终自动出发（无需任何开关）；特殊技能不会自动释放', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }); enter(app, 1); app.update(1 / 60);
  assert.ok(app.game.employees.every(e => e.state === 'going'));
  assert.strictEqual(app.game.get('fox').teamCharges, 2); assert.strictEqual(app.game.boss.state, 'office');
});
test('暂停：游戏时间冻结；暂停期间不能放特殊技能、不能召回；继续后恢复', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }); enter(app, 1);       // 开局还没推进：狐狸在工位，汇报可用
  assert.ok(app.pause()); const t = app.game.timeLeft;
  assert.strictEqual(app.tick(1), 0); app.update(1); assert.strictEqual(app.game.timeLeft, t);
  assert.strictEqual(app.castTeam('fox'), false); assert.strictEqual(app.game.get('fox').teamCharges, 2);
  app.game.get('cat').startSolo(); assert.strictEqual(app.recall('pantry'), 0); assert.strictEqual(app.game.get('cat').state, 'going');
  assert.ok(app.togglePause()); assert.ok(!app.paused);
  assert.ok(app.castTeam('fox')); assert.strictEqual(app.game.get('fox').teamCharges, 1);
  assert.strictEqual(app.recall('pantry'), 1);
  app.tick(0.5); assert.ok(app.game.timeLeft < t);
});
test('暂停只在对局进行中有效；重试/回选关会解除暂停', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }); assert.strictEqual(app.pause(), false);
  enter(app, 1); app.pause(); assert.ok(app.retry()); assert.ok(!app.paused);
  app.pause(); app.toSelect(); assert.ok(!app.paused);
  enter(app, 1); app.game.money = 9999; app.update(0.25); assert.strictEqual(app.pause(), false);   // 结算中不能暂停
});
// —— P2b：角色解锁与阵容 ——
test('前 3 关只有 4 个初始角色、4 个工位：不进阵容界面，直接开局', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  assert.ok(app.openLevel(1)); assert.strictEqual(app.screen, 'game'); assert.deepStrictEqual(app.game.roster, ['rabbit', 'cat', 'bear', 'fox']);
});
test('通关第 3 关解锁仓鼠（结算里带新角色）；第 4 关可选 5 人 > 4 工位 → 进入阵容界面', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  for (let i = 1; i <= 2; i++) { enter(app, i); winNow(app); assert.deepStrictEqual(app.result.unlockedChars, []); }
  enter(app, 3); winNow(app); assert.deepStrictEqual(app.result.unlockedChars, ['hamster']);
  enter(app, 3); winNow(app); assert.deepStrictEqual(app.result.unlockedChars, []);       // 重玩不重复提示
  assert.ok(app.openLevel(4)); assert.strictEqual(app.screen, 'lineup'); assert.strictEqual(app.game, null);
  assert.deepStrictEqual(app.picks, ['rabbit', 'cat', 'bear', 'fox']);                    // 默认按角色表顺序填满
});
test('阵容界面：满员时加不进人；换人后开始，阵容被记住，下次默认沿用', () => {
  const s = mem(), app = new OS.App({ intros: false, storage: s, rng: () => 0 });
  for (let i = 1; i <= 3; i++) { enter(app, i); winNow(app); }
  app.openLevel(4);
  assert.strictEqual(app.togglePick('hamster'), false);                                   // 已满 4/4
  assert.ok(app.togglePick('rabbit')); assert.ok(app.togglePick('hamster'));
  assert.strictEqual(app.togglePick('owl'), false);                                       // 未解锁
  assert.ok(app.confirmLineup()); assert.deepStrictEqual(app.game.roster, ['cat', 'bear', 'fox', 'hamster']);
  assert.strictEqual(app.game.employees.length, 4);
  const b = new OS.App({ intros: false, storage: s, rng: () => 0 }); b.openLevel(4); assert.deepStrictEqual(b.picks, ['cat', 'bear', 'fox', 'hamster']);
});
test('空阵容不能开始；重试沿用本关阵容，不再弹阵容界面；结算"换阵容"带回当前阵容', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  for (let i = 1; i <= 3; i++) { enter(app, i); winNow(app); }
  app.openLevel(4); for (const id of app.picks.slice()) app.togglePick(id);
  assert.strictEqual(app.lineupStatus(), 'empty'); assert.strictEqual(app.confirmLineup(), false);
  app.togglePick('hamster'); app.togglePick('fox'); assert.ok(app.confirmLineup());          // 少于工位数也可以开始
  app.game.timeLeft = 0.1; app.update(0.25); assert.ok(app.retry());
  assert.strictEqual(app.screen, 'game'); assert.deepStrictEqual(app.game.roster, ['hamster', 'fox']);
  assert.ok(app.canPick()); app.game.timeLeft = 0.1; app.update(0.25); assert.ok(app.changeLineup());
  assert.strictEqual(app.screen, 'lineup'); assert.deepStrictEqual(app.picks, ['hamster', 'fox']);
});
test('工位数决定上场上限；6 人关最多 6 人', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 });
  for (let i = 1; i <= 9; i++) { enter(app, i); winNow(app); }
  assert.deepStrictEqual(OS.lineup.unlockedIds(app.progress).length, 8);
  app.openLevel(10); assert.strictEqual(app.picks.length, 6);
  assert.strictEqual(app.togglePick(OS.lineup.unlockedIds(app.progress).find(id => !app.picks.includes(id))), false);
  assert.ok(app.confirmLineup()); assert.strictEqual(app.game.employees.length, 6); assert.strictEqual(app.game.desks.length, 6);
});
