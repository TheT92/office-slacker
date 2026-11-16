// 场景定义（画布 960x640）。左侧场景区 x 0~722，右侧 x 730~952 为员工栏。
// 上方一排房间（每关可配置有哪些房间，自动等宽排开）；下方开放办公区：中央是 2 行 × 3 列的隔间区，
// 四周留出一圈走道，老板沿外圈走道绕行巡视。
(function (g) {
  const OS = (g.OS = g.OS || {});
  // 房间目录。capacity：个人摸鱼容量（0 = 不能摸鱼）；key：紧急召回快捷键（没有则不能召回）；
  // incomeMult：在这里摸鱼的收入倍率；travel：单程路程秒数（缺省 = balance.travelTime）；
  // noRaid：老板从不查这里；raidWeight：被选为查房目标的权重（缺省 1）；note：界面上的简短说明。
  OS.ROOMS = {
    restroom: { id: 'restroom', name: '厕所',   capacity: 2, key: 'Q', incomeMult: 1 },
    meeting:  { id: 'meeting',  name: '会议室', capacity: 0, incomeMult: 1, noRaid: true },
    pantry:   { id: 'pantry',   name: '茶水间', capacity: 2, key: 'E', incomeMult: 1 },
    printer:  { id: 'printer',  name: '打印室', capacity: 1, incomeMult: 0.6, noRaid: true, note: '老板不查 · 收入×0.6' },
    rooftop:  { id: 'rooftop',  name: '天台',   capacity: 3, key: 'W', incomeMult: 1.3, travel: 2, raidWeight: 1, note: '收入×1.3 · 路远' },
  };
  OS.DEFAULT_ROOMS = ['restroom', 'meeting', 'pantry'];
  const ROW = { x: 20, y: 56, w: 690, h: 120, gap: 20 };
  const base = {
    width: 960, height: 640, sceneW: 722,
    office: { id: 'office', name: '开放办公区', x: 20, y: 196, w: 690, h: 432 },
    maxDesks: 6, cols: 3, rows: 2, margin: 64, patrolSpeed: 110,
    // 中央隔间区（办公区四周各留 margin 作为走道）
    grid() { const o = this.zones.office, m = this.margin; return { x: o.x + m, y: o.y + m, w: o.w - 2 * m, h: o.h - 2 * m }; },
    // 6 个隔间（先上排左→右，再下排左→右）
    cells() {
      const gr = this.grid(), w = gr.w / this.cols, h = gr.h / this.rows, out = [];
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) out.push({ x: gr.x + c * w, y: gr.y + r * h, w, h });
      return out;
    },
    // 外圈走道的巡视路线：位于走道正中的矩形环
    patrolRect() { const o = this.zones.office, h = this.margin / 2; return { x: o.x + h, y: o.y + h, w: o.w - 2 * h, h: o.h - 2 * h }; },
    // 每个员工坐一个隔间，工位在隔间中心；人数少于 6 时后面的隔间空着
    deskPositions(n) { return this.cells().slice(0, n).map(c => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 + 6 })); },
    // 老板巡视位置（只用于画面，不影响判定）：沿外圈走道顺时针匀速绕行
    patrolPos(t) {
      const r = this.patrolRect(), per = 2 * (r.w + r.h);
      let d = ((t * this.patrolSpeed) % per + per) % per;
      if (d < r.w) return { x: r.x + d, y: r.y }; d -= r.w;
      if (d < r.h) return { x: r.x + r.w, y: r.y + d }; d -= r.h;
      if (d < r.w) return { x: r.x + r.w - d, y: r.y + r.h }; d -= r.w;
      return { x: r.x, y: r.y + r.h - d };
    },
    center(id) { const z = this.zones[id]; return { x: z.x + z.w / 2, y: z.y + z.h / 2 }; },
    roomIds() { return this.rooms.slice(); },
    // 可召回的房间（有快捷键的摸鱼房间）
    recallRooms() { return this.rooms.map(id => this.zones[id]).filter(z => z.capacity > 0 && z.key); },
    // 老板会查的房间（可摸鱼且不是 noRaid），保持房间顺序
    raidRooms() { return this.rooms.map(id => this.zones[id]).filter(z => z.capacity > 0 && !z.noRaid); },
    // 单程路程
    travelOf(room, fallback) { const z = this.zones[room]; return (z && z.travel) || fallback; },
  };
  // 按房间列表生成一张地图：房间在上方一行等宽排开
  OS.makeMap = function (rooms) {
    rooms = (rooms && rooms.length ? rooms : OS.DEFAULT_ROOMS).slice();
    const m = Object.create(base), n = rooms.length, w = (ROW.w - (n - 1) * ROW.gap) / n;
    m.rooms = rooms; m.zones = { office: base.office };
    rooms.forEach((id, i) => { m.zones[id] = Object.assign({}, OS.ROOMS[id], { x: ROW.x + i * (w + ROW.gap), y: ROW.y, w, h: ROW.h }); });
    return m;
  };
  OS.map = OS.makeMap(OS.DEFAULT_ROOMS);   // 默认地图（第 1–10 关）
})((typeof window!=="undefined"?window:globalThis));
