// 提示状态（纯逻辑，给界面用）：哪些技能该放、谁有危险、哪个房间该召回。
(function (g) {
  const OS = (g.OS = g.OS || {});
  // 老板已经明确要去这个房间（预警中或正在走过去）——此时还来得及召回
  const raidIncoming = (game, room) => { const b = game.boss; return b.target === room && (b.state === 'warning' || b.state === 'going'); };
  // 房间里在摸鱼的人 + 正在走向房间的人
  const occupants = (game, room) => game.employees.filter(e => (e.state === 'in_room' || e.state === 'going') && e.room === room);
  // 特殊技能提示：'none'（没有/不可用）| 'ready'（可用：慢闪）| 'golden'（最佳时机：快闪）
  //   带走/拖住：老板正在预警（现在放能取消查房）；打掩护：老板要去的房间里有人
  function teamHint(game, e) {
    if (!e.team || OS.skills.teamStatus(game, e) !== 'ok') return 'none';
    if ((e.team.type || 'escort') === 'shield') return game.map.raidRooms().some(z => roomDanger(game, z.id)) ? 'golden' : 'ready';
    return game.boss.state === 'warning' ? 'golden' : 'ready';
  }
  // 员工是否有危险：他所在/要去的房间即将被查
  const inDanger = (game, e) => (e.state === 'in_room' || e.state === 'going') && raidIncoming(game, e.room);
  // 房间是否需要召回：即将被查且里面有人
  const roomDanger = (game, room) => raidIncoming(game, room) && occupants(game, room).length > 0;
  OS.hints = { raidIncoming, occupants, teamHint, inDanger, roomDanger };
})(typeof window !== "undefined" ? window : globalThis);
