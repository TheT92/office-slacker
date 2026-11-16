// 小清新配色与通用绘图工具（只给渲染层用）。
(function (g) {
  const OS = (g.OS = g.OS || {});
  const C = {
    bg: '#FFF8EE',          // 奶油底
    ink: '#4A3F35',         // 深棕灰文字
    inkSoft: '#8C7B6B',
    line: '#E3D5C3',
    card: '#FFFFFF',
    floor: '#F5E6D0', plank: '#EBD8BE', aisle: '#EFE2CF',
    partition: '#CDB89F',
    mint: '#BFE6D3', sakura: '#F7C6C7', sky: '#BFD7EA', butter: '#FBE7A1', lilac: '#D9CFF0', grass: '#CBE8B5',
    coral: '#E8746A', coralSoft: '#F6C1BB', amber: '#F2B544', amberSoft: '#FCE3A8',
    hud: '#FFFDF8', panel: '#F6EDE1',
    desk: '#E6CBA8', deskTop: '#F0DCC0', monitor: '#6B7A8F', screen: '#CFE6F5',
    // —— 语义色：同一种颜色在所有界面代表同一类信息 ——
    money: '#F0A030', moneyDeep: '#C9781A', moneySoft: '#FDEBC8',      // 金钱
    time: '#4A90C8', timeSoft: '#DCEBF7',                               // 时间
    ready: '#4CAF70', readyDeep: '#2E8B57',                             // 可释放
    special: '#FFF3E2', specialEdge: '#F2C38A', specialInk: '#C77A1C',  // 特殊技能员工
    normal: '#EEF8F2', normalEdge: '#A8D8BC', normalInk: '#3E9A68',     // 普通员工
    chapters: ['#7CD3A2', '#7DB8F0', '#B79BEA'],                         // 章节色：1–5 / 6–10 / 11–15 关
    epic: '#8E44D9', epicSoft: '#A47AD8',                                 // 特殊技能说明（RPG 装备说明式紫色）
  };
  // 品质色（参考魔兽世界物品品质）
  // ink：浅色背景上用的品质色（边框、名字）；soft：悬停光晕
  const QUALITY = {
    common:    { name: '普通', ink: '#9A9A9A', soft: 'rgba(150,150,150,0.35)' },
    rare:      { name: '精良', ink: '#2F80ED', soft: 'rgba(47,128,237,0.35)' },
    epic:      { name: '史诗', ink: '#9B51E0', soft: 'rgba(155,81,224,0.38)' },
    legendary: { name: '传说', ink: '#F2780C', soft: 'rgba(242,120,12,0.4)' },
  };
  // 房间配色与道具
  const ROOM = {
    restroom: { fill: '#DCEBF7', edge: '#9DBCD8', tag: '#9DBCD8' },
    meeting:  { fill: '#DDF1E6', edge: '#97CDB1', tag: '#97CDB1' },
    pantry:   { fill: '#FDF1C9', edge: '#E3C46E', tag: '#E3C46E' },
    printer:  { fill: '#EAE3F7', edge: '#B7A6DD', tag: '#B7A6DD' },
    rooftop:  { fill: '#E3F2D6', edge: '#9FCB82', tag: '#9FCB82' },
  };
  const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Hiragino Sans GB",sans-serif';
  const font = (size, bold) => (bold ? 'bold ' : '') + size + 'px ' + FONT;
  // 圆角矩形路径（不依赖 ctx.roundRect，兼容旧浏览器）
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 带柔和阴影的圆角块
  function panel(ctx, x, y, w, h, r, fill, opts) {
    opts = opts || {};
    ctx.save();
    if (opts.shadow !== false) { ctx.shadowColor = opts.glow || 'rgba(120,90,60,0.18)'; ctx.shadowBlur = opts.glowBlur || 8; ctx.shadowOffsetY = opts.glow ? 0 : 2; }
    rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
    if (opts.stroke) { rr(ctx, x, y, w, h, r); ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.lineWidth || 1.5; ctx.stroke(); }
  }
  // 胶囊标签；内部 save/restore，不改变调用方的字体与对齐方式
  function pill(ctx, x, y, text, bg, fg, size) {
    ctx.save();
    ctx.font = font(size || 12, true); const w = ctx.measureText(text).width + 14, h = (size || 12) + 8;
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 7, y + h / 2 + 0.5);
    ctx.restore(); return w;
  }
  // 金币图标
  function coin(ctx, x, y, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = C.money; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.fillStyle = '#F8C55A'; ctx.fill();
    ctx.fillStyle = C.moneyDeep; ctx.font = font(Math.round(r * 1.25), true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', x, y + 0.5);
    ctx.restore();
  }
  // 时钟图标
  function clock(ctx, x, y, r, color) {
    ctx.save(); ctx.strokeStyle = color || C.time; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.6); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y + r * 0.2); ctx.stroke();
    ctx.restore();
  }
  // 圆形"!"图标（被抓/危险）
  function alert(ctx, x, y, r) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = C.coral; ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = font(Math.round(r * 1.4), true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + 0.5); ctx.restore();
  }
  // 多色标题：每个字一种颜色，白色描边 + 柔和阴影
  function rainbowTitle(ctx, text, cx, y, size, colors, t) {
    ctx.save(); ctx.font = font(size, true); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const chars = [...text], ws = chars.map(ch => ctx.measureText(ch).width), gap = size * 0.06, total = ws.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    let x = cx - total / 2;
    chars.forEach((ch, i) => {
      ctx.shadowColor = 'rgba(120,90,60,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
      const yy = t == null ? y : y + Math.sin(t * 3 - i * 0.7) * 3;   // 传入时间 t 时每个字轻微波浪弹跳
      ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#FFFFFF'; ctx.lineJoin = 'round'; ctx.strokeText(ch, x, yy);
      ctx.shadowColor = 'transparent'; ctx.fillStyle = colors[i % colors.length]; ctx.fillText(ch, x, yy);
      x += ws[i] + gap;
    });
    ctx.restore();
  }
  // —— 《胡闹厨房》式"厚实"风格：粗深色描边 + 偏移硬阴影 ——
  const OUTLINE = '#3D2B1F';
  function chunky(ctx, x, y, w, h, r, fill, opts) {
    opts = opts || {}; const d = opts.depth == null ? 5 : opts.depth;
    ctx.save();
    if (d) { rr(ctx, x, y + d, w, h, r); ctx.fillStyle = opts.depthColor || 'rgba(61,43,31,0.35)'; ctx.fill(); }   // 硬阴影
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.glowBlur || 14; }
    rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent';
    if (opts.outline !== false) { rr(ctx, x, y, w, h, r); ctx.strokeStyle = opts.outline || OUTLINE; ctx.lineWidth = opts.lineWidth || 3; ctx.stroke(); }
    ctx.restore();
  }
  // 单色 Logo 标题：橙黄字 + 粗深色描边 + 硬阴影，整体微倾斜、轻轻上下浮动
  function logo(ctx, text, cx, y, size, t) {
    ctx.save(); ctx.translate(cx, y + Math.sin((t || 0) * 2) * 2); ctx.rotate(-0.04);
    ctx.font = font(size, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.3; ctx.strokeStyle = OUTLINE; ctx.strokeText(text, 0, size * 0.1);       // 硬阴影
    ctx.fillStyle = OUTLINE; ctx.fillText(text, 0, size * 0.1);
    ctx.lineWidth = size * 0.26; ctx.strokeStyle = OUTLINE; ctx.strokeText(text, 0, 0);
    ctx.lineWidth = size * 0.1; ctx.strokeStyle = '#FFFFFF'; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#FFB52E'; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // 带描边的粗体字（标题、按钮）
  function boldText(ctx, text, x, y, size, fill, outline, align) {
    ctx.save(); ctx.font = font(size, true); ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = outline || OUTLINE; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y); ctx.restore();
  }
  OS.theme = { C, QUALITY, ROOM, OUTLINE, chunky, logo, boldText, FONT, font, rr, panel, pill, coin, clock, alert, rainbowTitle };
})(typeof window !== "undefined" ? window : globalThis);
