// 星级计算与进度/设置存储。storage 为 {getItem,setItem}（浏览器传 localStorage，测试传内存对象，缺省仅内存）。
(function (g) {
  const OS = (g.OS = g.OS || {});
  const KEY = 'office-slacker:progress:v1';   // 旧存档只有 stars，直接兼容
  // 2 星允许的最多被抓次数
  function twoStarLimit(game) {
    if (game.maxCaught) return game.maxCaught - 1;
    if (game.level.twoStarCaught != null) return game.level.twoStarCaught;
    const s = game.bal.stars;
    return Math.max(s.twoStarMin, Math.round(game.employees.length * s.twoStarPerEmployee));
  }
  // 当前被抓次数对应的星级（不看是否通关；HUD 实时显示用）
  function starsForCaught(game) {
    if (game.caught === 0) return 3;
    return game.caught <= twoStarLimit(game) ? 2 : 1;
  }
  function calcStars(game) { return game.phase === 'win' ? starsForCaught(game) : 0; }

  const defaultSettings = () => ({ speed: 1, lineup: [], mute: false, bgm: true }); // lineup：上次选的阵容；mute：静音；bgm：背景音乐（默认开）。旧版 auto/manual/music 读档时丢弃
  class Progress {
    constructor(storage) { this.storage = storage || null; this.data = { stars: {}, settings: defaultSettings(), seenIntro: {} }; this.load(); }
    load() {
      try {
        const raw = this.storage && this.storage.getItem(KEY); const d = raw && JSON.parse(raw);
        if (d && typeof d.stars === 'object' && d.stars) {
          const raw = d.settings && typeof d.settings === 'object' ? d.settings : {}, s = defaultSettings();
          if (typeof raw.speed === 'number') s.speed = raw.speed;
          if (Array.isArray(raw.lineup)) s.lineup = raw.lineup;
          if (typeof raw.mute === 'boolean') s.mute = raw.mute;
          if (typeof raw.bgm === 'boolean') s.bgm = raw.bgm;
          this.data = { stars: d.stars, settings: s, seenIntro: d.seenIntro && typeof d.seenIntro === 'object' ? d.seenIntro : {} };
        }
      } catch (e) { this.data = { stars: {}, settings: defaultSettings(), seenIntro: {} }; }
    }
    save() { try { this.storage && this.storage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 存储不可用时仅保留内存进度 */ } }
    get settings() { return this.data.settings; }
    setSetting(k, v) { this.data.settings[k] = v; this.save(); }
    stars(id) { return this.data.stars[id] || 0; }
    isUnlocked(id, levels) { const i = levels.findIndex(l => l.id === id); return i === 0 || (i > 0 && this.stars(levels[i - 1].id) > 0); }
    record(id, stars) { const better = stars > this.stars(id); if (better) { this.data.stars[id] = stars; this.save(); } return better; }
    reset() { this.data = { stars: {}, settings: defaultSettings(), seenIntro: {} }; this.save(); }
    // "本关新内容"弹框是否已看过（只在第一次进入某关时自动弹出）
    introSeen(id) { return !!this.data.seenIntro[id]; }
    markIntroSeen(id) { if (!this.data.seenIntro[id]) { this.data.seenIntro[id] = true; this.save(); } }
  }
  OS.calcStars = calcStars; OS.starsForCaught = starsForCaught; OS.twoStarLimit = twoStarLimit; OS.Progress = Progress;
})(typeof window !== "undefined" ? window : globalThis);
