// 关卡数据。goal 可同时配置 money（金额）与 slackSeconds（累计摸鱼人·秒），满足任一即胜。
// desks：工位数（上场人数上限）；可选角色多于工位时，开局前进入阵容界面。
// rooms：本关有哪些房间（缺省 = 厕所、会议室、茶水间）；普通技能房间不在本关的角色不能上场。
// boss 覆盖老板参数（查房间隔/预警时长）；fine 覆盖罚款；twoStarCaught 覆盖普通关 2 星容忍次数。
// maxCaught：仅考核关（每 5 关一个）配置，被抓次数超过它即失败，且至少为 balance.examMinCaught。
// required / banned：必须上场 / 禁用的角色（预留，考核关出题用，目前未启用）。
// noAuto：预留，设为 true 时本关禁用自动施放。数值为估算，待试玩调整。
(function (g) {
  const OS = (g.OS = g.OS || {});
  OS.levels = [
    { id: 1,  name: '第一天上班', desks: 4, timeLimit: 120, goal: { money: 480 }, boss: { raidMin: 10, raidMax: 18, warnTime: 2.2 } },
    { id: 2,  name: '试用期',     desks: 4, timeLimit: 110, goal: { money: 560 }, boss: { raidMin: 9,  raidMax: 16, warnTime: 2.0 } },
    { id: 3,  name: '季度冲刺',   desks: 4, timeLimit: 100, goal: { money: 660 }, boss: { raidMin: 8,  raidMax: 14, warnTime: 1.6 } },
    { id: 4,  name: '年终考核',   desks: 4, timeLimit: 100, goal: { money: 700 }, boss: { raidMin: 7,  raidMax: 12, warnTime: 1.3 } },
    { id: 5,  name: '老板加班日', desks: 4, timeLimit: 100, goal: { money: 730 }, boss: { raidMin: 6,  raidMax: 10, warnTime: 1.0 }, maxCaught: 2 },
    { id: 6,  name: '部门扩招',   desks: 5, timeLimit: 100, goal: { money: 990 }, boss: { raidMin: 7,  raidMax: 12, warnTime: 1.2 } },
    { id: 7,  name: '新项目启动', desks: 5, timeLimit: 100, goal: { money: 1090 }, boss: { raidMin: 6,  raidMax: 11, warnTime: 1.0 } },
    { id: 8,  name: '搬进新楼层', desks: 6, timeLimit: 100, goal: { money: 1190 }, boss: { raidMin: 6,  raidMax: 11, warnTime: 0.9 } },
    { id: 9,  name: '双十一值班', desks: 6, timeLimit: 100, goal: { money: 1450 }, boss: { raidMin: 6,  raidMax: 10, warnTime: 0.8 } },
    { id: 10, name: '董事会视察', desks: 6, timeLimit: 100, goal: { money: 1450 }, boss: { raidMin: 5,  raidMax: 9,  warnTime: 0.6 }, maxCaught: 2, fine: 60 },
    { id: 11, name: '打印机坏了',   desks: 6, timeLimit: 100, goal: { money: 1390 }, rooms: ['restroom', 'meeting', 'pantry', 'printer'], boss: { raidMin: 6, raidMax: 10, warnTime: 0.8 } },
    { id: 12, name: '季度汇报',     desks: 6, timeLimit: 100, goal: { money: 1400 }, rooms: ['restroom', 'meeting', 'pantry', 'printer'], boss: { raidMin: 5, raidMax: 10, warnTime: 0.8 } },
    { id: 13, name: '天台开放日',   desks: 6, timeLimit: 100, goal: { money: 1620 }, rooms: ['restroom', 'meeting', 'pantry', 'printer', 'rooftop'], boss: { raidMin: 5, raidMax: 9, warnTime: 0.7 } },
    { id: 14, name: '全员加班',     desks: 6, timeLimit: 100, goal: { money: 1680 }, rooms: ['restroom', 'meeting', 'pantry', 'printer', 'rooftop'], boss: { raidMin: 5, raidMax: 9, warnTime: 0.7 } },
    { id: 15, name: '老板的老板来了', desks: 6, timeLimit: 100, goal: { money: 1720 }, rooms: ['restroom', 'meeting', 'pantry', 'printer', 'rooftop'], boss: { raidMin: 4, raidMax: 8, warnTime: 0.5 }, maxCaught: 2, fine: 80 },
  ];
})(typeof window !== "undefined" ? window : globalThis);
