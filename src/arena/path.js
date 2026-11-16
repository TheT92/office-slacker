// 网格工具与寻路（8 方向 A*，不允许斜穿墙角；结果做视线平滑，走起来不僵硬）。
(function (root) {
  const OS = root.OS = root.OS || {};
  const A = OS.arena = OS.arena || {};

  // 把地图字符串解析成格子信息
  function buildGrid(map) {
    const rows = map.length, cols = map[0].length, cells = [];
    const zoneOf = {}, doorOf = {};
    for (const id in A.ROOMS) { zoneOf[A.ROOMS[id].zone] = id; if (A.ROOMS[id].stairs) zoneOf[A.ROOMS[id].stairs] = id; doorOf[A.ROOMS[id].door] = id; }
    const doors = {};
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ch = map[r][c];
      const cell = { c, r, ch, wall: ch === '#' || ch === 'k', desk: ch === 'k', room: zoneOf[ch] || null, door: doorOf[ch] || null, stairs: false };
      if (cell.room && A.ROOMS[cell.room].stairs === ch) cell.stairs = true;
      if (cell.door) doors[cell.door] = { c, r };
      cells.push(cell);
    }
    const g = { rows, cols, cells, doors };
    g.at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? null : cells[r * cols + c]);
    g.cellAt = (x, y) => g.at(Math.floor(x), Math.floor(y));
    // 房间里的格子（不含楼梯）、门外一格（办公区一侧）
    g.roomCells = id => cells.filter(k => k.room === id && !k.stairs);
    g.outside = id => { const d = doors[id]; for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const k = g.at(d.c + dc, d.r + dr); if (k && !k.wall && !k.room && !k.door) return { x: k.c + 0.5, y: k.r + 0.5 }; } return null; };
    g.inside = id => { const d = doors[id]; for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const k = g.at(d.c + dc, d.r + dr); if (k && k.room === id) return { x: k.c + 0.5, y: k.r + 0.5 }; } return null; };
    return g;
  }

  // A*：pass(cell) 判断某格能否通过；返回格子中心点列表（不含起点），找不到返回 null
  function findPath(g, sx, sy, tx, ty, pass) {
    const s = g.cellAt(sx, sy), t = g.cellAt(tx, ty);
    if (!s || !t || !pass(t)) return null;
    const key = k => k.r * g.cols + k.c, open = [s], came = new Map(), gs = new Map([[key(s), 0]]), fs = new Map();
    const h = k => Math.hypot(k.c - t.c, k.r - t.r);
    fs.set(key(s), h(s)); const closed = new Set();
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (fs.get(key(open[i])) < fs.get(key(open[bi]))) bi = i;
      const cur = open.splice(bi, 1)[0], ck = key(cur);
      if (cur === t) {
        const out = []; let k = cur; while (k !== s) { out.unshift({ x: k.c + 0.5, y: k.r + 0.5 }); k = came.get(key(k)); }
        return out;
      }
      closed.add(ck);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const n = g.at(cur.c + dc, cur.r + dr); if (!n || closed.has(key(n)) || !pass(n)) continue;
        if (dc && dr) { const a = g.at(cur.c + dc, cur.r), b = g.at(cur.c, cur.r + dr); if (!a || !b || !pass(a) || !pass(b)) continue; }   // 不斜穿墙角
        const cost = gs.get(ck) + (dc && dr ? Math.SQRT2 : 1) * (n.stairs ? 2 : 1), nk = key(n);
        if (gs.has(nk) && cost >= gs.get(nk)) continue;
        came.set(nk, cur); gs.set(nk, cost); fs.set(nk, cost + h(n));
        if (!open.includes(n)) open.push(n);
      }
    }
    return null;
  }

  // 两点之间是否一路可通（按 0.2 格采样，带碰撞半径）
  function clearLine(g, ax, ay, bx, by, pass, rad) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      for (const [ox, oy] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]]) { const k = g.cellAt(x + ox, y + oy); if (!k || !pass(k)) return false; }
    }
    return true;
  }
  // 视线平滑：能直接走到的中间点就跳过
  function smooth(g, sx, sy, pts, pass, rad) {
    if (!pts || pts.length < 2) return pts;
    const out = []; let ax = sx, ay = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !clearLine(g, ax, ay, pts[j].x, pts[j].y, pass, rad)) j--;
      out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j + 1;
    }
    return out;
  }

  A.buildGrid = buildGrid; A.findPath = findPath; A.smooth = smooth; A.clearLine = clearLine;
})(typeof window !== 'undefined' ? window : globalThis);
