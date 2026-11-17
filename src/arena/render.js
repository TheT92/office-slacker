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
  const RCOL = id => (T().ROOM[id] || { fill: '#F6DCC8', edge: '#D8A98A' });
  const BOSS_RED = '#E0453A';

  // 界面按钮（逻辑坐标）
  const UI = {
    gear: { x: 482, y: 14, w: 46, h: 46 },
    action: { x: 16, y: 830, w: 372, h: 96 },          // 员工大按钮
    skill: { x: 400, y: 830, w: 124, h: 96 },          // 员工技能（E）
    bossAction: { x: 16, y: 898, w: 508, h: 50 },      // 老板：离开房间
    start: { x: 150, y: 690, w: 240, h: 60, label: '开始' },
    back: { x: 170, y: 770, w: 200, h: 46, label: '返回闯关模式' },
    resume: { x: 150, y: 330, w: 240, h: 54, label: '继续' },
    card: { x: 150, y: 400, w: 240, h: 54, label: '查看身份卡' },
    sound: { x: 150, y: 470, w: 240, h: 54 },
    restart: { x: 150, y: 540, w: 240, h: 54, label: '重新开始' },
    home: { x: 150, y: 610, w: 240, h: 54, label: '返回首页' },
    again: { x: 40, y: 862, w: 220, h: 56, label: '再来一局' },
    home2: { x: 280, y: 862, w: 220, h: 56, label: '返回首页' },
    ready: { x: 140, y: 866, w: 260, h: 56, label: '准备好了' },
  };
  UI.diff = ['easy', 'normal', 'hard'].map((id, i) => ({ id, x: 60 + i * 146, y: 560, w: 128, h: 46 }));   // 标题页：AI 老板难度
  UI.bskill = [0, 1, 2].map(i => ({ x: 16 + i * 172, y: 826, w: 164, h: 62 }));   // 老板最多 3 个技能
  A.actionRect = kind => (kind === 'boss' ? UI.bossAction : UI.action);
  // 阶段选技能 / 升级选方向的卡片：竖着排在场景中间
  A.offerRects = n => { const w = 460, h = 112, gap = 14, y0 = VY + 150 + (3 - n) * (h + gap) / 2; return Array.from({ length: n }, (_, i) => ({ x: (W - w) / 2, y: y0 + i * (h + gap), w, h })); };
  A.UI = UI;
  // 按画面高度重新摆放底部按钮（顶栏和场景顶部不动）
  A.layout = function (h) {
    H = Math.round(Math.max(960, Math.min(1200, h || 960))); BOT = H - 148; VH = BOT - VY;
    const d = H - 960, mid = Math.round(d / 2);
    UI.action.y = BOT + 18; UI.skill.y = BOT + 18; UI.bskill.forEach(b => (b.y = BOT + 14)); UI.bossAction.y = BOT + 86;
    UI.ready.y = 866 + d; UI.again.y = 862 + d; UI.home2.y = 862 + d;
    [['resume', 330], ['card', 400], ['sound', 470], ['restart', 540], ['home', 610]].forEach(([id, y]) => (UI[id].y = y + mid));
    UI.diff.forEach(b => (b.y = 560 + mid)); UI.start.y = 690 + mid; UI.back.y = 770 + mid;
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
      if (p && p.room && m.phase === 'playing') {
        const cells = m.grid.cells.filter(k => k.room === p.room || k.door === p.room);
        const c0 = Math.min(...cells.map(k => k.c)), c1 = Math.max(...cells.map(k => k.c)) + 1, r0 = Math.min(...cells.map(k => k.r)), r1 = Math.max(...cells.map(k => k.r)) + 1;
        const bw = W - 40, bh = VH - 220, s = Math.min(bw / (c1 - c0), bh / (r1 - r0), 1.5 * TS);
        this.focus = null;
        return { s, ox: (W - (c1 - c0) * s) / 2 - c0 * s, oy: VY + 96 + (bh - (r1 - r0) * s) / 2 - r0 * s, room: p.room, box: [c0, r0, c1, r1] };
      }
      const g = m.grid, tx = p ? p.x : A.BOSS_ARRIVE.x, ty = p ? p.y : A.BOSS_ARRIVE.y;
      if (!this.focus || !dt || Math.hypot(tx - this.focus.x, ty - this.focus.y) > 6) this.focus = { x: tx, y: ty };   // 瞬移（开会、出生）直接切过去
      else { const k = Math.min(1, dt * 10); this.focus.x += (tx - this.focus.x) * k; this.focus.y += (ty - this.focus.y) * k; }
      let ox = W / 2 - this.focus.x * TS, oy = VY + VH / 2 - this.focus.y * TS;
      ox = Math.min(0, Math.max(W - g.cols * TS, ox)); oy = Math.min(VY, Math.max(VY + VH - g.rows * TS, oy));   // 不拍到地图外面
      return { s: TS, ox, oy, room: null };
    }
    toWorld(px, py) { const c = this.cam || this.camera(); return { x: (px - c.ox) / c.s, y: (py - c.oy) / c.s }; }
    sx(x) { return this.cam.ox + x * this.cam.s; }
    sy(y) { return this.cam.oy + y * this.cam.s; }
    onScreen(x, y, pad) { pad = pad || 0; const X = this.sx(x), Y = this.sy(y); return X >= -pad && X <= W + pad && Y >= VY - pad && Y <= BOT + pad; }

    draw(dt) {
      this.time += dt;
      const { ctx, canvas } = this, dpr = canvas.width / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'middle';
      ctx.fillStyle = '#EFE4D4'; ctx.fillRect(0, 0, W, H);
      const app = this.app;
      if (app.screen === 'title') { this.title(); this.drawToasts(dt); return; }
      const m = app.match;
      this.cam = this.camera(dt);
      // 场景（只画在中间区域）
      ctx.save(); ctx.beginPath(); ctx.rect(0, VY, W, VH); ctx.clip();
      ctx.fillStyle = FLOOR.void; ctx.fillRect(0, VY, W, VH);
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const k = this.shake * 18; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
      this.world();
      if (this.cam.room) this.roomOverlay();
      else if (m.player.kind === 'boss' && m.boss.waitT > 0 && m.phase === 'playing') this.bossWaitOverlay();
      else this.deskArrow();
      this.offerOverlay();
      this.arriveHud();
      this.drawFloats(dt); this.drawToasts(dt); this.drawBanner(dt);
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
      if (p.kind === 'boss') return !!(m.boss.peek && m.boss.peek.room === roomId);
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
      this.supplyLayer();
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
        T().boldText(ctx, { takeout: '饭', double: '×2', leave: '假', manual: '书' }[it.kind], x, y + 1, Math.round(r * 0.95), '#D9780A');
        ctx.font = F(11, true); const w = ctx.measureText(I.name).width + 10; T().chunky(ctx, x - w / 2, y + r + 3, w, 16, 8, '#FFFFFF', { depth: 1, lineWidth: 1.2 }); T().boldText(ctx, I.name, x, y + r + 11.5, 11, '#8C6B4F');
        if (it.prog > 0) { ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * it.prog / A.SUPPLY.pick); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 4; ctx.stroke(); }
      }
      const pk = m.boss.peek; if (pk && m.player.kind === 'boss' && !this.cam.room) {   // 老板监控中的房间：高亮
        const cs = m.grid.cells.filter(k => k.room === pk.room), c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r)), c1 = Math.max(...cs.map(k => k.c)) + 1, r1 = Math.max(...cs.map(k => k.r)) + 1;
        ctx.save(); ctx.strokeStyle = 'rgba(155,81,224,' + (0.6 + 0.4 * this.pulse(0.6)) + ')'; ctx.lineWidth = 5; ctx.setLineDash([10, 6]); ctx.strokeRect(this.sx(c0) + 3, this.sy(r0) + 3, (c1 - c0) * s - 6, (r1 - r0) * s - 6); ctx.restore();
        const n = m.employees().filter(e => e.room === pk.room).length;
        this.chip(this.sx((c0 + c1) / 2), this.sy(r1) - 16, '监控中 ' + Math.ceil(pk.t) + 's · ' + (n ? n + ' 人' : '没人'), '#9B51E0');
      }
    }
    roomDecor() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s;
      this.boxCache = this.boxCache && this.boxCache.g === g ? this.boxCache : { g };
      const box = id => { if (!this.boxCache[id]) { const cs = g.cells.filter(k => k.room === id && !k.stairs); const c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r)); this.boxCache[id] = { c0, r0, c1: Math.max(...cs.map(k => k.c)) + 1, r1: Math.max(...cs.map(k => k.r)) + 1 }; }
        const B = this.boxCache[id]; return { x: this.sx(B.c0), y: this.sy(B.r0), w: (B.c1 - B.c0) * s, h: (B.r1 - B.r0) * s }; };
      ctx.save();
      // 厕所：两个隔间
      let b = box('restroom');
      for (const k of [0.06, 0.38]) { ctx.fillStyle = '#B9D3EA'; T().rr(ctx, b.x + b.w * k, b.y + b.h * 0.1, b.w * 0.26, b.h * 0.62, s * 0.15); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(b.x + b.w * (k + 0.13), b.y + b.h * 0.36, s * 0.3, s * 0.36, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7FA6C9'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = '#DCEBF7'; T().rr(ctx, b.x + b.w * 0.74, b.y + b.h * 0.12, b.w * 0.2, b.h * 0.34, s * 0.1); ctx.fill(); ctx.strokeStyle = '#9DBCD8'; ctx.stroke();
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
      // 会议室：白板 + 长桌
      b = box('meeting'); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(b.x + b.w - s * 0.55, b.y + b.h * 0.2, s * 0.4, b.h * 0.6); ctx.strokeStyle = '#97CDB1'; ctx.lineWidth = 2; ctx.strokeRect(b.x + b.w - s * 0.55, b.y + b.h * 0.2, s * 0.4, b.h * 0.6);
      ctx.fillStyle = '#C9A27E'; T().rr(ctx, b.x + b.w * 0.3, b.y + s * 1.2, s * 1.4, b.h - s * 2.4, s * 0.3); ctx.fill();
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
      for (const id in m.locks) { const q = at(id); if (q) this.chip(q.x, q.y - 24, '门锁着 ' + Math.ceil(m.locks[id].t) + 's', '#8F7CC4'); }
      for (const id of A.SLACK_ROOMS) {
        const q = at(id); if (!q) continue;
        if (p.kind === 'boss') { if (p.cooldowns[id] > 0) this.chip(q.x, q.y, '冷却 ' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88'); continue; }
        const why = m.entryBlock(p, id);
        if (why === 'boss') this.chip(q.x, q.y, '老板在里面', BOSS_RED);
        else if (why === 'cooldown') this.chip(q.x, q.y, '冷却 ' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88');
        else if (why === 'full') this.chip(q.x, q.y, '满了', C().coral);
      }
    }
    chip(x, y, text, fill, size) { const { ctx } = this; size = size || 13; ctx.font = F(size, true); const w = ctx.measureText(text).width + 16, h = size + 10; T().chunky(ctx, x - w / 2, y - h / 2, w, h, h / 2, fill, { depth: 2, lineWidth: 2 }); T().boldText(ctx, text, x, y + 0.5, size, '#FFFFFF'); }
    roomBanners() {
      const { ctx } = this, m = this.app.match, g = m.grid;
      for (const id of ['restroom', 'meeting', 'pantry', 'rooftop']) {
        const R = A.ROOMS[id], cs = g.cells.filter(k => k.room === id && !k.stairs), c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r));
        const lure = R.slack ? m.lure(id) : 1, lt = lure >= 1.05 ? ' ×' + lure.toFixed(1) : '';
        const text = !R.slack ? R.name + ' · 不能摸鱼' : m.player.kind === 'boss' ? R.name + lt : R.name + ' ' + m.occupants(id).filter(e => e.kind === 'employee').length + '/' + R.cap + lt;   // 老板视角不显示人数；×N = 空房诱惑倍率
        ctx.font = F(14, true); const w = ctx.measureText(text).width + 18, x = this.sx(c0) + 6, y = this.sy(r0) + 6;
        T().chunky(ctx, x, y, w, 24, 12, '#FFFFFF', { depth: 2, lineWidth: 2 }); T().boldText(ctx, text, x + w / 2, y + 12.5, 14, R.slack ? RCOL(id).edge : '#B08D6F');
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
      if (owner && owner.decoyT > 0 && away) {   // 猫的替身：老板看到"猫在工位"；员工看到半透明假身
        const st = A.seatOf(d); ctx.save(); if (p.kind !== 'boss') ctx.globalAlpha = 0.45;
        OS.sprites.drawAnimal(ctx, owner.id, this.sx(st.x), this.sy(st.y) - 6 * k, 0.82 * k, { mood: 'work', t: this.time }); ctx.restore();
        if (p.kind !== 'boss') this.chip(this.sx(st.x), this.sy(st.y) - 40 * k, '替身', '#A99A88', 11);
        return;
      }
      if (p.kind === 'boss' && away) this.chip(x + s, y + s * 1.8, owner.name + ' · 不在', C().coral, 11);   // 老板视角：人不在办公区
    }
    actor(a) {
      const { ctx } = this, m = this.app.match, s = this.cam.s, k = s / 36, x = this.sx(a.x), y = this.sy(a.y), p = m.player;
      if (this.cam.room && a.room !== this.cam.room) return;   // 房间视角：只画房间里的人
      if (!this.onScreen(a.x, a.y, 3 * s)) return;
      if (a.kind === 'employee' && a.room && !this.canSee(a.room)) return;   // 老板看不见房间里面（监控中的除外）
      if (a.kind === 'boss') { if (a.waitT > 0) return; this.bossSprite(a, x, y, k); return; }   // 老板开局还没到公司
      const mood = a.stun > 0 ? 'caught' : a.moving ? 'walk' : a.room ? 'slack' : 'work';
      ctx.save(); if (a.facing < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      OS.sprites.drawAnimal(ctx, a.id, x, y - 6 * k, 0.82 * k, { mood, t: this.time + a.desk.id, prop: a.room === 'pantry' && !a.moving ? 'coffee' : a.room === 'restroom' && !a.moving ? 'phone' : null });
      ctx.restore();
      const top = y - 34 * k;
      if (a.meetingT > 0) this.chip(x, top - 34, '开会中 ' + Math.ceil(a.meetingT) + 's', '#97CDB1', 11);
      if (a === p) {   // 自己身上的状态
        const tags = [a.dashT > 0 && '冲刺', a.squat && '久蹲', a.doubleT > 0 && '×2 ' + Math.ceil(a.doubleT) + 's', a.leaveNote && '请假条', a.immuneT > 0 && '免抓 ' + Math.ceil(a.immuneT) + 's'].filter(Boolean);
        tags.forEach((t, i) => this.chip(x - 40 * k, y - 12 * k + i * 24, t, '#2E9E5B', 11));
        T().boldText(ctx, '▼', x, top - 22 - 4 * this.pulse(0.7), 16, '#FFC93C');
      }
      ctx.font = F(12, true); const nw = ctx.measureText(a.name).width + 12;
      T().chunky(ctx, x - nw / 2, top - 9, nw, 18, 9, a === p ? '#FFC93C' : '#FFFFFF', { depth: 1, lineWidth: 1.5 });
      T().boldText(ctx, a.name, x, top + 0.5, 12, a === p ? '#FFFFFF' : '#6B5442');
      // 口袋里的钱（老板只看到钱袋和"?"）
      if (a.pocket >= 1) { const cm = A.comboMult(a.combo), t = p.kind === 'boss' ? '?' : '$' + Math.floor(a.pocket) + (cm > 1 ? ' ×' + cm.toFixed(1) : ''); ctx.font = F(12, true); const w = ctx.measureText(t).width + 28, bx = x + 14 * k, by = y - 20 * k; T().chunky(ctx, bx, by, w, 20, 10, '#FFF1D2', { depth: 2, lineWidth: 1.5 }); T().coin(ctx, bx + 11, by + 10, 6.5); ctx.fillStyle = C().moneyDeep; ctx.textAlign = 'left'; ctx.fillText(t, bx + 21, by + 10.5); }
    }
    // 老板：放大 + 深色西装 + 描边 + 头顶红名牌 + 脚下一圈圈的红圈（只要出现在屏幕里就很醒目）
    bossSprite(a, x, y, k) {
      const { ctx } = this, p = this.app.match.player, ph = (this.time * 1.2) % 1;
      ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = BOSS_RED; ctx.beginPath(); ctx.ellipse(x, y + 14 * k, 20 * k, 6.5 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6 * (1 - ph); ctx.strokeStyle = BOSS_RED; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y + 14 * k, (21 + ph * 13) * k, (7 + ph * 4) * k, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      OS.sprites.drawBoss(ctx, x, y - 8 * k, 1.12 * k, { t: this.time, vivid: true, outline: 2.5, mood: a.hr > 0 ? 'read' : null, look: a.moving ? a.facing * 2 : Math.sin(this.time * 1.5) * 2 });
      const st = a.hr > 0 ? 'HR 约谈中' : a.freezeT > 0 ? '开会中' : a.stay > 0 ? '查房！' : a.dashT > 0 ? '冲刺！' : '';
      const txt = (a === p ? '老板（你）' : '老板') + (st ? ' · ' + st : ''), ty = Math.max(VY + 16, y - 58 * k + Math.sin(this.time * 3) * 2);
      ctx.font = F(15, true); const w = ctx.measureText(txt).width + 22;
      T().chunky(ctx, x - w / 2, ty - 13, w, 26, 13, a.hr > 0 ? '#9C88CF' : BOSS_RED, { depth: 2, lineWidth: 2 });
      T().boldText(ctx, txt, x, ty + 0.5, 15, '#FFFFFF');
      if (a.hr > 0) { ctx.save(); ctx.translate(x + w / 2 + 12, ty); T().clock(ctx, 0, 0, 9); ctx.rotate(this.time * 4); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6); ctx.stroke(); ctx.restore(); }
    }
    // 自己的工位不在屏幕里：屏幕边上一个绿色箭头指过去
    deskArrow() {
      const m = this.app.match, p = m.player; if (p.kind !== 'employee' || m.phase !== 'playing') return;
      const st = A.seatOf(p.desk); if (this.onScreen(st.x, st.y - 0.5, -30)) return;
      const { ctx } = this, cx = W / 2, cy = VY + VH / 2, dx = this.sx(st.x) - cx, dy = this.sy(st.y) - cy, a = Math.atan2(dy, dx);
      const k = Math.min((W / 2 - 34) / Math.abs(dx || 1e-6), (VH / 2 - 34) / Math.abs(dy || 1e-6)), x = cx + dx * k, y = cy + dy * k, hot = p.pocket >= 1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = 0.75 + 0.25 * this.pulse(0.9);
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -14); ctx.lineTo(-4, 0); ctx.lineTo(-10, 14); ctx.closePath(); ctx.fillStyle = '#2ECC71'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = T().OUTLINE; ctx.stroke(); ctx.restore();
      this.chip(x - Math.cos(a) * 34, y - Math.sin(a) * 30, hot ? '工位 $' + Math.floor(p.pocket) : '工位', '#2ECC71', 11);
    }

    // 房间视角：外面一片暗，看不到老板和其他人；上面写在哪，下面是停留进度
    roomOverlay() {
      const { ctx } = this, m = this.app.match, p = m.player, [c0, r0, c1, r1] = this.cam.box, boss = p.kind === 'boss', R = A.ROOMS[p.room];
      const x = this.sx(c0), y = this.sy(r0), w = this.sx(c1) - x, h = this.sy(r1) - y;
      ctx.save(); ctx.beginPath(); ctx.rect(0, VY, W, VH); ctx.rect(x, y, w, h); ctx.fillStyle = '#4A3A2E'; ctx.fill('evenodd');
      ctx.lineWidth = 6; ctx.strokeStyle = T().OUTLINE; ctx.strokeRect(x, y, w, h); ctx.restore();
      const ty = VY + 46, by = Math.min(BOT - 100, y + h + 40), bx = 50, bw = W - 100;
      const bar = (k, col, left, right) => {
        T().rr(ctx, bx, by, bw, 16, 8); ctx.fillStyle = '#6B5442'; ctx.fill();
        T().rr(ctx, bx, by, Math.max(16, bw * Math.min(1, k)), 16, 8); ctx.fillStyle = col; ctx.fill();
        T().rr(ctx, bx, by, bw, 16, 8); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = F(14, true); ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF'; ctx.fillText(left, bx, by + 36);
        if (right) { ctx.textAlign = 'right'; ctx.fillStyle = right[1]; ctx.fillText(right[0], bx + bw, by + 36); }
      };
      if (boss) {
        T().boldText(ctx, '在' + R.name + '查房', W / 2, ty, 24, '#FFFFFF');
        ctx.fillStyle = '#E8D9C6'; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText('在房间里看不到外面，不知道别人去了哪', W / 2, ty + 32);
        bar(p.hr > 0 ? 0 : 1 - p.stay / R.bossStay, p.stay > 0 ? '#F0A030' : '#7CD3A2', p.hr > 0 ? '被 HR 约谈中…' : p.stay > 0 ? '职场边界感：还要待 ' + Math.ceil(p.stay) + ' 秒' : '可以离开了（点房间外面）');
        return;
      }
      const sk = p.squat ? p.squat.k : 1, maxS = R.maxStay * sk, t = p.roomTime, left = Math.max(0, maxS - t), rate = A.rate(p.room, t, sk), cell = m.grid.cellAt(p.x, p.y), lock = m.locks[p.room];
      const bossHere = m.boss.room === p.room;
      T().boldText(ctx, p.stun > 0 ? '被老板抓到了！' : bossHere ? '老板来了！' : '在' + R.name + '摸鱼中', W / 2, ty, 24, p.stun > 0 || bossHere ? '#FF8A7A' : '#FFFFFF');
      ctx.fillStyle = '#E8D9C6'; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText(lock ? '门锁着（还剩 ' + Math.ceil(lock.t) + ' 秒），老板进不来' : '看不到外面，老板会不会来全凭运气', W / 2, ty + 32);
      const mul = p.lure * (p.doubleT > 0 ? 2 : 1) * (lock && lock.by === p.id ? lock.inc : 1) * (m.rush ? A.RUSH.income : 1);
      bar(t / maxS, left < 4 ? C().coral : '#7CD3A2', m.mustStay(p) ? '至少再待 ' + Math.ceil(A.ECON.minStay - t) + ' 秒' : left < 4 ? '腿快麻了… ' + Math.ceil(left) + ' 秒后自动出门' : '还能待 ' + Math.ceil(left) + ' 秒',
        cell && cell.stairs ? ['爬楼梯中，还没开始赚', '#E8D9C6'] : ['$' + (rate * mul).toFixed(1) + '/秒 ' + (t > R.rise * sk ? '↓' : '↑'), '#FFD46B']);
    }
    // 老板开局还没到：整个场景暗下来
    bossWaitOverlay() {
      const { ctx } = this, b = this.app.match.boss;
      ctx.fillStyle = 'rgba(74,58,46,0.92)'; ctx.fillRect(0, VY, W, VH);
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
      ctx.textAlign = 'left'; ctx.fillStyle = T().OUTLINE; ctx.font = F(18, true); ctx.fillText(boss ? '老板' : p.name + ' Lv' + p.level, 72, 28);
      ctx.fillStyle = c.inkSoft; ctx.font = F(12, true); ctx.fillText(boss ? '抓人收益越抓越多' : '工位 ' + (p.desk.id + 1), 72, 50);
      // 倒计时（中间）
      const sec = Math.ceil(m.left), txt = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), hot = m.rush && m.phase === 'playing';
      ctx.save(); ctx.translate(W / 2 + 40, 36); if (hot) { const k = 1 + 0.06 * this.pulse(0.6); ctx.scale(k, k); }
      T().boldText(ctx, txt, 0, 0, 30, hot || sec <= 30 ? BOSS_RED : '#5A4636', '#FFFFFF'); ctx.restore();
      if (hot) this.chip(W / 2 + 40, 64, boss ? '冲刺 · 移动 ×1.3' : '冲刺 · 收入 ×2', BOSS_RED, 11);
      // 设置
      const g = UI.gear; T().chunky(ctx, g.x, g.y, g.w, g.h, 14, '#FFFFFF', { depth: 3, lineWidth: 2 }); this.gearIcon(g.x + g.w / 2, g.y + g.h / 2, 12);
      // 第二行：钱 / 老板收益
      const y2 = 86;
      if (boss) {
        T().coin(ctx, 24, y2, 9); ctx.textAlign = 'left'; ctx.fillStyle = c.moneyDeep; ctx.font = F(17, true); ctx.fillText('$' + Math.floor(m.bossScore()), 40, y2 + 1);
        const x1 = 40 + ctx.measureText('$' + Math.floor(m.bossScore())).width + 14;
        ctx.fillStyle = '#8C6B4F'; ctx.font = F(13, true); ctx.fillText('抓 ' + p.stats.catches + ' · 下次 ×' + A.catchMult(p.stats.catches).toFixed(1), x1, y2 + 1);
        // 怒气 + 冒犯值（两根细条）
        const bars = [['怒气', p.anger / A.ANGER.max, '#E8746A'], [p.hr > 0 ? 'HR' : '冒犯', p.hr > 0 ? p.hr / A.BOSS.hrTime : p.offense / A.BOSS.offenseMax, p.hr > 0 ? '#B7A6DD' : p.offense > A.BOSS.slowAt ? BOSS_RED : '#F0A030']];
        bars.forEach(([lab, v, col], i) => { const bx = 400, by = y2 - 11 + i * 14, bw = 92; ctx.fillStyle = '#6B5442'; ctx.font = F(10, true); ctx.textAlign = 'right'; ctx.fillText(lab, bx - 5, by + 4); T().rr(ctx, bx, by, bw, 9, 4.5); ctx.fillStyle = '#EFE5D8'; ctx.fill(); if (v > 0) { T().rr(ctx, bx, by, Math.max(9, bw * Math.min(1, v)), 9, 4.5); ctx.fillStyle = col; ctx.fill(); } T().rr(ctx, bx, by, bw, 9, 4.5); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 1.2; ctx.stroke(); });
        return;
      }
      T().coin(ctx, 24, y2, 9); ctx.textAlign = 'left'; ctx.fillStyle = c.moneyDeep; ctx.font = F(17, true); const bt = '$' + Math.floor(p.banked); ctx.fillText(bt, 40, y2 + 1);
      let x1 = 40 + ctx.measureText(bt).width + 14;
      const cm = A.comboMult(p.combo), lazy = !p.room && p.officeTime > A.ECON.idleAfter;
      ctx.font = F(13, true); ctx.fillStyle = p.pocket >= 1 ? '#D9780A' : '#A99A88'; const pt = '口袋 $' + Math.floor(p.pocket) + (cm > 1 ? ' ×' + cm.toFixed(1) : ''); ctx.fillText(pt, x1, y2 + 1); x1 += ctx.measureText(pt).width + 12;
      if (lazy) { ctx.fillStyle = c.coral; ctx.fillText('工资变低了', x1, y2 + 1); }
      // 右边：还在冷却的房间
      let rx = W - 14;
      for (const id of A.SLACK_ROOMS.slice().reverse()) { const cd = p.cooldowns[id]; if (!(cd > 0)) continue; const t = A.ROOMS[id].name + ' ' + Math.ceil(cd) + 's'; ctx.font = F(11, true); const w = ctx.measureText(t).width + 14; T().chunky(ctx, rx - w, y2 - 10, w, 20, 10, '#EDE6DC', { depth: 1, lineWidth: 1.2, outline: '#C9B8A6' }); ctx.fillStyle = '#8C7B6B'; ctx.textAlign = 'center'; ctx.fillText(t, rx - w / 2, y2 + 0.5); rx -= w + 6; }
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
      if (p.kind === 'boss') { this.bossSkills(); const lab = p.waitT > 0 ? '还有 ' + Math.ceil(p.waitT) + ' 秒到达' : p.hr > 0 ? '被 HR 约谈中…' : p.room ? (p.stay > 0 ? '查房中，还要待 ' + Math.ceil(p.stay) + ' 秒' : '离开房间' + this.key('[空格]')) : '点房间门去查房'; this.btn(UI.bossAction, lab, !!p.room && p.stay <= 0 && !p.hr, 17, !p.room || p.stay > 0 || p.hr > 0); return; }
      const wait = m.mustStay(p), atDesk = !p.room && Math.hypot(p.x - A.seatOf(p.desk).x, p.y - A.seatOf(p.desk).y) <= A.ECON.depositRange;
      const label = p.forced ? '自动出门中…' : wait ? '还要待 ' + Math.ceil(A.ECON.minStay - p.roomTime) + ' 秒' : p.room ? '出门' : p.pocket >= 1 ? (atDesk ? '存钱 $' : '回工位存 $') + Math.floor(p.pocket) : '回工位';
      const hot = !p.forced && !wait && (p.room ? p.roomTime > A.ROOMS[p.room].rise : p.pocket >= 1);
      this.btn(UI.action, label + (p.forced || wait ? '' : this.key('[空格]')), hot, 22, p.forced || wait);
      this.empSkill();
    }
    empSkill() {
      const { ctx } = this, m = this.app.match, p = m.player, S = A.EMP_SKILLS[p.id], P = A.empSkill(p), b = UI.skill, needRoom = S.where === 'room' && !p.room;
      const ok = p.skillCd <= 0 && !needRoom && !m.busy(p) && !(p.id === 'bear' && p.squat);
      T().chunky(ctx, b.x, b.y, b.w, b.h, 20, ok ? '#9B51E0' : '#EDE6DC', { depth: ok ? 5 : 2, lineWidth: 2.5, glow: ok ? 'rgba(155,81,224,' + (0.3 + 0.3 * this.pulse(1.2)) + ')' : null, glowBlur: 14 });
      if (p.skillCd > 0) { ctx.fillStyle = 'rgba(61,43,31,0.18)'; T().rr(ctx, b.x, b.y + b.h * (1 - p.skillCd / P.cd), b.w, b.h * p.skillCd / P.cd, 20); ctx.fill(); }
      const br = p.branch ? (p.branch === 'A' ? S.nameA : S.nameB) : '', fg = ok ? '#FFFFFF' : '#6B5442';
      T().boldText(ctx, S.name, b.x + b.w / 2, b.y + 30, 19, fg, ok ? undefined : 'rgba(0,0,0,0)');
      ctx.textAlign = 'center'; ctx.fillStyle = ok ? '#F3E8FF' : '#8C7B6B'; ctx.font = F(12, true);
      ctx.fillText(p.skillCd > 0 ? Math.ceil(p.skillCd) + ' 秒' : needRoom ? '进房间才能用' : p.id === 'bear' && p.squat ? '这趟用过了' : br || '就绪', b.x + b.w / 2, b.y + 56);
      ctx.font = F(11, true); ctx.fillText((this.touch ? '' : 'E · ') + 'Lv' + p.level + (p.level >= 3 ? ' 满级' : ' $' + Math.floor(p.xp) + '/' + A.LEVELS[p.level + 1]), b.x + b.w / 2, b.y + 78);
    }
    bossSkills() {
      const { ctx } = this, p = this.app.match.player;
      UI.bskill.forEach((b, i) => {
        const id = p.skills[i];
        if (!id) { T().chunky(ctx, b.x, b.y, b.w, b.h, 14, '#EDE6DC', { depth: 2, lineWidth: 2, outline: '#C9B8A6' }); ctx.fillStyle = '#A99A88'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText('第 ' + (i + 1) + ' 阶段解锁', b.x + b.w / 2, b.y + b.h / 2); return; }
        const S = A.BOSS_SKILLS[id], cd = p.skillCd[id] || 0, ok = cd <= 0 && p.anger >= S.cost && !(p.hr > 0) && !(p.waitT > 0), on = this.app.peekMode && id === 'peek';
        T().chunky(ctx, b.x, b.y, b.w, b.h, 14, on ? '#B79BEA' : ok ? BOSS_RED : '#EDE6DC', { depth: ok ? 4 : 2, lineWidth: 2 });
        if (cd > 0) { ctx.fillStyle = 'rgba(61,43,31,0.18)'; T().rr(ctx, b.x, b.y, b.w * cd / S.cd, b.h, 14); ctx.fill(); }
        ctx.textAlign = 'center'; ctx.fillStyle = ok || on ? '#FFFFFF' : '#6B5442'; ctx.font = F(16, true); ctx.fillText((this.touch ? '' : (i + 1) + ' ') + S.name, b.x + b.w / 2, b.y + 22);
        ctx.font = F(12, true); ctx.fillStyle = ok || on ? '#FFE9E6' : '#8C7B6B'; ctx.fillText(on ? '点一个房间' : cd > 0 ? Math.ceil(cd) + ' 秒' : '怒气 ' + S.cost, b.x + b.w / 2, b.y + 45);
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
      const { ctx } = this, m = this.app.match, p = m.player, boss = p.kind === 'boss';
      ctx.fillStyle = 'rgba(61,43,31,0.62)'; ctx.fillRect(0, 0, W, H);
      T().chunky(ctx, 18, 18, W - 36, H - 36, 26, '#FFFBF3', { depth: 7 });
      T().boldText(ctx, boss ? '你是老板' : '你是员工', W / 2, 62, 26, boss ? BOSS_RED : '#2E9E5B');
      if (boss) OS.sprites.drawBoss(ctx, W / 2, 170, 1.9, { t: this.time, vivid: true, outline: 3, look: Math.sin(this.time * 1.5) * 3 });
      else OS.sprites.drawAnimal(ctx, p.id, W / 2, 168, 2.1, { mood: 'slack', t: this.time });
      T().boldText(ctx, boss ? '狮子老板' : p.name + ' · 工位 ' + (p.desk.id + 1), W / 2, 238, 20, '#FFB52E');
      ctx.fillStyle = '#6B5442'; ctx.font = F(14, true); ctx.textAlign = 'center';
      this.wrap(boss ? '目标：抓摸鱼的人，收益越抓越多，超过所有员工就赢' : '目标：摸鱼赚钱，回自己工位存进去，存款最多的人赢', W / 2, 266, 440, 20);
      // 技能
      T().chunky(ctx, 40, 296, W - 80, 196, 16, '#FFFFFF', { depth: 3, lineWidth: 2 });
      ctx.textAlign = 'left';
      if (boss) {
        T().boldText(ctx, '技能（1 / 2 / 3）', 58, 322, 17, '#9B51E0', T().OUTLINE, 'left');
        ctx.fillStyle = '#6B5442'; ctx.font = F(13); let yy = this.wrap('一局分 3 个阶段，每阶段开头从 3 个技能里选 1 个，用怒气释放（每秒 +1，抓到 1 人 +10）。', 58, 352, W - 116, 20);
        ctx.fillStyle = '#8C6B4F'; this.wrap('可能出现：冲刺、监控、回马枪、突击检查、临时会议、加倍罚款', 58, yy + 6, W - 116, 20);
      } else {
        const S = A.EMP_SKILLS[p.id];
        T().boldText(ctx, '技能：' + S.name + (this.touch ? '' : '（E）'), 58, 322, 17, '#9B51E0', T().OUTLINE, 'left');
        ctx.fillStyle = '#4A3A2E'; ctx.font = F(13, true); let yy = this.wrap(A.EMP_SKILL_DESC[p.id], 58, 352, W - 116, 19);
        ctx.fillStyle = '#2E9E5B'; ctx.font = F(12, true); yy = this.wrap('存够 $' + A.LEVELS[2] + ' 升 Lv2 二选一：A ' + S.nameA + '（' + S.descA + '）', 58, yy + 6, W - 116, 18); yy = this.wrap('B ' + S.nameB + '（' + S.descB + '）', 58, yy, W - 116, 18);
      }
      // 小地图：四个房间的方向（屏幕越长画得越大）
      const d = H - 960, ms = 4.7 + d / 70; this.miniMap(W / 2 - 18 * ms, 506 + d * 0.1, ms, p);
      // 核心规则
      const rules = boss ? ['开局 5 秒后出现在办公区正中间；只看得到身边一块，走进房间那一刻就算查房', '进门要待满几秒、同一间要冷却才能再查；查空房会攒冒犯值，满了被 HR 约谈', '最后 30 秒下班冲刺：员工收入 ×2，你移动 ×1.3']
        : ['办公区是安全区；进房间才赚钱，但在里面看不到外面', '钱先进口袋，回工位才存入；连摸几间再存有加成（最多 ×1.8）', '被抓按待的时间没收口袋 20%～100%；红色名牌就是老板，小心！'];
      ctx.textAlign = 'left'; let ry = 506 + d * 0.1 + 33 * ms + 26;
      rules.forEach(l => { ctx.fillStyle = '#FFB52E'; ctx.font = F(14, true); ctx.fillText('●', 44, ry); ctx.fillStyle = '#4A3A2E'; ctx.font = F(13); ry = this.wrap(l, 62, ry, W - 110, 19) + 4; });
      if (prep) {
        const left = m.prepLeft, n = Math.ceil(left);
        if (left <= A.PREP.countdown) { const k = left - Math.floor(left); ctx.save(); ctx.translate(W / 2, UI.ready.y + 26); ctx.scale(1 + k * 0.4, 1 + k * 0.4); T().logo(ctx, String(n), 0, 0, 64, this.time); ctx.restore(); }
        else { this.btn(UI.ready, UI.ready.label + this.key('[空格]'), true, 19); ctx.fillStyle = '#8C6B4F'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText(n + ' 秒后自动开始', W / 2, UI.ready.y + 68); }
      } else { ctx.fillStyle = '#8C6B4F'; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText('点任意位置关闭', W / 2, UI.ready.y + 30); }
    }
    // 小地图（静态）：四个房间在哪个方向、自己的工位
    miniMap(x0, y0, s, p) {
      const { ctx } = this, m = this.app.match, g = m.grid;
      for (const k of g.cells) {
        const id = k.room || k.door; if (k.wall && !k.desk) continue;
        let f = '#FFF4E2'; if (id) f = RCOL(id).fill; if (k.stairs) f = '#D9CDBF'; if (k.desk) f = '#E6C9A3';
        ctx.fillStyle = f; ctx.fillRect(x0 + k.c * s, y0 + k.r * s, s + 0.4, s + 0.4);
      }
      for (const id of ['restroom', 'pantry', 'rooftop', 'meeting']) {
        const R = A.ROOMS[id], cs = g.roomCells(id), cx = cs.reduce((a, k) => a + k.c, 0) / cs.length + 0.5, cy = cs.reduce((a, k) => a + k.r, 0) / cs.length + 0.5;
        T().boldText(ctx, R.name, x0 + cx * s, y0 + cy * s, 11, R.slack ? RCOL(id).edge : '#B08D6F');
      }
      if (p.kind === 'employee') { const d = p.desk; ctx.save(); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 2.5; ctx.strokeRect(x0 + d.c * s - 2, y0 + d.r * s - 2, 2 * s + 4, s + 4); ctx.restore(); }
      else T().boldText(ctx, '★', x0 + A.BOSS_ARRIVE.x * s, y0 + A.BOSS_ARRIVE.y * s, 12, BOSS_RED);
    }
    // 弹出选择：老板阶段技能（3 选 1）/ 员工 2 级方向（2 选 1）；不暂停游戏，10 秒不选自动随机
    offerOverlay() {
      const { ctx } = this, m = this.app.match, p = m.player; if (m.phase !== 'playing') return;
      let title, cards, t;
      if (p.kind === 'boss' && m.offer) { t = m.offer.t; title = '第 ' + (m.offer.phase + 1) + ' 阶段：选一个新技能'; cards = m.offer.options.map(id => ({ name: A.BOSS_SKILLS[id].name, sub: '怒气 ' + A.BOSS_SKILLS[id].cost + (A.BOSS_SKILLS[id].cd ? ' · 冷却 ' + A.BOSS_SKILLS[id].cd + 's' : ''), desc: A.BOSS_SKILLS[id].desc })); }
      else if (p.kind === 'employee' && p.branchOffer) { const S = A.EMP_SKILLS[p.id]; t = p.branchOffer.t; title = '升到 Lv2：' + S.name + '选一个方向'; cards = [{ name: S.nameA, sub: '方向 A', desc: S.descA }, { name: S.nameB, sub: '方向 B', desc: S.descB }]; }
      else return;
      const R = A.offerRects(cards.length);
      ctx.fillStyle = 'rgba(61,43,31,0.55)'; ctx.fillRect(0, VY, W, VH);
      T().boldText(ctx, title + '（' + Math.ceil(t) + ' 秒）', W / 2, R[0].y - 34, 20, '#FFFFFF');
      cards.forEach((c, i) => {
        const r = R[i], hov = this.mouse && inside(r, this.mouse);
        T().chunky(ctx, r.x, r.y - (hov ? 3 : 0), r.w, r.h, 16, '#FFFBF3', { depth: hov ? 7 : 5, glow: hov ? 'rgba(255,190,40,0.8)' : null, glowBlur: 16 });
        T().boldText(ctx, (this.touch ? '' : (i + 1) + '  ') + c.name, r.x + 20, r.y + 26, 19, '#FFB52E', T().OUTLINE, 'left');
        ctx.fillStyle = '#9B51E0'; ctx.font = F(12, true); ctx.textAlign = 'right'; ctx.fillText(c.sub, r.x + r.w - 18, r.y + 26);
        ctx.fillStyle = '#6B5442'; ctx.font = F(13); ctx.textAlign = 'left'; this.wrap(c.desc, r.x + 20, r.y + 58, r.w - 40, 19);
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
    drawToasts(dt) {
      const { ctx } = this, room = this.cam && this.cam.room;
      this.toasts = this.toasts.filter(t => (t.t += dt) < 2.4);
      this.toasts.forEach((t, i) => {
        ctx.save(); ctx.globalAlpha = Math.min(1, (2.4 - t.t) * 3); ctx.font = F(15, true);
        const lines = []; let line = ''; for (const ch of t.text) { if (ctx.measureText(line + ch).width > W - 80 && line) { lines.push(line); line = ''; } line += ch; } lines.push(line);
        const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 36, h = 14 + lines.length * 20, y = this.app.screen === 'title' ? 60 + i * (h + 8) : BOT - 22 - h - (this.toasts.length - 1 - i) * (h + 8);   // 场景底部、按钮上方（越新的越靠下）
        T().chunky(ctx, W / 2 - w / 2, y - 16, w, h, 16, '#FFFFFF', { depth: 3, lineWidth: 2.5, outline: t.color }); ctx.fillStyle = t.color; ctx.textAlign = 'center';
        lines.forEach((l, j) => ctx.fillText(l, W / 2, y - 16 + 17 + j * 20)); ctx.restore();
      });
    }
    pauseOverlay() {
      const { ctx } = this; ctx.fillStyle = 'rgba(61,43,31,0.55)'; ctx.fillRect(0, 0, W, H);
      if (this.app.cardOpen) { this.identityCard(false); return; }
      const mid = Math.round((H - 960) / 2);
      T().chunky(ctx, 110, 220 + mid, 320, 480, 24, '#FFFBF3', { depth: 6 }); T().boldText(ctx, '暂停', W / 2, 272 + mid, 28, '#FFB52E');
      for (const id of ['resume', 'card', 'sound', 'restart', 'home']) this.btn(UI[id], id === 'sound' ? (this.app.muted ? '音效：关' : '音效：开') : UI[id].label, id === 'resume', 18);
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
    title() {
      const { ctx } = this, mid = Math.round((H - 960) / 2);
      for (let i = -20; i < 30; i++) { ctx.fillStyle = i % 2 ? '#F6E7D2' : '#F1DFC6'; ctx.beginPath(); const x = i * 40 + (this.time * 10) % 80; ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x - 400, H); ctx.lineTo(x - 440, H); ctx.fill(); }
      T().logo(ctx, '摸鱼大作战', W / 2, 150 + mid * 0.6, 52, this.time);
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(16, true); ctx.textAlign = 'center'; ctx.fillText('1 名老板 + 4 名员工 · 单人试玩版', W / 2, 214 + mid * 0.6);
      A.EMPLOYEE_IDS.forEach((id, i) => OS.sprites.drawAnimal(ctx, id, 80 + i * 76, 330 + mid * 0.8 + Math.sin(this.time * 3 + i) * 3, 1.3, { mood: 'slack', t: this.time + i }));
      OS.sprites.drawBoss(ctx, 452, 322 + mid * 0.8, 1.35, { t: this.time, vivid: true, outline: 2.5, look: Math.sin(this.time * 1.3) * 3 });
      ctx.fillStyle = '#6B5442'; ctx.font = F(14); ctx.textAlign = 'center';
      this.wrap('点开始后随机分配身份（1/5 概率当老板），其他角色由 AI 扮演。点哪走哪，按住拖动也能走。', W / 2, 410 + mid, W - 100, 22);
      ctx.fillStyle = '#A99A88'; ctx.font = F(12); ctx.fillText('电脑：点击 / WASD 移动，空格 出门或回工位，E / 1 2 3 放技能', W / 2, 470 + mid);
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(15, true); ctx.fillText('AI 老板难度', W / 2, 536 + mid);
      UI.diff.forEach(b => {
        const on = this.app.difficulty === b.id, hov = this.mouse && inside(b, this.mouse);
        T().chunky(ctx, b.x, b.y - (hov ? 2 : 0), b.w, b.h, 16, on ? ({ easy: '#7CD3A2', normal: '#FFB52E', hard: '#E8746A' })[b.id] : '#FFFFFF', { depth: on ? 4 : 2, lineWidth: 2 });
        if (on) T().boldText(ctx, A.DIFFICULTY[b.id].name, b.x + b.w / 2, b.y + b.h / 2 + 1, 18, '#FFFFFF');
        else { ctx.fillStyle = '#6B5442'; ctx.font = F(17, true); ctx.textAlign = 'center'; ctx.fillText(A.DIFFICULTY[b.id].name, b.x + b.w / 2, b.y + b.h / 2 + 1); }
      });
      ctx.fillStyle = '#A99A88'; ctx.font = F(13); ctx.textAlign = 'center';
      ctx.fillText({ easy: '老板随机查房', normal: '老板会记住看到你走进了哪扇门（偶尔记错）', hard: '老板在门口盯得紧，记得清清楚楚' }[this.app.difficulty], W / 2, 630 + mid);
      this.btn(UI.start, '开始', true, 24); this.btn(UI.back, UI.back.label, false, 16);
    }
  }
  A.Renderer = ArenaRenderer;
  A.layout(960);
})(typeof window !== 'undefined' ? window : globalThis);
