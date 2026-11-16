// 摸鱼大作战（A4）：补给。每 40 秒左右在随机一个摸鱼房间里刷一个，全场广播；
// 员工站上去读条 2 秒捡起，老板踩到直接收走。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  A.SUPPLY = {
    first: 25, every: 40, max: 2, pick: 2, range: 0.6,
    items: {
      takeout: { name: '外卖', w: 3, cash: 30, desc: '口袋 +$30' },
      double:  { name: '双倍卡', w: 2, dur: 20, desc: '20 秒内收入 ×2' },
      leave:   { name: '请假条', w: 2, desc: '下次被抓免罚' },
      manual:  { name: '培训手册', w: 2, desc: '技能立刻升 1 级' },
    },
  };
  A.SUPPLY_IDS = Object.keys(A.SUPPLY.items);

  const P = {
    initSupplies() { this.supplies = []; this.supplyT = A.SUPPLY.first; this.supplySeq = 0; },
    spawnSupply(kind, room) {
      const S = A.SUPPLY;
      if (!kind) { const tot = A.SUPPLY_IDS.reduce((s, k) => s + S.items[k].w, 0); let r = this.rng() * tot; kind = A.SUPPLY_IDS.find(k => (r -= S.items[k].w) <= 0) || 'takeout'; }
      room = room || A.SLACK_ROOMS[Math.floor(this.rng() * A.SLACK_ROOMS.length)];
      const cells = this.grid.roomCells(room).filter(k => !this.supplies.some(s => Math.floor(s.x) === k.c && Math.floor(s.y) === k.r));
      const k = cells[Math.floor(this.rng() * cells.length)];
      const s = { id: ++this.supplySeq, kind, room, x: k.c + 0.5, y: k.r + 0.5, prog: 0, by: null };
      this.supplies.push(s); this.stats.supplies++; this.emit({ type: 'supply', id: s.id, kind, room });
      return s;
    },
    updateSupplies(dt) {
      const S = A.SUPPLY;
      this.supplyT -= dt;
      if (this.supplyT <= 0) { this.supplyT = S.every; if (this.supplies.length < S.max) this.spawnSupply(); }
      const b = this.boss;
      for (const s of this.supplies.slice()) {
        if (b.room === s.room && Math.hypot(b.x - s.x, b.y - s.y) < S.range + 0.1) { this.removeSupply(s); this.stats.taken++; this.emit({ type: 'supplyTaken', id: s.id, kind: s.kind, room: s.room }); continue; }
        const e = this.employees().find(e => e.room === s.room && !e.forced && e.meetingT <= 0 && Math.hypot(e.x - s.x, e.y - s.y) < S.range);
        if (!e) { s.prog = 0; s.by = null; continue; }
        if (s.by !== e.id) { s.by = e.id; s.prog = 0; }
        s.prog += dt;
        if (s.prog >= S.pick) { this.removeSupply(s); this.stats.picks++; e.stats.picks = (e.stats.picks || 0) + 1; this.applySupply(e, s.kind); this.emit({ type: 'pickup', who: e.id, kind: s.kind, room: s.room }); }
      }
    },
    removeSupply(s) { this.supplies = this.supplies.filter(x => x !== s); },
    applySupply(e, kind) {
      const I = A.SUPPLY.items[kind];
      if (kind === 'takeout') e.pocket += I.cash;
      else if (kind === 'double') e.doubleT = I.dur;
      else if (kind === 'leave') e.leaveNote = true;
      else if (kind === 'manual') this.levelUp(e, 'manual');
    },
  };
  A.installSupplies = M => Object.assign(M.prototype, P);
})(typeof window !== 'undefined' ? window : globalThis);
