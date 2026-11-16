// 普通技能（个人摸鱼）始终自动出发，由 Game.update 每步调用。特殊技能（全体技能）永远手动；紧急召回也永远手动。
// 只用玩家也能看到的信息（老板的预警目标与去向），不预判老板，所以已经在房间里的人仍可能被抓。
(function (g) {
  const OS = (g.OS = g.OS || {});
  // 老板已经明确要去 / 正在这个房间
  function bossHeading(game, room) {
    const b = game.boss;
    return b.target === room && (b.state === 'warning' || b.state === 'going' || b.state === 'in_room');
  }
  // 老板不在开放办公区时，工位上本来就能摸鱼，这时出门只会白白浪费冷却，所以不去。
  function shouldSolo(game, e) {
    return OS.skills.soloStatus(game, e) === 'ok' && game.boss.inOffice() && !bossHeading(game, e.solo.room);
  }
  function step(game) {
    if (game.phase !== 'playing') return;
    for (const e of game.employees) if (shouldSolo(game, e)) game.useSolo(e.id);
  }
  OS.auto = { step, shouldSolo, bossHeading };
})(typeof window !== "undefined" ? window : globalThis);
