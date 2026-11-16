// 游戏主状态机：menu → playing → win / lose。纯逻辑，可在 Node 中运行。
(function (g) {
  const OS = (g.OS = g.OS || {});
  class Game {
    constructor(level, opts) {
      opts = opts || {};
      const base = opts.bal || OS.balance;   // 关卡可覆盖老板参数与罚款
      this.level = level; this.map = OS.makeMap(level.rooms);   // 每关的房间可配置
      this.bal = Object.assign({}, base, level.fine ? { fine: level.fine } : {},
        { boss: Object.assign({}, base.boss, level.boss || {}) });
      // 老板查房目标：关卡没指定就用本关所有"可摸鱼且不是 noRaid"的房间
      if (!(level.boss && level.boss.raidTargets)) this.bal.boss.raidTargets = this.map.raidRooms().map(z => z.id);
      this.maxCaught = level.maxCaught || null;  // 仅考核关有：被抓次数超过上限即失败
      this.roster = (opts.roster || level.roster || []).slice();   // 上场阵容（App 从阵容界面传入）
      if (!this.roster.length) throw new Error('关卡 ' + level.id + ' 没有上场阵容');
      this.desks = this.map.deskPositions(this.roster.length);
      this.rng = opts.rng || Math.random;
      this.autoSolo = opts.autoSolo !== false;   // 普通技能自动出发（单元测试可关掉以便手动控制）
      this.phase = 'menu'; this.reset();
    }
    reset() {
      this.boss = new OS.Boss(this.bal, this.map, this.rng);
      this.employees = this.roster.map((id, i) => new OS.Employee(OS.characters[id], this.desks[i], i, this.bal, this.map));
      this.money = 0; this.slackSeconds = 0; this.caught = 0; this.fined = 0; this.endReason = null; this.shield = 0; this.shielded = 0;
      this.timeLeft = this.level.timeLimit; this.events = [];
    }
    start() { this.reset(); this.phase = 'playing'; }
    occupancy(room) { return this.employees.filter(e => (e.state === 'going' || e.state === 'in_room') && e.room === room).length; }
    get(id) { return this.employees.find(e => e.id === id); }
    isExam() { return !!this.maxCaught; }
    useSolo(id) { return OS.skills.useSolo(this, this.get(id)); }
    useTeam(id) { return OS.skills.useTeam(this, this.get(id)); }
    // 可召回的房间：本关有、可摸鱼且有召回键的房间（会议室、打印室不行）
    canRecall(room) { return this.map.recallRooms().some(z => z.id === room); }
    // 紧急召回：点击房间，让房间里（以及正在走向这个房间）的人全部返回。返回召回人数。
    recallRoom(room) {
      if (this.phase !== 'playing' || !this.canRecall(room)) return 0;
      let n = 0;
      for (const e of this.employees) if ((e.state === 'in_room' || e.state === 'going') && e.room === room && e.recall()) n++;
      if (n) this.events.push({ type: 'recall', room, count: n });
      return n;
    }
    drainEvents() { const e = this.events; this.events = []; return e; }
    update(dt) {
      if (this.phase !== 'playing') return;
      if (this.autoSolo) OS.auto.step(this);
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.shield > 0) this.shield = Math.max(0, this.shield - dt);   // 打掩护剩余时间
      const bossWas = this.boss.state;
      this.boss.update(dt);
      if (bossWas !== 'warning' && this.boss.state === 'warning') this.events.push({ type: 'warning', room: this.boss.target });
      for (const e of this.employees) e.update(dt);
      OS.rules.resolveCatches(this);
      OS.economy.tick(this, dt);
      OS.rules.checkEnd(this);
    }
  }
  OS.Game = Game;
})((typeof window!=="undefined"?window:globalThis));
