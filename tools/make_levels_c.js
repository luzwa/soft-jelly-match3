// Stage C+: 50 formal levels (ch1–ch5 original 30 + ch6–ch8 added 20) + 3 fixed-condition challenges (addendum §14), written as
// canonical levels/src/*.json in the editor data format. Layouts are authored per level (DSL below), not random scatter.
// Star thresholds start as placeholders and are replaced by tools/apply_stars.js from the bot report (provisional).
//   node tools/make_levels_c.js && node tools/make_levels.js && node tools/bots.js --formal ... && node tools/apply_stars.js ...
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../js/level_schema.js');
const { lvlB } = require('./level_dsl.js');
const SRC = path.join(__dirname, '..', 'levels', 'src');
const P4 = { a: ['s', 'u', 'j', 'b'], b: ['u', 'j', 'b', 'f'], c: ['s', 'j', 'b', 'f'], d: ['s', 'u', 'b', 'f'] }, P5 = ['s', 'u', 'j', 'b', 'f'];
const POOLN = { s: 'jelly_squid', u: 'jelly_fugu', j: 'jelly_jellyfish', o: 'jelly_octopus', b: 'jelly_bear', f: 'jelly_fig' };
const G = {
  collect: (t, n) => ({ type: 'collect_piece', typeId: POOLN[t], count: n }),
  frost: () => ({ type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }),
  crates: () => ({ type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }),
  ties: () => ({ type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }),
  deliver: () => ({ type: 'deliver', typeId: 'delivery_basket', scope: 'all' })
};
const L = [];
function add(o) {
  const pool = o.pool || P5;
  const d = lvlB({ id: o.id, name: o.name, chapter: o.chapter, moves: o.moves, goals: o.goals, rows: o.rows, fillPool: pool, pool: pool.map(t => POOLN[t].slice(6)),
    stars: [8000, 14000, 20000], intent: o.intent, diff: o.diff, vs: 'structure_checked_bot_diagnosed_unplaytested', tools: o.tools });
  d.spawnPool = pool.map(t => ({ typeId: POOLN[t], weight: 1 }));
  d.editorNotes.chapterRole = o.role || 'normal';
  if (o.tip) d.editorNotes.playerTip = o.tip;   // shown on the pre-level goal preview (player-facing teaching text)
  if (o.challenge) d.editorNotes.challenge = o.challenge;
  L.push(S.canonical(d));
}
const row = s => s, R7 = '. . . . . . .', V7 = '# # # # # # #';
// ---------------------------------------------------------------- chapter 1 · 软糯入门（交换 / 双目标 / 补位 / 糖霜）
add({ id: 'c1_01', name: '1-1 第一次交换', chapter: 'ch1', moves: 12, pool: P4.a, goals: [G.collect('u', 8)], role: 'teach',
  rows: [V7, '# ? ? ? ? ? #', '# ? ? u ? ? #', '# u u j ? ? #', '# ? ? ? ? ? #', '# ? ? ? ? ? #', V7],
  tip: '把相邻两颗果冻交换位置，连成 3 颗同色就会消除。试试把上方的河豚换下来！', intent: '中央 5×5 固定开局：(2,3)↔(3,3) 让第 3 行三颗河豚相连（明显的第一步）；之后自由收集 8 个河豚' });
add({ id: 'c1_02', name: '1-2 两个目标', chapter: 'ch1', moves: 14, pool: P4.a, goals: [G.collect('u', 8), G.collect('b', 8)], role: 'teach',
  rows: [V7, '# . . . . . #', '# . . . . . #', '# . . . . . #', '# . . . . . #', '# . . . . . #', V7],
  tip: '这关有两个目标，都要收集齐才算过关。', intent: '中央 5×5 随机开局：练习兼顾两个收集目标' });
add({ id: 'c1_03', name: '1-3 补位连消', chapter: 'ch1', moves: 18, pool: P4.a, goals: [G.collect('j', 24)], role: 'teach',
  rows: [R7, R7, R7, R7, R7, R7, R7],
  tip: '消除后上方的果冻会落下补位，落下时还可能自动连消。从棋盘下方开始消，更容易引发连消！', intent: '完整棋盘、4 种：数量大的单一收集，体验补位与连消' });
add({ id: 'c1_04', name: '1-4 糖霜地垫', chapter: 'ch1', moves: 18, pool: P4.b, goals: [G.frost()], role: 'teach',
  rows: [R7, R7, R7, R7, R7, '? ?~1 ?~1 u ?~1 ?~1 ?', '? u~1 u~1 j u~1 ?~1 ?'],
  tip: '果冻在糖霜上参与匹配，下面的糖霜就会被清除。先把底部这行的河豚连起来！', intent: '糖霜 8 格集中在底部两行；固定的教学一步 (5,3)↔(6,3) 让底行三颗河豚在糖霜上相连并清除 2 格' });
add({ id: 'c1_05', name: '1-5 小挑战', chapter: 'ch1', moves: 20, pool: P4.b, goals: [G.frost(), G.collect('b', 12)], role: 'challenge',
  rows: ['.~1 . . . . . .~1', '. .~1 . . . .~1 .', '. . .~1 . .~1 . .', '.~1 . . . . . .~1', '. . .~1 . .~1 . .', '. .~1 . . . .~1 .', '.~1 . . . . . .~1'],
  intent: '两条对角线＋两侧中点糖霜 14 格分布在四个角落方向＋收集小熊 12：需要分配步数到边角' });
add({ id: 'c1_06', name: '1-6 放松一下', chapter: 'ch1', moves: 22, pool: P4.c, goals: [G.frost()], role: 'relax',
  rows: [R7, R7, R7, '. .~1 .~1 .~1 .~1 .~1 .', '. .~1 .~1 .~1 .~1 .~1 .', R7, R7],
  intent: '集中在中间两行的糖霜 10 格：容易命中，巩固糖霜规则' });
// ---------------------------------------------------------------- chapter 2 · 饼干箱（相邻匹配 / 打开空间 / 第五种果冻）
add({ id: 'c2_01', name: '2-1 饼干箱', chapter: 'ch2', moves: 20, pool: P4.a, goals: [G.crates()], role: 'teach',
  rows: [R7, '. . . X1 . . .', '. X1 . . . X1 .', R7, R7, '? ? ? X1 u ? ?', '? ? u u j ? ?'],
  tip: '在饼干箱旁边完成匹配，箱子就会受到 1 次伤害。试试在底部箱子旁边连三！', intent: '箱子 4 只（1 HP）；固定教学一步 (5,4)↔(6,4) 让底行河豚在箱子 (5,3) 正下方相连，演示“相邻匹配开箱”' });
add({ id: 'c2_02', name: '2-2 打开空间', chapter: 'ch2', moves: 22, pool: P4.d, goals: [G.crates(), G.frost()], role: 'normal',
  rows: [R7, '. . . .~1 . . .', R7, '. X1 X1 . X1 X1 .', '. . .~1 .~1 .~1 . .', 'X1 . .~1 .~1 .~1 . X1', '. . . .~1 . . .'],
  intent: '第 3 行四只箱子把棋盘分成上下两区，下方糖霜 7 格＋上方 1 格；先开箱再处理下方，打开空间' });
add({ id: 'c2_03', name: '2-3 第五种果冻', chapter: 'ch2', moves: 24, pool: P5, goals: [G.crates()], role: 'teach',
  rows: [R7, 'X1 . . . . . X1', R7, 'X1 . . . . . X1', R7, 'X1 . . . . . X1', '. X1 . . . X1 .'],
  tip: '这关有 5 种果冻，凑三连更难一些。箱子都在边上，记得往边上消！', intent: '完整棋盘 5 种果冻；8 只箱子沿左右两边与底角排列，中间留出完整操作空间' });
add({ id: 'c2_04', name: '2-4 先后顺序', chapter: 'ch2', moves: 24, pool: P5, goals: [G.crates(), G.frost()], role: 'normal',
  rows: [R7, '. X1 . . . .~1 .', 'X1 . X1 . .~1 .~1 .~1', '. X1 . . . .~1 .', '. . . . .~1 .~1 .~1', 'X1 . X1 . . .~1 .', '. X1 . X1 . . .~1'],
  intent: '左半边 8 只箱子、右半边 10 格糖霜：选择先处理哪一边' });
add({ id: 'c2_05', name: '2-5 章节挑战', chapter: 'ch2', moves: 26, pool: P5, goals: [G.crates(), G.frost()], role: 'challenge',
  rows: ['. . .~1 . .~1 . .', '. X1 . . . X1 .', '.~1 . X1 .~1 X1 . .~1', 'X1 .~1 . . . .~1 X1', '.~1 . X1 .~1 X1 . .~1', '. X1 .~1 . .~1 X1 .', '. .~1 X1 . X1 .~1 .'],
  intent: '箱子 12 只交错包围糖霜 14 格：每次匹配都要兼顾开箱与踩糖霜' });
add({ id: 'c2_06', name: '2-6 放松', chapter: 'ch2', moves: 24, pool: P4.c, goals: [G.crates(), G.frost()], role: 'relax',
  rows: [R7, R7, '. . X1 . X1 . .', '. .~1 .~1 .~1 .~1 .~1 .', '. . X1 .~1 X1 . .', '. . .~1 . .~1 . .', '. X1 . . . X1 .'],
  intent: '箱子 6 只＋糖霜 8 格集中在中下部，4 种果冻，宽松' });
// ---------------------------------------------------------------- chapter 3 · 消化旧机制（双层糖霜 / 2 HP 箱子 / 去角）
add({ id: 'c3_01', name: '3-1 双层糖霜', chapter: 'ch3', moves: 24, pool: P5, goals: [G.frost()], role: 'teach',
  rows: [R7, R7, '. .~1 . .~2 . .~1 .', '. . .~1 . .~1 . .', '. .~1 . .~2 . .~1 .', '? ? .~1 s .~1 ? ?', '? s~2 s~2 u ? ? ?'],
  tip: '颜色更深的是双层糖霜：第一次命中只变薄，第二次命中才会清除。先把底行的鱿鱼连起来看看！', intent: '糖霜 12 格（4 格 2 层）；固定教学一步 (5,3)↔(6,3)：底行鱿鱼在两格双层糖霜上相连，糖霜 2→1 但目标格数不变（演示第一次只变薄），之后玩家自行再次命中' });
add({ id: 'c3_02', name: '3-2 重复命中', chapter: 'ch3', moves: 26, pool: P5, goals: [G.frost(), G.crates()], role: 'normal',
  rows: [R7, '. X1 .~1 . .~1 X1 .', '. .~2 .~1 .~2 .~1 . .', '. .~1 .~2 .~1 .~2 . .', '. .~2 .~1 .~2 .~1 . .', '. X1 .~1 X1 .~1 X1 .', '. . . X1 . . .'],
  intent: '左中 3×4 方阵糖霜 12 格（6 格 2 层）＋上下各 2 格单层＝16 格；6 只箱子环绕。重复命中同一区域' });
add({ id: 'c3_03', name: '3-3 结实的箱子', chapter: 'ch3', moves: 26, pool: P5, goals: [G.crates(), G.frost()], role: 'teach',
  rows: [R7, '. X2 . . . X2 .', '. . .~1 .~1 .~1 . .', 'X1 .~1 X2 . X2 .~1 X1', '. . .~1 .~1 .~1 . .', '. . . X1 . . .', '.~1 . X1 . . .~1 .'],
  tip: '带裂纹的饼干箱有 2 点耐久：要在旁边消除两次才能打开。', intent: '箱子 8 只（4 只 2 HP）＋糖霜 10 格；2 HP 箱子放在中上部便于连续命中' });
add({ id: 'c3_04', name: '3-4 去角的棋盘', chapter: 'ch3', moves: 28, pool: P5, goals: [G.crates(), G.frost()], role: 'normal',
  rows: ['# . .~1 . .~1 . #', '. X2 . . . X2 .', '.~1 . .~1 X1 .~1 . .~1', '. .~1 X2 . X2 .~1 .', '.~1 . .~1 X1 .~1 . .~1', '. X1 . . . X1 .', '# .~1 . . . .~1 #'],
  intent: '去四角 45 格：箱子 8 只（4 只 2 HP）呈对称分布＋糖霜 14 格；角落补给更少' });
add({ id: 'c3_05', name: '3-5 旧规则综合', chapter: 'ch3', moves: 28, pool: P5, goals: [G.frost(), G.crates()], role: 'challenge',
  rows: ['.~2 . . X1 . . .~1', '. X2 .~2 . .~2 X2 .', '.~1 .~2 . X1 . .~2 .~1', 'X1 .~1 .~1 .~2 .~1 . X1', '.~1 .~2 . X1 . .~2 .~1', '. X2 .~1 . .~1 X2 .', '.~1 . . X1 . . .~1'],
  intent: '糖霜 20 格（8 格 2 层）＋箱子 10 只（4 只 2 HP）：章节综合挑战' });
add({ id: 'c3_06', name: '3-6 放松', chapter: 'ch3', moves: 26, pool: P4.d, goals: [G.frost(), G.crates()], role: 'relax',
  rows: [R7, '. . X1 . X1 . .', '. .~1 .~1 .~1 .~1 .~1 .', '. . . X1 . . .', '. .~1 .~1 .~1 .~1 .~1 .', '. . X1 . X1 . .', '. .~1 . X1 . .~1 .'],
  intent: '单层糖霜 12 格＋1 HP 箱子 6 只，4 种果冻' });
// ---------------------------------------------------------------- chapter 4 · 软糖绑带
add({ id: 'c4_01', name: '4-1 绑带', chapter: 'ch4', moves: 24, pool: P5, goals: [G.ties()], role: 'teach',
  rows: [R7, '. . .^ . . . .', R7, '. . . . . .^ .', R7, '? ? u ? ? ? ?', '.^ u j u^ ? ? ?'],
  tip: '被绑住的果冻不能移动，但它可以原地参与匹配。移动旁边的果冻，让被绑的河豚连成一排！', intent: '绑带 4；底部固定教学一步 (5,2)↔(6,2)：底行 河豚-河豚-被绑河豚 原地连成三消 → 绑带解除（演示“不能移动但可原地参与匹配”，不写成“旁边三消即可解除”）' });
add({ id: 'c4_02', name: '4-2 绑住的地垫', chapter: 'ch4', moves: 26, pool: P5, goals: [G.ties(), G.frost()], role: 'normal',
  rows: [R7, '. .^ . . . .^ .', '. .~1 .~1 . .~1 .~1 .', '. . .^~1 . .^~1 . .', '. .~1 . .~1 . .~1 .', '. . .^ . .^ . .', '. . . . .~1 . .'],
  intent: '绑带 6（其中 2 个在糖霜上）＋糖霜 10 格：固定棋子与地面目标叠在一起' });
add({ id: 'c4_03', name: '4-3 先解绑还是开箱', chapter: 'ch4', moves: 28, pool: P5, goals: [G.ties(), G.crates()], role: 'normal',
  rows: [R7, '. .^ . X1 . .^ .', '. X1 . .^ . X1 .', '.^ . . . . . .^', '. X1 . .^ . X1 .', '. .^ . X1 . .^ .', R7],
  intent: '绑带 8＋箱子 6 交错：绑带宿主固定不落，会阻挡上方补给，箱子也一样；决定先处理哪个' });
add({ id: 'c4_04', name: '4-4 缺角绑带', chapter: 'ch4', moves: 28, pool: P5, goals: [G.ties(), G.frost()], role: 'normal',
  rows: ['# .~1 . . . .~1 #', '. .^ .~1 . .~1 .^ .', '. .~1 . .^~2 . .~1 .', '.~1 . .~2 . .~2 . .~1', '. .~1 . .^~2 . .~1 .', '. .^ .~1 . .~1 .^ .', '# . . . . . #'],
  intent: '去四角：绑带 6＋糖霜 16 格（4 格 2 层，其中 2 格同时被绑）' });
add({ id: 'c4_05', name: '4-5 章节挑战', chapter: 'ch4', moves: 30, pool: P5, goals: [G.ties(), G.crates()], role: 'challenge',
  rows: ['.^ . . .^ . . .^', '. . X1 . X1 . .', '. .^ . . . .^ .', 'X1 . . .^ . . X1', '. .^ . . . .^ .', '. . X2 . X2 . .', '.^ . X1 . X1 . .^'],
  intent: '绑带 10＋箱子 8（2 只 2 HP）；绑带多在边缘与对角位置，中间列与第 1、5 列留出正常交换空间' });
add({ id: 'c4_06', name: '4-6 放松', chapter: 'ch4', moves: 26, pool: P4.a, goals: [G.ties(), G.frost()], role: 'relax',
  rows: [R7, '. .^ . . . .^ .', R7, '. .~1 .~1 .~1 .~1 .~1 .', '. . .~1 .^~1 .~1 . .', '. .^ . . . . .', R7],
  intent: '绑带 4＋单层糖霜 8 格，4 种果冻' });
// ---------------------------------------------------------------- chapter 5 · 果篮送达
add({ id: 'c5_01', name: '5-1 送达果篮', chapter: 'ch5', moves: 26, pool: P5, goals: [G.deliver()], role: 'teach',
  rows: [R7, '. . K . K . .', R7, R7, R7, R7, '. . .! . .! . .'],
  tip: '果篮不能交换，消除它下方的果冻，果篮就会下落；落到底部有箭头的出口就算送达。', intent: '送达 2，无其他障碍；出口在果篮正下方' });
add({ id: 'c5_02', name: '5-2 送达与地垫', chapter: 'ch5', moves: 28, pool: P5, goals: [G.deliver(), G.frost()], role: 'normal',
  rows: [R7, '. K . . . K .', '. . . K . . .', '.~1 .~1 . . . .~1 .~1', '. . .~1 .~1 .~1 . .', '.~1 . . .~1 . . .~1', '. .! . .! . .! .'],
  intent: '送达 3＋糖霜 10 格：果篮下落路线上的糖霜可以顺路清除' });
add({ id: 'c5_03', name: '5-3 打开通路', chapter: 'ch5', moves: 28, pool: P5, goals: [G.deliver(), G.crates()], role: 'normal',
  rows: [R7, '. K . . . K .', '. . . K . . .', '. X1 . . . X2 .', '. . . X1 . . .', 'X1 . X2 . X1 . .', '. .! . .! . .! .'],
  intent: '送达 3＋箱子 6（2 只 2 HP）：三只箱子正好挡在果篮下落的列上，必须先开箱再送达' });
add({ id: 'c5_04', name: '5-4 解绑后送达', chapter: 'ch5', moves: 30, pool: P5, goals: [G.deliver(), G.frost()], role: 'normal',
  rows: ['# . K . . . #', '. . . . K . .', '.~1 K .~1 . .~1 . .~1', '. .^ .~1 . .~1 .^ .', '.~1 . .^~1 .~1 .^~1 . .', '. .^~1 . . . .^~1 .', '# .! .~1! . .! .~1 #'],
  intent: '去四角：目标为送达 3＋糖霜 14；另放 6 个绑带挡在果篮下方通路（绑带不是目标，可以不清）' });
add({ id: 'c5_05', name: '5-5 综合挑战', chapter: 'ch5', moves: 32, pool: P5, goals: [G.deliver(), G.frost()], role: 'challenge',
  rows: ['. K . .~1 . K .', '.~1 . .~2 K .~2 . .~1', '. X1 .^ K .^ X1 .', '.~2 .~1 . X2 . .~1 .~2', '.^ . .~1 X1 .~1 . .^', '.~1 X1 .~2 .~1 .~2 X1 .~1', 'X1 .^! .~1 .! .~1 .^! X1'],
  intent: '送达 4＋糖霜 18 格（6 格 2 层）；另放箱子 8、绑带 6（非目标）。HUD 目标完成即胜' });
add({ id: 'c5_06', name: '5-6 爽快收尾', chapter: 'ch5', moves: 30, pool: P4.b, goals: [G.deliver(), G.frost()], role: 'relax',
  rows: [R7, '. . K . . K .', '.~1 . . .~1 . . .~1', '. .~1 . .~1 . .~1 .', '.~1 . .~1 . .~1 . .~1', '. .~1 . . . .~1 .', '. . .! . . .! .'],
  intent: '送达 2＋单层糖霜 12 格，4 种果冻、宽松通路' });
// ---------------------------------------------------------------- chapter 6 · 综合运用（旧机制重组）
add({ id: 'c6_01', name: '6-1 糖霜走廊', chapter: 'ch6', moves: 26, pool: P5, goals: [G.frost()], role: 'teach',
  rows: [R7, '. . .~1 .~1 .~1 . .', '. .~1 .~2 .~2 .~2 .~1 .', '. . .~1 .~2 .~1 . .', '. .~1 .~2 .~2 .~2 .~1 .', '. . .~1 .~1 .~1 . .', R7],
  tip: '中间竖条糖霜要反复命中。先从两侧把果冻换进走廊！', intent: '中央竖条糖霜（含双层）像走廊：练习集中火力清一条通路' });
add({ id: 'c6_02', name: '6-2 箱子围栏', chapter: 'ch6', moves: 28, pool: P5, goals: [G.crates(), G.frost()], role: 'normal',
  rows: [R7, '. X1 X1 X1 X1 X1 .', '. X1 .~1 . .~1 X1 .', '. X1 . .~2 . X1 .', '. X1 .~1 . .~1 X1 .', '. X1 X1 X1 X1 X1 .', R7],
  intent: '一圈 1HP 箱子围住中部糖霜：先开缺口再清内部' });
add({ id: 'c6_03', name: '6-3 绑带锚点', chapter: 'ch6', moves: 28, pool: P5, goals: [G.ties(), G.crates()], role: 'normal',
  rows: [R7, '. .^ X1 . X1 .^ .', '. X1 . .^ . X1 .', '. .^ . X2 . .^ .', '. X1 . .^ . X1 .', '. .^ X1 . X1 .^ .', R7],
  intent: '绑带 8＋箱子 8（含 1 只 2HP）：绑带宿主当锚点，开箱与解绑穿插' });
add({ id: 'c6_04', name: '6-4 双出口快递', chapter: 'ch6', moves: 30, pool: P5, goals: [G.deliver(), G.frost()], role: 'normal',
  rows: [R7, '. K . . . K .', '. .~1 . K . .~1 .', '.~1 . X1 . X1 . .~1', '. .~1 .~1 . .~1 . .', '. X1 . .~1 . X1 .', '. .! . .! . .! .'],
  intent: '送达 3＋糖霜 10＋少量箱子挡道：三条出口，分配步数' });
add({ id: 'c6_05', name: '6-5 章节挑战', chapter: 'ch6', moves: 32, pool: P5, goals: [G.frost(), G.crates(), G.ties()], role: 'challenge',
  rows: ['.~1 .^ X1 . X1 .^ .~1', '. X2 .~2 . .~2 X2 .', '.^ .~1 . X1 . .~1 .^', '.~2 X1 . .^ . X1 .~2', '.^ .~1 . X1 . .~1 .^', '. X2 .~2 . .~2 X2 .', '.~1 .^ X1 . X1 .^ .~1'],
  intent: '三目标：糖霜＋箱子＋绑带综合；对称高压盘' });
add({ id: 'c6_06', name: '6-6 放松', chapter: 'ch6', moves: 28, pool: P4.b, goals: [G.deliver(), G.frost()], role: 'relax',
  rows: [R7, '. . K . K . .', '. .~1 . . . .~1 .', '.~1 . . . . . .~1', '. .~1 . . . .~1 .', R7, '. . .! . .! . .'],
  intent: '送达 2＋稀疏糖霜，4 种果冻，爽快收尾' });
// ---------------------------------------------------------------- chapter 7 · 通路与节奏（异形盘 / 节奏目标）
add({ id: 'c7_01', name: '7-1 沙漏盘', chapter: 'ch7', moves: 28, pool: P5, goals: [G.frost(), G.crates()], role: 'teach',
  rows: ['. . . . . . .', '# . .~1 . .~1 . #', '# # . X1 . # #', '# # . .~2 . # #', '# # . X1 . # #', '# . .~1 . .~1 . #', '. . . . . . .'],
  tip: '中间最窄。先打通腰部箱子，上下糖霜才好清。', intent: '沙漏形可玩区：腰部箱子是瓶颈教学' });
add({ id: 'c7_02', name: '7-2 双岛', chapter: 'ch7', moves: 30, pool: P5, goals: [G.crates(), G.ties()], role: 'normal',
  rows: ['. . . # . . .', '. X1 .^ # .^ X1 .', '. .~1 . # . .~1 .', '# # # # # # #', '. .~1 . # . .~1 .', '. X1 .^ # .^ X1 .', '. . . # . . .'],
  intent: '左右双岛被中央 void 隔开：两侧独立清箱子与绑带' });
add({ id: 'c7_03', name: '7-3 阶梯下落', chapter: 'ch7', moves: 30, pool: P5, goals: [G.deliver(), G.frost()], role: 'normal',
  rows: ['K . . . . . K', '.~1 K . . . K .~1', '. .~1 . . . .~1 .', '.~1 . .~1 . .~1 . .~1', '. . .~1 . .~1 . .', '. . . .~1 . . .', '. .! . . . .! .'],
  intent: '阶梯状糖霜＋4 果篮：下落节奏与出口对齐' });
add({ id: 'c7_04', name: '7-4 边角火力', chapter: 'ch7', moves: 30, pool: P5, goals: [G.frost(), G.collect('b', 16)], role: 'normal',
  rows: ['.~2 . . . . . .~2', '. .~1 X1 . X1 .~1 .', '. . .~2 . .~2 . .', '. X1 . .~1 . . X1', '. . .~2 . .~2 . .', '. .~1 X1 . X1 .~1 .', '.~2 . . . . . .~2'],
  intent: '边角双层糖霜＋收集小熊：兼顾边角与中部' });
add({ id: 'c7_05', name: '7-5 章节挑战', chapter: 'ch7', moves: 34, pool: P5, goals: [G.deliver(), G.crates(), G.ties()], role: 'challenge',
  rows: ['# K . X2 . K #', '. .^ .~1 . .^ . .', '. X1 K . K X1 .', '.^ . . X2 . . .^', '. X1 .~1 . .~1 X1 .', '. .^ . . . .^ .', '# .! X1 . X1 .! #'],
  intent: '送达＋箱子＋绑带三目标；去角高压' });
add({ id: 'c7_06', name: '7-6 放松环', chapter: 'ch7', moves: 28, pool: P4.a, goals: [G.frost()], role: 'relax',
  rows: [R7, '. .~1 .~1 .~1 .~1 .~1 .', '. .~1 . . . .~1 .', '. .~1 . . . .~1 .', '. .~1 . . . .~1 .', '. .~1 .~1 .~1 .~1 .~1 .', R7],
  intent: '单层糖霜围成环，4 种果冻，轻松清完' });
// ---------------------------------------------------------------- chapter 8 · 终章（8 关 · 凑满 50）
add({ id: 'c8_01', name: '8-1 终章开场', chapter: 'ch8', moves: 30, pool: P5, goals: [G.frost(), G.crates()], role: 'teach',
  rows: [R7, '. X1 .~1 . .~1 X1 .', '. .~2 X1 . X1 .~2 .', '.~1 . .~2 . .~2 . .~1', '. .~2 X1 . X1 .~2 .', '. X1 .~1 . .~1 X1 .', R7],
  tip: '终章开始：糖霜与箱子交错，先找最容易开的缺口。', intent: '终章教学：中等密度糖霜＋箱子，无绑带/送达' });
add({ id: 'c8_02', name: '8-2 十字枷锁', chapter: 'ch8', moves: 32, pool: P5, goals: [G.ties(), G.frost()], role: 'normal',
  rows: ['. . . .^ . . .', '. . .~1 .^~1 .~1 . .', '. .~1 . .^ . .~1 .', '.^ .^~2 .^~2 .^~2 .^~2 .^ .^', '. .~1 . .^ . .~1 .', '. . .~1 .^~1 .~1 . .', '. . . .^ . . .'],
  intent: '十字绑带＋中心双层糖霜：先解十字再清糖霜' });
add({ id: 'c8_03', name: '8-3 硬核开箱', chapter: 'ch8', moves: 32, pool: P5, goals: [G.crates()], role: 'normal',
  rows: ['. X2 . X2 . X2 .', 'X2 . X1 . X1 . X2', '. X1 . X2 . X1 .', 'X2 . X1 . X1 . X2', '. X1 . X2 . X1 .', 'X2 . X1 . X1 . X2', '. X2 . X2 . X2 .'],
  intent: '大量 1/2HP 箱子密铺：纯开箱耐力关' });
add({ id: 'c8_04', name: '8-4 果篮突围', chapter: 'ch8', moves: 34, pool: P5, goals: [G.deliver(), G.crates(), G.frost()], role: 'normal',
  rows: ['. K . X2 . K .', '.~1 . X1 K X1 . .~1', 'X1 .~2 . . . .~2 X1', '. X1 .~1 . .~1 X1 .', '.~1 . X2 . X2 . .~1', 'X1 . .~1 . .~1 . X1', '. .! X1 . X1 .! .'],
  intent: '送达 3＋箱子＋糖霜：果篮被箱子夹住需突围' });
add({ id: 'c8_05', name: '8-5 全员到齐', chapter: 'ch8', moves: 34, pool: P5, goals: [G.deliver(), G.ties(), G.frost()], role: 'normal',
  rows: ['K .^ .~1 . .~1 .^ K', '. .~2 . X1 . .~2 .', '.^ K .~1 . .~1 K .^', '.~1 . .^~2 . .^~2 . .~1', '.^ . .~1 . .~1 . .^', '. .~2 . . . .~2 .', '.! .^ .~1! . .~1 .^ .!'],
  intent: '送达＋绑带＋糖霜；无开箱目标但仍有 1 只箱子挡路' });
add({ id: 'c8_06', name: '8-6 窄道冲刺', chapter: 'ch8', moves: 32, pool: P5, goals: [G.crates(), G.ties()], role: 'challenge',
  rows: ['# # . . . # #', '# X2 .^ . .^ X2 #', '# . . X1 . . #', '# .^ X2 . X2 .^ #', '# . . X1 . . #', '# X2 .^ . .^ X2 #', '# # . . . # #'],
  intent: '三列窄道：2HP 箱子与绑带堵路，挑战关' });
add({ id: 'c8_07', name: '8-7 终章挑战', chapter: 'ch8', moves: 36, pool: P5, goals: [G.deliver(), G.crates(), G.ties(), G.frost()], role: 'challenge',
  rows: ['. K X2 .^ X2 K .', '.~2 .^ .~1 K .~1 .^ .~2', 'X2 .~1 X1 . X1 .~1 X2', '.^ . .~2 .^~2 . . .^', 'X1 .~1 . X2 . .~1 X1', '.~2 .^ .~1 . .~1 .^ .~2', '.! X1 .^! . .^! X1 .!'],
  intent: '四目标终章挑战：送达＋箱＋绑＋糖霜全上' });
add({ id: 'c8_08', name: '8-8 软糯庆典', chapter: 'ch8', moves: 30, pool: P4.c, goals: [G.deliver(), G.frost()], role: 'relax',
  rows: [R7, '. K . . . K .', '. .~1 . . . .~1 .', '.~1 . . . . . .~1', '. .~1 . . . .~1 .', R7, '. . .! . .! . .'],
  tip: '通关庆典：轻松送达，享受连消！', intent: '终章放松：送达 2＋轻糖霜，4 种果冻' });
// ---------------------------------------------------------------- 3 fixed-condition challenges (no tools, fixed seed)
const NOTOOLS = { hammer: 0, swap: 0, shuffle: 0 };
add({ id: 'chal_special', name: '挑战 · 特效工坊', chapter: 'challenges', moves: 20, pool: P4.a, tools: NOTOOLS, goals: [G.collect('s', 30), G.collect('j', 30)], role: 'challenge_fixed',
  rows: [R7, R7, R7, R7, R7, R7, R7], challenge: { focus: 'special', seed: 20261010 },
  intent: '偏特殊构造：4 种果冻、无障碍、两种各 30 个——需要多造条纹/炸弹/彩虹与主动组合才能拿高分' });
add({ id: 'chal_obstacle', name: '挑战 · 层层剥开', chapter: 'challenges', moves: 24, pool: P5, tools: NOTOOLS, goals: [G.crates(), G.frost()], role: 'challenge_fixed',
  rows: ['. . . . . . .', '. X2 .~2 . .~2 X2 .', '. .~1 . X2 . .~1 .', '.~2 . .~1 . .~1 . .~2', '. .~1 . X2 . .~1 .', '. X2 .~2 . .~2 X2 .', '.~1 . . . . . .~1'],
  challenge: { focus: 'obstacle', seed: 20261011 }, intent: '偏障碍处理：6 只 2 HP 箱子＋糖霜 14 格（6 格 2 层），处理顺序决定剩余步数' });
add({ id: 'chal_delivery', name: '挑战 · 果篮快递', chapter: 'challenges', moves: 26, pool: P5, tools: NOTOOLS, goals: [G.deliver(), G.ties()], role: 'challenge_fixed',
  rows: ['. K . K . K .', R7, '. .^ . .^ . .^ .', R7, '.^ . .^ . .^ . .^', R7, '. .! . .! . .! .'],
  challenge: { focus: 'delivery', seed: 20261012 }, intent: '偏综合送达：3 个果篮＋7 个绑带（目标），绑带宿主会挡住果篮下落' });
module.exports = { LEVELS: L };
if (require.main === module) {
  const out = process.argv[2] || SRC;
  L.forEach(d => fs.writeFileSync(path.join(out, d.levelId + '.json'), S.serialize(d)));
  console.log('wrote', L.length, 'levels to', out);
}
