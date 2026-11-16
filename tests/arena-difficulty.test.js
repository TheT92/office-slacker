// 摸鱼大作战（A6）：AI 老板难度、只用看得到的信息、难度设置、平衡模拟工具
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/match', 'arena/app'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
// 有 AI 老板、没有 AI 员工（员工由测试手动操作），老板直接在办公区
function mk(difficulty, o) {
  const m = new A.Match(Object.assign({ rng: mulberry32(13), playerRole: 'employee', playerChar: 'rabbit', playerDesk: 0, employeeAI: false, bossWait: 0, difficulty, noBossSkills: true }, o));
  m.supplyT = 1e9; m.boss.x = A.BOSS_ARRIVE.x; m.boss.y = A.BOSS_ARRIVE.y; return m;
}
function walkIn(m, e, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(e, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 1500 && e.room !== id; i++) m.update(1 / 60); assert.strictEqual(e.room, id); }

test('三档难度都有，默认普通；Match 把难度交给 AI 老板', () => {
  assert.deepStrictEqual(A.DIFFICULTY_IDS, ['easy', 'normal', 'hard']);
  assert.strictEqual(mk().bossAI.level, 'normal'); assert.strictEqual(mk('hard').bossAI.level, 'hard');
  assert.strictEqual(A.DIFFICULTY.easy.track, false); assert.ok(A.DIFFICULTY.hard.smart > A.DIFFICULTY.normal.smart && A.DIFFICULTY.normal.wrong > A.DIFFICULTY.hard.wrong);
});

test('普通 / 困难：老板在办公区看到员工走进哪扇门就记下来；简单不记', () => {
  for (const d of ['normal', 'hard']) {
    const m = mk(d, { rng: mulberry32(2) }), p = m.player; m.bossAI.d = Object.assign({}, m.bossAI.d, { wrong: 0 });
    m.boss.path = []; m.bossAI.t = 99; walkIn(m, p, 'pantry'); tick(m, 0.1);
    assert.strictEqual(m.bossAI.belief[p.id].room, 'pantry', d);
    tick(m, 4); m.exitRoom(p); tick(m, 6); assert.strictEqual(m.bossAI.belief[p.id], undefined, d + '：出来了就清掉');
  }
  const e = mk('easy'), q = e.player; e.bossAI.t = 99; walkIn(e, q, 'pantry'); tick(e, 0.1); assert.deepStrictEqual(e.bossAI.belief, {});
});

test('老板在房间里看不到外面：这时候进房间的人不知道去了哪（room = null）', () => {
  const m = mk('hard'), p = m.player, b = m.boss, ai = m.bossAI; ai.t = 99;
  const c = m.grid.roomCells('rooftop').slice(-1)[0]; m.pathTo(b, c.c + 0.5, c.r + 0.5); ai.mode = 'go'; ai.target = 'rooftop';
  for (let i = 0; i < 2400 && b.room !== 'rooftop'; i++) m.update(1 / 60); assert.strictEqual(b.room, 'rooftop');
  walkIn(m, p, 'restroom'); assert.strictEqual(ai.belief[p.id], undefined, '在房间里看不到');
  for (let i = 0; i < 1200 && b.room; i++) m.update(1 / 60); tick(m, 0.2);
  assert.ok(ai.belief[p.id] && ai.belief[p.id].room === null, '出来后发现人不见了，但不知道去了哪');
});

test('猫的替身骗过 AI 老板：放了替身再进房间，老板以为猫还在工位', () => {
  const m = mk('hard', { playerChar: 'cat' }), p = m.player; m.bossAI.t = 99;
  assert.ok(m.useEmpSkill(p)); walkIn(m, p, 'pantry'); tick(m, 0.2);
  assert.strictEqual(m.bossAI.belief[p.id], undefined);
});

test('困难：优先查推算出有人的房间（不读房间里的真实人数）', () => {
  let hits = 0;
  for (let s = 1; s <= 12; s++) {
    const m = mk('hard', { rng: mulberry32(s) }), p = m.player, ai = m.bossAI; ai.t = 99;
    walkIn(m, p, 'rooftop'); tick(m, 6); ai.t = 0; ai.mode = 'idle';
    let target = null; for (let i = 0; i < 600 && !target; i++) { m.update(1 / 60); if (ai.mode === 'go') target = ai.target; }
    if (target === 'rooftop') hits++;
  }
  assert.ok(hits >= 11, '困难几乎每次都去推算的房间：' + hits + '/12');
  // 推算错了（偷偷换了房间）也照样去推算的那间——说明它没有读真实人数
  const m = mk('hard'), p = m.player, ai = m.bossAI; ai.t = 99; walkIn(m, p, 'rooftop'); tick(m, 0.1);
  ai.belief[p.id] = { room: 'restroom', since: m.time - 10 }; ai.t = 0; let tgt = null;
  for (let i = 0; i < 600 && !tgt; i++) { m.update(1 / 60); if (ai.mode === 'go') tgt = ai.target; }
  assert.strictEqual(tgt, 'restroom');
});

test('查完一个房间，那间的推算清零（抓到的人出来了 / 没人说明记错了）', () => {
  const m = mk('hard'), ai = m.bossAI; ai.belief = { cat: { room: 'pantry', since: 0 }, bear: { room: 'restroom', since: 0 } };
  ai.checked('pantry'); assert.deepStrictEqual(Object.keys(ai.belief), ['bear']);
  const s = ai.scores(); assert.ok(s.restroom > s.pantry && s.restroom > s.rooftop);
});

test('难度设置：标题页选的难度会记住，开局交给 AI 老板', () => {
  const d = {}, st = { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } };
  const app = new A.App({ storage: st, prep: 0 }); assert.strictEqual(app.difficulty, 'normal');
  assert.ok(app.setDifficulty('hard')); assert.strictEqual(app.setDifficulty('crazy'), false);
  const app2 = new A.App({ storage: st, prep: 0, matchOpts: { playerRole: 'employee' } }); assert.strictEqual(app2.difficulty, 'hard');
  assert.strictEqual(app2.start().bossAI.level, 'hard');
  assert.strictEqual(JSON.parse(d['office-slacker:progress:v1']).settings.arenaDifficulty, 'hard');
});

test('平衡模拟工具能跑，输出各项指标', () => {
  const out = require('child_process').execFileSync(process.execPath, [require('path').join(__dirname, '../tools/arena-sim.js'), '3', '--difficulty=easy', '--json']).toString();
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.strictEqual(r.games, 3); assert.ok(/%$/.test(r.bossFirst)); assert.ok(r.personality && r.roomShare && r.awards);
});
