// 员工状态机：working → going → in_room → returning → working；escorting 为陪老板汇报。
(function (g) {
  const OS = (g.OS = g.OS || {});
  class Employee {
    constructor(def, desk, index, bal, map) {
      Object.assign(this, { id: def.id, name: def.name, role: def.role, wage: def.wage, solo: def.solo, team: def.team || null });
      this.desk = desk; this.index = index; this.bal = bal; this.map = map || null;
      this.state = 'working'; this.timer = 0; this.room = null;
      this.cd = 0; this.teamCd = 0; this.teamCharges = this.team ? this.team.charges : 0;
      this.earned = 0; this.caughtFlash = 0;
    }
    // 去普通技能房间的单程路程（天台更远）
    travel() { return this.map ? this.map.travelOf(this.solo.room, this.bal.travelTime) : this.bal.travelTime; }
    startSolo() { this.state = 'going'; this.room = this.solo.room; this.timer = this.travel(); }
    // 带走老板类：本人去会议室，结束后进入冷却
    startTeam() { this.state = 'escorting'; this.timer = this.team.duration; this.teamCharges--; }
    // 拖住老板 / 打掩护类：本人留在工位，立即进入冷却
    useInstant() { this.teamCharges--; this.teamCd = this.team.cooldown; }
    // 距离回到工位还有多久（秒）：用于提示"忙碌中，N 秒后回到工位"
    timeToDesk() {
      const t = this.travel();
      if (this.state === 'going') return this.timer + this.solo.stay + t;
      if (this.state === 'in_room') return this.timer + t;
      if (this.state === 'returning' || this.state === 'escorting') return this.timer;
      return 0;
    }
    // 紧急召回：在房间里的人直接返回；还在路上的人原地掉头（返回所需时间 = 已走的路程），技能进入冷却
    recall() {
      if (this.state === 'in_room') this.timer = this.travel();
      else if (this.state === 'going') this.timer = Math.max(0.01, this.travel() - this.timer);
      else return false;
      this.state = 'returning'; this.cd = this.solo.cooldown; return true;
    }
    caught() { this.state = 'returning'; this.timer = this.travel(); this.caughtFlash = 1.2; this.cd = this.solo.cooldown; }
    update(dt) {
      if (this.cd > 0) this.cd = Math.max(0, this.cd - dt);
      if (this.teamCd > 0) this.teamCd = Math.max(0, this.teamCd - dt);
      if (this.caughtFlash > 0) this.caughtFlash = Math.max(0, this.caughtFlash - dt);
      if (this.state === 'working') return;
      this.timer -= dt;
      if (this.timer > 0) return;
      switch (this.state) {
        case 'going': this.state = 'in_room'; this.timer = this.solo.stay; break;
        case 'in_room': this.state = 'returning'; this.timer = this.travel(); this.cd = this.solo.cooldown; break;
        case 'returning': this.state = 'working'; this.room = null; break;
        case 'escorting': this.state = 'working'; this.teamCd = this.team.cooldown; break;
      }
    }
    // 渲染用位置
    // slotK：在房间里的站位序号（渲染层按进入先后计算，0/1/2 依次排开），缺省按员工序号
    getPos(map, slotK) {
      const t = this.travel(), k = slotK == null ? this.index % 3 : slotK % 3, room = this.room || this.solo.room;
      const z = map.zones[room], dx = z ? Math.min(60, (z.w - 44) / 2) : 60;
      const slot = { x: (k - 1) * dx, y: 0 };   // 同一房间里的人错开站位（房间窄时间距缩小）
      const roomPt = () => { const c = map.center(room); return { x: c.x + slot.x, y: c.y + slot.y }; };
      if (this.state === 'going') return OS.lerp(this.desk, roomPt(), 1 - this.timer / t);
      if (this.state === 'in_room') return roomPt();
      if (this.state === 'returning') return OS.lerp(roomPt(), this.desk, 1 - this.timer / t);
      if (this.state === 'escorting') { const c = map.center('meeting'); return { x: c.x - Math.min(55, map.zones.meeting.w / 2 - 22), y: c.y }; }   // 站在老板左侧，避开老板头顶气泡
      return this.desk;
    }
  }
  OS.Employee = Employee;
})((typeof window!=="undefined"?window:globalThis));
