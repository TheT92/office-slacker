// "本关新内容"：对比上一关自动生成（新同事、新房间、工位变化、考核规则、新功能），第 1 关为入门玩法。
// 关卡可用 intro: ['自定义说明', ...] 追加条目。纯逻辑，可在 Node 中测试。
(function (g) {
  const OS = (g.OS = g.OS || {});
  const roomsOf = l => (l && l.rooms && l.rooms.length ? l.rooms : OS.DEFAULT_ROOMS);
  const allowedIds = l => Object.keys(OS.characters).filter(id => OS.lineup.allowedByLevel(l, id));
  function teamText(t) {
    if (t.type === 'delay') return '拖住老板：查房推迟 ' + t.delay + ' 秒（预警中放可直接取消查房）';
    if (t.type === 'shield') return '打掩护：' + t.duration + ' 秒内被查到的人不算被抓';
    return '带走老板：老板离开 ' + t.duration + ' 秒，工位上的人都能摸鱼';
  }
  function roomText(z) {
    const parts = [];
    if (z.noRaid) parts.push('老板从不来查'); else parts.push('老板会来查');
    if (z.incomeMult && z.incomeMult !== 1) parts.push('收入 ×' + z.incomeMult);
    if (z.travel) parts.push('路远（单程 ' + z.travel + ' 秒）');
    parts.push('最多 ' + z.capacity + ' 人'); if (z.key) parts.push('按 ' + z.key + ' 召回');
    return parts.join('，');
  }
  // 返回 { title, items: [{ kind, id?, title, text }] }；没有新内容时 items 为空
  function build(level, levels) {
    levels = levels || OS.levels;
    const i = levels.findIndex(l => l.id === level.id), prev = i > 0 ? levels[i - 1] : null, items = [];
    if (!prev) {
      items.push({ kind: 'tip', icon: 'boss', title: '老板在巡视', text: '老板在开放办公区时，工位上的人不能摸鱼。' });
      items.push({ kind: 'tip', icon: 'slack', title: '员工会自动摸鱼', text: '冷却好了就自己去厕所、茶水间，摸鱼时间折算成钱，攒够目标金额就过关。' });
      items.push({ kind: 'tip', icon: 'recall', title: '老板要查房时，点房间召回', text: '房间亮红光时，点它（或按 Q / E）把里面的人叫回来，就不会被抓。' });
      items.push({ kind: 'tip', icon: 'skill', title: '亮绿框的卡片可以点', text: '狐狸能把老板带去会议室，这段时间工位上的人都能摸鱼。' });
    } else {
      const before = allowedIds(prev);
      for (const id of allowedIds(level).filter(id => !before.includes(id))) {
        const c = OS.characters[id], so = c.solo, rm = OS.ROOMS[so.room];
        items.push({ kind: 'char', id, title: '新同事：' + c.name + '（' + c.role + '，时薪 $' + c.wage + '）',
          text: (c.team ? '特殊技能·' + c.team.name + ' —— ' + teamText(c.team) + '；' : '') + '普通技能·' + so.name + '（' + rm.name + '）' });
      }
      const pr = roomsOf(prev);
      for (const id of roomsOf(level).filter(id => !pr.includes(id))) items.push({ kind: 'room', id, title: '新房间：' + OS.ROOMS[id].name, text: roomText(OS.ROOMS[id]) });
      if ((level.desks || 4) > (prev.desks || 4)) items.push({ kind: 'desks', title: '工位增加到 ' + level.desks + ' 个', text: '可以多派同事上场了。' });
      // 第一次需要挑阵容
      const needs = l => allowedIds(l).length > (l.desks || 4);
      if (needs(level) && !needs(prev)) items.push({ kind: 'lineup', title: '可以挑选上场阵容了', text: '可用同事多于工位时，开局前选人；阵容会被记住。' });
      if (level.id === OS.balance.featureUnlockLevel) items.push({ kind: 'speed', title: '倍速已解锁', text: '按 S 或右上角按钮切换 ×1 / ×1.5 / ×2。倍速省时间，但召回会更赶。' });
    }
    if (level.maxCaught) items.push({ kind: 'exam', title: '考核关', text: '被抓超过 ' + level.maxCaught + ' 次直接失败' + (level.fine ? '，每次罚款 $' + level.fine : '') + '。必要时多召回、多用特殊技能。' });
    for (const t of level.intro || []) items.push({ kind: 'note', title: '提示', text: t });
    return { title: prev ? '第 ' + level.id + ' 关 · ' + level.name + '　本关新内容' : '欢迎来到一起来摸鱼', items };
  }
  // 本关新出现的同事（阵容界面 NEW 标签用）
  function newChars(level, levels) { return build(level, levels).items.filter(x => x.kind === 'char').map(x => x.id); }
  OS.intro = { build, newChars };
})(typeof window !== "undefined" ? window : globalThis);
