// 合成音效（WebAudio，实时生成，无音频文件）。浏览器要求用户先有一次点击/按键才能出声，所以 unlock() 在首次交互时调用。
// 在 Node（测试）或不支持 WebAudio 的环境里，所有方法都是空操作。
(function (g) {
  const OS = (g.OS = g.OS || {});
  const AC = g.AudioContext || g.webkitAudioContext;
  const MUSIC_GAIN = 1.12;   // 背景音乐音量，比 1.2 版（0.7）提高 60%
  const SFX_GAIN = 1.6;   // 音效音量（相对背景音乐），比 1.0 版提高 60%
  let ctx = null, master = null, sfxBus = null, muted = false, musicOn = false, musicTimer = null, lastPlay = {};
  function unlock() {
    if (!AC) return;
    if (!ctx) {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_GAIN; sfxBus.connect(master);   // 音效单独放大，背景音乐不受影响
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (musicOn && !musicTimer) startMusic();
  }
  // 一个音符：type 波形，f0→f1 频率滑动，dur 时长，vol 音量，delay 延迟
  function tone(f0, f1, dur, type, vol, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, f0, f1, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0), n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.value = vol; src.connect(bp); bp.connect(gn); gn.connect(sfxBus); src.start(t);
  }
  const SFX = {
    click:   () => tone(880, 880, 0.05, 'triangle', 0.08),
    // —— 摸鱼大作战 ——
    tick:    () => tone(1320, 1320, 0.06, 'square', 0.05),                                                   // 准备倒计时
    go:      () => [659, 784, 1046].forEach((f, i) => tone(f, f, 0.16, 'square', 0.08, i * 0.08)),          // 开始摸鱼
    rush:    () => { for (let i = 0; i < 3; i++) { tone(880, 1175, 0.16, 'sawtooth', 0.07, i * 0.22); tone(1175, 880, 0.16, 'sawtooth', 0.05, i * 0.22 + 0.11); } },   // 下班冲刺警报
    door:    () => { noise(0.08, 0.5, 900, 300); tone(196, 147, 0.18, 'square', 0.1, 0.04); },               // 开门查房
    pickup:  () => [988, 1319, 1568].forEach((f, i) => tone(f, f, 0.08, 'triangle', 0.1, i * 0.05)),
    levelup: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.1, i * 0.06)),
    pick:    () => { tone(392, 784, 0.18, 'square', 0.07); tone(587, 1175, 0.18, 'triangle', 0.06, 0.05); },     // 老板选技能
    lock:    () => { tone(1568, 1568, 0.04, 'square', 0.06); tone(1046, 1046, 0.05, 'square', 0.06, 0.07); },
    meeting: () => [392, 330, 392].forEach((f, i) => tone(f, f, 0.14, 'sine', 0.1, i * 0.12)),
    warning: () => { tone(988, 988, 0.11, 'square', 0.07); tone(988, 988, 0.11, 'square', 0.07, 0.16); },
    caught:  () => { tone(220, 110, 0.35, 'sawtooth', 0.12); tone(233, 117, 0.35, 'sawtooth', 0.06); },
    recall:  () => noise(0.22, 0.35, 2400, 500),
    escort:  () => [523, 659, 784].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.14, i * 0.07)),
    delay:   () => { noise(0.12, 0.25, 3000, 1800); tone(660, 880, 0.15, 'triangle', 0.1, 0.08); },
    shield:  () => { tone(784, 1046, 0.35, 'sine', 0.12); tone(1175, 1568, 0.35, 'sine', 0.06, 0.05); },
    shielded:() => tone(1318, 1046, 0.2, 'triangle', 0.12),
    coin:    () => { tone(1568, 1568, 0.06, 'square', 0.035); tone(2093, 2093, 0.08, 'square', 0.03, 0.05); },
    win:     () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.16, i * 0.12)),
    lose:    () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.3, 'triangle', 0.14, i * 0.18)),
    unlock:  () => [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, f, 0.12, 'sine', 0.1, 0.5 + i * 0.07)),
  };
  // 同一音效的最短间隔（秒），避免叠成噪音
  const GAP = { coin: 0.25, warning: 0.3, click: 0.04 };
  function play(name) {
    if (!ctx || muted || !SFX[name]) return;
    const now = ctx.currentTime; if (GAP[name] && now - (lastPlay[name] || -9) < GAP[name]) return;
    lastPlay[name] = now; SFX[name]();
  }
  // —— 背景音乐：轻快舒缓的 16 小节循环（C – Am – F – G，约 92 BPM），默认开启 ——
  // 柔和铺底（正弦和弦）+ 分解和弦（三角波）+ 低音 + 旋律，走独立的低通总线，音量低于音效。
  const BPM = 92, EIGHTH = 60 / BPM / 2;
  let tempo = 1;   // 下班冲刺时加快
  const N = n => 440 * Math.pow(2, (n - 69) / 12);          // MIDI 音高 → 频率
  const CHORDS = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];   // C, Am, F, G
  // 旋律：16 小节 × 8 个八分音符（null = 休止），以 C 大调五声音阶为主
  const MEL = [
    [72, null, 76, null, 79, null, 76, 74], [72, null, null, null, 69, null, 72, null],
    [77, null, 76, null, 74, null, 72, null], [74, null, null, 76, 74, null, 71, null],
    [72, 74, 76, null, 79, null, 81, null], [79, null, 76, null, 72, null, null, null],
    [77, null, 79, null, 81, null, 77, null], [79, null, null, null, 74, null, null, null],
    [76, null, 79, null, 84, null, 81, 79], [76, null, null, null, 72, null, 76, null],
    [77, null, 76, 74, 72, null, 69, null], [71, null, 74, null, 79, null, null, null],
    [72, null, 76, null, 79, 81, 79, null], [76, null, 72, null, 69, null, 72, null],
    [74, null, 77, null, 76, null, 74, null], [72, null, null, null, null, null, null, null],
  ];
  let musicBus = null, step = 0, nextT = 0;
  function mtone(f, t, dur, type, vol) {
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3)); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function scheduleStep(i, t) {
    const bar = Math.floor(i / 8) % 16, beat = i % 8, ch = CHORDS[bar % 4];
    if (beat === 0) for (const n of ch) mtone(N(n + 12), t, EIGHTH * 8, 'sine', 0.018);            // 铺底和弦（整小节）
    if (beat === 0 || beat === 4) mtone(N(ch[0] - 12), t, EIGHTH * 3.5, 'sine', 0.06);             // 低音
    const arp = [ch[0], ch[2], ch[1] + 12, ch[2]][beat % 4] + 12; mtone(N(arp), t, EIGHTH * 1.4, 'triangle', 0.016);   // 分解和弦
    const m = MEL[bar][beat]; if (m) mtone(N(m), t, EIGHTH * 1.8, 'triangle', 0.04);              // 旋律
  }
  // 预排程：每 100ms 把接下来 0.3 秒内的音符排进 WebAudio 时间轴，节奏不受定时器抖动影响
  function startMusic() {
    if (!ctx || musicTimer) return;
    if (!musicBus) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_GAIN; musicBus.connect(lp); lp.connect(master);
    }
    nextT = ctx.currentTime + 0.1;
    musicTimer = setInterval(() => {
      if (!musicOn) return;
      while (nextT < ctx.currentTime + 0.3) { if (!muted) scheduleStep(step, nextT); step++; nextT += EIGHTH / tempo; }
    }, 100);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function setTempo(v) { tempo = Math.max(0.5, Math.min(2, v || 1)); }
  function setMuted(v) { muted = !!v; if (master) master.gain.value = muted ? 0 : 0.6; }
  function setMusic(v) { musicOn = !!v; if (musicOn) startMusic(); else stopMusic(); }
  // 测试用：曲子结构信息
  const musicInfo = { bars: MEL.length, bpm: BPM, chords: CHORDS.length, sfxGain: SFX_GAIN, musicGain: MUSIC_GAIN };
  OS.audio = { unlock, play, setMuted, setMusic, setTempo, musicInfo, has: n => !!SFX[n], get available() { return !!AC; } };
})(typeof window !== "undefined" ? window : globalThis);
