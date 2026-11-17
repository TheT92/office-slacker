// 摸鱼大作战（2.2.0 B2）：全场随机事件。每 30 秒一次（第 30、60 … 180 秒，最后 30 秒下班冲刺时不再触发），
// 触发前 3 秒预告；每次同时发生 2~3 条：1 条全体事件 + 1~2 条落在随机员工身上的个人事件，有奖有罚。
// 纯逻辑，挂到 Match.prototype 上（Node 可测）。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  A.EVENTS = { first: 30, every: 30, preview: 3, quietLast: 30 };
  // 全体事件（good = 对员工有利）
  A.EVENT_GLOBAL = {
    tea:      { name: '下午茶', good: true, dur: 15, desc: '茶水间收入 ×2' },
    sunset:   { name: '天台晚霞', good: true, dur: 15, desc: '天台收入 ×2' },
    redpack:  { name: '发红包', good: true, desc: '办公区掉了 3 个红包，先到先得（每个 +$30，老板也会抢）', count: 3, cash: 30 },
    call:     { name: '老板接电话', good: true, dur: 5, desc: '老板原地打电话 5 秒，动不了' },
    jam:      { name: '打印机卡纸', good: false, dur: 15, desc: '打印室关闭 15 秒，里面的人被请出来' },
    inspect:  { name: '领导视察', good: false, dur: 10, desc: '老板移动 +30%（10 秒）' },
    blackout: { name: '停电', good: false, dur: 8, desc: '所有人视野缩小（8 秒）', sight: 0.6 },
  };
  // 个人事件：随机落在某个员工身上
  A.EVENT_PERSONAL = {
    raise:   { name: '老板夸你', good: true, desc: '存款 +$40', cash: 40 },
    coffee:  { name: '咖啡因', good: true, dur: 10, desc: '移动 +30%（10 秒）', mult: 1.3 },
    inspire: { name: '灵感爆发', good: true, desc: '下一次存钱 ×1.5', mult: 1.5 },
    upgrade: { name: '系统升级', good: false, dur: 10, desc: '工位锁住 10 秒，存不了钱' },
    spotted: { name: '被点名', good: false, dur: 6, desc: '老板 6 秒内知道你在哪' },
    cramp:   { name: '腿抽筋', good: false, dur: 6, desc: '移动 −40%（6 秒）' },
    crash:   { name: '电脑死机', good: false, desc: '技能冷却 +10 秒', cd: 10 },
  };
  const ids = o => Object.keys(o);

  const P = {
    initEvents() {
      this.eventT = A.EVENTS.first; this.eventN = 0; this.eventPreviewed = false;
      this.activeEvents = []; this.roomBoost = {}; this.closed = {}; this.bags = []; this.bossBoostT = 0;
      this.usedGlobal = [];
    },
    updateEvents(dt) {
      for (const k in this.roomBoost) { this.roomBoost[k] -= dt; if (this.roomBoost[k] <= 0) delete this.roomBoost[k]; }
      for (const k in this.closed) { this.closed[k] -= dt; if (this.closed[k] <= 0) { delete this.closed[k]; this.emit({ type: 'reopen', room: k }); } }
      this.bossBoostT = Math.max(0, this.bossBoostT - dt);
      this.activeEvents = this.activeEvents.filter(e => (e.t -= dt) > 0);
      const blackout = this.activeEvents.some(e => e.id === 'blackout');
      for (const a of this.actors) {
        a.sightMult = blackout ? A.EVENT_GLOBAL.blackout.sight : 1;
        if (a.kind === 'employee') { a.fastT = Math.max(0, (a.fastT || 0) - dt); a.spottedT = Math.max(0, (a.spottedT || 0) - dt); }
      }
      // 红包：员工走过去就捡（直接存入）；2.5.0 起老板也能捡（算进老板收益）
      for (const g of this.bags.slice()) {
        const b = this.boss, bossHere = !b.room && !(b.waitT > 0) && Math.hypot(b.x - g.x, b.y - g.y) < 0.7;
        const e = bossHere ? b : this.employees().find(e => !e.room && Math.hypot(e.x - g.x, e.y - g.y) < 0.7);
        if (!e) continue;
        this.bags = this.bags.filter(x => x !== g);
        if (e === b) { b.stats.score += g.cash; b.stats.bags = (b.stats.bags || 0) + 1; } else e.banked += g.cash;
        this.emit({ type: 'bag', who: e.id, cash: g.cash });
      }
      if (this.left - Math.max(0, this.eventT) <= A.EVENTS.quietLast + 0.5) return;   // 下一次会落在下班冲刺里：不再来事件（也不预告）
      this.eventT -= dt;
      if (!this.eventPreviewed && this.eventT <= A.EVENTS.preview) { this.eventPreviewed = true; this.emit({ type: 'eventSoon', t: Math.max(0, this.eventT) }); }
      if (this.eventT <= 0) { this.eventT += A.EVENTS.every; this.eventPreviewed = false; this.fireEvents(); }
    },
    // 触发一轮：1 条全体 + 1~2 条个人；全体事件好坏交替，同一局尽量不重复；两条个人事件一好一坏
    fireEvents(force) {
      const rng = this.rng, pick = arr => arr[Math.floor(rng() * arr.length)];
      const good = this.eventN % 2 === 0; this.eventN++;
      let pool = ids(A.EVENT_GLOBAL).filter(k => A.EVENT_GLOBAL[k].good === good && !this.usedGlobal.includes(k));
      if (!pool.length) pool = ids(A.EVENT_GLOBAL).filter(k => A.EVENT_GLOBAL[k].good === good);
      const g = force && force.global || pick(pool); this.usedGlobal.push(g);
      const out = [this.applyGlobal(g)];
      const emps = this.employees().slice(), n = force && force.personal ? force.personal.length : rng() < 0.6 ? 2 : 1;
      const wantGood = n === 2 ? [true, false] : [!good];
      for (let i = 0; i < n && emps.length; i++) {
        const who = force && force.who ? this.get(force.who[i]) : emps.splice(Math.floor(rng() * emps.length), 1)[0];
        if (force && force.who) emps.splice(emps.indexOf(who), 1);
        const pid = force && force.personal ? force.personal[i] : pick(ids(A.EVENT_PERSONAL).filter(k => A.EVENT_PERSONAL[k].good === wantGood[i]));
        out.push(this.applyPersonal(pid, who));
      }
      this.emit({ type: 'event', list: out, n: this.eventN });
      return out;
    },
    applyGlobal(id) {
      const E = A.EVENT_GLOBAL[id];
      if (id === 'tea') this.roomBoost.pantry = E.dur;
      else if (id === 'sunset') this.roomBoost.rooftop = E.dur;
      else if (id === 'redpack') {
        const cells = this.grid.cells.filter(k => !k.wall && !k.room && !k.door);
        this.bags = [];
        for (let i = 0; i < E.count; i++) { const k = cells[Math.floor(this.rng() * cells.length)]; this.bags.push({ x: k.c + 0.5, y: k.r + 0.5, cash: E.cash }); }
      } else if (id === 'call') { if (!(this.boss.waitT > 0)) { this.boss.freezeT = Math.max(this.boss.freezeT || 0, E.dur); this.boss.path = []; } }
      else if (id === 'jam') {
        this.closed.print = E.dur;
        for (const e of this.employees()) if (e.room === 'print' && !e.forced) { e.forced = true; e.path = []; const o = this.grid.outside('print'); this.pathTo(e, o.x, o.y); }
      } else if (id === 'inspect') this.bossBoostT = E.dur;
      if (E.dur) this.activeEvents.push({ id, name: E.name, desc: E.desc, good: E.good, t: E.dur });
      return { id, name: E.name, desc: E.desc, good: E.good, who: null };
    },
    applyPersonal(id, e) {
      const E = A.EVENT_PERSONAL[id];
      if (id === 'raise') e.banked += E.cash;
      else if (id === 'coffee') e.fastT = E.dur;
      else if (id === 'inspire') e.inspire = E.mult;
      else if (id === 'upgrade') this.deskLocks[e.desk.id] = Math.max(this.deskLocks[e.desk.id] || 0, E.dur);
      else if (id === 'spotted') e.spottedT = E.dur;
      else if (id === 'cramp') e.numbT = Math.max(e.numbT || 0, E.dur);
      else if (id === 'crash') e.skillCd += E.cd;
      return { id, name: E.name, desc: E.desc, good: E.good, who: e.id };
    },
    // 某房间当前的收入倍率（下午茶 / 晚霞）
    eventIncome(room) { return this.roomBoost[room] > 0 ? 2 : 1; },
  };
  A.installEvents = M => Object.assign(M.prototype, P);
})(typeof window !== 'undefined' ? window : globalThis);
