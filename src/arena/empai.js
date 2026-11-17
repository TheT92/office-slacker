// 摸鱼大作战：AI 员工。三种性格，只用自己身份能拿到的信息：
// 在办公区只看得到自己视野（A.SIGHT）里的东西：视野里的老板、视野里的门牌；在房间里什么也看不到，只按自己的计划待多久。
// 只通过和玩家相同的指令操作（moveTo / exitRoom / goDesk）。
// 2.5.0 更聪明：记住最后看见老板的位置和他刚查过的房间；按口袋大小和风险决定待多久、要不要连摸；
// 跟着随机事件走（加倍的房间、被点名先躲）；下班冲刺更激进但留足回工位的时间；技能和道具优先对付领先者；会敲厕所门。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // pref：房间偏好；leave：在房间待到 爬升时间 × [min,max] 就走；bank：口袋到这个数就回工位存；wait：两趟之间在办公区等多久；
  // chain：口袋没到 bank 时出门后接着去下一个房间的概率；follow：老板刚查完某房间时跟进去的概率；avoidBoss：老板离门口多近（格）就不去那个房间
  A.PERSONALITIES = {
    steady: { name: '稳健型', pref: { pantry: 3, print: 1.5, rooftop: 1 }, leave: [0.55, 0.9], bank: 25, wait: [2.5, 5], chain: 0.15, follow: 0, avoidBoss: 5 },
    greedy: { name: '贪心型', pref: { rooftop: 3, print: 2, pantry: 1 }, leave: [1.0, 1.35], bank: 90, wait: [1, 3], chain: 0.75, follow: 0.1, avoidBoss: 2 },
    savvy:  { name: '精明型', pref: { print: 2, pantry: 2, rooftop: 2 }, leave: [0.35, 0.65], bank: 45, wait: [1.5, 3.5], chain: 0.4, follow: 0.85, avoidBoss: 4 },
  };
  A.PERSONALITY_IDS = ['steady', 'greedy', 'savvy'];

  class EmployeeAI {
    constructor(match, emp, rng, kind) {
      this.m = match; this.e = emp; this.rng = rng;
      this.kind = kind || A.PERSONALITY_IDS[Math.floor(rng() * 3)];
      this.p = A.PERSONALITIES[this.kind]; emp.personality = this.kind;
      this.mode = 'office'; this.t = this.range(this.p.wait) * 0.6; this.plan = 0; this.react = 0;
      this.lastBossRoom = null; this.followRoom = null; this.followTimer = 0;
      this.bossSeen = null;      // 最后一次看见老板：{ x, y, t }
      this.bossChecked = {};     // 亲眼看到老板进过的房间 → 时间（刚查过 = 接下来几秒安全）
    }
    // 记忆：看得见老板时记下位置；门在视野里时看得到老板进了哪间
    remember() {
      const m = this.m, b = m.boss;
      if (this.bossInSight()) this.bossSeen = { x: b.x, y: b.y, t: m.time };
      if (b.room && this.doorInSight(b.room)) { this.bossChecked[b.room] = m.time; this.bossSeen = null; }
    }
    // 某个房间现在去有多危险：0（安全）~ 1（老板就在门口）
    danger(id) {
      const m = this.m, o = m.grid.outside(id), B = this.bossSeen;
      if (this.bossInSight() && Math.hypot(m.boss.x - o.x, m.boss.y - o.y) < this.p.avoidBoss) return 1;
      if (B && m.time - B.t < 8 && Math.hypot(B.x - o.x, B.y - o.y) < 6) return 0.7 * (1 - (m.time - B.t) / 8);
      return 0;
    }
    // 老板刚查过（6~12 秒内）：查完有冷却，暂时安全
    justChecked(id) { const t = this.bossChecked[id]; return t != null && this.m.time - t > A.ROOMS[id].bossStay && this.m.time - t < A.ROOMS[id].bossStay + 7; }
    // 从这里走回工位要多久（秒）
    homeTime() { const e = this.e, s = A.seatOf(e.desk); return Math.hypot(e.x - s.x, e.y - s.y) / A.MOVE.employee * 1.3 + 2; }
    range(r) { return r[0] + this.rng() * (r[1] - r[0]); }
    // 视野：只看得到自己周围一块
    bossInSight() { const b = this.m.boss; return !b.room && !(b.waitT > 0) && A.inSight(this.e, b.x, b.y); }
    doorInSight(id) { const o = this.m.grid.outside(id); return A.inSight(this.e, o.x, o.y); }
    think(dt) {
      const m = this.m, e = this.e, b = m.boss;
      if (m.phase !== 'playing' || m.busy(e)) return;
      this.remember();
      this.useSkill();
      // 在办公区、而且那扇门在视野里才看得到：老板刚从某个房间出来，记下来（精明型会跟进去）
      if (!e.room) {
        const seenRoom = b.room && this.doorInSight(b.room) ? b.room : null;
        if (this.lastBossRoom && !b.room && this.bossInSight() && this.rng() < this.p.follow) { this.followRoom = this.lastBossRoom; this.followTimer = 0.4 + this.rng() * 0.8; }
        this.lastBossRoom = seenRoom;
      }
      if (this.react > 0) { this.react -= dt; return; }   // 反应延迟（犹豫）
      if (e.room) {   // 在房间里：按计划待够就走（看不到外面）；房里有补给就过去捡
        this.mode = 'inroom'; this.lastBossRoom = null; this.followRoom = null;
        if (A.ROOMS[e.room].safe) return;   // 厕所：待到时间自动出门
        const s = m.supplies.find(s => s.room === e.room);
        if (s && !e.path.length && Math.hypot(e.x - s.x, e.y - s.y) > 0.3) m.moveTo(e, s.x, s.y);
        // 看风险出门：口袋已经很鼓（被抓扣得多）就早点走；被点名、快下班赶紧走
        const risky = e.pocket > Math.max(70, this.p.bank * 2.2) && e.roomTime > A.ECON.minStay + 1;
        const late = m.left < this.homeTime() + 3, spotted = e.spottedT > 0;
        if (e.roomTime >= this.plan || ((risky || late || spotted) && !m.mustStay(e))) { m.exitRoom(e); this.mode = 'out'; this.react = 0.15 + this.rng() * 0.35; }
        return;
      }
      if (this.mode === 'going') {   // 正在去某个房间
        if (!e.path.length) { this.mode = 'office'; this.t = 0.5; }
        else if (m.entryBlock(e, this.target)) {   // 半路满了 / 老板进去了：兔子满员时冲刺插队
          if (e.id === 'rabbit' && m.entryBlock(e, this.target) === 'full' && e.skillCd <= 0 && m.useEmpSkill(e)) return;
          e.path = []; this.mode = 'office'; this.t = 0.3 + this.rng();
        }
        return;
      }
      if (this.mode === 'out') {   // 刚出门：存钱还是接着连摸（老板刚查过别处 / 冲刺时更愿意连摸）
        const safeNext = A.SLACK_ROOMS.some(id => this.justChecked(id) && !m.entryBlock(e, id));
        const chain = Math.min(0.95, this.p.chain * (safeNext ? 1.6 : 1) * (m.rush ? 1.5 : 1) * (this.danger(A.SLACK_ROOMS[0]) > 0.6 ? 0.5 : 1));
        if (m.left < this.homeTime() + 6 || e.pocket >= this.p.bank * (m.rush ? 1.5 : 1) || this.rng() > chain) { m.goDesk(e); this.mode = 'banking'; }
        else { this.mode = 'office'; this.t = 0.1; }
        return;
      }
      if (this.mode === 'knock') { if (!m.occupants('toilet').length || m.time - this.knockStart > 4) { this.mode = 'office'; this.t = 0.2; if (!m.entryBlock(e, 'toilet')) this.go('toilet'); } return; }
      if (this.mode === 'bag') { if (!e.path.length || !m.bags.length) { this.mode = 'office'; this.t = 0.3; } return; }
      if (!e.room && this.mode !== 'going' && m.bags && m.bags.length) {   // 发红包：看得见的红包去捡
        const g = m.bags.filter(g => A.inSight(e, g.x, g.y)).sort((p, q) => Math.hypot(p.x - e.x, p.y - e.y) - Math.hypot(q.x - e.x, q.y - e.y))[0];
        if (g && m.moveTo(e, g.x, g.y)) { this.mode = 'bag'; return; }
      }
      if (this.mode === 'banking') { if (e.pocket < 1 || (!e.path.length && !(m.deskLocked(e) > 0))) { this.mode = 'office'; this.t = this.range(this.p.wait); } return; }   // 工位被锁就站着等
      // 在办公区
      if (this.followRoom) {
        this.followTimer -= dt;
        if (this.followTimer <= 0) { const r = this.followRoom; this.followRoom = null; if (this.go(r)) return; }
      }
      if (e.pocket >= this.p.bank * (m.rush ? 1.5 : 1) || (m.left < this.homeTime() + 4 && e.pocket >= 1)) { m.goDesk(e); this.mode = 'banking'; return; }
      if (m.left < this.homeTime() + 8) return;   // 来不及再摸一趟了
      this.t -= m.rush ? dt * 2 : dt; if (this.t > 0) return;   // 下班冲刺：动作更快
      if (e.id === 'owl' && e.skillCd <= 0 && !(e.nightT > 0)) { m.useEmpSkill(e); return; }   // 猫头鹰：出发前先夜视看看老板在哪
      // 厕所里蹲着的是领先者 / 已经待了一阵：过去敲门，把他的时间砍一半
      const sitter = m.occupants('toilet').find(x => x.kind === 'employee' && x !== e && !x.knocked);
      if (sitter && (sitter.banked >= e.banked || sitter.roomTime > 3) && this.rng() < 0.3) {
        const o = m.grid.outside('toilet');
        if (Math.hypot(o.x - e.x, o.y - e.y) < 14 && m.moveTo(e, o.x, o.y)) { this.mode = 'knock'; this.knockStart = m.time; return; }
      }
      const pick = this.choose();
      if (!pick || !this.go(pick)) {   // 没地方摸：工资变低了就去厕所歇一会儿（安全的小收入）；有人就去敲门
        if (e.officeTime > A.ECON.idleAfter * 0.5 && e.pocket < 1 && this.rng() < 0.5) {
          const why = m.entryBlock(e, 'toilet');
          if (!why && this.go('toilet')) return;
          if (why === 'full') { const o = m.grid.outside('toilet'); if (m.moveTo(e, o.x, o.y)) { this.mode = 'knock'; this.knockStart = m.time; return; } }
        }
        this.t = 0.6 + this.rng() * 1;
      }
    }
    // 按偏好 × 空房倍率随机挑一个能进、而且老板不在附近的房间
    choose() {
      const m = this.m, e = this.e, b = m.boss, opts = [];   // lure（门牌上的倍率）只是偏好，看不见也按经验估
      void b;
      for (const id of A.SLACK_ROOMS) {
        const why = m.entryBlock(e, id);
        const bumpable = why === 'full' && e.id === 'rabbit' && e.skillCd <= 0 && m.occupants(id).some(x => x.kind === 'employee' && !x.forced);
        if (why && !bumpable) continue;   // 兔子：满员也能冲过去插队
        const d = this.danger(id); if (d >= 1) continue;   // 老板就在门口：不去
        let w = this.p.pref[id] * m.lure(id) * (m.supplies.some(s => s.room === id) ? 2 : 1);   // 有补给的房间更想去
        w *= m.eventIncome(id) > 1 ? 3 : 1;                       // 下午茶 / 晚霞：抢着去加倍的房间
        w *= this.justChecked(id) ? 1 + 2 * (this.p.follow + 0.4) : 1;   // 老板刚查过：暂时安全
        w *= 1 - d * 0.85;                                        // 刚在附近看见过老板：少去
        opts.push({ id, w });
      }
      if (!opts.length) return null;
      let r = this.rng() * opts.reduce((s, o) => s + o.w, 0);
      for (const o of opts) { r -= o.w; if (r <= 0) return o.id; }
      return opts[opts.length - 1].id;
    }
    // 角色技能（2.2.0）：兔子路上冲刺 / 满员插队；猫锁看得见的、口袋鼓或领先的同事的工位（最后 40 秒见谁锁谁）；熊进门堵门；猫头鹰快出门前夜视看看老板在不在门口
    useSkill() {
      const m = this.m, e = this.e;
      if (e.item) this.useItem();
      if (e.skillCd > 0) return;
      const fresh = e.room && A.ROOMS[e.room].slack && e.roomTime < 1.2 && !e.forced;
      if (e.id === 'rabbit' && (this.mode === 'going' || this.mode === 'banking') && e.path.length && Math.hypot(e.path[e.path.length - 1].x - e.x, e.path[e.path.length - 1].y - e.y) > 5) m.useEmpSkill(e);
      else if (e.id === 'cat' && !e.room) {   // 打翻水杯：锁口袋鼓的、或者领先自己的；最后 40 秒专锁领先者
        const t = m.deskTargets(e)[0], lead = m.leader();
        if (t && ((m.left < 40 && t.banked >= e.banked) || t.pocket >= 30 || (lead === t && t.banked > e.banked + 40))) m.useEmpSkill(e);
      }
      else if (e.id === 'bear' && fresh) m.useEmpSkill(e);
      else if (e.id === 'owl' && e.room && A.ROOMS[e.room].slack && !e.forced && e.roomTime >= this.plan - 1.2) {
        if (m.useEmpSkill(e)) {   // 看到老板就在门口附近：再多待一会儿
          const b = m.boss, o = m.grid.outside(e.room);
          if (!b.room && !(b.waitT > 0) && A.inSight(e, b.x, b.y) && Math.hypot(b.x - o.x, b.y - o.y) < 5) this.plan = Math.min(A.ROOMS[e.room].maxStay * A.stayMult(e) - 0.5, this.plan + 3);
        }
      }
    }
    // 道具：对付领先者、在关键时刻用
    useItem() {
      const m = this.m, e = this.e, others = m.employees().filter(x => x !== e), lead = others.slice().sort((p, q) => q.banked - p.banked)[0];
      if (!lead || this.rng() > 0.05) return;   // 不是每一帧都想用
      const k = e.item;
      if (k === 'seal' && (m.left < 45 || lead.banked > e.banked + 60 || lead.pocket >= 40)) m.useItem(e);
      else if (k === 'fake' && others.some(x => x.room && A.ROOMS[x.room].slack && x.pocket >= 20)) m.useItem(e);
      else if (k === 'steal' && others.some(x => x.pocket >= 35)) m.useItem(e);
      else if (k === 'banana' && !e.room) {   // 丢在门口或别人工位旁的必经路上
        const spots = A.SLACK_ROOMS.map(id => m.grid.outside(id)).concat(others.map(x => A.seatOf(x.desk)));
        if (spots.some(p => Math.hypot(p.x - e.x, p.y - e.y) < 2.2)) m.useItem(e);
      }
      else if (m.left < 20) m.useItem(e);
    }
    go(id) {
      const m = this.m, e = this.e;
      if (m.entryBlock(e, id) === 'full' && e.id === 'rabbit' && e.skillCd <= 0) m.useEmpSkill(e);   // 冲刺插队
      if (m.entryBlock(e, id)) return false;
      const cells = m.grid.roomCells(id), k = cells[Math.floor(this.rng() * cells.length)];
      if (!m.moveTo(e, k.c + 0.5, k.r + 0.5)) return false;
      const R = A.ROOMS[id], sm = A.stayMult(e);
      this.target = id; this.mode = 'going';
      this.plan = R.safe ? R.maxStay : Math.max(A.ECON.minStay + 0.2, Math.min(R.maxStay * sm - 0.5, R.rise * sm * this.range(this.p.leave) + (this.rng() < 0.1 ? 3 : 0)));   // 偶尔多待一会儿（失误）；至少待满最少停留
      return true;
    }
  }
  A.EmployeeAI = EmployeeAI;
})(typeof window !== 'undefined' ? window : globalThis);
