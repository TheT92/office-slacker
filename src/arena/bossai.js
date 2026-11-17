// 摸鱼大作战：AI 老板。三档难度（A.DIFFICULTY）：
// - 简单：查房完全随机，不看任何人（只在"现在能查"的房间里均匀随机挑）。
// - 普通 / 困难：只用真人老板也看得到的信息——站在办公区时只看得到自己视野（A.SIGHT）里的人，
//   亲眼看到谁走进了哪扇门就记下"谁进了哪间、进去多久了"，优先查"人多、待得久"的房间；
//   视野外的事一概不知；平时多在门附近转悠（看得到门）；自己在房间里时看不到外面，记录不更新；
//   （2.2.0 起猫不再有替身。）普通会记错一部分、偶尔随便挑；困难记得准、出手快、技能用得准。
// 老板看不见房间里面：除了"监控"技能，从不读取房间里的真实人数。只通过和玩家相同的指令操作老板。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // wrong：记错房间的概率；smart：按推算挑房间（否则随便挑）的概率；revisit：看到有人跟进刚查完的房间时放回马枪的概率
  A.DIFFICULTY = {
    // calmP：怒气见底又没把握时先缓一缓的概率（2.2.0 取消冒犯值后改用怒气）；patrol：转悠时去"盯门位"的概率
    // 2.0.0 用 tools/arena-sim.js 各跑 400 局调出；2.1.0 竖屏大地图 + 视野限制后重调 patrol / 困难的 calm（见 docs/DESIGN.md 平衡总表）
    easy:   { name: '简单', track: false, idle: [3.5, 7], wrong: 0, smart: 0, revisit: 0.35, calmP: 0 },
    normal: { name: '普通', track: true, idle: [1.1, 2.8], wrong: 0.15, smart: 0.9, revisit: 0.6, calmP: 0.5, patrol: 0.6 },
    hard:   { name: '困难', track: true, idle: [0.3, 1], wrong: 0, smart: 1, revisit: 0.95, calmP: 0.8, patrol: 0.8 },
  };
  A.DIFFICULTY_IDS = ['easy', 'normal', 'hard'];

  class BossAI {
    constructor(match, rng, difficulty) {
      this.m = match; this.rng = rng || match.rng; this.d = A.DIFFICULTY[difficulty] || A.DIFFICULTY.normal; this.level = difficulty || 'normal';
      this.mode = 'idle'; this.t = this.idleTime(); this.target = null; this.wander = 0;
      this.seen = {};     // 上次看到时每个员工在不在办公区
      this.belief = {};   // 员工 id → { room（null = 不知道去了哪）, since }
    }
    rnd() { return this.rng(); }
    idleTime() { const r = this.d.idle; return r[0] + this.rnd() * (r[1] - r[0]); }
    // 盯门的位置：站在这里视野里能同时看到两扇摸鱼房间的门，而且离门不太近（员工不会被吓跑）
    watchSpots() {
      const g = this.m.grid; if (g.watchSpots) return g.watchSpots;
      const doors = A.SLACK_ROOMS.map(id => g.outside(id));
      g.watchSpots = g.cells.filter(k => !k.wall && !k.room && !k.door).filter(k => { const p = { x: k.c + 0.5, y: k.r + 0.5 };
        return doors.filter(o => Math.abs(o.x - p.x) <= A.SIGHT.w / 2 && Math.abs(o.y - p.y) <= A.SIGHT.h / 2 && Math.hypot(o.x - p.x, o.y - p.y) >= 5.5).length >= 2; });
      return g.watchSpots;
    }
    // 转悠的落脚点：会记门的老板常去"盯门位"（一眼看两扇门），否则办公区里随便走
    officePoint() {
      const g = this.m.grid, b = this.m.boss, list = g.cells.filter(k => !k.wall && !k.room && !k.door);
      if (this.d.track && this.rnd() < (this.d.patrol || 0)) {
        const spots = this.watchSpots();
        for (let i = 0; i < 8 && spots.length; i++) { const k = spots[Math.floor(this.rnd() * spots.length)]; if (this.m.canPass(b, k)) return { x: k.c + 0.5, y: k.r + 0.5 }; }
      }
      for (let i = 0; i < 12; i++) { const k = list[Math.floor(this.rnd() * list.length)]; if (this.m.canPass(b, k)) return { x: k.c + 0.5, y: k.r + 0.5 }; }
      return null;
    }
    can(id) { const b = this.m.boss, S = A.BOSS_SKILLS[id]; return b.skills.includes(id) && !(b.skillCd[id] > 0) && b.anger >= S.cost; }
    // 老板现在能不能看到办公区（在房间里 / 开局在办公室里看不到）
    canWatch() { const b = this.m.boss; return !b.room && !(b.waitT > 0); }
    // 在老板眼里，这个员工是不是"在办公区、而且在我视野里"（厕所里的人算不在）
    visible(e) { const b = this.m.boss; return !e.room && A.inSight(b, e.x, e.y); }
    // 观察：只在看得到办公区时更新，而且只看得到视野里的人；监控期间还看得到门口附近房间里的人
    observe() {
      const m = this.m; if (!this.d.track || !this.canWatch()) return;
      for (const r of m.peekRooms()) for (const e of m.employees()) if (e.room === r && (!this.belief[e.id] || this.belief[e.id].room !== r)) this.belief[e.id] = { room: r, since: m.time - 4 };
      for (const e of m.employees()) {
        const vis = this.visible(e), was = this.seen[e.id];
        if (vis) delete this.belief[e.id];
        else if (was === true && e.room && A.ROOMS[e.room].slack) {   // 上一刻还看得到，这一刻进了摸鱼房间的门 = 亲眼看到走进哪扇门（进厕所的不用管）
          let room = e.room;
          if (this.rnd() < this.d.wrong) { const others = A.SLACK_ROOMS.filter(r => r !== room); room = others[Math.floor(this.rnd() * others.length)]; }   // 看错了
          this.belief[e.id] = { room, since: m.time };
        }   // 走出视野 = 不知道去了哪，什么也不记
        this.seen[e.id] = vis;
        if (e.spottedT > 0 && e.room && A.ROOMS[e.room].slack) this.belief[e.id] = { room: e.room, since: (this.belief[e.id] && this.belief[e.id].room === e.room) ? this.belief[e.id].since : m.time - 6 };   // 随机事件：被点名
      }
    }
    // 从房间里出来后：之前看到的状态作废（这段时间看不到）
    blind() { for (const id in this.seen) this.seen[id] = false; }
    // 推算每个房间值多少：确定进去的人按待的时间加分（口袋越鼓越值），不知道去哪的平摊
    scores() {
      const m = this.m, s = {}; A.SLACK_ROOMS.forEach(r => (s[r] = 0.05));
      for (const id in this.belief) {
        const B = this.belief[id], w = (0.4 + Math.min(1, (m.time - B.since) / 12)) * (m.leader() && m.leader().id === id ? A.BOUNTY.mult : 1);   // 头名悬赏更值钱
        if (B.room) s[B.room] += w; else A.SLACK_ROOMS.forEach(r => (s[r] += w / A.SLACK_ROOMS.length));
      }
      return s;
    }
    // 查完一个房间：那间房的推算清零（抓到的人出来了；没人说明记错了）
    checked(room) { for (const id in this.belief) if (this.belief[id].room === room) delete this.belief[id]; }
    pick(open) {
      if (!this.d.track || this.rnd() >= this.d.smart) return open[Math.floor(this.rnd() * open.length)];
      const s = this.scores(); let best = open[0];
      for (const r of open) if (s[r] > s[best] + 1e-9 || (Math.abs(s[r] - s[best]) < 1e-9 && this.rnd() < 0.5)) best = r;
      return best;
    }
    think(dt) {
      const m = this.m, b = m.boss;
      if (m.phase !== 'playing') return;
      if (b.room || b.waitT > 0) { if (!this.wasBlind) { this.wasBlind = true; } } else if (this.wasBlind) { this.wasBlind = false; this.blind(); }
      this.observe();
      if (b.freezeT > 0 || b.waitT > 0) return;   // 开局还没到 / 开会定身
      if (this.mode === 'idle') {
        this.t -= dt; this.wander -= dt;
        const bag = (m.bags || []).filter(g => A.inSight(b, g.x, g.y)).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
        if (bag && this.bagT !== m.time) { m.pathTo(b, bag.x, bag.y); this.wander = 1.5; this.bagT = m.time; }   // 2.5.0：老板也抢红包
        else if (!b.path.length && this.wander <= 0) { const p = this.officePoint(); if (p) m.pathTo(b, p.x, p.y); this.wander = 1 + this.rnd() * 2; }
        const s = this.d.track ? this.scores() : null, hot = s && Math.max(...A.SLACK_ROOMS.map(r => s[r])) >= 1.2;
        if (this.t > 0 && !(hot && this.level === 'hard')) return;   // 困难：看准了就立刻出手
        if (this.d.calmP && b.anger < A.BOSS.emptyAnger + 5 && !hot && this.rnd() < this.d.calmP) { this.t = 1.5 + this.rnd() * 2; return; }   // 怒气见底、心里没底：先缓缓，查空会再扣怒气
        const missing = Object.keys(this.belief).length + (this.d.track ? m.employees().filter(e => !this.visible(e)).length * 0.5 : 0);   // 看不见的人可能在摸鱼
        if (this.can('meeting') && (this.d.track ? missing >= 2 && this.rnd() < 0.5 : this.rnd() < 0.2) && m.useBossSkill('meeting')) { this.t = 1; return; }
        let open = A.SLACK_ROOMS.filter(id => !m.entryBlock(b, id));
        if (s && this.can('raid')) {   // 最值钱的房间在冷却中：突击检查
          const best = A.SLACK_ROOMS.reduce((x, y) => (s[y] > s[x] ? y : x));
          if (!open.includes(best) && s[best] >= 1.2 && m.useBossSkill('raid')) open = A.SLACK_ROOMS.filter(id => !m.entryBlock(b, id));
        }
        if (!open.length && this.can('raid') && m.useBossSkill('raid')) open = A.SLACK_ROOMS.filter(id => !m.entryBlock(b, id));
        if (!open.length) { this.t = 1; return; }
        // 2.5.0 监控：拿不准时开监控再出发，走到门口看一眼，没人就不进（见 go 模式）
        if (this.can('peek') && (this.d.track ? (!s || Math.max(...open.map(r => s[r])) < 0.8) : this.rnd() < 0.6)) m.useBossSkill('peek');
        this.target = this.pick(open);
        const sc = s ? s[this.target] : 0;
        if (this.can('fine') && (this.d.track ? sc >= 1.5 : b.anger >= 70)) m.useBossSkill('fine');
        const cells = m.grid.roomCells(this.target), k = cells[Math.floor(this.rnd() * cells.length)];
        if (m.pathTo(b, k.c + 0.5, k.r + 0.5)) { this.mode = 'go'; if (this.can('dash') && b.path.length > 2 && this.rnd() < (this.d.track ? 0.8 : 0.5)) m.useBossSkill('dash'); } else this.t = 1;
        return;
      }
      if (this.mode === 'go') {
        if (b.room === this.target) { this.checked(this.target); this.mode = 'inspect'; return; }
        if (b.peek && m.peekRooms().includes(this.target) && !m.employees().some(e => e.room === this.target)) {   // 监控看到里面没人：不进去白跑，换一间
          this.checked(this.target); b.path = []; this.mode = 'idle'; this.t = 0.2; return;
        }
        if (m.locks[this.target]) { b.path = []; this.mode = 'idle'; this.t = 0.5; return; }   // 门被锁了，换一个
        if (!b.path.length) { this.mode = 'idle'; this.t = 0.5; }
        return;
      }
      if (this.mode === 'inspect') {
        if (b.stay > 0) return;
        const o = m.grid.outside(b.room); m.pathTo(b, o.x, o.y); this.mode = 'leave'; return;
      }
      if (this.mode === 'leave') {
        if (!b.room) { this.mode = 'idle'; this.t = this.idleTime(); this.wander = 0; this.leftAt = m.time; }
        else if (!b.path.length) { const o = m.grid.outside(b.room); m.pathTo(b, o.x, o.y); }
        return;
      }
    }
    // 回马枪：离开房间后看到有人跟进去（简单难度：随机）
    tryRevisit() {
      const m = this.m, b = m.boss, L = b.lastLeft; if (!L || !this.can('revisit') || m.time - L.t > A.BOSS_SKILLS.revisit.window) return false;
      if (!this.d.track) return false;
      const follower = Object.values(this.belief).some(B => B.room === L.room && B.since >= L.t);
      if (!follower || this.rnd() >= this.d.revisit) return false;
      if (m.useBossSkill('revisit')) { this.target = L.room; this.mode = 'go'; return true; }
      return false;
    }
  }
  // 每帧在 idle 时检查回马枪（放在原型上，方便测试单独调用）
  const think0 = BossAI.prototype.think;
  BossAI.prototype.think = function (dt) {
    think0.call(this, dt);
    if (this.mode === 'idle' && this.m.phase === 'playing' && !(this.m.boss.waitT > 0)) {
      if (this.d.track) this.tryRevisit();
      else if (this.leftAt != null && this.m.time - this.leftAt < 0.05 && this.rnd() < 0.35) { if (this.can('revisit') && this.m.useBossSkill('revisit')) { this.target = this.m.boss.lastLeft.room; this.mode = 'go'; } }
    }
  };
  A.BossAI = BossAI;
})(typeof window !== 'undefined' ? window : globalThis);
