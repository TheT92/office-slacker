// 角色与道具绘制（纯 Canvas 代码，无外部图片）。Q 版比例：大圆头 + 小身体。
// drawAnimal(ctx, id, x, y, s, o)：x,y 为身体中心（脚底约在 y+14s），s 为缩放；
//   o.mood：'work'（认真）| 'slack'（眯眼笑 + 小道具）| 'danger'（冒汗）| 'caught'（震惊）| 'walk'；
//   o.t：时间（秒），用于眨眼和走路晃动；o.prop：'coffee'|'phone'|'paper'|null；o.headOnly：只画头（卡片头像）。
(function (g) {
  const OS = (g.OS = g.OS || {});
  // 每种动物的外观参数
  const SPEC = {
    rabbit:   { fur: '#F7F1EA', inner: '#F7C6C7', ear: 'long', shirt: '#BFD7EA' },
    cat:      { fur: '#F2C9A0', inner: '#F7C6C7', ear: 'tri', stripe: '#E0A877', shirt: '#F7C6C7' },
    bear:     { fur: '#C49A72', inner: '#E8C9A8', ear: 'round', muzzle: '#E8D3BC', shirt: '#BFE6D3' },
    fox:      { fur: '#F0A35E', inner: '#FFF1E2', ear: 'pointy', muzzle: '#FFF4E6', shirt: '#DCE3F2' },
    hamster:  { fur: '#F3D3A3', inner: '#F7C6C7', ear: 'small', cheeks: '#FFF6EA', shirt: '#FBE7A1' },
    penguin:  { fur: '#4F5B6B', face: '#FFFFFF', beak: '#F2B544', ear: 'none', shirt: '#BFD7EA' },
    sloth:    { fur: '#CDB99E', patch: '#8E7860', ear: 'none', muzzle: '#E9DCC8', shirt: '#BFE6D3' },
    owl:      { fur: '#B08F6E', ear: 'tuft', bigEyes: true, beak: '#F2B544', face: '#EBD9C2', shirt: '#D9CFF0' },
    parrot:   { fur: '#8FD18B', ear: 'crest', crest: '#F2B544', beak: '#F29A5E', face: '#C9EFC6', shirt: '#FBE7A1' },
    dog:      { fur: '#F0D6B4', inner: '#C9A27E', ear: 'floppy', muzzle: '#FFF4E6', shirt: '#F7C6C7' },
    raccoon:  { fur: '#B3B6C0', inner: '#7D828E', ear: 'round', mask: '#5E6370', muzzle: '#EEF0F4', shirt: '#CBE8B5' },
    hedgehog: { fur: '#EBD7BC', spikes: '#9B7A5C', ear: 'small', inner: '#F7C6C7', shirt: '#DCEBF7' },
  };
  const INK = '#4A3F35';
  function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function ellipse(ctx, x, y, rx, ry, fill, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }

  function ears(ctx, sp, hx, hy, R) {
    const f = sp.fur, i = sp.inner || sp.fur;
    switch (sp.ear) {
      case 'long':
        for (const d of [-1, 1]) { ellipse(ctx, hx + d * R * 0.42, hy - R * 1.25, R * 0.28, R * 0.75, f, d * 0.12); ellipse(ctx, hx + d * R * 0.42, hy - R * 1.2, R * 0.13, R * 0.55, i, d * 0.12); }
        break;
      case 'tri': case 'pointy':
        for (const d of [-1, 1]) {
          const bx = hx + d * R * 0.62, by = hy - R * 0.55, tip = sp.ear === 'pointy' ? 1.25 : 1.05;
          ctx.beginPath(); ctx.moveTo(bx - d * R * 0.38, by + R * 0.1); ctx.lineTo(bx + d * R * 0.18, hy - R * tip); ctx.lineTo(bx + d * R * 0.36, by + R * 0.25); ctx.closePath(); ctx.fillStyle = f; ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx - d * R * 0.18, by + R * 0.08); ctx.lineTo(bx + d * R * 0.14, hy - R * (tip - 0.22)); ctx.lineTo(bx + d * R * 0.22, by + R * 0.2); ctx.closePath(); ctx.fillStyle = i; ctx.fill();
        }
        break;
      case 'round': for (const d of [-1, 1]) { circle(ctx, hx + d * R * 0.72, hy - R * 0.72, R * 0.36, f); circle(ctx, hx + d * R * 0.72, hy - R * 0.72, R * 0.2, i); } break;
      case 'small': for (const d of [-1, 1]) { circle(ctx, hx + d * R * 0.7, hy - R * 0.75, R * 0.26, f); circle(ctx, hx + d * R * 0.7, hy - R * 0.75, R * 0.14, i); } break;
      case 'floppy': for (const d of [-1, 1]) ellipse(ctx, hx + d * R * 0.92, hy - R * 0.05, R * 0.26, R * 0.58, i, d * -0.35); break;
      case 'tuft': for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + d * R * 0.35, hy - R * 0.85); ctx.lineTo(hx + d * R * 0.85, hy - R * 1.2); ctx.lineTo(hx + d * R * 0.75, hy - R * 0.55); ctx.closePath(); ctx.fillStyle = f; ctx.fill(); } break;
      case 'crest': for (const k of [-1, 0, 1]) ellipse(ctx, hx + k * R * 0.22, hy - R * 1.05, R * 0.14, R * 0.38, sp.crest, k * 0.4); break;
    }
  }
  function face(ctx, sp, hx, hy, R, mood, t) {
    // 特殊脸部底色
    if (sp.face && !sp.bigEyes) ellipse(ctx, hx, hy + R * 0.12, R * 0.78, R * 0.72, sp.face);
    if (sp.face && sp.bigEyes) { for (const d of [-1, 1]) circle(ctx, hx + d * R * 0.38, hy, R * 0.4, sp.face); }
    if (sp.mask) for (const d of [-1, 1]) ellipse(ctx, hx + d * R * 0.38, hy - R * 0.02, R * 0.34, R * 0.24, sp.mask, d * 0.25);
    if (sp.patch) for (const d of [-1, 1]) ellipse(ctx, hx + d * R * 0.36, hy + R * 0.02, R * 0.26, R * 0.3, sp.patch, d * -0.5);
    if (sp.muzzle) ellipse(ctx, hx, hy + R * 0.42, R * 0.42, R * 0.3, sp.muzzle);
    if (sp.cheeks) for (const d of [-1, 1]) circle(ctx, hx + d * R * 0.55, hy + R * 0.35, R * 0.3, sp.cheeks);
    if (sp.stripe) { ctx.strokeStyle = sp.stripe; ctx.lineWidth = R * 0.12; ctx.lineCap = 'round'; for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(hx + k * R * 0.22, hy - R * 0.95); ctx.lineTo(hx + k * R * 0.18, hy - R * 0.7); ctx.stroke(); } }
    // 眼睛
    const eyeY = hy - R * 0.02, ex = sp.bigEyes ? R * 0.38 : R * 0.34, blink = Math.sin(t * 1.7 + hx * 0.13) > 0.985;
    const dark = sp.mask || sp.fur === '#4F5B6B' && !sp.face ? '#FFFFFF' : INK;
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = Math.max(1.2, R * 0.11); ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      const x = hx + d * ex;
      if (sp.bigEyes) circle(ctx, x, eyeY, R * 0.27, '#FFFFFF');
      if (mood === 'slack') { ctx.beginPath(); ctx.arc(x, eyeY + R * 0.06, R * 0.13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (mood === 'caught') { const k = R * 0.12; ctx.beginPath(); ctx.moveTo(x - k, eyeY - k); ctx.lineTo(x + k, eyeY + k); ctx.moveTo(x + k, eyeY - k); ctx.lineTo(x - k, eyeY + k); ctx.stroke(); }
      else if (blink && mood !== 'danger') { ctx.beginPath(); ctx.moveTo(x - R * 0.1, eyeY); ctx.lineTo(x + R * 0.1, eyeY); ctx.stroke(); }
      else { circle(ctx, x, eyeY, sp.bigEyes ? R * 0.16 : R * 0.1, sp.mask ? INK : INK); circle(ctx, x + R * 0.04, eyeY - R * 0.04, R * 0.035, '#FFFFFF'); }
    }
    void dark;
    // 腮红
    for (const d of [-1, 1]) { ctx.globalAlpha = 0.55; circle(ctx, hx + d * R * 0.62, hy + R * 0.3, R * 0.14, '#F4A6A6'); ctx.globalAlpha = 1; }
    // 嘴 / 喙
    if (sp.beak) { ctx.beginPath(); ctx.moveTo(hx - R * 0.14, hy + R * 0.22); ctx.lineTo(hx + R * 0.14, hy + R * 0.22); ctx.lineTo(hx, hy + R * 0.45); ctx.closePath(); ctx.fillStyle = sp.beak; ctx.fill(); }
    else {
      circle(ctx, hx, hy + R * 0.26, R * 0.07, INK);   // 鼻子
      ctx.beginPath(); ctx.lineWidth = Math.max(1, R * 0.08);
      if (mood === 'caught') { ctx.arc(hx, hy + R * 0.52, R * 0.12, 0, Math.PI * 2); ctx.stroke(); }
      else if (mood === 'danger') { ctx.moveTo(hx - R * 0.12, hy + R * 0.48); ctx.quadraticCurveTo(hx, hy + R * 0.4, hx + R * 0.12, hy + R * 0.48); ctx.stroke(); }
      else if (mood === 'slack') { ctx.arc(hx, hy + R * 0.34, R * 0.15, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
      else { ctx.moveTo(hx - R * 0.1, hy + R * 0.42); ctx.quadraticCurveTo(hx - R * 0.05, hy + R * 0.48, hx, hy + R * 0.38); ctx.quadraticCurveTo(hx + R * 0.05, hy + R * 0.48, hx + R * 0.1, hy + R * 0.42); ctx.stroke(); }
    }
  }
  function head(ctx, sp, hx, hy, R, mood, t) {
    if (sp.spikes) {   // 刺猬背刺
      ctx.fillStyle = sp.spikes;
      for (let k = 0; k < 11; k++) { const a = Math.PI * (0.95 + k * 0.11); ctx.beginPath(); ctx.moveTo(hx + Math.cos(a - 0.15) * R * 0.9, hy + Math.sin(a - 0.15) * R * 0.9); ctx.lineTo(hx + Math.cos(a) * R * 1.45, hy + Math.sin(a) * R * 1.45); ctx.lineTo(hx + Math.cos(a + 0.15) * R * 0.9, hy + Math.sin(a + 0.15) * R * 0.9); ctx.fill(); }
    }
    if (sp.ear !== 'floppy') ears(ctx, sp, hx, hy, R);
    circle(ctx, hx, hy, R, sp.fur);
    if (sp.ear === 'floppy') ears(ctx, sp, hx, hy, R);
    face(ctx, sp, hx, hy, R, mood, t);
  }
  function drawAnimal(ctx, id, x, y, s, o) {
    o = o || {}; const sp = SPEC[id] || SPEC.rabbit, mood = o.mood || 'work', t = o.t || 0;
    const bob = mood === 'walk' ? Math.abs(Math.sin(t * 12)) * 2.2 * s : 0, R = 13 * s;
    ctx.save(); ctx.translate(0, -bob);
    if (!o.headOnly) {
      ctx.globalAlpha = 0.18; ellipse(ctx, x, y + 14 * s + bob, 12 * s, 3.5 * s, '#5A4636'); ctx.globalAlpha = 1;   // 影子
      // 身体（衬衫）+ 手
      ctx.beginPath(); ctx.ellipse(x, y + 5 * s, 10.5 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fillStyle = sp.shirt; ctx.fill();
      ellipse(ctx, x, y + 9 * s, 5.5 * s, 5 * s, sp.face && !sp.bigEyes ? sp.face : sp.fur);
      for (const d of [-1, 1]) circle(ctx, x + d * 9.5 * s, y + (mood === 'work' ? 3 : 6) * s + (mood === 'work' ? Math.sin(t * 18 + d) * 1.2 * s : 0), 3.2 * s, sp.fur);
    }
    const hy = o.headOnly ? y : y - 12 * s;
    head(ctx, sp, x, hy, R, mood === 'walk' ? 'work' : mood, t);
    // 状态装饰
    if (mood === 'danger') { const k = (t * 3) % 1; ellipse(ctx, x + R * 1.05, hy - R * 0.4 + k * 4 * s, 2.6 * s, 3.8 * s, '#8EC9F0'); }
    if (mood === 'caught') { ctx.fillStyle = '#E8746A'; ctx.font = 'bold ' + Math.round(16 * s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x + R * 1.1, hy - R * 1.0); }
    if (!o.headOnly && o.prop) prop(ctx, o.prop, x + 12 * s, y + 1 * s, s, t);
    ctx.restore();
  }
  // 摸鱼小道具
  function prop(ctx, kind, x, y, s, t) {
    if (kind === 'coffee') {
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#B07A55'; ctx.lineWidth = 1.2 * s;
      ctx.beginPath(); ctx.rect(x - 3.5 * s, y - 4 * s, 7 * s, 8 * s); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 4 * s, y, 2.2 * s, -1.4, 1.4); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#B9A99A';
      for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + k * 1.5 * s, y - 5 * s); ctx.quadraticCurveTo(x + k * 1.5 * s + Math.sin(t * 4 + k) * 2 * s, y - 8 * s, x + k * 1.5 * s, y - 11 * s); ctx.stroke(); }
      ctx.globalAlpha = 1;
    } else if (kind === 'phone') {
      ctx.fillStyle = '#6B7A8F'; ctx.beginPath(); ctx.rect(x - 3 * s, y - 6 * s, 6 * s, 10 * s); ctx.fill();
      ctx.fillStyle = '#CFE6F5'; ctx.fillRect(x - 2 * s, y - 5 * s, 4 * s, 7 * s);
    } else if (kind === 'paper') {
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#C9B8A6'; ctx.lineWidth = 1 * s; ctx.beginPath(); ctx.rect(x - 4 * s, y - 5 * s, 8 * s, 10 * s); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#D8CBBB'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 2.5 * s, y - 2.5 * s + k * 2.6 * s); ctx.lineTo(x + 2.5 * s, y - 2.5 * s + k * 2.6 * s); ctx.stroke(); }
    }
  }
  // 老板：狮子（鬃毛 + 领带），体型大一圈
  function drawBoss(ctx, x, y, s, o) {
    o = o || {}; const t = o.t || 0, R = 15 * s, hy = y - 13 * s, look = o.look || 0;
    ctx.save();
    ctx.globalAlpha = 0.2; ellipse(ctx, x, y + 16 * s, 15 * s, 4 * s, '#5A4636'); ctx.globalAlpha = 1;
    // 西装 + 领带
    ellipse(ctx, x, y + 5 * s, 13 * s, 12 * s, '#5B6577');
    ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 5 * s); ctx.lineTo(x + 4 * s, y - 5 * s); ctx.lineTo(x, y + 2 * s); ctx.closePath(); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y - 3 * s); ctx.lineTo(x + 2.6 * s, y + 6 * s); ctx.lineTo(x, y + 10 * s); ctx.lineTo(x - 2.6 * s, y + 6 * s); ctx.closePath(); ctx.fillStyle = '#E8746A'; ctx.fill();
    for (const d of [-1, 1]) circle(ctx, x + d * 12 * s, y + 6 * s, 3.8 * s, '#E9B872');
    // 鬃毛
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; circle(ctx, x + look + Math.cos(a) * R * 1.05, hy + Math.sin(a) * R * 1.05, R * 0.42, k % 2 ? '#C9793E' : '#D98C4A'); }
    circle(ctx, x + look, hy, R, '#F1C27D');
    for (const d of [-1, 1]) circle(ctx, x + look + d * R * 0.72, hy - R * 0.72, R * 0.22, '#F1C27D');
    ellipse(ctx, x + look, hy + R * 0.4, R * 0.45, R * 0.3, '#FBE3BC');
    // 眉毛（严肃）+ 眼睛
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      const ex = x + look * 1.3 + d * R * 0.36;
      ctx.beginPath(); ctx.moveTo(ex - d * R * 0.2, hy - R * 0.32); ctx.lineTo(ex + d * R * 0.12, hy - R * 0.22); ctx.stroke();
      if (o.mood === 'read') { ctx.beginPath(); ctx.moveTo(ex - R * 0.1, hy); ctx.lineTo(ex + R * 0.1, hy); ctx.stroke(); }
      else circle(ctx, ex, hy - R * 0.02, R * 0.1, INK);
    }
    circle(ctx, x + look * 1.3, hy + R * 0.25, R * 0.09, INK);
    ctx.beginPath(); ctx.moveTo(x + look * 1.3 - R * 0.14, hy + R * 0.5); ctx.lineTo(x + look * 1.3 + R * 0.14, hy + R * 0.5); ctx.stroke();
    if (o.mood === 'read') prop(ctx, 'paper', x + 13 * s, y + 2 * s, s * 1.1, t);
    ctx.restore();
  }
  // 工位：书桌 + 显示器 + 椅背（员工画在桌子后面）
  function drawDesk(ctx, x, y, s, used) {
    const C = OS.theme.C;
    ctx.save();
    if (!used) ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#D9C3A5'; OS.theme.rr(ctx, x - 16 * s, y - 2 * s, 32 * s, 18 * s, 6 * s); ctx.fill();   // 椅子
    ctx.restore(); return { front: () => {
      ctx.save(); if (!used) ctx.globalAlpha = 0.5;
      ctx.fillStyle = C.desk; OS.theme.rr(ctx, x - 38 * s, y + 14 * s, 76 * s, 16 * s, 4 * s); ctx.fill();
      ctx.fillStyle = C.deskTop; OS.theme.rr(ctx, x - 38 * s, y + 12 * s, 76 * s, 7 * s, 3 * s); ctx.fill();
      ctx.fillStyle = C.monitor; OS.theme.rr(ctx, x - 13 * s, y + 0 * s, 26 * s, 15 * s, 2.5 * s); ctx.fill();
      ctx.fillStyle = C.screen; ctx.fillRect(x - 11 * s, y + 2 * s, 22 * s, 10 * s);
      ctx.fillStyle = '#B9C6D3'; ctx.fillRect(x - 2 * s, y + 15 * s, 4 * s, 2 * s);
      // 小盆栽
      ctx.fillStyle = '#E8B48A'; ctx.fillRect(x + 22 * s, y + 6 * s, 7 * s, 7 * s); circle(ctx, x + 25.5 * s, y + 4 * s, 5 * s, '#9FCB82');
      ctx.restore();
    } };
  }
  // 房间道具（画在房间右下角，半透明，不挡人）
  function drawRoomProps(ctx, id, z, t) {
    const x = z.x, y = z.y, w = z.w, h = z.h;
    ctx.save(); ctx.globalAlpha = 0.85;
    if (id === 'restroom') {
      for (let k = 0; k < 2; k++) { const dx = x + w - 34 - k * 30; ctx.fillStyle = '#B9D3EA'; OS.theme.rr(ctx, dx, y + h - 56, 26, 50, 4); ctx.fill(); circle(ctx, dx + 20, y + h - 30, 2, '#7FA6C9'); }
    } else if (id === 'pantry') {
      ctx.fillStyle = '#E9CF84'; ctx.fillRect(x + 6, y + h - 22, w - 12, 16);
      ctx.fillStyle = '#9C8CA8'; OS.theme.rr(ctx, x + w - 40, y + h - 56, 26, 36, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + w - 34, y + h - 48, 14, 8);
    } else if (id === 'meeting') {
      ctx.fillStyle = '#FFFFFF'; OS.theme.rr(ctx, x + w / 2 - 40, y + 26, 80, 30, 3); ctx.fill(); ctx.strokeStyle = '#97CDB1'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#E8746A'; ctx.beginPath(); ctx.moveTo(x + w / 2 - 30, y + 46); ctx.lineTo(x + w / 2 - 14, y + 36); ctx.lineTo(x + w / 2, y + 42); ctx.lineTo(x + w / 2 + 22, y + 32); ctx.stroke();
      ctx.fillStyle = '#C9A27E'; OS.theme.rr(ctx, x + 16, y + h - 34, w - 32, 18, 9); ctx.fill();
    } else if (id === 'printer') {
      ctx.fillStyle = '#B7A6DD'; OS.theme.rr(ctx, x + w - 46, y + h - 44, 36, 26, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + w - 40, y + h - 52, 24, 10);
      ctx.fillStyle = '#8F7CC4'; ctx.fillRect(x + w - 42, y + h - 30, 28, 3);
    } else if (id === 'rooftop') {
      ctx.fillStyle = '#D4ECFA'; ctx.fillRect(x + 2, y + 2, w - 4, h * 0.45);
      const cx = x + 30 + ((t * 6) % (w - 40));
      circle(ctx, cx, y + 26, 8, '#FFFFFF'); circle(ctx, cx + 9, y + 23, 10, '#FFFFFF'); circle(ctx, cx + 19, y + 27, 7, '#FFFFFF');
      ctx.strokeStyle = '#9FCB82'; ctx.lineWidth = 2; for (let k = 0; k < 6; k++) { const px = x + 8 + k * (w - 16) / 5; ctx.beginPath(); ctx.moveTo(px, y + h - 8); ctx.lineTo(px, y + h - 28); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x + 6, y + h - 26); ctx.lineTo(x + w - 6, y + h - 26); ctx.stroke();
    }
    ctx.restore();
  }
  OS.sprites = { SPEC, drawAnimal, drawBoss, drawDesk, drawRoomProps, prop };
})(typeof window !== "undefined" ? window : globalThis);
