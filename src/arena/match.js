// 摸鱼大作战：一局对战的纯逻辑（不涉及画面，Node 可测）。
// 玩家和 AI 都只通过同一组指令操作角色：moveTo / setDir / exitRoom / goDesk / action，
// 以后接联机时，把这些指令改成从网络收发即可。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // 房间收入曲线：进门后从 floor×峰值 爬到峰值（rise 秒），之后递减，到最长停留时回落到 floor×峰值
  // stretch：熊的被动"耐蹲"让爬升时间和最长停留一起拉长
  A.rate = function (roomId, t, stretch) {
    const R = A.ROOMS[roomId]; if (!R || !R.slack) return 0;
    const s = stretch || 1, rise = R.rise * s, maxStay = R.maxStay * s;
    if (t < rise) return R.peak * (R.floor + (1 - R.floor) * t / rise);
    const k = Math.min(1, (t - rise) / Math.max(0.001, maxStay - rise));
    return R.peak * (1 - (1 - R.floor) * k);
  };

  // 被抓时没收口袋的比例：在当前房间待得越久，比例越高
  A.penaltyRatio = function (roomId, t, stretch) {
    const R = A.ROOMS[roomId], P = A.PENALTY;
    return Math.min(1, P.base + P.span * Math.min(1, t / (R.maxStay * (stretch || 1))));
  };

  // 独立随机数流（给每个 AI 用）
  A.mulberry = function (a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  class Match {
    // opts: difficulty（AI 老板难度 easy / normal / hard，默认 normal）、rng、playerRole（'employee' 默认 / 'boss' / 'random' 1/5 当老板）、playerChar、playerDesk、time、bossAI、employeeAI、allAI（全部由 AI 操作，平衡模拟用）
    constructor(opts) {
      opts = opts || {};
      this.rng = opts.rng || Math.random;
      let role = opts.playerRole || 'employee';
      if (role === 'random') role = this.rng() < 0.2 ? 'boss' : 'employee';
      this.role = role;
      this.grid = A.buildGrid(A.MAP);
      this.time = 0; this.left = opts.time || A.ECON.matchTime; this.events = [];
      // 准备阶段：读身份卡，期间谁都不能动（opts.prep 秒；默认 0 = 直接开始，App 会传 20）
      this.prepLeft = Math.max(0, opts.prep || 0); this.phase = this.prepLeft > 0 ? 'prep' : 'playing';
      this.rush = false; this.stats = { supplies: 0, picks: 0, taken: 0 };
      const chars = shuffle(A.EMPLOYEE_IDS, this.rng), desks = shuffle(A.DESKS, this.rng);
      if (opts.playerChar) { chars.splice(chars.indexOf(opts.playerChar), 1); chars.unshift(opts.playerChar); }
      if (opts.playerDesk != null) { const d = A.DESKS[opts.playerDesk]; desks.splice(desks.indexOf(d), 1); desks.unshift(d); }
      this.actors = chars.map((id, i) => this.makeEmployee(id, desks[i], i === 0 && role === 'employee'));
      const bcd = {}; A.SLACK_ROOMS.forEach(r => (bcd[r] = 0));
      this.boss = { id: 'boss', kind: 'boss', name: '老板', x: A.BOSS_SPAWN.x, y: A.BOSS_SPAWN.y, path: [], dir: { x: 0, y: 0 }, room: null, isPlayer: false, facing: 1, moving: false,
        stay: 0, cooldowns: bcd, stats: { checks: 0, empty: 0, catches: 0, confiscated: 0, score: 0 } };
      this.boss.isPlayer = role === 'boss';
      this.actors.push(this.boss);
      this.player = role === 'boss' ? this.boss : this.actors[0];
      // AI：每个 AI 用自己的随机数流，互不影响
      const seed = () => Math.floor(this.rng() * 4294967296);
      const bossSeed = seed(); this.bossAI = role === 'boss' || opts.bossAI === false ? null : new A.BossAI(this, A.mulberry(bossSeed), opts.difficulty || 'normal');   // 不管有没有 AI 老板都先取种子，保证员工 AI 的随机数一致
      this.empAI = opts.employeeAI === false ? [] : this.employees().filter(e => !e.isPlayer || opts.allAI).map((e, i) => new A.EmployeeAI(this, e, A.mulberry(seed()), opts.personalities ? opts.personalities[i] : null));
      this.lureIdle = {}; A.SLACK_ROOMS.forEach(r => (this.lureIdle[r] = 0));
      this.noBossSkills = !!opts.noBossSkills;
      this.bossWait = opts.bossWait != null ? opts.bossWait : A.BOSS_ARRIVE.wait;   // 测试可传 0：老板开局就在办公室门口能动   // 测试用：老板不拿技能
      this.initSkills(); this.initSupplies(); this.initEvents();   // A4：技能、升级、补给（skills.js / supply.js）；B2：随机事件（events.js）
    }
    makeEmployee(id, desk, isPlayer) {
      const s = A.seatOf(desk), cds = {}; A.ENTER_ROOMS.forEach(r => (cds[r] = 0));
      return { id, kind: 'employee', name: A.CHARACTERS[id].name, desk, x: s.x, y: s.y, path: [], dir: { x: 0, y: 0 }, room: null, roomTime: 0,
        pocket: 0, banked: 0, cooldowns: cds, forced: false, stun: 0, isPlayer, facing: 1, moving: false, lure: 1, officeTime: 0, combo: 0,
        stats: { roomTime: { print: 0, pantry: 0, rooftop: 0, toilet: 0 }, deposits: 0, entries: 0 } };
    }
    get(id) { return this.actors.find(a => a.id === id); }
    employees() { return this.actors.filter(a => a.kind === 'employee'); }
    occupants(roomId) { return this.actors.filter(a => a.room === roomId); }
    emit(ev) { this.events.push(ev); }
    drainEvents() { const e = this.events; this.events = []; return e; }

    // 能否进入某房间；返回 null 表示可以，否则返回原因：locked / lockedDoor / stay / cooldown / boss / full
    entryBlock(a, roomId) {
      const R = A.ROOMS[roomId];
      if (a.room === roomId) return null;
      if (this.locks && this.locks[roomId]) return 'lockedDoor';   // 熊堵门：谁都进不去
      if (this.closed && this.closed[roomId] > 0) return 'closed';   // 随机事件：打印机卡纸，暂时关闭
      if (a.kind === 'boss') {
        if (!R.slack) return 'locked';                       // 老板不能进厕所
        if (a.stay > 0) return 'stay';                       // 职场边界感：查房要待满逗留时间
        if (a.cooldowns[roomId] > 0 && !a.raidNext) return 'cooldown';   // 突击检查无视冷却
        return null;
      }
      if (!R.slack && !R.safe) return 'locked';
      if (this.boss.room === roomId) return 'boss';           // 老板在里面
      if (a.cooldowns[roomId] > 0) return 'cooldown';
      if (this.occupants(roomId).filter(e => e.kind === 'employee').length >= R.cap && !this.canBump(a, roomId)) return 'full';
      return null;
    }
    // 兔子插队：冲刺中能挤进满员的摸鱼房间
    canBump(a, roomId) { return a.id === 'rabbit' && a.dashT > 0 && A.ROOMS[roomId].slack && this.occupants(roomId).some(e => e.kind === 'employee' && !e.forced); }
    // 被挤出门：口袋保留，这间房进入冷却
    bump(v, by) {
      const room = v.room; v.forced = true; v.path = []; v.dir = { x: 0, y: 0 }; const o = this.grid.outside(room); this.pathTo(v, o.x, o.y);
      this.emit({ type: 'bumped', who: v.id, by: by.id, room });
    }
    canPass(a, cell) {
      if (!cell || cell.wall) return false;
      if (a.kind === 'boss' && a.stay > 0) return cell.room === a.room;   // 逗留期间出不了房间
      if (this.mustStay(a)) return cell.room === a.room;                    // 员工最少停留 4 秒：出不了房间
      const id = cell.door || cell.room; if (!id) return true;
      return !this.entryBlock(a, id);
    }

    // 空房诱惑倍率（门牌上显示）
    lure(roomId) { return Math.min(A.ECON.lureMax, 1 + A.ECON.lurePerSec * this.lureIdle[roomId]); }
    bossScore() { return this.boss.stats.score; }   // 每次抓人按当次倍数累加（见 catchEmployee）
    // 5 人统一排名（结算时揭晓）：[{ a: 角色, score }]，老板收益 = 每次没收 × 当次倍数之和
    finalRanking() { return this.employees().map(e => ({ a: e, score: e.banked })).concat([{ a: this.boss, score: this.bossScore() }]).sort((p, q) => q.score - p.score); }
    bossWin() { return this.finalRanking()[0].a === this.boss; }

    // —— 指令 ——
    // 走到某点；点到房间里 = 进那个房间；点到工位桌 = 回自己工位
    moveTo(a, x, y) {
      if (this.busy(a) || this.phase !== 'playing') return false;
      const g = this.grid; let cell = g.cellAt(x, y); if (!cell) return false;
      const roomId = cell.room || cell.door;
      if (a.kind === 'boss' && a.stay > 0 && roomId !== a.room) { this.emit({ type: 'blocked', who: a.id, room: a.room, reason: 'stay' }); return false; }
      if (this.mustStay(a) && roomId !== a.room) { this.emit({ type: 'blocked', who: a.id, room: a.room, reason: 'minStay' }); return false; }
      a.depositIntent = false;   // 自己点地面走开：取消"回工位存钱"
      if (roomId) {
        const why = this.entryBlock(a, roomId);
        if (why) { this.emit({ type: 'blocked', who: a.id, room: roomId, reason: why }); return false; }
        if (cell.door || cell.stairs) {   // 点在门或楼梯上：走到房间里离门最近的格子
          const inner = g.roomCells(roomId).sort((p, q) => Math.hypot(p.c + 0.5 - x, p.r + 0.5 - y) - Math.hypot(q.c + 0.5 - x, q.r + 0.5 - y))[0];
          cell = inner;
        }
      }
      if (cell.desk) { const own = a.desk && (cell.c === a.desk.c || cell.c === a.desk.c + 1) && cell.r === a.desk.r; if (own) return this.goDesk(a); }
      if (!this.canPass(a, cell)) {   // 点在墙上：找最近的可走格
        let best = null, bd = 1e9;
        for (const k of g.cells) { if (!this.canPass(a, k) || k.room) continue; const d = Math.hypot(k.c + 0.5 - x, k.r + 0.5 - y); if (d < bd && d < 2.5) { bd = d; best = k; } }
        if (!best) return false; cell = best;
      }
      const tx = cell === g.cellAt(x, y) && !cell.room ? x : cell.c + 0.5, ty = cell === g.cellAt(x, y) && !cell.room ? y : cell.r + 0.5;
      return this.pathTo(a, tx, ty);
    }
    pathTo(a, tx, ty) {
      const pass = k => this.canPass(a, k);
      const raw = A.findPath(this.grid, a.x, a.y, tx, ty, pass); if (!raw) return false;
      if (raw.length) raw[raw.length - 1] = { x: tx, y: ty };
      else raw.push({ x: tx, y: ty });
      a.path = A.smooth(this.grid, a.x, a.y, raw, pass, A.MOVE.radius * 0.9); a.dir = { x: 0, y: 0 };
      return true;
    }
    // 键盘方向移动（会取消正在走的路线）
    setDir(a, dx, dy) {
      if (this.busy(a) || this.phase !== 'playing') { a.dir = { x: 0, y: 0 }; return; }
      a.dir = { x: dx, y: dy }; if (dx || dy) { a.path = []; a.depositIntent = false; }
    }
    // 员工进房间后还没待满最少停留时间（自动出门时不受限）
    mustStay(a) { return a.kind === 'employee' && !!a.room && !a.forced && a.roomTime < A.ECON.minStay; }
    // 不能操作的状态：自动出门、罚站、被拉去开会、老板开会定身 / 接电话、踩香蕉皮滑倒
    busy(a) { return a.forced || a.stun > 0 || a.meetingT > 0 || a.freezeT > 0 || a.waitT > 0 || a.slipT > 0; }   // waitT：老板开局等待
    // 头名悬赏：存款第一（至少 $50、并且没有并列）的员工；老板抓到他收益 ×1.5
    leader() { const E = this.employees().slice().sort((p, q) => q.banked - p.banked); return E[0] && E[0].banked >= A.BOUNTY.min && E[0].banked > E[1].banked ? E[0] : null; }
    // 员工之间的实时名次（只比存款，1 = 第一）
    rankOf(a) { return 1 + this.employees().filter(e => e !== a && e.banked > a.banked).length; }
    exitRoom(a) {
      if (!a.room || this.busy(a)) return false;
      if (a.kind === 'boss' && a.stay > 0) { this.emit({ type: 'blocked', who: a.id, room: a.room, reason: 'stay' }); return false; }
      if (this.mustStay(a)) { this.emit({ type: 'blocked', who: a.id, room: a.room, reason: 'minStay' }); return false; }
      const o = this.grid.outside(a.room); return this.pathTo(a, o.x, o.y);
    }
    // 工位被猫打翻水杯：锁着的剩余秒数
    deskLocked(a) { return a.desk && this.deskLocks ? this.deskLocks[a.desk.id] || 0 : 0; }
    // 回工位：主动操作，走到自己工位后才存钱（已经在工位旁就下一帧存）
    goDesk(a) { if (!a.desk || this.busy(a) || a.room) return false; const s = A.seatOf(a.desk); if (!this.pathTo(a, s.x, s.y)) return false; a.depositIntent = true; return true; }
    // 一个按钮的情境操作：在房间里 = 出门；在外面 = 回工位
    action(a) { return a.room ? this.exitRoom(a) : this.goDesk(a); }

    // —— 每帧推进 ——
    // 准备好了：剩余准备时间缩到倒数 3 秒
    ready() { if (this.phase === 'prep') this.prepLeft = Math.min(this.prepLeft, A.PREP.countdown); }
    update(dt) {
      if (this.phase === 'prep') {
        const before = Math.ceil(this.prepLeft); this.prepLeft = Math.max(0, this.prepLeft - dt);
        if (this.prepLeft <= A.PREP.countdown && Math.ceil(this.prepLeft) < before && this.prepLeft > 0) this.emit({ type: 'countdown', n: Math.ceil(this.prepLeft) });
        if (this.prepLeft <= 0) { this.phase = 'playing'; this.emit({ type: 'go' }); }
        return;
      }
      if (this.phase !== 'playing') return;
      this.time += dt; this.left = Math.max(0, this.left - dt);
      if (!this.rush && this.left <= A.RUSH.time) { this.rush = true; this.emit({ type: 'rush' }); }   // 下班冲刺
      this.updateSkills(dt); this.updateEvents(dt);
      if (this.bossAI) this.bossAI.think(dt);
      for (const ai of this.empAI) ai.think(dt);
      for (const r of A.SLACK_ROOMS) if (!this.employees().some(e => e.room === r)) this.lureIdle[r] += dt;
      for (const a of this.actors) this.step(a, dt);
      this.updateSupplies(dt);
      if (this.left <= 0) { this.phase = 'over'; this.emit({ type: 'over' }); }   // 大家看不到对方的分数，每局打满时间，结算时揭晓
    }
    step(a, dt) {
      const g = this.grid, here = g.cellAt(a.x, a.y);
      let speed = (a.kind === 'boss' ? A.MOVE.boss : A.MOVE.employee) * (here && here.stairs ? A.MOVE.stairs : 1);
      if (a.kind === 'employee' && A.PASSIVES[a.id] && A.PASSIVES[a.id].speed) speed *= A.PASSIVES[a.id].speed;   // 兔子被动：腿长
      if (a.numbT > 0) speed *= A.ROOMS.toilet.numbMult;   // 蹲厕所出来腿麻 / 腿抽筋
      if (a.fastT > 0) speed *= A.EVENT_PERSONAL.coffee.mult;   // 随机事件：咖啡因
      if (a.kind === 'boss' && this.bossBoostT > 0) speed *= 1.3;   // 随机事件：领导视察
      if (a.dashT > 0) speed *= a.kind === 'boss' ? A.BOSS_SKILLS.dash.mult : A.empSkill(a).mult;   // 冲刺
      if (a.kind === 'boss' && this.rush) speed *= A.RUSH.bossSpeed;   // 下班冲刺：老板也加速
      const frozen = a.stun > 0 || a.freezeT > 0 || a.meetingT > 0 || a.waitT > 0 || a.slipT > 0;
      let moved = false;
      if (frozen) { /* 罚站 / 开会：不能动 */ }
      else if (a.path.length) {
        const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy), s = speed * dt;
        if (d <= s) { a.x = p.x; a.y = p.y; a.path.shift(); } else { a.x += dx / d * s; a.y += dy / d * s; }
        if (Math.abs(dx) > 0.01) a.facing = dx > 0 ? 1 : -1; moved = d > 0.001;
      } else if (a.dir.x || a.dir.y) {
        const l = Math.hypot(a.dir.x, a.dir.y), s = speed * dt, vx = a.dir.x / l * s, vy = a.dir.y / l * s;
        if (this.free(a, a.x + vx, a.y)) a.x += vx;
        if (this.free(a, a.x, a.y + vy)) a.y += vy;
        if (vx) a.facing = vx > 0 ? 1 : -1; moved = true;
      }
      a.moving = moved;
      if (a.kind === 'employee') this.stepEmployee(a, dt); else this.stepBoss(a, dt);
    }
    // 老板：进门即查房（房里所有员工按比例没收口袋），逗留、再查冷却；查空房扣怒气（2.2.0 取消冒犯值和 HR 约谈）
    stepBoss(b, dt) {
      for (const r in b.cooldowns) b.cooldowns[r] = Math.max(0, b.cooldowns[r] - dt);
      if (b.stay > 0) b.stay = Math.max(0, b.stay - dt);
      const cell = this.grid.cellAt(b.x, b.y), zone = cell && cell.room && A.ROOMS[cell.room].slack ? cell.room : null;
      if (zone && b.room !== zone && this.locks[zone]) {   // 门被熊堵住：弹回门外
        const o = this.grid.outside(zone); b.x = o.x; b.y = o.y; b.path = []; this.emit({ type: 'blocked', who: 'boss', room: zone, reason: 'lockedDoor' });
      } else if (zone && b.room !== zone) {
        const R = A.ROOMS[zone], raid = b.raidNext; b.room = zone; b.stay = raid ? 0 : R.bossStay; b.raidNext = false; b.stats.checks++; b.raidCatch = raid;
        const inRoom = this.employees().filter(e => e.room === zone && e.immuneT <= 0), caught = inRoom.filter(e => this.catchEmployee(e, zone));
        b.fineNext = false; b.raidCatch = false;
        if (!inRoom.length) { b.stats.empty++; b.anger = Math.max(0, b.anger - A.BOSS.emptyAnger); }   // 查空房：扣怒气
        b.anger = Math.min(A.ANGER.max, b.anger + A.ANGER.perCatch * caught.length);
        this.emit({ type: 'check', room: zone, caught: caught.map(e => e.id), empty: !inRoom.length });
      } else if (!zone && b.room && !(cell && cell.door === b.room)) {
        const R = A.ROOMS[b.room]; b.cooldowns[b.room] = R.bossCdMin + this.rng() * (R.bossCdMax - R.bossCdMin); b.lastLeft = { room: b.room, t: this.time }; this.emit({ type: 'bossLeave', room: b.room }); b.room = null; b.stay = 0;
      }
    }
    // 被抓：按比例没收整个口袋，连摸加成清零；不罚站（stun = 0）时立刻自动出门。返回 false = 请假条免罚
    catchEmployee(e, roomId) {
      const b = this.boss, F = A.BOSS_SKILLS.fine;
      if (e.leaveNote) {   // 请假条：这次不罚，照样出门
        e.leaveNote = false; e.path = []; e.forced = true; const o = this.grid.outside(roomId); this.pathTo(e, o.x, o.y);
        this.emit({ type: 'excused', who: e.id, room: roomId }); return false;
      }
      const bounty = this.leader() === e;   // 头名悬赏
      let ratio = A.penaltyRatio(roomId, e.roomTime, A.stayMult(e));
      if (b.fineNext) ratio = Math.min(1, ratio + F.extra);                         // 加倍罚款
      if (b.raidCatch) ratio = Math.min(1, ratio + A.BOSS_SKILLS.raid.extra);         // 突击检查：额外 +10%
      let lost = e.pocket * ratio; e.pocket -= lost;
      if (b.fineNext) { const cut = e.banked * F.bankCut; e.banked -= cut; lost += cut; }
      e.combo = 0; e.stun = A.PENALTY.stun; e.path = [];
      if (!(e.stun > 0)) { e.forced = true; const o = this.grid.outside(roomId); this.pathTo(e, o.x, o.y); }   // 先标记自动出门，才不受最少停留限制
      e.dir = { x: 0, y: 0 }; e.stats.caught = (e.stats.caught || 0) + 1; e.stats.lost = (e.stats.lost || 0) + lost;
      const bs = this.boss.stats, cm = A.catchMult(bs.catches) * (bounty ? A.BOUNTY.mult : 1); bs.score += lost * cm;   // 抓人收益逐次递增：×1 → ×1.15 → ×1.3 → ×1.45 → ×1.5；抓到头名再 ×1.25
      bs.catches++; bs.confiscated += lost; if (bounty) bs.bounties = (bs.bounties || 0) + 1;
      this.emit({ type: 'caught', who: e.id, room: roomId, ratio, lost, mult: cm, bounty });
      return true;
    }
    // 碰撞：角色四角都要能走
    free(a, x, y) {
      const r = A.MOVE.radius;
      for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (!this.canPass(a, this.grid.cellAt(x + ox, y + oy))) return false;
      return true;
    }
    stepEmployee(a, dt) {
      for (const r in a.cooldowns) a.cooldowns[r] = Math.max(0, a.cooldowns[r] - dt);
      if (a.meetingT > 0) return;   // 在会议室开会：不赚钱也不领工资
      if (a.stun > 0) {   // 罚站训话：结束后自动出门
        a.stun = Math.max(0, a.stun - dt);
        if (a.stun === 0 && a.room) { a.forced = true; const o = this.grid.outside(a.room); this.pathTo(a, o.x, o.y); }
        if (a.room) return;
      }
      const cell = this.grid.cellAt(a.x, a.y), zone = cell && cell.room && (A.ROOMS[cell.room].slack || A.ROOMS[cell.room].safe) ? cell.room : null;
      if (zone && a.room !== zone) {
        if (a.room) this.leave(a);
        const why = this.entryBlock(a, zone);
        if (why) { const o = this.grid.outside(zone); a.x = o.x; a.y = o.y; a.path = []; this.emit({ type: 'blocked', who: a.id, room: zone, reason: why }); }   // 走到一半老板进去了 / 同时挤门：弹回门外
        else if (A.ROOMS[zone].safe) { a.room = zone; a.roomTime = 0; a.depositIntent = false; a.officeTime = 0; a.toiletCap = A.ROOMS[zone].maxStay; a.knocked = false; this.emit({ type: 'enter', who: a.id, room: zone, lure: 1 }); }   // 厕所：不算连摸
        else {
          const full = this.occupants(zone).filter(e => e.kind === 'employee' && e !== a);
          if (full.length >= A.ROOMS[zone].cap) { const v = full.find(e => !e.forced); if (v) this.bump(v, a); }   // 兔子插队：挤出去一个
          a.room = zone; a.roomTime = 0; a.depositIntent = false; a.stats.entries++; a.lure = this.lure(zone); this.lureIdle[zone] = 0; a.officeTime = 0; a.combo++; this.emit({ type: 'enter', who: a.id, room: zone, lure: a.lure });
        }
      } else if (!zone && a.room && !(cell && cell.door === a.room)) this.leave(a);   // 站在自己房间的门槛上还算在房间里
      if (a.room && A.ROOMS[a.room].safe) {   // 厕所：安全，固定小收入直接存入；到时间（或被敲门后的一半时间）自动出门
        const R = A.ROOMS[a.room]; a.roomTime += dt; a.stats.roomTime[a.room] += dt;
        if (!a.forced) a.banked += R.wage * dt;
        if (a.roomTime >= a.toiletCap && !a.forced) { a.forced = true; const o = this.grid.outside(a.room); this.pathTo(a, o.x, o.y); this.emit({ type: 'forced', who: a.id, room: a.room }); }
      } else if (a.room) {
        const R = A.ROOMS[a.room], k = A.stayMult(a), lock = this.locks[a.room];
        a.roomTime += dt; a.stats.roomTime[a.room] += dt;
        // 收入 = 曲线 × 空房倍率 × 双倍卡 × 堵门加成（熊 B 方向）；出门途中不再赚
        const mult = a.lure * (a.doubleT > 0 ? 2 : 1) * (lock && lock.by === a.id ? lock.inc : 1) * (this.rush ? A.RUSH.income : 1) * this.eventIncome(a.room);   // 随机事件：下午茶 / 晚霞
        if (!cell.stairs && !a.forced) a.pocket += A.rate(a.room, a.roomTime, k) * mult * dt;
        if (a.roomTime >= R.maxStay * k && !a.forced) {   // 到时间：自动出门
          a.forced = true; const o = this.grid.outside(a.room); this.pathTo(a, o.x, o.y);
          this.emit({ type: 'forced', who: a.id, room: a.room });
        }
      } else {
        a.officeTime += dt;
        a.banked += (a.officeTime > A.ECON.idleAfter ? A.ECON.idleWage : A.ECON.baseWage) * dt;   // 在办公区待太久，工资变低
        this.knock(a, dt);
        const s = A.seatOf(a.desk), atDesk = Math.hypot(a.x - s.x, a.y - s.y) <= A.ECON.depositRange;
        if (a.depositIntent && atDesk) a.depositIntent = a.pocket > 0;   // 到了但没钱：取消
        if (a.depositIntent && a.pocket > 0 && atDesk && this.deskLocked(a) > 0) {   // 工位被打翻了：等锁解开（意图保留，解开就存）
          if (!a.deskWarned) { a.deskWarned = true; this.emit({ type: 'deskLocked', who: a.id, t: this.deskLocked(a) }); }
        } else if (a.depositIntent && a.pocket > 0 && atDesk) {
          a.deskWarned = false;
          a.depositIntent = false;
          const mult = A.comboMult(a.combo) * (a.inspire || 1); let amt = a.pocket * mult; a.inspire = 0; a.pocket = 0; a.stats.deposits++;   // 灵感爆发：这次 ×1.5
          const st = this.stealBy; if (st && st.by !== a.id) { const cut = amt * A.SUPPLY.items.steal.cut; amt -= cut; const thief = this.get(st.by); thief.banked += cut; this.stealBy = null; this.emit({ type: 'stolen', who: a.id, by: thief.id, amount: cut }); }   // 抢功劳
          a.banked += amt;
          a.stats.maxCombo = Math.max(a.stats.maxCombo || 1, mult);
          this.emit({ type: 'deposit', who: a.id, amount: amt, base: amt / mult, mult, combo: a.combo }); a.combo = 0;
          this.gainXp(a, amt);
        }
      }
    }
    leave(a) {
      const id = a.room, R = A.ROOMS[id]; a.room = null; a.roomTime = 0; a.forced = false;
      a.cooldowns[id] = R.cooldown;
      if (R.safe) a.numbT = R.numb;   // 蹲完腿麻
      this.emit({ type: 'exit', who: a.id, room: id, pocket: a.pocket });
    }
    // 敲厕所门：在厕所门口站着（不走动）满 2 秒，里面的人剩余时间减半（每次只能被敲一次）
    knock(a, dt) {
      const R = A.ROOMS.toilet, o = this.grid.outside('toilet'), v = this.employees().find(e => e.room === 'toilet' && !e.forced);
      if (!v || a.moving || Math.hypot(a.x - o.x, a.y - o.y) > 1 || v.knocked) { a.knockT = 0; return; }
      a.knockT = (a.knockT || 0) + dt;
      if (a.knockT >= R.knock) { a.knockT = 0; v.knocked = true; v.toiletCap = v.roomTime + (v.toiletCap - v.roomTime) / 2; this.emit({ type: 'knock', who: v.id, by: a.id }); }
    }
    // 结算称号：按本局数据评出，没人符合就不发，最多 4 个
    awards() {
      const E = this.employees(), b = this.boss, out = [], bossOut = [];
      const top = (f, min) => { let best = null, v = min; for (const e of E) { const x = f(e); if (x >= v && (!best || x > f(best))) { best = e; v = x; } } return best; };
      // 门槛按 2.0.0 模拟的中位数附近设定，每个称号大约一半的局会出现；给老板留一个位置
      const T = A.AWARDS, add = (list, who, title, text) => { if (who) list.push({ who: who.id, name: who.name, title, text }); };
      let w = top(e => e.stats.roomTime.print, T.print); add(out, w, '打印狂人', w && '在打印室待了 ' + Math.round(w.stats.roomTime.print) + ' 秒');
      w = top(e => e.stats.roomTime.rooftop, T.rooftop); add(out, w, '天台常住民', w && '在天台待了 ' + Math.round(w.stats.roomTime.rooftop) + ' 秒');
      w = top(e => e.stats.maxCombo || 1, T.combo); add(out, w, '连摸大师', w && '一次存钱连摸 ×' + w.stats.maxCombo.toFixed(1));
      w = top(e => e.stats.caught || 0, T.caught); add(out, w, '倒霉蛋', w && '被抓了 ' + w.stats.caught + ' 次');
      w = top(e => e.stats.picks || 0, T.picks); add(out, w, '补给猎人', w && '捡了 ' + w.stats.picks + ' 个补给');
      if (b.stats.catches >= T.bossCatches) add(bossOut, b, '铁面无私', '抓到 ' + b.stats.catches + ' 人次');
      if (b.stats.empty >= T.bossEmpty) add(bossOut, b, '白跑王', '扑空 ' + b.stats.empty + ' 次');
      return out.slice(0, 4 - Math.min(1, bossOut.length)).concat(bossOut.slice(0, 1));
    }
    // 排名（按已存金额）
    ranking() { return this.employees().slice().sort((p, q) => q.banked - p.banked); }
  }
  A.installSkills(Match); A.installSupplies(Match); A.installEvents(Match);
  A.Match = Match;
})(typeof window !== 'undefined' ? window : globalThis);
