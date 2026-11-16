// 在 Node 中按顺序加载全部纯逻辑模块（它们挂在 globalThis.OS 上）。
['config/balance', 'config/map', 'config/characters', 'config/levels',
 'core/economy', 'core/boss', 'core/employee', 'core/skills', 'core/rules', 'core/game', 'core/progress', 'core/lineup', 'core/hints', 'core/intro', 'core/auto', 'core/app']
  .forEach(m => require('../src/' + m + '.js'));
const OS = globalThis.OS;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 测试用固定关卡（不受正式关卡数值调整影响）
const TEST_LEVEL = { id: 0, roster: ['rabbit', 'cat', 'bear', 'fox'], timeLimit: 120, goal: { money: 450 } };
function newGame(opts) { const g = new OS.Game(TEST_LEVEL, Object.assign({ rng: () => 0, autoSolo: false }, opts)); g.start(); return g; }
function run(game, sec, dt) { dt = dt || 0.25; for (let t = 0; t < sec - 1e-9; t += dt) game.update(dt); }
module.exports = { OS, mulberry32, newGame, run, TEST_LEVEL };
