// 摸鱼大作战：画面（2D 俯视卡通，沿用闯关模式的动物、配色与描边风格）。
// 逻辑画布 960×540，地图 24×15 格、每格 36 像素，居中放在 x = 48。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};
  const T = () => OS.theme, C = () => OS.theme.C, F = (s, b) => OS.theme.font(s, b);
  const W = 960, H = 540, TS = 36, X0 = 48, Y0 = 0;
  const FLOOR = { office: '#FFF4E2', officeAlt: '#FBEBD3', boss: '#F6DCC8', stairs: '#D9CDBF' };
  const RCOL = id => (T().ROOM[id] || { fill: '#F6DCC8', edge: '#D8A98A' });

  // 界面按钮（逻辑坐标）
  const UI = {
    pause: { x: 872, y: 4, w: 80, h: 28, label: '暂停 P' },
    sound: { x: 784, y: 4, w: 80, h: 28 },
    action: { x: 688, y: 456, w: 232, h: 54 },
    skill: { x: 688, y: 398, w: 232, h: 50 },
    start: { x: 380, y: 392, w: 200, h: 54, label: '开始' },
    back: { x: 380, y: 460, w: 200, h: 44, label: '返回闯关模式' },
    resume: { x: 380, y: 230, w: 200, h: 48, label: '继续' },
    restart: { x: 380, y: 290, w: 200, h: 48, label: '重新开始' },
    home: { x: 380, y: 350, w: 200, h: 48, label: '返回首页' },
    again: { x: 290, y: 450, w: 180, h: 48, label: '再来一局' },
    home2: { x: 490, y: 450, w: 180, h: 48, label: '返回首页' },
    card: { x: 380, y: 410, w: 200, h: 48, label: '查看身份卡' },
    ready: { x: 380, y: 466, w: 200, h: 50, label: '准备好了 [空格]' },
  };
  UI.diff = ['easy', 'normal', 'hard'].map((id, i) => ({ id, x: 330 + i * 104, y: 326, w: 96, h: 38 }));   // 标题页：AI 老板难度
  UI.bskill = [0, 1, 2].map(i => ({ x: 688 + i * 80, y: 398, w: 72, h: 50 }));   // 老板最多 3 个技能
  // 阶段选技能 / 升级选方向的卡片
  A.offerRects = n => { const w = 176, h = 132, gap = 16, x0 = 480 - (n * w + (n - 1) * gap) / 2; return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y: 236, w, h })); };
  A.UI = UI;
  const inside = (b, p, pad) => { pad = pad || 0; return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad; };
  A.inside = inside;

  class ArenaRenderer {
    constructor(canvas, app) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.app = app;
      this.time = 0; this.toasts = []; this.floats = []; this.mouse = null; this.clickFx = null; this.cam = null;
    }
    pulse(p) { return 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 / p); }
    toast(text, color) { this.toasts.push({ text, t: 0, color: color || T().OUTLINE }); if (this.toasts.length > 3) this.toasts.shift(); }
    float(x, y, text, color) { this.floats.push({ x, y, text, color, t: 0 }); }
    // 世界坐标（格）↔ 屏幕坐标
    camera() {
      const m = this.app.match, p = m && m.player;
      const vr = p && (p.room || (p.kind === 'boss' && p.waitT > 0 ? 'boss' : null));   // 老板开局等待时在办公室里，也看不到外面
      if (vr && m.phase === 'playing') {   // 员工和老板进了房间都只看得到房间里面
        const cells = m.grid.cells.filter(k => k.room === vr || k.door === vr);
        const c0 = Math.min(...cells.map(k => k.c)), c1 = Math.max(...cells.map(k => k.c)) + 1, r0 = Math.min(...cells.map(k => k.r)), r1 = Math.max(...cells.map(k => k.r)) + 1;
        const bw = 600, bh = 290, s = Math.min(bw / (c1 - c0), bh / (r1 - r0), 2.4 * TS);
        return { s, ox: 40 + (bw - (c1 - c0) * s) / 2 - c0 * s + 8, oy: 104 + (bh - (r1 - r0) * s) / 2 - r0 * s, room: vr, box: [c0, r0, c1, r1] };
      }
      return { s: TS, ox: X0, oy: Y0, room: null };
    }
    toWorld(px, py) { const c = this.cam || this.camera(); return { x: (px - c.ox) / c.s, y: (py - c.oy) / c.s }; }
    sx(x) { return this.cam.ox + x * this.cam.s; }
    sy(y) { return this.cam.oy + y * this.cam.s; }

    draw(dt) {
      this.time += dt;
      const { ctx, canvas } = this, dpr = canvas.width / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'middle';
      ctx.fillStyle = '#EFE4D4'; ctx.fillRect(0, 0, W, H);
      const app = this.app;
      if (app.screen === 'title') { this.title(); this.drawToasts(dt); return; }
      this.cam = this.camera();
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const k = this.shake * 18; ctx.save(); ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); this.world(); ctx.restore(); }
      else this.world();
      if (this.cam.room) { if (this.app.match.player.kind === 'boss') this.bossRoomOverlay(); else this.roomOverlay(); }
      this.hud(); this.panel(); this.actionButton(); this.skillButtons();
      this.offerOverlay();
      this.rushHud(); this.arriveHud();
      this.drawFloats(dt); this.drawToasts(dt); this.drawBanner(dt);
      if (app.match.phase === 'prep') this.identityCard(true);
      if (app.paused) this.pauseOverlay();
      if (app.match.phase === 'over') this.result();
    }

    // 当前视角能不能看到某个房间里面：房间视角只看自己所在的房间；老板在办公区看不见房间里面（监控中的房间除外）
    canSee(roomId) {
      const m = this.app.match, p = m.player;
      if (this.cam.room) return roomId === this.cam.room;
      if (p.kind === 'boss') return !!(m.boss.peek && m.boss.peek.room === roomId);
      return true;
    }
    // —— 地图 ——
    world() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s, p = m.player;
      // 地板
      for (const k of g.cells) {
        const x = this.sx(k.c), y = this.sy(k.r);
        if (k.wall && !k.desk) continue;
        let fill = (k.c + k.r) % 2 ? FLOOR.office : FLOOR.officeAlt;
        const id = k.room || k.door;
        if (id === 'boss') fill = FLOOR.boss; else if (id) fill = RCOL(id).fill;
        if (k.stairs) fill = FLOOR.stairs;
        ctx.fillStyle = fill; ctx.fillRect(x, y, s + 0.5, s + 0.5);
        if (k.stairs) { ctx.strokeStyle = 'rgba(61,43,31,0.25)'; ctx.lineWidth = Math.max(1, s / 18); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + s * i / 4); ctx.lineTo(x + s, y + s * i / 4); ctx.stroke(); } }
      }
      // 房间道具
      this.roomDecor();
      // 墙：深色粗块 + 顶部高光
      for (const k of g.cells) if (k.wall && !k.desk) {
        const x = this.sx(k.c), y = this.sy(k.r);
        ctx.fillStyle = '#B98F6A'; ctx.fillRect(x, y, s + 0.5, s + 0.5);
        ctx.fillStyle = '#CFA77F'; ctx.fillRect(x, y, s + 0.5, s * 0.35);
      }
      // 墙与地板的分界描边
      ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = Math.max(2, s / 12); ctx.beginPath();
      for (const k of g.cells) if (k.wall && !k.desk) for (const [dc, dr, x1, y1, x2, y2] of [[0, -1, 0, 0, 1, 0], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1], [1, 0, 1, 0, 1, 1]]) {
        const n = g.at(k.c + dc, k.r + dr); if (n && (!n.wall || n.desk)) { ctx.moveTo(this.sx(k.c + x1), this.sy(k.r + y1)); ctx.lineTo(this.sx(k.c + x2), this.sy(k.r + y2)); }
      }
      ctx.stroke();
      this.doors(); this.roomBanners();
      // 工位
      for (const d of A.DESKS) this.desk(d);
      // 点击目标标记
      if (p.path.length && !this.cam.room) { const q = p.path[p.path.length - 1]; ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * this.pulse(0.8); ctx.strokeStyle = '#FFB52E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(this.sx(q.x), this.sy(q.y) + 4, 12, 6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      this.supplyLayer();
      // 角色（按 y 排序，靠下的画在前面）
      const list = m.actors.slice().sort((a, b) => a.y - b.y);
      for (const a of list) this.actor(a);
    }
    // 补给（看得见那个房间才画）+ 捡起读条
    supplyLayer() {
      const { ctx } = this, m = this.app.match, s = this.cam.s;
      for (const it of m.supplies) {
        if (!this.canSee(it.room)) continue;
        const x = this.sx(it.x), y = this.sy(it.y) - 4 * Math.sin(this.time * 4 + it.id), I = A.SUPPLY.items[it.kind], r = s * 0.32;
        ctx.save(); ctx.shadowColor = 'rgba(255,201,60,0.9)'; ctx.shadowBlur = 14; T().chunky(ctx, x - r, y - r, r * 2, r * 2, r * 0.4, '#FFF1B8', { depth: 2, lineWidth: 2 }); ctx.restore();
        T().boldText(ctx, { takeout: '饭', double: '×2', leave: '假', manual: '书' }[it.kind], x, y + 1, Math.round(r * 0.95), '#D9780A');
        ctx.font = F(10, true); const w = ctx.measureText(I.name).width + 10; T().chunky(ctx, x - w / 2, y + r + 3, w, 14, 7, '#FFFFFF', { depth: 1, lineWidth: 1.2 }); T().boldText(ctx, I.name, x, y + r + 10.5, 10, '#8C6B4F');
        if (it.prog > 0) { ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * it.prog / A.SUPPLY.pick); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 4; ctx.stroke(); }
      }
      // 老板监控中的房间：高亮
      const pk = m.boss.peek; if (pk && m.player.kind === 'boss' && !this.cam.room) {
        const cs = m.grid.cells.filter(k => k.room === pk.room), c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r)), c1 = Math.max(...cs.map(k => k.c)) + 1, r1 = Math.max(...cs.map(k => k.r)) + 1;
        ctx.save(); ctx.strokeStyle = 'rgba(155,81,224,' + (0.6 + 0.4 * this.pulse(0.6)) + ')'; ctx.lineWidth = 5; ctx.setLineDash([10, 6]); ctx.strokeRect(this.sx(c0) + 3, this.sy(r0) + 3, (c1 - c0) * s - 6, (r1 - r0) * s - 6); ctx.restore();
        const n = m.employees().filter(e => e.room === pk.room).length;
        this.chip(this.sx((c0 + c1) / 2), this.sy(r1) - 14, '监控中 ' + Math.ceil(pk.t) + 's · ' + (n ? n + ' 人' : '没人'), '#9B51E0');
      }
    }
    roomDecor() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s;
      const box = id => { const cs = g.cells.filter(k => k.room === id && !k.stairs); const c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r)); return { x: this.sx(c0), y: this.sy(r0), w: (Math.max(...cs.map(k => k.c)) + 1 - c0) * s, h: (Math.max(...cs.map(k => k.r)) + 1 - r0) * s }; };
      ctx.save();
      // 厕所：一个单间隔板
      let b = box('restroom'); ctx.fillStyle = '#B9D3EA'; T().rr(ctx, b.x + b.w * 0.08, b.y + b.h * 0.1, b.w * 0.3, b.h * 0.8, s * 0.15); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(b.x + b.w * 0.23, b.y + b.h * 0.42, s * 0.32, s * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7FA6C9'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#DCEBF7'; T().rr(ctx, b.x + b.w * 0.72, b.y + b.h * 0.15, b.w * 0.2, b.h * 0.35, s * 0.1); ctx.fill(); ctx.strokeStyle = '#9DBCD8'; ctx.stroke();
      // 茶水间：吧台 + 咖啡机
      b = box('pantry'); ctx.fillStyle = '#E9CF84'; ctx.fillRect(b.x + s * 0.2, b.y + s * 0.15, b.w - s * 0.4, s * 0.55);
      ctx.fillStyle = '#9C8CA8'; T().rr(ctx, b.x + b.w - s * 1.3, b.y + s * 0.05, s * 0.7, s * 0.6, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(b.x + s * 1.2, b.y + s * 0.42, s * 0.16, 0, Math.PI * 2); ctx.fill();
      // 天台：天空 + 栏杆 + 小云
      b = box('rooftop'); ctx.fillStyle = '#D4ECFA'; ctx.fillRect(b.x, b.y + b.h * 0.55, b.w, b.h * 0.45);
      const cx = b.x + s + ((this.time * 8) % (b.w - 2 * s));
      ctx.fillStyle = '#FFFFFF'; for (const [dx, dy, r] of [[0, 0, 0.25], [0.3, -0.08, 0.32], [0.62, 0.02, 0.22]]) { ctx.beginPath(); ctx.arc(cx + dx * s, b.y + b.h * 0.78 + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#7FAF62'; ctx.lineWidth = Math.max(2, s / 14);
      ctx.beginPath(); ctx.moveTo(b.x + 4, b.y + b.h - s * 0.15); ctx.lineTo(b.x + b.w - 4, b.y + b.h - s * 0.15); ctx.stroke();
      for (let i = 0; i <= 10; i++) { const x = b.x + 6 + i * (b.w - 12) / 10; ctx.beginPath(); ctx.moveTo(x, b.y + b.h - s * 0.15); ctx.lineTo(x, b.y + b.h - s * 0.5); ctx.stroke(); }
      ctx.fillStyle = '#C9A27E'; T().rr(ctx, b.x + s * 0.6, b.y + s * 0.3, s * 1.6, s * 0.5, 6); ctx.fill();   // 躺椅
      // 会议室：长桌 + 白板
      b = box('meeting'); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(b.x + b.w * 0.3, b.y + s * 0.12, b.w * 0.4, s * 0.45); ctx.strokeStyle = '#97CDB1'; ctx.lineWidth = 2; ctx.strokeRect(b.x + b.w * 0.3, b.y + s * 0.12, b.w * 0.4, s * 0.45);
      ctx.fillStyle = '#C9A27E'; T().rr(ctx, b.x + s * 0.8, b.y + b.h * 0.5, b.w - s * 1.6, s * 0.8, s * 0.3); ctx.fill();
      // 老板办公室：大办公桌
      b = box('boss'); ctx.fillStyle = '#A9764F'; T().rr(ctx, b.x + s * 0.4, b.y + s * 0.4, b.w - s * 0.8, s * 0.8, 6); ctx.fill();
      ctx.fillStyle = '#E8746A'; ctx.fillRect(b.x + b.w / 2 - s * 0.3, b.y + s * 0.55, s * 0.6, s * 0.12);
      ctx.restore();
    }
    // 门：自己的冷却 / 满员 / 禁止进入
    doors() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s, p = m.player;
      for (const k of g.cells) if (k.door) {
        const x = this.sx(k.c), y = this.sy(k.r), id = k.door, R = A.ROOMS[id];
        ctx.fillStyle = R.slack ? '#FFFFFF' : '#E7D6C6'; ctx.fillRect(x + s * 0.12, y + s * 0.1, s * 0.76, s * 0.8);
        ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.strokeRect(x + s * 0.12, y + s * 0.1, s * 0.76, s * 0.8);
      }
      if (this.cam.room) return;
      for (const id in m.locks) { const d = g.doors[id]; this.chip(this.sx(d.c + (id === 'rooftop' ? 0 : 0.5)), this.sy(d.r + 0.5) - (p.kind === 'boss' ? 0 : 22), '门锁着 ' + Math.ceil(m.locks[id].t) + 's', '#8F7CC4'); }
      if (p.kind === 'boss') {
        for (const id of A.SLACK_ROOMS) { const d = g.doors[id], x = this.sx(d.c + (id === 'rooftop' ? 0 : 0.5)), y = this.sy(d.r + 0.5);
          if (p.room === id) continue;   // 在里面时看右侧状态卡和按钮
          if (p.cooldowns[id] > 0) this.chip(x, y, '冷却 ' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88'); }
        return;
      }
      for (const id of A.SLACK_ROOMS) {
        const d = g.doors[id], why = p.room === id ? null : m.entryBlock(p, id), x = this.sx(d.c + (id === 'rooftop' ? 0 : 0.5)), y = this.sy(d.r + 0.5);   // 标签贴在门上（天台是两格宽的门）
        if (why === 'boss') this.chip(x, y, '老板在里面', C().coral);
        else if (why === 'cooldown') this.chip(x, y, '冷却 ' + Math.ceil(p.cooldowns[id]) + 's', '#A99A88');
        else if (why === 'full') this.chip(x, y, '满了', C().coral);
      }
    }
    chip(x, y, text, fill) { const { ctx } = this; ctx.font = F(11, true); const w = ctx.measureText(text).width + 14; T().chunky(ctx, x - w / 2, y - 10, w, 20, 10, fill, { depth: 2, lineWidth: 2 }); T().boldText(ctx, text, x, y + 0.5, 11, '#FFFFFF'); }
    roomBanners() {
      const { ctx } = this, m = this.app.match, g = m.grid, s = this.cam.s;
      for (const id of ['restroom', 'meeting', 'pantry', 'rooftop', 'boss']) {
        const R = A.ROOMS[id], cs = g.cells.filter(k => k.room === id && !k.stairs), c0 = Math.min(...cs.map(k => k.c)), r0 = Math.min(...cs.map(k => k.r));
        const lure = R.slack ? m.lure(id) : 1, lt = lure >= 1.05 ? ' ×' + lure.toFixed(1) : '';
        const text = !R.slack ? R.name : m.player.kind === 'boss' ? R.name + lt : R.name + ' ' + m.occupants(id).filter(e => e.kind === 'employee').length + '/' + R.cap + lt;   // 老板视角不显示人数；×N = 空房诱惑倍率
        ctx.font = F(12, true); const w = ctx.measureText(text).width + 16, x = this.sx(c0) + 6, y = this.sy(r0) + 6;
        T().chunky(ctx, x, y, w, 20, 10, '#FFFFFF', { depth: 2, lineWidth: 2 }); T().boldText(ctx, text, x + w / 2, y + 10.5, 12, R.slack ? RCOL(id).edge : '#B08D6F');
      }
    }
    desk(d) {
      const { ctx } = this, m = this.app.match, s = this.cam.s, p = m.player, own = p.desk === d;
      const owner = m.employees().find(e => e.desk === d), x = this.sx(d.c), y = this.sy(d.r), s2 = A.seatOf(d);
      const away = owner && !!owner.room; void s2;   // 老板视角：人不在办公区（去了某个房间）
      if (own && !this.cam.room) { ctx.save(); ctx.shadowColor = 'rgba(46,204,113,' + (0.6 + 0.4 * this.pulse(1.2)) + ')'; ctx.shadowBlur = 18; T().rr(ctx, x - 4, y - 4, s * 2 + 8, s * 2 + 8, 10); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
      T().chunky(ctx, x + 2, y + s * 0.15, s * 2 - 4, s * 0.75, 6, '#E6C9A3', { depth: 3, lineWidth: 2 });
      ctx.fillStyle = C().monitor || '#6B7A8F'; T().rr(ctx, x + s * 0.65, y + s * 0.05, s * 0.7, s * 0.45, 3); ctx.fill();
      ctx.fillStyle = C().screen || '#CFE6F5'; ctx.fillRect(x + s * 0.7, y + s * 0.1, s * 0.6, s * 0.32);
      ctx.fillStyle = '#9FCB82'; ctx.beginPath(); ctx.arc(x + s * 1.7, y + s * 0.35, s * 0.14, 0, Math.PI * 2); ctx.fill();
      // 椅子（座位）
      ctx.fillStyle = own ? '#BDEBCF' : '#D9C3A5'; T().rr(ctx, x + s * 0.65, y + s * 1.05, s * 0.7, s * 0.5, 5); ctx.fill();
      if (own) { const t = '我的工位'; ctx.font = F(10, true); const w = ctx.measureText(t).width + 12; T().chunky(ctx, x + s - w / 2, y + s * 1.62, w, 15, 7, '#2ECC71', { depth: 1, lineWidth: 1.5 }); T().boldText(ctx, t, x + s, y + s * 1.62 + 8, 10, '#FFFFFF'); }
      if (owner && owner.decoyT > 0 && away) {   // 猫的替身：老板看到"猫在工位"；员工看到半透明假身
        const st = A.seatOf(d), k = s / TS; ctx.save(); if (p.kind !== 'boss') ctx.globalAlpha = 0.45;
        OS.sprites.drawAnimal(ctx, owner.id, this.sx(st.x), this.sy(st.y) - 6 * k, 0.82 * k, { mood: 'work', t: this.time }); ctx.restore();
        if (p.kind !== 'boss') this.chip(this.sx(st.x), this.sy(st.y) - 40 * k, '替身', '#A99A88');
        return;
      }
      if (p.kind === 'boss' && away) {   // 老板视角：人不在办公区时，工位挂"XX · 不在"
        const t = owner.name + ' · 不在'; ctx.font = F(10, true); const w = ctx.measureText(t).width + 12;
        T().chunky(ctx, x + s - w / 2, y + s * 1.62, w, 15, 7, away ? '#FFE3DF' : '#FFFFFF', { depth: 1, lineWidth: 1.5, outline: away ? C().coral : T().OUTLINE });
        T().boldText(ctx, t, x + s, y + s * 1.62 + 8, 10, away ? C().coral : '#8C6B4F');
      }
    }
    actor(a) {
      const { ctx } = this, m = this.app.match, s = this.cam.s, k = s / TS, x = this.sx(a.x), y = this.sy(a.y), p = m.player;
      if (this.cam.room && (a.room || (a.kind === 'boss' && a.waitT > 0 ? 'boss' : null)) !== this.cam.room) return;   // 房间视角：只画房间里的人
      if (a.kind === 'employee' && a.room && !this.canSee(a.room)) return;   // 老板看不见房间里面（监控中的除外）
      if (a.kind === 'boss') {
        OS.sprites.drawBoss(ctx, x, y - 6 * k, 0.85 * k, { t: this.time, mood: a.hr > 0 ? 'read' : null, look: a.moving ? a.facing * 2 : Math.sin(this.time * 1.5) * 2 });
        const txt = a.waitT > 0 ? '准备中' : a.hr > 0 ? '被 HR 约谈中' : a.freezeT > 0 ? '开会中…' : a.stay > 0 ? '查房！' : a.dashT > 0 ? '冲刺！' : '巡视中', hot = (a.stay > 0 || a.dashT > 0) && !a.hr && !a.freezeT;
        ctx.font = F(Math.round(11 * Math.max(1, k * 0.8)), true); const w = ctx.measureText(txt).width + 14, h = 18 * Math.max(1, k * 0.8), ty = Math.max(38, y - 46 * k - h);   // 不被顶部 HUD 挡住
        T().chunky(ctx, x - w / 2, ty, w, h, h / 2, a.hr > 0 ? '#B7A6DD' : hot ? C().coral : '#FFFFFF', { depth: 2, lineWidth: 1.5 });
        T().boldText(ctx, txt, x, ty + h / 2 + 0.5, Math.round(11 * Math.max(1, k * 0.8)), a.hr > 0 || hot ? '#FFFFFF' : '#6B5442');
        if (a === p) T().boldText(ctx, '▼', x, ty - 10 - 4 * this.pulse(0.7), 14, '#FFC93C');
        if (a.hr > 0) { const cx = x + w / 2 + 10, cy = ty + h / 2; ctx.save(); ctx.translate(cx, cy); T().clock(ctx, 0, 0, 8); ctx.rotate(this.time * 4); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6); ctx.stroke(); ctx.restore(); }
        return;
      }
      const mood = a.stun > 0 ? 'caught' : a.moving ? 'walk' : a.room ? 'slack' : 'work';
      ctx.save(); if (a.facing < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      OS.sprites.drawAnimal(ctx, a.id, x, y - 6 * k, 0.82 * k, { mood, t: this.time + a.desk.id, prop: a.room === 'pantry' && !a.moving ? 'coffee' : a.room === 'restroom' && !a.moving ? 'phone' : null });
      ctx.restore();
      // 名字 / "我"标记
      const top = y - 34 * k;
      if (a.meetingT > 0) this.chip(x, top - 30 * k + 5, '开会中 ' + Math.ceil(a.meetingT) + 's', '#97CDB1');
      if (a === p) {   // 自己身上的状态
        const tags = [a.dashT > 0 && '冲刺', a.squat && '久蹲', a.doubleT > 0 && '×2 ' + Math.ceil(a.doubleT) + 's', a.leaveNote && '请假条', a.immuneT > 0 && '免抓 ' + Math.ceil(a.immuneT) + 's'].filter(Boolean);
        tags.forEach((t, i) => this.chip(x - 24 * k - 30, y - 18 * k + i * 22, t, '#2E9E5B'));
      }
      if (a.stun > 0) { const t = '训话中…'; ctx.font = F(11, true); const w = ctx.measureText(t).width + 14; T().chunky(ctx, x - w / 2, top - 30 * k - 4, w, 18, 9, C().coral, { depth: 2, lineWidth: 1.5 }); T().boldText(ctx, t, x, top - 30 * k + 5.5, 11, '#FFFFFF'); }
      if (a === p) { const b = 4 * this.pulse(0.7); T().boldText(ctx, '▼', x, top - 14 * k - b, 14 * k, '#FFC93C'); }
      ctx.font = F(Math.round(10 * Math.max(1, k * 0.8)), true); const nw = ctx.measureText(a.name).width + 10;
      T().chunky(ctx, x - nw / 2, top - 8 * k, nw, 15 * Math.max(1, k * 0.8), 7, a === p ? '#FFC93C' : '#FFFFFF', { depth: 1, lineWidth: 1.5 });
      T().boldText(ctx, a.name, x, top - 8 * k + 7.5 * Math.max(1, k * 0.8), Math.round(10 * Math.max(1, k * 0.8)), a === p ? '#FFFFFF' : '#6B5442');
      // 口袋里的钱（钱袋 + 金额；老板只看到钱袋和"?"，看不到金额）
      if (a.pocket >= 1) { const cm = A.comboMult(a.combo), t = p.kind === 'boss' ? '?' : '$' + Math.floor(a.pocket) + (cm > 1 ? ' ×' + cm.toFixed(1) : ''); ctx.font = F(11, true); const w = ctx.measureText(t).width + 26; T().chunky(ctx, x + 12 * k, y - 22 * k, w, 18, 9, '#FFF1D2', { depth: 2, lineWidth: 1.5 }); T().coin(ctx, x + 12 * k + 10, y - 22 * k + 9, 6); ctx.fillStyle = C().moneyDeep; ctx.textAlign = 'left'; ctx.fillText(t, x + 12 * k + 19, y - 22 * k + 9.5); }
    }

    // 房间视角：外面一片暗，看不到老板和其他人
    roomOverlay() {
      const { ctx } = this, m = this.app.match, p = m.player, [c0, r0, c1, r1] = this.cam.box, R = A.ROOMS[p.room];
      const x = this.sx(c0), y = this.sy(r0), w = this.sx(c1) - x, h = this.sy(r1) - y;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(x, y, w, h); ctx.fillStyle = '#4A3A2E'; ctx.fill('evenodd');
      ctx.lineWidth = 6; ctx.strokeStyle = T().OUTLINE; ctx.strokeRect(x, y, w, h); ctx.restore();
      // 顶部：在哪摸鱼、停留进度、当前收入
      const sk = p.squat ? p.squat.k : 1, maxS = R.maxStay * sk, t = p.roomTime, left = Math.max(0, maxS - t), rate = A.rate(p.room, t, sk), cell = m.grid.cellAt(p.x, p.y), lock = m.locks[p.room];
      const bossHere = m.boss.room === p.room;
      T().boldText(ctx, p.stun > 0 ? '被老板抓到了！训话中…' : bossHere ? '老板来了！' : '在' + R.name + '摸鱼中', 340, 50, 22, p.stun > 0 || bossHere ? '#FF8A7A' : '#FFFFFF');
      ctx.fillStyle = '#E8D9C6'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText(lock ? '门锁着（还剩 ' + Math.ceil(lock.t) + ' 秒），老板进不来' : '看不到外面，老板会不会来全凭运气', 340, 410);
      const bx = 140, by = 425, bw = 400; T().rr(ctx, bx, by, bw, 14, 7); ctx.fillStyle = '#6B5442'; ctx.fill();
      const k = Math.min(1, t / maxS); T().rr(ctx, bx, by, Math.max(14, bw * k), 14, 7); ctx.fillStyle = left < 4 ? C().coral : '#7CD3A2'; ctx.fill();
      T().rr(ctx, bx, by, bw, 14, 7); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.font = F(12, true); ctx.textAlign = 'left'; ctx.fillText(m.mustStay(p) ? '最少停留：还剩 ' + Math.ceil(A.ECON.minStay - t) + ' 秒' : left < 4 ? '腿快麻了… ' + Math.ceil(left) + ' 秒后自动出门' : '还能待 ' + Math.ceil(left) + ' 秒', bx, by + 30);
      ctx.textAlign = 'right'; ctx.fillStyle = cell && cell.stairs ? '#E8D9C6' : '#FFD46B'; const mul = p.lure * (p.doubleT > 0 ? 2 : 1) * (lock && lock.by === p.id ? lock.inc : 1);
      ctx.fillText(cell && cell.stairs ? '爬楼梯中，还没开始赚' : '收入 $' + (rate * mul).toFixed(1) + '/秒' + (t > R.rise * sk ? '（在下降）' : '（在上升）'), bx + bw, by + 30);
    }

    // 老板在房间里：同样看不到外面
    bossRoomOverlay() {
      const { ctx } = this, m = this.app.match, b = m.player, [c0, r0, c1, r1] = this.cam.box, R = A.ROOMS[this.cam.room];
      const x = this.sx(c0), y = this.sy(r0), w = this.sx(c1) - x, h = this.sy(r1) - y;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(x, y, w, h); ctx.fillStyle = '#4A3A2E'; ctx.fill('evenodd');
      ctx.lineWidth = 6; ctx.strokeStyle = T().OUTLINE; ctx.strokeRect(x, y, w, h); ctx.restore();
      if (this.cam.room === 'boss') {   // 开局等待：在办公室里，看不到员工往哪走
        T().boldText(ctx, '在老板办公室里', 340, 50, 22, '#FFFFFF');
        ctx.fillStyle = '#E8D9C6'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText('看不到外面，不知道员工去了哪 · 可以先选技能', 340, 410);
        T().boldText(ctx, Math.ceil(b.waitT) + ' 秒后出现在办公区正中间', 340, 446, 18, '#FFD46B');
        return;
      }
      T().boldText(ctx, '在' + R.name + '查房', 340, 50, 22, '#FFFFFF');
      ctx.fillStyle = '#E8D9C6'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText('在房间里看不到外面，不知道别人去了哪', 340, 410);
      const bx = 140, by = 425, bw = 400, k = b.hr > 0 ? 0 : 1 - b.stay / R.bossStay;
      T().rr(ctx, bx, by, bw, 14, 7); ctx.fillStyle = '#6B5442'; ctx.fill();
      T().rr(ctx, bx, by, Math.max(14, bw * k), 14, 7); ctx.fillStyle = b.stay > 0 ? '#F0A030' : '#7CD3A2'; ctx.fill();
      T().rr(ctx, bx, by, bw, 14, 7); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.font = F(12, true); ctx.textAlign = 'left';
      ctx.fillText(b.hr > 0 ? '被 HR 约谈中…' : b.stay > 0 ? '职场边界感：还要待 ' + Math.ceil(b.stay) + ' 秒' : '可以离开了（空格 / 点房间外）', bx, by + 30);
    }
    // —— 界面 ——
    hud() {
      const { ctx } = this, m = this.app.match, c = C();
      T().chunky(ctx, 8, 4, 132, 28, 14, '#FFB52E', { depth: 3, lineWidth: 2 }); T().boldText(ctx, '摸鱼大作战', 74, 18.5, 14, '#FFFFFF');
      const sec = Math.ceil(m.left), txt = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      T().chunky(ctx, 420, 4, 120, 28, 14, '#FFFFFF', { depth: 3, lineWidth: 2 }); T().clock(ctx, 440, 18, 8); ctx.fillStyle = sec <= 30 ? c.coral : c.time; ctx.font = F(16, true); ctx.textAlign = 'center'; ctx.fillText(txt, 490, 19);
      T().chunky(ctx, 300, 4, 110, 28, 14, '#FFFFFF', { depth: 3, lineWidth: 2 }); ctx.fillStyle = '#8F7CC4'; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText('第 ' + Math.max(1, m.phaseIdx + 1) + ' / ' + A.PHASE.count + ' 阶段', 355, 19);
      // 老板冒犯值（员工怨气）：过半老板变慢，满了触发投诉
      const b = m.boss, ov = b.offense / A.BOSS.offenseMax, mx = 560;
      T().chunky(ctx, mx, 4, 200, 28, 14, '#FFFFFF', { depth: 3, lineWidth: 2 });
      if (m.player.kind === 'employee' && m.player.room && b.room !== m.player.room) {   // 在房间里：冒犯值的跳动会暴露老板在查哪，不显示
        ctx.fillStyle = '#A99A88'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText('在房间里看不到老板', mx + 100, 18.5);
      } else {
      ctx.fillStyle = '#6B5442'; ctx.font = F(11, true); ctx.textAlign = 'left'; ctx.fillText(b.hr > 0 ? 'HR 约谈中' : '老板冒犯值', mx + 10, 18.5);
      const bx = mx + 82, bw = 106; T().rr(ctx, bx, 12, bw, 12, 6); ctx.fillStyle = '#EFE5D8'; ctx.fill();
      const v = b.hr > 0 ? b.hr / A.BOSS.hrTime : ov; if (v > 0) { T().rr(ctx, bx, 12, Math.max(12, bw * v), 12, 6); ctx.fillStyle = b.hr > 0 ? '#B7A6DD' : ov > A.BOSS.slowAt / 100 ? c.coral : '#F0A030'; ctx.fill(); }
      T().rr(ctx, bx, 12, bw, 12, 6); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#C9B8A6'; ctx.fillRect(bx + bw * A.BOSS.slowAt / 100 - 0.5, 12, 1.5, 12);
      }
      this.btn(UI.pause, this.app.paused ? '继续 P' : '暂停 P', false, 13);
      this.btn(UI.sound, this.app.muted ? '静音 M' : '音效 M', false, 13);
    }
    // 右侧墙面上的"我的状态"卡 + 左下排行
    panel() {
      const { ctx } = this, m = this.app.match, p = m.player, c = C();
      if (p.kind === 'boss') { this.bossPanel(); return; }   // 老板看不到员工收益榜
      const x = 700, y = 222, w = 208;
      T().chunky(ctx, x, y, w, 170, 14, '#FFFBF3', { depth: 4, lineWidth: 2.5 });
      ctx.beginPath(); ctx.arc(x + 24, y + 24, 15, 0, Math.PI * 2); ctx.fillStyle = (OS.sprites.SPEC[p.id] || {}).shirt || c.mint; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = T().OUTLINE; ctx.stroke();
      OS.sprites.drawAnimal(ctx, p.id, x + 24, y + 25, 0.7, { headOnly: true, mood: 'slack', t: this.time });
      ctx.textAlign = 'left'; ctx.fillStyle = T().OUTLINE; ctx.font = F(15, true); ctx.fillText(p.name + '（你）Lv' + p.level, x + 46, y + 17);
      const lazy = !p.room && p.officeTime > A.ECON.idleAfter;
      ctx.fillStyle = lazy ? c.coral : c.inkSoft; ctx.font = F(11, lazy); ctx.fillText(p.room ? '员工 · 把钱送回自己工位' : lazy ? '办公区工资降到 $' + A.ECON.idleWage + '/秒，去摸鱼吧' : '员工 · 办公区工资 $' + A.ECON.baseWage + '/秒', x + 46, y + 35);
      // 存款 / 口袋
      T().coin(ctx, x + 18, y + 60, 8); ctx.fillStyle = c.moneyDeep; ctx.font = F(15, true); ctx.fillText('存款 $' + Math.floor(p.banked), x + 32, y + 61);
      const cm = A.comboMult(p.combo), nx = A.comboMult(p.combo + 1);
      ctx.fillStyle = p.pocket >= 1 ? '#D9780A' : c.inkSoft; ctx.font = F(13, true); ctx.fillText('口袋 $' + Math.floor(p.pocket) + (cm > 1 ? ' · 连摸 ×' + cm.toFixed(1) : ''), x + 12, y + 84);
      if (p.pocket >= 1 && !p.room) { ctx.fillStyle = '#8C6B4F'; ctx.font = F(10, true); ctx.textAlign = 'right'; ctx.fillText(nx > cm ? '再摸一间 ×' + nx.toFixed(1) : '已封顶', x + w - 12, y + 84); ctx.textAlign = 'left'; }
      // 三个房间：我的冷却
      A.SLACK_ROOMS.forEach((id, i) => {
        const R = A.ROOMS[id], yy = y + 108 + i * 20, cd = p.cooldowns[id], occ = m.occupants(id).filter(e => e.kind === 'employee').length;
        ctx.fillStyle = RCOL(id).edge; T().rr(ctx, x + 12, yy - 7, 14, 14, 4); ctx.fill();
        ctx.fillStyle = T().OUTLINE; ctx.font = F(12, true); ctx.textAlign = 'left'; ctx.fillText(R.name, x + 32, yy + 0.5);
        ctx.textAlign = 'right'; ctx.font = F(12, true);
        // 在房间里看不到外面：别的房间只显示自己的冷却，不显示老板在哪、有没有人
        const blind = !!p.room, bossIn = !blind && m.boss.room === id;
        ctx.fillStyle = p.room === id ? '#2E9E5B' : bossIn ? c.coral : cd > 0 ? '#A99A88' : blind ? '#A99A88' : occ >= R.cap ? c.coral : '#2E9E5B';
        ctx.fillText(p.room === id ? '你在这里' : bossIn ? '老板在里面' : cd > 0 ? '冷却 ' + Math.ceil(cd) + 's' : blind ? '看不到' : occ >= R.cap ? '满了' : '可以去 · 峰值 $' + R.peak + '/s', x + w - 12, yy + 0.5);
      });
      this.ranking();
    }
    // 左下：排行（按存款）；房间视角里不显示，让出位置给停留进度
    ranking() {
      const { ctx } = this, m = this.app.match, p = m.player;
      if (this.cam.room) return;
      const L = m.ranking(); T().chunky(ctx, 56, 412, 196, 118, 14, '#FFFBF3', { depth: 4, lineWidth: 2.5 });
      ctx.textAlign = 'left'; ctx.fillStyle = T().OUTLINE; ctx.font = F(13, true); ctx.fillText('存款排行', 70, 428);
      L.forEach((e, i) => { const yy = 450 + i * 20; ctx.fillStyle = e === p ? '#D9780A' : '#6B5442'; ctx.font = F(12, e === p); ctx.textAlign = 'left'; ctx.fillText((i + 1) + '. ' + e.name + (e === p ? '（你）' : ''), 70, yy); ctx.textAlign = 'right'; ctx.fillText('$' + Math.floor(e.banked), 240, yy); });
    }
    bossPanel() {
      const { ctx } = this, m = this.app.match, b = m.player, c = C(), x = 700, y = 222, w = 208;
      T().chunky(ctx, x, y, w, 170, 14, '#FFFBF3', { depth: 4, lineWidth: 2.5 });
      ctx.beginPath(); ctx.arc(x + 24, y + 24, 15, 0, Math.PI * 2); ctx.fillStyle = '#5B6577'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = T().OUTLINE; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(x + 24, y + 24, 15, 0, Math.PI * 2); ctx.clip(); OS.sprites.drawBoss(ctx, x + 24, y + 38, 0.62, { t: this.time }); ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = T().OUTLINE; ctx.font = F(15, true); ctx.fillText('老板（你）', x + 46, y + 17);
      ctx.fillStyle = c.inkSoft; ctx.font = F(11); ctx.fillText('点房间查房 · 看不见房间里面', x + 46, y + 35);
      ctx.fillStyle = c.moneyDeep; ctx.font = F(14, true); ctx.fillText('收益 $' + Math.floor(m.bossScore()), x + 12, y + 60);
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(11); ctx.fillText('没收 $' + Math.floor(b.stats.confiscated) + ' · 下一次抓人 ×' + A.catchMult(b.stats.catches).toFixed(1), x + 12, y + 77);
      ctx.fillStyle = '#6B5442'; ctx.font = F(11, true); ctx.fillText('怒气', x + 12, y + 94);
      const ax = x + 42, aw = w - 90; T().rr(ctx, ax, y + 88, aw, 11, 5.5); ctx.fillStyle = '#EFE5D8'; ctx.fill();
      if (b.anger > 0) { T().rr(ctx, ax, y + 88, Math.max(11, aw * b.anger / A.ANGER.max), 11, 5.5); ctx.fillStyle = '#E8746A'; ctx.fill(); }
      T().rr(ctx, ax, y + 88, aw, 11, 5.5); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillStyle = '#6B5442'; ctx.fillText(Math.floor(b.anger) + ' · 抓 ' + b.stats.catches, x + w - 10, y + 94); ctx.textAlign = 'left';
      A.SLACK_ROOMS.forEach((id, i) => {
        const R = A.ROOMS[id], yy = y + 114 + i * 19, cd = b.cooldowns[id];
        ctx.fillStyle = RCOL(id).edge; T().rr(ctx, x + 12, yy - 7, 14, 14, 4); ctx.fill();
        ctx.fillStyle = T().OUTLINE; ctx.font = F(12, true); ctx.textAlign = 'left'; ctx.fillText(R.name, x + 32, yy + 0.5);
        ctx.textAlign = 'right'; ctx.fillStyle = b.room === id ? c.coral : cd > 0 ? '#A99A88' : '#2E9E5B';
        ctx.fillText(b.room === id ? (b.stay > 0 ? '查房中，还要待 ' + Math.ceil(b.stay) + 's' : '可以走了') : cd > 0 ? '冷却 ' + Math.ceil(cd) + 's' : this.cam.room ? '可以查 · 倍率看不到' : '可以查 · ×' + m.lure(id).toFixed(1), x + w - 12, yy + 0.5);   // 在房间里看不到别的门牌
      });
    }
    // 右下角大按钮（手机主要操作）：在房间里 = 出门；在外面 = 回工位
    actionButton() {
      const m = this.app.match, p = m.player; if (m.phase !== 'playing') return;
      if (p.kind === 'boss') {
        const lab = p.hr > 0 ? '被 HR 约谈中…' : p.room ? (p.stay > 0 ? '查房中 ' + Math.ceil(p.stay) + 's' : '离开房间 [空格]') : '点房间去查房';
        this.btn(UI.action, lab, !!p.room && p.stay <= 0 && !p.hr, 20, !p.room || p.stay > 0 || p.hr > 0); return;
      }
      const wait = m.mustStay(p), atDesk = !p.room && Math.hypot(p.x - A.seatOf(p.desk).x, p.y - A.seatOf(p.desk).y) <= A.ECON.depositRange;
      const label = p.forced ? '自动出门中…' : wait ? '还要待 ' + Math.ceil(A.ECON.minStay - p.roomTime) + ' 秒' : p.room ? '出门  [空格]' : p.pocket >= 1 ? (atDesk ? '存钱 $' : '回工位存 $') + Math.floor(p.pocket) + ' [空格]' : '回工位  [空格]';
      const hot = !p.forced && !wait && (p.room ? p.roomTime > A.ROOMS[p.room].rise : p.pocket >= 1);
      this.btn(UI.action, label, hot, p.pocket >= 1 && !p.room ? 18 : 20, p.forced || wait);
    }
    // 技能按钮：员工 1 个（E），老板最多 3 个（1/2/3）
    skillButtons() {
      const { ctx } = this, m = this.app.match, p = m.player; if (m.phase !== 'playing') return;
      if (p.kind === 'employee') {
        const S = A.EMP_SKILLS[p.id], P = A.empSkill(p), b = UI.skill, needRoom = S.where === 'room' && !p.room;
        const br = p.branch ? (p.branch === 'A' ? S.nameA : S.nameB) : '';
        const ok = p.skillCd <= 0 && !needRoom && !m.busy(p) && !(p.id === 'bear' && p.squat);
        this.btn(b, '', ok, 15, !ok);
        ctx.textAlign = 'left'; ctx.fillStyle = ok ? '#FFFFFF' : '#6B5442'; ctx.font = F(15, true); ctx.fillText('E  ' + S.name + (br ? '·' + br : ''), b.x + 14, b.y + 17);
        ctx.font = F(11, true); ctx.fillStyle = ok ? '#FFF3D6' : '#8C7B6B';
        ctx.fillText(p.skillCd > 0 ? '冷却 ' + Math.ceil(p.skillCd) + ' 秒' : needRoom ? '进了房间才能用' : p.id === 'bear' && p.squat ? '这一趟已经用了' : '就绪', b.x + 14, b.y + 36);
        ctx.textAlign = 'right'; ctx.fillStyle = ok ? '#FFFFFF' : '#8C6B4F'; ctx.font = F(12, true);
        ctx.fillText('Lv' + p.level, b.x + b.w - 12, b.y + 17);
        ctx.font = F(10, true); ctx.fillText(p.level >= 3 ? '满级' : '升级 $' + Math.floor(p.xp) + '/' + A.LEVELS[p.level + 1], b.x + b.w - 12, b.y + 36);
        if (p.skillCd > 0) { const k = p.skillCd / P.cd; ctx.fillStyle = 'rgba(61,43,31,0.18)'; T().rr(ctx, b.x, b.y, b.w * k, b.h, 12); ctx.fill(); }
        return;
      }
      UI.bskill.forEach((b, i) => {
        const id = p.skills[i];
        if (!id) { T().chunky(ctx, b.x, b.y, b.w, b.h, 12, '#EDE6DC', { depth: 2, lineWidth: 2, outline: '#C9B8A6' }); ctx.fillStyle = '#A99A88'; ctx.font = F(10, true); ctx.textAlign = 'center'; ctx.fillText('第 ' + (i + 1) + ' 阶段', b.x + b.w / 2, b.y + 18); ctx.fillText('解锁', b.x + b.w / 2, b.y + 33); return; }
        const S = A.BOSS_SKILLS[id], cd = p.skillCd[id] || 0, ok = cd <= 0 && p.anger >= S.cost && !(p.hr > 0), on = this.app.peekMode && id === 'peek';
        T().chunky(ctx, b.x, b.y, b.w, b.h, 12, on ? '#B79BEA' : ok ? '#E8746A' : '#EDE6DC', { depth: ok ? 4 : 2, lineWidth: 2 });
        if (cd > 0) { ctx.fillStyle = 'rgba(61,43,31,0.18)'; T().rr(ctx, b.x, b.y, b.w * cd / S.cd, b.h, 12); ctx.fill(); }
        ctx.textAlign = 'center'; ctx.fillStyle = ok || on ? '#FFFFFF' : '#6B5442'; ctx.font = F(13, true); ctx.fillText((i + 1) + ' ' + S.name, b.x + b.w / 2, b.y + 18);
        ctx.font = F(10, true); ctx.fillStyle = ok || on ? '#FFF3D6' : '#8C7B6B'; ctx.fillText(on ? '点一个房间' : cd > 0 ? Math.ceil(cd) + 's' : '怒气 ' + S.cost, b.x + b.w / 2, b.y + 35);
      });
    }
    // 屏幕中央的大字（开始摸鱼！/ 下班冲刺！）
    banner(text) { this.big = { text, t: 0 }; }
    drawBanner(dt) {
      const b = this.big; if (!b) return; b.t += dt; if (b.t > 1.6) { this.big = null; return; }
      const { ctx } = this, k = Math.min(1, b.t / 0.2), out = Math.max(0, (b.t - 1.2) / 0.4);
      ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(340, 210); ctx.scale(0.6 + 0.4 * k + 0.15 * Math.sin(k * Math.PI), 0.6 + 0.4 * k + 0.15 * Math.sin(k * Math.PI));
      T().logo(ctx, b.text, 0, 0, 52, this.time); ctx.restore();
    }
    // 开局：员工视角屏幕中间显示"老板还有 N 秒到达"
    arriveHud() {
      const m = this.app.match, b = m.boss; if (m.phase !== 'playing' || !(b.waitT > 0) || m.player.kind === 'boss') return;
      const { ctx } = this, k = this.pulse(0.8);
      ctx.save(); ctx.translate(this.cam.room ? 340 : 480, this.cam.room ? 84 : 150); ctx.scale(1 + 0.04 * k, 1 + 0.04 * k);
      T().chunky(ctx, -120, -22, 240, 44, 22, '#FFFFFF', { depth: 4, lineWidth: 2.5, glow: 'rgba(232,116,106,' + (0.35 + 0.4 * k) + ')', glowBlur: 14 });
      T().boldText(ctx, '老板还有 ' + Math.ceil(b.waitT) + ' 秒到达', 0, 1, 20, '#E8746A'); ctx.restore();
    }
    // 下班冲刺：计时器下方的红色标签（跳动）
    rushHud() {
      const m = this.app.match; if (!m.rush || m.phase !== 'playing') return;
      const { ctx } = this, k = this.pulse(0.6);
      ctx.save(); ctx.translate(480, 46); ctx.scale(1 + 0.06 * k, 1 + 0.06 * k);
      T().chunky(ctx, -84, -11, 168, 22, 11, '#E8746A', { depth: 2, lineWidth: 2, glow: 'rgba(232,116,106,' + (0.4 + 0.5 * k) + ')', glowBlur: 12 });
      T().boldText(ctx, m.player.kind === 'boss' ? '下班冲刺 · 移动 ×1.3' : '下班冲刺 · 收入 ×2', 0, 0.5, 12, '#FFFFFF'); ctx.restore();
    }
    // 身份卡：开局准备阶段（带倒计时和"准备好了"），暂停菜单里也能再看
    identityCard(prep) {
      const { ctx } = this, m = this.app.match, p = m.player, boss = p.kind === 'boss', c = C();
      ctx.fillStyle = 'rgba(61,43,31,0.62)'; ctx.fillRect(0, 0, W, H);
      T().chunky(ctx, 70, 24, 820, 492, 26, '#FFFBF3', { depth: 7 });
      // 左：身份
      T().chunky(ctx, 96, 50, 230, 250, 20, boss ? '#F3EEF9' : '#EFFFF4', { depth: 4, lineWidth: 2.5 });
      T().boldText(ctx, boss ? '你是老板' : '你是员工', 211, 74, 22, boss ? '#8F7CC4' : '#2E9E5B');
      if (boss) OS.sprites.drawBoss(ctx, 211, 182, 1.85, { t: this.time, look: Math.sin(this.time * 1.5) * 3 });
      else OS.sprites.drawAnimal(ctx, p.id, 211, 186, 2.0, { mood: 'slack', t: this.time });
      T().boldText(ctx, boss ? '狮子老板' : p.name, 211, 242, 20, '#FFB52E');
      ctx.fillStyle = '#6B5442'; ctx.font = F(12, true); ctx.textAlign = 'center';
      this.wrap(boss ? '目标：抓人收益越抓越多（×1→×1.3），超过所有员工就赢' : '目标：把钱送回自己的工位，存款最多的人赢', 211, 266, 200, 17);
      // 中：技能
      ctx.textAlign = 'left'; T().boldText(ctx, '技能', 352, 64, 18, '#9B51E0', T().OUTLINE, 'left');
      ctx.fillStyle = '#6B5442'; ctx.font = F(12);
      if (boss) {
        ctx.fillStyle = '#E8746A'; ctx.font = F(13, true); ctx.fillText('怒气：每秒 +1，抓到 1 人 +10', 352, 94);
        ctx.fillStyle = '#6B5442'; ctx.font = F(12); ctx.textAlign = 'left';
        ['一局分 3 个阶段（每 80 秒），每阶段开头', '从 3 个技能里选 1 个，最多 3 个；', '按 1 / 2 / 3 或点右下按钮释放（消耗怒气）。', '可能出现：冲刺、监控、回马枪、', '突击检查、临时会议、加倍罚款'].forEach((l, i) => ctx.fillText(l, 352, 118 + i * 20));
      } else {
        const S = A.EMP_SKILLS[p.id], MW = 272;   // 文字限制在中间一栏，不压到右边的小地图
        ctx.fillStyle = '#9B51E0'; ctx.font = F(15, true); ctx.fillText('E  ' + S.name, 352, 92);
        ctx.font = F(12, true); let yy = this.wrap(A.EMP_SKILL_DESC[p.id], 352, 114, MW, 17);
        ctx.fillStyle = '#6B5442'; ctx.font = F(12); yy = this.wrap('存够 $' + A.LEVELS[2] + ' 升 Lv2，二选一：', 352, yy + 6, MW, 17);
        ctx.fillStyle = '#2E9E5B'; ctx.font = F(12, true); yy = this.wrap('A ' + S.nameA + '：' + S.descA, 352, yy, MW, 17); yy = this.wrap('B ' + S.nameB + '：' + S.descB, 352, yy, MW, 17);
        ctx.fillStyle = '#6B5442'; ctx.font = F(12); this.wrap('存够 $' + A.LEVELS[3] + ' 升 Lv3，强化所选方向', 352, yy + 4, MW, 17);
      }
      // 右：小地图
      this.miniMap(640, 56, 9.6, p);
      // 下：核心规则
      const rules = boss ? ['开局在办公室等 5 秒（看不见外面），然后直接出现在办公区正中间；走进房间那一刻就算查房', '职场边界感：进门要待满几秒，同一个房间要冷却一会儿才能再查', '查空房冒犯值涨得多；冒犯值满了会被 HR 约谈 10 秒', '最后 30 秒下班冲刺：员工收入 ×2，你也移动 ×1.3']
        : ['开局老板 5 秒后才出现在办公区正中间；办公区是安全区，进了房间才赚钱，但看不到外面', '钱先进口袋，回自己工位才存入；连着摸几间再存，有连摸加成（最多 ×1.8）', '被抓时按在这间待的时间没收口袋（20%～100%）；房间有停留上限和冷却', '最后 30 秒下班冲刺：房间收入 ×2，老板也会加速'];
      T().chunky(ctx, 96, 318, 768, 132, 16, '#FFFFFF', { depth: 3, lineWidth: 2 });
      ctx.textAlign = 'left'; rules.forEach((l, i) => { ctx.fillStyle = '#FFB52E'; ctx.font = F(14, true); ctx.fillText('●', 114, 344 + i * 28); ctx.fillStyle = '#4A3A2E'; ctx.font = F(13); ctx.fillText(l, 134, 344 + i * 28); });
      if (prep) {
        const left = m.prepLeft, n = Math.ceil(left);
        if (left <= A.PREP.countdown) { const k = left - Math.floor(left); ctx.save(); ctx.translate(480, 272); ctx.scale(1 + k * 0.5, 1 + k * 0.5); T().logo(ctx, String(n), 0, 0, 90, this.time); ctx.restore(); }
        else { this.btn(UI.ready, UI.ready.label, true, 17); ctx.fillStyle = '#8C6B4F'; ctx.font = F(12, true); ctx.textAlign = 'right'; ctx.fillText(n + ' 秒后自动开始', 860, 492); }
      } else { ctx.fillStyle = '#8C6B4F'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText('点任意位置关闭', 480, 490); }
    }
    // 小地图：房间颜色、容量与峰值，自己的工位高亮
    miniMap(x0, y0, s, p) {
      const { ctx } = this, m = this.app.match, g = m.grid;
      for (const k of g.cells) {
        const id = k.room || k.door; let f = k.wall ? '#B98F6A' : '#FFF4E2';
        if (id === 'boss') f = '#F6DCC8'; else if (id) f = RCOL(id).fill; if (k.stairs) f = '#D9CDBF'; if (k.desk) f = '#E6C9A3';
        ctx.fillStyle = f; ctx.fillRect(x0 + k.c * s, y0 + k.r * s, s + 0.4, s + 0.4);
      }
      ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, g.cols * s, g.rows * s);
      for (const id of A.SLACK_ROOMS) {
        const R = A.ROOMS[id], cs = g.roomCells(id), cx = cs.reduce((a, k) => a + k.c, 0) / cs.length + 0.5, cy = Math.min(cs.reduce((a, k) => a + k.r, 0) / cs.length + 0.5, g.rows - 1.4);   // 不超出地图下边
        T().boldText(ctx, R.name, x0 + cx * s, y0 + cy * s - 6, 12, RCOL(id).edge);
        ctx.fillStyle = '#6B5442'; ctx.font = F(9, true); ctx.textAlign = 'center'; ctx.fillText(R.cap + ' 人 · $' + R.peak + '/s', x0 + cx * s, y0 + cy * s + 8);
      }
      if (p.kind === 'employee') { const d = p.desk; ctx.save(); ctx.strokeStyle = '#2ECC71'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(46,204,113,0.8)'; ctx.shadowBlur = 8 + 6 * this.pulse(1); ctx.strokeRect(x0 + d.c * s - 2, y0 + d.r * s - 2, 2 * s + 4, 2 * s + 4); ctx.restore(); T().boldText(ctx, '我的工位', x0 + (d.c + 1) * s, y0 + (d.r + 2.6) * s, 10, '#2ECC71'); }
      else { T().boldText(ctx, '你从这里出发', x0 + 2.5 * s, y0 + 9.6 * s, 10, '#8F7CC4'); }
    }
    // 弹出选择：老板阶段技能（3 选 1）/ 员工 2 级方向（2 选 1）；不暂停游戏，10 秒不选自动随机
    offerOverlay() {
      const { ctx } = this, m = this.app.match, p = m.player; if (m.phase !== 'playing') return;
      let title, cards, t;
      if (p.kind === 'boss' && m.offer) { t = m.offer.t; title = '第 ' + (m.offer.phase + 1) + ' 阶段：选一个新技能'; cards = m.offer.options.map(id => ({ name: A.BOSS_SKILLS[id].name, sub: '怒气 ' + A.BOSS_SKILLS[id].cost + (A.BOSS_SKILLS[id].cd ? ' · 冷却 ' + A.BOSS_SKILLS[id].cd + 's' : ''), desc: A.BOSS_SKILLS[id].desc })); }
      else if (p.kind === 'employee' && p.branchOffer) { const S = A.EMP_SKILLS[p.id]; t = p.branchOffer.t; title = '升到 Lv2：' + S.name + '选一个方向'; cards = [{ name: S.nameA, sub: '方向 A', desc: S.descA }, { name: S.nameB, sub: '方向 B', desc: S.descB }]; }
      else return;
      const R = A.offerRects(cards.length);
      ctx.fillStyle = 'rgba(61,43,31,0.35)'; ctx.fillRect(0, 190, W, 220);   // 放在提示条下面，不被挡住
      T().boldText(ctx, title + '（' + Math.ceil(t) + ' 秒）', 480, 214, 20, '#FFFFFF');
      cards.forEach((c, i) => {
        const r = R[i], hov = this.mouse && inside(r, this.mouse);
        T().chunky(ctx, r.x, r.y - (hov ? 3 : 0), r.w, r.h, 16, '#FFFBF3', { depth: hov ? 7 : 5, glow: hov ? 'rgba(255,190,40,0.8)' : null, glowBlur: 16 });
        T().boldText(ctx, (i + 1) + '  ' + c.name, r.x + r.w / 2, r.y + 24, 17, '#FFB52E');
        ctx.fillStyle = '#9B51E0'; ctx.font = F(11, true); ctx.textAlign = 'center'; ctx.fillText(c.sub, r.x + r.w / 2, r.y + 46);
        ctx.fillStyle = '#6B5442'; ctx.font = F(12); this.wrap(c.desc, r.x + r.w / 2, r.y + 68, r.w - 20, 17);
      });
    }
    wrap(text, cx, y, maxW, lh) {
      const { ctx } = this; let line = '', yy = y;
      for (const ch of text) { if (ctx.measureText(line + ch).width > maxW && line) { ctx.fillText(line, cx, yy); line = ''; yy += lh; } line += ch; }
      if (line) ctx.fillText(line, cx, yy);
      return yy + lh;   // 下一行的 y
    }
    btn(b, label, hot, size, disabled) {
      const { ctx } = this, hov = this.mouse && inside(b, this.mouse) && !disabled, lift = hov ? 2 : 0;
      T().chunky(ctx, b.x, b.y - lift, b.w, b.h, Math.min(16, b.h / 2), disabled ? '#D8CCBC' : hot ? '#FFB52E' : '#FFFFFF', { depth: (b.h > 40 ? 5 : 3) + lift, glow: hot ? 'rgba(255,190,40,' + (0.5 + 0.4 * this.pulse(0.9)) + ')' : null, glowBlur: 16, lineWidth: b.h > 40 ? 3 : 2 });
      if (hot) T().boldText(ctx, label, b.x + b.w / 2, b.y + b.h / 2 - lift + 1, size || 16, '#FFFFFF');
      else { ctx.fillStyle = disabled ? '#8C7B6B' : T().OUTLINE; ctx.font = F(size || 16, true); ctx.textAlign = 'center'; ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 - lift + 1); }
    }
    drawFloats(dt) {
      const { ctx } = this;
      this.floats = this.floats.filter(f => (f.t += dt) < 1.4);
      for (const f of this.floats) { ctx.save(); ctx.globalAlpha = Math.min(1, (1.4 - f.t) * 2); T().boldText(ctx, f.text, f.x, f.y - f.t * 30, 18, f.color || '#FFC93C'); ctx.restore(); }
    }
    drawToasts(dt) {
      const { ctx } = this;
      this.toasts = this.toasts.filter(t => (t.t += dt) < 2.4);
      this.toasts.forEach((t, i) => {
        ctx.save(); ctx.globalAlpha = Math.min(1, (2.4 - t.t) * 3); ctx.font = F(15, true); const w = ctx.measureText(t.text).width + 36, y = (this.cam && this.cam.room ? 488 : 78) + i * 40;
        T().chunky(ctx, 340 - w / 2, y - 16, w, 32, 16, '#FFFFFF', { depth: 3, lineWidth: 2.5, outline: t.color }); ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.fillText(t.text, 340, y + 1); ctx.restore();
      });
    }
    pauseOverlay() {
      const { ctx } = this; ctx.fillStyle = 'rgba(61,43,31,0.55)'; ctx.fillRect(0, 0, W, H);
      if (this.app.cardOpen) { this.identityCard(false); return; }
      T().chunky(ctx, 340, 150, 280, 330, 22, '#FFFBF3', { depth: 6 }); T().boldText(ctx, '暂停', 480, 192, 26, '#FFB52E');
      for (const id of ['resume', 'restart', 'home', 'card']) this.btn(UI[id], UI[id].label, id === 'resume', 17);
    }
    // 结算：5 人统一排名逐行揭晓，然后逐个弹出称号
    result() {
      const { ctx } = this, m = this.app.match, p = m.player, L = m.finalRanking(), top = L[0].a, bs = m.boss.stats;
      if (this.overAt == null || this.overMatch !== m) { this.overAt = this.time; this.overMatch = m; }
      const t = this.time - this.overAt, shown = Math.min(5, Math.floor(t / 0.25) + 1);
      ctx.fillStyle = 'rgba(61,43,31,0.6)'; ctx.fillRect(0, 0, W, H);
      T().chunky(ctx, 220, 18, 520, 506, 24, '#FFFBF3', { depth: 7 });
      const head = top === p ? (p.kind === 'boss' ? '老板胜利！' : '摸鱼之王！') : top.kind === 'boss' ? '老板赢了' : p.kind === 'boss' ? '员工赢了' : top.name + ' 赢了';
      T().logo(ctx, head, 480, 54, 30, this.time);
      L.slice(0, shown).forEach((r, i) => {
        const e = r.a, y = 104 + i * 42, me = e === p, boss = e.kind === 'boss';
        T().chunky(ctx, 250, y - 17, 460, 36, 12, me ? '#FFF1D2' : boss ? '#F3EEF9' : '#FFFFFF', { depth: 3, lineWidth: 2, outline: me ? '#FFB52E' : T().OUTLINE });
        T().boldText(ctx, String(i + 1), 272, y + 1, 17, i === 0 ? '#FFC93C' : '#C9A882');
        if (boss) { ctx.save(); ctx.beginPath(); ctx.arc(306, y + 1, 13, 0, Math.PI * 2); ctx.clip(); OS.sprites.drawBoss(ctx, 306, y + 13, 0.55, { t: this.time }); ctx.restore(); }
        else OS.sprites.drawAnimal(ctx, e.id, 306, y + 2, 0.62, { headOnly: true, mood: i === 0 ? 'slack' : 'work', t: this.time });
        ctx.textAlign = 'left'; ctx.fillStyle = T().OUTLINE; ctx.font = F(14, true); const nm = e.name + (me ? '（你）' : ''); ctx.fillText(nm, 328, y + 1);
        const sub = boss ? '没收 $' + Math.floor(bs.confiscated) + ' · 抓到 ' + bs.catches + ' 人次' : (e.personality ? 'AI · ' + A.PERSONALITIES[e.personality].name + ' · ' : '') + 'Lv' + e.level;
        ctx.fillStyle = '#A99A88'; ctx.font = F(11); ctx.fillText(sub, 328 + ctx.measureText(nm).width * 1.3 + 8, y + 2);
        ctx.textAlign = 'right'; ctx.fillStyle = boss ? '#8F7CC4' : C().moneyDeep; ctx.font = F(14, true); ctx.fillText('$' + Math.floor(r.score), 692, y + 1);
      });
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(11); ctx.textAlign = 'center';
      ctx.fillText('本局：查房 ' + bs.checks + ' 次 · 抓到 ' + bs.catches + ' 人次 · 补给出现 ' + m.stats.supplies + ' 个、被捡 ' + m.stats.picks + ' 个', 480, 312);
      ctx.fillText('老板收益 = 每次没收 × 当次倍数（×1 → ×1.1 → ×1.2 → ×1.3）· 口袋里没送回工位的钱不算成绩', 480, 328);
      // 称号：排名揭晓后逐个弹出
      const aw = m.awards(), t0 = 5 * 0.25 + 0.3;
      aw.forEach((w, i) => {
        const k = Math.max(0, Math.min(1, (t - t0 - i * 0.35) / 0.25)); if (!k) return;
        const col = i % 2, row = Math.floor(i / 2), x = 254 + col * 230, y = 342 + row * 50, sc = 0.6 + 0.4 * k + 0.08 * Math.sin(k * Math.PI);
        ctx.save(); ctx.globalAlpha = k; ctx.translate(x + 111, y + 22); ctx.scale(sc, sc); ctx.rotate((col ? 1 : -1) * 0.02);
        T().chunky(ctx, -111, -22, 222, 44, 12, '#FFF6DC', { depth: 3, lineWidth: 2, outline: '#E3A51E' });
        T().boldText(ctx, w.title, -100, -8, 14, '#E8890C', T().OUTLINE, 'left');
        ctx.textAlign = 'left'; ctx.fillStyle = '#6B5442'; ctx.font = F(11); ctx.fillText(w.name + ' · ' + w.text, -100, 12);
        ctx.restore();
      });
      if (!aw.length && t > t0) { ctx.fillStyle = '#A99A88'; ctx.font = F(12); ctx.textAlign = 'center'; ctx.fillText('这局没人拿到称号', 480, 380); }
      this.btn(UI.again, UI.again.label, true, 17); this.btn(UI.home2, UI.home2.label, false, 17);
    }
    title() {
      const { ctx } = this;
      for (let i = -10; i < 40; i++) { ctx.fillStyle = i % 2 ? '#F6E7D2' : '#F1DFC6'; ctx.beginPath(); const x = i * 40 + (this.time * 10) % 80; ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x - 200, H); ctx.lineTo(x - 240, H); ctx.fill(); }
      T().logo(ctx, '摸鱼大作战', 480, 110, 56, this.time);
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(16, true); ctx.textAlign = 'center'; ctx.fillText('1 名老板 + 4 名员工 · 单人试玩版（其他角色由 AI 扮演）', 480, 170);
      A.EMPLOYEE_IDS.forEach((id, i) => OS.sprites.drawAnimal(ctx, id, 300 + i * 60, 250 + Math.sin(this.time * 3 + i) * 3, 1.1, { mood: 'slack', t: this.time + i }));
      OS.sprites.drawBoss(ctx, 640, 250, 1.1, { t: this.time, look: Math.sin(this.time * 1.3) * 3 });
      ctx.fillStyle = '#6B5442'; ctx.font = F(13); ctx.fillText('点击开始后随机分配身份（1/5 概率当老板）· 电脑：点击 / WASD 移动，空格 出门或回工位 · 手机：点哪走哪', 480, 288);
      // AI 老板难度
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText('AI 老板难度（按 1 / 2 / 3 切换）', 480, 313);
      UI.diff.forEach(b => {
        const on = this.app.difficulty === b.id, hov = this.mouse && inside(b, this.mouse);
        T().chunky(ctx, b.x, b.y - (hov ? 2 : 0), b.w, b.h, 14, on ? ({ easy: '#7CD3A2', normal: '#FFB52E', hard: '#E8746A' })[b.id] : '#FFFFFF', { depth: on ? 4 : 2, lineWidth: 2 });
        if (on) T().boldText(ctx, A.DIFFICULTY[b.id].name, b.x + b.w / 2, b.y + b.h / 2 + 1, 16, '#FFFFFF');
        else { ctx.fillStyle = '#6B5442'; ctx.font = F(15, true); ctx.textAlign = 'center'; ctx.fillText(A.DIFFICULTY[b.id].name, b.x + b.w / 2, b.y + b.h / 2 + 1); }
      });
      ctx.fillStyle = '#A99A88'; ctx.font = F(11); ctx.textAlign = 'center';
      ctx.fillText({ easy: '老板随机查房', normal: '老板会记住你走进了哪扇门（偶尔记错）', hard: '老板记得清清楚楚，出手又快又准' }[this.app.difficulty], 480, 377);
      this.btn(UI.start, '开始', true, 22); this.btn(UI.back, UI.back.label, false, 15);
    }
  }
  A.Renderer = ArenaRenderer;
  A.VIEW = { W, H, TS, X0, Y0 };
})(typeof window !== 'undefined' ? window : globalThis);
