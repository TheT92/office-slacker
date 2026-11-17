// 摸鱼大作战：浏览器入口。负责高清缩放、鼠标/触摸/键盘输入、主循环、事件 → 提示与音效。
(function () {
  const OS = window.OS, A = OS.arena, canvas = document.getElementById('arena'), V0 = A.VIEW;
  let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
  const role = (location.search.match(/[?&]role=(boss|employee)/) || [])[1];   // 测试用：?role=boss / ?role=employee 指定身份
  const app = new A.App({ storage, matchOpts: role ? { playerRole: role } : {} }), r = new A.Renderer(canvas, app);
  const hello = () => { const p = app.match.player; r.toast(p.kind === 'boss' ? '你是老板！' + A.BOSS_ARRIVE.wait + ' 秒后出现在办公区正中间' : '你是' + p.name + '！绿色框是你的工位'); };
  OS.audio.setMuted(app.muted); OS.audio.setMusic(app.music);

  // 画布按 9:16 竖屏铺满窗口（电脑上居中、两边留空），按设备像素比渲染（手机上不糊）
  function fit() {
    const cs = getComputedStyle(document.body), px = v => parseFloat(v) || 0;   // 扣掉安全区（刘海、手势条）
    const aw = window.innerWidth - px(cs.paddingLeft) - px(cs.paddingRight), ah = window.innerHeight - px(cs.paddingTop) - px(cs.paddingBottom);
    const V = A.layout(V0.W * ah / Math.max(1, aw));   // 手机越长，场景越高（960 ~ 1200）
    const k = Math.min(aw / V.W, ah / V.H), dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = Math.floor(V.W * k) + 'px'; canvas.style.height = Math.floor(V.H * k) + 'px';
    canvas.width = Math.round(V.W * dpr * Math.max(1, k)); canvas.height = Math.round(V.H * dpr * Math.max(1, k));
  }
  window.addEventListener('resize', fit); fit();

  const toLogic = ev => { const b = canvas.getBoundingClientRect(), V = A.VIEW; return { x: (ev.clientX - b.left) * V.W / b.width, y: (ev.clientY - b.top) * V.H / b.height }; };
  const U = A.UI, hit = (b, p) => A.inside(b, p, 6);   // 按钮四周多留 6 像素，手指更好点
  // 按住地面拖动：角色跟着手指 / 鼠标走（每 0.15 秒更新一次目标）
  let drag = null;
  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'mouse') r.mouse = toLogic(ev);
    if (!drag || drag.id !== ev.pointerId || !app.canAct() || app.peekMode) return;
    const now = performance.now(); if (now - drag.t < 150) return; drag.t = now;
    const p = toLogic(ev), w = r.toWorld(p.x, p.y), pl = app.match.player;
    if (pl.room) { const k = app.match.grid.cellAt(w.x, w.y); if (!k || (k.room !== pl.room && k.door !== pl.room)) return; }   // 房间视角里拖到外面不出门（松手点外面才出门）
    app.tapWorld(w.x, w.y);
  });
  const endDrag = ev => { if (drag && drag.id === ev.pointerId) drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', ev => { r.mouse = null; endDrag(ev); });
  canvas.addEventListener('pointerdown', ev => {
    ev.preventDefault(); OS.audio.unlock();
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') r.touch = true; else if (ev.pointerType === 'mouse') r.touch = false;   // 手机上不显示键盘提示
    const p = toLogic(ev);
    if (app.screen === 'title') {
      const di = U.diff.find(b => hit(b, p)); if (di) { app.setDifficulty(di.id); OS.audio.play('click'); return; }
      if (hit(U.start, p)) { OS.audio.play('click'); app.start(); OS.audio.setTempo(1); }
      else if (hit(U.back, p)) location.href = 'index.html';
      return;
    }
    const m = app.match;
    if (m.phase === 'over') { if (hit(U.again, p)) { app.restart(); OS.audio.setTempo(1); } else if (hit(U.home2, p)) app.toTitle(); return; }
    if (app.paused && app.cardOpen) { app.toggleCard(); return; }   // 身份卡：点任意位置关闭
    if (app.paused) { if (hit(U.card, p)) app.toggleCard(); else if (hit(U.resume, p)) app.resume(); else if (hit(U.sound, p)) OS.audio.setMuted(app.toggleMute()); else if (hit(U.restart, p)) { app.restart(); OS.audio.setTempo(1); } else if (hit(U.home, p)) app.toTitle(); return; }
    if (hit(U.gear, p)) { if (m.phase === 'playing') app.pause(); return; }   // 设置：暂停菜单
    if (m.phase === 'prep') { if (hit(U.ready, p)) app.ready(); return; }   // 准备阶段：只有"准备好了"能点
    if (app.hasOffer()) { const i = A.offerRects(m.player.kind === 'boss' ? m.offer.options.length : 2).findIndex(c => hit(c, p)); if (i >= 0) { app.pickOffer(i); return; } }
    if (m.player.kind === 'employee' && hit(U.skill, p)) { app.empSkill(); return; }
    if (m.player.kind === 'boss') { const i = U.bskill.findIndex(c => hit(c, p)); if (i >= 0) { app.bossSkill(i); return; } }
    if (hit(A.actionRect(m.player.kind), p)) { app.act(); return; }
    if (p.y < A.VIEW.VY || p.y > A.VIEW.BOT) return;   // 顶栏、按钮区的空白处不算点地图
    // 房间视角：点房间外 = 出门；点房间里 = 在房间里走动
    const w = r.toWorld(p.x, p.y), pl = m.player;
    if (pl.room) {   // 员工和老板在房间里都是房间视角
      const k = m.grid.cellAt(w.x, w.y);
      if (!k || (k.room !== pl.room && k.door !== pl.room)) { app.act(); return; }
    }
    if (app.tapWorld(w.x, w.y)) r.clickFx = { x: w.x, y: w.y, t: 0 };
    drag = { id: ev.pointerId, t: performance.now() };
  }, { passive: false });

  // 键盘：WASD / 方向键移动，空格或回车 = 出门 / 回工位，P/Esc 暂停，M 静音
  const held = new Set(), DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  function applyDir() { let dx = 0, dy = 0; for (const k of held) { dx += DIRS[k][0]; dy += DIRS[k][1]; } app.setDir(dx, dy); }
  window.addEventListener('keydown', ev => {
    OS.audio.unlock();
    if (DIRS[ev.code]) { ev.preventDefault(); if (!held.has(ev.code)) { held.add(ev.code); applyDir(); } return; }
    if (ev.code === 'KeyM') { OS.audio.setMuted(app.toggleMute()); return; }
    if (app.screen === 'title') { const dk = { Digit1: 'easy', Digit2: 'normal', Digit3: 'hard' }[ev.code]; if (dk) { app.setDifficulty(dk); return; }   // 标题页 1/2/3 选难度
      if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); app.start(); OS.audio.setTempo(1); } return; }
    if (app.match.phase === 'over') { if (ev.code === 'Enter') { app.restart(); OS.audio.setTempo(1); } if (ev.code === 'Escape') app.toTitle(); return; }
    if (app.match.phase === 'prep') { if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); app.ready(); } return; }
    if (ev.code === 'Escape' && app.peekMode) { app.peekMode = false; return; }
    if (ev.code === 'KeyP' || ev.code === 'Escape') { app.togglePause(); return; }
    if (ev.code === 'KeyE') { app.empSkill(); return; }
    const dig = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[ev.code];
    if (dig != null) { if (app.hasOffer()) app.pickOffer(dig); else app.bossSkill(dig); return; }
    if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); app.act(); }
  });
  window.addEventListener('keyup', ev => { if (held.delete(ev.code)) applyDir(); });
  window.addEventListener('blur', () => { held.clear(); applyDir(); app.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) app.pause(); });

  // 游戏事件 → 提示文字 / 飘字 / 音效
  const ROOM = id => (A.ROOMS[id] ? A.ROOMS[id].name : '');   // 没有房间的事件也不能报错
  function events() {
    const m = app.match; if (!m) return;
    for (const ev of m.drainEvents()) {
      const me = ev.who === m.player.id;
      if (ev.type === 'blocked' && me && m.player.kind === 'boss') {
        r.toast(ev.reason === 'stay' ? '查房要待满，还剩 ' + Math.ceil(m.boss.stay) + ' 秒' : ev.reason === 'cooldown' ? '刚查过' + ROOM(ev.room) + '，' + Math.ceil(m.boss.cooldowns[ev.room]) + ' 秒后才能再查' : ev.reason === 'lockedDoor' ? '门被锁了，进不去' : '进不去', OS.theme.C.coral);
      } else if (ev.type === 'blocked' && me) {
        const cd = m.player.cooldowns[ev.room];
        r.toast({ full: ROOM(ev.room) + '满了，换个地方', cooldown: '刚去过' + ROOM(ev.room) + '，还要等 ' + Math.ceil(cd || 0) + ' 秒', locked: '会议室不能摸鱼', boss: '老板在' + ROOM(ev.room) + '里面，别进去！', lockedDoor: ROOM(ev.room) + '的门锁着', minStay: '刚进来，至少待满 ' + A.ECON.minStay + ' 秒才能出去' }[ev.reason], OS.theme.C.coral);
      }
      if (ev.type === 'enter' && me) { r.toast('开始在' + ROOM(ev.room) + '摸鱼' + (ev.lure >= 1.05 ? '（空房 ×' + ev.lure.toFixed(1) + '）' : '')); OS.audio.play('click'); }
      if (ev.type === 'check' && m.player.kind === 'boss' && !ev.caught.length) r.toast(ROOM(ev.room) + '里没人，有点尴尬', '#8C6B4F');
      if (ev.type === 'forced' && me) { r.toast('腿麻了，自动出门', OS.theme.C.coral); OS.audio.play('recall'); }
      if (ev.type === 'exit' && me && ev.pocket >= 1) { const p = m.player, cm = A.comboMult(p.combo), nx = A.comboMult(p.combo + 1); r.toast('口袋 $' + Math.floor(ev.pocket) + '：按空格回工位存 ×' + cm.toFixed(1) + (nx > cm ? '，或再摸一间变 ×' + nx.toFixed(1) : '')); }
      if (ev.type === 'deposit') {
        const a = m.get(ev.who); r.cam = r.camera();
        if (me) { r.float(r.sx(a.x), r.sy(a.y) - 40, '+$' + Math.floor(ev.amount) + (ev.mult > 1 ? '（连摸 ×' + ev.mult.toFixed(1) + '）' : ''), '#FFC93C'); OS.audio.play('coin'); }
      }
      if (ev.type === 'caught') {
        const a = m.get(ev.who); r.cam = r.camera();
        if (me) { r.toast('被老板抓到！没收口袋 ' + Math.round(ev.ratio * 100) + '%（-$' + Math.floor(ev.lost) + '）', OS.theme.C.coral); r.float(r.sx(a.x), r.sy(a.y) - 50, '-$' + Math.floor(ev.lost), '#E8746A'); r.shake = 0.4; OS.audio.play('caught'); }
        else if (m.player.kind === 'boss') { r.toast('抓到' + a.name + '！没收 $' + Math.floor(ev.lost) + '（收益 ×' + ev.mult.toFixed(1) + '）', '#2E9E5B'); r.cam = r.camera(); r.float(r.sx(a.x), r.sy(a.y) - 50, '+$' + Math.floor(ev.lost), '#2ECC71'); }
        else if (!m.player.room) r.toast(a.name + ' 在' + ROOM(ev.room) + '被抓了', '#8C6B4F');   // 在房间里听不到外面的事
      }
      if (ev.type === 'complaint') { r.toast(m.player.kind === 'boss' ? '员工投诉！你被 HR 约谈 ' + A.BOSS.hrTime + ' 秒' : '员工投诉！老板被 HR 约谈 ' + A.BOSS.hrTime + ' 秒', '#8F7CC4'); OS.audio.play('unlock'); }
      if (ev.type === 'hrDone' && !m.player.room) r.toast('老板约谈结束，回来了', '#8C6B4F');
      // —— A4：技能、升级、补给 ——
      const SUP = k => A.SUPPLY.items[k].name, me2 = id => id === m.player.id, isBoss = m.player.kind === 'boss';
      if (ev.type === 'supply') r.toast(ROOM(ev.room) + '出现了' + SUP(ev.kind) + '！', '#D9780A');
      if (ev.type === 'pickup') { if (me2(ev.who)) r.toast('捡到' + SUP(ev.kind) + '：' + A.SUPPLY.items[ev.kind].desc, '#2E9E5B'); }
      if (ev.type === 'supplyTaken' && (isBoss || !m.player.room)) r.toast('老板收走了' + ROOM(ev.room) + '的' + SUP(ev.kind), '#8C6B4F');
      if (ev.type === 'empSkill' && me2(ev.who)) r.toast({ rabbit: '冲刺！', cat: '替身留在工位上了', bear: '久蹲：这一趟能待更久', owl: '门锁上了，老板进不来' }[ev.who] || '技能', '#2E9E5B');
      if (ev.type === 'skillFail' && (me2(ev.who) || (ev.who === 'boss' && isBoss))) r.toast({ cooldown: '技能还在冷却', anger: '怒气不够', room: '要进了房间才能用', used: ev.skill === 'revisit' ? '这个阶段已经用过回马枪' : '这一趟已经用过了', window: '回马枪只能在离开房间后 10 秒内用', noTarget: '现在没人在摸鱼', target: '点一个摸鱼房间', inRoom: '在房间里用不了监控', locked: '门锁着', hr: '被 HR 约谈中' }[ev.reason] || '现在用不了', OS.theme.C.coral);
      if (ev.type === 'bossSkill' && isBoss) { r.toast({ dash: '冲刺！', peek: '监控' + ROOM(ev.room) + ' 3 秒', revisit: '回马枪！', raid: '下一次查房：突击检查', meeting: '临时会议！', fine: '下一次抓人：加倍罚款' }[ev.skill], '#9B51E0'); OS.audio.play('warning'); }
      if (ev.type === 'meeting') { if (me2(ev.who)) r.toast('你被老板拉去开会 ' + A.BOSS_SKILLS.meeting.dur + ' 秒（口袋保住了）', '#8F7CC4'); else if (isBoss || !m.player.room) r.toast(m.get(ev.who).name + ' 被拉去开会了', '#8C6B4F'); }
      if (ev.type === 'meetingDone' && me2(ev.who)) r.toast('开完会了，' + A.BOSS_SKILLS.meeting.immune + ' 秒内免抓', '#2E9E5B');
      if (ev.type === 'excused' && me2(ev.who)) { r.toast('请假条生效，这次不罚！', '#2E9E5B'); OS.audio.play('shielded'); }
      if (ev.type === 'levelUp' && me2(ev.who)) r.toast('升到 Lv' + ev.level + (ev.how === 'manual' ? '（培训手册）' : '') + (ev.level === 2 ? '，选一个方向' : '，技能强化'), '#2E9E5B');
      if (ev.type === 'phase' && isBoss && ev.phase > 0) OS.audio.play('unlock');
      if (ev.type === 'bossArrive' && (m.player.kind === 'boss' || !m.player.room)) r.toast(m.player.kind === 'boss' ? '出发！抓人收益越抓越多' : '老板到了！', OS.theme.C.coral);
      // —— A5：准备、冲刺 ——
      if (ev.type === 'go') { r.banner('开始摸鱼！'); OS.audio.setTempo(1); hello(); }
      if (ev.type === 'rush') { r.banner('下班冲刺！'); r.toast(isBoss ? '下班冲刺：员工收入 ×2，你移动 ×1.3' : '下班冲刺：房间收入 ×2，老板也加速了！', OS.theme.C.coral); OS.audio.setTempo(1.25); }
      { const snd = A.eventSound(ev, m); if (snd) OS.audio.play(snd); }
      if (ev.type === 'over') OS.audio.play(m.finalRanking()[0].a === m.player ? 'win' : 'lose');
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // 任何一帧出错都不能让主循环停掉（否则整个画面卡死）
    try { app.tick(dt); events(); } catch (e) { console.error(e); }
    try { r.draw(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__arena = app;   // 控制台调试
})();
