// 摸鱼大作战（2.2.0 B2）：随机事件、实时名次、头名悬赏、捣乱补给
const test = require('node:test'), assert = require('node:assert');
const { OS, mulberry32 } = require('./helper');
['arena/config', 'arena/path', 'arena/bossai', 'arena/empai', 'arena/skills', 'arena/supply', 'arena/events', 'arena/match'].forEach(m => require('../src/' + m + '.js'));
const A = OS.arena;
const tick = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) m.update(dt); };
const quiet = o => { const m = new A.Match(Object.assign({ bossWait: 0, rng: mulberry32(41), playerRole: 'employee', playerChar: 'rabbit', playerDesk: 0, bossAI: false, employeeAI: false, noBossSkills: true }, o)); m.supplyT = 1e9; return m; };
function enter(m, a, id) { const c = m.grid.roomCells(id)[0]; assert.ok(m.moveTo(a, c.c + 0.5, c.r + 0.5), '能走去 ' + id); for (let i = 0; i < 1500 && a.room !== id; i++) m.update(1 / 60); assert.strictEqual(a.room, id); }
function bossInto(m, id) { const b = m.boss, c = m.grid.roomCells(id).slice(-1)[0]; assert.ok(m.pathTo(b, c.c + 0.5, c.r + 0.5)); for (let i = 0; i < 2400 && b.room !== id; i++) m.update(1 / 60); assert.strictEqual(b.room, id); }

test('随机事件：第 30、60 … 180 秒各一次，提前 3 秒预告；每次 2~3 条（1 条全体 + 1~2 条个人），全体事件好坏交替；最后 30 秒不再来', () => {
  const m = quiet(), times = [], soon = [];
  for (let i = 0; i < 60 * 240 && m.phase === 'playing'; i++) {
    m.update(1 / 60);
    for (const e of m.drainEvents()) {
      if (e.type === 'eventSoon') soon.push(Math.round(m.time));
      if (e.type === 'event') {
        times.push(Math.round(m.time));
        assert.ok(e.list.length >= 2 && e.list.length <= 3, '每次 2~3 条');
        assert.strictEqual(e.list.filter(x => !x.who).length, 1, '1 条全体');
        assert.strictEqual(e.list[0].good, e.n % 2 === 1, '全体事件好坏交替');
        const per = e.list.filter(x => x.who); assert.strictEqual(new Set(per.map(x => x.who)).size, per.length, '个人事件落在不同的人身上');
        if (per.length === 2) assert.ok(per[0].good !== per[1].good, '两条个人事件一好一坏');
      }
    }
  }
  assert.deepStrictEqual(times, [30, 60, 90, 120, 150, 180]);
  assert.deepStrictEqual(soon, [27, 57, 87, 117, 147, 177]);
});

test('全体事件：下午茶茶水间收入 ×2；打印机卡纸把人请出来并关闭；领导视察老板加速；停电视野缩小；老板接电话定身；发红包走过去就存', () => {
  const m = quiet(), p = m.player, b = m.boss;
  enter(m, p, 'pantry'); tick(m, 1); let p0 = p.pocket; tick(m, 0.5); const g0 = p.pocket - p0;
  m.fireEvents({ global: 'tea', personal: [] }); p0 = p.pocket; tick(m, 0.5); const g1 = p.pocket - p0;
  assert.ok(g1 / g0 > 1.9, '下午茶 ×2：' + (g1 / g0).toFixed(2));
  const m2 = quiet(), q = m2.player; enter(m2, q, 'print'); m2.fireEvents({ global: 'jam', personal: [] });
  assert.ok(q.forced, '被请出来'); tick(m2, 2); assert.strictEqual(q.room, null); assert.strictEqual(m2.entryBlock(q, 'print'), 'closed'); assert.strictEqual(m2.entryBlock(m2.boss, 'print'), 'closed');
  tick(m2, 14); assert.notStrictEqual(m2.entryBlock(q, 'print'), 'closed');
  const m3 = quiet(), b3 = m3.boss; m3.fireEvents({ global: 'inspect', personal: [] }); b3.x = 9.5; b3.y = 10.5; b3.path = [{ x: 25.5, y: 10.5 }]; m3.update(0.1);
  assert.ok(Math.abs(b3.x - 9.5 - A.MOVE.boss * 1.3 * 0.1) < 1e-6, '领导视察：老板 +30%');
  const m4 = quiet(), w0 = A.sightOf(m4.player).w; m4.fireEvents({ global: 'blackout', personal: [] }); m4.update(1 / 60);
  assert.ok(Math.abs(A.sightOf(m4.player).w - w0 * 0.6) < 1e-9 && A.sightOf(m4.boss).w < A.SIGHT.w + 2, '停电：所有人视野缩小'); tick(m4, 8.1); assert.strictEqual(A.sightOf(m4.player).w, w0);
  m.fireEvents({ global: 'call', personal: [] }); assert.ok(b.freezeT >= 5); assert.strictEqual(m.moveTo(b, 12, 10), false);
  const m5 = quiet(), r = m5.player; m5.fireEvents({ global: 'redpack', personal: [] }); assert.strictEqual(m5.bags.length, 3);
  const g = m5.bags[0], bank = r.banked; r.x = g.x; r.y = g.y; m5.update(1 / 60); assert.strictEqual(m5.bags.length, 2); assert.ok(r.banked - bank >= 30, '红包直接存入');
});

test('个人事件：老板夸你 +$40、咖啡因加速、灵感爆发下一次存钱 ×1.5、系统升级锁工位、被点名老板知道你在哪、腿抽筋、电脑死机', () => {
  const m = quiet(), p = m.player, [a, b, c] = m.employees().filter(e => e !== p);
  const bank = a.banked; m.fireEvents({ global: 'tea', personal: ['raise', 'upgrade'], who: [a.id, b.id] });
  assert.ok(Math.abs(a.banked - bank - 40) < 1e-9); assert.strictEqual(m.deskLocked(b), 10);
  m.fireEvents({ global: 'jam', personal: ['coffee', 'cramp'], who: [p.id, c.id] }); assert.strictEqual(p.fastT, 10); assert.strictEqual(c.numbT, 6);
  m.fireEvents({ global: 'call', personal: ['inspire', 'crash'], who: [p.id, a.id] }); assert.strictEqual(p.inspire, 1.5); assert.strictEqual(a.skillCd, 10);
  p.pocket = 100; const s = A.seatOf(p.desk); p.x = s.x; p.y = s.y; m.drainEvents(); m.goDesk(p); tick(m, 0.2);
  const dep = m.drainEvents().find(e => e.type === 'deposit'); assert.ok(dep && Math.abs(dep.amount - 150) < 1e-6, '灵感爆发 ×1.5'); assert.ok(!(p.inspire > 1), '只管一次');
  const m2 = quiet({ bossAI: true, difficulty: 'hard', rng: mulberry32(3) }), q = m2.player; m2.bossAI.t = 99; m2.bossAI.wander = 99; m2.boss.path = [];
  enter(m2, q, 'rooftop'); assert.strictEqual(m2.bossAI.belief[q.id], undefined, '看不见');
  m2.fireEvents({ global: 'tea', personal: ['spotted'], who: [q.id] }); m2.update(1 / 60);
  assert.strictEqual(m2.bossAI.belief[q.id].room, 'rooftop', '被点名：AI 老板知道他在天台');
});

test('实时名次与头名悬赏：存款第一（≥ $50、不并列）戴皇冠；老板抓到他收益再 ×1.25', () => {
  const m = quiet(), p = m.player, E = m.employees();
  assert.strictEqual(m.leader(), null, '大家都没钱时没有悬赏');
  E[1].banked = 120; E[2].banked = 80; p.banked = 60;
  assert.strictEqual(m.leader(), E[1]); assert.strictEqual(m.rankOf(E[1]), 1); assert.strictEqual(m.rankOf(p), 3);
  E[2].banked = 120; assert.strictEqual(m.leader(), null, '并列不算');
  const m2 = quiet(), q = m2.player; q.banked = 200; enter(m2, q, 'pantry'); tick(m2, 4); m2.drainEvents(); bossInto(m2, 'pantry');
  const ev = m2.drainEvents().find(e => e.type === 'caught'); assert.ok(ev.bounty); assert.ok(Math.abs(ev.mult - A.BOUNTY.mult) < 1e-9);
  assert.ok(Math.abs(m2.boss.stats.score - ev.lost * A.BOUNTY.mult) < 1e-6);
});

test('捣乱补给：捡到放进道具格；工位封条锁存款最多的对手；香蕉皮让踩到的人滑倒 2 秒；假消息让 AI 赶紧出门；抢功劳分走下一笔存款的 20%', () => {
  const m = quiet(), p = m.player, [a, b, c] = m.employees().filter(e => e !== p);
  m.applySupply(p, 'seal'); assert.strictEqual(p.item, 'seal'); assert.strictEqual(p.pocket, 0);
  a.banked = 50; b.banked = 300; assert.ok(m.useItem(p)); assert.strictEqual(m.deskLocked(b), 8); assert.strictEqual(p.item, null);
  m.applySupply(p, 'banana'); p.x = 10.5; p.y = 10.5; assert.ok(m.useItem(p)); assert.strictEqual(m.bananas.length, 1);
  c.x = 10.5; c.y = 10.4; m.update(1 / 60); assert.strictEqual(c.slipT > 1.9, true, '踩到滑倒'); assert.strictEqual(m.moveTo(c, 12, 12), false, '滑倒时动不了'); assert.strictEqual(m.bananas.length, 0);
  tick(m, 2.1); assert.ok(!(c.slipT > 0));
  const m2 = quiet(), q = m2.player, ai = m2.employees().find(e => e !== q);   // 对手不是玩家：信以为真
  enter(m2, ai, 'pantry'); tick(m2, 4.2); m2.applySupply(q, 'fake'); assert.ok(m2.useItem(q)); assert.ok(ai.path.length > 0 || !ai.room, 'AI 信以为真出门');
  const m3 = quiet(), r = m3.player, v = m3.employees()[1]; m3.applySupply(r, 'steal'); m3.useItem(r);
  v.pocket = 100; const s = A.seatOf(v.desk); v.x = s.x; v.y = s.y; const rb = r.banked; m3.goDesk(v); tick(m3, 0.2);
  assert.ok(Math.abs(r.banked - rb - 20) < 0.5, '分走 20%'); assert.ok(m3.drainEvents().some(e => e.type === 'stolen')); assert.strictEqual(m3.stealBy, null);
  const m4 = quiet(), t = m4.player; m4.applySupply(t, 'banana'); enter(m4, t, 'pantry'); assert.strictEqual(m4.useItem(t), false, '香蕉皮只能丢在办公区');
});

test('画面：事件大卡片、事件标签、红包、香蕉皮、皇冠、名次、道具格都能绘制', () => {
  ['render/theme', 'render/sprites', 'arena/app', 'arena/render'].forEach(m => require('../src/' + m + '.js'));
  const texts = [], ctx = new Proxy({ measureText: t => ({ width: String(t).length * 8 }), fillText: t => texts.push(String(t)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const app = new A.App({ prep: 0, rng: mulberry32(5), matchOpts: { bossWait: 0, playerRole: 'employee', playerChar: 'cat', playerDesk: 0, bossAI: false, employeeAI: false } }), r = new A.Renderer({ width: 540, height: 960, getContext: () => ctx }, app);
  const m = app.start(), p = m.player; m.supplyT = 1e9; p.banked = 200; p.item = 'banana';
  const list = m.fireEvents({ global: 'redpack', personal: ['raise'], who: [p.id] }); r.showEvents(list); m.bananas.push({ x: p.x + 1, y: p.y, by: 'x', t: 30, age: 5 });
  texts.length = 0; r.draw(0.016);
  assert.ok(texts.includes('全体') && texts.includes('你') && texts.some(t => /^发红包：/.test(t)) && texts.some(t => /^老板夸你：/.test(t)), '事件卡片');
  assert.ok(texts.includes('悬赏中 · 第 1 名'), '名次 + 悬赏'); assert.ok(texts.includes('$30'), '红包'); assert.ok(texts.includes('蕉') && texts.includes('香蕉'), '道具格');
  m.fireEvents({ global: 'tea', personal: [] }); m.eventT = 2; m.eventPreviewed = true; texts.length = 0; r.draw(0.016);
  assert.ok(texts.some(t => /^下午茶 \d+s$/.test(t)) && texts.some(t => /^随机事件 \d…$/.test(t)), '顶部事件标签');
});

test('背景音乐（2.3.1）：摸鱼大作战换成原创的「泡泡糖跳跳」（152 BPM、8 小节循环），闯关模式的音乐不变', () => {
  require('../src/audio.js');
  assert.strictEqual(typeof OS.audio.setSong, 'function');
  assert.deepStrictEqual(OS.audio.arenaInfo, { bpm: 152, bars: 8, name: '泡泡糖跳跳' });
  assert.strictEqual(OS.audio.musicInfo.bpm, 92, '闯关模式还是原来的曲子');
  OS.audio.setSong('arena'); OS.audio.setTempo(1.2); OS.audio.setTempo(1); OS.audio.setSong('default');   // Node 里没有 WebAudio：都是空操作，不报错
});

test('老板也能捡红包（2.5.0）：算进老板收益；AI 老板看到红包会去抢', () => {
  const m = quiet(), b = m.boss; m.fireEvents({ global: 'redpack', personal: [] });
  const g = m.bags[0], s0 = b.stats.score; b.x = g.x; b.y = g.y; b.path = []; m.drainEvents(); m.update(1 / 60);
  assert.strictEqual(m.bags.length, 2); assert.ok(Math.abs(b.stats.score - s0 - 30) < 1e-9); assert.ok(m.drainEvents().some(e => e.type === 'bag' && e.who === 'boss'));
  const m2 = quiet({ bossAI: true, difficulty: 'normal' }), b2 = m2.boss; m2.fireEvents({ global: 'redpack', personal: [] });
  const near = m2.bags[0]; b2.x = near.x + 2; b2.y = near.y; b2.path = []; m2.bossAI.mode = 'idle'; m2.bossAI.t = 99;
  tick(m2, 3); assert.ok(m2.bags.length < 3 || b2.stats.bags > 0, 'AI 老板去抢了');
});
