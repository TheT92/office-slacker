// 鼠标/触屏 + 键盘输入，只调用 app/game 的公开方法。
(function (g) {
  const OS = (g.OS = g.OS || {});
  OS.bindInput = function (canvas, app, renderer) {
    const lockedMsg = () => '通关第 ' + (OS.balance.featureUnlockLevel - 1) + ' 关后解锁';
    const specials = () => app.game.employees.filter(e => e.team);   // 右侧特殊技能卡片的顺序
    function cycleSpeed() { if (app.cycleSpeed()) renderer.toast('倍速 ×' + app.speed()); else renderer.toast(lockedMsg()); }
    function togglePause() { if (!app.togglePause() && !app.paused) return; }
    function toggleMute() { const m = app.toggleMute(); OS.audio.setMuted(m); renderer.toast(m ? '已静音' : '音效已打开'); }
    function toggleMusic() { const m = app.toggleMusic(); OS.audio.setMusic(m); renderer.toast(m ? '背景音乐：开' : '背景音乐：关'); }
    function act(a) {
      const game = app.game;
      if (a.type === 'sound') { toggleMute(); return; }
      if (a.type === 'select') { app.toSelect(); return; }
      if (a.type === 'pause') { togglePause(); return; }
      if (a.type === 'pausemenu') { if (a.id === 'resume') app.resume(); else if (a.id === 'retry') app.retry(); else if (a.id === 'music') toggleMusic(); else if (a.id === 'intro') { if (!app.showIntro()) renderer.toast('本关没有新内容'); } else app.toSelect(); return; }
      if (app.paused) return;                                         // 暂停期间不能操作
      if (a.type === 'speed') { cycleSpeed(); return; }
      if (a.type === 'recall') { if (!app.recall(a.room)) renderer.toast(OS.ROOMS[a.room].name + '里没人'); return; }
      if (a.type === 'team') {
        if (!app.castTeam(a.id)) {
          const st = OS.skills.teamStatus(game, game.get(a.id));
          renderer.toast({ cooldown: '还在冷却', busy: '要等他回到工位才能放', boss_away: '老板已经离开了', no_charges: '本关次数已用完' }[st] || '现在不能用');
        }
      }
    }
    function lineupAct(a) {
      if (!a) return;
      if (a.type === 'back') { app.toSelect(); return; }
      if (a.type === 'start') { if (!app.confirmLineup()) renderer.toast('阵容不完整'); return; }
      const ch = OS.characters[a.id];
      if (!app.togglePick(a.id)) renderer.toast((app.level().required || []).includes(a.id) ? ch.name + ' 必须上场' : '工位已满，先让别人下场');
    }
    function result(id) { if (id === 'next') app.next(); else if (id === 'retry') app.retry(); else if (id === 'lineup') app.changeLineup(); else if (id === 'select') app.toSelect(); }
    function toCanvas(ev) { const r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left) * canvas.width / r.width, y: (ev.clientY - r.top) * canvas.height / r.height }; }
    canvas.addEventListener('pointermove', ev => { renderer.mouse = toCanvas(ev); });   // 悬停高亮
    canvas.addEventListener('pointerleave', () => { renderer.mouse = null; });
    canvas.addEventListener('pointerdown', ev => {
      OS.audio.unlock(); OS.audio.play('click');   // 浏览器要求首次交互后才能出声
      const p = toCanvas(ev);
      if (app.screen === 'select') {
        const ab = OS.ui.arenaButton; if (p.x >= ab.x && p.x <= ab.x + ab.w && p.y >= ab.y && p.y <= ab.y + ab.h) { location.href = 'arena.html'; return; }   // 新模式
        const id = OS.ui.hitSelect(app, p.x, p.y); if (id) app.openLevel(id); return;
      }
      if (app.screen === 'lineup') { lineupAct(OS.ui.hitLineup(app, p.x, p.y)); return; }
      if (app.game.phase !== 'playing') { result(OS.ui.hitResult(app, p.x, p.y)); return; }
      if (app.intro) { app.closeIntro(); return; }                   // 弹框：点任意位置关闭
      const a = OS.ui.hitTest(app.game, p.x, p.y, app.paused); if (a) act(a);
    });
    window.addEventListener('keydown', ev => {
      OS.audio.unlock();
      if (ev.code === 'KeyM') { toggleMute(); return; }
      if (ev.code === 'KeyB') { toggleMusic(); return; }
      const d = /^(?:Digit|Numpad)([0-9])$/.exec(ev.code), n = d ? +d[1] : 0;
      if (app.screen === 'select') { if (d) { const k = (n === 0 ? 10 : n) + (ev.shiftKey ? 10 : 0), l = app.levels[k - 1]; if (l) app.openLevel(l.id); } return; }   // 0 = 第 10 关，Shift+数字 = 第 11–20 关
      if (app.screen === 'lineup') {
        if (ev.code === 'Escape') app.toSelect();
        else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') lineupAct({ type: 'start' });
        else { const id = OS.lineup.pool(app.level(), app.progress)[(n === 0 ? 10 : n) - 1]; if (d && id) lineupAct({ type: 'char', id }); }
        return;
      }
      if (app.intro && app.game && app.game.phase === 'playing') {     // 弹框：Enter / 空格 / Esc 关闭
        if (['Enter', 'NumpadEnter', 'Space', 'Escape'].includes(ev.code)) { ev.preventDefault(); app.closeIntro(); }
        return;
      }
      if (app.intro && app.game && app.game.phase === 'playing') {     // 弹框：Enter / 空格 / Esc 关闭
        if (['Enter', 'NumpadEnter', 'Space', 'Escape'].includes(ev.code)) { ev.preventDefault(); app.closeIntro(); }
        return;
      }
      if (ev.code === 'Escape') { app.toSelect(); return; }
      if (ev.code === 'KeyR') { app.retry(); return; }
      if (ev.code === 'KeyI' && app.game && app.game.phase === 'playing') { if (!app.paused) app.pause(); if (!app.showIntro()) renderer.toast('本关没有新内容'); return; }
      if (ev.code === 'KeyI' && app.game && app.game.phase === 'playing') { if (!app.paused) app.pause(); if (!app.showIntro()) renderer.toast('本关没有新内容'); return; }
      if (app.game.phase !== 'playing') { if (ev.code === 'KeyN') app.next(); else if (ev.code === 'KeyL') app.changeLineup(); return; }
      if (ev.code === 'KeyP' || ev.code === 'Space') { ev.preventDefault(); togglePause(); return; }
      if (ev.code === 'KeyS') { act({ type: 'speed' }); return; }
      const room = OS.ui.recallRooms(app.game).find(z => 'Key' + z.key === ev.code); if (room) { act({ type: 'recall', room: room.id }); return; }
      const e = specials()[n - 1]; if (d && e) act({ type: 'team', id: e.id });
    });
    // 切到别的窗口/标签页时自动暂停
    const autoPause = () => { if (app.pause()) renderer.toast('已自动暂停'); };
    window.addEventListener('blur', autoPause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  };
})(typeof window !== "undefined" ? window : globalThis);
