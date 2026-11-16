// 老板状态机：office → warning → going → in_room → returning → office；escorted 为被带去会议室。
// delay(sec)：被"拖住"——推迟下一次查房（预警中则取消这次查房），老板仍留在开放办公区。
(function (g) {
  const OS = (g.OS = g.OS || {});
  function lerp(a, b, k) { k = Math.max(0, Math.min(1, k)); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
  class Boss {
    constructor(bal, map, rng) {
      this.bal = bal; this.map = map; this.rng = rng;
      this.state = 'office'; this.zone = 'office'; this.target = null;
      this.timer = this._interval();
      this.t = 0; this.from = null;   // 仅画面用：巡视计时、出发位置
      this.leg = bal.travelTime;      // 本次往返的单程路程（天台更远）
      this.distracted = 0;            // 被拖住的剩余时间（仅画面显示"在看文件…"）
    }
    _interval() { const b = this.bal.boss; return b.raidMin + this.rng() * (b.raidMax - b.raidMin); }
    inOffice() { return this.state === 'office' || this.state === 'warning'; }
    escort(duration) { this.from = this.map.patrolPos(this.t); this.state = 'escorted'; this.zone = 'meeting'; this.target = 'meeting'; this.timer = duration; this.leg = this.map.travelOf('meeting', this.bal.travelTime); }
    delay(sec) {
      if (this.state === 'office') this.timer += sec;
      else if (this.state === 'warning') { this.state = 'office'; this.target = null; this.timer = sec; }
      else return false;
      this.distracted = sec; return true;
    }
    // 按权重选查房目标（rng=0 时选第一个）
    _pickTarget() {
      const list = this.bal.boss.raidTargets, w = list.map(id => (this.map.zones[id] && this.map.zones[id].raidWeight) || 1);
      let r = this.rng() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < list.length; i++) { if (r < w[i]) return list[i]; r -= w[i]; }
      return list[list.length - 1];
    }
    update(dt) {
      if (this.state !== 'warning') this.t += dt;   // 预警时停下脚步
      if (this.distracted > 0) this.distracted = Math.max(0, this.distracted - dt);
      this.timer -= dt;
      if (this.timer > 0) return;
      const b = this.bal.boss;
      switch (this.state) {
        case 'office':
          if (!b.raidTargets.length) { this.timer = this._interval(); break; }
          this.target = this._pickTarget(); this.state = 'warning'; this.timer = b.warnTime; break;
        case 'warning': this.from = this.map.patrolPos(this.t); this.leg = this.map.travelOf(this.target, this.bal.travelTime); this.state = 'going'; this.timer = this.leg; break;
        case 'going': this.state = 'in_room'; this.zone = this.target; this.timer = b.stayTime; break;
        case 'in_room': case 'escorted': this.state = 'returning'; this.timer = this.leg; break;
        case 'returning': this.state = 'office'; this.zone = 'office'; this.target = null; this.timer = this._interval(); break;
      }
    }
    // 渲染用位置（逻辑不依赖）：在开放办公区时沿走道巡视；预警时停下
    getPos() {
      const t = this.leg, patrol = this.map.patrolPos(this.t);
      if (this.state === 'going') return lerp(this.from || patrol, this.map.center(this.target), 1 - this.timer / t);
      if (this.state === 'in_room' || this.state === 'escorted') return this.map.center(this.zone);
      if (this.state === 'returning') return lerp(this.map.center(this.zone), patrol, 1 - this.timer / t);
      return patrol;
    }
  }
  OS.lerp = lerp;
  OS.Boss = Boss;
})((typeof window!=="undefined"?window:globalThis));
