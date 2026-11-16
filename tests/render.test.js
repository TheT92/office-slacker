// 渲染冒烟测试：用假的 2D 上下文跑一遍各个界面，确保不抛异常（不验证画面）；并测试命中检测。
const test = require('node:test'), assert = require('node:assert');
const { OS, run } = require('./helper');
require('../src/render/theme.js'); require('../src/render/sprites.js'); require('../src/render/ui.js'); require('../src/render/renderer.js');
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
function fakeCanvas() {
  const ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  return { getContext: () => ctx };
}
test('各界面（选关/预警/汇报/胜利/失败）都能绘制', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer(fakeCanvas(), app, { debug: true });
  r.draw(0.016);                                           // 选关
  app.openLevel(1); r.toast('x'); run(app.game, 11); r.draw(0.016);   // 预警
  app.game.useSolo('cat'); app.game.useTeam('fox'); run(app.game, 3); r.draw(0.016);
  app.game.money = 9999; app.update(0.25); r.draw(0.016);          // 胜利结算（含"下一关"）
  app.retry(); app.game.timeLeft = 0.1; app.update(0.25); r.draw(0.016);   // 失败结算（时间）
});
test('考核关、倍速已解锁、暂停遮罩、被抓超限失败的界面都能绘制', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer(fakeCanvas(), app, {});
  for (let i = 1; i <= 4; i++) { app.openLevel(i); if (app.screen === 'lineup') { r.draw(0.016); app.confirmLineup(); } app.game.money = 9999; app.update(0.25); }
  app.toSelect(); r.draw(0.016);                                       // 选关：考核标记 + 已解锁提示
  app.cycleSpeed(); app.pause(); r.draw(0.016); app.resume();
  app.openLevel(5); app.confirmLineup(); run(app.game, 3); r.draw(0.016);                   // 考核关 HUD、卡片开关
  app.game.caught = 3; app.update(0.25); assert.strictEqual(app.result.reason, 'caught'); r.draw(0.016);
});
test('阵容界面、6 人卡片栏、召回提示、带解锁提示和"换阵容"的结算都能绘制', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer(fakeCanvas(), app, {});
  const go = id => { app.openLevel(id); if (app.screen === 'lineup') { r.draw(0.016); app.confirmLineup(); } };
  for (let i = 1; i <= 9; i++) { go(i); app.game.money = 99999; app.update(0.25); r.draw(0.016); }
  app.toSelect(); r.draw(0.016);
  app.openLevel(10); assert.strictEqual(app.screen, 'lineup'); r.draw(0.016);
  for (const id of app.picks.slice()) app.togglePick(id); r.draw(0.016);                     // 空阵容：开始按钮置灰
  for (const id of ['owl', 'fox', 'penguin', 'cat', 'bear', 'sloth']) app.togglePick(id);
  app.confirmLineup(); run(app.game, 2); app.game.useSolo('sloth'); run(app.game, 4); r.draw(0.3);           // 预警中：危险卡片、召回横幅、golden 提示
  assert.ok(app.game.boss.state === 'warning' || app.game.boss.state === 'going');
  app.game.recallRoom(app.game.boss.target); app.game.useTeam('owl'); r.draw(0.016);
  app.game.timeLeft = 0.1; app.update(0.25); r.draw(0.016);
  assert.ok(OS.ui.resultButtons(app).some(b => b.id === 'lineup'));
});
test('游戏内命中检测：特殊技能卡片整张可点、房间召回、HUD 按钮；暂停时只响应暂停菜单', () => {
  const app = new OS.App({ intros: false, storage: mem() }); app.openLevel(1); const g = app.game, L = OS.ui.panelLayout(g);
  assert.deepStrictEqual(L.cards.map(c => c.e.id), ['fox']); assert.deepStrictEqual(L.rows.map(r => r.e.id), ['rabbit', 'cat', 'bear']);
  const fc = L.cards[0];
  for (const [dx, dy] of [[5, 5], [fc.w - 5, fc.h - 5], [fc.w / 2, fc.h / 2]]) assert.deepStrictEqual(OS.ui.hitTest(g, fc.x + dx, fc.y + dy), { type: 'team', id: 'fox' });
  assert.strictEqual(OS.ui.hitTest(g, L.rows[0].x + 10, L.rows[0].y + 10), null);                        // 其他同事不可点
  const z = OS.map.zones;
  assert.deepStrictEqual(OS.ui.hitTest(g, z.restroom.x + 50, z.restroom.y + 50), { type: 'recall', room: 'restroom' });
  assert.deepStrictEqual(OS.ui.hitTest(g, z.pantry.x + 5, z.pantry.y + z.pantry.h - 5), { type: 'recall', room: 'pantry' });
  assert.strictEqual(OS.ui.hitTest(g, z.meeting.x + 50, z.meeting.y + 50), null);
  assert.strictEqual(OS.ui.hitTest(g, z.office.x + 100, z.office.y + 100), null);
  for (const [b, t] of [[OS.ui.menuButton, 'select'], [OS.ui.pauseButton, 'pause'], [OS.ui.speedButton, 'speed']]) assert.deepStrictEqual(OS.ui.hitTest(g, b.x + 5, b.y + 5), { type: t });
  // 暂停时：技能卡、房间、倍速都不响应；暂停菜单按钮响应
  assert.strictEqual(OS.ui.hitTest(g, fc.x + 5, fc.y + 5, true), null);
  assert.strictEqual(OS.ui.hitTest(g, z.restroom.x + 50, z.restroom.y + 50, true), null);
  assert.strictEqual(OS.ui.hitTest(g, OS.ui.speedButton.x + 5, OS.ui.speedButton.y + 5, true), null);
  assert.deepStrictEqual(OS.ui.hitTest(g, OS.ui.pauseButtons[0].x + 5, OS.ui.pauseButtons[0].y + 5, true), { type: 'pausemenu', id: 'resume' });
  assert.deepStrictEqual(OS.ui.hitTest(g, OS.ui.pauseButton.x + 5, OS.ui.pauseButton.y + 5, true), { type: 'pause' });
});
test('HUD 按钮互不重叠；暂停菜单在场景区内', () => {
  const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const hud = [OS.ui.pauseButton, OS.ui.speedButton, OS.ui.menuButton];
  for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) assert.ok(!over(hud[i], hud[j]));
  for (const b of OS.ui.pauseButtons) assert.ok(b.x >= 0 && b.x + b.w <= OS.map.sceneW);
});
test('右侧员工栏（6 人：2 张特殊卡 + 4 行）：都在员工栏内、互不重叠、分割线在两区之间', () => {
  const g = new OS.Game({ id: 0, timeLimit: 60, goal: { money: 1 } }, { rng: () => 0, roster: ['rabbit', 'cat', 'fox', 'penguin', 'owl', 'sloth'] }); g.start();
  const L = OS.ui.panelLayout(g), all = L.cards.concat(L.rows, L.heads), over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.deepStrictEqual(L.cards.map(c => c.e.id), ['fox', 'owl']); assert.strictEqual(L.rows.length, 4);
  all.forEach((a, i) => { assert.ok(a.x >= OS.map.sceneW && a.x + a.w <= 960 && a.y >= 44 && a.y + a.h <= 640); all.slice(i + 1).forEach(b => assert.ok(!over(a, b))); });
  const div = L.heads.find(h => h.divider); assert.ok(div && div.y > L.cards[1].y + L.cards[1].h && div.y < L.rows[0].y);
  assert.deepStrictEqual(OS.ui.hitTest(g, L.cards[1].x + 9, L.cards[1].y + 9), { type: 'team', id: 'owl' });
  const h = new OS.Game({ id: 0, timeLimit: 60, goal: { money: 1 } }, { rng: () => 0, roster: ['rabbit', 'cat', 'bear', 'hamster', 'penguin', 'sloth'] }); h.start();
  const M = OS.ui.panelLayout(h); assert.strictEqual(M.cards.length, 0); assert.ok(!M.heads.some(x => x.divider)); assert.ok(M.rows[5].y + M.rows[5].h <= 640);
});
test('选关两行 10 张卡片、阵容界面 8 张卡片：不重叠且在画布内；命中检测', () => {
  const app = new OS.App({ intros: false, storage: mem() }), over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 1; i <= 9; i++) app.progress.record(i, 1); app.openLevel(10);
  for (const list of [OS.ui.selectLayout(app), OS.ui.lineupLayout(app), OS.ui.lineupButtons]) {
    list.forEach((a, i) => { assert.ok(a.x >= 0 && a.x + a.w <= 960 && a.y + a.h <= 640); list.slice(i + 1).forEach(b => assert.ok(!over(a, b))); });
  }
  const s = OS.ui.selectLayout(app); assert.strictEqual(OS.ui.hitSelect(app, s[9].x + 5, s[9].y + 5), 10);
  for (let i = 1; i <= 9; i++) app.progress.record(i, 1);
  app.openLevel(10); const l = OS.ui.lineupLayout(app); assert.strictEqual(l.length, 8);
  assert.deepStrictEqual(OS.ui.hitLineup(app, l[7].x + 5, l[7].y + 5), { type: 'char', id: 'owl' });
  assert.deepStrictEqual(OS.ui.hitLineup(app, OS.ui.lineupButtons[1].x + 5, OS.ui.lineupButtons[1].y + 5), { type: 'start' });
  app.openLevel(4); assert.deepStrictEqual(OS.ui.lineupLayout(app).map(c => c.id), ['rabbit', 'cat', 'bear', 'fox', 'hamster']);   // 第 4 关只列出可用的 5 人
});
test('选关/结算命中检测', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), cards = OS.ui.selectLayout(app);
  assert.strictEqual(OS.ui.hitSelect(app, cards[0].x + 5, cards[0].y + 5), 1);
  assert.strictEqual(OS.ui.hitSelect(app, 1, 1), null);
  app.openLevel(1); app.game.money = 9999; app.update(0.25);
  const ids = OS.ui.resultButtons(app).map(b => b.id); assert.deepStrictEqual(ids, ['next', 'retry', 'select']);
  const b = OS.ui.resultButtons(app)[0]; assert.strictEqual(OS.ui.hitResult(app, b.x + 5, b.y + 5), 'next');
});
test('P2c：5 个房间的关卡、拖住老板/打掩护生效中、阵容 12 人、选关 15 关都能绘制且布局不越界', () => {
  const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer(fakeCanvas(), app, {});
  for (let i = 1; i <= 14; i++) app.progress.record(i, 1);
  r.draw(0.016);
  const sel = OS.ui.selectLayout(app); assert.strictEqual(sel.length, 15);
  sel.forEach((a, i) => { assert.ok(a.x >= 0 && a.x + a.w <= 960 && a.y + a.h <= 500); sel.slice(i + 1).forEach(b => assert.ok(!over(a, b))); });
  app.openLevel(14); assert.strictEqual(app.screen, 'lineup'); r.draw(0.016);
  const lu = OS.ui.lineupLayout(app); assert.strictEqual(lu.length, 12);
  lu.forEach((a, i) => { assert.ok(a.x >= 0 && a.x + a.w <= 960 && a.y + a.h < OS.ui.lineupButtons[0].y); lu.slice(i + 1).forEach(b => assert.ok(!over(a, b))); });
  for (const id of app.picks.slice()) app.togglePick(id);
  for (const id of ['fox', 'owl', 'parrot', 'hedgehog', 'raccoon', 'penguin']) assert.ok(app.togglePick(id));
  assert.ok(app.confirmLineup()); const g = app.game;
  assert.deepStrictEqual(g.map.rooms, ['restroom', 'meeting', 'pantry', 'printer', 'rooftop']);
  const L = OS.ui.panelLayout(g); assert.strictEqual(L.cards.length, 4); assert.strictEqual(L.cards[0].h, OS.ui.PANEL.cardHCompact);
  const all = L.cards.concat(L.rows, L.heads);
  all.forEach((a, i) => { assert.ok(a.y + a.h <= 640, 'panel overflow'); all.slice(i + 1).forEach(b => assert.ok(!over(a, b))); });
  assert.deepStrictEqual(OS.ui.recallRooms(g).map(z => z.id), ['restroom', 'pantry', 'rooftop']);
  const z = g.map.zones; assert.strictEqual(OS.ui.hitTest(g, z.printer.x + 10, z.printer.y + 60), null);
  assert.deepStrictEqual(OS.ui.hitTest(g, z.rooftop.x + 10, z.rooftop.y + 60), { type: 'recall', room: 'rooftop' });
  assert.ok(app.castTeam('parrot')); assert.ok(app.castTeam('hedgehog')); r.draw(0.016);   // 开局都在工位上
  assert.ok(g.shield > 0 && g.boss.distracted > 0);
  run(g, 3); r.draw(0.016);
  run(g, 20); r.draw(0.3);
});
test('P3：每个角色 × 每种表情（含头像、道具）与老板都能绘制；房间道具与书桌能绘制', () => {
  const ctx = fakeCanvas().getContext();
  for (const id of Object.keys(OS.characters)) {
    assert.ok(OS.sprites.SPEC[id], '缺少外观参数：' + id);
    for (const mood of ['work', 'slack', 'danger', 'caught', 'walk']) for (const prop of [null, 'coffee', 'phone', 'paper'])
      assert.doesNotThrow(() => OS.sprites.drawAnimal(ctx, id, 100, 100, 1, { mood, prop, t: 1.3 }), id + '/' + mood);
    assert.doesNotThrow(() => OS.sprites.drawAnimal(ctx, id, 50, 50, 0.6, { headOnly: true }));
  }
  assert.doesNotThrow(() => { OS.sprites.drawBoss(ctx, 100, 100, 1, { t: 2 }); OS.sprites.drawBoss(ctx, 100, 100, 1, { mood: 'read' }); });
  const m = OS.makeMap(['restroom', 'meeting', 'pantry', 'printer', 'rooftop']);
  for (const id of m.rooms) assert.doesNotThrow(() => OS.sprites.drawRoomProps(ctx, id, m.zones[id], 3));
  assert.ok(OS.theme.ROOM.printer && OS.theme.ROOM.rooftop);
  const d = OS.sprites.drawDesk(ctx, 100, 100, 1, true); assert.strictEqual(typeof d.front, 'function'); d.front();
});
test('P3：特效层——被抓震屏、召回残影、技能闪光、收入飘字，换关后清空', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer(fakeCanvas(), app, {});
  app.openLevel(1); const g = app.game; r.draw(0.016);
  r.onEvent({ type: 'caught', who: 'rabbit' }); assert.ok(r.shake > 0 && r.rings.length === 1);
  g.get('cat').state = 'returning'; g.get('cat').room = 'pantry'; r.onEvent({ type: 'recall', room: 'pantry', count: 1 }); assert.ok(r.dash.cat > 0);
  r.onEvent({ type: 'team', who: 'fox', kind: 'escort' }); assert.ok(r.flash.fox > 0);
  g.get('bear').earned = 25; r.draw(0.016); assert.ok(r.floats.length >= 1);
  for (let i = 0; i < 80; i++) r.draw(0.016);
  assert.strictEqual(r.shake, 0); assert.ok(!r.dash.cat && !r.flash.fox);
  app.retry(); r.draw(0.016); assert.strictEqual(r.floats.length, 0);
});
test('P3：老板开始预警时产生 warning 事件（音效用）', () => {
  const g = new OS.Game(require('./helper').TEST_LEVEL, { rng: () => 0, autoSolo: false }); g.start(); run(g, 9.25);
  assert.ok(g.drainEvents().some(e => e.type === 'warning' && e.room === 'restroom'));
});
test('P3：音效模块在 Node 中是空操作；HUD 音效按钮、暂停菜单音乐按钮的命中检测', () => {
  require('../src/audio.js');
  assert.strictEqual(OS.audio.available, false);
  assert.deepStrictEqual(OS.audio.musicInfo, { bars: 16, bpm: 92, chords: 4, sfxGain: 1.6, musicGain: 1.12 });
  assert.doesNotThrow(() => { OS.audio.unlock(); OS.audio.play('caught'); OS.audio.play('nope'); OS.audio.setMuted(true); OS.audio.setMusic(true); OS.audio.setMusic(false); });
  const app = new OS.App({ intros: false, storage: mem() }); app.openLevel(1); const g = app.game, sb = OS.ui.soundButton;
  assert.deepStrictEqual(OS.ui.hitTest(g, sb.x + 5, sb.y + 5), { type: 'sound' });
  assert.deepStrictEqual(OS.ui.hitTest(g, sb.x + 5, sb.y + 5, true), { type: 'sound' });
  const mb = OS.ui.pauseButtons.find(b => b.id === 'music'); assert.deepStrictEqual(OS.ui.hitTest(g, mb.x + 5, mb.y + 5, true), { type: 'pausemenu', id: 'music' });
  const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const hud = [OS.ui.soundButton, OS.ui.pauseButton, OS.ui.speedButton, OS.ui.menuButton];
  hud.forEach((a, i) => hud.slice(i + 1).forEach(b => assert.ok(!over(a, b))));
  OS.ui.pauseButtons.forEach((a, i) => { assert.ok(a.y + a.h <= 540); OS.ui.pauseButtons.slice(i + 1).forEach(b => assert.ok(!over(a, b))); });
});

test('界面不再显示角色序号：阵容卡片与特殊技能卡片只写名字', () => {
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer({ getContext: () => ctx }, app, {});
  for (let i = 1; i <= 14; i++) app.progress.record(i, 1);
  app.openLevel(14); texts.length = 0; r.draw(0.016);
  for (const id of OS.lineup.pool(app.level(), app.progress)) {
    const n = OS.characters[id].name; assert.ok(texts.includes(n), '阵容里应只写名字：' + n);
    assert.ok(!texts.some(t => /^\d+ /.test(t) && t.endsWith(n)), '不应带序号：' + n);
  }
  app.confirmLineup(); texts.length = 0; r.draw(0.016);
  for (const e of app.game.employees.filter(e => e.team)) assert.ok(texts.includes(e.name) && !texts.some(t => /^\d+ /.test(t) && t.endsWith(e.name)));
  assert.ok(texts.some(t => /^点我释放！/.test(t)) || app.game.employees.filter(e => e.team).every(e => OS.skills.teamStatus(app.game, e) !== 'ok'));
});
test('本关新内容弹框、暂停菜单"本关说明"、阵容 NEW 标签都能绘制；弹框期间点击只关闭弹框', () => {
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new OS.App({ storage: mem(), rng: () => 0 }), r = new OS.Renderer({ getContext: () => ctx }, app, {});
  r.draw(0.016);                                                                    // 选关（精简版）
  assert.ok(!texts.some(t => /^玩法：/.test(t)), '选关页不再放整段规则');
  app.openLevel(1); texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('欢迎来到一起来摸鱼') && texts.some(t => /开始摸鱼/.test(t)));
  app.closeIntro(); app.pause(); app.showIntro(); texts.length = 0; r.draw(0.016); assert.ok(texts.some(t => /知道了/.test(t)));
  app.closeIntro(); texts.length = 0; r.draw(0.016); assert.ok(texts.some(t => /本关说明/.test(t)));
  for (let i = 1; i <= 10; i++) app.progress.record(i, 1);
  app.openLevel(11); texts.length = 0; r.draw(0.016); assert.ok(texts.includes('NEW'));
  app.confirmLineup(); texts.length = 0; r.draw(0.016);
  assert.ok(texts.some(t => /新同事：鹦鹉/.test(t)) && texts.some(t => /新房间：打印室/.test(t)));
});
test('老板预警读条：预警时绘制；被"拖住/带走"打断后碎片淡出；正常走去查房不碎', () => {
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer(fakeCanvas(), app, {});
  app.openLevel(1); const g = app.game; g.autoSolo = false;
  while (g.boss.state !== 'warning') app.update(1 / 60);
  r.draw(0.016); assert.ok(r.warnBar && r.warnBar.W === 60);
  app.castTeam('fox'); r.draw(0.016); assert.strictEqual(r.shards.length, 6);       // 带走老板 → 预警取消
  for (let i = 0; i < 50; i++) r.draw(0.016); assert.strictEqual(r.shards.length, 0);
  const b = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r2 = new OS.Renderer(fakeCanvas(), b, {}); b.openLevel(1); b.game.autoSolo = false;
  while (b.game.boss.state !== 'going') { b.update(1 / 60); r2.draw(0.016); }
  assert.strictEqual((r2.shards || []).length, 0);
});

test('醒目状态：阵容页已上场画大对勾、未上场变淡；技能可释放时出现“点我释放”大按钮，冷却时显示灰色说明', () => {
  const texts = [], alphas = [], calls = { check: 0 };
  const ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { if (k === 'globalAlpha') alphas.push(v); t[k] = v; return true; } });
  const app = new OS.App({ intros: false, storage: mem(), rng: () => 0 }), r = new OS.Renderer({ getContext: () => ctx }, app, {});
  const orig = r.check.bind(r); r.check = (...a) => { calls.check++; return orig(...a); };
  for (let i = 1; i <= 9; i++) app.progress.record(i, 1);
  app.openLevel(10); r.time = 5; r.draw(0.016);
  assert.strictEqual(calls.check, app.picks.length, '每个已上场的同事一个对勾');
  assert.ok(app.picks.length > 0 && alphas.some(a => a > 0.3 && a < 0.7), '未上场卡片半透明');
  assert.ok(!texts.includes('已上场'), '对勾取代了旧的小标签');
  app.confirmLineup(); texts.length = 0; r.draw(0.016);
  const sp = app.game.employees.filter(e => e.team);
  assert.ok(sp.length > 0);
  assert.ok(texts.some(t => /^点我释放！/.test(t)), '开局特殊技能可释放');
  const e = sp[0]; e.teamCd = 10; texts.length = 0; r.draw(0.016);
  assert.ok(texts.some(t => /^冷却中 10 秒/.test(t)));
});
