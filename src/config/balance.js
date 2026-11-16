// 全局数值。时间单位：秒；金额单位：元。
(function (g) {
  const OS = (g.OS = g.OS || {});
  OS.balance = {
    secondsPerHour: 10,   // 现实 10 秒 = 游戏内 1 小时，用来把时薪折算成每秒收入
    fine: 40,             // 被抓一次的罚款（关卡可用 fine 覆盖）
    // 星级：3星 = 被抓 0 次；1星 = 金额达标。
    // 2星的被抓容忍次数：普通关 = max(twoStarMin, round(员工数 × twoStarPerEmployee))（关卡可用 twoStarCaught 覆盖）；
    // 考核关 = maxCaught − 1。
    stars: { twoStarMin: 3, twoStarPerEmployee: 0.75 },
    examMinCaught: 2,     // 考核关 maxCaught 的最小值（否则 2 星与 3 星重合）
    featureUnlockLevel: 3, // 解锁到第几关时开放"倍速"
    speeds: [1, 1.5, 2],   // 可选倍速
    travelTime: 1.0,      // 员工/老板往返房间的路程时间
    boss: {
      raidMin: 9, raidMax: 16, // 老板在开放办公区停留多久后发起下一次查房（随机区间）
      warnTime: 2.0,           // 查房预警时长（目标房间会闪烁提示）
      stayTime: 2.5,           // 老板在目标房间停留时长（此时房内的人被抓）
      raidTargets: ['restroom', 'pantry'],
    },
  };
})((typeof window!=="undefined"?window:globalThis));
