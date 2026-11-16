// 角色解锁与出战阵容（纯逻辑）。只选人，不排座位：工位位置不影响玩法。
// 关卡字段：desks（工位数）、allowed（本关允许的角色，可选）、required（必须上场，预留）、banned（禁用，预留）。
// 本关允许的角色：配置了 allowed 就用它；否则为"解锁关卡号 < 本关"的角色——回到前期关卡时，后期角色不能用、也不显示。
(function (g) {
  const OS = (g.OS = g.OS || {});
  const allIds = () => Object.keys(OS.characters);
  // 角色是否已解锁：unlockAfter=0 初始就有，否则需要该关 ≥1 星
  const isUnlocked = (progress, id) => { const c = OS.characters[id]; return !!c && (!c.unlockAfter || progress.stars(c.unlockAfter) > 0); };
  const unlockedIds = progress => allIds().filter(id => isUnlocked(progress, id));
  const desksOf = level => level.desks || (level.roster ? level.roster.length : 4);
  const levelRooms = level => (level.rooms && level.rooms.length ? level.rooms : OS.DEFAULT_ROOMS);
  // 本关允许：allowed 指定 / 解锁关卡号 < 本关；并且该角色普通技能要去的房间本关存在
  const allowedByLevel = (level, id) => {
    const c = OS.characters[id];
    if (!levelRooms(level).includes(c.solo.room)) return false;
    return level.allowed ? level.allowed.includes(id) : (c.unlockAfter || 0) < level.id;
  };
  // 本关可选的角色（本关允许 + 已解锁 + 未被禁用），按角色表顺序
  const pool = (level, progress) => unlockedIds(progress).filter(id => allowedByLevel(level, id) && !(level.banned || []).includes(id));
  // 可选人数多于工位时才需要选阵容
  const needsPick = (level, progress) => pool(level, progress).length > desksOf(level);
  // 默认阵容：必选角色 → 上次的阵容（按原顺序）→ 按角色表顺序补满
  function defaultLineup(level, progress, last) {
    const ok = pool(level, progress), n = desksOf(level), out = [];
    const add = id => { if (out.length < n && ok.includes(id) && !out.includes(id)) out.push(id); };
    (level.required || []).forEach(add); (last || []).forEach(add); ok.forEach(add);
    return out;
  }
  // 点击上场/下场。返回新数组；不允许的操作原样返回。
  function toggle(level, progress, picks, id) {
    if (picks.includes(id)) return (level.required || []).includes(id) ? picks : picks.filter(x => x !== id);
    if (!pool(level, progress).includes(id) || picks.length >= desksOf(level)) return picks;
    return picks.concat(id);
  }
  // 'ok' | 'empty' | 'too_many' | 'missing_required' | 'invalid'
  function validate(level, progress, picks) {
    if (!picks.length) return 'empty';
    if (picks.length > desksOf(level)) return 'too_many';
    if (new Set(picks).size !== picks.length || picks.some(id => !pool(level, progress).includes(id))) return 'invalid';
    if ((level.required || []).some(id => !picks.includes(id))) return 'missing_required';
    return 'ok';
  }
  // 下一个待解锁的角色（选关界面提示用）
  const nextUnlock = progress => allIds().map(id => OS.characters[id]).filter(c => !isUnlocked(progress, c.id)).sort((a, b) => a.unlockAfter - b.unlockAfter)[0] || null;
  OS.lineup = { isUnlocked, unlockedIds, allowedByLevel, desksOf, pool, needsPick, defaultLineup, toggle, validate, nextUnlock };
})(typeof window !== "undefined" ? window : globalThis);
