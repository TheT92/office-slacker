// 摸鱼大作战：AI 员工。三种性格，只用自己身份能拿到的信息：
// 在办公区能看到老板在哪、各房间门牌（人数、空房倍率）；在房间里什么也看不到，只按自己的计划待多久。
// 只通过和玩家相同的指令操作（moveTo / exitRoom / goDesk）。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // pref：房间偏好；leave：在房间待到 爬升时间 × [min,max] 就走；bank：口袋到这个数就回工位存；wait：两趟之间在办公区等多久；
  // chain：口袋没到 bank 时出门后接着去下一个房间的概率；follow：老板刚查完某房间时跟进去的概率；avoidBoss：老板离门口多近（格）就不去那个房间
  A.PERSONALITIES = {
    steady: { name: '稳健型', pref: { pantry: 3, restroom: 1.5, rooftop: 1 }, leave: [0.55, 0.9], bank: 25, wait: [2.5, 5], chain: 0.15, follow: 0, avoidBoss: 5 },
    greedy: { name: '贪心型', pref: { rooftop: 3, restroom: 2, pantry: 1 }, leave: [1.0, 1.35], bank: 90, wait: [1, 3], chain: 0.75, follow: 0.1, avoidBoss: 2 },
    savvy:  { name: '精明型', pref: { restroom: 2, pantry: 2, rooftop: 2 }, leave: [0.35, 0.65], bank: 45, wait: [1.5, 3.5], chain: 0.4, follow: 0.85, avoidBoss: 4 },
  };
  A.PERSONALITY_IDS = ['steady', 'greedy', 'savvy'];

  class EmployeeAI {
    constructor(match, emp, rng, kind) {
      this.m = match; this.e = emp; this.rng = rng;
      this.kind = kind || A.PERSONALITY_IDS[Math.floor(rng() * 3)];
      this.p = A.PERSONALITIES[this.kind]; emp.personality = this.kind;
      this.mode = 'office'; this.t = this.range(this.p.wait) * 0.6; this.plan = 0; this.react = 0;
      this.lastBossRoom = null; this.followRoom = null; this.followTimer = 0;
    }
    range(r) { return r[0] + this.rng() * (r[1] - r[0]); }
    think(dt) {
      const m = this.m, e = this.e, b = m.boss;
      if (m.phase !== 'playing' || m.busy(e)) return;
      this.useSkill();
      // 在办公区才看得到老板：老板刚从某个房间出来，记下来（精明型会跟进去）
      if (!e.room) {
        if (this.lastBossRoom && !b.room && this.rng() < this.p.follow) { this.followRoom = this.lastBossRoom; this.followTimer = 0.4 + this.rng() * 0.8; }
        this.lastBossRoom = b.room;
      }
      if (this.react > 0) { this.react -= dt; return; }   // 反应延迟（犹豫）
      if (e.room) {   // 在房间里：按计划待够就走（看不到外面）；房里有补给就过去捡
        this.mode = 'inroom'; this.lastBossRoom = null; this.followRoom = null;
        const s = m.supplies.find(s => s.room === e.room);
        if (s && !e.path.length && Math.hypot(e.x - s.x, e.y - s.y) > 0.3) m.moveTo(e, s.x, s.y);
        if (e.roomTime >= this.plan) { m.exitRoom(e); this.mode = 'out'; this.react = 0.2 + this.rng() * 0.5; }
        return;
      }
      if (this.mode === 'going') {   // 正在去某个房间
        if (!e.path.length) { this.mode = 'office'; this.t = 0.5; }
        else if (m.entryBlock(e, this.target)) { e.path = []; this.mode = 'office'; this.t = 0.3 + this.rng(); }   // 半路满了 / 老板进去了
        return;
      }
      if (this.mode === 'out') {   // 刚出门：存钱还是接着去
        if (m.left < 15 || e.pocket >= this.p.bank || this.rng() > this.p.chain) { m.goDesk(e); this.mode = 'banking'; }
        else { this.mode = 'office'; this.t = 0.2; }
        return;
      }
      if (this.mode === 'banking') { if (e.pocket < 1 || !e.path.length) { this.mode = 'office'; this.t = this.range(this.p.wait); } return; }
      // 在办公区
      if (this.followRoom) {
        this.followTimer -= dt;
        if (this.followTimer <= 0) { const r = this.followRoom; this.followRoom = null; if (this.go(r)) return; }
      }
      if (e.pocket >= this.p.bank || (m.left < 15 && e.pocket >= 1)) { m.goDesk(e); this.mode = 'banking'; return; }
      if (m.left < 12) return;   // 快下班了，别再冒险
      this.t -= dt; if (this.t > 0) return;
      const pick = this.choose();
      if (!pick || !this.go(pick)) this.t = 0.8 + this.rng() * 1.2;
    }
    // 按偏好 × 空房倍率随机挑一个能进、而且老板不在附近的房间
    choose() {
      const m = this.m, e = this.e, b = m.boss, opts = [];
      for (const id of A.SLACK_ROOMS) {
        if (m.entryBlock(e, id)) continue;
        const o = m.grid.outside(id); if (Math.hypot(b.x - o.x, b.y - o.y) < this.p.avoidBoss) continue;
        opts.push({ id, w: this.p.pref[id] * m.lure(id) * (m.supplies.some(s => s.room === id) ? 2 : 1) });   // 有补给的房间更想去
      }
      if (!opts.length) return null;
      let r = this.rng() * opts.reduce((s, o) => s + o.w, 0);
      for (const o of opts) { r -= o.w; if (r <= 0) return o.id; }
      return opts[opts.length - 1].id;
    }
    // 角色技能：兔子路上冲刺；猫进门放替身；熊进门久蹲（并多待一会儿）；猫头鹰进门锁门
    useSkill() {
      const m = this.m, e = this.e; if (e.skillCd > 0) return;
      const fresh = e.room && e.roomTime < 1.2 && !e.forced;
      if (e.id === 'rabbit' && (this.mode === 'going' || this.mode === 'banking') && e.path.length && Math.hypot(e.path[e.path.length - 1].x - e.x, e.path[e.path.length - 1].y - e.y) > 5) m.useEmpSkill(e);
      else if (e.id === 'cat' && fresh) m.useEmpSkill(e);
      else if (e.id === 'bear' && fresh && !e.squat) { if (m.useEmpSkill(e)) this.plan = Math.min(A.ROOMS[e.room].maxStay * e.squat.k - 0.5, this.plan * e.squat.k); }
      else if (e.id === 'owl' && fresh) m.useEmpSkill(e);
    }
    go(id) {
      const m = this.m, e = this.e; if (m.entryBlock(e, id)) return false;
      const cells = m.grid.roomCells(id), k = cells[Math.floor(this.rng() * cells.length)];
      if (!m.moveTo(e, k.c + 0.5, k.r + 0.5)) return false;
      const R = A.ROOMS[id];
      this.target = id; this.mode = 'going';
      this.plan = Math.max(A.ECON.minStay + 0.2, Math.min(R.maxStay - 0.5, R.rise * this.range(this.p.leave) + (this.rng() < 0.1 ? 3 : 0)));   // 偶尔多待一会儿（失误）；至少待满最少停留
      return true;
    }
  }
  A.EmployeeAI = EmployeeAI;
})(typeof window !== 'undefined' ? window : globalThis);
