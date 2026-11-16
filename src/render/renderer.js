// 小清新渲染：只读 game 状态，不修改逻辑。配色与工具见 render/theme.js，角色与道具见 render/sprites.js。
(function (g) {
  const OS = (g.OS = g.OS || {});
  const T = () => OS.theme, C = () => OS.theme.C, F = (s, b) => OS.theme.font(s, b);
  const ROOM = id => OS.ROOMS[id].name;
  const BOSS_SAY = { office: '巡视中', warning: '去查一下…', going: '查房！', in_room: '查房中', returning: '回办公区', escorted: '听汇报' };
  const STARS = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  const PROP = { pantry: 'coffee', restroom: 'phone', printer: 'paper', rooftop: 'phone' };

  class Renderer {
    constructor(canvas, app, opts) { this.c = canvas; this.ctx = canvas.getContext('2d'); this.app = app; this.game = null; this.debug = !!(opts && opts.debug); this.toasts = []; this.time = 0; this.floats = []; this.rings = []; this.dash = {}; this.flash = {}; this.shake = 0; this.lastEarned = {}; }
    toast(text) { this.toasts.push({ text, life: 1.8 }); }
    blink(period) { return Math.floor(this.time / period) % 2 === 0; }   // 闪烁节拍（真实时间）
    pulse(period) { return 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 / period); }   // 0~1 呼吸
    draw(dt) {
      const { ctx } = this, map = OS.map; this.time += dt || 0;
      ctx.clearRect(0, 0, map.width, map.height);
      ctx.font = F(14); ctx.textBaseline = 'middle';
      if (this.lastScreen !== this.app.screen) { this.lastScreen = this.app.screen; this.screenStart = this.time; }
      if (this.app.screen === 'select') { this.select(); return; }
      if (this.app.screen === 'lineup') { this.lineup(); return; }
      const game = (this.game = this.app.game), gm = game.map;
      this.stepFx(dt || 0);
      ctx.save();
      if (this.shake > 0) { const k = this.shake / 0.35 * 4; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }   // 被抓震屏
      ctx.fillStyle = C().bg; ctx.fillRect(0, 0, map.sceneW + 4, map.height);
      this.office();
      for (const id of gm.rooms) this.room(gm.zones[id]);
      // 员工按 y 排序绘制（下方的盖住上方的）；工位上的员工先画椅子，再画人，最后画桌子挡住下半身
      const emps = game.employees.slice().sort((a, b) => a.getPos(gm, this.slotOf(a)).y - b.getPos(gm, this.slotOf(b)).y);
      for (const e of emps) this.employee(e);
      for (const f of this.deskFronts || []) f();
      for (const id of gm.rooms) this.roomBanner(gm.zones[id]);   // 横幅画在员工上层
      this.boss(); this.drawFx(); ctx.restore();
      this.hud(); this.panel(); this.toastLayer(dt);
      if (game.phase !== 'playing') this.overlay();
      else if (this.app.intro) this.introOverlay();
      else if (this.app.paused) this.pauseOverlay();
      if (this.debug) this.debugInfo();
    }
    // 开放办公区：木地板 + 外圈地毯走道 + 中央 2×3 隔间（矮隔板），每个隔间一张书桌
    office() {
      const { ctx, game } = this, map = game.map, o = map.zones.office, gr = map.grid(), c = C();
      T().chunky(ctx, o.x, o.y, o.w, o.h, 14, c.floor, { depth: 5, outline: false });
      ctx.save(); T().rr(ctx, o.x, o.y, o.w, o.h, 14); ctx.clip();
      ctx.strokeStyle = c.plank; ctx.lineWidth = 1;
      for (let y = o.y + 22; y < o.y + o.h; y += 22) { ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); ctx.stroke(); }
      ctx.restore();
      // 走道地毯（外圈）
      const r = map.patrolRect(), m = map.margin;
      ctx.strokeStyle = c.aisle; ctx.lineWidth = m - 18; T().rr(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke();
      ctx.setLineDash([6, 8]); ctx.strokeStyle = '#E2CFB6'; ctx.lineWidth = 1.5; T().rr(ctx, r.x, r.y, r.w, r.h, 18); ctx.stroke(); ctx.setLineDash([]);
      // 角落绿植
      for (const [px, py] of [[o.x + 18, o.y + 18], [o.x + o.w - 18, o.y + 18], [o.x + 18, o.y + o.h - 18], [o.x + o.w - 18, o.y + o.h - 18]]) {
        ctx.fillStyle = '#E8B48A'; T().rr(ctx, px - 7, py - 2, 14, 12, 3); ctx.fill();
        for (const [dx, dy, rr] of [[0, -8, 8], [-6, -4, 6], [6, -4, 6]]) { ctx.beginPath(); ctx.arc(px + dx, py + dy, rr, 0, Math.PI * 2); ctx.fillStyle = '#9FCB82'; ctx.fill(); }
      }
      // 隔板
      ctx.strokeStyle = c.partition; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
      for (let k = 1; k < map.cols; k++) { const x = gr.x + k * gr.w / map.cols; ctx.moveTo(x, gr.y + 6); ctx.lineTo(x, gr.y + gr.h - 6); }
      for (let k = 1; k < map.rows; k++) { const y = gr.y + k * gr.h / map.rows; ctx.moveTo(gr.x - 6, y); ctx.lineTo(gr.x + gr.w + 6, y); }
      ctx.stroke(); ctx.lineCap = 'butt';
      T().rr(ctx, o.x, o.y, o.w, o.h, 14); ctx.strokeStyle = T().OUTLINE; ctx.lineWidth = 3; ctx.stroke();   // 办公区粗描边
      ctx.font = F(12, true); const ow = ctx.measureText(o.name).width + 18; T().chunky(ctx, o.x + 34, o.y + 6, ow, 20, 10, '#C9A882', { depth: 2, lineWidth: 2 }); T().boldText(ctx, o.name, o.x + 34 + ow / 2, o.y + 16.5, 12, '#FFFFFF');
      // 书桌：椅子先画，桌面在员工之后画（挡住下半身）
      this.deskFronts = [];
      map.deskPositions(map.maxDesks).forEach((d, i) => {
        const used = i < game.employees.length, desk = OS.sprites.drawDesk(ctx, d.x, d.y, 1, used);
        this.deskFronts.push(desk.front);
        if (!used) { ctx.fillStyle = '#C2AE97'; ctx.textAlign = 'center'; ctx.font = F(12); ctx.fillText('空工位', d.x, d.y - 26); }
      });
    }
    // 房间：彩色圆角块 + 道具 + 名称标签；老板即将查这里时珊瑚红脉冲
    room(z) {
      const { ctx, game } = this, rc = T().ROOM[z.id] || T().ROOM.meeting, danger = OS.hints.roomDanger(game, z.id), incoming = OS.hints.raidIncoming(game, z.id);
      const k = incoming ? this.pulse(danger ? 0.5 : 0.9) : 0;
      T().chunky(ctx, z.x, z.y, z.w, z.h, 14, rc.fill, { depth: 4, glow: incoming ? 'rgba(232,116,106,' + (0.5 + 0.5 * k) + ')' : null, glowBlur: 12 + 14 * k, outline: incoming ? C().coral : T().OUTLINE, lineWidth: incoming ? 4 : 3 });
      OS.sprites.drawRoomProps(ctx, z.id, z, this.time);
      let label = z.name;
      if (z.capacity > 0) label += (z.key ? ' ' + z.key : '') + '  ' + OS.hints.occupants(game, z.id).length + '/' + z.capacity;
      ctx.font = F(z.w < 180 ? 11 : 12, true); const lw = ctx.measureText(label).width + 16;
      T().chunky(ctx, z.x + 8, z.y + 7, lw, 20, 10, rc.tag, { depth: 2, lineWidth: 2 }); T().boldText(ctx, label, z.x + 8 + lw / 2, z.y + 17.5, z.w < 180 ? 11 : 12, '#FFFFFF');
      if (z.note) { ctx.fillStyle = C().inkSoft; ctx.font = F(10, true); ctx.textAlign = 'left'; ctx.fillText(z.note, z.x + 10, z.y + 38); }
    }
    roomBanner(z) {
      const { ctx, game } = this, b = game.boss, danger = OS.hints.roomDanger(game, z.id), incoming = OS.hints.raidIncoming(game, z.id);
      if (danger) {             // 珊瑚红横幅：提示立即召回
        const k = this.pulse(0.4), h = 28, y = z.y + z.h - h - 6;
        T().panel(ctx, z.x + 6, y, z.w - 12, h, h / 2, k > 0.5 ? C().coral : '#F08B80', { glow: 'rgba(232,116,106,0.5)', glowBlur: 8 });
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = F(z.w < 180 ? 13 : 15, true);
        ctx.fillText((z.w < 180 ? '快召回 ' : '老板要来了！点我召回 ') + z.key, z.x + z.w / 2, y + h / 2 + 1);
      } else if (incoming && b.state === 'warning') {
        ctx.fillStyle = C().coral; ctx.textAlign = 'center'; ctx.font = F(z.w < 180 ? 15 : 18, true); ctx.fillText('老板要来了!', z.x + z.w / 2, z.y + z.h / 2 + 8);
      }
    }
    // 同一房间相关（去/在/回）的员工按序号排出站位，避免重叠
    slotOf(e) {
      if (!e.room) return null;
      return this.game.employees.filter(x => x.room === e.room && ['going', 'in_room', 'returning'].includes(x.state)).indexOf(e);
    }
    mood(e, danger) {
      if (e.caughtFlash > 0) return 'caught';
      if (danger) return 'danger';
      if (e.state === 'going' || e.state === 'returning') return 'walk';
      if (OS.economy.isSlacking(e, this.game.boss)) return 'slack';
      return 'work';
    }
    employee(e) {
      const { ctx, game } = this, p = e.getPos(game.map, this.slotOf(e)), danger = OS.hints.inDanger(game, e);
      const slacking = OS.economy.isSlacking(e, game.boss), mood = this.mood(e, danger);
      const inRoom = e.state === 'in_room' || e.state === 'escorting';
      const z = inRoom && e.room && game.map.zones[e.room], narrow = !!z && z.w < 180, s = inRoom ? (narrow ? 0.85 : 0.95) : 1;
      const atDesk = e.state === 'working', y = atDesk ? p.y - 2 : p.y;
      if (danger) { ctx.save(); ctx.globalAlpha = 0.25 + 0.35 * this.pulse(0.35); ctx.beginPath(); ctx.arc(p.x, y - 6, 26 * s, 0, Math.PI * 2); ctx.fillStyle = C().coral; ctx.fill(); ctx.restore(); }
      this.ghost(e, p);
      OS.sprites.drawAnimal(ctx, e.id, p.x, y, s, { mood, t: this.time + e.index * 0.7, prop: e.state === 'in_room' ? PROP[e.room] : e.state === 'escorting' ? 'paper' : null });
      // 名牌：在工位/路上写在头顶；在房间里写在脚下
      const nameY = inRoom ? p.y + 22 * s : p.y - 42, infoY = inRoom ? p.y + 36 * s : p.y - 56;
      ctx.textAlign = 'center'; ctx.font = F(narrow ? 11 : 12, true);
      const label = (danger ? '! ' : '') + e.name, w = ctx.measureText(label).width + 10;
      T().rr(ctx, p.x - w / 2, nameY - 8, w, 16, 8); ctx.fillStyle = danger ? C().coral : 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.fillStyle = danger ? '#FFFFFF' : C().ink; ctx.fillText(label, p.x, nameY + 0.5);
      ctx.font = F(narrow ? 10 : 11, true);
      if (slacking) { const r = OS.economy.incomeRate(e, game.boss, game.bal, game.map).toFixed(1); ctx.fillStyle = C().moneyDeep; ctx.fillText(narrow ? '+' + r : '+$' + r + '/s', p.x, infoY); }
      if (e.state === 'escorting') { ctx.fillStyle = C().inkSoft; ctx.fillText((e.team ? e.team.short : '汇报') + '中', p.x, infoY); }
    }
    boss() {
      const { ctx, game } = this, b = game.boss, p = b.getPos(), reading = b.distracted > 0 && b.inOffice();
      const look = b.state === 'office' ? Math.sin(this.time * 1.3) * 3 : 0;
      OS.sprites.drawBoss(ctx, p.x, p.y, 1, { t: this.time, look, mood: reading ? 'read' : null });
      // 头顶气泡；被带走/拖住时显示转动的小钟（不显示剩余秒数）
      const busy = reading || b.state === 'escorted', warn = b.state === 'warning';
      const say = reading ? '看文件' : b.state === 'escorted' ? '开会中' : (BOSS_SAY[b.state] || '');
      ctx.font = F(12, true); const iw = busy ? 18 : 0, w = ctx.measureText(say).width + 16 + iw, bx = p.x - w / 2, by = p.y - 62;
      T().panel(ctx, bx, by, w, 22, 11, warn ? C().coral : busy ? '#EAF3FB' : '#FFFFFF', { stroke: warn ? null : busy ? '#9CC8E8' : C().line });
      ctx.beginPath(); ctx.moveTo(p.x - 5, by + 21); ctx.lineTo(p.x + 5, by + 21); ctx.lineTo(p.x, by + 27); ctx.closePath(); ctx.fillStyle = warn ? C().coral : busy ? '#EAF3FB' : '#FFFFFF'; ctx.fill();
      if (busy) this.spinClock(bx + 15, by + 11, 7);
      ctx.fillStyle = warn ? '#FFFFFF' : busy ? C().time : C().ink; ctx.textAlign = 'center'; ctx.fillText(say, p.x + iw / 2, by + 11.5);
      // 预警读条：红色进度条从空涨到满，满了就出发查房
      if (warn) {
        const k = Math.max(0, Math.min(1, 1 - b.timer / game.bal.boss.warnTime)), W = 60, x = p.x - W / 2, y = by - 12;
        T().rr(ctx, x - 2, y - 2, W + 4, 10, 5); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
        T().rr(ctx, x, y, W, 6, 3); ctx.fillStyle = '#F6D3CF'; ctx.fill();
        if (k > 0) { T().rr(ctx, x, y, Math.max(6, W * k), 6, 3); ctx.fillStyle = k > 0.8 && this.blink(0.1) ? '#FF4D3D' : C().coral; ctx.fill(); }
        this.warnBar = { x, y, W };
      }
      // 碎片（读条被打断）
      for (const s of this.shards || []) { const a = 1 - s.t / 0.6; ctx.save(); ctx.globalAlpha = a; ctx.translate(s.x + s.vx * s.t, s.y + s.vy * s.t + 60 * s.t * s.t); ctx.rotate(s.r * s.t); ctx.fillStyle = C().coral; ctx.fillRect(-s.w / 2, -3, s.w, 6); ctx.restore(); }
    }
    // 转动的小钟（不显示具体时间）
    spinClock(x, y, r) {
      const { ctx } = this, a = this.time * 3;
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = C().time; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a / 12) * r * 0.45, y + Math.sin(a / 12) * r * 0.45); ctx.stroke(); ctx.restore();
    }
    hud() {
      const { ctx, game, app } = this, c = C(), O = T().OUTLINE;
      ctx.fillStyle = '#FFF3DF'; ctx.fillRect(0, 0, 960, 44); ctx.fillStyle = O; ctx.fillRect(0, 42, 960, 3);
      const goal = game.level.goal, chap = c.chapters[Math.min(2, Math.floor((game.level.id - 1) / 5))]; let x = 10;
      this.medal(x + 16, 21, 14, chap, String(game.level.id), false); x += 38;
      if (game.isExam()) { T().chunky(ctx, x, 11, 42, 22, 11, c.coral, { depth: 2, lineWidth: 2 }); T().boldText(ctx, '考核', x + 21, 22.5, 12, '#FFFFFF'); x += 50; }
      // 金钱：金币 + 带描边的进度条
      const k = goal.money ? Math.min(1, game.money / goal.money) : 0;
      T().chunky(ctx, x + 10, 12, 150, 20, 10, c.moneySoft, { depth: 2, lineWidth: 2.5 });
      if (k > 0) { ctx.save(); T().rr(ctx, x + 10, 12, 150, 20, 10); ctx.clip(); ctx.fillStyle = k >= 1 ? '#FFC93C' : c.money; ctx.fillRect(x + 10, 12, 150 * k, 20); ctx.restore(); T().rr(ctx, x + 10, 12, 150, 20, 10); ctx.strokeStyle = O; ctx.lineWidth = 2.5; ctx.stroke(); }
      T().coin(ctx, x + 8, 22, 11); ctx.beginPath(); ctx.arc(x + 8, 22, 11, 0, Math.PI * 2); ctx.strokeStyle = O; ctx.lineWidth = 2; ctx.stroke();
      T().boldText(ctx, '$' + Math.floor(game.money) + ' / ' + goal.money, x + 88, 22.5, 12, '#FFFFFF'); x += 172;
      // 时间
      const late = game.timeLeft < 15;
      T().chunky(ctx, x, 11, 64, 22, 11, late ? '#FDE0DC' : '#E2F0FB', { depth: 2, lineWidth: 2 }); T().clock(ctx, x + 14, 22, 7, late ? c.coral : c.time);
      ctx.textAlign = 'left'; ctx.font = F(14, true); ctx.fillStyle = late ? c.coral : c.time; ctx.fillText(Math.ceil(game.timeLeft) + 's', x + 26, 22.5); x += 72;
      // 被抓 + 星级
      T().chunky(ctx, x, 11, game.isExam() ? 60 : 46, 22, 11, '#FDE7E3', { depth: 2, lineWidth: 2 }); T().alert(ctx, x + 13, 22, 7);
      ctx.fillStyle = game.caught ? c.coral : c.inkSoft; ctx.font = F(14, true); ctx.textAlign = 'left';
      ctx.fillText(game.isExam() ? game.caught + '/' + game.maxCaught : String(game.caught), x + 25, 22.5); x += (game.isExam() ? 60 : 46) + 8;
      const st = OS.starsForCaught(game); for (let i = 0; i < 3; i++) this.star(x + 9 + i * 17, 22, 7.5, i < st); x += 58;
      if (game.shield > 0) { T().chunky(ctx, x, 11, 86, 22, 11, this.blink(0.5) ? '#7FB8E0' : '#9CC8E8', { depth: 2, lineWidth: 2 }); T().boldText(ctx, '掩护中 ' + Math.ceil(game.shield) + 's', x + 43, 22.5, 12, '#FFFFFF'); }
      const unlocked = app.featuresUnlocked(), canPause = app.canPause() || app.paused;
      this.hudButton(OS.ui.pauseButton, app.paused ? '继续 P' : '暂停 P', canPause, app.paused, '');
      this.hudButton(OS.ui.speedButton, unlocked ? '倍速 ×' + app.speed() + ' S' : '倍速', unlocked, app.speed() > 1, '第' + OS.balance.featureUnlockLevel + '关解锁');
      this.hudButton(OS.ui.menuButton, '选关', true, false);
      this.hudButton(OS.ui.soundButton, app.settings.mute ? '静音 M' : '音效 M', true, !!app.settings.mute);
    }
    // on=高亮；不可用时淡色并显示原因
    hudButton(r, label, enabled, on, hint) {
      const { ctx } = this, c = C(), hov = enabled && this.hovered(r), up = hov ? 1 : 0;
      T().chunky(ctx, r.x, r.y + 3 - up, r.w, r.h - 9, 12, !enabled ? '#EFE6DA' : on ? '#FFC93C' : '#FFFFFF', { depth: 3 + up, depthColor: !enabled ? '#D8CCBC' : on ? '#C9921E' : '#BFA98F', outline: enabled ? T().OUTLINE : '#C2B5A6', lineWidth: 2.5 });
      ctx.fillStyle = !enabled ? '#B9AC9C' : c.ink; ctx.textAlign = 'center';
      if (enabled) { ctx.font = F(13, true); ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 - up); }
      else { ctx.font = F(11, true); ctx.fillText(label, r.x + r.w / 2, r.y + 12); ctx.font = F(9); ctx.fillText(hint, r.x + r.w / 2, r.y + 23); }
    }
    // 右侧员工栏：上区特殊技能卡片（整张可点），分割线下方其他同事紧凑行。
    // 卡片光晕：可用时琥珀色慢呼吸；最佳时机快闪；员工有危险时珊瑚红急闪。
    panel() {
      const { ctx, game } = this, P = OS.ui.PANEL, L = OS.ui.panelLayout(game), c = C(), O = T().OUTLINE;
      ctx.fillStyle = '#FFE9C7'; ctx.fillRect(P.x - 6, 45, 960 - P.x + 6, 595); ctx.fillStyle = O; ctx.fillRect(P.x - 7, 45, 3, 595);
      for (const h of L.heads) {
        if (h.divider) { ctx.strokeStyle = '#C9A882'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(h.x, h.y - 3); ctx.lineTo(h.x + h.w, h.y - 3); ctx.stroke(); ctx.setLineDash([]); }
        const sp = !h.divider && L.cards.length > 0;   // 第一个标题是特殊技能区
        ctx.font = F(11, true); const w = ctx.measureText(h.label).width + 18;
        T().chunky(ctx, h.x, h.y + 1, w, 19, 9.5, sp ? c.epic : '#C9A882', { depth: 2, lineWidth: 2 }); T().boldText(ctx, h.label, h.x + w / 2, h.y + 11, 11, '#FFFFFF');
      }
      for (const card of L.cards) this.specialCard(card);
      for (const r of L.rows) this.staffRow(r);
    }
    // 普通技能状态文字 + 冷却进度（0~1，1 = 就绪）
    soloState(e) {
      const room = e.room ? ROOM(e.room) : '';
      if (e.state === 'going') return { text: '去' + room + '…', k: 0 };
      if (e.state === 'in_room') return { text: '在' + room + '摸鱼', k: 0 };
      if (e.state === 'returning') return { text: '回工位…', k: 0 };
      if (e.state === 'escorting') return { text: (e.team ? e.team.short : '汇报') + '中', k: 0 };
      if (e.cd > 0) return { text: e.solo.name + ' 冷却 ' + Math.ceil(e.cd) + 's', k: 1 - e.cd / e.solo.cooldown };
      return { text: e.solo.name + ' 待命', k: 1 };
    }
    // 卡片底板 + 光晕
    // 卡片底板：深色粗描边 + 硬阴影 + 内圈品质色边框；光晕：可释放绿、最佳时机金、危险红
    cardBase(c, danger, hint, fill, edge) {
      const { ctx } = this; let glow = null, blur = 8;
      if (danger) { glow = 'rgba(232,116,106,' + (0.55 + 0.45 * this.pulse(0.3)) + ')'; blur = 16; }
      else if (hint === 'golden') { glow = 'rgba(255,190,40,' + (0.6 + 0.4 * this.pulse(0.3)) + ')'; blur = 18; }
      else if (hint === 'ready') { glow = 'rgba(76,175,112,' + (0.5 + 0.45 * this.pulse(0.9)) + ')'; blur = 14; }
      T().chunky(ctx, c.x, c.y, c.w, c.h, 11, fill, { depth: 4, glow, glowBlur: blur, outline: danger ? C().coral : T().OUTLINE, lineWidth: 2.5 });
      const inner = hint === 'ready' ? 'rgba(76,175,112,' + (0.6 + 0.4 * this.pulse(0.9)) + ')' : hint === 'golden' ? '#FFC93C' : edge;
      if (inner) { T().rr(ctx, c.x + 3, c.y + 3, c.w - 6, c.h - 6, 8); ctx.strokeStyle = inner; ctx.lineWidth = hint === 'ready' || hint === 'golden' ? 3 : 2; ctx.stroke(); }
    }
    // 头像底：角色主题色圆 + 白边
    avatarRing(x, y, r, id) {
      const { ctx } = this, col = (OS.sprites.SPEC[id] || {}).shirt || C().mint;
      ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = T().OUTLINE; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    }
    bar(x, y, w, k, color) {
      const { ctx } = this; T().rr(ctx, x, y, w, 6, 3); ctx.fillStyle = '#EFE5D8'; ctx.fill();
      const v = Math.max(0, Math.min(1, k)); if (v > 0) { T().rr(ctx, x, y, Math.max(6, w * v), 6, 3); ctx.fillStyle = color || '#7CD3A2'; ctx.fill(); }
      T().rr(ctx, x, y, w, 6, 3); ctx.strokeStyle = 'rgba(61,43,31,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // 特殊技能的一句话说明 / 最佳时机提示（按类型）
    static teamDesc(t) {
      if (t.type === 'delay') return '查房推迟 ' + t.delay + ' 秒';
      if (t.type === 'shield') return t.duration + ' 秒内被查不算';
      return '老板离开 ' + t.duration + ' 秒';
    }
    static teamGolden(t) { return t.type === 'shield' ? '老板要查有人的房间，快掩护！' : '现在释放可以取消查房！'; }
    // 特殊技能卡片；c.h < 110 时为紧凑版（特殊技能角色 ≥ 3 人）
    specialCard(c) {
      const { ctx, game } = this, e = c.e, t = e.team, status = OS.skills.teamStatus(game, e), hint = OS.hints.teamHint(game, e), danger = OS.hints.inDanger(game, e);
      const golden = hint === 'golden', ok = status === 'ok', cp = c.h < 110, col = C();
      const Y = cp ? { name: 14, skill: 34, desc: 52, bar1: 59, btn: 44, btnH: 22, solo: 77, bar2: 83 } : { name: 16, skill: 42, desc: 64, bar1: 73, btn: 52, btnH: 28, solo: 93, bar2: 102 };
      const q = T().QUALITY[e.quality || (OS.characters[e.id] || {}).quality] || T().QUALITY.common;
      const k = this.pulse(0.8), grey = !ok && !danger;
      ctx.save();
      if (ok) {
        // 可释放：整卡亮绿（最佳时机为金色）+ 轻微呼吸缩放 + 外发光
        const sc = 1 + 0.015 * k; ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(sc, sc); ctx.translate(-c.x - c.w / 2, -c.y - c.h / 2);
        T().chunky(ctx, c.x, c.y, c.w, c.h, 11, golden ? '#FFB52E' : '#36B868', { depth: 7, depthColor: golden ? '#B5730A' : '#1F7A45',
          glow: golden ? 'rgba(255,190,40,' + (0.7 + 0.3 * k) + ')' : 'rgba(46,204,113,' + (0.7 + 0.3 * k) + ')', glowBlur: 22, lineWidth: 3 });
        T().rr(ctx, c.x + 3.5, c.y + 3.5, c.w - 7, c.h - 7, 8); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
      } else this.cardBase(c, danger, 'none', danger ? '#FFF1EF' : '#EDE6DC', danger ? null : '#CFC2B2');   // 不可用：整卡变灰
      const fl = this.flash && this.flash[e.id];
      if (fl) { ctx.save(); ctx.globalAlpha = fl / 0.6 * 0.7; T().rr(ctx, c.x, c.y, c.w, c.h, 11); ctx.fillStyle = '#FFE38A'; ctx.fill(); ctx.restore(); }
      if (grey) ctx.globalAlpha = 0.72;
      const W = '#FFFFFF', WS = golden ? '#FFF3D6' : '#E8FFF0';
      // 头像
      const ax = c.x + 20, ay = c.y + Y.name + 2;
      this.avatarRing(ax, ay, 13, e.id);
      OS.sprites.drawAnimal(ctx, e.id, ax, ay + 1, 0.62, { headOnly: true, mood: danger ? 'danger' : 'work', t: this.time });
      ctx.textAlign = 'left'; ctx.fillStyle = ok ? W : q.ink; ctx.font = F(cp ? 13 : 14, true); ctx.fillText(e.name, c.x + 38, c.y + Y.name);
      ctx.fillStyle = ok ? WS : col.inkSoft; ctx.font = F(11); ctx.fillText(e.role + ' · $' + e.wage + '/h', c.x + 38 + ctx.measureText(e.name).width * 1.15 + 6, c.y + Y.name + 1);
      // 技能名 + 次数徽章（可释放时技能名为白色粗体；不可用时灰色）
      const skY = ok && !cp ? Y.skill - 4 : Y.skill;
      ctx.fillStyle = ok ? W : '#9C8F80'; ctx.font = F(cp ? 15 : 16, true); ctx.fillText(t.name, c.x + 10, c.y + skY);
      const sw = ctx.measureText(t.name).width;
      T().chunky(ctx, c.x + 15 + sw, c.y + skY - 9, 28, 18, 9, ok ? col.epic : '#C8BBAB', { depth: 2, lineWidth: 2 }); T().boldText(ctx, '×' + e.teamCharges, c.x + 29 + sw, c.y + skY + 0.5, 11, '#FFFFFF');
      if (ok) {
        // 卡片内的黄色大按钮，上下弹跳；左侧小箭头来回点
        const bx = c.x + 10, bw = c.w - 20, bh = Y.btnH, up = 2 * k, by = c.y + Y.btn - up;
        T().chunky(ctx, bx, by, bw, bh, bh / 2, golden ? '#FFFFFF' : '#FFD93C', { depth: 3 + up, depthColor: golden ? '#C98A12' : '#C9921E', lineWidth: 2.5 });
        const label = golden ? Renderer.teamGolden(t) : '点我释放！' + Renderer.teamDesc(t);
        T().boldText(ctx, '▶', bx + 13 + 3 * k, by + bh / 2 + 0.5, cp ? 11 : 13, golden ? '#E8890C' : '#FFFFFF');
        if (golden) { ctx.font = F(cp ? 11 : 12, true); ctx.fillStyle = '#D9780A'; ctx.textAlign = 'center'; ctx.fillText(label, bx + bw / 2 + 8, by + bh / 2 + 1); }
        else T().boldText(ctx, label, bx + bw / 2 + 8, by + bh / 2 + 0.5, cp ? 12 : 13, '#FFFFFF');
      } else {
        // 状态说明
        const why = { cooldown: '冷却中 ' + Math.ceil(e.teamCd) + ' 秒', busy: e.state === 'escorting' ? '正在' + t.short : '摸鱼中，' + Math.ceil(e.timeToDesk()) + ' 秒后回工位',
          boss_away: '老板已离开办公区', no_charges: '本关次数已用完', active: '掩护生效中', phase: '' }[status];
        ctx.textAlign = 'left'; ctx.font = F(12, danger); ctx.fillStyle = danger ? col.coral : '#8C7B6B';
        ctx.fillText(danger ? '危险！老板要查' + ROOM(e.room) + '，快召回' : why || '', c.x + 10, c.y + Y.desc);
        if (status === 'cooldown') this.bar(c.x + 10, c.y + Y.bar1, c.w - 20, 1 - e.teamCd / t.cooldown, '#A99A88');
      }
      // 普通技能（自动）
      const so = this.soloState(e);
      ctx.textAlign = 'left'; ctx.fillStyle = ok ? WS : col.inkSoft; ctx.font = F(11); ctx.fillText('普通：' + so.text, c.x + 10, c.y + Y.solo);
      ctx.textAlign = 'right'; ctx.fillStyle = ok ? W : col.moneyDeep; ctx.font = F(11, true); ctx.fillText('$' + Math.floor(e.earned), c.x + c.w - 10, c.y + Y.solo);
      this.bar(c.x + 10, c.y + Y.bar2, c.w - 20, so.k);
      ctx.restore();
    }
    staffRow(r) {
      const { ctx, game } = this, e = r.e, danger = OS.hints.inDanger(game, e), so = this.soloState(e), col = C();
      const q = T().QUALITY[(OS.characters[e.id] || {}).quality] || T().QUALITY.common;
      this.cardBase(r, danger, 'none', danger ? '#FFF1EF' : '#FFFBF3', q.ink);   // 普通员工：米白底 + 品质色内框
      const ax = r.x + 17, ay = r.y + r.h / 2;
      this.avatarRing(ax, ay, 12, e.id);
      OS.sprites.drawAnimal(ctx, e.id, ax, ay + 1, 0.56, { headOnly: true, mood: danger ? 'danger' : this.mood(e, false) === 'slack' ? 'slack' : 'work', t: this.time });
      ctx.textAlign = 'left'; ctx.fillStyle = q.ink; ctx.font = F(12, true); ctx.fillText(e.name, r.x + 34, r.y + 13);
      ctx.fillStyle = col.inkSoft; ctx.font = F(10); ctx.fillText(e.role + ' $' + e.wage + '/h', r.x + 34 + ctx.measureText(e.name).width * 1.25 + 4, r.y + 13.5);
      ctx.textAlign = 'right'; ctx.font = F(11, true); ctx.fillStyle = col.moneyDeep; ctx.fillText('$' + Math.floor(e.earned), r.x + r.w - 8, r.y + 13);
      ctx.textAlign = 'left'; ctx.fillStyle = danger ? col.coral : col.inkSoft; ctx.font = F(11, danger);
      ctx.fillText(danger ? '危险！快召回（点' + ROOM(e.room) + '）' : so.text, r.x + 34, r.y + 29);
      this.bar(r.x + 34, r.y + 37, r.w - 44, so.k);
    }
    // —— 特效（只用于画面）——
    // 由 main.js 把游戏事件转给这里：被抓震屏、召回残影、技能卡闪光
    onEvent(ev) {
      const game = this.app.game; if (!game) return;
      if (ev.type === 'caught') { this.shake = 0.35; const e = game.get(ev.who); if (e) this.burst(e, '#E8746A'); }
      if (ev.type === 'shielded') { const e = game.get(ev.who); if (e) this.burst(e, '#8EC9F0'); }
      if (ev.type === 'recall') for (const e of game.employees) if (e.state === 'returning' && e.room === ev.room) this.dash[e.id] = 0.6;
      if (ev.type === 'team') this.flash[ev.who] = 0.6;
    }
    burst(e, color) { const p = e.getPos(this.game.map, this.slotOf(e)); this.rings.push({ x: p.x, y: p.y - 10, t: 0, color }); }
    // 每帧推进特效；检测收入跨过 $10 刻度时在员工头上飘字
    stepFx(dt) {
      const game = this.game;
      if (this.fxGame !== game) { this.fxGame = game; this.shards = []; this.prevBoss = null; this.floats = []; this.rings = []; this.dash = {}; this.flash = {}; this.shake = 0; this.lastEarned = {}; }
      this.shake = Math.max(0, (this.shake || 0) - dt);
      // 预警被技能打断（warning → office/escorted）：读条碎成几片淡出
      const bs = game.boss.state;
      if (this.prevBoss === 'warning' && bs !== 'warning' && bs !== 'going' && this.warnBar) {
        const wb = this.warnBar; this.shards = [];
        for (let i = 0; i < 6; i++) this.shards.push({ x: wb.x + wb.W * (i + 0.5) / 6, y: wb.y + 3, vx: (i - 2.5) * 22, vy: -40 - Math.random() * 30, r: (Math.random() - 0.5) * 8, w: wb.W / 6 - 1, t: 0 });
      }
      this.prevBoss = bs;
      this.shards = (this.shards || []).filter(s => (s.t += dt) < 0.6);
      for (const k in this.dash) if ((this.dash[k] -= dt) <= 0) delete this.dash[k];
      for (const k in this.flash) if ((this.flash[k] -= dt) <= 0) delete this.flash[k];
      this.rings = this.rings.filter(r => (r.t += dt) < 0.6);
      this.floats = this.floats.filter(f => (f.t += dt) < 1.1);
      if (game.phase === 'playing' && !this.app.paused) for (const e of game.employees) {
        const was = this.lastEarned[e.id] || 0, step = 10;
        if (Math.floor(e.earned / step) > Math.floor(was / step)) { const p = e.getPos(game.map, this.slotOf(e)); this.floats.push({ x: p.x, y: p.y - 22, t: 0, text: '+$' + step }); }
        this.lastEarned[e.id] = e.earned;
      }
    }
    drawFx() {
      const { ctx } = this;
      for (const r of this.rings) { const k = r.t / 0.6; ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = 4 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, 12 + 30 * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      for (const f of this.floats) { const k = f.t / 1.1; ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.fillStyle = C().moneyDeep; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText(f.text, f.x + 16, f.y - 14 * k); ctx.restore(); }
    }
    // 召回残影：在员工身后画两个半透明的影子
    ghost(e, p) {
      const k = this.dash[e.id]; if (!k) return;
      const d = { x: p.x - e.desk.x, y: p.y - e.desk.y }, len = Math.hypot(d.x, d.y) || 1, ux = d.x / len, uy = d.y / len;
      for (const [off, a] of [[18, 0.28], [34, 0.14]]) { this.ctx.save(); this.ctx.globalAlpha = a * (k / 0.6); OS.sprites.drawAnimal(this.ctx, e.id, p.x + ux * off, p.y + uy * off, 0.95, { mood: 'walk', t: this.time }); this.ctx.restore(); }
    }
    toastLayer(dt) {
      const { ctx } = this; this.toasts = this.toasts.filter(t => (t.life -= dt) > 0);
      this.toasts.slice(-3).forEach((t, i, arr) => {
        const y = 222 - (arr.length - 1 - i) * 32, a = Math.min(1, t.life / 0.3), pop = Math.min(1, (1.8 - t.life) / 0.12);
        ctx.save(); ctx.globalAlpha = a; ctx.font = F(14, true); const w = ctx.measureText(t.text).width + 30;
        ctx.translate(OS.map.sceneW / 2, y); ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
        T().chunky(ctx, -w / 2, -14, w, 28, 14, '#FFFFFF', { depth: 3, lineWidth: 2.5 });
        ctx.fillStyle = C().ink; ctx.textAlign = 'center'; ctx.fillText(t.text, 0, 0.5); ctx.restore();
      });
    }
    // 圆角按钮（结算、暂停、阵容界面通用）
    // 厚实按钮：粗描边 + 底部深色边（悬停时略微上浮）
    btn(b, label, primary, disabled) {
      const { ctx } = this, c = C(), hov = !disabled && this.hovered(b), up = hov ? 2 : 0;
      T().chunky(ctx, b.x, b.y - up, b.w, b.h, b.h / 2, disabled ? '#E9E0D4' : primary ? '#FFB52E' : '#FFFFFF',
        { depth: 5 + up, depthColor: disabled ? '#CFC3B4' : primary ? '#C9781A' : '#BFA98F', outline: disabled ? '#B9AC9C' : T().OUTLINE });
      if (disabled) { ctx.fillStyle = '#B9AC9C'; ctx.textAlign = 'center'; ctx.font = F(16, true); ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1); }
      else if (primary) T().boldText(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 1 - up, 16, '#FFFFFF');
      else { ctx.fillStyle = c.ink; ctx.textAlign = 'center'; ctx.font = F(16, true); ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1 - up); }
    }
    // "本关新内容"弹框：每条一行，左侧图标（新同事 = 头像，新房间 = 房间色块，其他 = 彩色圆标）
    introOverlay() {
      const { ctx, app } = this, info = app.intro, c = C(), items = info.items.slice(0, 5);
      ctx.fillStyle = 'rgba(74,63,53,0.45)'; ctx.fillRect(0, 0, 960, 640);
      const h = 128 + items.length * 70, y0 = Math.max(30, 300 - h / 2);
      T().chunky(ctx, 140, y0, 680, h + 40, 26, '#FFF6E6', { depth: 8 });
      T().boldText(ctx, info.title, 480, y0 + 40, 24, '#FFB52E');
      const ICON = { tip: c.mint, desks: c.sky, lineup: c.mint, speed: c.lilac, exam: c.coralSoft, note: c.butter };
      const GLYPH = { desks: '桌', lineup: '选', speed: '快', exam: '考', note: '!' };
      items.forEach((it, i) => {
        const y = y0 + 76 + i * 70;
        T().chunky(ctx, 170, y, 620, 62, 14, '#FFFFFF', { depth: 3, lineWidth: 2.5 });
        const ix = 204, iy = y + 31;
        if (it.kind === 'char') { this.avatarRing(ix, iy, 22, it.id); OS.sprites.drawAnimal(ctx, it.id, ix, iy + 1, 1.05, { headOnly: true, mood: 'slack', t: this.time }); }
        else if (it.kind === 'room') { const rc = T().ROOM[it.id] || {}; T().chunky(ctx, ix - 22, iy - 18, 44, 36, 8, rc.fill || c.sky, { depth: 2, lineWidth: 2.5 }); ctx.fillStyle = c.ink; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.fillText(OS.ROOMS[it.id].name.slice(0, 2), ix, iy + 1); }
        else if (it.kind === 'tip') { this.tipIcon(it.icon, ix, iy); }
        else { ctx.beginPath(); ctx.arc(ix, iy, 20, 0, Math.PI * 2); ctx.fillStyle = ICON[it.kind] || c.butter; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = T().OUTLINE; ctx.stroke(); T().boldText(ctx, GLYPH[it.kind] || '·', ix, iy + 1, 16, '#FFFFFF'); }
        const qc = it.kind === 'char' ? (T().QUALITY[OS.characters[it.id].quality] || T().QUALITY.common).ink : null;
        ctx.textAlign = 'left'; ctx.fillStyle = it.kind === 'exam' ? c.coral : qc || c.ink; ctx.font = F(15, true); ctx.fillText(it.title, 240, y + 17);
        ctx.fillStyle = c.inkSoft; ctx.font = F(12); this.wrapText(it.text, 240, y + 37, 535, 15);
      });
      const b = Object.assign({}, OS.ui.introButton, { y: y0 + h - 22 });
      this.btn(b, app.paused ? '知道了 [Enter]' : '开始摸鱼 [Enter]', true);
      ctx.fillStyle = c.inkSoft; ctx.font = F(11); ctx.textAlign = 'center'; ctx.fillText('点击任意位置关闭；之后可在暂停菜单（或按 I）里再看', 480, y0 + h + 30);
    }
    // 第 1 关入门图标
    tipIcon(kind, x, y) {
      const { ctx } = this, c = C();
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fillStyle = { boss: c.butter, slack: c.mint, recall: c.coralSoft, skill: '#CDEFD9' }[kind] || c.sky; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = T().OUTLINE; ctx.stroke();
      if (kind === 'boss') { ctx.save(); ctx.translate(x, y + 6); ctx.scale(0.62, 0.62); OS.sprites.drawBoss(ctx, 0, 0, 1, { t: this.time }); ctx.restore(); }
      else if (kind === 'slack') OS.sprites.drawAnimal(ctx, 'cat', x, y + 1, 1.0, { headOnly: true, mood: 'slack', t: this.time });
      else if (kind === 'recall') { ctx.fillStyle = c.coral; ctx.font = F(20, true); ctx.textAlign = 'center'; ctx.fillText('Q', x, y + 1); }
      else { T().rr(ctx, x - 14, y - 10, 28, 20, 5); ctx.strokeStyle = '#4CAF70'; ctx.lineWidth = 3; ctx.stroke(); }
    }
    // 中文按宽度折行（最多 2 行）
    wrapText(text, x, y, maxW, lh) {
      const { ctx } = this; let line = '', row = 0;
      for (const ch of text) { if (ctx.measureText(line + ch).width > maxW && line) { ctx.fillText(line, x, y + row * lh); line = ch; if (++row >= 2) return; } else line += ch; }
      if (line) ctx.fillText(line, x, y + row * lh);
    }
    pauseOverlay() {
      const { ctx } = this, W = OS.map.sceneW + 4, c = C();
      ctx.fillStyle = 'rgba(74,63,53,0.42)'; ctx.fillRect(0, 44, W, 596);
      ctx.save(); ctx.translate(W / 2, 345); ctx.rotate(-0.01); T().chunky(ctx, -150, -195, 300, 390, 24, '#FFF6E6', { depth: 8 }); ctx.restore();
      T().boldText(ctx, '休息一下', W / 2, 198, 32, '#FFB52E');
      ctx.font = F(13); ctx.fillStyle = c.inkSoft; ctx.textAlign = 'center'; ctx.fillText('暂停期间不能放技能、不能召回', W / 2, 234);
      OS.sprites.drawAnimal(ctx, 'sloth', W / 2 - 112, 204, 0.85, { mood: 'slack', t: this.time, prop: 'coffee' });
      for (const b of OS.ui.pauseButtons) this.btn(b, b.id === 'intro' && !this.app.hasIntro() ? '本关说明（无）' : b.id === 'music' ? '背景音乐：' + (this.app.settings.bgm ? '开' : '关') + ' B' : b.label, b.id === 'resume');
    }
    overlay() {
      const { ctx, game, app } = this, r = app.result, c = C(); if (!r) return;
      if (this.resultShown !== r) { this.resultShown = r; this.resultStart = this.time; }
      this.resultT = this.time - this.resultStart;
      ctx.fillStyle = 'rgba(74,63,53,0.45)'; ctx.fillRect(0, 0, 960, 640);
      ctx.save(); ctx.translate(480, 330); ctx.rotate(-0.008); T().chunky(ctx, -330, -210, 660, 420, 28, '#FFF6E6', { depth: 9 }); ctx.restore();
      T().boldText(ctx, r.win ? '达标！今天摸得很满意' : '下班了……没摸够', 480, 166, 30, r.win ? '#FFB52E' : C().coral);
      // 星星逐颗弹出
      if (r.win) for (let i = 0; i < 3; i++) {
        const t = this.resultT - 0.25 - i * 0.22, on = i < r.stars, k = Math.max(0, Math.min(1, t / 0.25)), sc = on ? (k < 1 ? 0.4 + 0.9 * k : 1 + 0.15 * Math.max(0, 1 - (t - 0.25) / 0.2)) : 1;
        ctx.save(); ctx.translate(400 + i * 80, 228); ctx.scale(sc, sc); this.star(0, 0, 28, on && k > 0); ctx.restore();
      } else { OS.sprites.drawAnimal(ctx, 'rabbit', 480, 236, 1.5, { mood: 'caught', t: this.time }); }
      const two = OS.twoStarLimit(game);
      const rule = game.isExam()
        ? '考核关：3星 零被抓　2星 被抓 ≤ ' + two + ' 次　1星 被抓 ≤ ' + game.maxCaught + ' 次（超过即失败）'
        : '3星 零被抓　2星 被抓 ≤ ' + two + ' 次　1星 金额达标即可';
      ctx.fillStyle = r.win ? c.moneyDeep : c.ink; ctx.font = F(17, true); ctx.textAlign = 'center';
      ctx.fillText(r.win ? '金额 $' + Math.floor(game.money) + '　被抓 ' + game.caught + ' 次　剩余 ' + Math.ceil(game.timeLeft) + ' 秒'
        : r.reason === 'caught' ? '被抓次数超限：' + game.caught + ' 次（本关最多 ' + game.maxCaught + ' 次）' : '时间到了，金额未达标：$' + Math.floor(game.money) + ' / ' + game.level.goal.money, 480, 296);
      if (r.win && r.newBest) { ctx.save(); ctx.translate(480, 324); ctx.rotate(-0.06); T().chunky(ctx, -40, -12, 80, 24, 12, '#FFC93C', { depth: 3, lineWidth: 2.5 }); T().boldText(ctx, '新纪录！', 0, 0.5, 13, '#FFFFFF'); ctx.restore(); }
      ctx.fillStyle = c.inkSoft; ctx.font = F(13); ctx.textAlign = 'center'; ctx.fillText(rule, 480, 360);
      if (r.win && r.unlockedChars && r.unlockedChars.length) {
        const ids = r.unlockedChars, x0 = 480 - (ids.length * 150) / 2 + 20;
        ctx.fillStyle = c.ink; ctx.font = F(15, true); ctx.textAlign = 'left'; ctx.fillText('解锁新同事：', x0 - 100, 414);
        ids.forEach((id, i) => { const x = x0 + i * 150, q = T().QUALITY[OS.characters[id].quality] || T().QUALITY.common; T().chunky(ctx, x, 392, 140, 44, 22, '#FFFFFF', { depth: 3, glow: 'rgba(255,190,40,' + (0.5 + 0.4 * this.pulse(1.2)) + ')', glowBlur: 14, lineWidth: 2.5 });
          this.avatarRing(x + 24, 414, 15, id); OS.sprites.drawAnimal(ctx, id, x + 24, 415, 0.8, { headOnly: true, mood: 'slack', t: this.time }); ctx.fillStyle = q.ink; ctx.font = F(14, true); ctx.fillText(OS.characters[id].name + '（' + OS.characters[id].role + '）', x + 44, 415); });
        ctx.textAlign = 'center';
      }
      for (const b of OS.ui.resultButtons(app)) this.btn(b, b.label, b.id === 'next' || (!r.win && b.id === 'retry'));
    }
    // ===== 选关页、阵容页（参考《胡闹厨房》：厚描边、硬阴影、饱和色、俏皮倾斜）=====
    softBg() {
      const { ctx } = this, t = this.time;
      ctx.fillStyle = '#FFE9C7'; ctx.fillRect(0, 0, 960, 640);
      // 斜条纹底纹
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#FFDDB0';
      for (let x = -640 + ((t * 12) % 60); x < 960; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 30 + 640, 640); ctx.lineTo(x + 640, 640); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    enter(i) { const k = Math.max(0, Math.min(1, (this.time - (this.screenStart || 0) - i * 0.04) / 0.35)); return 1 - Math.pow(1 - k, 3); }
    hovered(r) { const m = this.mouse; return !!m && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h; }
    shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
      return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
    }
    lock(x, y, col) {
      const { ctx } = this; ctx.save(); ctx.strokeStyle = col || '#8C7B6B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 4, 6, Math.PI, 0); ctx.stroke();
      T().rr(ctx, x - 9, y - 4, 18, 13, 3); ctx.fillStyle = col || '#8C7B6B'; ctx.fill(); ctx.restore();
    }
    star(x, y, r, on) {
      const { ctx } = this; ctx.save(); ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = on ? '#FFC93C' : '#E7D9C4'; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = T().OUTLINE; ctx.stroke(); ctx.restore();
    }
    // 关卡徽章（地图节点 / 标题旁）
    medal(x, y, r, color, text, locked, ring) {
      const { ctx } = this, O = T().OUTLINE;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y + 5, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(61,43,31,0.35)'; ctx.fill();   // 硬阴影
      if (ring) { ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = locked ? '#D9CFC2' : color; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = O; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.45, Math.PI * 1.05, Math.PI * 1.6); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();   // 高光
      ctx.restore();
      if (locked) this.lock(x, y + 3);
      else T().boldText(ctx, text, x, y + 1, text.length > 1 ? 18 : 21, '#FFFFFF');
    }
    // 选关地图
    select() {
      const { ctx, app } = this, c = C(), O = T().OUTLINE;
      this.softBg();
      T().logo(ctx, '一起来摸鱼', 480, 46, 44, this.time);
      OS.sprites.drawAnimal(ctx, 'cat', 300, 52, 1.1, { mood: 'slack', t: this.time, prop: 'coffee' });
      OS.sprites.drawBoss(ctx, 662, 58, 0.9, { t: this.time, look: Math.sin(this.time * 1.3) * 3 });
      const L = OS.ui.selectLayout(app), CH = ['入职篇', '升职篇', '加班篇'], CC = ['#7CD3A2', '#7DB8F0', '#B79BEA'];
      // 三个章节区域（倾斜的圆角大块）
      for (let r = 0; r < 3; r++) {
        const g = L.slice(r * 5, r * 5 + 5); if (!g.length) continue;
        const x0 = Math.min(...g.map(n => n.cx)) - 38, x1 = Math.max(...g.map(n => n.cx)) + 38;
        ctx.save(); ctx.translate((x0 + x1) / 2, 300); ctx.rotate([-0.025, 0.02, -0.02][r]);
        T().chunky(ctx, -(x1 - x0) / 2, -150, x1 - x0, 300, 28, this.shade(CC[r], 0.55), { depth: 7 });
        ctx.restore();
        ctx.save(); ctx.translate((x0 + x1) / 2, 158); ctx.rotate(-0.04);
        T().chunky(ctx, -56, -15, 112, 30, 15, CC[r], { depth: 4 }); T().boldText(ctx, CH[r], 0, 1, 16, '#FFFFFF'); ctx.restore();
      }
      // 小路：节点之间的虚线
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); L.forEach((n, i) => i ? ctx.lineTo(n.cx, n.cy) : ctx.moveTo(n.cx, n.cy)); ctx.strokeStyle = O; ctx.lineWidth = 14; ctx.stroke();
      ctx.beginPath(); L.forEach((n, i) => i ? ctx.lineTo(n.cx, n.cy) : ctx.moveTo(n.cx, n.cy)); ctx.strokeStyle = '#FFF4DE'; ctx.lineWidth = 8; ctx.setLineDash([10, 9]); ctx.stroke(); ctx.restore();
      const current = (L.find(n => app.unlocked(n.level.id) && app.progress.stars(n.level.id) === 0) || L.filter(n => app.unlocked(n.level.id)).slice(-1)[0] || L[0]);
      const hovered = L.find(n => this.hovered(n)), focus = hovered || current;
      L.forEach((n, i) => {
        const l = n.level, open = app.unlocked(l.id), st = app.progress.stars(l.id), chap = Math.min(2, Math.floor(i / 5)), k = this.enter(i);
        const isCur = n === current && st === 0 && open, hov = n === hovered && open, bob = isCur ? Math.abs(Math.sin(this.time * 3)) * 5 : 0, sc = (hov ? 1.12 : 1) * (0.6 + 0.4 * k);
        ctx.save(); ctx.globalAlpha = k; ctx.translate(n.cx, n.cy - bob); ctx.scale(sc, sc);
        this.medal(0, 0, n.r, CC[chap], String(l.id), !open, isCur || hov ? '#FFC93C' : null);
        if (l.maxCaught && open) { ctx.save(); ctx.translate(18, -24); ctx.rotate(0.15); T().chunky(ctx, -16, -9, 32, 18, 6, c.coral, { depth: 3, lineWidth: 2 }); T().boldText(ctx, '考核', 0, 0.5, 10, '#FFFFFF'); ctx.restore(); }
        ctx.restore();
        if (open) for (let s = 0; s < 3; s++) this.star(n.cx - 18 + s * 18, n.cy + n.r + 14, 7, s < st);
        if (isCur) { ctx.save(); ctx.translate(n.cx, n.cy - n.r - 22 - bob); T().chunky(ctx, -22, -11, 44, 22, 11, '#FFC93C', { depth: 3, lineWidth: 2.5 }); T().boldText(ctx, '当前', 0, 0.5, 11, '#FFFFFF'); ctx.restore(); }
      });
      // 底部信息卡：悬停的关卡（没有悬停时显示当前关卡）
      this.levelInfo(focus, app, CC);
      // 右上角：新模式入口
      const ab = OS.ui.arenaButton, ah = this.hovered(ab) ? 3 : 0;
      ctx.save(); ctx.translate(ab.x + ab.w / 2, ab.y + ab.h / 2 - ah); ctx.rotate(0.03);
      T().chunky(ctx, -ab.w / 2, -ab.h / 2, ab.w, ab.h, 16, '#FFB52E', { depth: 5 + ah, glow: 'rgba(255,190,40,' + (0.4 + 0.4 * this.pulse(1.2)) + ')', glowBlur: 14 });
      T().boldText(ctx, '摸鱼大作战 ▶', 0, 1, 16, '#FFFFFF');
      T().chunky(ctx, ab.w / 2 - 26, -ab.h / 2 - 10, 38, 18, 9, c.coral, { depth: 2, lineWidth: 2 }); T().boldText(ctx, 'NEW', ab.w / 2 - 7, -ab.h / 2 - 0.5, 10, '#FFFFFF');
      ctx.restore();
    }
    levelInfo(n, app, CC) {
      const { ctx } = this, c = C(), l = n.level, open = app.unlocked(l.id), st = app.progress.stars(l.id), chap = Math.min(2, Math.floor((l.id - 1) / 5));
      ctx.save(); ctx.translate(480, 535); ctx.rotate(-0.008);
      T().chunky(ctx, -330, -58, 660, 116, 22, '#FFFFFF', { depth: 6 });
      this.medal(-282, -6, 30, CC[chap], String(l.id), !open);
      ctx.textAlign = 'left'; T().boldText(ctx, l.name, -236, -30, 22, '#FFFFFF', T().OUTLINE, 'left');
      for (let s = 0; s < 3; s++) this.star(-226 + s * 22, 2, 9, open && s < st);
      if (!open) { ctx.fillStyle = c.inkSoft; ctx.font = F(14, true); ctx.fillText('通关上一关后解锁', -236, 30); ctx.restore(); return; }
      // 信息块：金币目标 / 时间 / 工位与房间 / 被抓规则
      const chip = (x, w, fill, draw) => { T().chunky(ctx, x, 20, w, 28, 14, fill, { depth: 3, lineWidth: 2 }); draw(x); };
      chip(-236, 96, '#FFF1D2', x => { T().coin(ctx, x + 16, 34, 8); ctx.fillStyle = c.moneyDeep; ctx.font = F(14, true); ctx.textAlign = 'left'; ctx.fillText(String(l.goal.money), x + 30, 34.5); });
      chip(-132, 78, '#E2F0FB', x => { T().clock(ctx, x + 16, 34, 7); ctx.fillStyle = c.time; ctx.font = F(14, true); ctx.textAlign = 'left'; ctx.fillText(l.timeLimit + 's', x + 28, 34.5); });
      chip(-46, 128, '#F3EDE4', x => { ctx.fillStyle = c.ink; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText(l.desks + ' 工位 · ' + (l.rooms ? l.rooms.length : 3) + ' 房间', x + 64, 34.5); });
      chip(90, 140, l.maxCaught ? '#FDE0DC' : '#F3EDE4', x => { ctx.fillStyle = l.maxCaught ? c.coral : c.inkSoft; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText(l.maxCaught ? '考核：被抓上限 ' + l.maxCaught + ' 次' : '被抓不限次数', x + 70, 34.5); });
      ctx.textAlign = 'right'; ctx.fillStyle = c.inkSoft; ctx.font = F(12); ctx.fillText('查房间隔 ' + l.boss.raidMin + '~' + l.boss.raidMax + ' 秒', 305, -30);
      T().boldText(ctx, '点击开始 ▶', 305, 2, 15, '#FFB52E', T().OUTLINE, 'right');
      ctx.restore();
      // 页脚提示
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(12); ctx.textAlign = 'center';
      ctx.fillText('鼠标悬停查看关卡 · 每关新规则开局时提示 · M 静音 · B 音乐 · 键盘 1–9/0、Shift+1–5 快速选关', 480, 625);
    }
    // 品质小宝石
    gem(x, y, r, color) {
      const { ctx } = this; ctx.save(); ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.8, y); ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = T().OUTLINE; ctx.stroke(); ctx.restore();
    }
    lineup() {
      const { ctx, app } = this, lv = app.level(), n = OS.lineup.desksOf(lv), status = app.lineupStatus(), c = C(), Q = T().QUALITY, O = T().OUTLINE;
      const CC = ['#7CD3A2', '#7DB8F0', '#B79BEA'], chap = CC[Math.min(2, Math.floor((lv.id - 1) / 5))];
      this.softBg();
      // 标题牌
      ctx.save(); ctx.translate(480, 34); ctx.rotate(-0.015);
      T().chunky(ctx, -230, -24, 460, 48, 24, '#FFFFFF', { depth: 5 }); this.medal(-200, 0, 17, chap, String(lv.id), false);
      T().boldText(ctx, lv.name + ' · 选择上场同事', 18, 1, 22, '#FFB52E'); ctx.restore();
      ctx.textAlign = 'center'; ctx.font = F(12, true); ctx.fillStyle = '#8C6B4F';
      ctx.fillText('目标 $' + lv.goal.money + ' · ' + lv.timeLimit + ' 秒' + (lv.maxCaught ? ' · 考核关：被抓上限 ' + lv.maxCaught + ' 次' : '') + '　|　房间：' + (lv.rooms || OS.DEFAULT_ROOMS).map(ROOM).join('、') + '　|　本关可用 ' + OS.lineup.pool(lv, app.progress).length + ' 人', 480, 72);
      // 已选队伍栏
      const slotW = 34, bx = 480 - (150 + n * slotW) / 2;
      T().chunky(ctx, bx - 10, 80, 170 + n * slotW, 28, 14, '#FFFFFF', { depth: 3, lineWidth: 2.5 });
      ctx.textAlign = 'left'; ctx.font = F(13, true); ctx.fillStyle = c.moneyDeep; ctx.fillText('已选 ' + app.picks.length + ' / ' + n, bx + 4, 94.5);
      for (let i = 0; i < n; i++) {
        const x = bx + 92 + i * slotW, id = app.picks[i];
        ctx.beginPath(); ctx.arc(x, 94, 11, 0, Math.PI * 2); ctx.fillStyle = id ? (Q[OS.characters[id].quality] || Q.common).ink : '#EFE6DA'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = O; ctx.stroke();
        if (id) { this.avatarRing(x, 94, 9, id); OS.sprites.drawAnimal(ctx, id, x, 95, 0.5, { headOnly: true, mood: 'slack', t: this.time }); }
      }
      const fresh = OS.intro.newChars(lv, app.levels);
      OS.ui.lineupLayout(app).forEach((cd0, i) => {
        const ch = OS.characters[cd0.id], on = app.picks.includes(cd0.id), req = (lv.required || []).includes(cd0.id), q = Q[ch.quality] || Q.common;
        const k = this.enter(i), hov = this.hovered(cd0), tilt = (i % 2 ? 1 : -1) * (on ? 0 : 0.012);
        const dim = !on && app.picks.length > 0 ? (hov ? 0.85 : 0.55) : 1;   // 已有人上场时，未上场卡片变淡，突出已上场的
        const lift = on ? 6 : hov ? 3 : 0;
        ctx.save(); ctx.globalAlpha = k * dim; ctx.translate(cd0.x + cd0.w / 2, cd0.y + cd0.h / 2 + (1 - k) * 16 - lift); ctx.rotate(tilt);
        const x = -cd0.w / 2, y = -cd0.h / 2, w = cd0.w, h = cd0.h;
        // 卡片：白底 + 品质色粗边框；已上场 = 浅绿底 + 绿色粗内框 + 绿色呼吸外发光 + 上浮 + 右上角大对勾
        T().chunky(ctx, x, y, w, h, 12, on ? '#EFFFF4' : '#FFFFFF', on
          ? { depth: 9, depthColor: '#2E8B57', glow: 'rgba(46,204,113,' + (0.75 + 0.25 * this.pulse(1.4)) + ')', glowBlur: 24 }
          : { depth: hov ? 7 : 5 });
        T().rr(ctx, x + 3.5, y + 3.5, w - 7, h - 7, 9); ctx.strokeStyle = on ? '#2ECC71' : q.ink; ctx.lineWidth = on ? 6 : 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(x + 26, y + 24, 17, 0, Math.PI * 2); ctx.fillStyle = q.ink; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = O; ctx.stroke();
        this.avatarRing(x + 26, y + 24, 13.5, cd0.id);
        OS.sprites.drawAnimal(ctx, cd0.id, x + 26, y + 25, 0.72, { headOnly: true, mood: on ? 'slack' : 'work', t: this.time });
        ctx.textAlign = 'left'; ctx.fillStyle = q.ink; ctx.font = F(15, true); ctx.fillText(ch.name, x + 50, y + 16);
        const nw = ctx.measureText(ch.name).width * 1.12; this.gem(x + 58 + nw, y + 16, 5, q.ink);
        ctx.font = F(10, true); ctx.fillStyle = q.ink; ctx.fillText(q.name, x + 66 + nw, y + 17);
        ctx.font = F(11); ctx.fillStyle = c.inkSoft; ctx.fillText(ch.role + ' · ', x + 50, y + 34);
        ctx.fillStyle = c.moneyDeep; ctx.font = F(11, true); ctx.fillText('时薪 $' + ch.wage, x + 50 + ctx.measureText(ch.role + ' · ').width * 1.1, y + 34);
        if (req) { ctx.save(); ctx.translate(x + w - (on ? 62 : 32), y + 4); ctx.rotate(0.12); T().chunky(ctx, -24, -10, 48, 20, 10, c.coral, { depth: 3, lineWidth: 2 }); T().boldText(ctx, '必须', 0, 0.5, 11, '#FFFFFF'); ctx.restore(); }
        if (on) this.check(x + w - 14, y + 8, 17, '#2ECC71');
        if (fresh.includes(cd0.id)) { ctx.save(); ctx.translate(x + 4, y - 4); ctx.rotate(-0.2); T().chunky(ctx, -18, -9, 36, 18, 9, c.coral, { depth: 2, lineWidth: 2 }); T().boldText(ctx, 'NEW', 0, 0.5, 10, '#FFFFFF'); ctx.restore(); }
        const so = ch.solo, rm = OS.ROOMS[so.room].incomeMult || 1;
        ctx.textAlign = 'left'; ctx.fillStyle = c.ink; ctx.font = F(12); ctx.fillText('普通：' + so.name + ' · ' + ROOM(so.room), x + 11, y + 56);
        ctx.fillStyle = c.inkSoft; ctx.font = F(11); ctx.fillText('停留 ' + so.stay + 's · 冷却 ' + so.cooldown + 's · 收入 ×' + (so.multiplier * rm).toFixed(1), x + 11, y + 71);
        if (ch.team) {
          const t = ch.team; ctx.fillStyle = c.epic; ctx.font = F(12, true); ctx.fillText('特殊：' + t.name + '（每关 ' + t.charges + ' 次）', x + 11, y + 83);
          ctx.fillStyle = c.epicSoft; ctx.font = F(11); ctx.fillText(Renderer.teamDesc(t) + ' · 冷却 ' + t.cooldown + 's', x + 11, y + 95);
        } else { ctx.fillStyle = '#C2B5A6'; ctx.font = F(11); ctx.fillText('特殊：无', x + 11, y + 87); }
        ctx.restore();
      });
      for (const b of OS.ui.lineupButtons) this.btn(b, b.label, b.id === 'start' && status === 'ok', b.id === 'start' && status !== 'ok');
      const why = { empty: '至少选 1 人', too_many: '超出工位数', missing_required: '缺少必须上场的同事', invalid: '阵容无效' }[status];
      if (why) { ctx.fillStyle = c.coral; ctx.font = F(13, true); ctx.textAlign = 'center'; ctx.fillText(why, 580, 534); }
      ctx.fillStyle = '#8C6B4F'; ctx.font = F(12); ctx.textAlign = 'center'; ctx.fillText('阵容会记住，下次默认沿用。绿框打勾 = 已上场；边框颜色 = 品质：普通 · 精良 · 史诗 · 传说', 480, 572);
    }
    // 大对勾徽章（阵容页已上场）
    check(x, y, r, fill) {
      const { ctx } = this; ctx.save();
      ctx.beginPath(); ctx.arc(x, y + 3, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(61,43,31,0.35)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = T().OUTLINE; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.45, y); ctx.lineTo(x - r * 0.1, y + r * 0.38); ctx.lineTo(x + r * 0.5, y - r * 0.35);
      ctx.lineWidth = r * 0.28; ctx.strokeStyle = '#FFFFFF'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
    }
    debugInfo() {
      const b = this.game.boss; this.ctx.fillStyle = C().ink; this.ctx.textAlign = 'left'; this.ctx.font = F(11);
      this.ctx.fillText('[debug] speed=x' + this.app.speed() + ' paused=' + this.app.paused + ' boss=' + b.state + ' timer=' + b.timer.toFixed(1) + ' target=' + b.target + ' slack=' + this.game.slackSeconds.toFixed(1), 10, 186);
    }
  }
  OS.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
