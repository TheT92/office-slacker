// 摸鱼大作战（A4）：补给。每 30 秒左右在随机一个摸鱼房间里刷一个（最多同时 3 个），全场广播；
// 员工站上去读条 2 秒捡起，老板踩到直接收走。
// 2.2.0 B2：新增 4 种捣乱补给（held）——捡到后放进道具格，自己决定什么时候用（Q / 道具按钮）；身上只能带 1 个，捡新的会换掉旧的。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  A.SUPPLY = {
    first: 25, every: 30, max: 3, pick: 2, range: 0.6,
    items: {
      takeout: { name: '外卖', w: 3, cash: 30, desc: '口袋 +$30' },
      double:  { name: '双倍卡', w: 2, dur: 20, desc: '20s 收入 ×2' },
      leave:   { name: '请假条', w: 2, desc: '下次被抓免罚' },
      manual:  { name: '培训手册', w: 2, desc: '技能立刻升 1 级' },
      seal:    { name: '工位封条', w: 2, held: true, dur: 8, desc: '锁第一名工位 8s' },
      banana:  { name: '香蕉皮', w: 2, held: true, slip: 2, life: 40, desc: '谁踩谁滑倒 2s' },
      fake:    { name: '假消息', w: 1.5, held: true, desc: '吓对手：老板来了！' },
      steal:   { name: '抢功劳', w: 1.5, held: true, cut: 0.2, desc: '下个存钱的分你 20%' },
    },
  };
  A.SUPPLY_IDS = Object.keys(A.SUPPLY.items);

  const P = {
    initSupplies() { this.supplies = []; this.supplyT = A.SUPPLY.first; this.supplySeq = 0; this.bananas = []; this.stealBy = null; },
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
      // 香蕉皮：别人踩到滑倒（丢的人 1 秒内踩不到自己的），40 秒后自己消失
      for (const a of this.actors) a.slipT = Math.max(0, (a.slipT || 0) - dt);
      for (const n of this.bananas.slice()) {
        n.t -= dt; n.age = (n.age || 0) + dt; if (n.t <= 0) { this.bananas = this.bananas.filter(x => x !== n); continue; }
        const a = this.actors.find(a => !(a.slipT > 0) && !a.room && !(a.waitT > 0) && (a.id !== n.by || n.age > 1) && Math.hypot(a.x - n.x, a.y - n.y) < 0.5);
        if (a) { this.bananas = this.bananas.filter(x => x !== n); a.slipT = S.items.banana.slip; a.path = []; a.dir = { x: 0, y: 0 }; this.emit({ type: 'slip', who: a.id, by: n.by }); }
      }
      for (const s of this.supplies.slice()) {
        if (b.room === s.room && Math.hypot(b.x - s.x, b.y - s.y) < S.range + 0.1) { this.removeSupply(s); this.stats.taken++; this.emit({ type: 'supplyTaken', id: s.id, kind: s.kind, room: s.room }); continue; }
        const e = this.employees().find(e => e.room === s.room && !e.forced && e.meetingT <= 0 && Math.hypot(e.x - s.x, e.y - s.y) < S.range);
        if (!e) { s.prog = 0; s.by = null; continue; }
        if (s.by !== e.id) { s.by = e.id; s.prog = 0; }
        s.prog += dt; s.need = (A.PASSIVES && A.PASSIVES[e.id] && A.PASSIVES[e.id].pick) || S.pick;   // 猫被动：捡得快
        if (s.prog >= s.need) { this.removeSupply(s); this.stats.picks++; e.stats.picks = (e.stats.picks || 0) + 1; this.applySupply(e, s.kind); this.emit({ type: 'pickup', who: e.id, kind: s.kind, room: s.room }); }
      }
    },
    removeSupply(s) { this.supplies = this.supplies.filter(x => x !== s); },
    applySupply(e, kind) {
      const I = A.SUPPLY.items[kind];
      if (I.held) e.item = kind;   // 捣乱补给：放进道具格
      else if (kind === 'takeout') e.pocket += I.cash;
      else if (kind === 'double') e.doubleT = I.dur;
      else if (kind === 'leave') e.leaveNote = true;
      else if (kind === 'manual') this.levelUp(e, 'manual');
    },
  };
  // 用道具（捣乱补给）
  P.useItem = function (a) {
    const kind = a.item, I = kind && A.SUPPLY.items[kind], fail = reason => { this.emit({ type: 'itemFail', who: a.id, item: kind, reason }); return false; };
    if (!I || this.phase !== 'playing' || this.busy(a)) return false;
    const others = this.employees().filter(e => e !== a);
    let target = null;
    if (kind === 'seal') {
      target = others.filter(e => !(this.deskLocks[e.desk.id] > 0)).sort((p, q) => q.banked - p.banked)[0]; if (!target) return fail('noTarget');
      this.deskLocks[target.desk.id] = I.dur;
    } else if (kind === 'banana') {
      if (a.room) return fail('office');
      this.bananas.push({ x: a.x, y: a.y, by: a.id, t: I.life, age: 0 });
    } else if (kind === 'fake') {
      const inRoom = others.filter(e => e.room && A.ROOMS[e.room].slack && !e.forced);
      target = (inRoom.length ? inRoom : others)[Math.floor(this.rng() * (inRoom.length ? inRoom.length : others.length))];
      if (!target.isPlayer && target.room && A.ROOMS[target.room].slack && !this.mustStay(target)) this.exitRoom(target);   // AI 信以为真：赶紧出门
    } else if (kind === 'steal') this.stealBy = { by: a.id };
    a.item = null;
    this.emit({ type: 'itemUse', who: a.id, item: kind, target: target ? target.id : null });
    return true;
  };
  A.installSupplies = M => Object.assign(M.prototype, P);
})(typeof window !== 'undefined' ? window : globalThis);
