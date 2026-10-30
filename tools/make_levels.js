// Generates the stage-A + stage-B level source files (levels/src/*.json, canonical) once, and bundles every levels/src/*.json
// into levels/levels_data.js (plain <script>, so the game works from file://). Usage: node tools/make_levels.js [--init]
const fs = require('fs'), path = require('path');
const S = require('../js/level_schema.js'), Core = require('../js/rules_core.js');
const DIR = path.join(__dirname, '..', 'levels'), SRC = path.join(DIR, 'src');
const FULL = ['1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111'];
const T6 = Core.TYPES, T5 = ['jelly_squid', 'jelly_fugu', 'jelly_jellyfish', 'jelly_bear', 'jelly_fig'];
const topSpawners = mask => S.autoSpawners({ board: { rows: 7, cols: 7, playableMask: mask } });
function lvl(o) {
  const mask = o.mask || FULL;
  const fx = (o.place || []).some(p => p.special);
  return S.canonical(Object.assign({
    schemaVersion: 1, levelId: o.id, contentRevision: 1, rulesetVersion: Core.RULESET, displayName: o.name, chapterId: o.chapter,
    board: { rows: 7, cols: 7, playableMask: mask, gravity: 'down', spawners: topSpawners(mask), exits: [] },
    initial: { fillMode: 'seeded_random_unassigned', allowInitialMatches: false, placements: o.place || [] },
    spawnPool: (o.pool || T5).map(t => ({ typeId: t, weight: 1 })), moveLimit: o.moves, goals: o.goals,
    tools: o.tools || { hammer: 3, swap: 3, shuffle: 3 }, scoring: { stars: o.stars || [600, 1400, 2400] }, themeId: 'cream_garden',
    // pre-placed specials are not something players can get from level design yet → marked as a rule-test fixture (shown in game + editor)
    editorNotes: Object.assign({ designIntent: o.intent || '', intendedDifficulty: o.diff || 'unrated', validationStatus: o.vs || 'structure_checked_unplaytested' }, fx ? { ruleTestFixture: true } : {})
  }));
}
const F = (r, c, n) => ({ layer: 'underlay', row: r, col: c, typeId: 'frosting_pad', layers: n });
const X = (r, c, hp) => ({ layer: 'occupant', row: r, col: c, typeId: 'cookie_crate', hp });
const fixedRows = rows => { const out = []; rows.forEach((row, r) => row.split(' ').forEach((t, c) => { if (t !== '-') out.push(J(r, c, t)); })); return out; };
// ---- stage B helpers
const TIE = (r, c) => ({ layer: 'overlay', row: r, col: c, typeId: 'gummy_tie', layers: 1 });
const K = (r, c) => ({ layer: 'occupant', row: r, col: c, typeId: 'delivery_basket' });
const AB = { s: 'squid', u: 'fugu', j: 'jellyfish', o: 'octopus', b: 'bear', f: 'fig' };
// board(rows): 7 strings of 7 space-separated tokens. Token = occupant [s u j o b f | R (rainbow) | Xn crate | K basket | . random | # void(mask) | ? auto-filled]
//   + optional ':h' ':v' ':bomb' special, '^' tie, '~n' frosting, '!' exit.  '?' cells are filled deterministically (greedy, no initial match)
function board(rows, pool) {
  pool = pool || ['s', 'u', 'j', 'b', 'f'];
  const place = [], exits = [], mask = [], grid = [];
  rows.forEach((row, r) => { grid.push(row.trim().split(/\s+/)); if (grid[r].length !== 7) throw new Error('row ' + r + ' len ' + grid[r].length); });
  const typ = []; for (let r = 0; r < 7; r++) { typ.push([]); for (let c = 0; c < 7; c++) { const m = /^([a-zA-Z.#?]|X\d|R)/.exec(grid[r][c]); typ[r].push(m[1][0] === 'X' ? 'X' : m[1]); } }
  const run = (r, c, t) => { const T = (rr, cc) => rr >= 0 && cc >= 0 && rr < 7 && cc < 7 ? typ[rr][cc] : null; let n = 1, i; for (i = c - 1; T(r, i) === t; i--) n++; for (i = c + 1; T(r, i) === t; i++) n++; if (n >= 3) return true; n = 1; for (i = r - 1; T(i, c) === t; i--) n++; for (i = r + 1; T(i, c) === t; i++) n++; return n >= 3; };
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (typ[r][c] === '?') {
    const off = (r * 2 + c * 3) % pool.length; let pick = null;
    for (let q = 0; q < pool.length && !pick; q++) { const t = pool[(off + q) % pool.length]; typ[r][c] = t; if (!run(r, c, t)) pick = t; }
    if (!pick) throw new Error('fill ' + r + ',' + c);
  }
  for (let r = 0; r < 7; r++) {
    let m = '';
    for (let c = 0; c < 7; c++) {
      const tok = grid[r][c], t = typ[r][c];
      m += t === '#' ? '0' : '1'; if (t === '#') continue;
      const sp = /:(h|v|bomb)/.exec(tok), fr = /~(\d)/.exec(tok), xm = /^X(\d)/.exec(tok);
      if (fr) place.push(F(r, c, +fr[1]));
      if (xm) place.push(X(r, c, +xm[1]));
      else if (t === 'K') place.push(K(r, c));
      else if (t === 'R') place.push({ layer: 'occupant', row: r, col: c, typeId: 'rainbow', special: 'rainbow' });
      else if (AB[t]) place.push(J(r, c, AB[t], sp ? sp[1] : null));
      if (tok.indexOf('^') >= 0) place.push(TIE(r, c));
      if (tok.indexOf('!') >= 0) exits.push({ row: r, col: c });
    }
    mask.push(m);
  }
  return { place, exits, mask };
}
function lvlB(o) { const b = board(o.rows, o.fillPool); const d = lvl(Object.assign({}, o, { place: b.place, mask: b.mask })); d.board.exits = b.exits; if (o.fixture) d.editorNotes.ruleTestFixture = true; return S.canonical(d); }
const J = (r, c, t, sp) => Object.assign({ layer: 'occupant', row: r, col: c, typeId: 'jelly_' + t }, sp ? { special: sp } : {});
function init() {
  const L = [];
  // ---- chapter_01: the three v2 levels, now as data (same goals / moves / stars / tools; board seeded instead of Math.random)
  L.push(lvl({ id: 'legacy_01', name: '第 1 关', chapter: 'chapter_01', pool: T6, moves: 24, stars: [700, 1500, 2400], goals: [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 18 }, { type: 'collect_piece', typeId: 'jelly_fig', count: 18 }], intent: 'v2 第 1 关迁移为数据', vs: 'migrated_from_v2' }));
  L.push(lvl({ id: 'legacy_02', name: '第 2 关', chapter: 'chapter_01', pool: T6, moves: 22, stars: [800, 1700, 2700], goals: [{ type: 'collect_piece', typeId: 'jelly_octopus', count: 22 }, { type: 'collect_piece', typeId: 'jelly_jellyfish', count: 22 }], intent: 'v2 第 2 关迁移为数据', vs: 'migrated_from_v2' }));
  L.push(lvl({ id: 'legacy_03', name: '第 3 关', chapter: 'chapter_01', pool: T6, moves: 22, stars: [900, 1900, 3000], tools: { hammer: 2, swap: 2, shuffle: 2 }, goals: [{ type: 'collect_piece', typeId: 'jelly_squid', count: 25 }, { type: 'collect_piece', typeId: 'jelly_bear', count: 25 }], intent: 'v2 第 3 关迁移为数据', vs: 'migrated_from_v2' }));
  // ---- verify: six functional verification levels (stage A)
  L.push(lvl({ id: 'verify_01_baseline', name: '验证 1 · 无障碍基准', chapter: 'verify', moves: 20, goals: [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 12 }], intent: '无障碍基准：普通交换、匹配、特殊棋子、补子与目标在新核心下与 v2 一致' }));
  L.push(lvl({ id: 'verify_02_double_frosting', name: '验证 2 · 双层糖霜', chapter: 'verify', moves: 22,
    place: [F(2, 2, 2), F(2, 4, 2), F(4, 2, 2), F(4, 4, 2), F(3, 3, 2), F(2, 3, 1), F(3, 2, 1), F(3, 4, 1), F(4, 3, 1), F(6, 0, 1), F(6, 6, 1)],
    goals: [{ type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }], intent: '2 层地垫第一次受击只变薄、目标格数不变；第二次才计数' }));
  L.push(lvl({ id: 'verify_03_crate_adjacent', name: '验证 3 · 箱子邻接', chapter: 'verify', moves: 22,
    place: [X(6, 1, 1), X(6, 3, 2), X(6, 5, 3), X(3, 0, 1), X(3, 6, 1)],
    goals: [{ type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }], intent: '四邻普通匹配伤害箱子（对角不算），同波多组匹配只扣 1，下一波可再扣；1/2/3 HP 外观' }));
  L.push(lvl({ id: 'verify_04_overlap_dedupe', name: '验证 4 · 重叠攻击去重', chapter: 'verify', moves: 18,
    place: [J(4, 3, 'fugu', 'h'), J(4, 4, 'fig', 'bomb'), X(3, 3, 2), X(5, 5, 2), X(3, 5, 2), F(5, 3, 2), F(2, 4, 2)],
    goals: [{ type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }, { type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }],
    intent: '把 (4,3) 划线与 (4,4) 炸弹交换：三行三列交叉，(3,3)(5,5)(3,5) 的 2HP 箱子被两条线同时覆盖，本波只扣 1；地垫同理' }));
  L.push(lvl({ id: 'verify_05_last_move', name: '验证 5 · 多层与最后一步', chapter: 'verify', moves: 2, pool: T5,
    // whole start board fixed (so the 2-move solution holds for every seed; only refills are seeded)
    place: [F(6, 0, 2), F(6, 1, 2), F(6, 2, 2), X(6, 3, 2)].concat(fixedRows([
      'squid squid fig fig squid fugu fig', 'fig fugu fugu squid fig fig jellyfish', 'bear squid fugu jellyfish fig fig fugu', 'squid fugu jellyfish fig bear squid bear',
      'bear jellyfish fig squid bear fig jellyfish', 'fig fig fugu jellyfish squid fig squid', 'fugu fugu squid - fugu bear jellyfish'])),
    goals: [{ type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }, { type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }],
    intent: '2 步：第 1 步 (5,2)↔(6,2) 使底行三格地垫 2→1、箱子 2→1；第 2 步（最后一步）(5,2)↔(6,2) 清空，剩 0 步也必须判胜' }));
  const SEG = ['1111111', '1111111', '1111111', '1100011', '1111111', '1111111', '1111111'];
  L.push(lvl({ id: 'verify_06_segments', name: '验证 6 · 分段与出生口', chapter: 'verify', moves: 24, mask: SEG,
    place: [X(5, 3, 1), X(6, 2, 1), X(6, 4, 1)],
    goals: [{ type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }, { type: 'collect_piece', typeId: 'jelly_bear', count: 10 }],
    intent: '第 3 行中间空洞把 2–4 列切成上下两段，下段顶端 (4,2)(4,3)(4,4) 是内部出生口；(5,3) 箱子下方的 (6,3) 在开箱前不补子' }));
  // ---- verify_b: stage B functional verification levels (whole start board fixed → the demo move works for every seed; refills seeded)
  L.push(lvlB({ id: 'vb_01_ties', name: '验证 B1 · 绑带匹配', chapter: 'verify_b', moves: 22, goals: [{ type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }],
    rows: ['? ? ? ? ? ? ?', '? ? j ? ? ? ?', '? u f b ? ? ?', 'f f^ s b ? ? ?', '? b^ j^~1 ? ? ? ?', '? ? ? ? ? ?^ ?', '? ? ? ?^ ? ? ?'],
    intent: '(2,2)↔(3,2)：第 3 行 f f^ f 三连，被绑的 (3,1) 原地参与匹配→绑带解除、宿主消耗；紧邻的 (4,1)(4,2) 绑带不解除；(3,1) 不能交换；绑带宿主挡住下落' }));
  L.push(lvlB({ id: 'vb_02_delivery', name: '验证 B2 · 送达与计数', chapter: 'verify_b', moves: 20, goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }],
    rows: ['? ? ? ? ? ? ?', '? ? ? ? ? ? ?', '? ? ? K ? ? ?', '? ? ? K ? K~1 ?', '? ? ? f ? ? ?', '? ? ? f ? ?~1 ?', '? ? f s! j ?! ?'],
    intent: '(6,2)↔(6,3)：第 3 列下三格消除，两只果篮下落；先到 (6,3) 出口的送达，腾出的空位继续重力→第二只再送达（同一步 2 次送达，各计 1 次）。(3,5) 果篮压在糖霜上：锤子打该格只削糖霜，果篮免疫' }));
  L.push(lvlB({ id: 'vb_03_rainbow_ties', name: '验证 B3 · 同色与绑带目标', chapter: 'verify_b', moves: 15, fixture: true,
    goals: [{ type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }, { type: 'collect_piece', typeId: 'jelly_fugu', count: 8 }],
    rows: ['u^ ? ? ? ? ? ?', '? ? ? ? ? u^ ?', '? ? ? ? ? ? ?', '? ? ? R u ? ?', '? ? ? ? ? ? ?', '? u:h^ ? ? ? ? ?', '? ? ? ? ? ? u^~1'],
    intent: '【规则测试摆放】彩虹 (3,3)↔河豚 (3,4)：选色=河豚（交换对象颜色），绑带里的河豚仍是同色目标；被绑的河豚横线 (5,1) 被直接攻击→解绑并触发；目标集合开局冻结' }));
  L.push(lvlB({ id: 'vb_04_anchor', name: '验证 B4 · 生成锚点', chapter: 'verify_b', moves: 18,
    goals: [{ type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }, { type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }],
    rows: ['? ? ? ? ? ? ?', '? b ? ? ? ? ?', '? s ? ? ? ? ?', '? j X2 ? ? ? ?', 'b f b^~1 b j ? ?', 'j f u ? ? ? ?', 'f s ? ? ? ? ?'],
    intent: '(6,0)↔(6,1)：第 1 列竖三消；下落后第 4 行成为 b b b^ b 四连（自然连消，无交换偏好）→锚点按固定规则取中间格 (4,2)=被绑格：绑带解除、原果冻计 1 次收集、糖霜 −1、上方箱子 −1，并在已解绑格生成纵向划线' }));
  L.push(lvlB({ id: 'vb_05_layers', name: '验证 B5 · 层叠交互', chapter: 'verify_b', moves: 20,
    goals: [{ type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }, { type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }],
    rows: ['? ? ? ? ? K ?', 'j ? ? ? ? ? ?', 's j j^~2 X1 ? ? ?', '? ? ?^~1 ? ? ?~1 ?', '? ? ? ? ? ?~2 ?', '? ? ? ? ? ? ?', '? ? ? ? ? ?! ?'],
    intent: '(1,0)↔(2,0)：第 2 行 j j j^ 三连，(2,2) 地垫 2 层＋果冻＋绑带三层分别结算（绑带解除、果冻消耗、地垫 2→1），邻格箱子 −1；锤子打只有果篮的 (0,5) 无效不扣；果篮经过糖霜不清除糖霜' }));
  L.push(lvlB({ id: 'vb_06_board_attack', name: '验证 B6 · 全盘攻击', chapter: 'verify_b', moves: 10, fixture: true,
    goals: [{ type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }, { type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }],
    rows: ['? ? ? ? ? ? ?', '? ?^ ? ? ? ? ?', '? ? ? ? ? ?~2 ?', '? ? R R ? ? ?', '? ? ? ? ? ? K', '? ? ? ? ? ?^ X2', '?~2 X2 ? ? X2 ? ?!'],
    intent: '【规则测试摆放】彩虹＋彩虹：全部有效格各受 1 次直接攻击——普通果冻全部离场，2HP 箱子只剩 1，2 层地垫只剩 1，绑带解除；果篮免疫且被箱子挡住，不会被凭空计为送达' }));
  // ---- chapter_b: two playable stage-B samples (seeded random fill around the placed content)
  L.push(lvl({ id: 'b_tie_intro', name: '绑带教学', chapter: 'chapter_b', moves: 24, place: [TIE(2, 1), TIE(2, 5), TIE(4, 3), TIE(5, 0)],
    goals: [{ type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }], intent: '绑带 4：被绑的果冻不能移动，但移动旁边的果冻让它参与匹配即可解除（不是“在旁边三消”）' }));
  const dl = lvl({ id: 'b_deliver_intro', name: '送达教学', chapter: 'chapter_b', moves: 26, place: [K(1, 2), K(1, 4)],
    goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }], intent: '送达 2：消除果篮下方的果冻，让它落到底部出口' });
  dl.board.exits = [{ row: 6, col: 2 }, { row: 6, col: 4 }]; L.push(S.canonical(dl));
  L.forEach(d => fs.writeFileSync(path.join(SRC, d.levelId + '.json'), S.serialize(d)));
  // deliberately invalid samples (validation regression set)
  const bad = [];
  const b1 = lvl({ id: 'bad_crate_on_frosting', name: 'bad', chapter: 'invalid', moves: 10, place: [X(3, 3, 1), F(3, 3, 1)], goals: [{ type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }] }); bad.push(b1);
  const b2 = lvl({ id: 'bad_void_placement', name: 'bad', chapter: 'invalid', moves: 10, mask: SEG, place: [X(3, 3, 1)], goals: [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 5 }] }); bad.push(b2);
  const b3 = lvl({ id: 'bad_missing_spawner', name: 'bad', chapter: 'invalid', moves: 10, mask: SEG, goals: [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 5 }] }); b3.board.spawners = b3.board.spawners.filter(s => s.row === 0); bad.push(b3);
  const b4 = lvl({ id: 'bad_goal_contradiction', name: 'bad', chapter: 'invalid', moves: 10, place: [X(6, 0, 1), X(6, 1, 1)], goals: [{ type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'count', count: 12 }, { type: 'collect_piece', typeId: 'jelly_octopus', count: 5 }] }); bad.push(b4);
  const b5 = lvl({ id: 'bad_ranges', name: 'bad', chapter: 'invalid', moves: 0, place: [X(1, 1, 4), F(2, 2, 3)], goals: [] }); b5.spawnPool.forEach(p => p.weight = 0); bad.push(b5);
  const b6 = lvl({ id: 'bad_fixed_match', name: 'bad', chapter: 'invalid', moves: 10, place: [J(0, 0, 'fig'), J(0, 1, 'fig'), J(0, 2, 'fig')], goals: [{ type: 'collect_piece', typeId: 'jelly_fig', count: 5 }] }); bad.push(b6);
  // stage B invalid samples (the stage-A 'bad_stage_b' sample is retired: ties / delivery / exits are now enabled)
  const C1 = [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 5 }];
  bad.push(lvl({ id: 'bad_tie_on_crate', name: 'bad', chapter: 'invalid', moves: 10, place: [X(3, 3, 1), TIE(3, 3), K(2, 2), TIE(2, 2)], goals: C1 }));
  const b8 = lvl({ id: 'bad_exit_not_bottom', name: 'bad', chapter: 'invalid', moves: 10, goals: C1 }); b8.board.exits = [{ row: 3, col: 3 }, { row: 6, col: 4 }, { row: 6, col: 4 }]; bad.push(b8);
  const b9 = lvl({ id: 'bad_basket_on_exit', name: 'bad', chapter: 'invalid', moves: 10, place: [K(6, 3)], goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }] }); b9.board.exits = [{ row: 6, col: 3 }]; bad.push(b9);
  const b10 = lvl({ id: 'bad_basket_no_exit', name: 'bad', chapter: 'invalid', moves: 10, place: [K(2, 2)], goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }] }); b10.board.exits = [{ row: 6, col: 4 }]; bad.push(b10);
  const b11 = lvl({ id: 'bad_deliver_short', name: 'bad', chapter: 'invalid', moves: 10, place: [K(2, 3)], goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'count', count: 3 }] }); b11.board.exits = [{ row: 6, col: 3 }]; bad.push(b11);
  bad.push(lvl({ id: 'bad_deliver_no_exit', name: 'bad', chapter: 'invalid', moves: 10, place: [K(2, 3)], goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }] }));
  bad.push(lvl({ id: 'bad_future_type', name: 'bad', chapter: 'invalid', moves: 10, place: [{ layer: 'overlay', row: 2, col: 2, typeId: 'vine_spread', layers: 1 }], goals: C1 }));
  try { fs.unlinkSync(path.join(DIR, 'invalid', 'bad_stage_b.json')); } catch (e) { }
  bad.forEach(d => fs.writeFileSync(path.join(DIR, 'invalid', d.levelId + '.json'), S.serialize(d)));
}
if (process.argv.includes('--init')) init();
// bundle
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.json')).sort();
const levels = {}; files.forEach(f => { const r = S.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); if (!r.ok) throw new Error(f + ': ' + JSON.stringify(r.errors)); levels[r.def.levelId] = r.def; });
// stage C (catalog v2): formal chapters ch1–ch5 (formal: true → player progress / stars / records, chapter unlock flow);
// legacy + verification + stage-B sample chapters stay reachable via ?level= / dev panel but are formal: false (never write
// progress). Fixed-condition challenges are listed separately with their frozen config (see challengeConfig below).
const FORMAL = [
  ['ch1', '第一章 · 软糯入门'], ['ch2', '第二章 · 饼干箱'], ['ch3', '第三章 · 糖霜与硬箱'], ['ch4', '第四章 · 软糖绑带'],
  ['ch5', '第五章 · 果篮送达'], ['ch6', '第六章 · 综合运用'], ['ch7', '第七章 · 通路与节奏'], ['ch8', '第八章 · 终章'],
  // zones 2–10 (levels 51–500) from tools/make_levels_500.js — Royal Match–style curve
  ['z02', '区2 · 糖霜与箱墙'], ['z03', '区3 · 绑带回响'], ['z04', '区4 · 果篮走廊'], ['z05', '区5 · 异形通路'],
  ['z06', '区6 · 双目标高压'], ['z07', '区7 · 三目标夜'], ['z08', '区8 · 窄盘重组'], ['z09', '区9 · 决策密度'],
  ['z10', '区10 · 终局软糯']
];
const catalog = { catalogVersion: 2, chapters: FORMAL.map(([id, name]) => ({ chapterId: id, name, formal: true,
    levels: Object.values(levels).filter(d => d.chapterId === id).map(d => d.levelId).sort() })).filter(c => c.levels.length).concat([
  { chapterId: 'chapter_01', name: '旧版第一章（开发）', formal: false, levels: ['legacy_01', 'legacy_02', 'legacy_03'] },
  { chapterId: 'verify', name: '功能验证关', formal: false, levels: ['verify_01_baseline', 'verify_02_double_frosting', 'verify_03_crate_adjacent', 'verify_04_overlap_dedupe', 'verify_05_last_move', 'verify_06_segments'] },
  { chapterId: 'verify_b', name: '阶段B 验证关', formal: false, levels: ['vb_01_ties', 'vb_02_delivery', 'vb_03_rainbow_ties', 'vb_04_anchor', 'vb_05_layers', 'vb_06_board_attack'] },
  { chapterId: 'chapter_b', name: '阶段B 样例', formal: false, levels: ['b_tie_intro', 'b_deliver_intro'] }]),
  challenges: [] };
// challenge config is frozen here: content revision + rules/score/rng versions + seed + the initial board hash the core
// produces for that seed. The game recomputes the hash at start; a mismatch makes the run invalid (never ranked).
const FOCUS = { special: '偏特殊构造：多造条纹/炸弹/彩虹并组合', obstacle: '偏障碍处理：箱子与糖霜的处理顺序', delivery: '偏综合送达：果篮＋绑带' };
// play-relevant content (board, start, spawn pool/weights, moves, goals, tools) — stars/notes excluded so a star recalibration keeps records
function challengePlayHash(d) { return Core.hashStr(JSON.stringify([d.board, d.initial, d.spawnPool, d.moveLimit, d.goals, d.tools])).toString(16); }
const CORDER = ['special', 'obstacle', 'delivery'];
Object.values(levels).filter(d => d.chapterId === 'challenges' && d.editorNotes && d.editorNotes.challenge).sort((a, b) => CORDER.indexOf(a.editorNotes.challenge.focus) - CORDER.indexOf(b.editorNotes.challenge.focus)).forEach(d => {
  const ch = d.editorNotes.challenge, g = Core.createGame(d, { seed: ch.seed });
  const tools = d.tools || {}; if (Object.values(tools).some(n => n > 0)) throw new Error(d.levelId + ': challenge levels must carry no tools');
  const cfg = { challengeId: d.levelId, levelId: d.levelId, name: d.displayName, focus: ch.focus, focusText: FOCUS[ch.focus] || ch.focus, seed: ch.seed >>> 0, moves: d.moveLimit,
    contentRevision: d.contentRevision, rulesetVersion: Core.RULESET || g.rulesetVersion || null, scoreVersion: g.scoreVersion, rngAlgo: g.rngAlgo || Core.RNG_ALGO || null, initHash: Core.stateHash(g), playHash: challengePlayHash(d), tools: 0, extraMoves: 0 };
  cfg.configKey = ['challenge', cfg.challengeId, cfg.levelId, 'r' + cfg.contentRevision, 'c' + cfg.playHash, cfg.rulesetVersion, cfg.scoreVersion, cfg.rngAlgo, 'seed' + cfg.seed, 'm' + cfg.moves, 'init' + cfg.initHash].join('|');
  catalog.challenges.push(cfg);
});
const report = {};
Object.values(levels).forEach(d => { const v = S.validate(d); report[d.levelId] = { contentRevision: d.contentRevision, contentHash: v.contentHash, counts: v.counts, sim: v.sim, issues: v.issues.map(i => i.sev + ':' + i.code) }; });
// any other levels/src/*.json (e.g. exported from editor.html) is published into a chapter named by its chapterId — only if it has no A/B issues
const listed = new Set(catalog.chapters.flatMap(c => c.levels));
Object.values(levels).filter(d => !listed.has(d.levelId) && d.chapterId !== 'challenges').sort((a, b) => a.levelId < b.levelId ? -1 : 1).forEach(d => {
  const rp = report[d.levelId]; if (rp.counts.error || rp.counts.block) { console.error('NOT PUBLISHED (validation): ' + d.levelId + ' ' + rp.issues.join(',')); delete levels[d.levelId]; return; }
  let ch = catalog.chapters.find(c => c.chapterId === (d.chapterId || 'custom'));
  if (!ch) { ch = { chapterId: d.chapterId || 'custom', name: d.chapterId === 'drafts' ? '编辑器导出' : (d.chapterId || 'custom'), levels: [] }; catalog.chapters.push(ch); }
  ch.levels.push(d.levelId);
});
const body = '/* GENERATED by tools/make_levels.js from levels/src/*.json — edit the JSON (or use editor.html), then re-run. */\n' +
  'window.JELLY_LEVELS = ' + JSON.stringify({ catalog, levels }) + ';\n';
fs.writeFileSync(path.join(DIR, 'levels_data.js'), body);
fs.writeFileSync(path.join(DIR, 'validation_report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report, null, 1));
