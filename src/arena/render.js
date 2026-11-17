// 摸鱼大作战：画面（2D 俯视卡通，沿用闯关模式的动物、配色与描边风格）。
// 2.1.0 竖屏：逻辑画布 540×960。上面是顶栏（头像、钱、倒计时、设置），中间是游戏场景（镜头跟着自己走，
// 一次只看得到身边一块），下面是按钮区（员工：大按钮 + 技能；老板：3 个技能格 + 大按钮）。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};
  const T = () => OS.theme, C = () => OS.theme.C, F = (s, b) => OS.theme.font(s, b);
  // 宽固定 540；高按手机屏幕比例在 960 ~ 1200 之间自适应（A.layout），多出来的高度给场景
  const W = 540, TS = 54, TOP = 108, VY = TOP;
  let H = 960, BOT = 812, VH = BOT - TOP;   // 场景区域：y 108 ~ BOT
  const FLOOR = { office: '#FFF4E2', officeAlt: '#FBEBD3', stairs: '#D9CDBF', void: '#E6D6C0' };
  const RCOL_LOCAL = { print: { fill: '#E3ECF6', edge: '#6F98C2' }, toilet: { fill: '#DDF2F2', edge: '#4FA9B3' } };   // 2.2.0 新房间的配色
  const RCOL = id => (RCOL_LOCAL[id] || T().ROOM[id] || { fill: '#F6DCC8', edge: '#D8A98A' });
  const BOSS_RED = '#E0453A';

  // 界面按钮（逻辑坐标）
  const UI = {
    gear: { x: 482, y: 14, w: 46, h: 46 },
    titleSound: { x: 474, y: 16, w: 52, h: 52 },   // 标题页右上角：音效开关（喇叭）
    action: { x: 16, y: 830, w: 296, h: 96 },          // 员工大按钮
    item: { x: 320, y: 830, w: 72, h: 96 },            // 员工道具格（捣乱补给，Q）
    skill: { x: 400, y: 830, w: 124, h: 96 },          // 员工技能（E）
    bossAction: { x: 16, y: 898, w: 508, h: 50 },      // 老板：离开房间
    start: { x: 150, y: 690, w: 240, h: 60, label: '开始' },
    back: { x: 170, y: 770, w: 200, h: 46, label: '返回闯关模式' },
    resume: { x: 150, y: 330, w: 240, h: 54, label: '继续' },
    card: { x: 150, y: 400, w: 240, h: 54, label: '查看身份卡' },
    sound: { x: 150, y: 470, w: 240, h: 54 },
    restart: { x: 150, y: 540, w: 240, h: 54, label: '重新开始' },
    home: { x: 150, y: 610, w: 240, h: 54, label: '返回首页' },
    gfx: { x: 150, y: 680, w: 240, h: 54 },
    again: { x: 40, y: 862, w: 220, h: 56, label: '再来一局' },
    home2: { x: 280, y: 862, w: 220, h: 56, label: '返回首页' },
    ready: { x: 140, y: 866, w: 260, h: 56, label: '准备好了' },
  };
  UI.diff = ['easy', 'normal', 'hard'].map((id, i) => ({ id, x: 60 + i * 146, y: 560, w: 128, h: 46 }));   // 标题页：AI 老板难度
  UI.bskill = [0, 1, 2].map(i => ({ x: 16 + i * 172, y: 826, w: 164, h: 62 }));   // 老板最多 3 个技能
  A.actionRect = kind => (kind === 'boss' ? UI.bossAction : UI.action);
  // 阶段选技能 / 升级选方向的卡片：竖着排在场景中间
  A.offerRects = n => { const w = 480, h = 150, gap = 16, y0 = VY + 110 + (3 - n) * (h + gap) / 2; return Array.from({ length: n }, (_, i) => ({ x: (W - w) / 2, y: y0 + i * (h + gap), w, h })); };
  A.UI = UI;
  // 按画面高度重新摆放底部按钮（顶栏和场景顶部不动）
  A.layout = function (h) {
    H = Math.round(Math.max(960, Math.min(1200, h || 960))); BOT = H - 148; VH = BOT - VY;
    const d = H - 960, mid = Math.round(d / 2);
    UI.action.y = BOT + 18; UI.item.y = BOT + 18; UI.skill.y = BOT + 18; UI.bskill.forEach(b => (b.y = BOT + 14)); UI.bossAction.y = BOT + 86;
    UI.ready.y = 866 + d; UI.again.y = 862 + d; UI.home2.y = 862 + d;
    [['resume', 330], ['card', 400], ['sound', 470], ['restart', 540], ['home', 610], ['gfx', 680]].forEach(([id, y]) => (UI[id].y = y + mid));
    const t0 = Math.round(mid * 0.6); UI.diff.forEach(b => (b.y = 588 + t0)); UI.start.y = 690 + t0; UI.back.y = 764 + t0;   // 标题页：规则板在上，按钮在中间，动物在最下面
    A.VIEW = { W, H, TS, TOP, BOT, VY, VH };
    return A.VIEW;
  };
  const inside = (b, p, pad) => { pad = pad || 0; return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad; };
  A.inside = inside;

  class ArenaRenderer {
    constructor(canvas, app) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.app = app;
      this.time = 0; this.toasts = []; this.floats = []; this.mouse = null; this.clickFx = null; this.cam = null; this.touch = false;
      this.focus = null;   // 镜头中心（世界坐标，平滑跟随）
    }
    pulse(p) { return 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 / p); }
    toast(text, color) { this.toasts.push({ text, t: 0, color: color || T().OUTLINE }); if (this.toasts.length > 2) this.toasts.shift(); }
    float(x, y, text, color) { this.floats.push({ x, y, text, color, t: 0 }); }
    key(k) { return this.touch ? '' : '  ' + k; }   // 电脑上才显示快捷键
    // —— 镜头 ——
    // 房间里：只看得到这个房间（放大居中）；办公区：以自己为中心、每格 54 像素的一块
    camera(dt) {
      const m = this.app.match, p = m && m.player;
      if (p && p.room && !(p.nightT > 0) && m.phase === 'playing') {   // 房间里：房间铺满场景（放大），镜头在房间范围内跟着自己走（猫头鹰夜视时看外面）
        const cells = m.grid.cells.filter(k => k.room === p.room || k.door === p.room);
        const c0 = Math.min(...cells.map(k => k.c)), c1 = Math.max(...cells.map(k => k.c)) + 1, r0 = Math.min(...cells.map(k => k.r)), r1 = Math.max(...cells.map(k => k.r)) + 1;
        const s = Math.min(4 * TS, Math.max(W / (c1 - c0), VH / (r1 - r0)));   // 铺满场景（小房间也不留空）
        if (!this.rfocus || this.rfocus.room !== p.room || !dt) this.rfocus = { room: p.room, x: p.x, y: p.y };
        else { const k = Math.min(1, dt * 10); this.rfocus.x += (p.x - this.rfocus.x) * k; this.rfocus.y += (p.y - this.rfocus.y) * k; }
        const fit = (lo, hi, vlo, vlen, f) => (hi - lo) * s <= vlen ? vlo + (vlen - (hi - lo) * s) / 2 - lo * s : Math.min(vlo - lo * s, Math.max(vlo + vlen - hi * s, vlo + vlen / 2 - f * s));
        this.focus = null;
        return { s, ox: fit(c0, c1, 0, W, this.rfocus.x), oy: fit(r0, r1, VY, VH, this.rfocus.y), room: p.room, box: [c0, r0, c1, r1] };
      }
      this.rfocus = null;
      const g = m.grid, tx = p ? p.x : A.BOSS_ARRIVE.x, ty = p ? p.y : A.BOSS_ARRIVE.y;
      if (!this.focus || !dt || Math.hypot(tx - this.focus.x, ty - this.focus.y) > 6) this.focus = { x: tx, y: ty };   // 瞬移（开会、出生）直接切过去
      else { const k = Math.min(1, dt * 10); this.focus.x += (tx - this.focus.x) * k; this.focus.y += (ty - this.focus.y) * k; }
      const S = p ? A.sightOf(p) : A.SIGHT, ts = TS * A.SIGHT.w / S.w;   // 视野大的人（老板、猫头鹰、夜视）画面缩小、看得更多
      let ox = W / 2 - this.focus.x * ts, oy = VY + VH / 2 - this.focus.y * ts;
      ox = Math.min(0, Math.max(W - g.cols * ts, ox)); oy = Math.min(VY, Math.max(VY + VH - g.rows * ts, oy));   // 不拍到地图外面
      return { s: ts, ox, oy, room: null };
    }
    toWorld(px, py) { if (this.is3d()) return this.v3.toWorld(px, py); const c = this.cam || this.camera(); return { x: (px - c.ox) / c.s, y: (py - c.oy) / c.s }; }
    // 某个格子点现在在不在屏幕的场景区域里（2D / 3D 通用）
    seen(x, y, h, pad) { if (this.is3d()) return this.v3.onScreen(x, y, h, pad); return this.onScreen(x, y, pad); }
    // 3D 模式下贴在场景上的提示：门上的状态、门牌、工位、补给名字、红包金额、头顶的标签和口袋（B4-3）
    overlay3d() {
      const { ctx } = this, m = this.app.match, p = m.player, g = m.grid, room = this.cam.room, V3 = this.v3, chip = (q, dy, t, col, sz) => this.chip(q.X, q.Y + (dy || 0), t, col, sz);
      const hide = p.kind === 'boss' && m.boss.waitT > 0 && m.phase === 'playing'; if (hide) return;
      if (!room) {
        // 门牌（门的正上方）+ 门上的状态（门外一侧）
        for (const id of ['print', 'toilet', 'pantry', 'rooftop']) {
          const d = this.doorInfo(id); if (!V3.onScreen(d.x, d.y, 2.4, 20)) continue;
          const R = A.ROOMS[id], lure = R.slack ? m.lure(id) : 1, lt = lure >= 1.05 ? ' ×' + lure.toFixed(1) : '', n = m.occupants(id).filter(e => e.kind === 'employee').length;
          const text = R.safe ? (p.kind === 'boss' ? R.name + ' 进不去' : R.name + ' ' + n + '/' + R.cap) : p.kind === 'boss' ? R.name + lt : R.name + ' ' + n + '/' + R.cap + lt;
          const q = this.P(d.x, d.y, 2.5); ctx.font = F(22, true); const w = ctx.measureText(text).width + 22;
          T().chunky(ctx, q.X - w / 2, q.Y - 17, w, 34, 17, '#FFFFFF', { depth: 2, lineWidth: 2 }); T().boldText(ctx, text, q.X, q.Y + 0.5, 22, R.slack ? RCOL(id).edge : '#B08D6F');
        }
        const at = id => { const d = this.doorInfo(id); return V3.onScreen(d.x, d.y, 0, 10) ? this.P(d.x + d.dx * 1.1, d.y + d.dy * 1.1, 0.4) : null; };
        for (const id in m.closed) { const q = at(id); if (q) chip(q, -26, '关 ' + Math.ceil(m.closed[id]) + 's', '#A99A88'); }
        if (p.kind === 'employee') { const q = at('toilet'); if (q) { const why = m.entryBlock(p, 'toilet'); if (p.knockT > 0) chip(q, -26, '敲门 ' + Math.ceil(A.ROOMS.toilet.knock - p.knockT) + 's', '#4FA9B3'); if (why === 'full') chip(q, 0, '有人', '#4FA9B3'); else if (why === 'cooldown') chip(q, 0, '' + Math.ceil(p.cooldowns.toilet) + 's', '#A99A88'); } }
        for (const id of A.SLACK_ROOMS) {
          const q = at(id); if (!q) continue;
          if (p.kind === 'boss') { if (p.cooldowns[id] > 0) chip(q, 0, '' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88'); continue; }
          const why = m.entryBlock(p, id);
          if (why === 'boss') chip(q, 0, '老板!', BOSS_RED); else if (why === 'cooldown') chip(q, 0, '' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88'); else if (why === 'full') chip(q, 0, '满了', C().coral);
        }
        // 工位：我的工位 / 打翻了 / 老板看到谁不在
        for (const d of A.DESKS) {
          if (!V3.onScreen(d.c + 1, d.r + 0.5, 0, 30)) continue;
          const own = p.desk === d, owner = m.employees().find(e => e.desk === d), lockT = m.deskLocks && m.deskLocks[d.id];
          if (own) chip(this.P(d.c + 1, d.r + 1.7, 0), 0, '我的工位', '#2ECC71', 11);
          if (lockT > 0 && A.inSight(p, d.c + 1, d.r + 0.5)) chip(this.P(d.c + 1, d.r + 0.5, 1.6), 0, '打翻 ' + Math.ceil(lockT) + 's', C().coral, 11);
          if (p.kind === 'boss' && owner && owner.room) chip(this.P(d.c + 1, d.r + 1.7, 0), 0, owner.name + ' 不在', C().coral, 11);
        }
        // 红包金额
        for (const b of m.bags || []) if (A.inSight(p, b.x, b.y)) chip(this.P(b.x, b.y, 0.85), 0, '$' + b.cash, '#E0453A', 11);
        // 监控：房间里有几个人
        if (p.kind === 'boss') for (const id of m.peekRooms()) { const cs = g.cells.filter(k => k.room === id), cx = cs.reduce((a, k) => a + k.c + 0.5, 0) / cs.length, cy = cs.reduce((a, k) => a + k.r + 0.5, 0) / cs.length, q = this.P(cx, cy, 1.2), n = m.employees().filter(e => e.room === id).length; this.chip(Math.max(85, Math.min(W - 85, q.X)), Math.max(VY + 24, Math.min(BOT - 24, q.Y)), A.ROOMS[id].name + ' ' + n + ' 人', '#9B51E0', 13); }
      }
      // 补给名字 + 捡起读条
      for (const it of m.supplies) {
        if (!V3.seesSpot(it.x, it.y, it.room)) continue; const q = this.P(it.x, it.y, 0.9), I = A.SUPPLY.items[it.kind];
        ctx.font = F(18, true); const w = ctx.measureText(I.name).width + 14; T().chunky(ctx, q.X - w / 2, q.Y - 13, w, 26, 13, '#FFFFFF', { depth: 1, lineWidth: 1.5 }); T().boldText(ctx, I.name, q.X, q.Y + 0.5, 18, '#8C6B4F');
        if (it.prog > 0) { const c = this.P(it.x, it.y, 0.3); ctx.beginPath(); ctx.arc(c.X, c.Y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * it.prog / (it.need || A.SUPPLY.pick)); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 4; ctx.stroke(); }
      }
      // 人物头顶：老板名牌；员工的皇冠、开会 / 滑倒；自己：箭头和状态；口袋金币
      const peek = p.kind === 'boss' ? m.peekRooms() : [];
      for (const a of m.actors) {
        if (!A.visible3d(m, p, a, { room, peek })) continue;
        const head = this.P(a.x, a.y, a.kind === 'boss' ? 2.35 : 2.0); if (head.X < -40 || head.X > W + 40 || head.Y < VY - 40 || head.Y > BOT + 40) continue;
        if (a.kind === 'boss') {
          const st = a.freezeT > 0 ? '开会' : a.stay > 0 ? '查房!' : a.dashT > 0 ? '冲刺!' : '', txt = (a === p ? '老板（你）' : '老板') + (st ? ' ' + st : ''), ty = Math.max(VY + 16, head.Y + Math.sin(this.time * 3) * 2);
          ctx.font = F(21, true); const w = ctx.measureText(txt).width + 26; T().chunky(ctx, head.X - w / 2, ty - 17, w, 34, 17, BOSS_RED, { depth: 2, lineWidth: 2 }); T().boldText(ctx, txt, head.X, ty + 0.5, 21, '#FFFFFF');
          continue;
        }
        let top = head.Y;
        if (a === p) { T().boldText(ctx, '▼', head.X, top - 4 * this.pulse(0.7), 18, '#FFC93C'); top -= 22;
          const tags = [a.dashT > 0 && '冲刺', a.nightT > 0 && '夜视 ' + Math.ceil(a.nightT) + 's', a.numbT > 0 && '腿麻 ' + Math.ceil(a.numbT) + 's', a.doubleT > 0 && '×2 ' + Math.ceil(a.doubleT) + 's', a.leaveNote && '请假条', a.immuneT > 0 && '免抓 ' + Math.ceil(a.immuneT) + 's', a.fastT > 0 && '咖啡因 ' + Math.ceil(a.fastT) + 's', a.inspire > 1 && '灵感 ×' + a.inspire, a.spottedT > 0 && '被点名 ' + Math.ceil(a.spottedT) + 's'].filter(Boolean);
          const mid = this.P(a.x, a.y, 1.0); tags.forEach((t, i) => this.chip(mid.X - 62, mid.Y + i * 34, t, '#2E9E5B', 11)); }
        if (m.leader() === a) { this.crown(head.X, top - 4); top -= 22; }
        if (a.meetingT > 0) this.chip(head.X, top - 12, '开会中 ' + Math.ceil(a.meetingT) + 's', '#97CDB1', 11);
        if (a.slipT > 0) this.chip(head.X, top - 12, '滑倒了！', '#D9A21E', 11);
        if (a.pocket >= 1) { const cm = A.comboMult(a.combo), t = p.kind === 'boss' ? '?' : '$' + Math.floor(a.pocket) + (cm > 1 ? ' ×' + cm.toFixed(1) : ''), q = this.P(a.x, a.y, 1.3); ctx.font = F(24, true); const w = ctx.measureText(t).width + 54, bx = q.X + 22, by = q.Y - 20; T().chunky(ctx, bx, by, w, 40, 20, '#FFF1D2', { depth: 3, lineWidth: 2.5 }); T().coin(ctx, bx + 21, by + 20, 13); ctx.fillStyle = C().moneyDeep; ctx.textAlign = 'left'; ctx.fillText(t, bx + 40, by + 21); }
      }
    }
    // 3D 画面开着并且在对局里（B4）
    is3d() { return !!(this.v3 && this.v3.on && this.app.screen !== 'title' && this.app.match); }
    // 格子坐标 → 屏幕坐标（2D / 3D 通用；h = 离地高度，单位格）
    P(x, y, h) { if (this.is3d()) return this.v3.project(x, y, h); return { X: this.sx(x), Y: this.sy(y) - (h || 0) * this.cam.s }; }
    sx(x) { return this.cam.ox + x * this.cam.s; }
    sy(y) { return this.cam.oy + y * this.cam.s; }
    onScreen(x, y, pad) { pad = pad || 0; const X = this.sx(x), Y = this.sy(y); return X >= -pad && X <= W + pad && Y >= VY - pad && Y <= BOT + pad; }

    draw(dt) {
      this.time += dt; this.fakeT = Math.max(0, (this.fakeT || 0) - dt);
      const { ctx, canvas } = this, dpr = canvas.width / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'middle';
      ctx.fillStyle = '#EFE4D4'; ctx.fillRect(0, 0, W, H);
      const app = this.app;
      if (app.screen === 'title') { this.title(); this.drawToasts(dt); return; }
      const m = app.match;
      this.cam = this.camera(dt);
      // 场景（只画在中间区域）
      const d3 = this.is3d(); this.bossAngryT = Math.max(0, (this.bossAngryT || 0) - dt);
      ctx.save(); ctx.beginPath(); ctx.rect(0, VY, W, VH); ctx.clip();
      if (d3) ctx.clearRect(0, VY, W, VH);   // 3D：场景区域透明，露出下面的 WebGL 画布
      else { ctx.fillStyle = FLOOR.void; ctx.fillRect(0, VY, W, VH); }
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const k = this.shake * 18; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
      if (!d3) this.world(); else this.overlay3d();
      if (this.cam.room) this.roomOverlay();
      else if (m.player.kind === 'boss' && m.boss.waitT > 0 && m.phase === 'playing') this.bossWaitOverlay();
      else this.deskArrow();
      const hide = m.player.kind === 'boss' && m.boss.waitT > 0 && m.phase === 'playing';
      if (!hide) this.spottedMarks();
      if (m.rush && m.phase === 'playing') {   // 下班冲刺：场景四周一圈跳动的红光
        const a = 0.3 + 0.18 * this.pulse(0.8), g = ctx.createRadialGradient(W / 2, VY + VH / 2, Math.min(W, VH) * 0.42, W / 2, VY + VH / 2, Math.max(W, VH) * 0.62);
        if (g) { g.addColorStop(0, 'rgba(224,69,58,0)'); g.addColorStop(1, 'rgba(224,69,58,' + a.toFixed(3) + ')'); ctx.fillStyle = g; ctx.fillRect(0, VY, W, VH); }
      }
      this.eventStrip();
      this.offerOverlay();
      this.arriveHud();
      if (hide) this.floats = []; else this.drawFloats(dt);   // 飘字也会暴露员工位置
      this.drawToasts(dt); this.drawBanner(dt); this.drawEventCard(dt);
      ctx.restore();
      this.topBar(); this.bottomBar();
      if (m.phase === 'prep') this.identityCard(true);
      if (app.paused) this.pauseOverlay();
      if (m.phase === 'over') this.result();
    }

    // 当前视角能不能看到某个房间里面：房间视角只看自己所在的房间；老板在办公区看不见房间里面（监控中的房间除外）
    canSee(roomId) {
      const m = this.app.match, p = m.player;
      if (this.cam.room) return roomId === this.cam.room;
      if (p.kind === 'boss') return m.peekRooms().includes(roomId);   // 监控：门口附近的房间看得到里面
      return true;
    }
    // 门的中心和朝办公区一侧的方向
    doorInfo(id) {
      const g = this.app.match.grid; this.doorCache = this.doorCache && this.doorCache.g === g ? this.doorCache : { g };
      if (!this.doorCache[id]) {
        const cs = g.cells.filter(k => k.door === id), cx = cs.reduce((a, k) => a + k.c + 0.5, 0) / cs.length, cy = cs.reduce((a, k) => a + k.r + 0.5, 0) / cs.length, o = g.outside(id);
        const dx = Math.sign(Math.round(o.x - (g.doors[id].c + 0.5))), dy = Math.sign(Math.round(o.y - (g.doors[id].r + 0.5)));
        this.doorCache[id] = { x: cx, y: cy, dx, dy };
      }
      return this.doorCache[id];
    }
    // —— 地图 ——
    world() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s, p = m.player;
      const c0 = Math.max(0, Math.floor(-this.cam.ox / s) - 1), c1 = Math.min(g.cols, Math.ceil((W - this.cam.ox) / s) + 1);
      const r0 = Math.max(0, Math.floor((VY - this.cam.oy) / s) - 1), r1 = Math.min(g.rows, Math.ceil((BOT - this.cam.oy) / s) + 1);
      const vis = []; for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) vis.push(g.at(c, r));
      const edge = k => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const n = g.at(k.c + dc, k.r + dr); if (n && (!n.wall || n.desk)) return true; } return false; };
      // 地板
      for (const k of vis) {
        if (k.wall && !k.desk) continue;
        const x = this.sx(k.c), y = this.sy(k.r), id = k.room || k.door;
        let fill = (k.c + k.r) % 2 ? FLOOR.office : FLOOR.officeAlt;
        if (id) fill = RCOL(id).fill;
        if (k.stairs) fill = FLOOR.stairs;
        ctx.fillStyle = fill; ctx.fillRect(x, y, s + 0.5, s + 0.5);
        if (k.stairs) { ctx.strokeStyle = 'rgba(61,43,31,0.25)'; ctx.lineWidth = Math.max(1, s / 18); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + s * i / 4); ctx.lineTo(x + s, y + s * i / 4); ctx.stroke(); } }
      }
      this.roomDecor();
      // 墙：只画挨着地板的一圈，更外面是空地
      for (const k of vis) if (k.wall && !k.desk && edge(k)) {
        const x = this.sx(k.c), y = this.sy(k.r);
        ctx.fillStyle = '#B98F6A'; ctx.fillRect(x, y, s + 0.5, s + 0.5);
        ctx.fillStyle = '#CFA77F'; ctx.fillRect(x, y, s + 0.5, s * 0.35);
      }
      ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = Math.max(2, s / 14); ctx.beginPath();
      for (const k of vis) if (k.wall && !k.desk) for (const [dc, dr, x1, y1, x2, y2] of [[0, -1, 0, 0, 1, 0], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1], [1, 0, 1, 0, 1, 1]]) {
        const n = g.at(k.c + dc, k.r + dr); if (n && (!n.wall || n.desk)) { ctx.moveTo(this.sx(k.c + x1), this.sy(k.r + y1)); ctx.lineTo(this.sx(k.c + x2), this.sy(k.r + y2)); }
      }
      ctx.stroke();
      this.doors(); this.roomBanners();
      for (const d of A.DESKS) this.desk(d);
      if (p.path.length && !this.cam.room) { const q = p.path[p.path.length - 1]; ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * this.pulse(0.8); ctx.strokeStyle = '#FFB52E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(this.sx(q.x), this.sy(q.y) + 4, 16, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      this.supplyLayer(); this.groundItems();
      const list = m.actors.slice().sort((a, b) => a.y - b.y);
      for (const a of list) this.actor(a);
    }
    // 补给（看得见那个房间才画）+ 捡起读条
    supplyLayer() {
      const { ctx } = this, m = this.app.match, s = this.cam.s;
      for (const it of m.supplies) {
        if (!this.canSee(it.room)) continue;
        const x = this.sx(it.x), y = this.sy(it.y) - 4 * Math.sin(this.time * 4 + it.id), I = A.SUPPLY.items[it.kind], r = s * 0.3;
        ctx.save(); ctx.shadowColor = 'rgba(255,201,60,0.9)'; ctx.shadowBlur = 14; T().chunky(ctx, x - r, y - r, r * 2, r * 2, r * 0.4, '#FFF1B8', { depth: 2, lineWidth: 2 }); ctx.restore();
        T().boldText(ctx, { takeout: '饭', double: '×2', leave: '假', manual: '书', seal: '封', banana: '蕉', fake: '谣', steal: '抢' }[it.kind], x, y + 1, Math.round(r * 0.95), '#D9780A');
        ctx.font = F(18, true); const w = ctx.measureText(I.name).width + 14; T().chunky(ctx, x - w / 2, y + r + 3, w, 26, 13, '#FFFFFF', { depth: 1, lineWidth: 1.5 }); T().boldText(ctx, I.name, x, y + r + 16.5, 18, '#8C6B4F');
        if (it.prog > 0) { ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * it.prog / (it.need || A.SUPPLY.pick)); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 4; ctx.stroke(); }
      }
      const pk = m.boss.peek; if (pk && m.player.kind === 'boss' && !this.cam.room) {   // 老板监控中：门口附近的房间高亮并显示人数
        for (const room of m.peekRooms()) {
          const cs = m.grid.cells.filter(k => k.room === room), c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r)), c1 = Math.max(...cs.map(k => k.c)) + 1, r1 = Math.max(...cs.map(k => k.r)) + 1;
          ctx.save(); ctx.strokeStyle = 'rgba(155,81,224,' + (0.6 + 0.4 * this.pulse(0.6)) + ')'; ctx.lineWidth = 5; ctx.setLineDash([10, 6]); ctx.strokeRect(this.sx(c0) + 3, this.sy(r0) + 3, (c1 - c0) * s - 6, (r1 - r0) * s - 6); ctx.restore();
          const n = m.employees().filter(e => e.room === room).length;   // 写在房间里（门口站着老板会挡住），贴着屏幕边夹住
          const cx = Math.max(this.sx(c0) + 80, Math.min(this.sx(c1) - 80, (this.sx(c0) + this.sx(c1)) / 2)), cy = Math.max(this.sy(r0) + 24, Math.min(this.sy(r1) - 24, (this.sy(r0) + this.sy(r1)) / 2));
          this.chip(Math.max(85, Math.min(W - 85, cx)), Math.max(TOP + 24, Math.min(BOT - 24, cy)), A.ROOMS[room].name + ' ' + n + ' 人', '#9B51E0', 13);
        }
      }
    }
    roomDecor() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s;
      this.boxCache = this.boxCache && this.boxCache.g === g ? this.boxCache : { g };
      const box = id => { if (!this.boxCache[id]) { const cs = g.cells.filter(k => k.room === id && !k.stairs); const c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r)); this.boxCache[id] = { c0, r0, c1: Math.max(...cs.map(k => k.c)) + 1, r1: Math.max(...cs.map(k => k.r)) + 1 }; }
        const B = this.boxCache[id]; return { x: this.sx(B.c0), y: this.sy(B.r0), w: (B.c1 - B.c0) * s, h: (B.r1 - B.r0) * s }; };
      ctx.save();
      // 打印室：两台大打印机 + 一摞纸
      let b = box('print');
      for (const k of [0.08, 0.42]) {
        T().chunky(ctx, b.x + b.w * k, b.y + s * 0.25, b.w * 0.26, s * 1.2, s * 0.12, '#D6DDE6', { depth: 3, lineWidth: 2 });
        ctx.fillStyle = '#5C6B7E'; ctx.fillRect(b.x + b.w * (k + 0.03), b.y + s * 0.45, b.w * 0.2, s * 0.16);
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(b.x + b.w * (k + 0.05), b.y + s * 1.2, b.w * 0.16, s * 0.42); ctx.strokeStyle = '#B8C2CE'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x + b.w * (k + 0.05), b.y + s * 1.2, b.w * 0.16, s * 0.42);
        ctx.fillStyle = '#7CD3A2'; ctx.beginPath(); ctx.arc(b.x + b.w * (k + 0.21), b.y + s * 0.85, s * 0.07, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#FFFFFF' : '#F4F1EA'; ctx.fillRect(b.x + b.w * 0.78, b.y + s * (1.2 - i * 0.14), b.w * 0.16, s * 0.14); }
      ctx.strokeStyle = '#C9C1B3'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x + b.w * 0.78, b.y + s * 0.78, b.w * 0.16, s * 0.56);
      // 厕所：靠墙两个隔间 + 洗手台
      b = box('toilet');
      for (const k of [0.08, 0.42]) { ctx.fillStyle = '#B9DDE3'; T().rr(ctx, b.x + b.w - s * 1.6, b.y + b.h * k, s * 1.45, b.h * 0.28, s * 0.15); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(b.x + b.w - s * 0.75, b.y + b.h * (k + 0.14), s * 0.36, s * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#6FAAB4'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = '#E4F3F5'; T().rr(ctx, b.x + s * 1.2, b.y + b.h - s * 0.9, s * 1.6, s * 0.6, s * 0.12); ctx.fill(); ctx.strokeStyle = '#8FC3CB'; ctx.stroke();
      // 茶水间：靠墙吧台 + 咖啡机 + 小圆桌
      b = box('pantry'); ctx.fillStyle = '#E9CF84'; ctx.fillRect(b.x + s * 0.12, b.y + s * 0.2, s * 0.6, b.h - s * 0.4);
      ctx.fillStyle = '#9C8CA8'; T().rr(ctx, b.x + s * 0.08, b.y + s * 0.4, s * 0.62, s * 0.7, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(b.x + s * 0.4, b.y + s * 1.6, s * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E6C9A3'; ctx.beginPath(); ctx.arc(b.x + b.w * 0.62, b.y + b.h * 0.7, s * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.stroke();
      // 天台：天空 + 栏杆 + 小云 + 躺椅
      b = box('rooftop'); ctx.fillStyle = '#D4ECFA'; ctx.fillRect(b.x, b.y + b.h * 0.6, b.w, b.h * 0.4);
      const cx = b.x + s + ((this.time * 8) % Math.max(1, b.w - 2 * s));
      ctx.fillStyle = '#FFFFFF'; for (const [dx, dy, r] of [[0, 0, 0.25], [0.3, -0.08, 0.32], [0.62, 0.02, 0.22]]) { ctx.beginPath(); ctx.arc(cx + dx * s, b.y + b.h * 0.8 + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#7FAF62'; ctx.lineWidth = Math.max(2, s / 14);
      ctx.beginPath(); ctx.moveTo(b.x + 4, b.y + b.h - s * 0.15); ctx.lineTo(b.x + b.w - 4, b.y + b.h - s * 0.15); ctx.stroke();
      for (let i = 0; i <= 12; i++) { const x = b.x + 6 + i * (b.w - 12) / 12; ctx.beginPath(); ctx.moveTo(x, b.y + b.h - s * 0.15); ctx.lineTo(x, b.y + b.h - s * 0.5); ctx.stroke(); }
      ctx.fillStyle = '#C9A27E'; T().rr(ctx, b.x + s * 0.6, b.y + s * 0.4, s * 1.6, s * 0.5, 6); ctx.fill(); T().rr(ctx, b.x + b.w - s * 2.2, b.y + s * 0.4, s * 1.6, s * 0.5, 6); ctx.fill();
      ctx.restore();
    }
    // 门：自己的冷却 / 满员 / 老板在里面（标签贴在门外一侧）
    doors() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s, p = m.player;
      for (const k of g.cells) if (k.door) {
        if (!this.onScreen(k.c + 0.5, k.r + 0.5, s)) continue;
        const x = this.sx(k.c), y = this.sy(k.r), R = A.ROOMS[k.door];
        ctx.fillStyle = R.slack ? '#FFFFFF' : '#E7D6C6'; ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
        ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.strokeRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
      }
      if (this.cam.room) return;
      const at = id => { const d = this.doorInfo(id); return this.onScreen(d.x, d.y, s * 0.5) ? { x: this.sx(d.x + d.dx * 1.1), y: this.sy(d.y + d.dy * 1.1) } : null; };   // 门不在屏幕里就看不到门上的状态
      for (const id in m.closed) { const q = at(id); if (q) this.chip(q.x, q.y - 26, '关 ' + Math.ceil(m.closed[id]) + 's', '#A99A88'); }   // 随机事件：打印机卡纸
      // 熊堵门：门外的人看不出来（老板推门时才知道）
      if (p.kind === 'employee') {   // 厕所门：有人 / 冷却 / 正在敲门
        const q = at('toilet');
        if (q) { const why = m.entryBlock(p, 'toilet'); if (p.knockT > 0) this.chip(q.x, q.y - 26, '敲门 ' + Math.ceil(A.ROOMS.toilet.knock - p.knockT) + 's', '#4FA9B3'); if (why === 'full') this.chip(q.x, q.y, '有人', '#4FA9B3'); else if (why === 'cooldown') this.chip(q.x, q.y, '' + Math.ceil(p.cooldowns.toilet) + 's', '#A99A88'); }
      }
      for (const id of A.SLACK_ROOMS) {
        const q = at(id); if (!q) continue;
        if (p.kind === 'boss') { if (p.cooldowns[id] > 0) this.chip(q.x, q.y, '' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88'); continue; }
        const why = m.entryBlock(p, id);
        if (why === 'boss') this.chip(q.x, q.y, '老板!', BOSS_RED);
        else if (why === 'cooldown') this.chip(q.x, q.y, '' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88');
        else if (why === 'full') this.chip(q.x, q.y, '满了', C().coral);
      }
    }
    chip(x, y, text, fill, size) { const { ctx } = this; size = Math.round((size || 13) * 1.7); /* 2.6.2：手机上字放大 */ ctx.font = F(size, true); const w = ctx.measureText(text).width + 16, h = size + 10; T().chunky(ctx, x - w / 2, y - h / 2, w, h, h / 2, fill, { depth: 2, lineWidth: 2 }); T().boldText(ctx, text, x, y + 0.5, size, '#FFFFFF'); }
    roomBanners() {
      const { ctx } = this, m = this.app.match, g = m.grid;
      for (const id of ['print', 'toilet', 'pantry', 'rooftop']) {
        const R = A.ROOMS[id], cs = g.cells.filter(k => k.room === id && !k.stairs), c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r));
        const lure = R.slack ? m.lure(id) : 1, lt = lure >= 1.05 ? ' ×' + lure.toFixed(1) : '', n = m.occupants(id).filter(e => e.kind === 'employee').length;
        const text = R.safe ? (m.player.kind === 'boss' ? R.name + ' 进不去' : R.name + ' ' + n + '/' + R.cap) : m.player.kind === 'boss' ? R.name + lt : R.name + ' ' + n + '/' + R.cap + lt;   // 老板视角不显示人数；×N = 空房诱惑倍率
        ctx.font = F(22, true); const w = ctx.measureText(text).width + 22, x = this.sx(c0) + 6, y = this.sy(r0) + 6;
        T().chunky(ctx, x, y, w, 34, 17, '#FFFFFF', { depth: 2, lineWidth: 2 }); T().boldText(ctx, text, x + w / 2, y + 17.5, 22, R.slack ? RCOL(id).edge : '#B08D6F');
      }
    }
    desk(d) {
      const { ctx } = this, m = this.app.match, s = this.cam.s, p = m.player, own = p.desk === d;
      if (!this.onScreen(d.c + 1, d.r + 1, 2 * s)) return;
      const owner = m.employees().find(e => e.desk === d), x = this.sx(d.c), y = this.sy(d.r), away = owner && !!owner.room, k = s / 36;
      if (own && !this.cam.room) { ctx.save(); ctx.shadowColor = 'rgba(46,204,113,' + (0.6 + 0.4 * this.pulse(1.2)) + ')'; ctx.shadowBlur = 18; T().rr(ctx, x - 4, y - 4, s * 2 + 8, s * 2 + 8, 10); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
      T().chunky(ctx, x + 2, y + s * 0.15, s * 2 - 4, s * 0.75, 6, '#E6C9A3', { depth: 3, lineWidth: 2 });
      ctx.fillStyle = C().monitor || '#6B7A8F'; T().rr(ctx, x + s * 0.65, y + s * 0.05, s * 0.7, s * 0.45, 3); ctx.fill();
      ctx.fillStyle = C().screen || '#CFE6F5'; ctx.fillRect(x + s * 0.7, y + s * 0.1, s * 0.6, s * 0.32);
      ctx.fillStyle = '#9FCB82'; ctx.beginPath(); ctx.arc(x + s * 1.7, y + s * 0.35, s * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = own ? '#BDEBCF' : '#D9C3A5'; T().rr(ctx, x + s * 0.65, y + s * 1.05, s * 0.7, s * 0.5, 5); ctx.fill();
      if (own) this.chip(x + s, y + s * 1.8, '我的工位', '#2ECC71', 11);
      const lockT = m.deskLocks && m.deskLocks[d.id];
      if (lockT > 0) {   // 被猫打翻了水杯：桌上一滩水，挂着倒计时（谁看到都知道）
        ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = '#8EC9F0'; ctx.beginPath(); ctx.ellipse(x + s * 1.0, y + s * 0.55, s * 0.85, s * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#FFFFFF'; ctx.save(); ctx.translate(x + s * 1.55, y + s * 0.38); ctx.rotate(1.2); T().rr(ctx, -s * 0.12, -s * 0.18, s * 0.24, s * 0.36, 3); ctx.fill(); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        this.chip(x + s, y - s * 0.2, '打翻 ' + Math.ceil(lockT) + 's', C().coral, 11);
      }
      if (p.kind === 'boss' && away) this.chip(x + s, y + s * 1.8, owner.name + ' 不在', C().coral, 11);   // 老板视角：人不在办公区
    }
    actor(a) {
      const { ctx } = this, m = this.app.match, s = this.cam.s, k = Math.min(s, 1.6 * TS) / 36, x = this.sx(a.x), y = this.sy(a.y), p = m.player;   // 房间放大时人物不跟着无限放大
      if (this.cam.room && a.room !== this.cam.room) return;   // 房间视角：只画房间里的人
      if (!this.onScreen(a.x, a.y, 3 * s)) return;
      if (a.kind === 'employee' && a.room && !this.canSee(a.room)) return;   // 老板看不见房间里面（监控中的除外）
      if (a.kind === 'boss') { if (a.waitT > 0) return; this.bossSprite(a, x, y, k); return; }   // 老板开局还没到公司
      const mood = a.stun > 0 ? 'caught' : a.moving ? 'walk' : a.room ? 'slack' : 'work';
      ctx.save(); if (a.facing < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      OS.sprites.drawAnimal(ctx, a.id, x, y - 6 * k, 0.82 * k, { mood, t: this.time + a.desk.id, prop: a.room === 'pantry' && !a.moving ? 'coffee' : a.room === 'print' && !a.moving ? 'phone' : null });
      ctx.restore();
      const top = y - 34 * k;
      if (a.meetingT > 0) this.chip(x, top - 34, '开会中 ' + Math.ceil(a.meetingT) + 's', '#97CDB1', 11);
      if (a === p) {   // 自己身上的状态
        const tags = [a.dashT > 0 && '冲刺', a.nightT > 0 && '夜视 ' + Math.ceil(a.nightT) + 's', a.numbT > 0 && '腿麻 ' + Math.ceil(a.numbT) + 's', a.doubleT > 0 && '×2 ' + Math.ceil(a.doubleT) + 's', a.leaveNote && '请假条', a.immuneT > 0 && '免抓 ' + Math.ceil(a.immuneT) + 's', a.fastT > 0 && '咖啡因 ' + Math.ceil(a.fastT) + 's', a.inspire > 1 && '灵感 ×' + a.inspire, a.spottedT > 0 && '被点名 ' + Math.ceil(a.spottedT) + 's'].filter(Boolean);
        tags.forEach((t, i) => this.chip(x - 40 * k, y - 12 * k + i * 34, t, '#2E9E5B', 11));
        T().boldText(ctx, '▼', x, top - 6 - 4 * this.pulse(0.7), 18, '#FFC93C');   // 2.5.2 起不画名字，只用箭头标出自己
      }
      if (a.slipT > 0) this.chip(x, top - 34, '滑倒了！', '#D9A21E', 11);
      if (m.leader() === a) this.crown(x, top - (a === p ? 28 : 6));   // 头名悬赏：头上一顶皇冠，谁看到都知道（员工头上不再画名字）
      // 口袋里的钱（老板只看到钱袋和"?"）
      if (a.pocket >= 1) { const cm = A.comboMult(a.combo), t = p.kind === 'boss' ? '?' : '$' + Math.floor(a.pocket) + (cm > 1 ? ' ×' + cm.toFixed(1) : ''); ctx.font = F(24, true); const w = ctx.measureText(t).width + 54, bx = x + 14 * k, by = y - 20 * k - 10; T().chunky(ctx, bx, by, w, 40, 20, '#FFF1D2', { depth: 3, lineWidth: 2.5 }); T().coin(ctx, bx + 21, by + 20, 13); ctx.fillStyle = C().moneyDeep; ctx.textAlign = 'left'; ctx.fillText(t, bx + 40, by + 21); }   // 2.5.2 放大一倍
    }
    crown(x, y) {
      const { ctx } = this, w = 26, h = 16, b = Math.sin(this.time * 4) * 1.5;
      ctx.save(); ctx.translate(x, y + b); ctx.beginPath(); ctx.moveTo(-w / 2, h / 2); ctx.lineTo(-w / 2, -h / 2 + 4); ctx.lineTo(-w / 4, 0); ctx.lineTo(0, -h / 2); ctx.lineTo(w / 4, 0); ctx.lineTo(w / 2, -h / 2 + 4); ctx.lineTo(w / 2, h / 2); ctx.closePath();
      ctx.fillStyle = '#FFC93C'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = T().OUTLINE; ctx.stroke();
      ctx.fillStyle = BOSS_RED; ctx.beginPath(); ctx.arc(0, 2, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // 老板：放大 + 深色西装 + 描边 + 头顶红名牌 + 脚下一圈圈的红圈（只要出现在屏幕里就很醒目）
    bossSprite(a, x, y, k) {
      const { ctx } = this, p = this.app.match.player, ph = (this.time * 1.2) % 1;
      ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = BOSS_RED; ctx.beginPath(); ctx.ellipse(x, y + 14 * k, 20 * k, 6.5 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6 * (1 - ph); ctx.strokeStyle = BOSS_RED; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y + 14 * k, (21 + ph * 13) * k, (7 + ph * 4) * k, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      OS.sprites.drawBoss(ctx, x, y - 8 * k, 1.12 * k, { t: this.time, vivid: true, outline: 2.5, mood: a.freezeT > 0 ? 'read' : null, look: a.moving ? a.facing * 2 : Math.sin(this.time * 1.5) * 2 });
      const st = a.freezeT > 0 ? '开会' : a.stay > 0 ? '查房!' : a.dashT > 0 ? '冲刺!' : '';
      const txt = (a === p ? '老板（你）' : '老板') + (st ? ' ' + st : ''), ty = Math.max(VY + 16, y - 58 * k + Math.sin(this.time * 3) * 2);
      ctx.font = F(21, true); const w = ctx.measureText(txt).width + 26;
      T().chunky(ctx, x - w / 2, ty - 17, w, 34, 17, BOSS_RED, { depth: 2, lineWidth: 2 });
      T().boldText(ctx, txt, x, ty + 0.5, 21, '#FFFFFF');
    }
    // 自己的工位不在屏幕里：屏幕边上一个绿色箭头指过去
    deskArrow() {
      const m = this.app.match, p = m.player; if (p.kind !== 'employee' || m.phase !== 'playing') return;
      const st = A.seatOf(p.desk); if (this.seen(st.x, st.y - 0.5, 0, -30)) return;
      const { ctx } = this, cx = W / 2, cy = VY + VH / 2, q = this.P(st.x, st.y), dx = q.X - cx, dy = q.Y - cy, a = Math.atan2(dy, dx);
      const k = Math.min((W / 2 - 34) / Math.abs(dx || 1e-6), (VH / 2 - 34) / Math.abs(dy || 1e-6)), x = cx + dx * k, y = cy + dy * k, hot = p.pocket >= 1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = 0.75 + 0.25 * this.pulse(0.9);
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -14); ctx.lineTo(-4, 0); ctx.lineTo(-10, 14); ctx.closePath(); ctx.fillStyle = '#2ECC71'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = T().OUTLINE; ctx.stroke(); ctx.restore();
      this.chip(x - Math.cos(a) * 34, y - Math.sin(a) * 30, hot ? '工位 $' + Math.floor(p.pocket) : '工位', '#2ECC71', 11);
    }

    // 房间视角：外面一片暗，看不到老板和其他人；上面写在哪，下面是停留进度
    // 熊堵门：房间里的人看到门上一把大锁和一圈倒计时
    doorLock(room, lock) {
      const { ctx } = this, d = this.doorInfo(room), r = Math.max(18, Math.min(34, this.cam.s * 0.42)), full = lock.t0 || lock.t, pad = r + 14;
      const q = this.P(d.x, d.y, 1), x = Math.max(pad, Math.min(W - pad, q.X)), y = Math.max(VY + pad, Math.min(BOT - pad, q.Y));   // 门不在屏幕里时贴着屏幕边显示
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = T().OUTLINE; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, lock.t / full)); ctx.lineWidth = 5; ctx.strokeStyle = lock.t < 1.5 ? BOSS_RED : '#8F7CC4'; ctx.stroke();
      ctx.fillStyle = '#8F7CC4'; T().rr(ctx, x - r * 0.5, y - r * 0.1, r, r * 0.75, 4); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - r * 0.12, r * 0.32, Math.PI, 0); ctx.lineWidth = 4; ctx.strokeStyle = '#8F7CC4'; ctx.stroke();
      T().boldText(ctx, Math.ceil(lock.t) + '', x, y + r * 0.28, Math.round(r * 0.55), '#FFFFFF');
      ctx.restore();
    }
    roomOverlay() {
      const { ctx } = this, m = this.app.match, p = m.player, [c0, r0, c1, r1] = this.cam.box, boss = p.kind === 'boss', R = A.ROOMS[p.room];
      const d3 = this.is3d(), x = d3 ? 0 : this.sx(c0), y = d3 ? VY : this.sy(r0), w = d3 ? W : this.sx(c1) - x, h = d3 ? VH : this.sy(r1) - y;
      if (!d3) { ctx.save(); ctx.beginPath(); ctx.rect(0, VY, W, VH); ctx.rect(x, y, w, h); ctx.fillStyle = '#4A3A2E'; ctx.fill('evenodd');
        ctx.lineWidth = 6; ctx.strokeStyle = T().OUTLINE; ctx.strokeRect(x, y, w, h); ctx.restore(); }
      // 上方气泡：在哪、看不到外面
      const top = Math.max(VY + 34, y + 34), cx = W / 2;
      const bubble = (text, sub, col) => {
        ctx.font = F(26, true); const tw = ctx.measureText(text).width; ctx.font = F(18, true); const sw = sub ? ctx.measureText(sub).width : 0;
        const bw = Math.max(tw, sw) + 40, bh = sub ? 70 : 46;
        ctx.save(); ctx.globalAlpha = 0.94; T().chunky(ctx, cx - bw / 2, top - 17, bw, bh, 16, '#FFFFFF', { depth: 3, lineWidth: 2.5, outline: col === '#FFFFFF' ? T().OUTLINE : col }); ctx.restore();
        T().boldText(ctx, text, cx, top + 6, 26, col === '#FFFFFF' ? '#5A4636' : col, '#FFFFFF');
        if (sub) { ctx.fillStyle = '#8C6B4F'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText(sub, cx, top + 21); }
      };
      // 下方面板：在哪 + 停留进度 + 收入（都写在地图里，不缩小地图）
      let head = null;
      const panel = (k, col, left, right) => {
        const pw = W - 40, ph = 124, px = 20, py = Math.min(BOT - ph - 14, y + h - ph - 14);
        ctx.save(); ctx.globalAlpha = 0.94; T().chunky(ctx, px, py, pw, ph, 16, '#FFFFFF', { depth: 3, lineWidth: 2.5 }); ctx.restore();
        const bx = px + 16, bw = pw - 32, by = py + 50;
        if (head) { ctx.textAlign = 'left'; ctx.fillStyle = '#5A4636'; ctx.font = F(26, true); ctx.fillText(head[0], bx, py + 26); const hw = ctx.measureText(head[0]).width; ctx.fillStyle = '#A99A88'; ctx.font = F(19, true); ctx.fillText(head[1], bx + hw + 12, py + 27); }
        T().rr(ctx, bx, by, bw, 14, 7); ctx.fillStyle = '#EFE5D8'; ctx.fill();
        T().rr(ctx, bx, by, Math.max(14, bw * Math.min(1, k)), 14, 7); ctx.fillStyle = col; ctx.fill();
        T().rr(ctx, bx, by, bw, 14, 7); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = F(24, true); ctx.textAlign = 'left'; ctx.fillStyle = '#5A4636'; ctx.fillText(left, bx, by + 46);
        if (right) { ctx.textAlign = 'right'; ctx.fillStyle = right[1]; ctx.fillText(right[0], bx + bw, by + 46); }
        this.roomPanelTop = py;
      };
      if (boss) {
        head = [R.name + '查房', '看不到外面'];
        panel(1 - p.stay / R.bossStay, p.stay > 0 ? '#F0A030' : '#7CD3A2', p.stay > 0 ? '再待 ' + Math.ceil(p.stay) + 's' : '点外面离开');
        return;
      }
      if (R.safe) {   // 厕所：安全，倒计时
        head = ['厕所', '安全'];
        if (p.knocked) bubble('有人敲门！时间减半', null, '#4FA9B3');
        const cap = p.toiletCap || R.maxStay, left = Math.max(0, cap - p.roomTime);
        panel(p.roomTime / cap, left < 3 ? C().coral : '#4FA9B3', m.mustStay(p) ? '至少 ' + Math.ceil(A.ECON.minStay - p.roomTime) + 's' : '剩 ' + Math.ceil(left) + 's', ['$' + R.wage + '/s 直接存', '#2E9E5B']);
        return;
      }
      const sk = A.stayMult(p), maxS = R.maxStay * sk, t = p.roomTime, left = Math.max(0, maxS - t), rate = A.rate(p.room, t, sk), cell = m.grid.cellAt(p.x, p.y), lock = m.locks[p.room];
      const bossHere = m.boss.room === p.room;
      if (lock) this.doorLock(p.room, lock);   // 熊堵门：门上一把大锁 + 倒计时（只有房间里的人看得到）
      if (p.stun > 0 || bossHere || this.fakeT > 0) bubble(p.stun > 0 ? '被老板抓到了！' : '老板来了！', null, BOSS_RED);   // 假消息：和真的一模一样   // 只有出事时才在上面弹气泡
      head = [R.name + '摸鱼', lock ? '堵门 ' + Math.ceil(lock.t) + 's' : '看不到外面'];
      const mul = p.lure * (p.doubleT > 0 ? 2 : 1) * (lock && lock.by === p.id ? lock.inc : 1) * (m.rush ? A.RUSH.income : 1);
      panel(t / maxS, left < 4 ? C().coral : '#7CD3A2', m.mustStay(p) ? '至少 ' + Math.ceil(A.ECON.minStay - t) + 's' : left < 4 ? Math.ceil(left) + 's 后出门' : '剩 ' + Math.ceil(left) + 's',
        cell && cell.stairs ? ['爬楼梯…', '#A99A88'] : ['$' + (rate * mul).toFixed(1) + '/s ' + (t > R.rise * sk ? '↓' : '↑'), '#D9780A']);
    }
    // 老板开局还没到：整个场景用不透明底色盖住（看不到员工往哪走）
    bossWaitOverlay() {
      const { ctx } = this, b = this.app.match.boss;
      ctx.fillStyle = '#4A3A2E'; ctx.fillRect(-20, VY - 20, W + 40, VH + 40);   // 完全不透明；多盖一圈防屏幕抖动露边
      OS.sprites.drawBoss(ctx, W / 2, VY + 250, 2.2, { t: this.time, vivid: true, outline: 3, look: Math.sin(this.time * 1.5) * 3 });
      T().boldText(ctx, '老板还在路上', W / 2, VY + 380, 26, '#FFFFFF');
      ctx.fillStyle = '#E8D9C6'; ctx.font = F(14, true); ctx.textAlign = 'center'; ctx.fillText('看不到员工往哪走 · 可以先选技能', W / 2, VY + 418);
      T().boldText(ctx, Math.ceil(b.waitT) + ' 秒后出现在办公区正中间', W / 2, VY + 470, 20, '#FFD46B');
    }
    // —— 顶栏 ——
    topBar() {
      const { ctx } = this, m = this.app.match, p = m.player, c = C(), boss = p.kind === 'boss';
      ctx.fillStyle = '#FFFBF3'; ctx.fillRect(0, 0, W, TOP); ctx.fillStyle = T().OUTLINE; ctx.fillRect(0, TOP - 3, W, 3);
      // 头像 + 名字
      ctx.save(); ctx.beginPath(); ctx.arc(38, 38, 25, 0, Math.PI * 2); ctx.fillStyle = boss ? '#2B3448' : (OS.sprites.SPEC[p.id] || {}).shirt || c.mint; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = T().OUTLINE; ctx.stroke(); ctx.clip();
      if (boss) OS.sprites.drawBoss(ctx, 38, 58, 0.92, { t: this.time, vivid: true }); else OS.sprites.drawAnimal(ctx, p.id, 38, 40, 1.05, { headOnly: true, mood: 'slack', t: this.time });
      ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = T().OUTLINE; ctx.font = F(20, true); ctx.fillText(boss ? '老板' : p.name + ' Lv' + p.level, 72, 28);
      ctx.fillStyle = c.inkSoft; ctx.font = F(16, true); ctx.fillText(boss ? '抓得越多越赚' : '工位 ' + (p.desk.id + 1), 72, 52);
      // 倒计时（正中间）：红底白边白字的计时框（参考《胡闹厨房》）
      const sec = Math.ceil(m.left), txt = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), hot = m.rush && m.phase === 'playing';
      ctx.save(); ctx.translate(W / 2, 36); if (hot) { const k = 1 + 0.06 * this.pulse(0.6); ctx.scale(k, k); }
      const tw = 128, th = 50;
      T().rr(ctx, -tw / 2 - 3, -th / 2 - 3, tw + 6, th + 6, 18); ctx.fillStyle = T().OUTLINE; ctx.fill();
      T().rr(ctx, -tw / 2, -th / 2, tw, th, 15); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      T().rr(ctx, -tw / 2 + 4, -th / 2 + 4, tw - 8, th - 8, 12); ctx.fillStyle = hot ? '#C42F25' : BOSS_RED; ctx.fill();
      ctx.save(); ctx.translate(-tw / 2 + 24, 0); T().clock(ctx, 0, 0, 10); ctx.restore();
      T().boldText(ctx, txt, 12, 1, 28, '#FFFFFF', '#8E1F17'); ctx.restore();
      if (hot) this.chip(W / 2, 74, boss ? '冲刺 移速×1.3' : '冲刺 收入×2', BOSS_RED, 10);
      // 设置
      const g = UI.gear; T().chunky(ctx, g.x, g.y, g.w, g.h, 14, '#FFFFFF', { depth: 3, lineWidth: 2 }); this.gearIcon(g.x + g.w / 2, g.y + g.h / 2, 12);
      // 第二行：钱 / 老板收益
      const y2 = 86;
      if (boss) {
        T().coin(ctx, 25, y2, 11); ctx.textAlign = 'left'; ctx.fillStyle = c.moneyDeep; ctx.font = F(23, true); ctx.fillText('$' + Math.floor(m.bossScore()), 42, y2 + 1);
        const x1 = 42 + ctx.measureText('$' + Math.floor(m.bossScore())).width + 14;
        ctx.fillStyle = '#8C6B4F'; ctx.font = F(18, true); ctx.fillText('抓' + p.stats.catches + ' · ×' + (+A.catchMult(p.stats.catches).toFixed(2)), x1, y2 + 1);
        // 怒气 + 冒犯值（两根细条）
        const bars = [['怒气', p.anger / A.ANGER.max, '#E8746A']];   // 2.2.0 取消冒犯值：只剩怒气（查空房会扣）
        bars.forEach(([lab, v, col]) => { const bx = 410, by = y2 - 6, bw = 112; ctx.fillStyle = '#6B5442'; ctx.font = F(16, true); ctx.textAlign = 'right'; ctx.fillText(lab, bx - 6, by + 5); T().rr(ctx, bx, by, bw, 9, 4.5); ctx.fillStyle = '#EFE5D8'; ctx.fill(); if (v > 0) { T().rr(ctx, bx, by, Math.max(9, bw * Math.min(1, v)), 9, 4.5); ctx.fillStyle = col; ctx.fill(); } T().rr(ctx, bx, by, bw, 9, 4.5); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 1.2; ctx.stroke(); });
        return;
      }
      T().coin(ctx, 25, y2, 11); ctx.textAlign = 'left'; ctx.fillStyle = c.moneyDeep; ctx.font = F(23, true); const bt = '$' + Math.floor(p.banked); ctx.fillText(bt, 42, y2 + 1);
      let x1 = 42 + ctx.measureText(bt).width + 14;
      const cm = A.comboMult(p.combo), lazy = !p.room && p.officeTime > A.ECON.idleAfter;
      ctx.font = F(20, true); ctx.fillStyle = p.pocket >= 1 ? '#D9780A' : '#A99A88'; const pt = '口袋 $' + Math.floor(p.pocket) + (cm > 1 ? ' ×' + cm.toFixed(1) : ''); ctx.fillText(pt, x1, y2 + 1); x1 += ctx.measureText(pt).width + 12;
      if (lazy) { ctx.font = F(18, true); ctx.fillStyle = c.coral; ctx.fillText('工资变低了', x1, y2 + 1); x1 += ctx.measureText('工资变低了').width + 10; }
      // 实时名次（只比员工之间的存款）；第一名戴皇冠 = 被悬赏
      if (m.phase !== 'prep') { const rk = m.rankOf(p), lead = m.leader() === p, t = (lead ? '悬赏 ' : '') + '第' + rk + '名'; ctx.font = F(22, true); const tw = ctx.measureText(t).width + 16; this.chip(UI.gear.x - 10 - tw / 2, 37, t, lead ? '#E8890C' : rk === 1 ? '#2E9E5B' : '#8F7CC4', 13); }
      // 右边：还在冷却的房间
      let rx = W - 14;
      for (const id of A.SLACK_ROOMS.slice().reverse()) { const cd = p.cooldowns[id]; if (!(cd > 0)) continue; const t = A.ROOMS[id].name + ' ' + Math.ceil(cd) + 's'; ctx.font = F(16, true); const w = ctx.measureText(t).width + 14; T().chunky(ctx, rx - w, y2 - 13, w, 26, 13, '#EDE6DC', { depth: 1, lineWidth: 1.2, outline: '#C9B8A6' }); ctx.fillStyle = '#8C7B6B'; ctx.textAlign = 'center'; ctx.fillText(t, rx - w / 2, y2 + 0.5); rx -= w + 6; }
    }
    // 喇叭图标：开着画声波，关了画红色斜杠
    speakerIcon(x, y, r, on) {
      const { ctx } = this; ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#6B5442'; ctx.strokeStyle = '#6B5442'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.95, -r * 0.32); ctx.lineTo(-r * 0.45, -r * 0.32); ctx.lineTo(r * 0.1, -r * 0.85); ctx.lineTo(r * 0.1, r * 0.85); ctx.lineTo(-r * 0.45, r * 0.32); ctx.lineTo(-r * 0.95, r * 0.32); ctx.closePath(); ctx.fill();
      if (on) { ctx.lineWidth = r * 0.17; for (const k of [0.45, 0.8]) { ctx.beginPath(); ctx.arc(r * 0.1, 0, r * k, -0.85, 0.85); ctx.stroke(); } }
      else { ctx.strokeStyle = BOSS_RED; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 0.4); ctx.lineTo(r * 0.95, r * 0.4); ctx.moveTo(r * 0.95, -r * 0.4); ctx.lineTo(r * 0.35, r * 0.4); ctx.stroke(); }
      ctx.restore();
    }
    gearIcon(x, y, r) {
      const { ctx } = this; ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#6B5442';
      for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * Math.PI / 4); ctx.fillRect(-2.6, -r - 1, 5.2, 6); ctx.restore(); }
      ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.restore();
    }
    // —— 底部按钮区 ——
    bottomBar() {
      const { ctx } = this, m = this.app.match, p = m.player;
      ctx.fillStyle = '#FFFBF3'; ctx.fillRect(0, BOT, W, H - BOT); ctx.fillStyle = T().OUTLINE; ctx.fillRect(0, BOT, W, 3);
      if (m.phase !== 'playing') return;
      if (p.kind === 'boss') { this.bossSkills(); const lab = p.waitT > 0 ? Math.ceil(p.waitT) + 's 后到达' : p.room ? (p.stay > 0 ? '查房中 ' + Math.ceil(p.stay) + 's' : '离开房间' + this.key('[空格]')) : '点房间门去查房'; this.btn(UI.bossAction, lab, !!p.room && p.stay <= 0, 22, !p.room || p.stay > 0); return; }
      const wait = m.mustStay(p), atDesk = !p.room && Math.hypot(p.x - A.seatOf(p.desk).x, p.y - A.seatOf(p.desk).y) <= A.ECON.depositRange;
      const dl = !p.room && p.pocket >= 1 ? m.deskLocked(p) : 0;   // 工位被打翻：存不了
      const label = p.forced ? '出门中…' : wait ? '再待 ' + Math.ceil(A.ECON.minStay - p.roomTime) + 's' : p.meetingT > 0 ? '开会 ' + Math.ceil(p.meetingT) + 's' : dl > 0 ? '工位锁 ' + Math.ceil(dl) + 's' : p.room ? '出门' : p.pocket >= 1 ? (atDesk ? '存钱 $' : '回工位存 $') + Math.floor(p.pocket) : '回工位';
      const off = p.forced || wait || p.meetingT > 0 || dl > 0, hot = !off && (p.room ? A.ROOMS[p.room].slack && p.roomTime > A.ROOMS[p.room].rise : p.pocket >= 1);
      this.btn(UI.action, label + (off ? '' : this.key('[空格]')), hot, 28, off);
      this.empSkill(); this.itemSlot();
    }
    // 道具格：捣乱补给（工位封条 / 香蕉皮 / 假消息 / 抢功劳）
    itemSlot() {
      const { ctx } = this, p = this.app.match.player, b = UI.item, I = p.item && A.SUPPLY.items[p.item];
      T().chunky(ctx, b.x, b.y, b.w, b.h, 16, I ? '#FFE9A8' : '#EDE6DC', { depth: I ? 4 : 2, lineWidth: 2, outline: I ? T().OUTLINE : '#C9B8A6', glow: I ? 'rgba(255,190,40,' + (0.3 + 0.3 * this.pulse(1)) + ')' : null, glowBlur: 12 });
      ctx.textAlign = 'center';
      if (!I) { ctx.fillStyle = '#A99A88'; ctx.font = F(18, true); ctx.fillText('道具', b.x + b.w / 2, b.y + b.h / 2 - 12); ctx.fillText('空', b.x + b.w / 2, b.y + b.h / 2 + 14); return; }
      T().boldText(ctx, { seal: '封', banana: '蕉', fake: '谣', steal: '抢' }[p.item], b.x + b.w / 2, b.y + 32, 32, '#D9780A');
      ctx.fillStyle = '#6B5442'; ctx.font = F(17, true); ctx.fillText(I.name.slice(0, 2), b.x + b.w / 2, b.y + 64); ctx.fillText(I.name.slice(2) || (this.touch ? '' : 'Q'), b.x + b.w / 2, b.y + 84);
    }
    empSkill() {
      const { ctx } = this, m = this.app.match, p = m.player, S = A.EMP_SKILLS[p.id], P = A.empSkill(p), b = UI.skill;
      const needRoom = S.where === 'room' && !(p.room && A.ROOMS[p.room].slack), needOffice = S.where === 'office' && !!p.room, noTarget = p.id === 'cat' && !p.room && !m.deskTargets(p).length;
      const ok = p.skillCd <= 0 && !needRoom && !needOffice && !noTarget && !m.busy(p);
      T().chunky(ctx, b.x, b.y, b.w, b.h, 20, ok ? '#9B51E0' : '#EDE6DC', { depth: ok ? 5 : 2, lineWidth: 2.5, glow: ok ? 'rgba(155,81,224,' + (0.3 + 0.3 * this.pulse(1.2)) + ')' : null, glowBlur: 14 });
      if (p.skillCd > 0) { ctx.fillStyle = 'rgba(61,43,31,0.18)'; T().rr(ctx, b.x, b.y + b.h * (1 - p.skillCd / P.cd), b.w, b.h * p.skillCd / P.cd, 20); ctx.fill(); }
      const br = p.branch ? (p.branch === 'A' ? S.nameA : S.nameB) : '', fg = ok ? '#FFFFFF' : '#6B5442';
      T().boldText(ctx, S.name, b.x + b.w / 2, b.y + 28, 24, fg, ok ? undefined : 'rgba(0,0,0,0)');
      ctx.textAlign = 'center'; ctx.fillStyle = ok ? '#F3E8FF' : '#8C7B6B'; ctx.font = F(18, true);
      ctx.fillText(p.skillCd > 0 ? Math.ceil(p.skillCd) + 's' : needRoom ? '房间里用' : needOffice ? '办公区用' : noTarget ? '没目标' : br || '就绪', b.x + b.w / 2, b.y + 57);
      ctx.font = F(15, true); ctx.fillText((this.touch ? '' : 'E · ') + 'Lv' + p.level + (p.level >= 3 ? ' 满级' : ' $' + Math.floor(p.xp) + '/' + A.LEVELS[p.level + 1]), b.x + b.w / 2, b.y + 78);
    }
    bossSkills() {
      const { ctx } = this, p = this.app.match.player;
      UI.bskill.forEach((b, i) => {
        const id = p.skills[i];
        if (!id) { T().chunky(ctx, b.x, b.y, b.w, b.h, 14, '#EDE6DC', { depth: 2, lineWidth: 2, outline: '#C9B8A6' }); ctx.fillStyle = '#A99A88'; ctx.font = F(19, true); ctx.textAlign = 'center'; ctx.fillText('阶段 ' + (i + 1) + ' 解锁', b.x + b.w / 2, b.y + b.h / 2); return; }
        const S = A.BOSS_SKILLS[id], cd = p.skillCd[id] || 0, ok = cd <= 0 && p.anger >= S.cost && !(p.waitT > 0), on = id === 'peek' && p.peek;
        T().chunky(ctx, b.x, b.y, b.w, b.h, 14, on ? '#B79BEA' : ok ? BOSS_RED : '#EDE6DC', { depth: ok ? 4 : 2, lineWidth: 2 });
        if (cd > 0) { ctx.fillStyle = 'rgba(61,43,31,0.18)'; T().rr(ctx, b.x, b.y, b.w * cd / S.cd, b.h, 14); ctx.fill(); }
        ctx.textAlign = 'center'; ctx.fillStyle = ok || on ? '#FFFFFF' : '#6B5442'; ctx.font = F(22, true); ctx.fillText((this.touch ? '' : (i + 1) + ' ') + S.name, b.x + b.w / 2, b.y + 22);
        ctx.font = F(17, true); ctx.fillStyle = ok || on ? '#FFE9E6' : '#8C7B6B'; ctx.fillText(on ? '监控 ' + Math.ceil(p.peek.t) + 's' : cd > 0 ? Math.ceil(cd) + 's' : '怒气 ' + S.cost, b.x + b.w / 2, b.y + 46);
      });
    }
    // 屏幕中央的大字（开始摸鱼！/ 下班冲刺！）
    banner(text) { this.big = { text, t: 0 }; }
    drawBanner(dt) {
      const b = this.big; if (!b) return; b.t += dt; if (b.t > 1.6) { this.big = null; return; }
      const { ctx } = this, k = Math.min(1, b.t / 0.2), out = Math.max(0, (b.t - 1.2) / 0.4);
      ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(W / 2, VY + 240); ctx.scale(0.6 + 0.4 * k + 0.15 * Math.sin(k * Math.PI), 0.6 + 0.4 * k + 0.15 * Math.sin(k * Math.PI));
      T().logo(ctx, b.text, 0, 0, 48, this.time); ctx.restore();
    }
    // 开局：员工视角屏幕中间显示"老板还有 N 秒到达"
    arriveHud() {
      const m = this.app.match, b = m.boss; if (m.phase !== 'playing' || !(b.waitT > 0) || m.player.kind === 'boss') return;
      const { ctx } = this, k = this.pulse(0.8);
      ctx.save(); ctx.translate(W / 2, this.cam.room ? BOT - 40 : VY + 120); ctx.scale(1 + 0.04 * k, 1 + 0.04 * k);
      T().chunky(ctx, -140, -26, 280, 52, 26, '#FFFFFF', { depth: 4, lineWidth: 2.5, glow: 'rgba(224,69,58,' + (0.35 + 0.4 * k) + ')', glowBlur: 14 });
      T().boldText(ctx, '老板还有 ' + Math.ceil(b.waitT) + ' 秒到达', 0, 1, 22, BOSS_RED); ctx.restore();
    }
    // 身份卡：开局准备阶段（带倒计时和"准备好了"），暂停菜单里也能再看
    identityCard(prep) {
      const { ctx } = this, m = this.app.match, p = m.player, boss = p.kind === 'boss', X = 34, IW = W - 2 * X - 36;
      // 先排版（量文字高度），再按总高度把卡片放在屏幕中间
      const lines = (text, font, maxW) => { ctx.font = font; let n = 1, line = ''; for (const ch of text) { if (ctx.measureText(line + ch).width > maxW && line) { n++; line = ''; } line += ch; } return n; };
      const S = boss ? null : A.EMP_SKILLS[p.id];
      const PS = A.PASSIVES[boss ? 'boss' : p.id], pas = ['被动 ' + PS.name + '：' + PS.desc, F(23, true), '#D9780A', 32];   // 2.6.2：字放大、写短
      const sk = boss ? [['每阶段选 1 个，耗怒气', F(24, true), '#4A3A2E', 33], pas]
        : [[A.EMP_SKILL_DESC[p.id], F(25, true), '#4A3A2E', 34], pas, ['Lv2 可选：', F(21, true), '#2E9E5B', 30], ['A ' + S.descA, F(20, true), '#2E9E5B', 29], ['B ' + S.descB, F(20, true), '#2E9E5B', 29]];
      const rules = boss ? ['5s 后出现在办公区中间', '底薪 $' + A.BOSS.wage + '/s，在哪都涨', '进房间就算查房，厕所进不去', '查空房 −15 怒气', '最后 30s 员工收入 ×2']
        : [];   // 员工的通用规则 2.3.0 起放在标题页
      // 2.6.3 版面：上排左 1/3 角色（名字、工位分两行）+ 右 2/3 技能；小地图单独一整行
      const CW = W - 2 * X, LW = 132, RX = X + LW, RW = CW - LW, TW = RW - 18;   // 2.6.3：角色 + 技能一个框，左列按角色宽度收紧
      const skH = 54 + sk.reduce((a, [t, f, , lh]) => a + lines(t, f, TW) * lh, 0) + 4;
      const ruH = rules.reduce((a, t) => a + lines(t, F(23), IW - 22) * 32 + 4, 0);
      const ms = 5.4, mapW = 36 * ms, mapH = 33 * ms, topH = Math.max(skH, boss ? 140 : 158);
      const ch = 30 + 34 + 40 + topH + 14 + mapH + 14 + ruH + (prep ? 96 : 46), y0 = Math.max(14, Math.round((H - ch) / 2));
      ctx.fillStyle = 'rgba(61,43,31,0.62)'; ctx.fillRect(0, 0, W, H);
      T().chunky(ctx, 18, y0, W - 36, ch, 26, '#FFFBF3', { depth: 7 });
      let y = y0 + 36;
      T().boldText(ctx, boss ? '你是老板' : '你是员工', W / 2, y, 32, boss ? BOSS_RED : '#2E9E5B'); y += 30;
      ctx.fillStyle = '#6B5442'; ctx.font = F(24, true); ctx.textAlign = 'center';
      ctx.fillText(boss ? '目标：收益第一（抓人 + 底薪）' : '目标：摸鱼赚钱，存款第一', W / 2, y + 10); y += 40;
      // 左：角色 + 名字 + 工位
      T().chunky(ctx, X, y, CW, topH, 16, '#FFFFFF', { depth: 3, lineWidth: 2 });   // 一个框把角色和技能都包进去
      ctx.fillStyle = '#F1E6D6'; ctx.fillRect(RX - 1, y + 14, 2, topH - 28);   // 中间一道浅色分隔线
      const lx = X + LW / 2, cy = y + topH / 2 - 30;
      if (boss) OS.sprites.drawBoss(ctx, lx, cy + 30, 1.5, { t: this.time, vivid: true, outline: 2.5, look: Math.sin(this.time * 1.5) * 3 });
      else OS.sprites.drawAnimal(ctx, p.id, lx, cy + 26, 1.75, { mood: 'slack', t: this.time });
      T().boldText(ctx, boss ? '狮子老板' : p.name, lx, cy + 76, boss ? 23 : 28, '#FFB52E');
      if (!boss) { ctx.fillStyle = '#6B5442'; ctx.font = F(22, true); ctx.textAlign = 'center'; ctx.fillText('工位 ' + (p.desk.id + 1), lx, cy + 110); }
      // 右：技能
      T().boldText(ctx, boss ? '技能' + (this.touch ? '' : '（1/2/3）') : '技能：' + S.name + (this.touch ? '' : '（E）'), RX + 12, y + 26, 28, '#9B51E0', T().OUTLINE, 'left');
      let yy = y + 62; ctx.textAlign = 'left';
      for (const [t, f, col, lh] of sk) { ctx.font = f; ctx.fillStyle = col; yy = this.wrap(t, RX + 12, yy, TW, lh); }
      y += topH + 14;
      // 小地图：单独一整行，居中放大
      this.miniMap(W / 2 - mapW / 2, y, ms, p); y += mapH + 14;
      // 规则
      ctx.textAlign = 'left';
      rules.forEach(l => { ctx.fillStyle = '#FFB52E'; ctx.font = F(20, true); ctx.fillText('●', X + 4, y + 14); ctx.fillStyle = '#4A3A2E'; ctx.font = F(23, true); y = this.wrap(l, X + 28, y + 14, IW - 22, 32) - 14 + 4; });
      y += 12;
      if (prep) {
        UI.ready.y = y; const left = m.prepLeft, n = Math.ceil(left);
        if (left <= A.PREP.countdown) { const k = left - Math.floor(left); ctx.save(); ctx.translate(W / 2, y + 28); ctx.scale(1 + k * 0.4, 1 + k * 0.4); T().logo(ctx, String(n), 0, 0, 56, this.time); ctx.restore(); }
        else { this.btn(UI.ready, UI.ready.label + this.key('[空格]'), true, 19); if (A.PREP.auto) { ctx.fillStyle = '#8C6B4F'; ctx.font = F(18, true); ctx.textAlign = 'center'; ctx.fillText(n + 's 后自动开始', W / 2, y + 76); } }
      } else { ctx.fillStyle = '#8C6B4F'; ctx.font = F(19, true); ctx.textAlign = 'center'; ctx.fillText('点任意位置关闭', W / 2, y + 20); }
    }
    // 小地图（静态）：四个房间在哪个方向、自己的工位
    miniMap(x0, y0, s, p) {
      const { ctx } = this, m = this.app.match, g = m.grid;
      for (const k of g.cells) {
        const id = k.room || k.door; if (k.wall && !k.desk) continue;
        let f = '#FFF4E2'; if (id) f = RCOL(id).fill; if (k.stairs) f = '#D9CDBF'; if (k.desk) f = '#E6C9A3';
        ctx.fillStyle = f; ctx.fillRect(x0 + k.c * s, y0 + k.r * s, s + 0.4, s + 0.4);
      }
      for (const id of ['print', 'pantry', 'rooftop', 'toilet']) {
        const R = A.ROOMS[id], cs = g.roomCells(id), cx = cs.reduce((a, k) => a + k.c, 0) / cs.length + 0.5, cy = cs.reduce((a, k) => a + k.r, 0) / cs.length + 0.5;
        T().boldText(ctx, R.name, x0 + cx * s, y0 + cy * s, Math.max(11, Math.round(s * 3.2)), R.slack ? RCOL(id).edge : '#B08D6F');   // 小地图放大后房间名跟着放大
      }
      if (p.kind === 'employee') { const d = p.desk; ctx.save(); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 2.5; ctx.strokeRect(x0 + d.c * s - 2, y0 + d.r * s - 2, 2 * s + 4, s + 4); ctx.restore(); }
      else T().boldText(ctx, '★', x0 + A.BOSS_ARRIVE.x * s, y0 + A.BOSS_ARRIVE.y * s, Math.max(12, Math.round(s * 4)), BOSS_RED);
    }
    // 弹出选择：老板阶段技能（3 选 1）/ 员工 2 级方向（2 选 1）；不暂停游戏，10 秒不选自动随机
    offerOverlay() {
      const { ctx } = this, m = this.app.match, p = m.player; if (m.phase !== 'playing') return;
      let title, cards, t;
      if (p.kind === 'boss' && m.offer) { t = m.offer.t; title = '选技能（第 ' + (m.offer.phase + 1) + ' 阶段）'; cards = m.offer.options.map(id => ({ name: A.BOSS_SKILLS[id].name, sub: '怒气 ' + A.BOSS_SKILLS[id].cost + (A.BOSS_SKILLS[id].cd ? ' · ' + A.BOSS_SKILLS[id].cd + 's' : ''), desc: A.BOSS_SKILLS[id].desc })); }
      else if (p.kind === 'employee' && p.branchOffer) { const S = A.EMP_SKILLS[p.id]; t = p.branchOffer.t; title = 'Lv2 选方向'; cards = [{ name: S.nameA, sub: '方向 A', desc: S.descA }, { name: S.nameB, sub: '方向 B', desc: S.descB }]; }
      else return;
      const R = A.offerRects(cards.length);
      ctx.fillStyle = 'rgba(61,43,31,0.55)'; ctx.fillRect(0, VY, W, VH);
      T().boldText(ctx, title + ' ' + Math.ceil(t) + 's', W / 2, R[0].y - 36, 28, '#FFFFFF');
      cards.forEach((c, i) => {
        const r = R[i], hov = this.mouse && inside(r, this.mouse);
        T().chunky(ctx, r.x, r.y - (hov ? 3 : 0), r.w, r.h, 16, '#FFFBF3', { depth: hov ? 7 : 5, glow: hov ? 'rgba(255,190,40,0.8)' : null, glowBlur: 16 });
        T().boldText(ctx, (this.touch ? '' : (i + 1) + '  ') + c.name, r.x + 20, r.y + 34, 30, '#FFB52E', T().OUTLINE, 'left');
        ctx.fillStyle = '#9B51E0'; ctx.font = F(20, true); ctx.textAlign = 'right'; ctx.fillText(c.sub, r.x + r.w - 18, r.y + 34);
        ctx.fillStyle = '#4A3A2E'; ctx.font = F(26, true); ctx.textAlign = 'left'; this.wrap(c.desc, r.x + 20, r.y + 84, r.w - 40, 32);
      });
    }
    wrap(text, x, y, maxW, lh) {
      const { ctx } = this; let line = '', yy = y;
      for (const ch of text) { if (ctx.measureText(line + ch).width > maxW && line) { ctx.fillText(line, x, yy); line = ''; yy += lh; } line += ch; }
      if (line) ctx.fillText(line, x, yy);
      return yy + lh;   // 下一行的 y
    }
    btn(b, label, hot, size, disabled) {
      const { ctx } = this, hov = this.mouse && inside(b, this.mouse) && !disabled, lift = hov ? 2 : 0;
      T().chunky(ctx, b.x, b.y - lift, b.w, b.h, Math.min(20, b.h / 2), disabled ? '#D8CCBC' : hot ? '#FFB52E' : '#FFFFFF', { depth: (b.h > 40 ? 5 : 3) + lift, glow: hot ? 'rgba(255,190,40,' + (0.5 + 0.4 * this.pulse(0.9)) + ')' : null, glowBlur: 16, lineWidth: b.h > 40 ? 3 : 2 });
      if (hot) T().boldText(ctx, label, b.x + b.w / 2, b.y + b.h / 2 - lift + 1, size || 16, '#FFFFFF');
      else { ctx.fillStyle = disabled ? '#8C7B6B' : T().OUTLINE; ctx.font = F(size || 16, true); ctx.textAlign = 'center'; ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 - lift + 1); }
    }
    drawFloats(dt) {
      const { ctx } = this;
      this.floats = this.floats.filter(f => (f.t += dt) < 1.4);
      for (const f of this.floats) { ctx.save(); ctx.globalAlpha = Math.min(1, (1.4 - f.t) * 2); T().boldText(ctx, f.text, f.x, f.y - f.t * 30, 20, f.color || '#FFC93C'); ctx.restore(); }
    }
    // 提示气泡（2.2.0 B2 放大）：场景底部、按钮上方，最多 2 条，越新的越靠下
    drawToasts(dt) {
      const { ctx } = this, room = this.cam && this.cam.room, FS = 26, LH = 34, LIFE = 3;
      this.toasts = this.toasts.filter(t => (t.t += dt) < LIFE);
      let bottom = this.app.screen === 'title' ? 40 : (room && this.roomPanelTop ? this.roomPanelTop - 8 : BOT - 18);
      const list = this.toasts.slice().reverse();
      list.forEach(t => {
        ctx.save(); ctx.globalAlpha = Math.min(1, (LIFE - t.t) * 3); ctx.font = F(FS, true);
        const lines = []; let line = ''; for (const ch of t.text) { if (ctx.measureText(line + ch).width > W - 90 && line) { lines.push(line); line = ''; } line += ch; } lines.push(line);
        const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 44, h = 22 + lines.length * LH, top = this.app.screen === 'title' ? bottom : bottom - h;
        const pop = 1 + 0.08 * Math.max(0, 1 - t.t / 0.18);
        ctx.translate(W / 2, top + h / 2); ctx.scale(pop, pop);
        T().chunky(ctx, -w / 2, -h / 2, w, h, 20, '#FFFFFF', { depth: 4, lineWidth: 3, outline: t.color });
        ctx.fillStyle = t.color; ctx.textAlign = 'center';
        lines.forEach((l, k) => ctx.fillText(l, 0, -h / 2 + 11 + LH / 2 + k * LH + 1)); ctx.restore();
        bottom = this.app.screen === 'title' ? bottom + h + 10 : top - 10;
      });
    }
    // 随机事件：大卡片（全体 + 个人，绿色奖励 / 红色惩罚），显示 4 秒
    showEvents(list) { this.eventCard = { list, t: 0 }; }
    drawEventCard(dt) {
      const c = this.eventCard; if (!c) return; c.t += dt; if (c.t > 4.5) { this.eventCard = null; return; }
      const { ctx } = this, m = this.app.match, p = m.player, IW = W - 80;
      const rows = c.list.map(e => { const who = e.who ? (e.who === p.id ? '你' : m.get(e.who).name) : '全体'; return { who, e, text: e.name + '：' + e.desc }; });
      ctx.font = F(26, true);
      const nl = r => { let n = 1, line = ''; for (const ch of r.text) { if (ctx.measureText(line + ch).width > IW - 136 && line) { n++; line = ''; } line += ch; } return n; };
      const h = 76 + rows.reduce((a, r) => a + nl(r) * 34 + 16, 0), y0 = VY + 70;
      const k = Math.min(1, c.t / 0.2), out = Math.max(0, (c.t - 4) / 0.5);
      ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(W / 2, y0 + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-W / 2, -(y0 + h / 2));
      T().chunky(ctx, 24, y0, W - 48, h, 22, '#FFFBF3', { depth: 6, lineWidth: 3, glow: 'rgba(255,190,40,0.7)', glowBlur: 18 });
      T().logo(ctx, '随机事件！', W / 2, y0 + 34, 26, this.time);
      let y = y0 + 64;
      rows.forEach(r => {
        const col = r.e.good ? '#2E9E5B' : BOSS_RED, mine = r.e.who === p.id || (!r.e.who);
        T().chunky(ctx, 38, y, 100, 36, 18, col, { depth: 2, lineWidth: 2 }); T().boldText(ctx, r.who, 88, y + 18.5, 22, '#FFFFFF');
        ctx.fillStyle = mine ? '#3D2B1F' : '#6B5442'; ctx.font = F(26, true); ctx.textAlign = 'left';
        const end = this.wrap(r.text, 150, y + 18, IW - 136, 34); y = end - 34 + 16 + 18 + 4;
      });
      ctx.restore();
    }
    // 预告 + 正在生效的全体事件（场景顶部一排小标签）
    eventStrip() {
      const m = this.app.match; if (m.phase !== 'playing') return;
      const chips = [];
      if (m.eventPreviewed && m.eventT > 0) chips.push(['随机事件 ' + Math.ceil(m.eventT) + '…', '#FFB52E']);
      for (const e of m.activeEvents) chips.push([e.name + ' ' + Math.ceil(e.t) + 's', e.good ? '#2E9E5B' : BOSS_RED]);
      if (m.stealBy) chips.push([m.get(m.stealBy.by).name + '在抢功劳', '#9B51E0']);
      if (!chips.length) return;
      const { ctx } = this; let size = 26;   // 2.5.2 放大一倍（13 → 26）；一排放不下时整体缩小
      const widths = sz => { ctx.font = F(sz, true); return chips.map(c => ctx.measureText(c[0]).width + 16 + 4); };
      let ws = widths(size), tot = ws.reduce((a, b) => a + b, 0) + (chips.length - 1) * 8;
      if (tot > W - 16) { size = Math.max(13, Math.floor(size * (W - 16) / tot)); ws = widths(size); tot = ws.reduce((a, b) => a + b, 0) + (chips.length - 1) * 8; }
      let x = (W - tot) / 2; const y = VY + 14 + (size + 10) / 2;
      chips.forEach((c, i) => { const pul = i === 0 && m.eventPreviewed ? 1 + 0.06 * this.pulse(0.5) : 1; ctx.save(); ctx.translate(x + ws[i] / 2, y); ctx.scale(pul, pul); this.chip(0, 0, c[0], c[1], size); ctx.restore(); x += ws[i] + 8; });
    }
    // 红包、香蕉皮（在办公区地上）
    groundItems() {
      const { ctx } = this, m = this.app.match, s = this.cam.s;
      if (this.cam.room) return;
      for (const g of m.bags || []) {
        if (!this.onScreen(g.x, g.y, s)) continue; const x = this.sx(g.x), y = this.sy(g.y) - 3 * Math.sin(this.time * 5 + g.x);
        ctx.save(); ctx.shadowColor = 'rgba(255,80,60,0.8)'; ctx.shadowBlur = 14; T().chunky(ctx, x - s * 0.22, y - s * 0.3, s * 0.44, s * 0.56, 5, '#E0453A', { depth: 2, lineWidth: 2 }); ctx.restore();
        ctx.fillStyle = '#FFD46B'; ctx.beginPath(); ctx.arc(x, y - s * 0.05, s * 0.09, 0, Math.PI * 2); ctx.fill();
        this.chip(x, y + s * 0.42, '$' + g.cash, '#E0453A', 11);
      }
      for (const n of m.bananas || []) {
        if (!this.onScreen(n.x, n.y, s)) continue; const x = this.sx(n.x), y = this.sy(n.y) + s * 0.15;
        ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#F5D547'; ctx.strokeStyle = '#8C6B1F'; ctx.lineWidth = 2;
        for (const a of [-0.9, 0, 0.9]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -s * 0.14, s * 0.07, s * 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
        ctx.restore();
      }
    }
    // 被点名的员工：老板看得到他在哪（屏幕外就在边上指过去）
    spottedMarks() {
      const m = this.app.match, p = m.player; if (p.kind !== 'boss' || this.cam.room) return;
      const { ctx } = this;
      for (const e of m.employees()) {
        if (!(e.spottedT > 0)) continue;
        const q = this.P(e.x, e.y); let x = q.X, y = q.Y; const off = !this.seen(e.x, e.y, 0, -30);
        if (off) { const cx = W / 2, cy = VY + VH / 2, dx = x - cx, dy = y - cy, k = Math.min((W / 2 - 40) / Math.abs(dx || 1e-6), (VH / 2 - 40) / Math.abs(dy || 1e-6)); x = cx + dx * k; y = cy + dy * k; }
        ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * this.pulse(0.6); ctx.strokeStyle = BOSS_RED; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 10, 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        this.chip(x, y - 42, e.name + (e.room ? ' @' + A.ROOMS[e.room].name : ' 被点名'), BOSS_RED, 11);
      }
    }
    pauseOverlay() {
      const { ctx } = this; ctx.fillStyle = 'rgba(61,43,31,0.55)'; ctx.fillRect(0, 0, W, H);
      if (this.app.cardOpen) { this.identityCard(false); return; }
      const mid = Math.round((H - 960) / 2);
      T().chunky(ctx, 110, 220 + mid, 320, 550, 24, '#FFFBF3', { depth: 6 }); T().boldText(ctx, '暂停', W / 2, 272 + mid, 28, '#FFB52E');
      const ids = ['resume', 'card', 'sound', 'restart', 'home'].concat(this.v3 && this.v3.ok ? ['gfx'] : []);
      for (const id of ids) this.btn(UI[id], id === 'sound' ? (this.app.muted ? '音效：关' : '音效：开') : id === 'gfx' ? (this.app.gfx === '2d' ? '画面：经典' : '画面：3D') : UI[id].label, id === 'resume', 18);
    }
    // 结算：5 人统一排名逐行揭晓，然后逐个弹出称号
    result() {
      const { ctx } = this, m = this.app.match, p = m.player, L = m.finalRanking(), top = L[0].a, bs = m.boss.stats;
      if (this.overAt == null || this.overMatch !== m) { this.overAt = this.time; this.overMatch = m; }
      const t = this.time - this.overAt, shown = Math.min(5, Math.floor(t / 0.25) + 1);
      ctx.fillStyle = 'rgba(61,43,31,0.6)'; ctx.fillRect(0, 0, W, H);
      T().chunky(ctx, 18, 24, W - 36, H - 48, 24, '#FFFBF3', { depth: 7 });
      const head = top === p ? (p.kind === 'boss' ? '老板胜利！' : '摸鱼之王！') : top.kind === 'boss' ? '老板赢了' : p.kind === 'boss' ? '员工赢了' : top.name + ' 赢了';
      T().logo(ctx, head, W / 2, 84, 34, this.time);
      L.slice(0, shown).forEach((r, i) => {
        const e = r.a, y = 150 + i * 58, me = e === p, boss = e.kind === 'boss';
        T().chunky(ctx, 40, y - 23, W - 80, 48, 14, me ? '#FFF1D2' : boss ? '#FBE4E1' : '#FFFFFF', { depth: 3, lineWidth: 2, outline: me ? '#FFB52E' : T().OUTLINE });
        T().boldText(ctx, String(i + 1), 64, y + 1, 20, i === 0 ? '#FFC93C' : '#C9A882');
        if (boss) { ctx.save(); ctx.beginPath(); ctx.arc(104, y + 1, 17, 0, Math.PI * 2); ctx.clip(); OS.sprites.drawBoss(ctx, 104, y + 17, 0.72, { t: this.time, vivid: true }); ctx.restore(); }
        else OS.sprites.drawAnimal(ctx, e.id, 104, y + 2, 0.8, { headOnly: true, mood: i === 0 ? 'slack' : 'work', t: this.time });
        ctx.textAlign = 'left'; ctx.fillStyle = T().OUTLINE; ctx.font = F(16, true); ctx.fillText(e.name + (me ? '（你）' : ''), 132, y - 7);
        const sub = boss ? '没收 $' + Math.floor(bs.confiscated) + ' · 抓到 ' + bs.catches + ' 人次' : (e.personality ? 'AI · ' + A.PERSONALITIES[e.personality].name + ' · ' : '') + 'Lv' + e.level;
        ctx.fillStyle = '#A99A88'; ctx.font = F(12); ctx.fillText(sub, 132, y + 13);
        ctx.textAlign = 'right'; ctx.fillStyle = boss ? BOSS_RED : C().moneyDeep; ctx.font = F(18, true); ctx.fillText('$' + Math.floor(r.score), W - 58, y + 1);
      });
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(12); ctx.textAlign = 'center';
      ctx.fillText('查房 ' + bs.checks + ' 次 · 抓到 ' + bs.catches + ' 人次 · 补给 ' + m.stats.supplies + ' 个（被捡 ' + m.stats.picks + '）', W / 2, 456);
      ctx.fillText('口袋里没送回工位的钱不算成绩', W / 2, 476);
      const aw = m.awards(), t0 = 5 * 0.25 + 0.3;
      aw.forEach((w, i) => {
        const k = Math.max(0, Math.min(1, (t - t0 - i * 0.35) / 0.25)); if (!k) return;
        const col = i % 2, row = Math.floor(i / 2), bw = (W - 96) / 2, x = 40 + col * (bw + 16), y = 506 + row * 82, sc = 0.6 + 0.4 * k + 0.08 * Math.sin(k * Math.PI);
        ctx.save(); ctx.globalAlpha = k; ctx.translate(x + bw / 2, y + 34); ctx.scale(sc, sc); ctx.rotate((col ? 1 : -1) * 0.02);
        T().chunky(ctx, -bw / 2, -34, bw, 68, 14, '#FFF6DC', { depth: 3, lineWidth: 2, outline: '#E3A51E' });
        T().boldText(ctx, w.title, 0, -14, 16, '#E8890C');
        ctx.textAlign = 'center'; ctx.fillStyle = '#6B5442'; ctx.font = F(12); this.wrap(w.name + ' · ' + w.text, 0, 10, bw - 20, 16);
        ctx.restore();
      });
      if (!aw.length && t > t0) { ctx.fillStyle = '#A99A88'; ctx.font = F(13); ctx.textAlign = 'center'; ctx.fillText('这局没人拿到称号', W / 2, 560); }
      this.btn(UI.again, UI.again.label, true, 19); this.btn(UI.home2, UI.home2.label, false, 19);
    }
    // 标题页（2.3.0）：大号规则板放在上面，难度和按钮在中间，动物们小一号排在最下面
    title() {
      const { ctx } = this, mid = Math.round((H - 960) / 2), t0 = Math.round(mid * 0.6);
      for (let i = -20; i < 30; i++) { ctx.fillStyle = i % 2 ? '#F6E7D2' : '#F1DFC6'; ctx.beginPath(); const x = i * 40 + (this.time * 10) % 80; ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x - 400, H); ctx.lineTo(x - 440, H); ctx.fill(); }
      T().logo(ctx, '摸鱼大作战', W / 2, 66 + mid * 0.3, 46, this.time);
      { const b = UI.titleSound, on = !this.app.muted; T().chunky(ctx, b.x, b.y, b.w, b.h, 16, on ? '#FFFFFF' : '#F3E6E2', { depth: 3, lineWidth: 2.5 }); this.speakerIcon(b.x + b.w / 2, b.y + b.h / 2, 15, on); }
      // ctx.fillStyle = '#8C6B4F'; ctx.font = F(15, true); ctx.textAlign = 'center'; ctx.fillText('1 名老板 + 4 名员工 · 单人试玩版（其他角色由 AI 扮演）', W / 2, 112 + mid * 0.3);
      // 规则板：按内容算高度，放在标题和难度之间
      const rules = [
        ['安全区', '#2E9E5B', '中间办公区安全'],
        ['摸鱼房', '#E8890C', '四周房间摸鱼，被抓扣钱'],
        ['视野', '#30d5eb', '房里看不到外，老板看不到里'],
        ['厕所', '#4FA9B3', '老板进不去，收益低、限时'],
        ['存钱', '#D9780A', '存回工位不会被扣，连摸有加成'],
        ['被抓', BOSS_RED, '待越久扣越多，20%~100%'],
        ['事件', '#9B51E0', '每 30s 一轮，有奖有罚'],
      ];
      const px = 18, pw = W - 36, RF = 27; ctx.font = F(RF, true);   // 2.6.2：规则字放大、写短
      const rows = rules.map(([k, col, text]) => { const kw = ctx.measureText(k).width + 22, tw = pw - kw - 44; let n = 1, line = ''; for (const ch of text) { if (ctx.measureText(line + ch).width > tw && line) { n++; line = ''; } line += ch; } return { k, col, text, kw, tw, h: Math.max(46, 12 + n * 36) }; });
      const ph = 44 + rows.reduce((a, r) => a + r.h, 0) + (rows.length - 1) * 6, top = 148 + mid * 0.3, bot = UI.diff[0].y - 44, py = Math.max(top, top + (bot - top - ph) / 2);
      T().chunky(ctx, px, py, pw, ph, 22, '#FFFBF3', { depth: 6, lineWidth: 3.5, outline: '#E8890C' });
      T().chunky(ctx, W / 2 - 74, py - 18, 148, 36, 18, '#FFB52E', { depth: 3, lineWidth: 2.5 }); T().boldText(ctx, '游戏规则', W / 2, py + 1, 19, '#FFFFFF');
      let y = py + 30;
      for (const r of rows) {
        T().chunky(ctx, px + 12, y + 4, r.kw, 38, 19, r.col, { depth: 2, lineWidth: 2 }); T().boldText(ctx, r.k, px + 12 + r.kw / 2, y + 23.5, RF - 3, '#FFFFFF');
        ctx.fillStyle = '#3D2B1F'; ctx.font = F(RF, true); ctx.textAlign = 'left'; this.wrap(r.text, px + 22 + r.kw, y + 24, r.tw, 36);
        y += r.h + 6;
      }
      // 难度
      // ctx.fillStyle = '#8C6B4F'; ctx.font = F(15, true); ctx.textAlign = 'center'; ctx.fillText('AI 老板难度', W / 2, UI.diff[0].y - 18);
      UI.diff.forEach(b => {
        const on = this.app.difficulty === b.id, hov = this.mouse && inside(b, this.mouse);
        T().chunky(ctx, b.x, b.y - (hov ? 2 : 0), b.w, b.h, 16, on ? ({ easy: '#7CD3A2', normal: '#FFB52E', hard: '#E8746A' })[b.id] : '#FFFFFF', { depth: on ? 4 : 2, lineWidth: 2 });
        if (on) T().boldText(ctx, A.DIFFICULTY[b.id].name, b.x + b.w / 2, b.y + b.h / 2 + 1, 18, '#FFFFFF');
        else { ctx.fillStyle = '#6B5442'; ctx.font = F(17, true); ctx.textAlign = 'center'; ctx.fillText(A.DIFFICULTY[b.id].name, b.x + b.w / 2, b.y + b.h / 2 + 1); }
      });
      ctx.fillStyle = '#A99A88'; ctx.font = F(20); ctx.textAlign = 'center';
      // ctx.fillText({ easy: '老板随机查房', normal: '老板会记住看到你走进了哪扇门（偶尔记错）', hard: '老板在门口盯得紧，记得清清楚楚' }[this.app.difficulty], W / 2, UI.diff[0].y + 64);
      this.btn(UI.start, '开始', true, 24); this.btn(UI.back, UI.back.label, false, 16);
      // 最下面：小一号的动物们 + 操作说明
      const ay = UI.back.y + 108 + Math.max(0, mid * 0.3);
      A.EMPLOYEE_IDS.forEach((id, i) => OS.sprites.drawAnimal(ctx, id, 92 + i * 66, ay + Math.sin(this.time * 3 + i) * 2, 0.95, { mood: 'slack', t: this.time + i }));
      OS.sprites.drawBoss(ctx, 448, ay - 4, 0.95, { t: this.time, vivid: true, outline: 2, look: Math.sin(this.time * 1.3) * 3 });
      ctx.fillStyle = '#A99A88'; ctx.font = F(12); ctx.textAlign = 'center';
      // ctx.fillText('点开始随机分配身份（1/5 当老板）· 点哪走哪 · 电脑：WASD / 空格 / E / Q / 1 2 3', W / 2, Math.min(H - 14, ay + 46));
    }
  }
  A.Renderer = ArenaRenderer;
  A.layout(960);
})(typeof window !== 'undefined' ? window : globalThis);
