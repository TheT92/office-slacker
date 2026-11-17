// 摸鱼大作战：界面流程（标题 → 对局 → 结算）、暂停、固定步长推进。纯逻辑，Node 可测。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};
  const STEP = 1 / 60;

  class ArenaApp {
    // opts: rng、storage（读取闯关模式的静音/音乐设置）、matchOpts（测试时指定角色等）
    constructor(opts) {
      opts = opts || {};
      this.rng = opts.rng || Math.random; this.matchOpts = opts.matchOpts || {};
      this.prep = opts.prep != null ? opts.prep : A.PREP.time;   // 开局准备秒数（测试可传 0）
      this.screen = 'title'; this.match = null; this.paused = false; this.acc = 0;
      const s = A.loadSettings(opts.storage); this.muted = s.mute; this.music = s.bgm; this.storage = opts.storage || null;
      this.difficulty = A.DIFFICULTY && A.DIFFICULTY[s.arenaDifficulty] ? s.arenaDifficulty : 'normal';   // AI 老板难度（记住上次的选择）
    }
    // 点"开始"：随机分配身份
    start() {
      this.match = new A.Match(Object.assign({ rng: this.rng, playerRole: 'random', prep: this.prep, difficulty: this.difficulty }, this.matchOpts));   // 1/5 概率当老板
      this.screen = 'match'; this.paused = false; this.acc = 0; this.cardOpen = false;
      return this.match;
    }
    restart() { return this.start(); }
    toTitle() { this.screen = 'title'; this.match = null; this.paused = false; }
    pause() { if (this.screen === 'match' && this.match.phase === 'playing') this.paused = true; }
    resume() { this.paused = false; this.cardOpen = false; }
    // 准备好了（准备阶段提前开始）
    ready() { if (this.screen === 'match' && this.match.phase === 'prep') { this.match.ready(); return true; } return false; }
    // 暂停菜单里再看一次身份卡
    toggleCard() { if (this.paused) this.cardOpen = !this.cardOpen; return this.cardOpen; }
    togglePause() { if (this.paused) this.resume(); else this.pause(); }
    setDifficulty(d) { if (!A.DIFFICULTY[d]) return false; this.difficulty = d; A.saveSettings(this.storage, { arenaDifficulty: d }); return true; }
    toggleMute() { this.muted = !this.muted; A.saveSettings(this.storage, { mute: this.muted }); return this.muted; }
    // 真实时间推进，内部按 1/60 秒固定步长
    tick(realDt) {
      if (this.screen !== 'match' || this.paused || (this.match.phase !== 'playing' && this.match.phase !== 'prep')) return;
      this.acc += Math.min(0.25, realDt);
      while (this.acc >= STEP) { this.match.update(STEP); this.acc -= STEP; }
    }
    // 玩家指令（玩家角色 = match.player）
    tapWorld(x, y) {
      if (!this.canAct()) return false;
      return this.match.moveTo(this.match.player, x, y);
    }
    // 员工技能（E）
    empSkill() { const p = this.match && this.match.player; if (!this.canAct() || p.kind !== 'employee') return false; return this.match.useEmpSkill(p); }
    // 老板技能（1/2/3）：监控需要再点一个房间
    bossSkill(i) {
      const m = this.match, b = m && m.player; if (!this.canAct() || b.kind !== 'boss') return false;
      const id = b.skills[i]; if (!id) return false;
      return m.useBossSkill(id);   // 2.5.0：监控也是按一下就放（走近房间就能看），不用再点房间
    }
    // 选卡片：老板阶段技能 / 员工升级方向；没有待选时返回 false
    pickOffer(i) {
      const m = this.match, p = m && m.player; if (!this.canAct()) return false;
      if (p.kind === 'boss' && m.offer) return m.offer.options[i] ? m.pickBossSkill(m.offer.options[i]) : false;
      if (p.kind === 'employee' && p.branchOffer) return i < 2 ? m.chooseBranch(p, i ? 'B' : 'A') : false;
      return false;
    }
    // 道具（捣乱补给，Q）
    useItem() { const m = this.match, p = m && m.player; if (!this.canAct() || p.kind !== 'employee') return false; return m.useItem(p); }
    hasOffer() { const m = this.match, p = m && m.player; return !!(m && ((p.kind === 'boss' && m.offer) || (p.kind === 'employee' && p.branchOffer))); }
    act() { if (!this.canAct()) return false; return this.match.action(this.match.player); }
    setDir(dx, dy) { if (this.screen === 'match' && this.match) this.match.setDir(this.match.player, this.paused ? 0 : dx, this.paused ? 0 : dy); }
    canAct() { return this.screen === 'match' && !this.paused && this.match.phase === 'playing'; }
  }

  // 事件 → 音效名（纯函数，方便测试）。员工在房间里只有"老板开门查房"那一下有声音，靠近时没有任何声音
  A.eventSound = function (ev, m) {
    const p = m.player, me = ev.who === p.id, boss = p.kind === 'boss';
    switch (ev.type) {
      case 'countdown': return 'tick';
      case 'go': return 'go';
      case 'rush': return 'rush';
      case 'check': return boss || p.room === ev.room ? 'door' : null;   // 只有在那个房间里（或自己就是老板）才听得到开门
      case 'pickup': return me ? 'pickup' : null;
      case 'levelUp': return me ? 'levelup' : null;
      case 'bossPick': return boss ? 'pick' : null;
      case 'empSkill': return me ? (ev.skill === 'bear' ? 'lock' : 'shield') : null;
      case 'meeting': return me || boss ? 'meeting' : null;
      default: return null;
    }
  };

  // 与闯关模式共用存档里的 settings.mute / settings.bgm（只改这两项）
  const KEY = 'office-slacker:progress:v1';
  A.loadSettings = function (storage) {
    try { const d = JSON.parse(storage.getItem(KEY)) || {}; const s = d.settings || {}; return { mute: !!s.mute, bgm: s.bgm !== false, arenaDifficulty: s.arenaDifficulty || 'normal' }; } catch (e) { return { mute: false, bgm: true, arenaDifficulty: 'normal' }; }
  };
  A.saveSettings = function (storage, patch) {
    if (!storage) return;
    try { const d = JSON.parse(storage.getItem(KEY)) || {}; d.settings = Object.assign(d.settings || {}, patch); storage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 存档不可用时忽略 */ }
  };
  A.App = ArenaApp;
})(typeof window !== 'undefined' ? window : globalThis);
