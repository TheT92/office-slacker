// 抓捕与胜负判定。
(function (g) {
  const OS = (g.OS = g.OS || {});
  // 老板停留在房间期间，房内员工被抓（含停留期间才进入的人）。
  function resolveCatches(game) {
    const b = game.boss;
    if (b.state !== 'in_room') return;
    for (const e of game.employees) {
      if (e.state === 'in_room' && e.room === b.zone) {
        if (game.shield > 0) {   // 打掩护生效：照样被送回工位，但不罚款、不计次数
          e.caught(); game.shielded++; game.events.push({ type: 'shielded', who: e.id }); continue;
        }
        game.money = Math.max(0, game.money - game.bal.fine);
        game.caught++; game.fined += game.bal.fine; e.caught();
        game.events.push({ type: 'caught', who: e.id, fine: game.bal.fine });
      }
    }
  }
  // 普通关：只有"时间耗尽且金额未达标"会失败。
  // 考核关（配置了 maxCaught）：另外"被抓次数超过上限"立即失败，优先于胜利判定。
  function checkEnd(game) {
    const goal = game.level.goal;
    if (game.maxCaught && game.caught > game.maxCaught) { game.phase = 'lose'; game.endReason = 'caught'; }
    else if ((goal.money && game.money >= goal.money) || (goal.slackSeconds && game.slackSeconds >= goal.slackSeconds)) game.phase = 'win';
    else if (game.timeLeft <= 0) { game.phase = 'lose'; game.endReason = 'time'; }
  }
  OS.rules = { resolveCatches, checkEnd };
})((typeof window!=="undefined"?window:globalThis));
