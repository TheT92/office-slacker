// 应用状态机：screen = 'select'（选关）| 'lineup'（选阵容）| 'game'（游戏中，含结算）。纯逻辑。
// 时间：tick(realDt) 把真实时间 × 倍速累加，按固定 1/60 秒步长推进 update，所以倍速不改变结果，只是更快。
(function (g) {
  const OS = (g.OS = g.OS || {});
  const STEP = 1 / 60, MAX_STEPS = 60;   // 单帧最多推进 1 秒游戏时间，防止卡顿后"快进"
  class App {
    constructor(opts) {
      opts = opts || {};
      this.levels = opts.levels || OS.levels; this.rng = opts.rng; this.bal = opts.bal || OS.balance;
      this.progress = new OS.Progress(opts.storage);
      this.intros = opts.intros !== false;   // 是否自动弹"本关新内容"（单元测试可关掉）
      this.screen = 'select'; this.game = null; this.index = -1; this.result = null; this.acc = 0;
      this.picks = []; this.roster = null; this.paused = false; this.intro = null;   // picks：阵容界面当前选择；roster：本关正在用的阵容（重试沿用）
    }
    level() { return this.levels[this.index]; }
    unlocked(id) { return this.progress.isUnlocked(id, this.levels); }
    // 进入关卡：可选角色多于工位时先去阵容界面（默认填好上次的选择），否则直接开局
    openLevel(id) {
      const i = this.levels.findIndex(l => l.id === id);
      if (i < 0 || !this.unlocked(id)) return false;
      this.index = i; const lv = this.levels[i];
      const picks = OS.lineup.defaultLineup(lv, this.progress, this.settings.lineup);
      if (OS.lineup.needsPick(lv, this.progress)) { this.picks = picks; this.screen = 'lineup'; this.game = null; this.result = null; return true; }
      return this.start(picks);
    }
    start(roster) {
      this.roster = roster.slice(); this.game = new OS.Game(this.level(), { rng: this.rng, roster: this.roster }); this.game.start();
      this.result = null; this.screen = 'game'; this.acc = 0; this.paused = false; this.intro = null;
      // 第一次进入本关且有新内容时，先弹"本关新内容"，期间游戏冻结
      const info = OS.intro.build(this.level(), this.levels);
      if (this.intros && info.items.length && !this.progress.introSeen(this.level().id)) this.intro = info;
      return true;
    }
    // —— 本关新内容弹框 ——
    closeIntro() { if (!this.intro) return false; this.progress.markIntroSeen(this.level().id); this.intro = null; this.acc = 0; return true; }
    // 暂停菜单里的"本关说明"：重新打开（关闭后回到暂停状态）
    showIntro() { if (this.screen !== 'game' || !this.game) return false; const info = OS.intro.build(this.level(), this.levels); if (!info.items.length) return false; this.intro = info; return true; }
    hasIntro() { return this.screen === 'game' && !!this.game && OS.intro.build(this.level(), this.levels).items.length > 0; }
    frozen() { return this.paused || !!this.intro; }
    // —— 阵容界面 ——
    canPick() { return this.index >= 0 && OS.lineup.needsPick(this.level(), this.progress); }
    togglePick(id) { if (this.screen !== 'lineup') return false; const before = this.picks; this.picks = OS.lineup.toggle(this.level(), this.progress, before, id); return this.picks !== before; }
    lineupStatus() { return OS.lineup.validate(this.level(), this.progress, this.picks); }
    confirmLineup() {
      if (this.screen !== 'lineup' || this.lineupStatus() !== 'ok') return false;
      this.progress.setSetting('lineup', this.picks.slice()); return this.start(this.picks);
    }
    // 结算界面"换阵容"：带着本关当前阵容回到阵容界面
    changeLineup() { if (!this.canPick()) return false; this.picks = (this.roster || []).slice(); this.screen = 'lineup'; this.game = null; this.result = null; return true; }
    retry() { return this.index >= 0 && (this.roster ? this.start(this.roster) : this.openLevel(this.level().id)); }   // 重试沿用本关阵容
    hasNext() { const n = this.levels[this.index + 1]; return !!n && this.unlocked(n.id); }
    next() { return this.hasNext() && this.openLevel(this.levels[this.index + 1].id); }
    toSelect() { this.screen = 'select'; this.game = null; this.result = null; this.roster = null; this.paused = false; this.intro = null; }

    // —— 倍速 ——
    // 解锁条件：featureUnlockLevel 这一关已解锁（即通关了它的前一关）。
    featuresUnlocked() {
      const id = this.bal.featureUnlockLevel, i = this.levels.findIndex(l => l.id === id);
      return i < 0 ? true : this.unlocked(id);
    }
    get settings() { return this.progress.settings; }
    speed() { return this.featuresUnlocked() && this.bal.speeds.includes(this.settings.speed) ? this.settings.speed : 1; }
    cycleSpeed() {
      if (!this.featuresUnlocked()) return false;
      const s = this.bal.speeds, i = s.indexOf(this.speed());
      this.progress.setSetting('speed', s[(i + 1) % s.length]); return true;
    }

    // —— 声音设置（真正的播放在浏览器端 audio.js）——
    toggleMute() { this.progress.setSetting('mute', !this.settings.mute); return this.settings.mute; }
    toggleMusic() { this.progress.setSetting('bgm', !this.settings.bgm); return this.settings.bgm; }

    // —— 暂停：游戏时间冻结，且暂停期间不能放技能、不能召回（避免"暂停后从容召回"）——
    canPause() { return this.screen === 'game' && !!this.game && this.game.phase === 'playing' && !this.intro; }
    pause() { if (!this.canPause()) return false; this.paused = true; return true; }
    resume() { if (!this.paused) return false; this.paused = false; this.acc = 0; return true; }
    togglePause() { return this.paused ? this.resume() : this.pause(); }
    // 玩家操作统一走这里：暂停时一律无效
    castTeam(id) { return !!this.game && !this.frozen() && this.game.useTeam(id); }
    recall(room) { return !!this.game && !this.frozen() ? this.game.recallRoom(room) : 0; }

    // 真实时间驱动（浏览器主循环调用）
    tick(realDt) {
      if (this.screen !== 'game' || this.frozen()) { this.acc = 0; return 0; }
      this.acc += realDt * this.speed(); let n = 0;
      while (this.acc >= STEP - 1e-9 && n < MAX_STEPS) { this.update(STEP); this.acc -= STEP; n++; }
      if (n === MAX_STEPS) this.acc = 0;
      return n;
    }
    // 推进一个逻辑步长（测试可直接调用）。普通技能的自动出发在 Game 内部完成。
    update(dt) {
      if (this.screen !== 'game' || this.frozen()) return;
      const was = this.game.phase;
      this.game.update(dt);
      if (was === 'playing' && this.game.phase !== 'playing') this.finish();
    }
    finish() {
      const g = this.game;
      if (g.phase === 'win') {
        const before = OS.lineup.unlockedIds(this.progress), stars = OS.calcStars(g), newBest = this.progress.record(g.level.id, stars);
        const unlockedChars = OS.lineup.unlockedIds(this.progress).filter(id => !before.includes(id));   // 本次新解锁的角色
        this.result = { win: true, stars, newBest, unlockedChars };
      }
      else this.result = { win: false, reason: g.endReason || 'time' };
    }
  }
  App.STEP = STEP;
  OS.App = App;
})(typeof window !== "undefined" ? window : globalThis);
