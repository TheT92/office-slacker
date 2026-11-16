// 技能可用性判定与释放。status 返回 'ok' 或不可用原因，UI 直接用它显示。
// 特殊技能类型 team.type：escort（带走老板，默认）| delay（拖住老板：推迟查房）| shield（打掩护：一段时间内被查不算被抓）。
(function (g) {
  const OS = (g.OS = g.OS || {});
  function soloStatus(game, e) {
    if (game.phase !== 'playing') return 'phase';
    if (e.state !== 'working') return 'busy';
    if (e.cd > 0) return 'cooldown';
    if (game.occupancy(e.solo.room) >= game.map.zones[e.solo.room].capacity) return 'full';
    return 'ok';
  }
  function teamStatus(game, e) {
    if (!e.team) return 'none';
    if (game.phase !== 'playing') return 'phase';
    if (e.state !== 'working') return 'busy';            // 必须在工位上：摸鱼途中（路上/房间里/回程）或汇报中都不能放
    if (e.teamCharges <= 0) return 'no_charges';
    if (e.teamCd > 0) return 'cooldown';
    const type = e.team.type || 'escort';
    if (type === 'shield') return game.shield > 0 ? 'active' : 'ok';   // 掩护还在生效时不重复放
    if (!game.boss.inOffice()) return 'boss_away';   // 带走/拖住都要求老板在开放办公区
    return 'ok';
  }
  function useSolo(game, e) { if (soloStatus(game, e) !== 'ok') return false; e.startSolo(); return true; }
  function useTeam(game, e) {
    if (teamStatus(game, e) !== 'ok') return false;
    const type = e.team.type || 'escort';
    if (type === 'escort') { e.startTeam(); game.boss.escort(e.team.duration); }
    else if (type === 'delay') { e.useInstant(); game.boss.delay(e.team.delay); }
    else if (type === 'shield') { e.useInstant(); game.shield = e.team.duration; }
    game.events.push({ type: 'team', who: e.id, kind: type }); return true;
  }
  OS.skills = { soloStatus, teamStatus, useSolo, useTeam };
})((typeof window!=="undefined"?window:globalThis));
