// 收入结算：只看两件事 —— 员工在哪、老板在不在开放办公区。
(function (g) {
  const OS = (g.OS = g.OS || {});
  function isSlacking(emp, boss) {
    if (emp.state === 'in_room') return true;                  // 在厕所/茶水间：始终摸鱼
    if (emp.state === 'working') return !boss.inOffice();      // 在工位：老板不在开放办公区才摸鱼
    return false;                                              // 路上/陪老板：不计
  }
  // 房间里：技能倍率 × 房间倍率（打印室 ×0.6、天台 ×1.3）
  function incomeRate(emp, boss, bal, map) {
    if (!isSlacking(emp, boss)) return 0;
    const z = map && emp.room && map.zones[emp.room];
    const mult = emp.state === 'in_room' ? emp.solo.multiplier * (z && z.incomeMult != null ? z.incomeMult : 1) : 1;
    return (emp.wage / bal.secondsPerHour) * mult;
  }
  function tick(game, dt) {
    for (const e of game.employees) {
      const r = incomeRate(e, game.boss, game.bal, game.map);
      if (r > 0) { game.money += r * dt; game.slackSeconds += dt; e.earned += r * dt; }
    }
  }
  OS.economy = { isSlacking, incomeRate, tick };
})((typeof window!=="undefined"?window:globalThis));
