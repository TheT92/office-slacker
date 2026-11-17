// 摸鱼大作战 3D 画面（B4，动森风格）：按 A.MAP 自动搭出办公区、四个房间、工位，以及动物角色模型。
// 普通 <script>（全局 THREE），不需要打包，双击 arena.html 也能运行。坐标：x = 列，z = 行，1 格 = 1 单位，y 朝上。
(function (root) {
  const OS = (root.OS = root.OS || {}); const A = (OS.arena = OS.arena || {});
  const W3 = (A.W3 = {});

  // ---------- 几何 / 材质小工具 ----------
  function roundedBox(T, w, h, d, r, seg) {   // 圆角盒子（只改顶点和法线，UV 沿用普通盒子）
    seg = (seg || 3) * 2 + 1; r = Math.min(r, w / 2, h / 2, d / 2);
    const g = new T.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed(), p = g.attributes.position.array, n = g.attributes.normal.array;
    const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r, hs = 0.5 / seg, v = new T.Vector3();
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i] - Math.sign(p[i]) * hs, p[i + 1] - Math.sign(p[i + 1]) * hs, p[i + 2] - Math.sign(p[i + 2]) * hs).normalize();
      const sx = Math.sign(p[i]), sy = Math.sign(p[i + 1]), sz = Math.sign(p[i + 2]);
      p[i] = bx * sx + v.x * r; p[i + 1] = by * sy + v.y * r; p[i + 2] = bz * sz + v.z * r; n[i] = v.x; n[i + 1] = v.y; n[i + 2] = v.z;
    }
    return g;
  }
  function canvasTex(T, w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }
  const seeded = s => () => ((s = (s * 16807) % 2147483647) / 2147483647);

  W3.Kit = function (T) {
    const cache = {}, geo = {};
    const M = (col, o) => { o = o || {}; const k = col + '|' + (o.map ? o.map.uuid : '') + '|' + (o.em || '') + (o.emI || '') + (o.op || '') + (o.rough || ''); return cache[k] || (cache[k] = new T.MeshStandardMaterial({ color: col, roughness: o.rough ?? 0.85, metalness: 0, map: o.map || null, emissive: o.em || '#000000', emissiveIntensity: o.emI ?? 1, transparent: o.op != null, opacity: o.op ?? 1 })); };
    const G = (key, mk) => geo[key] || (geo[key] = mk());
    const mesh = (g, m, x, y, z, parent, shadow) => { const o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = shadow !== false; o.receiveShadow = true; if (parent) parent.add(o); return o; };
    const k = {
      T, M, mesh,
      rbox: (w, h, d, col, o, r) => new T.Mesh(G(`rb${w},${h},${d},${r}`, () => roundedBox(T, w, h, d, r ?? 0.07, 3)), M(col, o)),
      sph: (r, col, o, seg) => new T.Mesh(G(`s${r},${seg}`, () => new T.SphereGeometry(r, seg || 24, Math.round((seg || 24) * 0.75))), M(col, o)),
      cyl: (r1, r2, h, col, o, seg) => new T.Mesh(G(`c${r1},${r2},${h},${seg}`, () => new T.CylinderGeometry(r1, r2, h, seg || 20)), M(col, o)),
      cap: (r, l, col, o) => new T.Mesh(G(`p${r},${l}`, () => new T.CapsuleGeometry(r, l, 6, 14)), M(col, o)),
      cone: (r, h, col, o) => new T.Mesh(G(`k${r},${h}`, () => new T.ConeGeometry(r, h, 16)), M(col, o)),
      plane: (w, h, col, o) => new T.Mesh(G(`pl${w},${h}`, () => new T.PlaneGeometry(w, h)), M(col, o)),
      at(o, x, y, z, parent, ry) { o.position.set(x, y, z); if (ry) o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; (parent || this.root).add(o); return o; },
    };
    return k;
  };

  // ---------- 纹理 ----------
  W3.textures = function (T) {
    const rnd = seeded(7);
    const wood = (cols, seam) => canvasTex(T, 512, 512, (x, w) => {
      for (let r = 0; r < 8; r++) { let xx = -rnd() * 200; while (xx < w) { const L = 150 + rnd() * 220; x.fillStyle = cols[Math.floor(rnd() * cols.length)]; x.fillRect(xx, r * 64, L, 64); x.strokeStyle = seam + '30'; x.lineWidth = 1.2; for (let q = 0; q < 5; q++) { const y0 = r * 64 + 8 + rnd() * 48; x.beginPath(); x.moveTo(xx, y0); x.bezierCurveTo(xx + L * 0.3, y0 + rnd() * 6 - 3, xx + L * 0.6, y0 + rnd() * 6 - 3, xx + L, y0); x.stroke(); } x.fillStyle = seam + '70'; x.fillRect(xx, r * 64, 2, 64); xx += L; } x.fillStyle = seam + '60'; x.fillRect(0, r * 64, w, 2); }
    }, [1, 1]);
    const tiles = (a, b, n, grout) => canvasTex(T, 256, 256, (x, w) => { const s = w / n; for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) { x.fillStyle = (r + k) % 2 ? b : a; x.fillRect(k * s, r * s, s, s); x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(k * s + s * 0.08, r * s + s * 0.08, s * 0.35, s * 0.08); } x.strokeStyle = grout; x.lineWidth = 2; for (let k = 0; k <= n; k++) { x.beginPath(); x.moveTo(k * s, 0); x.lineTo(k * s, w); x.moveTo(0, k * s); x.lineTo(w, k * s); x.stroke(); } }, [1, 1]);
    const paper = (base, stripe, dot) => canvasTex(T, 256, 256, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); x.fillStyle = stripe; for (let k = 0; k < 8; k++) x.fillRect(k * 32, 0, 13, h); if (dot) { x.fillStyle = dot; for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { x.beginPath(); x.arc(k * 32 + 6.5, r * 32 + 16, 3, 0, 7); x.fill(); } } }, [1, 1]);
    return {
      office: wood(['#D9DCE1', '#D1D5DB', '#DFE2E6'], '#6E7682'),
      deck: wood(['#D9B48A', '#CFA67A', '#E2BE94'], '#7A5432'),
      pantry: tiles('#FFF8EC', '#9FD3C8', 4, 'rgba(0,0,0,0.1)'),
      print: tiles('#E8EEF6', '#D6E0EE', 4, 'rgba(60,80,110,0.15)'),
      toilet: tiles('#F2FBFB', '#CDEDEE', 8, 'rgba(60,120,130,0.18)'),
      wallOffice: paper('#FFF4DE', '#FFE8C4', '#F7B8A8'),
      wallPantry: paper('#EFFAF4', '#DDF2E8', '#9FD3C8'),
      wallPrint: paper('#EEF3FA', '#DFE8F5', null),
      wallToilet: tiles('#E2F6F7', '#FFFFFF', 6, 'rgba(60,120,130,0.2)'),
      books: canvasTex(T, 256, 64, (x, w, h) => { let xx = 0; const cols = ['#F28C8C', '#8CC8F2', '#FFD98A', '#A8E0A0', '#C8A8F0', '#FFB27A', '#F4F4F4']; while (xx < w) { const bw = 10 + rnd() * 10, bh = 40 + rnd() * 22; x.fillStyle = cols[Math.floor(rnd() * cols.length)]; x.fillRect(xx, h - bh, bw - 1.5, bh); x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillRect(xx + 2, h - bh + 6, bw - 6, 3); xx += bw; } }),
      screen: [0, 1, 2, 3].map(seed => canvasTex(T, 128, 80, (x, w, h) => { x.fillStyle = '#5FB8F0'; x.fillRect(0, 0, w, h); const cols = ['#FFFFFF', '#FFE36E', '#FF9EC7', '#B8FFB0']; for (let k = 0; k < 7; k++) { x.fillStyle = cols[(k + seed) % 4]; x.fillRect(10 + (k % 3) * 6, 10 + k * 9, 30 + ((k * 13 + seed * 7) % 50), 4); } })),
      sky: canvasTex(T, 256, 160, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7FD0FF'); g.addColorStop(1, '#DFF6FF'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#FFFFFF'; for (const [cx, cy, r] of [[50, 50, 18], [72, 44, 24], [96, 52, 16], [190, 70, 14], [208, 64, 18]]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); } x.fillStyle = '#9FD08A'; for (let k = 0; k < 12; k++) { x.beginPath(); x.arc(k * 24, h - 6, 20 + (k % 3) * 6, 0, 7); x.fill(); } }),
      poster: canvasTex(T, 96, 128, (x) => { x.fillStyle = '#FFE6A8'; x.fillRect(0, 0, 96, 128); x.fillStyle = '#F28C7A'; x.beginPath(); x.arc(48, 56, 28, 0, 7); x.fill(); x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(48, 56, 14, 0, 7); x.fill(); x.fillStyle = '#7AA8E8'; x.fillRect(16, 100, 64, 8); x.fillRect(26, 112, 44, 6); }),
      rug: canvasTex(T, 256, 256, (x, w) => { x.fillStyle = '#C8DDF2'; x.fillRect(0, 0, w, w); x.strokeStyle = '#FFFFFF'; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, w - 28); x.strokeStyle = '#A8C4E4'; x.lineWidth = 6; x.strokeRect(34, 34, w - 68, w - 68); x.fillStyle = '#FFFFFF'; for (let k = 0; k < 5; k++) for (let q = 0; q < 5; q++) { x.beginPath(); x.arc(60 + k * 34, 60 + q * 34, 4, 0, 7); x.fill(); } }),
    };
  };

  // ---------- 地图 ----------
  // 墙：挨着地面的墙格才画；地面在它下方（z 更大）= 后墙，画高（看得到墙纸）；其他方向的墙画矮（剖开的娃娃屋）
  W3.buildMap = function (kit, grid, tx) {
    const T = kit.T, root = new T.Group(); kit.root = root;
    const zoneOf = k => (k.room || k.door || (k.wall ? null : 'office'));
    // 地面：每个区域一块平面，纹理按格数平铺
    const zones = {};
    for (const k of grid.cells) { if (k.wall) continue; const z = k.stairs ? 'stairs' : k.door ? 'office' : (k.room || 'office'); (zones[z] = zones[z] || []).push(k); }
    const floorTex = { office: tx.office, print: tx.print, pantry: tx.pantry, toilet: tx.toilet, rooftop: tx.deck, stairs: tx.deck };
    for (const id in zones) {
      const cs = zones[id];
      if (id === 'office') {   // 办公区 + 门：按行拼成长条，避免盖住墙
        const rows = {}; for (const k of cs) (rows[k.r] = rows[k.r] || []).push(k.c);
        for (const r in rows) { const cols = rows[r].sort((a, b) => a - b); let s = cols[0], p = s; for (const c of cols.slice(1).concat([Infinity])) { if (c !== p + 1) { const w = p - s + 1, t = floorTex.office.clone(); t.needsUpdate = true; t.repeat.set(w / 3, 1 / 3); t.offset.set(s / 3, (+r) / 3); const pl = kit.mesh(new T.PlaneGeometry(w, 1), kit.M('#FFFFFF', { map: t }), s + w / 2, 0, +r + 0.5, root, false); pl.rotation.x = -Math.PI / 2; s = c; } p = c; } }
        continue;
      }
      const c0 = Math.min(...cs.map(k => k.c)), c1 = Math.max(...cs.map(k => k.c)) + 1, r0 = Math.min(...cs.map(k => k.r)), r1 = Math.max(...cs.map(k => k.r)) + 1, t = floorTex[id].clone(); t.needsUpdate = true;
      const per = id === 'toilet' ? 2 : id === 'rooftop' || id === 'stairs' ? 3 : 2; t.repeat.set((c1 - c0) / per, (r1 - r0) / per);
      const pl = kit.mesh(new T.PlaneGeometry(c1 - c0, r1 - r0), kit.M('#FFFFFF', { map: t }), (c0 + c1) / 2, 0.002, (r0 + r1) / 2, root, false); pl.rotation.x = -Math.PI / 2;
      if (id === 'stairs') for (let i = 0; i < 4; i++) kit.at(kit.rbox(c1 - c0, 0.06, 0.16, '#B88E62', {}, 0.02), (c0 + c1) / 2, 0.03, r0 + 0.12 + i * 0.25, root);
    }
    // 地基（整张地图下面一块厚板）
    kit.at(kit.rbox(grid.cols + 0.6, 0.6, grid.rows + 0.6, '#C8CDD6', {}, 0.15), grid.cols / 2, -0.32, grid.rows / 2, root);
    // 墙
    const near = k => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const n = grid.at(k.c + dc, k.r + dr); if (n && !n.wall) return zoneOf(n); } return null; };
    const wallCol = { office: '#FFF1D8', print: '#E8F0FA', pantry: '#E8F7EF', toilet: '#DDF3F4', rooftop: '#E6D6C0' };
    const wallTex = { office: tx.wallOffice, print: tx.wallPrint, pantry: tx.wallPantry, toilet: tx.wallToilet };
    const groups = {}; root.userData.walls = [];
    for (const k of grid.cells) {
      if (!k.wall || k.desk) continue; const z = near(k); if (!z) continue;
      const below = grid.at(k.c, k.r + 1), back = below && !below.wall && !(below.stairs) && z !== 'rooftop';
      const key = (back ? 'H' : 'L') + z; (groups[key] = groups[key] || []).push(k);
    }
    for (const key in groups) {
      const tall = key[0] === 'H', z = key.slice(1), h = tall ? 2.1 : 0.42, list = groups[key];
      const g = roundedBox(T, 1.001, h, 1.001, 0.02, 1);
      const mat = tall && wallTex[z] ? kit.M('#FFFFFF', { map: wallTex[z] }) : kit.M(z === 'rooftop' ? '#C9B49A' : wallCol[z] || '#FFF1D8');
      const im = new T.InstancedMesh(g, mat, list.length), m4 = new T.Matrix4(); im.castShadow = im.receiveShadow = true;
      list.forEach((k, i) => { m4.makeTranslation(k.c + 0.5, h / 2, k.r + 0.5); im.setMatrixAt(i, m4); }); root.add(im);
      // 墙顶压条（动森那种奶油色收边）
      const cap = new T.InstancedMesh(roundedBox(T, 1.04, 0.08, 1.04, 0.02, 1), kit.M(tall ? '#E8C9A0' : '#F2DCC0'), list.length);
      list.forEach((k, i) => { m4.makeTranslation(k.c + 0.5, h + 0.04, k.r + 0.5); cap.setMatrixAt(i, m4); }); cap.castShadow = true; root.add(cap);
      if (tall) root.userData.walls.push({ im, cap, list, h, low: list.map(() => false) });
    }
    // 踢脚线（后墙底部）
    for (const key in groups) if (key[0] === 'H') for (const k of groups[key]) kit.at(kit.rbox(1, 0.14, 0.05, '#E8C79A', {}, 0.01), k.c + 0.5, 0.07, k.r + 1.02, root);
    return root;
  };
  // 剖开：挡在镜头前面的高墙压矮（进房间后看得到整个房间）。pred(cell) 为 true 的墙格变矮，其他恢复
  W3.cutaway = function (T, mapRoot, pred) {
    const m4 = new T.Matrix4();
    for (const w of mapRoot.userData.walls) {
      let dirty = false;
      w.list.forEach((k, i) => {
        const low = !!pred(k); if (low === w.low[i]) return; w.low[i] = low; dirty = true;
        const sy = low ? 0.2 : 1, h = w.h * sy;
        m4.makeScale(1, sy, 1).setPosition(k.c + 0.5, h / 2, k.r + 0.5); w.im.setMatrixAt(i, m4);
        m4.makeTranslation(k.c + 0.5, h + 0.04, k.r + 0.5); w.cap.setMatrixAt(i, m4);
      });
      if (dirty) { w.im.instanceMatrix.needsUpdate = true; w.cap.instanceMatrix.needsUpdate = true; }
    }
  };

  // ---------- 家具 ----------
  W3.furnish = function (kit, grid, tx) {
    const T = kit.T, root = new T.Group(); kit.root = root; const { rbox, sph, cyl, cone, plane } = kit;
    const at = (o, x, y, z, ry) => kit.at(o, x, y, z, root, ry);
    const plant = (x, z, s, pot, y) => { const g = new T.Group(); kit.at(cyl(0.22 * s, 0.17 * s, 0.4 * s, pot || '#F2A06A'), 0, 0.2 * s, 0, g); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, l = sph(0.2 * s, i % 3 ? '#7CCB6A' : '#9ADB78', {}, 12); l.scale.set(1, 0.6, 1.6); l.rotation.set(0, a, 0.5); kit.at(l, Math.cos(a) * 0.18 * s, 0.55 * s + (i % 3) * 0.12 * s, Math.sin(a) * 0.18 * s, g); } kit.at(sph(0.22 * s, '#8ED46E', {}, 12), 0, 0.75 * s, 0, g); g.position.set(x, y || 0, z); root.add(g); return g; };
    const onWall = (o, x, y, z) => at(o, x, y, z);
    // —— 办公区 ——
    // 后墙（第 5 行）上的窗户、海报、挂钟，墙前的书架、饮水机、文件柜、绿植（都贴着墙、不占走路的格子太多）
    for (const wx of [11, 24.5]) { onWall(rbox(3.4, 1.3, 0.12, '#FFFFFF'), wx, 1.25, 6.02); const sk = plane(3.1, 1.05, '#FFFFFF', { map: tx.sky, em: '#FFFFFF', emI: 0.5 }); onWall(sk, wx, 1.25, 6.09); onWall(rbox(0.06, 1.05, 0.06, '#FFFFFF'), wx, 1.25, 6.1); onWall(rbox(3.6, 0.08, 0.26, '#FFFFFF'), wx, 0.58, 6.12); }
    onWall(rbox(0.7, 0.9, 0.05, '#B8E0A0'), 14.6, 1.35, 6.03); onWall(plane(0.56, 0.72, '#FFFFFF', { map: tx.poster }), 14.6, 1.35, 6.06);
    const clk = onWall(cyl(0.26, 0.26, 0.06, '#FF9E8A'), 21, 1.55, 6.04); clk.rotation.x = Math.PI / 2; const cf = onWall(cyl(0.2, 0.2, 0.02, '#FFFFFF'), 21, 1.55, 6.08); cf.rotation.x = Math.PI / 2;
    const shelf = (x, z, ry) => { const g = new T.Group(); kit.at(rbox(1.2, 1.9, 0.42, '#E8B888'), 0, 0.95, 0, g); for (let i = 0; i < 3; i++) { kit.at(plane(1.0, 0.42, '#FFFFFF', { map: tx.books }), 0, 0.45 + i * 0.58, 0.215, g); kit.at(rbox(1.08, 0.05, 0.38, '#D9A070'), 0, 0.2 + i * 0.58, 0.02, g); } g.position.set(x, 0, z); g.rotation.y = ry || 0; root.add(g); g.traverse(o => { o.castShadow = o.receiveShadow = true; }); };
    shelf(8.75, 6.25); shelf(27.25, 6.25);
    at(rbox(0.45, 0.8, 0.45, '#F4F4F4'), 26.0, 0.4, 6.28); at(cyl(0.18, 0.18, 0.42, '#9AD8FF', { op: 0.85 }), 26.0, 1.02, 6.28);
    at(rbox(0.7, 1.05, 0.5, '#B8C8D8'), 9.9, 0.52, 6.28);
    plant(8.4, 23.5, 1.2); plant(27.6, 23.5, 1.2); plant(8.4, 11.4, 1.0); plant(27.6, 11.4, 1.0); plant(8.4, 19.6, 1.0); plant(27.6, 19.6, 1.0);
    // 工位区下面一块地毯
    const rug = plane(8, 7.6, '#FFFFFF', { map: tx.rug }); rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true; rug.position.set(18.5, 0.006, 15); root.add(rug);
    // 工位
    const deskCols = ['#7AA8E8', '#F2A07A', '#A8D890', '#C8A8F0'];
    for (const d of A.DESKS) {
      const x = d.c + 1, z = d.r + 0.5, g = new T.Group(); g.position.set(x, 0, z); root.add(g);
      const P = (o, a, b, c) => kit.at(o, a, b, c, g);
      P(rbox(1.85, 0.08, 0.9, '#F2C894'), 0, 0.76, 0); for (const dx of [-0.82, 0.82]) P(rbox(0.08, 0.72, 0.78, '#E0B07A'), dx, 0.38, 0);
      P(rbox(1.7, 0.5, 0.05, '#E8D2B0'), 0, 0.5, -0.38);   // 挡板
      P(rbox(0.72, 0.46, 0.06, '#3A4258'), 0, 1.13, -0.2); P(plane(0.62, 0.37, '#FFFFFF', { map: tx.screen[d.id % 4], em: '#FFFFFF', emI: 0.55 }), 0, 1.13, -0.165); P(cyl(0.03, 0.03, 0.2, '#3A4258'), 0, 0.89, -0.24); P(rbox(0.26, 0.03, 0.18, '#3A4258'), 0, 0.81, -0.24);
      P(rbox(0.5, 0.03, 0.16, '#F4F4F4'), 0, 0.81, 0.12); P(rbox(0.08, 0.03, 0.12, '#F4F4F4'), 0.38, 0.81, 0.14);
      P(cyl(0.06, 0.05, 0.12, deskCols[d.id]), 0.65, 0.86, 0.08); P(rbox(0.32, 0.04, 0.24, '#FFFFFF'), -0.6, 0.82, 0.06); P(rbox(0.32, 0.02, 0.24, '#FFF6E0'), -0.58, 0.85, 0.04);
      if (d.id % 2 === 0) { P(cyl(0.02, 0.02, 0.35, '#3A3A3A'), -0.78, 0.98, -0.25); P(cone(0.12, 0.14, '#FFE08A', { em: '#FFD27A', emI: 0.35 }), -0.78, 1.2, -0.25); }
      else plant(x + 0.7, z - 0.25, 0.32, '#FFFFFF', 0.8);
      // 椅子（座位格上方一点，在桌子前）
      P(rbox(0.56, 0.1, 0.5, deskCols[d.id]), 0, 0.48, 0.85); P(rbox(0.56, 0.56, 0.1, deskCols[d.id]), 0, 0.8, 1.1); P(cyl(0.04, 0.04, 0.4, '#666'), 0, 0.25, 0.85); P(cyl(0.25, 0.25, 0.04, '#666'), 0, 0.05, 0.85);
      g.traverse(o => { o.castShadow = o.receiveShadow = true; });
    }
    // —— 打印室（上，列 15-20、行 1-4） ——
    onWall(rbox(0.8, 1.0, 0.05, '#7AA8E8'), 15.9, 1.35, 1.03); onWall(plane(0.64, 0.82, '#FFFFFF', { map: tx.poster }), 15.9, 1.35, 1.06);
    const copier = new T.Group(); copier.position.set(18, 0, 1.55); root.add(copier);
    kit.at(rbox(1.5, 0.9, 0.95, '#E4E8EE'), 0, 0.45, 0, copier); kit.at(rbox(1.5, 0.22, 0.95, '#C9D0DA'), 0, 1.0, 0, copier); kit.at(rbox(0.9, 0.05, 0.6, '#FFFFFF'), 0, 1.13, 0.05, copier);
    kit.at(rbox(0.4, 0.14, 0.2, '#3A4258'), 0.45, 1.06, 0.4, copier); kit.at(sph(0.035, '#5FD36A', { em: '#5FD36A' }), 0.6, 1.1, 0.5, copier); kit.at(sph(0.035, '#FFC93C', { em: '#FFC93C' }), 0.52, 1.1, 0.5, copier);
    for (const y of [0.35, 0.62]) kit.at(rbox(1.3, 0.05, 0.05, '#9BA6B6'), 0, y, 0.48, copier);
    copier.traverse(o => { o.castShadow = o.receiveShadow = true; });
    at(rbox(1.0, 1.4, 0.5, '#C99A6A'), 20.4, 0.7, 1.3); for (let i = 0; i < 3; i++) for (let q = 0; q < 2; q++) at(rbox(0.4, 0.3, 0.38, q ? '#FFFFFF' : '#F6EFE0'), 20.17 + q * 0.46, 0.32 + i * 0.42, 1.36);
    plant(15.45, 4.5, 0.9); at(rbox(0.45, 0.45, 0.45, '#E8D2A8'), 20.6, 0.23, 4.5); at(rbox(0.45, 0.05, 0.45, '#FFFFFF'), 20.6, 0.48, 4.5);
    // —— 茶水间（左，列 1-6、行 11-18） ——
    at(rbox(4.2, 0.9, 0.7, '#9AD0C8'), 3.3, 0.45, 11.4); at(rbox(4.3, 0.08, 0.76, '#FFFFFF'), 3.3, 0.93, 11.4);
    for (let i = 0; i < 5; i++) at(rbox(0.04, 0.22, 0.04, '#EEEEEE'), 1.6 + i * 0.85, 0.6, 11.77);
    at(rbox(3.6, 0.55, 0.38, '#FFFFFF'), 3.0, 1.75, 11.2);
    at(rbox(0.45, 0.55, 0.4, '#F27A6A'), 1.6, 1.25, 11.3); at(rbox(0.16, 0.12, 0.16, '#FFFFFF'), 1.6, 1.03, 11.45);
    at(rbox(0.6, 0.38, 0.4, '#F4F4F4'), 2.5, 1.16, 11.3); at(rbox(0.36, 0.26, 0.02, '#333A4A'), 2.45, 1.16, 11.51);
    at(rbox(0.7, 0.06, 0.45, '#DCE7EE'), 4.0, 0.96, 11.4); at(cyl(0.025, 0.025, 0.28, '#C8C8C8'), 4.0, 1.12, 11.2);
    at(rbox(0.85, 1.95, 0.75, '#FFFFFF'), 6.05, 0.98, 11.5); at(rbox(0.04, 0.4, 0.04, '#B8B8B8'), 5.72, 1.35, 11.9); at(rbox(0.04, 0.3, 0.04, '#B8B8B8'), 5.72, 0.62, 11.9);
    for (const [x, y, c] of [[6.15, 1.5, '#FFD24A'], [6.3, 1.28, '#F2786A'], [6.1, 0.72, '#7AC8F0']]) at(rbox(0.12, 0.12, 0.03, c), x, y, 11.89);
    at(cyl(0.65, 0.65, 0.08, '#F4D4A4', {}, 32), 3.8, 0.72, 15.2); at(cyl(0.07, 0.12, 0.7, '#E8BC84'), 3.8, 0.36, 15.2);
    for (const [x, z] of [[2.9, 15.6], [4.7, 15.6], [3.8, 16.3]]) { at(cyl(0.22, 0.22, 0.1, '#F2786A'), x, 0.45, z); at(cyl(0.05, 0.05, 0.42, '#C8C8C8'), x, 0.2, z); }
    at(cyl(0.09, 0.08, 0.12, '#FFFFFF'), 3.55, 0.82, 15.05); at(cyl(0.09, 0.08, 0.12, '#7AC8F0'), 4.05, 0.82, 15.3);
    plant(1.45, 18.5, 1.0); plant(6.5, 18.5, 0.8, '#7AC8F0');
    // —— 厕所（右，列 29-34、行 11-18） ——
    for (let i = 0; i < 2; i++) {
      const x = 30.3 + i * 1.9, g = new T.Group(); g.position.set(x, 0, 11.95); root.add(g);
      kit.at(rbox(0.08, 1.6, 1.5, '#9ACDD2'), -0.88, 0.8, 0, g); kit.at(rbox(0.08, 1.6, 1.5, '#9ACDD2'), 0.88, 0.8, 0, g);
      kit.at(cyl(0.24, 0.2, 0.42, '#FFFFFF'), 0, 0.21, -0.2, g); kit.at(rbox(0.5, 0.5, 0.2, '#FFFFFF'), 0, 0.5, -0.6, g); const seat = kit.at(cyl(0.27, 0.27, 0.05, '#F2F2F2'), 0, 0.44, -0.18, g); void seat;
      const door = kit.at(rbox(1.6, 1.5, 0.06, '#B9E0E2'), i ? 0 : -0.55, 0.8, i ? 0.74 : 0.55, g); if (!i) door.rotation.y = 1.0;
      kit.at(rbox(0.16, 0.08, 0.03, i ? '#E3453A' : '#3FD07A', { em: i ? '#E3453A' : '#3FD07A', emI: 0.5 }), 0.45, 1.25, i ? 0.78 : 0.0, g);
      g.traverse(o => { o.castShadow = o.receiveShadow = true; });
    }
    at(rbox(0.6, 0.85, 1.9, '#FFFFFF'), 34.62, 0.43, 15.8); for (const z of [15.2, 16.4]) { at(cyl(0.22, 0.22, 0.05, '#DCEEF2'), 34.5, 0.87, z); at(cyl(0.02, 0.02, 0.2, '#C8C8C8'), 34.8, 0.98, z); }
    at(rbox(0.05, 1.0, 1.8, '#CFEFFA', { rough: 0.15 }), 34.95, 1.5, 15.8);
    plant(29.5, 18.5, 0.9); at(cyl(0.18, 0.15, 0.4, '#C8CDD6'), 34.5, 0.2, 18.4);
    // —— 天台（下，行 26-31、列 12-23；楼梯在第 25 行） ——
    const rail = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0); const g = new T.Group(); g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); g.rotation.y = -ang; root.add(g); kit.at(rbox(L, 0.06, 0.08, '#8C98A6'), 0, 0.85, 0, g); kit.at(rbox(L, 0.04, 0.06, '#8C98A6'), 0, 0.45, 0, g); for (let i = 0; i <= Math.round(L / 0.5); i++) kit.at(cyl(0.025, 0.025, 0.85, '#8C98A6'), -L / 2 + i * L / Math.round(L / 0.5), 0.43, 0, g); };
    rail(12, 31.95, 24, 31.95); rail(11.95, 26, 11.95, 32); rail(24.05, 26, 24.05, 32);
    for (const [x, z] of [[12.6, 31.4], [23.4, 31.4], [12.6, 26.6], [23.4, 26.6]]) plant(x, z, 1.1, '#D98B5A');
    at(rbox(1.2, 0.85, 0.7, '#E6E9EE'), 21.6, 0.43, 26.5); at(cyl(0.28, 0.28, 0.04, '#C9D0D8'), 21.6, 0.45, 26.87).rotation.x = Math.PI / 2;
    const bench = new T.Group(); bench.position.set(15.6, 0, 30.9); root.add(bench); kit.at(rbox(2.2, 0.1, 0.55, '#C98A52'), 0, 0.45, 0, bench); kit.at(rbox(2.2, 0.5, 0.08, '#C98A52'), 0, 0.75, 0.25, bench); for (const dx of [-0.9, 0.9]) kit.at(rbox(0.08, 0.42, 0.5, '#6E5A48'), dx, 0.21, 0, bench); bench.traverse(o => { o.castShadow = o.receiveShadow = true; });
    at(cyl(0.03, 0.03, 2.0, '#6E5A48'), 19.6, 1.0, 30.6); const umb = at(new T.Mesh(new T.ConeGeometry(0.85, 0.35, 12), kit.M('#F28C5A')), 19.6, 2.15, 30.6); void umb;
    at(cyl(0.45, 0.45, 0.06, '#FFFFFF'), 19.6, 0.7, 30.6); at(cyl(0.04, 0.04, 0.7, '#CCCCCC'), 19.6, 0.35, 30.6);
    return root;
  };

  // ---------- 角色 ----------
  W3.CH = {
    rabbit: { fur: '#FFFFFF', inner: '#FFB3C1', shirt: '#8CC8F2', pants: '#7A8AC8', shoe: '#F2786A' },
    cat: { fur: '#FFB46E', inner: '#FFB3C1', shirt: '#FFFFFF', pants: '#5A6A9A', shoe: '#8A5A3A', tie: '#F25A5A' },
    bear: { fur: '#B07A4E', inner: '#F2C8A0', muzzle: '#F6DCC0', shirt: '#8ED4A0', pants: '#8A6A4A', shoe: '#5A3A2A' },
    owl: { fur: '#A88ADC', inner: '#FFF0D2', shirt: '#FFD98A', pants: '#5A4A8A', shoe: '#F2786A' },
  };
  function eye(kit, g, x, y, z, s, mood) {
    const T = kit.T;
    if (mood === 'happy') { const t = new T.Mesh(new T.TorusGeometry(0.045 * s, 0.014 * s, 6, 12, Math.PI), kit.M('#2A1A12')); kit.at(t, x, y - 0.01, z, g); return; }
    const e = kit.sph(0.05 * s, '#2A1A12', { rough: 0.3 }, 12); e.scale.set(mood === 'shock' ? 0.5 : 0.85, mood === 'shock' ? 0.5 : 1.25, 0.5); kit.at(e, x, y, z, g);
    if (mood === 'shock') { const w = kit.sph(0.06 * s, '#FFFFFF', {}, 12); w.scale.set(1, 1.2, 0.4); kit.at(w, x, y, z - 0.005, g); }
    kit.at(kit.sph(0.016 * s, '#FFFFFF', { em: '#FFFFFF', emI: 0.6 }, 6), x - 0.012 * s, y + 0.025 * s, z + 0.022, g);
  }
  // 员工模型。返回 { group, head, arms:[l,r], legs:[l,r], set(mood) }；mood: 'open' | 'happy' | 'shock'
  W3.animal = function (kit, id) {
    const T = kit.T, P = W3.CH[id], g = new T.Group(), R = 0.36, PR = { headY: 0.98, body: 0.2, bodyL: 0.18, bodyY: 0.45, leg: 0.24 };
    const legs = [-1, 1].map(d => { const lg = new T.Group(); lg.position.set(d * 0.09, PR.leg + 0.02, 0); g.add(lg); kit.at(kit.cap(0.075, PR.leg - 0.1, P.pants), 0, -PR.leg / 2 + 0.03, 0, lg); const sh = kit.sph(0.085, P.shoe, {}, 12); sh.scale.set(1, 0.6, 1.4); kit.at(sh, 0, -PR.leg + 0.04, 0.04, lg); return lg; });
    const body = kit.cap(PR.body, PR.bodyL, P.shirt); body.scale.set(1, 1, 0.85); kit.at(body, 0, PR.bodyY, 0, g);
    if (id === 'cat') kit.at(kit.rbox(0.06, PR.bodyL + 0.14, 0.03, P.tie, {}, 0.01), 0, PR.bodyY + 0.02, PR.body * 0.85, g);
    if (id === 'owl') for (const dx of [-0.07, 0.07]) { const dm = kit.rbox(0.06, 0.06, 0.02, '#F2786A', {}, 0.01); dm.rotation.z = Math.PI / 4; kit.at(dm, dx, PR.bodyY + 0.03, PR.body * 0.86, g); }
    if (id === 'bear') kit.at(kit.rbox(0.015, PR.bodyL + 0.2, 0.02, '#FFFFFF', {}, 0.005), 0, PR.bodyY, PR.body * 0.86, g);
    const arms = [-1, 1].map(d => { const a = new T.Group(); a.position.set(d * (PR.body + 0.05), PR.bodyY + 0.12, 0); g.add(a); kit.at(kit.cap(0.06, 0.14, id === 'owl' ? P.fur : P.shirt), 0, -0.1, 0, a); kit.at(kit.sph(0.065, P.fur, {}, 12), 0, -0.22, 0, a); a.rotation.z = d * 0.35; return a; });
    const hg = new T.Group(); hg.position.set(0, PR.headY, 0); g.add(hg);
    const head = kit.sph(R, P.fur, {}, 32); head.scale.set(1.08, 0.95, 1); kit.at(head, 0, 0, 0, hg);
    if (id === 'rabbit') for (const d of [-1, 1]) { const e = kit.sph(R * 0.28, P.fur, {}, 14); e.scale.set(0.8, 2.6, 0.5); e.rotation.z = d * -0.15; kit.at(e, d * R * 0.38, R * 1.35, -0.02, hg); const i = kit.sph(R * 0.15, P.inner, {}, 10); i.scale.set(0.8, 3.6, 0.3); i.rotation.z = d * -0.15; kit.at(i, d * R * 0.38, R * 1.35, R * 0.12, hg); }
    if (id === 'cat') for (const d of [-1, 1]) {   // 猫耳：又大又尖的三角，里面粉色，微微朝外
      const e = new T.Mesh(new T.ConeGeometry(R * 0.58, R * 0.95, 4), kit.M(P.fur)); e.rotation.set(0, Math.PI / 4, d * -0.4); e.scale.set(1, 1, 0.5); kit.at(e, d * R * 0.62, R * 1.0, -R * 0.05, hg);
      const i = new T.Mesh(new T.ConeGeometry(R * 0.36, R * 0.66, 4), kit.M(P.inner)); i.rotation.set(0, Math.PI / 4, d * -0.4); i.scale.set(1, 1, 0.3); kit.at(i, d * R * 0.6, R * 0.98, R * 0.1, hg);
    }
    if (id === 'bear') for (const d of [-1, 1]) { const e = kit.sph(R * 0.3, P.fur, {}, 14); e.scale.set(1, 1, 0.6); kit.at(e, d * R * 0.75, R * 0.78, 0, hg); kit.at(kit.sph(R * 0.16, P.inner, {}, 10), d * R * 0.75, R * 0.78, R * 0.12, hg); }
    if (id === 'owl') for (const d of [-1, 1]) { const e = kit.cone(R * 0.2, R * 0.5, P.fur); e.rotation.z = d * -0.6; kit.at(e, d * R * 0.7, R * 0.82, 0, hg); kit.at(kit.sph(R * 0.36, P.inner, {}, 14), d * R * 0.38, R * 0.02, R * 0.72, hg).scale.set(1, 1, 0.35); }
    if (id === 'bear') kit.at(kit.sph(R * 0.4, P.muzzle, {}, 14), 0, -R * 0.28, R * 0.78, hg).scale.set(1.1, 0.8, 0.6);
    if (id === 'rabbit') kit.at(kit.sph(R * 0.3, '#FFFFFF', {}, 14), 0, -R * 0.3, R * 0.85, hg).scale.set(1.3, 0.75, 0.4);
    if (id === 'cat') {   // 猫：两团小嘴筒（ω）、额头三道虎纹、两边胡须
      for (const d of [-1, 1]) kit.at(kit.sph(R * 0.15, '#FFF4E6', {}, 12), d * R * 0.13, -R * 0.3, R * 0.9, hg).scale.set(1, 0.8, 0.5);
      for (const dx of [-0.18, 0, 0.18]) { const st = kit.rbox(R * 0.07, R * 0.26, R * 0.04, '#D9782E', {}, 0.01); st.rotation.x = -0.5; kit.at(st, dx * R, R * 0.62, R * 0.78, hg); }
      for (const d of [-1, 1]) for (const k of [-1, 1]) { const w = kit.rbox(R * 0.5, R * 0.025, R * 0.025, '#5A3A22', {}, 0.005); w.rotation.z = d * k * 0.18; kit.at(w, d * R * 0.55, -R * 0.24 + k * R * 0.06, R * 0.86, hg); }
    }
    if (id === 'owl') { const b = kit.cone(R * 0.11, R * 0.22, '#FFB531'); b.rotation.x = Math.PI; kit.at(b, 0, -R * 0.2, R * 1.0, hg); for (const d of [-1, 1]) kit.at(new T.Mesh(new T.TorusGeometry(R * 0.26, R * 0.035, 6, 20), kit.M('#3A2A1A')), d * R * 0.36, R * 0.04, R * 1.0, hg); }
    else if (id === 'cat') { const n = kit.cone(R * 0.07, R * 0.08, '#F28C9A'); n.rotation.x = Math.PI; kit.at(n, 0, -R * 0.18, R * 0.98, hg); }   // 小三角鼻子
    else kit.at(kit.sph(R * 0.08, id === 'bear' ? '#3A2416' : '#F28C9A', {}, 10), 0, -R * 0.18, R * 1.0, hg).scale.set(1.3, 0.9, 0.7);
    for (const d of [-1, 1]) kit.at(kit.sph(R * 0.12, '#FF9AAE', { op: 0.75 }, 10), d * R * 0.62, -R * 0.2, R * 0.78, hg).scale.set(1.2, 0.6, 0.4);
    if (id === 'rabbit') { kit.at(new T.Mesh(new T.TorusGeometry(R * 1.02, R * 0.07, 6, 24, Math.PI), kit.M('#FFD24A')), 0, R * 0.05, 0, hg); for (const d of [-1, 1]) { const c = kit.cyl(R * 0.26, R * 0.26, R * 0.2, '#F2786A'); c.rotation.z = Math.PI / 2; kit.at(c, d * R * 1.05, 0, 0, hg); } }
    if (id === 'cat') for (const d of [-1, 1]) kit.at(kit.rbox(R * 0.5, R * 0.28, R * 0.1, '#1E2236', { rough: 0.2 }, 0.02), d * R * 0.32, R * 0.62, R * 0.72, hg).rotation.x = -0.6;
    if (id === 'bear') { kit.at(new T.Mesh(new T.SphereGeometry(R * 0.82, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), kit.M('#F25A5A')), 0, R * 0.45, 0, hg); kit.at(kit.cyl(R * 0.84, R * 0.84, R * 0.18, '#FFFFFF'), 0, R * 0.45, 0, hg); kit.at(kit.sph(R * 0.17, '#FFFFFF', {}, 10), 0, R * 1.3, 0, hg); }
    // 表情层：三套眼睛 + 嘴，按 mood 切换显示
    const faces = {};
    for (const mood of ['open', 'happy', 'shock']) {
      const f = new T.Group(); hg.add(f); faces[mood] = f;
      for (const d of [-1, 1]) eye(kit, f, d * R * 0.36, R * 0.04, R * (id === 'owl' ? 0.99 : 0.93), R / 0.3, mood);
      if (mood !== 'open') { const m = kit.sph(R * (mood === 'shock' ? 0.08 : 0.11), '#7A2418', {}, 10); kit.at(m, 0, -R * 0.42, R * 0.9, f).scale.set(mood === 'shock' ? 1 : 1.3, mood === 'shock' ? 1.3 : 0.7, 0.5); }
    }
    const phone = kit.rbox(0.1, 0.17, 0.02, '#2A2E45', {}, 0.015); kit.at(phone, 0.2, PR.bodyY + 0.12, 0.2, g);
    const sweat = kit.sph(R * 0.09, '#8FD8FF', {}, 10); sweat.scale.set(1, 1.5, 1); kit.at(sweat, R * 1.0, R * 0.5, R * 0.4, hg);
    const api = { group: g, head: hg, arms, legs, faces, phone, sweat, mood: null };
    api.set = mood => { if (api.mood === mood) return; api.mood = mood; for (const k in faces) faces[k].visible = k === mood; phone.visible = mood === 'happy'; sweat.visible = mood === 'shock'; };
    api.set('open');
    return api;
  };
  // 老板（狮子）：mode 'stern' 抱臂 / 'angry' 举拳喷火
  W3.lion = function (kit) {
    const T = kit.T, g = new T.Group(), R = 0.4, hY = 1.12, bY = 0.52, bL = 0.24, suit = '#3E4A8A', fur = '#FFC864', mane = '#D9772E', maneD = '#B85A1E';
    for (const d of [-1, 1]) { kit.at(kit.cap(0.09, 0.18, suit), d * 0.11, 0.2, 0, g); const sh = kit.sph(0.1, '#1E1A1A', { rough: 0.3 }, 12); sh.scale.set(1, 0.6, 1.5); kit.at(sh, d * 0.11, 0.05, 0.05, g); }
    const body = kit.cap(0.26, bL, suit); body.scale.set(1.12, 1, 0.85); kit.at(body, 0, bY, 0, g);
    const shirt = kit.cone(0.12, 0.26, '#FFFFFF'); shirt.rotation.x = Math.PI; kit.at(shirt, 0, bY + bL / 2 + 0.06, 0.2, g); kit.at(kit.rbox(0.08, bL + 0.12, 0.03, '#F25A5A', {}, 0.01), 0, bY + 0.02, 0.23, g); kit.at(kit.rbox(0.1, 0.02, 0.035, '#FFD24A', { rough: 0.3 }, 0.005), 0, bY + 0.08, 0.245, g);
    const stern = new T.Group(), angry = new T.Group(); g.add(stern); g.add(angry);
    for (const d of [-1, 1]) { const a = kit.cap(0.08, 0.3, suit); a.position.set(d * 0.2, bY + 0.06, 0.2); a.rotation.z = d * 1.25; a.castShadow = true; stern.add(a); kit.at(kit.sph(0.09, fur, {}, 12), d * -0.05, bY, 0.26, stern); }
    for (const d of [-1, 1]) { const a = kit.cap(0.08, 0.28, suit); a.position.set(d * 0.36, bY + 0.32, 0.05); a.rotation.z = d * 2.4; a.castShadow = true; angry.add(a); kit.at(kit.sph(0.1, fur, {}, 12), d * 0.47, bY + 0.5, 0.05, angry); }
    const hg = new T.Group(); hg.position.set(0, hY, 0); g.add(hg);
    const maneG = new T.Group(); hg.add(maneG);
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + ring * 0.2, c = kit.cone(R * (ring ? 0.32 : 0.4), R * 0.85 * (ring ? 0.8 : 1), ring ? mane : maneD); c.position.set(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.9, -R * 0.15 - ring * 0.05); c.rotation.z = a - Math.PI / 2; c.castShadow = true; maneG.add(c); }
    kit.at(kit.sph(R * 1.0, mane, {}, 18), 0, 0, -R * 0.35, hg);
    // 后脑勺和头顶：一层鬃毛包住（比脸大一圈，往后偏），表面插满朝外的毛簇
    const capM = kit.sph(R * 1.12, mane, {}, 24); capM.scale.set(1.05, 1.02, 1); kit.at(capM, 0, R * 0.06, -R * 0.22, maneG);
    const N = 90, maneL = '#E8923E';
    for (let i = 0; i < N; i++) {   // 斐波那契球面均匀分布，只取后半球和头顶；每簇毛是一个往外、略往下垂的椭球
      const y = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996, v = new T.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
      if (v.z > 0.3 || v.y < -0.8) continue;
      const dir = v.clone().add(new T.Vector3(0, -0.45, 0)).normalize();
      const c = kit.sph(R * 0.2, [mane, maneD, maneL][i % 3], {}, 10); c.scale.set(1, 1.75, 0.75);
      c.position.copy(v).multiplyScalar(R * 1.12).add(new T.Vector3(0, R * 0.06, -R * 0.22)).addScaledVector(dir, R * 0.12);
      c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir); c.castShadow = true; maneG.add(c);
    }
    const head = kit.sph(R, fur, {}, 32); head.scale.set(1.05, 0.98, 0.95); kit.at(head, 0, 0, 0, hg);
    for (const d of [-1, 1]) kit.at(kit.sph(R * 0.24, fur, {}, 12), d * R * 0.7, R * 0.75, 0, hg);
    kit.at(kit.sph(R * 0.42, '#FFF0CC', {}, 16), 0, -R * 0.32, R * 0.72, hg).scale.set(1.15, 0.8, 0.6);
    kit.at(kit.sph(R * 0.11, '#4A2416', {}, 10), 0, -R * 0.14, R * 0.98, hg).scale.set(1.4, 0.8, 0.7);
    const fS = new T.Group(), fA = new T.Group(); hg.add(fS); hg.add(fA);
    for (const d of [-1, 1]) { eye(kit, fS, d * R * 0.36, R * 0.08, R * 0.9, R / 0.3, 'open'); const lid = kit.sph(R * 0.17, fur, {}, 12); lid.scale.set(1.1, 0.6, 0.5); kit.at(lid, d * R * 0.36, R * 0.2, R * 0.92, fS); const br = kit.rbox(R * 0.42, R * 0.09, R * 0.08, '#5A2410', {}, 0.02); br.rotation.z = d * -0.12; kit.at(br, d * R * 0.38, R * 0.36, R * 0.9, fS); }
    const m = kit.rbox(R * 0.36, R * 0.05, R * 0.05, '#3A1E10', {}, 0.01); m.rotation.z = -0.12; kit.at(m, R * 0.03, -R * 0.48, R * 0.86, fS);
    for (const d of [-1, 1]) {   // 生气的眼睛：粗黑眉毛往中间压成 V 字，下面是两个白色半圆眼（黑描边、没有眼珠）
      // 半圆白眼：外圈一道黑描边，里面纯白、没有眼珠；平的一边朝上、往中间斜
      const eg = new T.Group(); eg.position.set(d * R * 0.33, -R * 0.02, R * 1.02); eg.rotation.z = d * 0.3; fA.add(eg);
      const ol = new T.Mesh(new T.CircleGeometry(R * 0.21, 24, Math.PI, Math.PI), kit.M('#1A0A06')); ol.position.y = R * 0.02; eg.add(ol);
      const wh = new T.Mesh(new T.CircleGeometry(R * 0.16, 24, Math.PI, Math.PI), kit.M('#FFFFFF', { em: '#FFFFFF', emI: 0.25 })); wh.position.set(0, -R * 0.005, R * 0.005); eg.add(wh);
      const br = kit.rbox(R * 0.62, R * 0.17, R * 0.12, '#1A0A06', {}, 0.03); br.rotation.z = d * 0.5; kit.at(br, d * R * 0.38, R * 0.27, R * 0.93, fA);
    }
    const mo = kit.sph(R * 0.22, '#7A1A12', {}, 12); mo.scale.set(1.3, 0.9, 0.5); kit.at(mo, 0, -R * 0.5, R * 0.82, fA);
    for (const d of [-1, 1]) { const f = kit.cone(R * 0.05, R * 0.12, '#FFFFFF'); f.rotation.x = Math.PI; kit.at(f, d * R * 0.13, -R * 0.4, R * 0.95, fA); }
    // 喷火：外眼角两团粒子（每帧刷新位置）
    const fire = new T.Group(); hg.add(fire); const parts = [];
    const fm = ['#FFF06A', '#FF9A1E', '#FF3B1F'].map(c => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false }));
    for (let i = 0; i < 80; i++) { const s = new T.Mesh(kit.sph(1, '#FFFFFF', {}, 8).geometry, fm[0]); fire.add(s); const h = n => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); }; parts.push({ s, ph: h(1), a: h(2) * Math.PI * 2, r: 0.2 + h(3) * 0.8 }); }
    const fireL = new T.PointLight('#FF6A2A', 2.5, 3.5); fireL.position.set(0, R * 1.9, 0.2); fire.add(fireL);
    const api = { group: g, head: hg, mode: null, fire, maneG };
    api.set = mode => { if (api.mode === mode) return; api.mode = mode; const a = mode === 'angry'; stern.visible = fS.visible = !a; angry.visible = fA.visible = fire.visible = a; };   // 生气时头不放大
    // 头顶冒火：火苗从头顶一圈冒出来往上窜，越往上越小、颜色从黄变橙变红，左右摇摆
    api.tick = t => { if (!fire.visible) return; for (const p of parts) { const k = (t * 1.3 + p.ph) % 1, rad = R * 0.95 * p.r * (1 - k * 0.7), sway = Math.sin(t * 7 + p.ph * 30) * R * 0.08 * k;
        p.s.position.set(Math.cos(p.a) * rad + sway, R * 1.25 + k * R * 1.6 + (1 - p.r) * R * 0.35 * k, Math.sin(p.a) * rad * 0.7); p.s.scale.setScalar(R * 0.3 * (1 - k * 0.8) * (0.75 + (1 - p.r) * 0.5)); p.s.material = fm[k < 0.3 ? 0 : k < 0.65 ? 1 : 2]; }
      fireL.intensity = 2.2 + Math.sin(t * 18) * 0.6; };
    api.set('stern');
    return api;
  };

  // ---------- 灯光与场景 ----------
  W3.makeScene = function (T, grid, opt) {
    opt = opt || {};
    const scene = new T.Scene(); scene.background = new T.Color('#BFE7F2');
    const hemi = new T.HemisphereLight('#FFFFFF', '#B8A890', 1.15); scene.add(hemi);
    const sun = new T.DirectionalLight('#FFF6E0', 1.9); sun.position.set(6, 14, 6); sun.castShadow = true; sun.shadow.mapSize.set(opt.shadowSize || 2048, opt.shadowSize || 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 }); sun.shadow.radius = 5; sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);
    const kit = W3.Kit(T), tx = W3.textures(T);
    const map = W3.buildMap(kit, grid, tx), furn = W3.furnish(kit, grid, tx); scene.add(map); scene.add(furn);
    // 性能：地图和家具不会动，算一次矩阵后就不再每帧重算
    for (const g of [map, furn]) { g.updateMatrixWorld(true); g.traverse(o => { o.matrixAutoUpdate = false; }); }
    return { scene, sun, hemi, kit, tx, map, furn };
  };
  // 镜头：斜 43° 往下看，跟着 (fx, fz)；dist 越大看得越多
  W3.aim = function (cam, sun, fx, fz, dist) {
    cam.position.set(fx, dist * 0.68, fz + dist * 0.73); cam.lookAt(fx, 0, fz);
    if (sun) { sun.position.set(fx + 6, 14, fz + 6); sun.target.position.set(fx, 0, fz); sun.target.updateMatrixWorld(); }
  };
  // 镜头距离：让画面中心那一行正好看到 w 格宽（竖屏的视野宽度 = A.SIGHT.w）
  W3.distFor = function (cam, w) { const vfov = cam.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect); return (w / 2) / Math.tan(hfov / 2); };
})(typeof window !== 'undefined' ? window : globalThis);
