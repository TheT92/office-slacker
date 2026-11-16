// 摸鱼大作战（A4）：老板怒气与分阶段技能、员工角色技能与升级。
// 配置 + 挂到 Match.prototype 上的逻辑（纯逻辑，Node 可测）。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // —— 老板 ——
  A.ANGER = { perSec: 1, perCatch: 10, max: 100 };
  A.PHASE = { count: 3, len: 80, pickTime: 10, offer: 3 };   // 每 80 秒一个阶段，阶段开始时从随机 3 个技能里选 1 个（10 秒不选就随机）
  A.BOSS_SKILLS = {
    dash:    { name: '冲刺', cost: 20, cd: 15, dur: 5, mult: 1.6, desc: '5 秒内移动 ×1.6' },
    peek:    { name: '监控', cost: 25, cd: 20, dur: 3, desc: '偷看一个房间 3 秒（点技能后再点房间）' },
    revisit: { name: '回马枪', cost: 30, cd: 0, window: 10, desc: '刚离开的房间无视冷却再查一次（离开后 10 秒内，每阶段 1 次）' },
    raid:    { name: '突击检查', cost: 25, cd: 25, offense: 40, desc: '下一次查房不用逗留、无视冷却，但冒犯值 +40' },
    meeting: { name: '临时会议', cost: 35, cd: 30, dur: 8, immune: 5, freeze: 3, desc: '随机拉走一个正在摸鱼的人开会 8 秒（他的口袋保留），自己定身 3 秒' },
    fine:    { name: '加倍罚款', cost: 40, cd: 30, extra: 0.3, bankCut: 0.15, minPhase: 1, desc: '下一次抓人没收比例 +30%，另扣对方存款的 15%（第 2 阶段起）' },
  };
  A.BOSS_SKILL_IDS = Object.keys(A.BOSS_SKILLS);

  // —— 员工：每个角色 1 个技能；2 级二选一方向（A/B），3 级强化所选方向 ——
  A.LEVELS = { 2: 150, 3: 400 };   // 累计存入多少钱升级
  A.EMP_SKILLS = {
    rabbit: { name: '冲刺', where: 'any', base: { cd: 20, dur: 3, mult: 1.7 },
      A: [{ dur: 5 }, { dur: 6.5 }], B: [{ cd: 10 }, { cd: 7 }], nameA: '持久冲刺', nameB: '快速冷却',
      descA: '冲刺持续更久（5 秒 / 3 级 6.5 秒）', descB: '冷却更短（10 秒 / 3 级 7 秒）' },
    cat:    { name: '替身', where: 'any', base: { cd: 35, dur: 15, cut: 0 },
      A: [{ dur: 25 }, { dur: 35 }], B: [{ cut: 0.3 }, { cut: 0.5 }], nameA: '以假乱真', nameB: '替身挡枪',
      descA: '替身持续更久（25 秒 / 3 级 35 秒）', descB: '替身期间被抓少扣（−30% / 3 级 −50%）' },
    bear:   { name: '久蹲', where: 'room', base: { cd: 30, k: 1.5, loss: 1 },
      A: [{ k: 1.8 }, { k: 2.1 }], B: [{ loss: 0.5 }, { loss: 0.35 }], nameA: '坐穿马桶', nameB: '皮糙肉厚',
      descA: '这一趟最长停留与收入爬升 ×1.8 / 3 级 ×2.1', descB: '久蹲期间被抓只扣一半 / 3 级扣 35%' },
    owl:    { name: '锁门', where: 'room', base: { cd: 30, dur: 4, inc: 1 },
      A: [{ dur: 6 }, { dur: 8 }], B: [{ inc: 1.5 }, { inc: 2 }], nameA: '双重门锁', nameB: '安心摸鱼',
      descA: '锁更久（6 秒 / 3 级 8 秒）', descB: '锁门期间收入 ×1.5 / 3 级 ×2' },
  };
  A.EMP_SKILL_DESC = {
    rabbit: '3 秒内移动 ×1.7', cat: '工位上留假身 15 秒，老板看到的是"你在工位"', bear: '这一趟最长停留与收入爬升 ×1.5（在房间里用）', owl: '把门锁 4 秒，老板进不来（在房间里用）',
  };
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
      this.offer = null; this.phaseIdx = -1; this.locks = {};
      for (const e of this.employees()) Object.assign(e, { level: 1, branch: null, xp: 0, skillCd: 0, dashT: 0, decoyT: 0, squat: null, doubleT: 0, leaveNote: false, meetingT: 0, immuneT: 0, branchOffer: null, lockRoom: null });
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
      if (b.hr <= 0) b.anger = Math.min(A.ANGER.max, b.anger + A.ANGER.perSec * dt);
      for (const k in b.skillCd) b.skillCd[k] = Math.max(0, b.skillCd[k] - dt);
      b.dashT = Math.max(0, b.dashT - dt); b.freezeT = Math.max(0, b.freezeT - dt);
      if (b.peek) { b.peek.t -= dt; if (b.peek.t <= 0) b.peek = null; }
      for (const r in this.locks) { this.locks[r].t -= dt; if (this.locks[r].t <= 0) delete this.locks[r]; }
      for (const e of this.employees()) {
        e.skillCd = Math.max(0, e.skillCd - dt); e.dashT = Math.max(0, e.dashT - dt); e.decoyT = Math.max(0, e.decoyT - dt);
        e.doubleT = Math.max(0, e.doubleT - dt); e.immuneT = Math.max(0, e.immuneT - dt);
        if (e.branchOffer) { e.branchOffer.t -= dt; if (e.branchOffer.t <= 0) this.chooseBranch(e, this.rng() < 0.5 ? 'A' : 'B'); }
        if (e.meetingT > 0) {   // 开会结束：回到会议室门外，短暂免抓
          e.meetingT = Math.max(0, e.meetingT - dt);
          if (e.meetingT === 0) { const o = this.grid.outside('meeting'); e.x = o.x; e.y = o.y; e.immuneT = A.BOSS_SKILLS.meeting.immune; this.emit({ type: 'meetingDone', who: e.id }); }
        }
      }
    },
    // 老板放技能；arg：监控的房间
    useBossSkill(id, arg) {
      const b = this.boss, S = A.BOSS_SKILLS[id], fail = reason => { this.emit({ type: 'skillFail', who: 'boss', skill: id, reason }); return false; };
      if (this.phase !== 'playing' || !S || !b.skills.includes(id)) return false;
      if (b.hr > 0) return fail('hr');
      if (b.waitT > 0) return fail('wait');
      if ((b.skillCd[id] || 0) > 0) return fail('cooldown');
      if (b.anger < S.cost) return fail('anger');
      if (id === 'dash') b.dashT = S.dur;
      else if (id === 'peek') {
        if (!A.ROOMS[arg] || !A.ROOMS[arg].slack) return fail('target');
        if (b.room) return fail('inRoom');
        b.peek = { room: arg, t: S.dur };
      } else if (id === 'revisit') {
        const ph = this.phaseOf(this.time), L = b.lastLeft;
        if (b.revisitUsed[ph]) return fail('used');
        if (!L || this.time - L.t > S.window || b.room || b.stay > 0) return fail('window');
        if (this.locks[L.room]) return fail('locked');
        b.cooldowns[L.room] = 0; b.revisitUsed[ph] = true;
        const cells = this.grid.roomCells(L.room), k = cells[Math.floor(this.rng() * cells.length)]; this.pathTo(b, k.c + 0.5, k.r + 0.5);
      } else if (id === 'raid') b.raidNext = true;
      else if (id === 'meeting') {
        const list = this.employees().filter(e => e.room && !e.forced && e.immuneT <= 0 && e.meetingT <= 0);
        if (!list.length) return fail('noTarget');
        const v = pick(list, this.rng); this.sendToMeeting(v); b.freezeT = S.freeze; b.path = [];
      } else if (id === 'fine') b.fineNext = true;
      b.anger -= S.cost; b.skillCd[id] = S.cd;
      this.emit({ type: 'bossSkill', skill: id, room: arg });
      return true;
    },
    sendToMeeting(v) {
      const room = v.room; v.forced = true; this.leave(v); v.forced = false; v.path = []; v.dir = { x: 0, y: 0 }; v.squat = null;
      const cells = this.grid.cells.filter(k => k.room === 'meeting'), k = cells[Math.floor(cells.length / 2)];
      v.x = k.c + 0.5; v.y = k.r + 0.5; v.meetingT = A.BOSS_SKILLS.meeting.dur;
      this.emit({ type: 'meeting', who: v.id, room });
    },
    // 员工放技能
    useEmpSkill(a) {
      const S = A.EMP_SKILLS[a.id], p = A.empSkill(a), fail = reason => { this.emit({ type: 'skillFail', who: a.id, skill: a.id, reason }); return false; };
      if (this.phase !== 'playing' || !S || a.meetingT > 0) return false;
      if (a.skillCd > 0) return fail('cooldown');
      if (S.where === 'room' && (!a.room || a.forced)) return fail('room');
      if (a.id === 'rabbit') a.dashT = p.dur;
      else if (a.id === 'cat') a.decoyT = p.dur;
      else if (a.id === 'bear') { if (a.squat) return fail('used'); a.squat = { k: p.k, loss: p.loss }; }
      else if (a.id === 'owl') { this.locks[a.room] = { t: p.dur, by: a.id, inc: p.inc }; }
      a.skillCd = p.cd;
      this.emit({ type: 'empSkill', who: a.id, skill: a.id, room: a.room });
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
