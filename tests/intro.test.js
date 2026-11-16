const test = require('node:test'), assert = require('node:assert');
const { OS } = require('./helper');
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const L = id => OS.levels.find(l => l.id === id), kinds = id => OS.intro.build(L(id)).items.map(x => x.kind + (x.id ? ':' + x.id : ''));

test('第 1 关：入门玩法 4 条', () => {
  const b = OS.intro.build(L(1)); assert.strictEqual(b.title, '欢迎来到一起来摸鱼'); assert.strictEqual(b.items.length, 4);
  assert.ok(b.items.every(x => x.kind === 'tip'));
});
test('各关自动生成的新内容与关卡变化一致', () => {
  assert.deepStrictEqual(kinds(2), []);                                        // 第 2 关没有新内容
  assert.deepStrictEqual(kinds(3), ['speed']);
  assert.deepStrictEqual(kinds(4), ['char:hamster', 'lineup']);
  assert.deepStrictEqual(kinds(5), ['exam']);
  assert.deepStrictEqual(kinds(6), ['char:penguin', 'desks']);
  assert.deepStrictEqual(kinds(9), ['char:owl']);
  assert.deepStrictEqual(kinds(11), ['char:parrot', 'room:printer']);
  assert.deepStrictEqual(kinds(13), ['char:raccoon', 'room:rooftop']);
  assert.deepStrictEqual(kinds(14), ['char:hedgehog']);
  assert.deepStrictEqual(kinds(15), ['exam']);
  const p = OS.intro.build(L(11)).items[0]; assert.ok(/递文件/.test(p.text) && /推迟/.test(p.text));
  const r = OS.intro.build(L(11)).items[1]; assert.ok(/从不来查/.test(r.text) && /0\.6/.test(r.text));
  const e = OS.intro.build(L(15)).items[0]; assert.ok(/超过 2 次/.test(e.text) && /\$80/.test(e.text));
  assert.deepStrictEqual(OS.intro.newChars(L(11)), ['parrot']);
});
test('关卡 intro 字段追加自定义说明', () => {
  const lv = Object.assign({}, L(2), { intro: ['今天老板心情不好'] });
  assert.deepStrictEqual(OS.intro.build(lv, OS.levels.map(l => l.id === 2 ? lv : l)).items.map(x => x.text), ['今天老板心情不好']);
});
test('第一次进入有新内容的关卡时弹框：期间游戏冻结、不能操作；关闭后记住，重试不再弹', () => {
  const app = new OS.App({ storage: mem(), rng: () => 0 });
  app.openLevel(1); assert.ok(app.intro && app.intro.items.length === 4);
  assert.ok(app.frozen()); assert.strictEqual(app.tick(1), 0); assert.strictEqual(app.game.timeLeft, app.game.level.timeLimit);
  assert.strictEqual(app.castTeam('fox'), false); assert.strictEqual(app.pause(), false);
  assert.ok(app.closeIntro()); assert.ok(!app.intro && !app.frozen()); app.tick(0.5); assert.ok(app.game.timeLeft < app.game.level.timeLimit);
  app.retry(); assert.strictEqual(app.intro, null);
  app.progress.record(1, 1); app.openLevel(2); assert.strictEqual(app.intro, null);   // 第 2 关没有新内容
});
test('看过的记录会存档；暂停菜单"本关说明"可重新打开，关闭后仍是暂停', () => {
  const s = mem(), a = new OS.App({ storage: s, rng: () => 0 }); a.openLevel(1); a.closeIntro();
  const b = new OS.App({ storage: s, rng: () => 0 }); b.openLevel(1); assert.strictEqual(b.intro, null);
  assert.ok(b.hasIntro()); b.pause(); assert.ok(b.showIntro()); assert.ok(b.intro); b.closeIntro(); assert.ok(b.paused);
  b.progress.reset(); assert.ok(!b.progress.introSeen(1));
});
test('有阵容界面的关卡：点"开始"后才弹框', () => {
  const app = new OS.App({ storage: mem(), rng: () => 0 }); for (let i = 1; i <= 3; i++) app.progress.record(i, 1);
  app.openLevel(4); assert.strictEqual(app.screen, 'lineup'); assert.strictEqual(app.intro, null);
  app.confirmLineup(); assert.ok(app.intro); assert.deepStrictEqual(app.intro.items.map(x => x.kind), ['char', 'lineup']);
});
