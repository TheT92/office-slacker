// 布局 + 点击命中检测（渲染与输入共用同一份布局）。
(function (g) {
  const OS = (g.OS = g.OS || {});
  // 右侧员工栏：上区"特殊技能"大卡片（可点击释放），分割线下方"其他同事"紧凑行（只显示状态）
  const PANEL = { x: 730, y: 50, w: 222, cardH: 118, cardHCompact: 92, rowH: 46, gap: 6, headH: 22 };
  const inside = (r, px, py) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  function panelLayout(game) {
    const { x, w, rowH, gap, headH } = PANEL;
    const specials = game.employees.filter(e => e.team), others = game.employees.filter(e => !e.team);
    const cardH = specials.length >= 3 ? PANEL.cardHCompact : PANEL.cardH;   // 特殊技能角色多时压缩卡片
    let y = PANEL.y; const out = { cards: [], rows: [], heads: [] };
    if (specials.length) {
      out.heads.push({ label: '特殊技能（点击卡片释放）', x, y, w, h: headH }); y += headH + 2;
      specials.forEach((e, k) => { out.cards.push({ e, k, x, y, w, h: cardH }); y += cardH + gap; });
    }
    if (others.length) {
      if (specials.length) y += 4;
      out.heads.push({ label: '其他同事（普通技能自动）', x, y, w, h: headH, divider: specials.length > 0 }); y += headH + 2;
      others.forEach(e => { out.rows.push({ e, x, y, w, h: rowH }); y += rowH + 4; });
    }
    return out;
  }
  // 可点击召回的房间（本关地图里有召回键的房间）
  const recallRooms = game => (game ? game.map : OS.map).recallRooms();
  // HUD 右上角：暂停 / 倍速 / 选关
  const pauseButton = { x: 676, y: 6, w: 100, h: 32 };
  const speedButton = { x: 782, y: 6, w: 96, h: 32 };
  const menuButton = { x: 884, y: 6, w: 66, h: 32 };
  // 暂停遮罩上的按钮（居中于场景区）
  const soundButton = { x: 592, y: 6, w: 78, h: 32 };
  const pauseButtons = [{ id: 'resume', label: '继续 [P]' }, { id: 'intro', label: '本关说明 [I]' }, { id: 'retry', label: '重来 [R]' }, { id: 'select', label: '选关 [Esc]' }, { id: 'music', label: '背景音乐 [B]' }]
    .map((b, i) => Object.assign(b, { x: 363 - 90, y: 262 + i * 52, w: 180, h: 42 }));
  // "本关新内容"弹框的按钮（点弹框任意位置也可关闭）
  const introButton = { x: 480 - 85, y: 500, w: 170, h: 44 };
  // 选关界面：每行 5 张卡片
  // 选关地图：关卡节点沿一条弯曲小路排开（参考《胡闹厨房》的关卡地图），返回每个节点的点击区域
  const NODE_R = 26;
  function nodePos(i, n) { const groups = Math.ceil(n / 5) - 1, step = (820 - groups * 40) / Math.max(1, n - 1), x = 70 + i * step + Math.floor(i / 5) * 40, y = 300 + Math.sin(i * 0.95 + 0.4) * 92; return { x, y }; }   // 章节之间多留 40px
  function selectLayout(app) {
    const n = app.levels.length;
    return app.levels.map((l, i) => { const p = nodePos(i, n); return { level: l, cx: p.x, cy: p.y, r: NODE_R, x: p.x - NODE_R, y: p.y - NODE_R, w: NODE_R * 2, h: NODE_R * 2 }; });
  }
  // 阵容界面：只列出本关允许且已解锁的角色，每行 4 张卡片（最多 3 行）+ 开始/返回按钮
  function lineupLayout(app) {
    const ids = OS.lineup.pool(app.level(), app.progress), per = 4, w = 214, h = 108, gap = 10, x0 = (960 - (per * w + (per - 1) * gap)) / 2;
    return ids.map((id, i) => ({ id, i, x: x0 + (i % per) * (w + gap), y: 112 + Math.floor(i / per) * (h + 8), w, h }));
  }
  const lineupButtons = [{ id: 'back', label: '返回 [Esc]', x: 300, y: 470, w: 160, h: 44 }, { id: 'start', label: '开始 [Enter]', x: 500, y: 470, w: 160, h: 44 }];
  // 结算界面按钮
  function resultButtons(app) {
    const list = [];
    if (app.result && app.result.win && app.hasNext()) list.push({ id: 'next', label: '下一关 [N]' });
    list.push({ id: 'retry', label: (app.result && app.result.win ? '重玩' : '重试') + ' [R]' });
    if (app.canPick()) list.push({ id: 'lineup', label: '换阵容 [L]' });
    list.push({ id: 'select', label: '选关 [Esc]' });
    const w = 150, gap = 16, x0 = (960 - (list.length * w + (list.length - 1) * gap)) / 2;
    return list.map((b, i) => Object.assign(b, { x: x0 + i * (w + gap), y: 470, w, h: 44 }));
  }
  // 游戏中命中检测。paused 时只响应暂停遮罩按钮和 HUD 的暂停/选关。
  function hitTest(game, px, py, paused) {
    if (inside(menuButton, px, py)) return { type: 'select' };
    if (inside(pauseButton, px, py)) return { type: 'pause' };
    if (inside(soundButton, px, py)) return { type: 'sound' };
    if (paused) { const b = pauseButtons.find(b => inside(b, px, py)); return b ? { type: 'pausemenu', id: b.id } : null; }
    if (inside(speedButton, px, py)) return { type: 'speed' };
    const room = recallRooms(game).find(z => inside(z, px, py)); if (room) return { type: 'recall', room: room.id };
    const c = panelLayout(game).cards.find(c => inside(c, px, py)); if (c) return { type: 'team', id: c.e.id };
    return null;
  }
  const hitSelect = (app, px, py) => { const c = selectLayout(app).find(c => inside(c, px, py)); return c ? c.level.id : null; };
  const hitResult = (app, px, py) => { const b = resultButtons(app).find(b => inside(b, px, py)); return b ? b.id : null; };
  function hitLineup(app, px, py) {
    const b = lineupButtons.find(b => inside(b, px, py)); if (b) return { type: b.id };
    const c = lineupLayout(app).find(c => inside(c, px, py)); return c ? { type: 'char', id: c.id } : null;
  }
  // 选关页右上角：进入新模式「摸鱼大作战」（arena.html）
  const arenaButton = { x: 796, y: 18, w: 150, h: 46 };
  OS.ui = { arenaButton, PANEL, panelLayout, recallRooms, pauseButton, soundButton, introButton, introButton, speedButton, menuButton, pauseButtons, selectLayout, lineupLayout, lineupButtons, resultButtons, hitTest, hitSelect, hitResult, hitLineup };
})(typeof window !== "undefined" ? window : globalThis);
