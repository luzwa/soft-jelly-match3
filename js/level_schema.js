/* 果冻三消 · 关卡数据 schema v1：规范化导出（无损、字节稳定）、导入/迁移入口、校验（A 结构错误 / B 可证明矛盾 / C 设计警告）。
 * Pure (no DOM). Depends on JellyCore (rules_core.js). UMD.
 */
(function (root) {
  'use strict';
  var Core = (typeof module !== 'undefined' && module.exports) ? require('./rules_core.js') : root.JellyCore;
  var REG = Core.REGISTRY, TYPES = Core.TYPES;
  var KEY_ORDER = ['schemaVersion', 'levelId', 'contentRevision', 'rulesetVersion', 'displayName', 'chapterId', 'board', 'initial', 'spawnPool', 'moveLimit', 'goals', 'tools', 'scoring', 'themeId', 'editorNotes'];
  var LAYER_ORDER = { terrain: 0, underlay: 1, occupant: 2, overlay: 3 };

  function deep(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function ordered(obj, keys) {   // fixed key order first, then any unknown keys sorted (kept, never dropped)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    var out = {}, k;
    keys.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key]; });
    Object.keys(obj).filter(function (key) { return keys.indexOf(key) < 0; }).sort().forEach(function (key) { out[key] = obj[key]; });
    return out;
  }
  function canonical(def) {
    var d = deep(def), o = ordered(d, KEY_ORDER);
    if (o.board) {
      o.board = ordered(o.board, ['rows', 'cols', 'playableMask', 'gravity', 'spawners', 'exits']);
      if (Array.isArray(o.board.spawners)) o.board.spawners = o.board.spawners.map(function (s) { return ordered(s, ['row', 'col']); })
        .sort(function (a, b) { return (a.row - b.row) || (a.col - b.col); });
      if (Array.isArray(o.board.exits)) o.board.exits = o.board.exits.map(function (s) { return ordered(s, ['row', 'col']); })
        .sort(function (a, b) { return (a.row - b.row) || (a.col - b.col); });
    }
    if (o.initial) {
      o.initial = ordered(o.initial, ['fillMode', 'allowInitialMatches', 'placements']);
      if (Array.isArray(o.initial.placements)) o.initial.placements = o.initial.placements.map(function (p) { return ordered(p, ['layer', 'row', 'col', 'typeId', 'special', 'hp', 'layers']); })
        .sort(function (a, b) { return ((LAYER_ORDER[a.layer] || 9) - (LAYER_ORDER[b.layer] || 9)) || (a.row - b.row) || (a.col - b.col); });
    }
    if (Array.isArray(o.spawnPool)) o.spawnPool = o.spawnPool.map(function (p) { return ordered(p, ['typeId', 'weight']); })
      .sort(function (a, b) { var ia = TYPES.indexOf(a.typeId), ib = TYPES.indexOf(b.typeId); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    if (Array.isArray(o.goals)) o.goals = o.goals.map(function (g) { return ordered(g, ['type', 'typeId', 'scope', 'count']); });
    if (o.tools) o.tools = ordered(o.tools, ['hammer', 'swap', 'shuffle']);
    if (o.scoring) o.scoring = ordered(o.scoring, ['stars']);
    if (o.editorNotes) o.editorNotes = ordered(o.editorNotes, ['designIntent', 'intendedDifficulty', 'validationStatus']);
    return o;
  }
  function serialize(def) { return JSON.stringify(canonical(def), null, 2) + '\n'; }
  function contentHash(def) {   // identity of the content (validation results are bound to it); editorNotes excluded
    var c = canonical(def); delete c.editorNotes; return Core.hashStr(JSON.stringify(c)).toString(16);
  }

  // ---------------------------------------------------------------- import (parse + explicit migration; newer schema refused)
  var MIGRATIONS = {};   // schemaVersion n → fn(def) producing n+1. None needed yet (v1 is the first published schema).
  function parse(text) {
    var def;
    try { def = JSON.parse(text); } catch (e) { return { ok: false, errors: [{ code: 'json', msg: 'JSON 解析失败：' + e.message }] }; }
    if (!def || typeof def !== 'object' || Array.isArray(def)) return { ok: false, errors: [{ code: 'shape', msg: '不是关卡对象' }] };
    var v = def.schemaVersion;
    if (typeof v !== 'number') return { ok: false, errors: [{ code: 'schema_missing', msg: '缺少 schemaVersion' }] };
    if (v > Core.SCHEMA) return { ok: false, errors: [{ code: 'schema_newer', msg: '不支持的 schemaVersion ' + v + '（当前支持 ' + Core.SCHEMA + '）' }] };
    while (def.schemaVersion < Core.SCHEMA) {
      var m = MIGRATIONS[def.schemaVersion];
      if (!m) return { ok: false, errors: [{ code: 'schema_old', msg: '没有从 schemaVersion ' + def.schemaVersion + ' 的迁移' }] };
      def = m(def);
    }
    var shape = shapeErrors(def);
    if (shape.length) return { ok: false, errors: shape };
    return { ok: true, def: canonical(def) };
  }
  function shapeErrors(d) {
    var e = [];
    function need(cond, code, msg) { if (!cond) e.push({ code: code, msg: msg }); }
    need(typeof d.levelId === 'string', 'shape_levelId', '缺少 levelId');
    need(d.board && typeof d.board === 'object', 'shape_board', '缺少 board');
    need(d.board && Array.isArray(d.board.playableMask), 'shape_mask', '缺少 board.playableMask');
    need(d.initial && Array.isArray(d.initial.placements), 'shape_placements', '缺少 initial.placements');
    need(Array.isArray(d.spawnPool), 'shape_pool', '缺少 spawnPool');
    need(Array.isArray(d.goals), 'shape_goals', '缺少 goals');
    need(typeof d.moveLimit === 'number', 'shape_moves', '缺少 moveLimit');
    return e;
  }

  // ---------------------------------------------------------------- validation
  function validate(def, opts) {
    opts = opts || {};
    var out = [], d = def;
    function add(sev, cat, code, msg, cells, field) { out.push({ sev: sev, cat: cat, code: code, msg: msg, cells: cells || [], field: field || null }); }
    function E(code, msg, cells, field) { add('error', 'A', code, msg, cells, field); }
    function B(code, msg, cells, field) { add('block', 'B', code, msg, cells, field); }
    function W(code, msg, cells, field) { add('warn', 'C', code, msg, cells, field); }
    var sh = shapeErrors(d); if (sh.length) { sh.forEach(function (x) { E(x.code, x.msg); }); return finish(out, d, null); }
    if (d.schemaVersion !== Core.SCHEMA) E('schema', '未知 schemaVersion：' + d.schemaVersion, null, 'schemaVersion');
    if (d.rulesetVersion !== Core.RULESET) E('ruleset', '未知规则版本：' + d.rulesetVersion, null, 'rulesetVersion');
    if (!/^[a-z0-9_\-]{3,64}$/.test(d.levelId)) E('level_id', 'levelId 只能用小写字母、数字、_、-（3–64 位）', null, 'levelId');
    if (!(d.contentRevision >= 1 && d.contentRevision % 1 === 0)) E('revision', 'contentRevision 必须是 ≥1 的整数', null, 'contentRevision');
    var bd = d.board, R = bd.rows, C = bd.cols;
    if (R !== 7 || C !== 7) { E('board_size', '首期棋盘固定为 7×7（用掩码调整可玩格）', null, 'board'); return finish(out, d, null); }
    var maskOk = bd.playableMask.length === R && bd.playableMask.every(function (s) { return typeof s === 'string' && s.length === C && /^[01]+$/.test(s); });
    if (!maskOk) { E('mask', 'playableMask 必须是 7 行、每行 7 个 0/1', null, 'board.playableMask'); return finish(out, d, null); }
    if (bd.gravity !== 'down') E('gravity', '首期只支持向下重力', null, 'board.gravity');
    var mask = Core.maskOf(d), segs = Core.segmentsOf(mask, R, C), nPlay = mask.filter(Boolean).length;
    if (nPlay < 9) E('mask_small', '可玩格太少（' + nPlay + '）', null, 'board.playableMask');
    function inR(r, c) { return r >= 0 && c >= 0 && r < R && c < C && r % 1 === 0 && c % 1 === 0; }
    function play(r, c) { return inR(r, c) && mask[r * C + c]; }
    // facilities
    var spawnAt = {};
    (bd.spawners || []).forEach(function (s, i) {
      var f = 'board.spawners[' + i + ']';
      if (!inR(s.row, s.col)) { E('spawner_oob', '出生口越界', null, f); return; }
      if (!play(s.row, s.col)) { E('spawner_void', '出生口在空洞格上', [[s.row, s.col]], f); return; }
      var key = s.row * C + s.col; if (spawnAt[key]) E('spawner_dup', '重复的出生口', [[s.row, s.col]], f); spawnAt[key] = 1;
      if (s.row > 0 && mask[(s.row - 1) * C + s.col]) E('spawner_not_top', '出生口必须位于竖直连续段的最上端格', [[s.row, s.col]], f);
    });
    segs.forEach(function (sg) {
      if (!spawnAt[sg.r0 * C + sg.c]) {
        var cells = []; for (var r = sg.r0; r <= sg.r1; r++) cells.push([r, sg.c]);
        E('segment_no_spawner', '第 ' + (sg.c + 1) + ' 列第 ' + (sg.r0 + 1) + '–' + (sg.r1 + 1) + ' 行这一段没有出生口（每段顶端需要且只需要一个）', cells, 'board.spawners');
      }
    });
    // exits (stage B): only at the bottom playable cell of a static vertical segment, at most one per segment
    var exitAt = {}, segExit = {};
    function segOf(r, c) { for (var i = 0; i < segs.length; i++) { var g = segs[i]; if (g.c === c && r >= g.r0 && r <= g.r1) return i; } return -1; }
    if (bd.exits != null && !Array.isArray(bd.exits)) E('exits_shape', 'board.exits 必须是数组', null, 'board.exits');
    (Array.isArray(bd.exits) ? bd.exits : []).forEach(function (x, i) {
      var f = 'board.exits[' + i + ']';
      if (!inR(x.row, x.col)) { E('exit_oob', '出口越界', null, f); return; }
      if (!play(x.row, x.col)) { E('exit_void', '出口在空洞格上', [[x.row, x.col]], f); return; }
      var key = x.row * C + x.col; if (exitAt[key]) { E('exit_dup', '重复的出口', [[x.row, x.col]], f); return; }
      exitAt[key] = 1;
      if (x.row + 1 < R && mask[(x.row + 1) * C + x.col]) E('exit_not_bottom', '出口必须位于竖直连续段的最下端格（当前向下重力）', [[x.row, x.col]], f);
      var si = segOf(x.row, x.col); if (si >= 0) segExit[si] = key;
    });
    // placements + compatibility matrix
    var occ = {}, und = {}, ovl = {}, crates = 0, frostCells = 0, ties = 0, baskets = [], fixedJ = {}, fixedCount = {};
    d.initial.placements.forEach(function (p, i) {
      var f = 'initial.placements[' + i + ']', cell = [[p.row, p.col]];
      if (!inR(p.row, p.col)) { E('place_oob', '摆放坐标越界 (' + p.row + ',' + p.col + ')', null, f); return; }
      if (!play(p.row, p.col)) { E('place_void', '空洞格上不能放任何对象', cell, f); return; }
      var key = p.row * C + p.col;
      if (p.layer === 'overlay') {
        if (p.typeId !== 'gummy_tie') { E('unknown_type', '未知覆盖层对象：' + p.typeId, cell, f); return; }
        if (ovl[key]) E('dup_overlay', '同一格重复放置绑带', cell, f);
        if (p.layers != null && p.layers !== 1) E('tie_layers', '首期绑带只有 1 层', cell, f);
        ovl[key] = { p: p, f: f }; ties++;
        return;
      }
      if (p.layer === 'underlay') {
        if (p.typeId !== 'frosting_pad') { E('unknown_type', '未知地面层对象：' + p.typeId, cell, f); return; }
        if (und[key]) E('dup_underlay', '同一格重复放置地垫', cell, f);
        if (!(p.layers >= 1 && p.layers <= REG.obstacles.frosting_pad.max && p.layers % 1 === 0)) E('frost_layers', '糖霜层数必须是 1–2', cell, f);
        und[key] = p; frostCells++;
      } else if (p.layer === 'occupant') {
        if (occ[key]) E('dup_occupant', '同一格只能有一个占据物', cell, f);
        if (p.typeId === 'cookie_crate') {
          if (!(p.hp >= 1 && p.hp <= REG.obstacles.cookie_crate.max && p.hp % 1 === 0)) E('crate_hp', '饼干箱耐久必须是 1–3', cell, f);
          crates++;
        } else if (p.typeId === 'delivery_basket') {
          if (p.special) E('basket_special', '果篮不能带特殊类型', cell, f);
          baskets.push({ r: p.row, c: p.col, f: f });
        } else if (TYPES.indexOf(p.typeId) >= 0 || p.typeId === 'rainbow') {
          if (p.special && !REG.specials[p.special]) E('unknown_special', '未知特殊棋子：' + p.special, cell, f);
          if (p.typeId === 'rainbow' && p.special !== 'rainbow') E('rainbow_special', 'rainbow 必须 special=rainbow', cell, f);
          if (!p.special) { fixedJ[key] = p.typeId; fixedCount[p.typeId] = (fixedCount[p.typeId] || 0) + 1; }
        } else { E('unknown_type', '未知占据物：' + p.typeId, cell, f); return; }
        occ[key] = p;
      } else E('unknown_layer', '未知层：' + p.layer, cell, f);
    });
    Object.keys(und).forEach(function (key) { var o = occ[key]; if (o && o.typeId === 'cookie_crate') E('crate_on_frosting', 'V1 禁止在饼干箱下摆放地垫', [[Math.floor(key / C), key % C]], 'initial.placements'); });
    // compatibility: a tie only covers an ordinary jelly or a special (fixed or seeded-random); never a crate / basket / void
    Object.keys(ovl).forEach(function (key) { var o = occ[key], t = ovl[key]; if (o && (o.typeId === 'cookie_crate' || o.typeId === 'delivery_basket')) E('tie_host', '绑带只能覆盖普通果冻或特殊棋子，不能覆盖' + (o.typeId === 'cookie_crate' ? '饼干箱' : '果篮'), [[Math.floor(key / C), key % C]], t.f); });
    // delivery: same segment as an exit, not on the exit itself
    baskets.forEach(function (b) {
      var key = b.r * C + b.c, si = segOf(b.r, b.c);
      if (exitAt[key]) E('basket_on_exit', '果篮开局不能直接摆在出口格', [[b.r, b.c]], b.f);
      else if (segExit[si] == null) B('basket_no_exit', '果篮所在竖直连续段没有出口（向下重力无法送达）', [[b.r, b.c]], b.f);
    });
    var exitN = Object.keys(exitAt).length;
    if (exitN && !baskets.length) W('exit_unused', '有出口但没有果篮', Object.keys(exitAt).map(function (kk) { return [Math.floor(kk / C), kk % C]; }), 'board.exits');
    // fixed opening must not already contain a match
    if (!(d.initial && d.initial.allowInitialMatches)) {
      var view = { R: R, C: C, mask: mask, occ: [] };
      for (var k = 0; k < R * C; k++) { var o = occ[k]; view.occ.push(o && o.typeId !== 'cookie_crate' && o.typeId !== 'delivery_basket' ? { kind: 'jelly', type: o.special === 'rainbow' ? 'rainbow' : o.typeId, sp: o.special || null } : (o ? { kind: o.typeId === 'cookie_crate' ? 'crate' : 'basket' } : null)); }
      Core.findRuns(view).forEach(function (run) { E('fixed_match', '固定开局已有三连（与“开局无自动匹配”冲突）', run.cells.map(function (kk) { return [Math.floor(kk / C), kk % C]; }), 'initial.placements'); });
    }
    // spawn pool
    var pool = d.spawnPool, live = 0, poolSet = {};
    pool.forEach(function (p, i) {
      var f = 'spawnPool[' + i + ']';
      if (TYPES.indexOf(p.typeId) < 0) E('pool_type', '补子池里有未知类型：' + p.typeId, null, f);
      if (!(typeof p.weight === 'number' && p.weight >= 0 && p.weight <= 100)) E('pool_weight', '权重必须在 0–100', null, f);
      if (poolSet[p.typeId]) E('pool_dup', '补子池类型重复：' + p.typeId, null, f);
      if (p.weight > 0) { live++; poolSet[p.typeId] = 1; }
    });
    if (!live) E('pool_zero', '补子池权重总和为 0', null, 'spawnPool');
    else if (live < 3) W('pool_small', '补子池少于 3 种类型，开局与洗牌很难避免现成三连', null, 'spawnPool');
    // moves / tools
    if (!(d.moveLimit >= REG.limits.moves[0] && d.moveLimit <= REG.limits.moves[1] && d.moveLimit % 1 === 0)) E('moves', '步数必须是 1–99 的整数', null, 'moveLimit');
    if (d.tools) ['hammer', 'swap', 'shuffle'].forEach(function (t) { var v = d.tools[t]; if (v != null && !(v >= 0 && v <= 9 && v % 1 === 0)) E('tools', '道具数量必须 0–9', null, 'tools.' + t); });
    // goals
    if (!d.goals.length) E('no_goals', '至少需要一个目标', null, 'goals');
    if (d.goals.length > 3) E('goals_many', '最多 3 个目标', null, 'goals');
    else if (d.goals.length > 2) W('goals_3', '首批关卡建议 1–2 类目标', null, 'goals');
    var seen = {};
    d.goals.forEach(function (g, i) {
      var f = 'goals[' + i + ']', gd = REG.goals[g.type];
      if (!gd) { E('goal_type', '未知目标类型：' + g.type, null, f); return; }
      if (!gd.enabled) { E('goal_stage', '目标“' + gd.name + '”属于阶段 ' + gd.stage + '，尚未启用', null, f); return; }
      var key = g.type + '|' + (g.typeId || ''); if (seen[key]) E('goal_dup', '重复的目标', null, f); seen[key] = 1;
      if (g.type === 'collect_piece') {
        if (TYPES.indexOf(g.typeId) < 0) { E('goal_piece', '收集目标必须是六种普通果冻之一', null, f); return; }
        if (!(g.count >= 1 && g.count <= 999 && g.count % 1 === 0)) E('goal_count', '收集数量必须 1–999', null, f);
        if (!poolSet[g.typeId] && (fixedCount[g.typeId] || 0) < g.count) B('collect_unreachable', '收集类型不在补子池里，且初始数量（' + (fixedCount[g.typeId] || 0) + '）不足 ' + g.count, null, f);
      } else if (g.type === 'clear_underlay') {
        if (g.typeId !== 'frosting_pad') E('goal_typeid', '清除地面目标 typeId 必须是 frosting_pad', null, f);
        if (!frostCells) B('no_frosting', '目标要求清除糖霜，但棋盘上没有糖霜', null, f);
        if (g.scope === 'count' && !(g.count >= 1)) E('goal_count', '数量必须 ≥1', null, f);
        if (g.scope === 'count' && g.count > frostCells) B('frost_short', '需要清除 ' + g.count + ' 格糖霜，但只摆了 ' + frostCells + ' 格，且没有其它来源', null, f);
        if (g.scope !== 'all' && g.scope !== 'count') E('goal_scope', 'scope 必须是 all 或 count', null, f);
      } else if (g.type === 'clear_obstacle') {
        if (g.typeId !== 'cookie_crate' && g.typeId !== 'gummy_tie') { E('goal_typeid', '清除障碍目标 typeId 必须是 cookie_crate 或 gummy_tie', null, f); return; }
        var have = g.typeId === 'gummy_tie' ? ties : crates, nm = g.typeId === 'gummy_tie' ? '绑带' : '饼干箱';
        if (!have) B(g.typeId === 'gummy_tie' ? 'no_ties' : 'no_crates', '目标要求清除' + nm + '，但棋盘上没有' + nm, null, f);
        if (g.scope === 'count' && !(g.count >= 1)) E('goal_count', '数量必须 ≥1', null, f);
        if (g.scope === 'count' && g.count > have) B(g.typeId === 'gummy_tie' ? 'tie_short' : 'crate_short', '需要清除 ' + g.count + ' 个' + nm + '，但只摆了 ' + have + ' 个，且没有生成来源', null, f);
        if (g.scope !== 'all' && g.scope !== 'count') E('goal_scope', 'scope 必须是 all 或 count', null, f);
      } else if (g.type === 'deliver') {
        if (g.typeId !== 'delivery_basket') E('goal_typeid', '送达目标 typeId 必须是 delivery_basket', null, f);
        if (g.scope !== 'all' && g.scope !== 'count') E('goal_scope', 'scope 必须是 all 或 count', null, f);
        if (g.scope === 'count' && !(g.count >= 1 && g.count % 1 === 0)) E('goal_count', '数量必须 ≥1', null, f);
        if (!exitN) E('deliver_no_exit', '送达目标需要至少一个出口', null, 'board.exits');
        if (!baskets.length) B('no_baskets', '送达目标要求果篮，但开局没有明确放置任何果篮（V1 不随机生成）', null, f);
        else if (g.scope === 'count' && g.count > baskets.length) B('deliver_short', '需要送达 ' + g.count + ' 个，但只放了 ' + baskets.length + ' 个果篮', null, f);
      }
    });
    // C: regions currently cut off from supply by crates (temporary: opening the crate restores the path)
    segs.forEach(function (sg) {
      var below = false, cells = [];
      for (var r = sg.r0; r <= sg.r1; r++) { var o = occ[r * C + sg.c]; if ((o && o.typeId === 'cookie_crate') || ovl[r * C + sg.c]) below = true; else if (below) cells.push([r, sg.c]); }
      if (cells.length) W('cut_off', '这些格子在饼干箱或绑带下方，障碍解除前没有补给（暂时阻断，可恢复）', cells, 'initial.placements');
    });
    // C/A: initialisation simulation over a fixed seed set (structure must be fully valid to run it)
    var sim = null;
    if (!out.some(function (x) { return x.sev === 'error'; })) {
      var seeds = typeof opts.seeds === 'number' ? Array.from({ length: opts.seeds }, function (_, i) { return i + 1; }) : (opts.seeds || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]), fails = [], movesSum = 0;
      seeds.forEach(function (s) { var st = Core.createGame(d, { seed: s }); if (st.phase === 'stuck') fails.push(s); else movesSum += Core.listMoves(st).length; });
      var okN = seeds.length - fails.length;
      sim = { seeds: seeds.length, initOk: okN, initFail: fails, avgLegalMoves: okN ? Math.round(movesSum / okN * 10) / 10 : 0 };
      if (!okN) E('init_impossible', '固定开局与“无现成三连且至少一个合法操作”的要求冲突，' + seeds.length + ' 个 seed 全部初始化失败', null, 'initial');
      else if (fails.length) W('init_some_fail', fails.length + ' 个 seed 初始化失败（尝试上限 ' + Core.LIMITS.MAX_INIT_ATTEMPTS + '）：' + fails.join(','), null, 'initial');
      if (okN && sim.avgLegalMoves < 3) W('few_moves', '开局平均只有 ' + sim.avgLegalMoves + ' 个合法操作', null, 'initial');
    }
    return finish(out, d, sim);
  }
  function finish(issues, d, sim) {
    var n = { error: 0, block: 0, warn: 0 }; issues.forEach(function (x) { n[x.sev]++; });
    return { issues: issues, counts: n, structuralOk: n.error === 0, publishable: n.error === 0 && n.block === 0, sim: sim,
      contentHash: (function () { try { return contentHash(d); } catch (e) { return null; } })(), rulesetVersion: Core.RULESET,
      note: '“结构通过”只表示未发现所检查的结构问题，不代表已证明可解或已完成平衡。' };
  }

  // ---------------------------------------------------------------- templates
  function blankLevel(levelId) {
    var sp = []; for (var c = 0; c < 7; c++) sp.push({ row: 0, col: c });
    return canonical({ schemaVersion: Core.SCHEMA, levelId: levelId, contentRevision: 1, rulesetVersion: Core.RULESET, displayName: '新关卡', chapterId: 'drafts',
      board: { rows: 7, cols: 7, playableMask: ['1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111'], gravity: 'down', spawners: sp, exits: [] },
      initial: { fillMode: 'seeded_random_unassigned', allowInitialMatches: false, placements: [] },
      spawnPool: TYPES.slice(0, 5).map(function (t) { return { typeId: t, weight: 1 }; }),
      moveLimit: 20, goals: [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 12 }], tools: { hammer: 3, swap: 3, shuffle: 3 },
      scoring: { stars: [8000, 14000, 20000], starsStatus: 'default_unvalidated', scoreVersion: Core.SCORE_VERSION }, themeId: 'cream_garden', editorNotes: { designIntent: '', intendedDifficulty: 'unrated', validationStatus: 'draft_unvalidated' } });
  }
  // C (addendum 3.1): cells cut off from supply — below a crate or tied host in the same static segment. Temporary
  // (opening / releasing restores the path); the editor shows them live, validation warns (cut_off).
  function blockedCells(def) {
    try {
      var R = def.board.rows, C = def.board.cols, mask = Core.maskOf(def), segs = Core.segmentsOf(mask, R, C), fixed = {}, out = [];
      (def.initial.placements || []).forEach(function (p) { if ((p.layer === 'occupant' && p.typeId === 'cookie_crate') || p.layer === 'overlay') fixed[p.row * C + p.col] = 1; });
      segs.forEach(function (sg) { var below = false; for (var r = sg.r0; r <= sg.r1; r++) { if (fixed[r * C + sg.c]) below = true; else if (below) out.push([r, sg.c]); } });
      return out;
    } catch (e) { return []; }
  }
  // recompute spawners = one per static segment top (editor "auto spawners"; export still records the real list)
  function autoSpawners(def) {
    var mask = Core.maskOf(def), segs = Core.segmentsOf(mask, def.board.rows, def.board.cols);
    return segs.map(function (s) { return { row: s.r0, col: s.c }; });
  }

  var API = { canonical: canonical, serialize: serialize, parse: parse, validate: validate, contentHash: contentHash, blankLevel: blankLevel, autoSpawners: autoSpawners, blockedCells: blockedCells, deep: deep, MIGRATIONS: MIGRATIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JellyLevelSchema = API;
})(typeof window !== 'undefined' ? window : this);
