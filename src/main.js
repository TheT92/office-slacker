// 主循环：app.tick 按 真实时间 × 倍速 推进固定 1/60 秒逻辑步长，渲染每帧一次。URL 加 ?debug 显示调试信息。
// 游戏事件在这里分发给：提示文字（renderer.toast）、画面特效（renderer.onEvent）、音效（OS.audio）。
(function () {
  const OS = window.OS, canvas = document.getElementById('game');
  let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
  const app = new OS.App({ storage });
  const renderer = new OS.Renderer(canvas, app, { debug: /[?&]debug/.test(location.search) });
  OS.audio.setMuted(app.settings.mute); OS.audio.setMusic(app.settings.bgm);
  OS.bindInput(canvas, app, renderer);
  const name = id => (app.game.get(id) || {}).name || '';
  let last = performance.now(), lastResult = null, lastCoin = 0, lastGame = null;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    app.tick(dt);
    if (app.game) {
      if (lastGame !== app.game) { lastGame = app.game; lastCoin = 0; }
      for (const ev of app.game.drainEvents()) {
        renderer.onEvent(ev);
        if (ev.type === 'caught') { renderer.toast(name(ev.who) + ' 摸鱼被抓！罚款 $' + ev.fine); OS.audio.play('caught'); }
        if (ev.type === 'team') { renderer.toast(name(ev.who) + ({ escort: ' 把老板带去会议室了', delay: ' 递上文件，老板查房推迟了', shield: ' 开始打掩护' }[ev.kind] || '')); OS.audio.play(ev.kind || 'escort'); }
        if (ev.type === 'recall') { renderer.toast('从' + OS.ROOMS[ev.room].name + '召回 ' + ev.count + ' 人'); OS.audio.play('recall'); }
        if (ev.type === 'shielded') { renderer.toast(name(ev.who) + ' 被查到了，但有人打掩护，不算！'); OS.audio.play('shielded'); }
        if (ev.type === 'warning') OS.audio.play('warning');
      }
      // 金额每跨过 $50 轻响一声
      const coin = Math.floor(app.game.money / 50); if (coin > lastCoin && app.game.phase === 'playing') OS.audio.play('coin'); lastCoin = coin;
    }
    if (app.result && app.result !== lastResult) {
      lastResult = app.result; OS.audio.play(app.result.win ? 'win' : 'lose');
      if (app.result.unlockedChars && app.result.unlockedChars.length) OS.audio.play('unlock');
    }
    renderer.draw(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__app = app; // 控制台调试：__app.progress.reset() 清空进度与设置
})();
