const test = require('node:test'), assert = require('node:assert');
const { OS, newGame, TEST_LEVEL } = require('./helper');
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
function won(caught, level) { const g = level ? new OS.Game(level, { rng: () => 0 }) : newGame(); g.start(); g.phase = 'win'; g.caught = caught; return g; }

test('普通关星级（4 人）：0 次 3 星；≤3 次 2 星；更多 1 星；未通关 0 星', () => {
  assert.strictEqual(OS.calcStars(won(0)), 3);
  assert.strictEqual(OS.calcStars(won(1)), 2);
  assert.strictEqual(OS.calcStars(won(3)), 2);
  assert.strictEqual(OS.calcStars(won(4)), 1);
  assert.strictEqual(OS.calcStars(won(30)), 1);
  const g = newGame(); assert.strictEqual(OS.calcStars(g), 0);
});
test('2 星容忍次数随人数浮动：max(3, round(人数×0.75))', () => {
  const fake = n => ({ maxCaught: null, level: {}, bal: OS.balance, employees: new Array(n) });
  assert.deepStrictEqual([1, 4, 6, 8, 12].map(n => OS.twoStarLimit(fake(n))), [3, 3, 5, 6, 9]);
  assert.strictEqual(OS.twoStarLimit({ maxCaught: null, level: { twoStarCaught: 1 }, bal: OS.balance, employees: [] }), 1);
});
test('考核关星级：0 次 3 星；≤上限−1 为 2 星；=上限 1 星', () => {
  const L = Object.assign({}, TEST_LEVEL, { maxCaught: 3 });
  assert.deepStrictEqual([0, 1, 2, 3].map(c => OS.calcStars(won(c, L))), [3, 2, 2, 1]);
});
test('HUD 用的实时星级 starsForCaught 与结算一致', () => {
  const g = newGame(); g.caught = 2; assert.strictEqual(OS.starsForCaught(g), 2); g.phase = 'win'; assert.strictEqual(OS.calcStars(g), 2);
});
test('解锁规则：第1关默认解锁，其后需上一关≥1星', () => {
  const p = new OS.Progress(mem()), L = OS.levels;
  assert.ok(p.isUnlocked(1, L)); assert.ok(!p.isUnlocked(2, L));
  p.record(1, 1); assert.ok(p.isUnlocked(2, L)); assert.ok(!p.isUnlocked(3, L));
});
test('星数只升不降，并持久化到存储', () => {
  const s = mem(), p = new OS.Progress(s);
  assert.ok(p.record(1, 2)); assert.ok(!p.record(1, 1)); assert.strictEqual(p.stars(1), 2);
  assert.strictEqual(new OS.Progress(s).stars(1), 2);
});
test('设置（倍速/阵容）持久化；旧版存档里的 auto/manual 被丢弃；只有 stars 的存档也能读', () => {
  const s = mem(), p = new OS.Progress(s);
  p.setSetting('speed', 1.5); p.setSetting('lineup', ['cat']);
  assert.deepStrictEqual(new OS.Progress(s).settings, { speed: 1.5, lineup: ['cat'], mute: false, bgm: true });
  const v4 = mem(); v4.setItem('office-slacker:progress:v1', JSON.stringify({ stars: { 1: 2 }, settings: { auto: true, speed: 2, manual: { fox: true }, lineup: ['fox'] } }));
  assert.deepStrictEqual(new OS.Progress(v4).settings, { speed: 2, lineup: ['fox'], mute: false, bgm: true });
  const old = mem(); old.setItem('office-slacker:progress:v1', JSON.stringify({ stars: { 1: 2 } }));
  const q = new OS.Progress(old); assert.strictEqual(q.stars(1), 2); assert.deepStrictEqual(q.settings, { speed: 1, lineup: [], mute: false, bgm: true });
});
test('存储损坏或不可用：不抛异常，退化为内存进度', () => {
  const bad = { getItem: () => '{坏数据', setItem: () => { throw new Error('quota'); } };
  const p = new OS.Progress(bad); assert.strictEqual(p.stars(1), 0);
  assert.doesNotThrow(() => p.record(1, 3)); assert.strictEqual(p.stars(1), 3);
  assert.doesNotThrow(() => new OS.Progress(null).record(1, 1));
});
test('reset 清空进度与设置', () => {
  const s = mem(), p = new OS.Progress(s); p.record(1, 3); p.setSetting('speed', 2); p.reset();
  const q = new OS.Progress(s); assert.strictEqual(q.stars(1), 0); assert.strictEqual(q.settings.speed, 1);
});

test('声音设置：背景音乐默认开；静音与背景音乐开关并持久化', () => {
  const s = mem(), app = new OS.App({ intros: false, storage: s });
  assert.strictEqual(app.settings.mute, false); assert.strictEqual(app.settings.bgm, true);          // 背景音乐默认开
  assert.strictEqual(app.toggleMute(), true); assert.strictEqual(app.toggleMusic(), false);
  const b = new OS.App({ intros: false, storage: s }); assert.strictEqual(b.settings.mute, true); assert.strictEqual(b.settings.bgm, false);
  const old = mem(); old.setItem('office-slacker:progress:v1', JSON.stringify({ stars: {}, settings: { music: false } }));
  assert.strictEqual(new OS.App({ intros: false, storage: old }).settings.bgm, true);                               // 旧版的 music:false 不再继承
});
