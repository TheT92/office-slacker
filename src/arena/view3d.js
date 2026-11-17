// 摸鱼大作战 3D 画面层（B4-2）：WebGL 画布放在 2D 画布下面、只占场景区域；
// 每帧把对局里的人物同步成 3D 模型，镜头斜着跟着自己走；点击屏幕时把点投到地面上换算成格子坐标。
// 规则相关的可见性和 2D 版一样：只画视野内的人；老板看不到房间里面（监控的房间除外）；房间视角只看得到同一个房间的人。
(function (root) {
  const OS = (root.OS = root.OS || {}); const A = (OS.arena = OS.arena || {});

  // 纯逻辑（Node 测试用）：这个人在当前视角下该不该画
  A.visible3d = function (m, viewer, a, opt) {
    opt = opt || {};
    if (a.kind === 'boss' && a.waitT > 0) return false;   // 老板还没到公司
    if (a === viewer) return true;
    if (opt.room) return a.room === opt.room;             // 房间视角：只看同一个房间
    if (a.kind === 'employee' && a.room) { if (viewer.kind === 'boss' && !(opt.peek || []).includes(a.room)) return false; }
    return A.inSight(viewer, a.x, a.y);
  };
  // 房间视角下哪些高墙要压矮：房间下方（靠镜头一侧）两行以内、横向覆盖房间的墙
  A.cutawayFor = function (grid, roomId) {
    if (!roomId) return () => false;
    const cs = grid.cells.filter(k => k.room === roomId || k.door === roomId), c0 = Math.min(...cs.map(k => k.c)), c1 = Math.max(...cs.map(k => k.c)), r1 = Math.max(...cs.map(k => k.r));
    return k => k.r > r1 - 1 && k.r <= r1 + 2 && k.c >= c0 - 1 && k.c <= c1 + 1;
  };

  class View3D {
    constructor(app, r2d, canvas) {
      this.app = app; this.r = r2d; this.canvas = canvas; this.on = false; this.models = new Map(); this.time = 0; this.cutRoom = undefined;
      const T = root.THREE; if (!T || !canvas) return;
      try {
        this.T = T;
        const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
        this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
        this.grid = A.buildGrid(A.MAP);
        this.W = A.W3.makeScene(T, this.grid, { shadowSize: mobile ? 1024 : 2048 });
        this.cam = new T.PerspectiveCamera(36, 1, 0.1, 200);
        this.ray = new T.Raycaster(); this.plane = new T.Plane(new T.Vector3(0, 1, 0), 0); this.v = new T.Vector3();
        this.focus = null; this.ok = true; this.props = new Map(); this.fx = []; this.buildStatic();
        // 停电时亮起来的台灯（每张工位一盏）
        this.lamps = A.DESKS.map(d => { const L = new T.PointLight('#FFD27A', 0, 4.5, 1.6); L.position.set(d.c + 0.25, 1.35, d.r + 0.3); this.W.scene.add(L); return L; });
      } catch (e) { console.warn('3D 不可用，使用经典画面', e); this.ok = false; }
    }
    // 画布贴在场景区域（顶栏和底部按钮之间）
    fit(cssW, cssH, dpr) {
      if (!this.ok) return; const V = A.VIEW, k = cssW / V.W;
      this.canvas.style.top = Math.round(V.VY * k) + 'px'; this.canvas.style.height = Math.round(V.VH * k) + 'px'; this.canvas.style.width = cssW + 'px';
      this.renderer.setPixelRatio(Math.min(2, dpr || 1)); this.renderer.setSize(cssW, Math.round(V.VH * k), false);
      this.cam.aspect = V.W / V.VH; this.cam.updateProjectionMatrix();
    }
    setEnabled(on) { this.on = !!(on && this.ok); if (this.canvas) this.canvas.style.display = this.on ? 'block' : 'none'; }
    model(a) {
      let md = this.models.get(a);
      if (!md) {
        md = a.kind === 'boss' ? A.W3.lion(this.W.kit) : A.W3.animal(this.W.kit, a.id);
        md.group.scale.setScalar(1.25); md.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.W.scene.add(md.group);
        md.px = a.x; md.py = a.y; md.face = 0; this.models.set(a, md);
      }
      return md;
    }
    // 每帧：同步人物、镜头、剖墙，然后渲染
    draw(dt) {
      if (!this.on) return; const app = this.app, m = app.match; if (app.screen === 'title' || !m) return;
      this.time += dt; const t = this.time, p = m.player, cam2 = this.r.cam || {}, room = cam2.room || null;
      if (this.lastMatch !== m) { for (const md of this.models.values()) this.W.scene.remove(md.group); this.models.clear(); this.lastMatch = m; this.focus = null; for (const f of this.fx) this.W.scene.remove(f.mesh); this.fx = []; }
      const peek = p.kind === 'boss' ? m.peekRooms() : [];
      for (const a of m.actors) {
        const md = this.model(a), vis = A.visible3d(m, p, a, { room, peek }); md.group.visible = vis; if (!vis) { md.px = a.x; md.py = a.y; continue; }
        const dx = a.x - md.px, dy = a.y - md.py, sp = Math.hypot(dx, dy) / Math.max(dt, 1e-3); md.px = a.x; md.py = a.y;
        const moving = sp > 0.3, seat = a.kind === 'employee' && A.seatOf(a.desk), sitting = seat && !moving && !a.room && Math.hypot(a.x - seat.x, a.y - seat.y) < 0.45;
        if (moving) { const want = Math.atan2(dx, dy); let d = want - md.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; md.face += d * Math.min(1, dt * 12); }
        else { const want = sitting ? Math.PI : 0; let d = want - md.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (a === p || a.room || sitting) md.face += d * Math.min(1, dt * 6); }   // 坐下时面朝桌子，站着时慢慢转回面向镜头
        md.group.rotation.y = md.face;
        const bob = moving ? Math.abs(Math.sin(t * 13)) * 0.06 : 0; md.group.position.set(a.x, bob + (sitting ? 0.2 : 0), a.y + (sitting ? -0.3 : 0));
        if (a.kind === 'boss') {
          const angry = (a.room && a.stay > 0) || (this.r.bossAngryT > 0); md.set(angry ? 'angry' : 'stern'); md.tick(t);
        } else {
          const mood = a.stun > 0 || a.forced || a.slipT > 0 ? 'shock' : a.room ? 'happy' : 'open'; md.set(mood);
          const sw = moving ? Math.sin(t * 13) * 0.7 : 0;
          md.legs[0].rotation.x = sw; md.legs[1].rotation.x = -sw;
          md.arms[0].rotation.x = -sw * 0.8; md.arms[1].rotation.x = sw * 0.8;
          md.arms[0].rotation.z = mood === 'shock' ? -2.6 : -0.35; md.arms[1].rotation.z = mood === 'shock' ? 2.6 : 0.35;
          if (mood === 'happy' && !moving) md.arms[1].rotation.x = -1.3;   // 摸鱼：举着手机
          md.head.rotation.z = mood === 'happy' ? Math.sin(t * 2.5) * 0.08 : 0;
          if (sitting) {   // 坐在工位上打字：腿往前伸，手往前、上下敲
            md.legs[0].rotation.x = md.legs[1].rotation.x = -1.35;
            md.arms[0].rotation.x = -1.2 + Math.sin(t * 22) * 0.12; md.arms[1].rotation.x = -1.2 + Math.sin(t * 22 + 1.6) * 0.12; md.arms[0].rotation.z = -0.2; md.arms[1].rotation.z = 0.2;
          }
        }
      }
      for (const [a, md] of this.models) if (!m.actors.includes(a)) { this.W.scene.remove(md.group); this.models.delete(a); }
      // 镜头：房间视角对准房间中心并放大；办公区跟着自己（视野越大镜头越远）
      let fx, fz, dist;
      if (room && cam2.box) { const [c0, r0, c1, r1] = cam2.box; fx = (c0 + c1) / 2; fz = (r0 + r1) / 2 + 0.3; dist = Math.max(A.W3.distFor(this.cam, (c1 - c0) + 1.2), (r1 - r0) * 1.55 + 3); }
      else { const S = A.sightOf(p), tx = p.kind === 'boss' && p.waitT > 0 ? A.BOSS_ARRIVE.x : p.x, tz = p.kind === 'boss' && p.waitT > 0 ? A.BOSS_ARRIVE.y : p.y; fx = tx; fz = tz; dist = A.W3.distFor(this.cam, S.w); }
      if (!this.focus || !dt || Math.hypot(fx - this.focus.x, fz - this.focus.z) > 6 || this.focus.room !== room) this.focus = { x: fx, z: fz, d: dist, room };
      else { const k = Math.min(1, dt * 8); this.focus.x += (fx - this.focus.x) * k; this.focus.z += (fz - this.focus.z) * k; this.focus.d += (dist - this.focus.d) * k; }
      A.W3.aim(this.cam, this.W.sun, this.focus.x, this.focus.z, this.focus.d);
      if (this.cutRoom !== room) { this.cutRoom = room; A.W3.cutaway(this.T, this.W.map, A.cutawayFor(this.grid, room)); }
      this.cam.updateMatrixWorld(); this.syncProps(dt); this.ambient(dt); this.tickFx(dt);
      this.renderer.render(this.W.scene, this.cam);
    }
    // —— B4-4 特效 ——
    // 粒子：{ mesh, v(速度), life, t, grow, fade, spin }
    spawn(mesh, o) { this.W.scene.add(mesh); this.fx.push(Object.assign({ mesh, v: new this.T.Vector3(), life: 1, t: 0, grow: 0, fade: true, g: 0, spin: 0 }, o)); }
    tickFx(dt) {
      for (const f of this.fx) {
        f.t += dt; const k = f.t / f.life; f.v.y -= f.g * dt; f.mesh.position.addScaledVector(f.v, dt);
        if (f.grow) f.mesh.scale.multiplyScalar(1 + f.grow * dt); if (f.spin) f.mesh.rotation.y += f.spin * dt;
        if (f.to) { const q = Math.min(1, k), a = f.from, b = f.to; f.mesh.position.set(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q + Math.sin(q * Math.PI) * 1.4, a.z + (b.z - a.z) * q); }
        if (f.fade && f.mesh.material) f.mesh.material.opacity = Math.max(0, (f.op0 ?? 1) * (1 - k));
      }
      this.fx = this.fx.filter(f => { if (f.t < f.life) return true; this.W.scene.remove(f.mesh); if (f.mesh.material && f.own) f.mesh.material.dispose(); return false; });
    }
    basic(col, op) { return new this.T.MeshBasicMaterial({ color: col, transparent: true, opacity: op ?? 1, depthWrite: false }); }
    // 对局事件 → 特效（main.js 每个事件都会转给这里）
    onEvent(ev) {
      if (!this.on || !this.ok) return; const T = this.T, m = this.app.match; if (!m) return;
      const who = id => m.actors.find(a => a.id === id);
      if (ev.type === 'caught') {   // 被抓：原地一圈红色冲击波 + 一把星星往外飞
        const a = who(ev.who); if (!a) return; const x = a.x, z = a.y;
        const ring = new T.Mesh(new T.RingGeometry(0.3, 0.45, 32), this.basic('#FF3B30', 0.9)); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.06, z); this.spawn(ring, { life: 0.6, grow: 4.5, op0: 0.9, own: true });
        for (let i = 0; i < 14; i++) { const ang = i / 14 * Math.PI * 2, st = new T.Mesh(this.starGeo || (this.starGeo = new T.OctahedronGeometry(0.09)), this.basic(i % 2 ? '#FFD24A' : '#FFFFFF')); st.position.set(x, 1.3, z); this.spawn(st, { life: 0.8, v: new T.Vector3(Math.cos(ang) * 2.6, 2.4 + (i % 3) * 0.6, Math.sin(ang) * 2.6), g: 7, spin: 8, own: true }); }
      }
      if (ev.type === 'check') {   // 老板推门查房：门口一团灰尘 + 门框闪一下
        const g = this.grid, d = g.doors[ev.room]; if (!d) return; const o = g.outside(ev.room) || { x: d.c + 0.5, y: d.r + 0.5 };
        for (let i = 0; i < 10; i++) { const p = new T.Mesh(this.puffGeo || (this.puffGeo = new T.SphereGeometry(0.18, 10, 8)), this.basic('#E8E2D8', 0.85)); p.position.set((d.c + 0.5 + o.x) / 2 + (Math.random() - 0.5) * 0.6, 0.2, (d.r + 0.5 + o.y) / 2 + (Math.random() - 0.5) * 0.6); this.spawn(p, { life: 0.7, v: new T.Vector3((Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5), grow: 1.2, op0: 0.85, own: true }); }
        const fl = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), this.basic(ev.caught && ev.caught.length ? '#FF3B30' : '#FFFFFF', 0.6)); fl.position.set(d.c + 0.5, 1.1, d.r + 0.5); fl.lookAt(this.cam.position); this.spawn(fl, { life: 0.35, op0: 0.6, own: true });
      }
      if (ev.type === 'deposit') {   // 存钱：几枚金币从人身上跳进工位
        const a = who(ev.who); if (!a || !this.models.get(a) || !this.models.get(a).group.visible) return; const st = A.seatOf(a.desk), n = Math.min(8, 3 + Math.floor(ev.amount / 20));
        for (let i = 0; i < n; i++) { const c = new T.Mesh(this.coinGeo || (this.coinGeo = new T.CylinderGeometry(0.12, 0.12, 0.03, 16)), this.coinMat || (this.coinMat = new T.MeshStandardMaterial({ color: '#FFC93C', emissive: '#B8860B', emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.4 }))); c.rotation.x = Math.PI / 2;
          this.spawn(c, { life: 0.55 + i * 0.07, fade: false, spin: 10, from: new T.Vector3(a.x + (Math.random() - 0.5) * 0.3, 1.2, a.y), to: new T.Vector3(st.x + (Math.random() - 0.5) * 0.5, 0.85, st.y - 1) }); }
      }
    }
    // 环境光：停电变暗只剩台灯和屏幕；晚霞变暖；冲刺时光线稍微偏红
    ambient(dt) {
      const m = this.app.match, ev = id => m.activeEvents && m.activeEvents.some(e => e.id === id), dark = ev('blackout'), sunset = !!(m.roomBoost && m.roomBoost.rooftop > 0), tea = !!(m.roomBoost && m.roomBoost.pantry > 0);
      const goal = dark ? 0.1 : 1, k = Math.min(1, (dt || 0) * 3); if (!(this.light >= 0)) this.light = 1; this.light += (goal - this.light) * k;
      this.W.hemi.intensity = 1.15 * this.light; this.W.sun.intensity = 1.9 * this.light;
      this.W.sun.color.set(sunset ? '#FFB070' : m.rush ? '#FFD8C8' : '#FFF6E0'); this.W.hemi.color.set(dark ? '#5A6AA8' : sunset ? '#FFD0A0' : '#FFFFFF');
      this.W.scene.background.set(dark ? '#2A3048' : sunset ? '#F7B08A' : '#BFE7F2');
      for (const L of this.lamps) L.intensity = (1 - this.light) * 5;
      // 下午茶：茶水间桌上和咖啡机冒热气
      this.steamT = (this.steamT || 0) - dt;
      if (tea && this.steamT <= 0) { this.steamT = 0.12; const T = this.T; for (const [x, z] of [[3.6, 15.05], [4.05, 15.3], [1.6, 11.45]]) { const s = new T.Mesh(this.puffGeo || (this.puffGeo = new T.SphereGeometry(0.18, 10, 8)), this.basic('#FFFFFF', 0.6)); s.scale.setScalar(0.35); s.position.set(x + (Math.random() - 0.5) * 0.1, x === 1.6 ? 1.15 : 0.9, z); this.spawn(s, { life: 1.4, v: new T.Vector3((Math.random() - 0.5) * 0.15, 0.6, 0), grow: 0.8, op0: 0.55, own: true }); } }
    }
    // 固定的提示物：自己工位的绿框、每张桌子上打翻的水、点击落点圈、老板脚下的红圈、监控高亮
    buildStatic() {
      const T = this.T, k = this.W.kit, sc = this.W.scene;
      const glow = (col, op) => new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false });
      // 工位绿框：四条发光的边（贴地）
      this.ownRing = new T.Group(); const gm = glow('#2ECC71', 0.9);
      for (const [w, d, x, z] of [[2.3, 0.12, 0, -0.75], [2.3, 0.12, 0, 1.55], [0.12, 2.42, -1.09, 0.4], [0.12, 2.42, 1.09, 0.4]]) { const b = new T.Mesh(new T.BoxGeometry(w, 0.04, d), gm); b.position.set(x, 0.03, z); this.ownRing.add(b); }
      this.ownRing.visible = false; sc.add(this.ownRing); this.ownMat = gm;
      // 每张桌子：一滩水 + 倒下的杯子（被猫打翻时显示）
      this.puddles = A.DESKS.map(d => { const g = new T.Group(); const pd = new T.Mesh(new T.CircleGeometry(0.5, 24), glow('#7EC8F2', 0.85)); pd.rotation.x = -Math.PI / 2; pd.scale.set(1.5, 0.75, 1); pd.position.set(0, 0.81, 0.05); g.add(pd); const cup = k.cyl(0.07, 0.06, 0.16, '#FFFFFF'); cup.rotation.z = Math.PI / 2; cup.position.set(0.55, 0.86, 0.05); g.add(cup); g.position.set(d.c + 1, 0, d.r + 0.5); g.visible = false; sc.add(g); return g; });
      // 点击落点圈
      this.target = new T.Mesh(new T.TorusGeometry(0.34, 0.05, 8, 32), glow('#FFB52E', 0.9)); this.target.rotation.x = -Math.PI / 2; this.target.visible = false; sc.add(this.target);
      // 老板脚下的红圈（醒目）
      this.bossRing = new T.Mesh(new T.RingGeometry(0.42, 0.56, 36), glow('#E0453A', 0.6)); this.bossRing.rotation.x = -Math.PI / 2; this.bossRing.visible = false; sc.add(this.bossRing);
      // 监控高亮（每个摸鱼房间一块紫色半透明地面）
      this.peekPlanes = {};
      for (const id of A.SLACK_ROOMS) { const cs = this.grid.cells.filter(c => c.room === id), c0 = Math.min(...cs.map(c => c.c)), c1 = Math.max(...cs.map(c => c.c)) + 1, r0 = Math.min(...cs.map(c => c.r)), r1 = Math.max(...cs.map(c => c.r)) + 1;
        const pl = new T.Mesh(new T.PlaneGeometry(c1 - c0, r1 - r0), glow('#9B51E0', 0.25)); pl.rotation.x = -Math.PI / 2; pl.position.set((c0 + c1) / 2, 0.03, (r0 + r1) / 2); pl.visible = false; sc.add(pl); this.peekPlanes[id] = pl; }
    }
    // 会变的物件：补给（礼盒）、红包、香蕉皮。按对象复用模型
    prop(key, make) { let o = this.props.get(key); if (!o) { o = make(); this.W.scene.add(o); this.props.set(key, o); } o.userData.seen = this.frameNo; return o; }
    makeGift(kind) {
      const T = this.T, k = this.W.kit, g = new T.Group(), col = { takeout: '#FF9E4A', double: '#FFD24A', leave: '#7AC8F0', manual: '#A8D890', seal: '#E0453A', banana: '#F5D547', fake: '#C8A8F0', steal: '#3A4258' }[kind] || '#FFD24A';
      k.at(k.rbox(0.42, 0.34, 0.42, col, {}, 0.06), 0, 0.17, 0, g); k.at(k.rbox(0.46, 0.08, 0.46, '#FFFFFF', {}, 0.03), 0, 0.36, 0, g);
      k.at(k.rbox(0.08, 0.36, 0.44, '#FFFFFF', {}, 0.02), 0, 0.18, 0, g); k.at(k.sph(0.08, '#FFFFFF', {}, 10), -0.06, 0.44, 0, g); k.at(k.sph(0.08, '#FFFFFF', {}, 10), 0.06, 0.44, 0, g);
      const halo = new T.Mesh(new T.CircleGeometry(0.4, 24), new T.MeshBasicMaterial({ color: '#FFE36E', transparent: true, opacity: 0.45, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; g.add(halo);
      return g;
    }
    makeBag() { const T = this.T, k = this.W.kit, g = new T.Group(); const b = k.rbox(0.3, 0.4, 0.06, '#E0453A', {}, 0.04); b.position.y = 0.32; b.rotation.x = -0.35; g.add(b); const c = k.cyl(0.07, 0.07, 0.02, '#FFD24A'); c.rotation.x = Math.PI / 2 - 0.35; c.position.set(0, 0.36, 0.04); g.add(c); const halo = new T.Mesh(new T.CircleGeometry(0.3, 20), new T.MeshBasicMaterial({ color: '#FF6A4A', transparent: true, opacity: 0.35, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; g.add(halo); return g; }
    makeBanana() { const k = this.W.kit, g = new this.T.Group(); for (const a of [-1, 0, 1]) { const p = k.cap(0.05, 0.16, '#F5D547'); p.rotation.set(Math.PI / 2, 0, a * 0.9); p.position.set(Math.sin(a * 0.9) * 0.1, 0.05, -Math.cos(a * 0.9) * 0.1 + 0.05); g.add(p); } return g; }
    // 物件可见性：和人一样按视野 / 房间 / 老板看不到房间里面
    seesSpot(x, y, roomId) {
      const m = this.app.match, p = m.player, cam2 = this.r.cam || {};
      if (cam2.room) return roomId === cam2.room;
      if (roomId && p.kind === 'boss' && !m.peekRooms().includes(roomId)) return false;
      return A.inSight(p, x, y);
    }
    syncProps(dt) {
      const m = this.app.match, p = m.player, t = this.time, cam2 = this.r.cam || {}; this.frameNo = (this.frameNo || 0) + 1;
      for (const it of m.supplies) { const o = this.prop('s' + it.id, () => this.makeGift(it.kind)); o.visible = this.seesSpot(it.x, it.y, it.room); o.position.set(it.x, 0, it.y); o.rotation.y = t * 1.2; o.position.y = 0.06 + Math.sin(t * 4 + it.id) * 0.05; }
      for (const b of m.bags || []) { const o = this.prop(b, () => this.makeBag()); o.visible = !cam2.room && A.inSight(p, b.x, b.y); o.position.set(b.x, Math.sin(t * 5 + b.x) * 0.04, b.y); o.rotation.y = Math.sin(t * 2 + b.y) * 0.4; }
      for (const n of m.bananas || []) { const o = this.prop(n, () => this.makeBanana()); o.visible = !cam2.room && A.inSight(p, n.x, n.y); o.position.set(n.x, 0, n.y); }
      for (const [key, o] of this.props) if (o.userData.seen !== this.frameNo) { this.W.scene.remove(o); this.props.delete(key); }
      // 自己工位绿框
      const own = p.kind === 'employee' && !cam2.room && m.phase === 'playing'; this.ownRing.visible = own;
      if (own) { this.ownRing.position.set(p.desk.c + 1, 0, p.desk.r + 0.5); this.ownMat.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 5)); }
      A.DESKS.forEach((d, i) => { this.puddles[i].visible = (m.deskLocks && m.deskLocks[d.id] > 0) && this.seesSpot(d.c + 1, d.r + 0.5, null); });
      // 点击落点
      const q = p.path && p.path.length && !cam2.room ? p.path[p.path.length - 1] : null; this.target.visible = !!q;
      if (q) { this.target.position.set(q.x, 0.04, q.y); const s2 = 1 + 0.15 * Math.sin(t * 8); this.target.scale.set(s2, s2, s2); }
      // 老板红圈
      const b = m.boss, bm = this.models.get(b); this.bossRing.visible = !!(bm && bm.group.visible);
      if (this.bossRing.visible) { this.bossRing.position.set(b.x, 0.03, b.y); const ph = (t * 1.2) % 1; this.bossRing.scale.setScalar(1 + ph * 0.6); this.bossRing.material.opacity = 0.7 * (1 - ph); }
      // 监控高亮
      const pk = p.kind === 'boss' && !cam2.room ? m.peekRooms() : [];
      for (const id in this.peekPlanes) { const on = pk.includes(id); this.peekPlanes[id].visible = on; if (on) this.peekPlanes[id].material.opacity = 0.18 + 0.15 * (0.5 + 0.5 * Math.sin(t * 6)); }
    }
    // 屏幕上能不能看到这个点（3D 投影后在场景区域内）
    onScreen(x, y, h, pad) { const q = this.project(x, y, h); const V = A.VIEW; pad = pad || 0; return q.X >= -pad && q.X <= V.W + pad && q.Y >= V.VY - pad && q.Y <= V.BOT + pad; }
    // 逻辑坐标（540 宽画布上的点）→ 地面格子坐标
    toWorld(px, py) {
      const V = A.VIEW, nx = (px / V.W) * 2 - 1, ny = -(((py - V.VY) / V.VH) * 2 - 1);
      this.ray.setFromCamera({ x: nx, y: ny }, this.cam); const hit = this.ray.ray.intersectPlane(this.plane, this.v);
      return hit ? { x: hit.x, y: hit.z } : { x: -99, y: -99 };
    }
    // 格子坐标（离地 h 格）→ 逻辑坐标
    project(x, y, h) { this.v.set(x, h || 0, y).project(this.cam); const V = A.VIEW; return { X: (this.v.x + 1) / 2 * V.W, Y: V.VY + (1 - this.v.y) / 2 * V.VH }; }
  }
  A.View3D = View3D;
})(typeof window !== 'undefined' ? window : globalThis);
