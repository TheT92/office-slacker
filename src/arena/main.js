// 摸鱼大作战：浏览器入口。负责高清缩放、鼠标/触摸/键盘输入、主循环、事件 → 提示与音效。
(function () {
  const OS = window.OS, A = OS.arena, canvas = document.getElementById('arena'), V0 = A.VIEW;
  let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
  const role = (location.search.match(/[?&]role=(boss|employee)/) || [])[1];   // 测试用：?role=boss / ?role=employee 指定身份
  const app = new A.App({ storage, matchOpts: role ? { playerRole: role } : {} }), r = new A.Renderer(canvas, app);
  // B4：3D 画面（three.js）。手机不支持 WebGL 时自动退回经典 2D 画面；暂停菜单可切换
  const gfxQ = (location.search.match(/[?&]gfx=(2d|3d)/) || [])[1]; if (gfxQ) app.gfx = gfxQ;
  const v3 = A.View3D ? new A.View3D(app, r, document.getElementById('world3d')) : null; r.v3 = v3;
  if (v3) v3.setEnabled(app.gfx !== '2d');
  const hello = () => { const p = app.match.player; r.toast(p.kind === 'boss' ? '你是老板！' + A.BOSS_ARRIVE.wait + 's 后到' : '你是' + p.name + '！绿框是工位'); };
  OS.audio.setMuted(app.muted); if (OS.audio.setSong) OS.audio.setSong('arena'); OS.audio.setMusic(app.music);   // 2.3.1：摸鱼大作战用自己的背景音乐

  // 画布按 9:16 竖屏铺满窗口（电脑上居中、两边留空），按设备像素比渲染（手机上不糊）
  function fit() {
    const cs = getComputedStyle(document.body), px = v => parseFloat(v) || 0;   // 扣掉安全区（刘海、手势条）
    const aw = window.innerWidth - px(cs.paddingLeft) - px(cs.paddingRight), ah = window.innerHeight - px(cs.paddingTop) - px(cs.paddingBottom);
    const V = A.layout(V0.W * ah / Math.max(1, aw));   // 手机越长，场景越高（960 ~ 1200）
    const k = Math.min(aw / V.W, ah / V.H), dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = Math.floor(V.W * k) + 'px'; canvas.style.height = Math.floor(V.H * k) + 'px';
    canvas.width = Math.round(V.W * dpr * Math.max(1, k)); canvas.height = Math.round(V.H * dpr * Math.max(1, k));
    const wrap = document.getElementById('stage'); if (wrap) { wrap.style.width = canvas.style.width; wrap.style.height = canvas.style.height; }
    if (v3 && v3.ok) v3.fit(Math.floor(V.W * k), Math.floor(V.H * k), dpr);
  }
  window.addEventListener('resize', fit); fit();

  const toLogic = ev => { const b = canvas.getBoundingClientRect(), V = A.VIEW; return { x: (ev.clientX - b.left) * V.W / b.width, y: (ev.clientY - b.top) * V.H / b.height }; };
  const U = A.UI, hit = (b, p) => A.inside(b, p, 6);   // 按钮四周多留 6 像素，手指更好点
  // 按住地面拖动：角色跟着手指 / 鼠标走（每 0.15 秒更新一次目标）
  let drag = null;
  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'mouse') r.mouse = toLogic(ev);
    if (!drag || drag.id !== ev.pointerId || !app.canAct()) return;
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
      if (hit(U.titleSound, p)) { OS.audio.setMuted(app.toggleMute()); OS.audio.play('click'); return; }   // 喇叭：音效开关
      const di = U.diff.find(b => hit(b, p)); if (di) { app.setDifficulty(di.id); OS.audio.play('click'); return; }
      if (hit(U.start, p)) { OS.audio.play('click'); app.start(); OS.audio.setTempo(1); }
      else if (hit(U.back, p)) location.href = 'index.html';
      return;
    }
    const m = app.match;
    if (m.phase === 'over') { if (hit(U.again, p)) { app.restart(); OS.audio.setTempo(1); } else if (hit(U.home2, p)) app.toTitle(); return; }
    if (app.paused && app.cardOpen) { app.toggleCard(); return; }   // 身份卡：点任意位置关闭
    if (app.paused) { if (hit(U.card, p)) app.toggleCard(); else if (hit(U.resume, p)) app.resume(); else if (hit(U.sound, p)) OS.audio.setMuted(app.toggleMute()); else if (hit(U.restart, p)) { app.restart(); OS.audio.setTempo(1); } else if (hit(U.home, p)) app.toTitle(); else if (v3 && v3.ok && hit(U.gfx, p)) v3.setEnabled(app.toggleGfx() === '3d'); return; }
    if (hit(U.gear, p)) { if (m.phase === 'playing') app.pause(); return; }   // 设置：暂停菜单
    if (m.phase === 'prep') { if (hit(U.ready, p)) app.ready(); return; }   // 准备阶段：只有"准备好了"能点
    if (app.hasOffer()) { const i = A.offerRects(m.player.kind === 'boss' ? m.offer.options.length : 2).findIndex(c => hit(c, p)); if (i >= 0) { app.pickOffer(i); return; } }
    if (m.player.kind === 'employee' && hit(U.skill, p)) { app.empSkill(); return; }
    if (m.player.kind === 'employee' && hit(U.item, p)) { app.useItem(); return; }
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
    if (ev.code === 'KeyP' || ev.code === 'Escape') { app.togglePause(); return; }
    if (ev.code === 'KeyE') { app.empSkill(); return; }
    if (ev.code === 'KeyQ') { app.useItem(); return; }
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
      if (v3) try { v3.onEvent(ev); } catch (e) { console.error(e); }
      const me = ev.who === m.player.id;
      if (ev.type === 'blocked' && me && m.player.kind === 'boss') {
        r.toast(ev.reason === 'stay' ? '再待 ' + Math.ceil(m.boss.stay) + 's' : ev.reason === 'cooldown' ? ROOM(ev.room) + ' 冷却 ' + Math.ceil(m.boss.cooldowns[ev.room]) + 's' : ev.reason === 'lockedDoor' ? '门被堵住了！' : ev.reason === 'locked' ? '老板不能进厕所' : ev.reason === 'closed' ? ROOM(ev.room) + '关了' : '进不去', OS.theme.C.coral);
      } else if (ev.type === 'blocked' && me) {
        const cd = m.player.cooldowns[ev.room];
        r.toast({ full: ROOM(ev.room) + '满了', cooldown: ROOM(ev.room) + ' 冷却 ' + Math.ceil(cd || 0) + 's', locked: '进不去', boss: '老板在里面！', lockedDoor: '门被堵住了', closed: ROOM(ev.room) + '关了', minStay: '至少待 ' + A.ECON.minStay + 's' }[ev.reason], OS.theme.C.coral);
      }
      if (ev.type === 'enter' && me) { r.toast('开始摸鱼' + (ev.lure >= 1.05 ? ' ×' + ev.lure.toFixed(1) : '')); OS.audio.play('click'); }
      if (ev.type === 'check' && m.player.kind === 'boss' && !ev.caught.length) r.toast('没人！怒气 −' + A.BOSS.emptyAnger, '#8C6B4F');
      if (ev.type === 'forced' && me) { r.toast('腿麻了，自动出门', OS.theme.C.coral); OS.audio.play('recall'); }
      if (ev.type === 'exit' && me && ev.pocket >= 1) { const p = m.player, cm = A.comboMult(p.combo), nx = A.comboMult(p.combo + 1); r.toast('回工位存 ×' + cm.toFixed(1) + (nx > cm ? '，再摸 ×' + nx.toFixed(1) : '')); }
      if (ev.type === 'deposit') {
        const a = m.get(ev.who); r.cam = r.camera();
        if (me) { r.float(r.P(a.x, a.y, 1.6).X, r.P(a.x, a.y, 1.6).Y, '+$' + Math.floor(ev.amount) + (ev.mult > 1 ? '（连摸 ×' + ev.mult.toFixed(1) + '）' : ''), '#FFC93C'); OS.audio.play('coin'); }
      }
      if (ev.type === 'caught') {
        r.bossAngryT = 2.5;   // 3D：老板抓到人时喷火
        const a = m.get(ev.who); r.cam = r.camera();
        if (me) { r.toast('被抓！-$' + Math.floor(ev.lost) + '（' + Math.round(ev.ratio * 100) + '%）', OS.theme.C.coral); r.float(r.P(a.x, a.y, 1.8).X, r.P(a.x, a.y, 1.8).Y, '-$' + Math.floor(ev.lost), '#E8746A'); r.shake = 0.4; OS.audio.play('caught'); }
        else if (m.player.kind === 'boss') { r.toast((ev.bounty ? '抓到头名' : '抓到') + a.name + ' +$' + Math.floor(ev.lost * ev.mult), '#2E9E5B'); r.cam = r.camera(); r.float(r.P(a.x, a.y, 1.8).X, r.P(a.x, a.y, 1.8).Y, '+$' + Math.floor(ev.lost), '#2ECC71'); }
        else if (!m.player.room) r.toast(a.name + ' 在' + ROOM(ev.room) + '被抓了', '#8C6B4F');   // 在房间里听不到外面的事
      }
      // —— A4：技能、升级、补给 ——
      const SUP = k => A.SUPPLY.items[k].name, me2 = id => id === m.player.id, isBoss = m.player.kind === 'boss';
      if (ev.type === 'supply') r.toast(ROOM(ev.room) + '出现了' + SUP(ev.kind) + '！', '#D9780A');
      if (ev.type === 'pickup') { if (me2(ev.who) && !A.SUPPLY.items[ev.kind].held) r.toast(SUP(ev.kind) + '：' + A.SUPPLY.items[ev.kind].desc, '#2E9E5B'); }
      if (ev.type === 'supplyTaken' && (isBoss || !m.player.room)) r.toast('老板收走了' + SUP(ev.kind), '#8C6B4F');
      if (ev.type === 'empSkill' && me2(ev.who)) r.toast({ rabbit: '冲刺！能插队', cat: '打翻 ' + (ev.targets || []).map(id => m.get(id).name).join('、') + '！', bear: '门堵上了', owl: '夜视！' }[ev.who] || '技能', '#2E9E5B');
      if (ev.type === 'skillFail' && (me2(ev.who) || (ev.who === 'boss' && isBoss))) r.toast({ cooldown: '技能还在冷却', anger: '怒气不够', room: '房间里才能用', office: '办公区才能用', used: '这次用过了', window: '离开太久了', noTarget: '没目标', target: '点一个摸鱼房间', inRoom: '房间里不能用', locked: '门被堵着' }[ev.reason] || '现在用不了', OS.theme.C.coral);
      // —— 2.2.0：插队、打翻水杯、敲门 ——
      if (ev.type === 'bumped') { if (me2(ev.who)) r.toast('被' + m.get(ev.by).name + '挤出来了', OS.theme.C.coral); else if (me2(ev.by)) r.toast('插队成功！', '#2E9E5B'); }
      if (ev.type === 'deskLock' && me2(ev.who)) { r.toast('工位被打翻！' + Math.ceil(ev.t) + 's', OS.theme.C.coral); OS.audio.play('warning'); }
      if (ev.type === 'deskLocked' && me2(ev.who)) r.toast('工位锁 ' + Math.ceil(ev.t) + 's', OS.theme.C.coral);
      // —— 2.2.0 B2：随机事件、红包、香蕉皮、捣乱补给、悬赏 ——
      if (ev.type === 'eventSoon') OS.audio.play('tick');
      if (ev.type === 'event') { r.showEvents(ev.list); OS.audio.play(ev.list.some(e => e.who === m.player.id && !e.good) ? 'warning' : 'unlock'); }
      if (ev.type === 'bag') { if (ev.who === 'boss' && !isBoss && !m.player.room) r.toast('老板抢走了一个红包', '#8C6B4F'); if (me2(ev.who) || (ev.who === 'boss' && isBoss)) { r.toast('红包 +$' + ev.cash, '#E0453A'); OS.audio.play('coin'); } }
      if (ev.type === 'slip') { if (me2(ev.who)) { r.toast('踩到香蕉皮，滑倒了！', OS.theme.C.coral); r.shake = 0.3; } else if (me2(ev.by)) r.toast(m.get(ev.who).name + '踩到了你的香蕉皮！', '#2E9E5B'); }
      if (ev.type === 'reopen' && !m.player.room) r.toast(ROOM(ev.room) + '修好了，可以进了', '#8C6B4F');
      if (ev.type === 'itemUse') {
        const I = A.SUPPLY.items[ev.item], tg = ev.target && m.get(ev.target);
        if (me2(ev.who)) r.toast({ seal: '封了' + (tg && tg.name) + '的工位', banana: '香蕉皮丢下了', fake: '吓了' + (tg && tg.name) + '一跳', steal: '抢功劳生效' }[ev.item], '#2E9E5B');
        else if (ev.target === m.player.id && ev.item === 'seal') { r.toast('工位被封！' + I.dur + 's', OS.theme.C.coral); OS.audio.play('warning'); }
        else if (ev.target === m.player.id && ev.item === 'fake') { if (m.player.room) { r.fakeT = 2.5; OS.audio.play('door'); } else r.toast('老板来了！', OS.theme.C.coral); }
      }
      if (ev.type === 'itemFail' && me2(ev.who)) r.toast({ office: '办公区才能丢', noTarget: '没目标' }[ev.reason] || '现在用不了', OS.theme.C.coral);
      if (ev.type === 'stolen') { if (me2(ev.who)) r.toast('被抢功劳 -$' + Math.floor(ev.amount), OS.theme.C.coral); else if (me2(ev.by)) r.toast('抢功劳成功：+$' + Math.floor(ev.amount), '#2E9E5B'); }
      if (ev.type === 'pickup' && me2(ev.who) && A.SUPPLY.items[ev.kind].held) r.toast('捡到' + A.SUPPLY.items[ev.kind].name + (r.touch ? '' : '（Q）'), '#2E9E5B');
      if (ev.type === 'knock') { if (me2(ev.who)) { r.toast('有人敲门！剩下的时间减半', '#4FA9B3'); OS.audio.play('door'); } else if (me2(ev.by)) r.toast('敲门成功，里面的人得快点出来了', '#2E9E5B'); }
      if (ev.type === 'bossSkill' && isBoss) { r.toast({ dash: '冲刺！', peek: '监控 ' + A.BOSS_SKILLS.peek.dur + 's：去门口看', revisit: '回马枪！', raid: '突击检查！', meeting: '临时会议！', fine: '加倍罚款！' }[ev.skill], '#9B51E0'); OS.audio.play('warning'); }
      if (ev.type === 'meeting') { if (me2(ev.who)) r.toast('被叫去开会 ' + A.BOSS_SKILLS.meeting.dur + 's', '#8F7CC4'); else if (isBoss || !m.player.room) r.toast(m.get(ev.who).name + ' 被拉去开会了', '#8C6B4F'); }
      if (ev.type === 'meetingDone' && me2(ev.who)) r.toast('开完会，免抓 ' + A.BOSS_SKILLS.meeting.immune + 's', '#2E9E5B');
      if (ev.type === 'excused' && me2(ev.who)) { r.toast('请假条生效，这次不罚！', '#2E9E5B'); OS.audio.play('shielded'); }
      if (ev.type === 'levelUp' && me2(ev.who)) r.toast('升到 Lv' + ev.level + (ev.how === 'manual' ? '（培训手册）' : '') + (ev.level === 2 ? '，选方向' : ''), '#2E9E5B');
      if (ev.type === 'phase' && isBoss && ev.phase > 0) OS.audio.play('unlock');
      if (ev.type === 'bossArrive' && (m.player.kind === 'boss' || !m.player.room)) r.toast(m.player.kind === 'boss' ? '出发！' : '老板到了！', OS.theme.C.coral);
      // —— A5：准备、冲刺 ——
      if (ev.type === 'go') { r.banner('开始摸鱼！'); OS.audio.setTempo(1); hello(); }
      if (ev.type === 'rush') { r.banner('下班冲刺！'); r.toast(isBoss ? '冲刺！你移速 ×1.3' : '冲刺！收入 ×2', OS.theme.C.coral); OS.audio.setTempo(1.2); }
      { const snd = A.eventSound(ev, m); if (snd) OS.audio.play(snd); }
      if (ev.type === 'over') OS.audio.play(m.finalRanking()[0].a === m.player ? 'win' : 'lose');
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // 任何一帧出错都不能让主循环停掉（否则整个画面卡死）
    try { app.tick(dt); events(); } catch (e) { console.error(e); }
    try { if (v3) v3.draw(dt); } catch (e) { console.error(e); }
    try { r.draw(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__arena = app; window.__v3 = v3;   // 控制台调试
})();
