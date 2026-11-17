// 摸鱼大作战（A4，2.2.0 重做员工技能、加被动）：老板怒气与分阶段技能、员工角色技能与升级。
// 配置 + 挂到 Match.prototype 上的逻辑（纯逻辑，Node 可测）。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // —— 老板 ——
  A.ANGER = { perSec: 1.2, perCatch: 12, max: 100 };   // 2.5.0 加强：每秒 1 → 1.2，抓 1 人 10 → 12
  A.PHASE = { count: 3, len: 80, pickTime: 10, offer: 3 };   // 每 80 秒一个阶段，阶段开始时从随机 3 个技能里选 1 个（10 秒不选就随机）
  A.BOSS_SKILLS = {
    // 2.5.0 加强：冲刺更久更快；监控改为"6 秒内走近哪个房间就能看到里面"；回马枪窗口更长、每阶段 2 次；突击检查更便宜并额外 +10% 没收；临时会议自己只定身 1 秒；加倍罚款更狠
    dash:    { name: '冲刺', cost: 20, cd: 12, dur: 6, mult: 1.8, desc: '6s 移速 ×1.8' },
    peek:    { name: '监控', cost: 20, cd: 18, dur: 6, range: 4, desc: '6s 内走到门口就能看到房间里' },
    revisit: { name: '回马枪', cost: 30, cd: 0, window: 15, perPhase: 2, desc: '刚查完的房间马上再查一次' },
    raid:    { name: '突击检查', cost: 25, cd: 20, extra: 0.1, desc: '下次查房不用等，罚款 +10%' },
    meeting: { name: '临时会议', cost: 35, cd: 30, dur: 10, immune: 5, freeze: 1, desc: '叫一个摸鱼的人出来开会 10s' },
    fine:    { name: '加倍罚款', cost: 35, cd: 30, extra: 0.4, bankCut: 0.2, minPhase: 1, desc: '下次抓人罚 +40%，再扣存款 20%' },
  };
  A.BOSS_SKILL_IDS = Object.keys(A.BOSS_SKILLS);

  // —— 员工：每个角色 1 个技能；2 级二选一方向（A/B），3 级强化所选方向 ——
  A.LEVELS = { 2: 150, 3: 400 };   // 累计存入多少钱升级
  // 2.2.0 重做：兔子插队、猫打翻水杯、熊堵门（原猫头鹰锁门）、猫头鹰夜视；where：any 哪都能用 / room 只能在摸鱼房间里 / office 只能在办公区
  A.EMP_SKILLS = {
    rabbit: { name: '插队', where: 'any', base: { cd: 20, dur: 3, mult: 1.7 },
      A: [{ dur: 5 }, { dur: 6.5 }], B: [{ cd: 12 }, { cd: 8 }], nameA: '持久冲刺', nameB: '快速冷却',
      descA: '冲刺 5s（3 级 6.5s）', descB: '冷却 12s（3 级 8s）' },
    cat:    { name: '打翻水杯', where: 'office', base: { cd: 30, dur: 8, n: 1 },
      A: [{ dur: 12 }, { dur: 16 }], B: [{ n: 2 }, { n: 3 }], nameA: '泼得更狠', nameB: '连环打翻',
      descA: '锁 12s（3 级 16s）', descB: '一次翻 2 个（3 级 3 个）' },
    bear:   { name: '堵门', where: 'room', base: { cd: 40, dur: 4, inc: 1 },   // 2.2.0 模拟后冷却 30 → 40（太强）
      A: [{ dur: 6 }, { dur: 8 }], B: [{ inc: 1.5 }, { inc: 2 }], nameA: '堵得更久', nameB: '安心摸鱼',
      descA: '堵 6s（3 级 8s）', descB: '收入 ×1.5（3 级 ×2）' },
    owl:    { name: '夜视', where: 'any', base: { cd: 20, dur: 4, range: 1.6 },
      A: [{ dur: 6 }, { dur: 8 }], B: [{ range: 2 }, { range: 2.4 }], nameA: '看得更久', nameB: '千里眼',
      descA: '夜视 6s（3 级 8s）', descB: '视野 ×2（3 级 ×2.4）' },
  };
  A.EMP_SKILL_DESC = {
    rabbit: '冲刺 3s，能挤进满员房间',
    cat: '锁住同事工位 8s，他存不了钱',
    bear: '房间里用：堵门 4s，谁都进不来',
    owl: '4s 视野 ×1.6，房间里能看外面',
  };
  // 被动（2.2.0）：一直生效
  A.PASSIVES = {
    rabbit: { name: '腿长', desc: '移动速度 +10%', speed: 1.1 },
    cat:    { name: '手快', desc: '捡补给 1s', pick: 1 },
    bear:   { name: '耐蹲', desc: '房间多待 20%', stay: 1.2 },
    owl:    { name: '眼尖', desc: '视野 +2 格', sight: 2 },
    boss:   { name: '居高临下', desc: '视野 +2 格', sight: 2 },
  };
  A.stayMult = a => (A.PASSIVES[a.id] && A.PASSIVES[a.id].stay) || 1;   // 熊：最长停留与收入曲线拉长
  // 当前等级与方向下的技能参数
  A.empSkill = function (a) {
    const S = A.EMP_SKILLS[a.id], p = Object.assign({}, S.base);
    if (a.branch && a.level >= 2) Object.assign(p, S[a.branch][a.level >= 3 ? 1 : 0]);
    return p;
  };

  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

  const P = {
    initSkills() {
      const b = this.boss;
      Object.assign(b, { waitT: this.bossWait, anger: 0, skills: [], skillCd: {}, revisitUsed: {}, lastLeft: null, dashT: 0, freezeT: 0, raidNext: false, fineNext: false, peek: null });
      this.offer = null; this.phaseIdx = -1; this.locks = {}; this.deskLocks = {};
      for (const e of this.employees()) Object.assign(e, { level: 1, branch: null, xp: 0, skillCd: 0, dashT: 0, nightT: 0, numbT: 0, doubleT: 0, leaveNote: false, meetingT: 0, immuneT: 0, branchOffer: null, knockT: 0 });
    },
    phaseOf(t) { return Math.min(A.PHASE.count - 1, Math.floor(t / A.PHASE.len)); },
    // 某阶段可选的技能（没拿过的，满足阶段限制），随机 3 个
    bossOptions(phase) {
      if (this.noBossSkills) return [];
      const b = this.boss, pool = A.BOSS_SKILL_IDS.filter(id => !b.skills.includes(id) && (A.BOSS_SKILLS[id].minPhase || 0) <= phase);
      const out = [], arr = pool.slice();
      while (out.length < A.PHASE.offer && arr.length) out.push(arr.splice(Math.floor(this.rng() * arr.length), 1)[0]);
      return out;
    },
    pickBossSkill(id) {
      const o = this.offer; if (!o || !o.options.includes(id)) return false;
      this.boss.skills.push(id); this.offer = null; this.emit({ type: 'bossPick', skill: id, phase: o.phase }); return true;
    },
    updateSkills(dt) {
      const b = this.boss, ph = this.phaseOf(this.time);
      if (ph > this.phaseIdx) {   // 新阶段：给老板 3 个技能选
        if (this.offer) this.pickBossSkill(pick(this.offer.options, this.rng));
        this.phaseIdx = ph; const options = this.bossOptions(ph);
        if (options.length) {
          this.offer = { phase: ph, options, t: A.PHASE.pickTime };
          this.emit({ type: 'phase', phase: ph });
          if (!b.isPlayer) this.pickBossSkill(pick(options, this.rng));
        }
      }
      if (this.offer) { this.offer.t -= dt; if (this.offer.t <= 0) this.pickBossSkill(pick(this.offer.options, this.rng)); }
      if (b.waitT > 0) {   // 开局等待：时间到直接出现在办公区正中间
        b.waitT = Math.max(0, b.waitT - dt);
        if (b.waitT === 0) { b.x = A.BOSS_ARRIVE.x; b.y = A.BOSS_ARRIVE.y; b.path = []; b.dir = { x: 0, y: 0 }; this.emit({ type: 'bossArrive' }); }
      }
      b.anger = Math.min(A.ANGER.max, b.anger + A.ANGER.perSec * dt);
      for (const k in b.skillCd) b.skillCd[k] = Math.max(0, b.skillCd[k] - dt);
      b.dashT = Math.max(0, b.dashT - dt); b.freezeT = Math.max(0, b.freezeT - dt);
      if (b.peek) { b.peek.t -= dt; if (b.peek.t <= 0) b.peek = null; }
      for (const r in this.locks) { this.locks[r].t -= dt; if (this.locks[r].t <= 0) delete this.locks[r]; }
      for (const d in this.deskLocks) { this.deskLocks[d] -= dt; if (this.deskLocks[d] <= 0) { delete this.deskLocks[d]; this.emit({ type: 'deskFree', desk: +d }); } }
      for (const e of this.employees()) {
        e.skillCd = Math.max(0, e.skillCd - dt); e.dashT = Math.max(0, e.dashT - dt); e.nightT = Math.max(0, e.nightT - dt); e.numbT = Math.max(0, e.numbT - dt);
        e.doubleT = Math.max(0, e.doubleT - dt); e.immuneT = Math.max(0, e.immuneT - dt);
        if (e.branchOffer) { e.branchOffer.t -= dt; if (e.branchOffer.t <= 0) this.chooseBranch(e, this.rng() < 0.5 ? 'A' : 'B'); }
        if (e.meetingT > 0) {   // 开会结束：短暂免抓
          e.meetingT = Math.max(0, e.meetingT - dt);
          if (e.meetingT === 0) { e.immuneT = A.BOSS_SKILLS.meeting.immune; this.emit({ type: 'meetingDone', who: e.id }); }
        }
      }
    },
    // 老板放技能；arg：监控的房间
    useBossSkill(id, arg) {
      const b = this.boss, S = A.BOSS_SKILLS[id], fail = reason => { this.emit({ type: 'skillFail', who: 'boss', skill: id, reason }); return false; };
      if (this.phase !== 'playing' || !S || !b.skills.includes(id)) return false;
      if (b.waitT > 0) return fail('wait');
      if ((b.skillCd[id] || 0) > 0) return fail('cooldown');
      if (b.anger < S.cost) return fail('anger');
      if (id === 'dash') b.dashT = S.dur;
      else if (id === 'peek') b.peek = { t: S.dur };   // 2.5.0：不用选房间，持续期间走近哪间看哪间（见 peekRooms）
      else if (id === 'revisit') {
        const ph = this.phaseOf(this.time), L = b.lastLeft;
        if ((b.revisitUsed[ph] || 0) >= S.perPhase) return fail('used');
        if (!L || this.time - L.t > S.window || b.room || b.stay > 0) return fail('window');
        if (this.locks[L.room]) return fail('locked');
        b.cooldowns[L.room] = 0; b.revisitUsed[ph] = (b.revisitUsed[ph] || 0) + 1;
        const cells = this.grid.roomCells(L.room), k = cells[Math.floor(this.rng() * cells.length)]; this.pathTo(b, k.c + 0.5, k.r + 0.5);
      } else if (id === 'raid') b.raidNext = true;
      else if (id === 'meeting') {
        const list = this.employees().filter(e => e.room && A.ROOMS[e.room].slack && !e.forced && e.immuneT <= 0 && e.meetingT <= 0);
        if (!list.length) return fail('noTarget');
        const v = pick(list, this.rng); this.sendToMeeting(v); b.freezeT = S.freeze; b.path = [];
      } else if (id === 'fine') b.fineNext = true;
      b.anger -= S.cost; b.skillCd[id] = S.cd;
      this.emit({ type: 'bossSkill', skill: id, room: arg });
      return true;
    },
    // 临时会议（2.2.0）：被叫出房间，站在门口原地开会（不再传送到会议室）
    sendToMeeting(v) {
      const room = v.room; v.forced = true; this.leave(v); v.forced = false; v.path = []; v.dir = { x: 0, y: 0 };
      const o = this.grid.outside(room); v.x = o.x; v.y = o.y; v.meetingT = A.BOSS_SKILLS.meeting.dur;
      this.emit({ type: 'meeting', who: v.id, room });
    },
    // 监控中、老板在办公区时，门在 4 格内的摸鱼房间（看得到里面）
    peekRooms() {
      const b = this.boss; if (!b.peek || b.room || b.waitT > 0) return [];
      return A.SLACK_ROOMS.filter(id => { const o = this.grid.outside(id); return Math.hypot(b.x - o.x, b.y - o.y) <= A.BOSS_SKILLS.peek.range; });
    },
    // 猫：能打翻的工位（视野里、别人的、还没被锁的），存款多的优先
    deskTargets(a) {
      return this.employees().filter(e => e !== a && !(this.deskLocks[e.desk.id] > 0) && (() => { const s = A.seatOf(e.desk); return A.inSight(a, s.x, s.y); })()).sort((p, q) => q.banked - p.banked);
    },
    // 员工放技能
    useEmpSkill(a) {
      const S = A.EMP_SKILLS[a.id], p = A.empSkill(a), fail = reason => { this.emit({ type: 'skillFail', who: a.id, skill: a.id, reason }); return false; };
      if (this.phase !== 'playing' || !S || a.meetingT > 0) return false;
      if (a.skillCd > 0) return fail('cooldown');
      if (S.where === 'room' && (!a.room || a.forced || !A.ROOMS[a.room].slack)) return fail('room');
      if (S.where === 'office' && a.room) return fail('office');
      let targets = null;
      if (a.id === 'rabbit') a.dashT = p.dur;
      else if (a.id === 'cat') {   // 打翻水杯：锁住视野里 n 个同事的工位
        targets = this.deskTargets(a).slice(0, p.n); if (!targets.length) return fail('noTarget');
        for (const e of targets) { this.deskLocks[e.desk.id] = p.dur; this.emit({ type: 'deskLock', who: e.id, by: a.id, desk: e.desk.id, t: p.dur }); }
        targets = targets.map(e => e.id);
      }
      else if (a.id === 'bear') { this.locks[a.room] = { t: p.dur, t0: p.dur, by: a.id, inc: p.inc }; }   // 堵门
      else if (a.id === 'owl') a.nightT = p.dur;   // 夜视
      a.skillCd = p.cd;
      this.emit({ type: 'empSkill', who: a.id, skill: a.id, room: a.room, targets });
      return true;
    },
    // 升级：累计存入的钱；培训手册直接升一级
    gainXp(a, amt) { a.xp += amt; while (a.level < 3 && a.xp >= A.LEVELS[a.level + 1]) this.levelUp(a, 'xp'); },
    levelUp(a, how) {
      if (a.level >= 3) return false;
      a.level++;
      if (a.level === 2) { if (a.isPlayer) a.branchOffer = { t: A.PHASE.pickTime }; else this.chooseBranch(a, this.rng() < 0.5 ? 'A' : 'B'); }
      if (a.level === 3 && !a.branch) this.chooseBranch(a, this.rng() < 0.5 ? 'A' : 'B');
      this.emit({ type: 'levelUp', who: a.id, level: a.level, how });
      return true;
    },
    chooseBranch(a, br) { if (a.branch || (br !== 'A' && br !== 'B')) return false; a.branch = br; a.branchOffer = null; this.emit({ type: 'branch', who: a.id, branch: br }); return true; },
  };
  A.installSkills = M => Object.assign(M.prototype, P);
})(typeof window !== 'undefined' ? window : globalThis);
