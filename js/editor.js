/* 果冻三消 · 关卡编辑器（阶段A）。Plain script, file:// friendly.
 * Edits a level definition (schema v1) only — never runtime state. Validation and playtest use the same
 * rules_core.js / level_schema.js the game loads; playtest runs the real game in an iframe (index.html?playtest=1).
 */
(function () {
  'use strict';
  var Core = window.JellyCore, LS = window.JellyLevelSchema, ART = window.JellyObstacleArt, REG = Core.REGISTRY, TYPES = Core.TYPES;
  var NS = 'jelly_editor_v1:', K_DRAFTS = NS + 'drafts', K_CUR = NS + 'current', K_VAL = NS + 'validation';
  var CAT = window.JELLY_LEVELS || { catalog: { chapters: [] }, levels: {} };
  var NAME = { jelly_squid: '鱿鱼', jelly_fugu: '河豚', jelly_jellyfish: '水母', jelly_octopus: '章鱼', jelly_bear: '小熊', jelly_fig: '无花果' };
  var $ = function (id) { return document.getElementById(id); };
  var R = 7, C = 7, CELL = 72, PAD = 28;

  // ---------------------------------------------------------------- state
  var E = { draft: null, base: null, undo: [], redo: [], layer: 'occupant', tool: null, mode: 'brush', sel: null, hl: [], val: null, dirty: false, savedAt: null, stroke: null, rect: null };
  var IMG = {};
  TYPES.forEach(function (t) { var im = new Image(); im.onload = draw; im.src = window.JELLY_SPRITES[t]; IMG[t] = im; });
  ['cell_cream', 'cell_sage'].forEach(function (n) { var im = new Image(); im.onload = draw; im.src = 'assets/ui/components/' + n + '.png'; IMG[n] = im; });

  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('本地存储失败：' + e.message); return false; } }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function drafts() { return load(K_DRAFTS, {}); }
  function toast(t, ms) { var el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { el.style.display = 'none'; }, ms || 2200); }

  // ---------------------------------------------------------------- registry-driven palette (single source: Core.REGISTRY)
  var LAYERS = [
    { id: 'terrain', name: '地形/设施' }, { id: 'underlay', name: '地面层' }, { id: 'occupant', name: '占据层' }, { id: 'overlay', name: '覆盖层' }
  ];
  function paletteFor(layer) {
    var out = [];
    if (layer === 'terrain') {
      out.push({ id: 'cell_on', name: '可玩格' }, { id: 'cell_off', name: '空洞 void' }); if (REG.facilities.spawner.enabled) out.push({ id: 'spawner', name: '出生口' });
      out.push({ id: 'exit', name: '出口（段底）', disabled: !REG.facilities.exit.enabled, stage: REG.facilities.exit.stage });
    }
    Object.keys(REG.obstacles).forEach(function (oid) {
      var o = REG.obstacles[oid]; if (o.layer !== layer) return;
      for (var v = o.min; v <= o.max; v++) out.push({ id: oid + ':' + v, obstacle: oid, value: v, name: o.name + (o.max > 1 ? ' ' + v + (o.field === 'hp' ? ' HP' : ' 层') : ''), disabled: !o.enabled, stage: o.stage });
    });
    if (layer === 'occupant') {
      TYPES.forEach(function (t) { out.push({ id: 'jelly:' + t, jelly: t, name: NAME[t] }); });
      Object.keys(REG.specials).forEach(function (sp) { out.push({ id: 'special:' + sp, special: sp, name: REG.specials[sp].name, fixture: true }); });
      Object.keys(REG.delivery || {}).forEach(function (did) { var o = REG.delivery[did]; out.push({ id: did, delivery: did, name: o.name, disabled: !o.enabled, stage: o.stage }); });
    }
    out.push({ id: 'erase', name: '擦除（仅本层）' });
    return out;
  }
  function iconFor(p) {
    var c = document.createElement('canvas'); c.width = c.height = 44; var x = c.getContext('2d');
    if (p.obstacle === 'frosting_pad') ART.frosting(x, 2, 2, 40, p.value, 0, 1);
    else if (p.obstacle === 'cookie_crate') ART.crate(x, 2, 2, 40, p.value, 0, 1);
    else if (p.obstacle === 'gummy_tie') { x.fillStyle = '#ffc7d6'; x.beginPath(); x.arc(22, 23, 14, 0, 6.3); x.fill(); ART.tie(x, 2, 2, 40, 0, 1); }
    else if (p.delivery) ART.basket(x, 2, 2, 40, 0, 1);
    else if (p.id === 'exit') ART.exit(x, 2, -6, 40, 1);
    else if (p.obstacle) { x.fillStyle = '#ccc'; x.fillRect(6, 6, 32, 32); }
    else if (p.jelly) { if (IMG[p.jelly].complete) x.drawImage(IMG[p.jelly], 2, 2, 40, 40); else IMG[p.jelly].addEventListener('load', function () { x.drawImage(IMG[p.jelly], 2, 2, 40, 40); }); }
    else if (p.special) specialMark(x, p.special, 2, 2, 40);
    else if (p.id === 'spawner') ART.spawner(x, 2, 8, 40, 1);
    else if (p.id === 'cell_on') { x.fillStyle = '#f6edd6'; x.fillRect(4, 4, 36, 36); }
    else if (p.id === 'cell_off') { x.fillStyle = '#6d5c44'; x.fillRect(4, 4, 36, 36); }
    else if (p.id === 'erase') { x.strokeStyle = '#c55'; x.lineWidth = 4; x.beginPath(); x.moveTo(10, 10); x.lineTo(34, 34); x.moveTo(34, 10); x.lineTo(10, 34); x.stroke(); }
    return c;
  }
  function specialMark(x, sp, X, Y, s) {
    x.save(); x.lineWidth = Math.max(2, s * 0.09); x.strokeStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 3; x.lineCap = 'round';
    var cx = X + s / 2, cy = Y + s / 2;
    if (sp === 'h') { x.beginPath(); x.moveTo(X + s * 0.18, cy); x.lineTo(X + s * 0.82, cy); x.stroke(); }
    else if (sp === 'v') { x.beginPath(); x.moveTo(cx, Y + s * 0.18); x.lineTo(cx, Y + s * 0.82); x.stroke(); }
    else if (sp === 'bomb') { x.beginPath(); x.arc(cx, cy, s * 0.24, 0, 7); x.stroke(); }
    else if (sp === 'rainbow') { ['#ff8a8a', '#ffd36b', '#8fd18a', '#7fb6ff', '#c59bff'].forEach(function (col, i) { x.strokeStyle = col; x.beginPath(); x.arc(cx, cy + s * 0.12, s * (0.34 - i * 0.055), Math.PI, 0); x.stroke(); }); }
    x.restore();
  }
  function renderPalette() {
    var lb = $('layerBtns'); lb.innerHTML = '';
    LAYERS.forEach(function (L) {
      var b = document.createElement('button'); b.textContent = L.name; b.dataset.layer = L.id; if (L.id === E.layer) b.className = 'on';
      b.onclick = function () { E.layer = L.id; E.tool = null; renderPalette(); }; lb.appendChild(b);
    });
    var pal = $('pal'); pal.innerHTML = '';
    var items = paletteFor(E.layer);
    if (!E.tool || !items.some(function (p) { return p.id === E.tool.id && !p.disabled; })) E.tool = items.filter(function (p) { return !p.disabled; })[0] || null;
    items.forEach(function (p) {
      var b = document.createElement('button'); b.dataset.tool = p.id; b.appendChild(iconFor(p)); var sp = document.createElement('span'); sp.textContent = p.name; b.appendChild(sp);
      if (p.disabled) { b.disabled = true; b.title = '阶段 ' + p.stage + ' 才开放（注册表 enabled=false）'; sp.textContent += '（阶段' + p.stage + '）'; }
      if (p.fixture) { b.title = '规则测试夹具：预放特殊棋子，玩家关卡设计中尚不可用；使用后关卡会被标记为“规则测试关”'; sp.className = 'fixture'; sp.textContent += '*'; }
      if (E.tool && E.tool.id === p.id) b.className = 'on';
      b.onclick = function () { E.tool = p; renderPalette(); };
      pal.appendChild(b);
    });
    if (E.layer === 'occupant') { var n = document.createElement('span'); n.className = 'fixture'; n.textContent = '* 特殊棋子 = 规则测试夹具（非玩家功能）'; pal.appendChild(n); }
    if (E.layer === 'overlay') { var n2 = document.createElement('span'); n2.className = 'hint'; n2.textContent = '软糖绑带：只能盖在普通果冻 / 特殊棋子 / 随机格上；宿主不能交换、掉落、洗牌，可原地参与匹配。'; pal.appendChild(n2); }
    if (E.layer === 'terrain') { var n3 = document.createElement('span'); n3.className = 'hint'; n3.textContent = '出口只能放在竖直连续段的最下端格（向下重力）；同格再点一次取消。'; pal.appendChild(n3); }
  }

  // ---------------------------------------------------------------- level model helpers (operate on the definition only)
  function playable(r, c) { return E.draft.board.playableMask[r][c] === '1'; }
  function placeAt(r, c, layer) { var ps = E.draft.initial.placements; for (var i = 0; i < ps.length; i++) if (ps[i].row === r && ps[i].col === c && ps[i].layer === layer) return ps[i]; return null; }
  function removeAt(r, c, layer) { var ps = E.draft.initial.placements, n = ps.length; E.draft.initial.placements = ps.filter(function (p) { return !(p.row === r && p.col === c && (!layer || p.layer === layer)); }); return E.draft.initial.placements.length !== n; }
  function spawnerAt(r, c) { return E.draft.board.spawners.some(function (s) { return s.row === r && s.col === c; }); }
  function exitsOf() { if (!E.draft.board.exits) E.draft.board.exits = []; return E.draft.board.exits; }
  function exitAt(r, c) { return exitsOf().some(function (s) { return s.row === r && s.col === c; }); }
  function dropExit(r, c) { var n = exitsOf().length; E.draft.board.exits = exitsOf().filter(function (s) { return !(s.row === r && s.col === c); }); return E.draft.board.exits.length !== n; }
  function setMask(r, c, on) {
    var row = E.draft.board.playableMask[r]; if ((row[c] === '1') === on) return false;
    E.draft.board.playableMask[r] = row.slice(0, c) + (on ? '1' : '0') + row.slice(c + 1);
    if (!on) { removeAt(r, c, null); dropExit(r, c); E.draft.board.spawners = E.draft.board.spawners.filter(function (s) { return !(s.row === r && s.col === c); }); }   // same transaction (exits too)
    if ($('autoSp').checked) E.draft.board.spawners = LS.autoSpawners(E.draft);
    return true;
  }
  // returns true if changed; refusals explain the reason at placement time
  function paintCell(r, c, tool) {
    if (!tool) return false;
    if (tool.id === 'cell_on') return setMask(r, c, true);
    if (tool.id === 'cell_off') return setMask(r, c, false);
    if (!playable(r, c)) { refuse('(' + r + ',' + c + ') 是空洞，不能摆放（先用“可玩格”恢复）'); return false; }
    if (tool.id === 'spawner') {
      var has = spawnerAt(r, c);
      if (has) E.draft.board.spawners = E.draft.board.spawners.filter(function (s) { return !(s.row === r && s.col === c); });
      else E.draft.board.spawners.push({ row: r, col: c });
      $('autoSp').checked = false; return true;
    }
    if (tool.id === 'erase') {
      if (E.layer === 'terrain') { if (spawnerAt(r, c)) { E.draft.board.spawners = E.draft.board.spawners.filter(function (s) { return !(s.row === r && s.col === c); }); return true; } return dropExit(r, c); }
      return removeAt(r, c, E.layer);
    }
    var occ = placeAt(r, c, 'occupant'), und = placeAt(r, c, 'underlay'), ovl = placeAt(r, c, 'overlay'), np;
    if (tool.id === 'exit') {
      if (exitAt(r, c)) return dropExit(r, c);
      if (r + 1 < R && playable(r + 1, c)) { refuse('出口只能放在竖直连续段的最下端格（当前向下重力）'); return false; }
      if (occ && occ.typeId === 'delivery_basket') { refuse('果篮开局不能直接摆在出口格'); return false; }
      exitsOf().push({ row: r, col: c }); return true;
    }
    if (tool.obstacle === 'gummy_tie') {
      if (occ && (occ.typeId === 'cookie_crate' || occ.typeId === 'delivery_basket')) { refuse('绑带只能盖在普通果冻或特殊棋子上（兼容矩阵：不能盖' + (occ.typeId === 'cookie_crate' ? '饼干箱' : '果篮') + '）'); return false; }
      if (ovl) return false;
      E.draft.initial.placements.push({ layer: 'overlay', row: r, col: c, typeId: 'gummy_tie', layers: 1 }); return true;
    }
    if (tool.delivery) {
      if (ovl) { refuse('绑带格不能放果篮（绑带只覆盖果冻）；先擦除覆盖层'); return false; }
      if (exitAt(r, c)) { refuse('果篮开局不能直接摆在出口格'); return false; }
      if (occ && occ.typeId === tool.delivery) return false;
      removeAt(r, c, 'occupant'); E.draft.initial.placements.push({ layer: 'occupant', row: r, col: c, typeId: tool.delivery }); return true;
    }
    if (tool.obstacle === 'frosting_pad') {
      if (occ && occ.typeId === 'cookie_crate') { refuse('饼干箱下面不能放糖霜（兼容矩阵：箱子格不允许地面层）'); return false; }
      if (und && und.layers === tool.value) return false;
      removeAt(r, c, 'underlay'); np = { layer: 'underlay', row: r, col: c, typeId: 'frosting_pad', layers: tool.value };
    } else if (tool.obstacle === 'cookie_crate') {
      if (und) { refuse('糖霜上不能放饼干箱（兼容矩阵：箱子格不允许地面层）'); return false; }
      if (ovl) { refuse('绑带格不能放饼干箱（绑带只覆盖果冻）；先擦除覆盖层'); return false; }
      if (occ && occ.typeId === 'cookie_crate' && occ.hp === tool.value) return false;
      removeAt(r, c, 'occupant'); np = { layer: 'occupant', row: r, col: c, typeId: 'cookie_crate', hp: tool.value };
    } else if (tool.jelly) {
      if (occ && occ.typeId === tool.jelly && !occ.special) return false;
      var keepSp = occ && occ.special && occ.special !== 'rainbow' && occ.typeId !== 'cookie_crate' ? occ.special : null;
      removeAt(r, c, 'occupant'); np = { layer: 'occupant', row: r, col: c, typeId: tool.jelly }; if (keepSp) np.special = keepSp;
    } else if (tool.special) {
      var t = occ && occ.typeId !== 'cookie_crate' && occ.typeId !== 'delivery_basket' ? occ.typeId : 'jelly_bear';
      if (occ && occ.special === tool.special) return false;
      removeAt(r, c, 'occupant'); np = { layer: 'occupant', row: r, col: c, typeId: t, special: tool.special };
      if (tool.special !== 'rainbow' && (!occ || occ.typeId === 'cookie_crate' || occ.typeId === 'delivery_basket')) toast('先放普通果冻再加特殊标记可指定颜色；此处默认小熊色');
    } else return false;
    E.draft.initial.placements.push(np);
    return true;
  }
  function refuse(msg) { toast('不能这样摆放：' + msg, 2600); }

  // ---------------------------------------------------------------- undo / redo (one drag = one step), draft persistence
  function snap() { return JSON.stringify(E.draft); }
  function begin() { E.stroke = { before: snap(), changed: false }; }
  function commit() {
    if (!E.stroke) return; var s = E.stroke; E.stroke = null;
    if (!s.changed) return;
    E.undo.push(s.before); if (E.undo.length > 200) E.undo.shift(); E.redo = [];
    touched();
  }
  function edit(fn) { begin(); E.stroke.changed = fn() !== false; commit(); }
  function undo() { if (!E.undo.length) return; E.redo.push(snap()); E.draft = JSON.parse(E.undo.pop()); touched(true); }
  function redo() { if (!E.redo.length) return; E.undo.push(snap()); E.draft = JSON.parse(E.redo.pop()); touched(true); }
  function touched(fromHistory) {
    E.draft = LS.canonical(E.draft);
    // content changed vs. the loaded base → new contentRevision (same levelId); unchanged → base revision
    var ch = LS.contentHash(withRev(E.draft, E.base.rev));
    E.draft.contentRevision = (ch === E.base.hash || E.base.fresh) ? E.base.rev : E.base.rev + 1;   // a never-exported new/copied level stays at r1
    E.dirty = true; E.val = null; markStatus(); syncForm(); draw(); renderIssues(); renderList();
    clearTimeout(touched.t); touched.t = setTimeout(function () { saveDraft(true); }, 800);   // autosave
  }
  function withRev(d, rev) { var x = LS.deep(d); x.contentRevision = rev; return x; }
  function saveDraft(auto) {
    var all = drafts(), id = E.draft.levelId;
    all[id] = { json: LS.serialize(E.draft), base: E.base, savedAt: new Date().toISOString() };
    if (store(K_DRAFTS, all) && store(K_CUR, id)) { E.dirty = false; E.savedAt = new Date(); markStatus(auto ? '已自动保存' : '草稿已保存'); }
    renderList();
  }
  function markStatus(msg) {
    var t = E.savedAt ? E.savedAt.toTimeString().slice(0, 8) : '—';
    $('status').textContent = (msg ? msg + ' · ' : '') + (E.dirty ? '有未保存修改' : '已保存 ' + t) + ' · ' + E.draft.levelId + ' r' + E.draft.contentRevision + ' · ' + Core.RULESET + ' · 撤销 ' + E.undo.length + ' / 重做 ' + E.redo.length;
  }
  function open(def, base, fromDraft) {
    E.draft = LS.canonical(def); E.base = base || { rev: E.draft.contentRevision, hash: LS.contentHash(E.draft) };
    E.undo = []; E.redo = []; E.sel = null; E.hl = []; E.val = loadVal(E.draft); E.dirty = !fromDraft;
    if (!fromDraft) saveDraft(true); else store(K_CUR, E.draft.levelId);
    syncForm(); draw(); renderIssues(); renderList(); markStatus(fromDraft ? '已打开草稿' : '已打开');
  }
  function loadVal(d) { var v = load(K_VAL, {})[d.levelId]; return v && v.contentHash === LS.contentHash(d) && v.rulesetVersion === Core.RULESET ? v : (v ? Object.assign({ stale: true }, v) : null); }
  function saveVal(v) { var all = load(K_VAL, {}); all[E.draft.levelId] = v; store(K_VAL, all); }

  // ---------------------------------------------------------------- level list
  function allIds() { var ids = {}; Object.keys(CAT.levels).forEach(function (id) { ids[id] = 1; }); Object.keys(drafts()).forEach(function (id) { ids[id] = 1; }); return ids; }
  function uniqueId(base) { var ids = allIds(), i = 1, id = base; while (ids[id]) id = base + '_' + (++i); return id; }
  function badgeFor(id) {
    var d = drafts()[id], v = load(K_VAL, {})[id];
    if (!d && !v) return CAT.levels[id] ? ['内置', ''] : ['', ''];
    if (!v) return ['未校验', ''];
    var def = d ? JSON.parse(d.json) : CAT.levels[id], fresh = v.contentHash === LS.contentHash(def) && v.rulesetVersion === Core.RULESET;
    if (!fresh) return ['已过期', 'b-stale'];
    if (v.counts.error) return ['结构错误 ' + v.counts.error, 'b-err'];
    if (v.counts.block) return ['禁止发布 ' + v.counts.block, 'b-block'];
    return ['结构通过', 'b-ok'];
  }
  function renderList() {
    var el = $('list'), q = ($('search').value || '').toLowerCase(), D = drafts(); el.innerHTML = '';
    function item(id, name, group) {
      if (q && (id + ' ' + name).toLowerCase().indexOf(q) < 0) return;
      var d = document.createElement('div'); d.className = 'lv' + (E.draft && E.draft.levelId === id ? ' cur' : ''); d.dataset.id = id;
      var b = badgeFor(id), dr = D[id] ? ' ✎' : '';
      d.innerHTML = '<span>' + esc(name) + dr + '<br><span class="hint mono">' + esc(id) + '</span></span><span class="badge ' + b[1] + '">' + b[0] + '</span>';
      d.onclick = function () { openId(id); }; group.appendChild(d);
    }
    CAT.catalog.chapters.forEach(function (ch) {
      var h = document.createElement('h2'); h.textContent = ch.name || ch.chapterId; el.appendChild(h);
      ch.levels.forEach(function (id) { var dd = D[id] ? JSON.parse(D[id].json) : CAT.levels[id]; item(id, dd.displayName, el); });
    });
    var own = Object.keys(D).filter(function (id) { return !CAT.levels[id]; }).sort();
    var h2 = document.createElement('h2'); h2.textContent = '本地草稿（' + own.length + '）'; el.appendChild(h2);
    own.forEach(function (id) { item(id, JSON.parse(D[id].json).displayName, el); });
  }
  function openId(id) {
    if (E.dirty) saveDraft(true);
    var D = drafts();
    if (D[id]) { var r = LS.parse(D[id].json); if (r.ok) { open(r.def, D[id].base, true); return; } toast('草稿损坏：' + r.errors[0].msg); }
    if (CAT.levels[id]) open(LS.deep(CAT.levels[id]), null, false);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- board canvas
  var cv = $('board'), cx = cv.getContext('2d');
  cv.width = PAD + C * CELL + 8; cv.height = PAD + R * CELL + 8;
  function cellXY(r, c) { return { x: PAD + c * CELL, y: PAD + r * CELL }; }
  function draw() {
    if (!E.draft) return;
    var x = cx, d = E.draft, vU = $('vUnder').checked, vO = $('vOcc').checked;
    x.clearRect(0, 0, cv.width, cv.height);
    x.fillStyle = '#e9dcbd'; x.fillRect(PAD - 6, PAD - 6, C * CELL + 12, R * CELL + 12);
    for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) {
      var p = cellXY(r, c);
      if (!playable(r, c)) { x.fillStyle = '#6d5c44'; x.fillRect(p.x + 1, p.y + 1, CELL - 2, CELL - 2); x.strokeStyle = 'rgba(255,255,255,.15)'; x.beginPath(); x.moveTo(p.x + 6, p.y + 6); x.lineTo(p.x + CELL - 6, p.y + CELL - 6); x.stroke(); continue; }
      var cimg = IMG[(r + c) % 2 ? 'cell_cream' : 'cell_sage'];
      if (cimg.complete && cimg.naturalWidth) x.drawImage(cimg, p.x + 1, p.y + 1, CELL - 2, CELL - 2); else { x.fillStyle = (r + c) % 2 ? '#fbf3e1' : '#e8f0dc'; x.fillRect(p.x + 1, p.y + 1, CELL - 2, CELL - 2); }
      var u = placeAt(r, c, 'underlay'), o = placeAt(r, c, 'occupant');
      if (vU && u) ART.frosting(x, p.x + 2, p.y + 2, CELL - 4, u.layers, 0, vO && o ? 0.95 : 1);
      if (vO && o) {
        if (o.typeId === 'cookie_crate') ART.crate(x, p.x + 3, p.y + 3, CELL - 6, o.hp, 0, 1);
        else if (o.typeId === 'delivery_basket') ART.basket(x, p.x + 3, p.y + 3, CELL - 6, 0, 1);
        else {
          var im = IMG[o.typeId], s = CELL * 0.78;
          if (o.special === 'rainbow') { x.save(); x.globalAlpha = 0.9; specialMark(x, 'rainbow', p.x + 4, p.y + 4, CELL - 8); x.restore(); }
          else if (im && im.complete) x.drawImage(im, p.x + (CELL - s) / 2, p.y + (CELL - s) / 2, s, s);
          if (o.special && o.special !== 'rainbow') specialMark(x, o.special, p.x + 6, p.y + 6, CELL - 12);
          if (o.special) { x.fillStyle = '#b4573f'; x.font = '700 10px sans-serif'; x.textAlign = 'right'; x.fillText('夹具', p.x + CELL - 4, p.y + CELL - 5); }
        }
      } else if (vO && !o) { x.fillStyle = 'rgba(120,105,70,.35)'; x.font = '700 18px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', p.x + CELL / 2, p.y + CELL / 2 + (u && vU ? 0 : 0)); }
      var ov = placeAt(r, c, 'overlay'); if (ov && (!$('vOver') || $('vOver').checked)) ART.tie(x, p.x + 3, p.y + 3, CELL - 6, 0, 1);
      if (exitAt(r, c)) ART.exit(x, p.x + 3, p.y + 3, CELL - 6, 1);
      if (u && vU) { x.fillStyle = '#a0506a'; x.font = '700 10px sans-serif'; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillText('霜' + u.layers, p.x + 4, p.y + CELL - 5); }
    }
    if (!$('vBlocked') || $('vBlocked').checked) LS.blockedCells(d).forEach(function (q) {   // C: live cut-off-supply overlay (addendum 3.1)
      var p = cellXY(q[0], q[1]); x.save(); x.beginPath(); x.rect(p.x + 2, p.y + 2, CELL - 4, CELL - 4); x.clip();
      x.strokeStyle = 'rgba(214,138,40,.55)'; x.lineWidth = 3; x.beginPath(); for (var k = -CELL; k < CELL; k += 10) { x.moveTo(p.x + k, p.y + CELL); x.lineTo(p.x + k + CELL, p.y); } x.stroke();
      x.fillStyle = '#9a5a12'; x.font = '700 10px sans-serif'; x.textAlign = 'right'; x.textBaseline = 'top'; x.fillText('受阻', p.x + CELL - 4, p.y + 4); x.restore();
    });
    d.board.spawners.forEach(function (s) { var p = cellXY(s.row, s.col); ART.spawner(x, p.x + 4, p.y - 7, CELL - 8, 1); });
    if ($('vCoord').checked) {
      x.fillStyle = '#8a7d5c'; x.font = '600 11px ui-monospace,monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (var i = 0; i < C; i++) x.fillText('c' + i, PAD + i * CELL + CELL / 2, 10);
      for (var j = 0; j < R; j++) x.fillText('r' + j, 11, PAD + j * CELL + CELL / 2);
    }
    E.hl.forEach(function (h) { var p = cellXY(h[0], h[1]); x.strokeStyle = h[2] || '#d4605a'; x.lineWidth = 4; x.setLineDash([7, 4]); x.strokeRect(p.x + 3, p.y + 3, CELL - 6, CELL - 6); x.setLineDash([]); });
    if (E.sel) { var q = cellXY(E.sel[0], E.sel[1]); x.strokeStyle = '#3c7bd0'; x.lineWidth = 3; x.strokeRect(q.x + 1.5, q.y + 1.5, CELL - 3, CELL - 3); }
    if (E.rect) { var a = E.rect, r0 = Math.min(a.r0, a.r1), r1 = Math.max(a.r0, a.r1), c0 = Math.min(a.c0, a.c1), c1 = Math.max(a.c0, a.c1); var pa = cellXY(r0, c0); x.fillStyle = 'rgba(60,123,208,.18)'; x.fillRect(pa.x, pa.y, (c1 - c0 + 1) * CELL, (r1 - r0 + 1) * CELL); }
  }
  function cellFromEvent(e) {
    var b = cv.getBoundingClientRect(), sx = cv.width / b.width, x = (e.clientX - b.left) * sx - PAD, y = (e.clientY - b.top) * sx - PAD;
    var c = Math.floor(x / CELL), r = Math.floor(y / CELL); if (r < 0 || c < 0 || r >= R || c >= C) return null; return [r, c];
  }
  var down = false, lastCell = null;
  cv.addEventListener('pointerdown', function (e) {
    var cell = cellFromEvent(e); if (!cell) return; cv.setPointerCapture(e.pointerId); down = true; lastCell = null;
    if (E.mode === 'pick') { E.sel = cell; showProps(); draw(); down = false; return; }
    if (E.mode === 'rect') { E.rect = { r0: cell[0], c0: cell[1], r1: cell[0], c1: cell[1] }; draw(); return; }
    begin(); stroke(cell);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!down) return; var cell = cellFromEvent(e); if (!cell) return;
    if (E.mode === 'rect') { E.rect.r1 = cell[0]; E.rect.c1 = cell[1]; draw(); return; }
    stroke(cell);
  });
  function endPointer() {
    if (!down) return; down = false;
    if (E.mode === 'rect' && E.rect) {
      var a = E.rect; E.rect = null; begin();
      for (var r = Math.min(a.r0, a.r1); r <= Math.max(a.r0, a.r1); r++) for (var c = Math.min(a.c0, a.c1); c <= Math.max(a.c0, a.c1); c++) if (paintCell(r, c, E.tool)) E.stroke.changed = true;
      commit(); draw(); return;
    }
    commit();
  }
  cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
  function stroke(cell) {
    if (lastCell && lastCell[0] === cell[0] && lastCell[1] === cell[1]) return; lastCell = cell;
    if (paintCell(cell[0], cell[1], E.tool)) { E.stroke.changed = true; E.draft = LS.canonical(E.draft); draw(); }
    E.sel = cell; showProps();
  }
  function showProps() {
    if (!E.sel) return; var r = E.sel[0], c = E.sel[1], out = ['格 (' + r + ',' + c + ')' + (playable(r, c) ? '' : ' · 空洞 void')];
    out.push('地形/设施：' + (playable(r, c) ? '可玩格' : 'void') + (spawnerAt(r, c) ? ' + 出生口' : ''));
    var u = placeAt(r, c, 'underlay'), o = placeAt(r, c, 'occupant');
    out.push('地面层：' + (u ? '糖霜地垫 ' + u.layers + ' 层（最后一层消失才计 1 格目标）' : '—'));
    out.push('占据层：' + (o ? (o.typeId === 'cookie_crate' ? '饼干箱 ' + o.hp + ' HP（不可交换/掉落；邻接普通匹配或直接攻击每波 −1）' : (NAME[o.typeId] || o.typeId) + (o.special ? ' + ' + REG.specials[o.special].name + '（规则测试夹具）' : '') + '（固定）') : (playable(r, c) ? '按 seed 随机填充' : '—')));
    var ov = placeAt(r, c, 'overlay');
    if (o && o.typeId === 'delivery_basket') out[out.length - 1] = '占据层：送达果篮（不参与匹配、不能交换；随重力下落；免疫直接攻击；落到本段出口格时送达 +1）';
    out.push('覆盖层：' + (ov ? '软糖绑带 1 层（宿主不能交换/掉落/洗牌；宿主原地参与匹配或本格被直接攻击时解除，旁边三消不解除；按 1 个绑带计目标）' : '—'));
    if (exitAt(r, c)) out.push('设施：出口（本段最下端格；果篮落到这里即送达）');
    out.push('合法组合：糖霜可与果冻/果篮同格；地垫＋果冻＋绑带可同格（三层分别结算）；箱子格不能有糖霜或绑带；绑带不能盖箱子/果篮；void 上不能摆放任何对象。');
    $('props').textContent = out.join('\n');
  }

  // ---------------------------------------------------------------- settings form ↔ draft
  function syncForm() {
    var d = E.draft;
    $('fId').value = d.levelId; $('fName').value = d.displayName || ''; $('fChapter').value = d.chapterId || ''; $('fRev').textContent = 'r' + d.contentRevision + (d.contentRevision !== E.base.rev ? '（已修改，原 r' + E.base.rev + '）' : '');
    $('fMoves').value = d.moveLimit; var st = (d.scoring && d.scoring.stars) || [0, 0, 0]; $('fS1').value = st[0]; $('fS2').value = st[1]; $('fS3').value = st[2];
    $('fT0').value = d.tools.hammer; $('fT1').value = d.tools.swap; $('fT2').value = d.tools.shuffle;
    $('fIntent').value = (d.editorNotes && d.editorNotes.designIntent) || '';
    var g = $('goals'); g.innerHTML = '';
    d.goals.forEach(function (go, i) {
      var row = document.createElement('div'); row.className = 'row'; row.dataset.field = 'goals[' + i + ']';
      var types = Object.keys(REG.goals).map(function (k) { return '<option value="' + k + '"' + (k === go.type ? ' selected' : '') + (REG.goals[k].enabled ? '' : ' disabled') + '>' + REG.goals[k].name + (REG.goals[k].enabled ? '' : '（阶段' + REG.goals[k].stage + '）') + '</option>'; }).join('');
      var html = '<select data-k="type">' + types + '</select>';
      if (go.type === 'collect_piece') html += '<select data-k="typeId">' + TYPES.map(function (t) { return '<option value="' + t + '"' + (t === go.typeId ? ' selected' : '') + '>' + NAME[t] + '</option>'; }).join('') + '</select> ×<input data-k="count" type="number" min="1" value="' + go.count + '">';
      else {
        if (go.type === 'clear_obstacle') html += '<select data-k="typeId">' + REG.goals.clear_obstacle.typeIds.map(function (t) { return '<option value="' + t + '"' + (t === go.typeId ? ' selected' : '') + '>' + REG.obstacles[t].name + '</option>'; }).join('') + '</select>';
        html += '<select data-k="scope"><option value="all"' + (go.scope === 'all' ? ' selected' : '') + '>全部（开局摆放的）</option><option value="count"' + (go.scope === 'count' ? ' selected' : '') + '>指定数量</option></select>' + (go.scope === 'count' ? '<input data-k="count" type="number" min="1" value="' + (go.count || 1) + '">' : '');
      }
      html += '<button data-k="del" title="删除目标">✕</button>';
      row.innerHTML = html;
      row.addEventListener('change', function (e) {
        var k = e.target.dataset.k; edit(function () {
          var G = E.draft.goals[i];
          if (k === 'type') { var t = e.target.value; E.draft.goals[i] = t === 'collect_piece' ? { type: t, typeId: 'jelly_fugu', count: 12 } : { type: t, typeId: t === 'clear_underlay' ? 'frosting_pad' : t === 'deliver' ? 'delivery_basket' : 'cookie_crate', scope: 'all' }; }
          else if (k === 'typeId') G.typeId = e.target.value;
          else if (k === 'count') G.count = parseInt(e.target.value, 10) || 0;
          else if (k === 'scope') { G.scope = e.target.value; if (G.scope === 'count') G.count = G.count || 1; else delete G.count; }
        });
      });
      row.querySelector('[data-k=del]').onclick = function () { edit(function () { E.draft.goals.splice(i, 1); }); };
      g.appendChild(row);
    });
    $('bAddGoal').disabled = d.goals.length >= REG.limits.goals[1];
    var pool = $('pool'); pool.innerHTML = '';
    TYPES.forEach(function (t) {
      var p = d.spawnPool.filter(function (x) { return x.typeId === t; })[0], row = document.createElement('div'); row.className = 'row';
      row.innerHTML = '<label style="width:56px"><input type="checkbox"' + (p ? ' checked' : '') + '> ' + NAME[t] + '</label>' + (p ? '<input type="number" min="0" max="100" value="' + p.weight + '">' : '');
      row.addEventListener('change', function (e) {
        edit(function () {
          if (e.target.type === 'checkbox') { if (e.target.checked) E.draft.spawnPool.push({ typeId: t, weight: 1 }); else E.draft.spawnPool = E.draft.spawnPool.filter(function (x) { return x.typeId !== t; }); }
          else E.draft.spawnPool.forEach(function (x) { if (x.typeId === t) x.weight = parseInt(e.target.value, 10) || 0; });
        });
      });
      pool.appendChild(row);
    });
    $('seed').value = $('seed').value || 1;
  }
  function bindField(id, fn) { $(id).addEventListener('change', function (e) { var v = e.target.value; edit(function () { return fn(v); }); }); }
  bindField('fName', function (v) { E.draft.displayName = v; });
  bindField('fChapter', function (v) { E.draft.chapterId = v; });
  bindField('fMoves', function (v) { E.draft.moveLimit = parseInt(v, 10) || 0; });
  ['fS1', 'fS2', 'fS3'].forEach(function (id, i) { bindField(id, function (v) { E.draft.scoring = E.draft.scoring || { stars: [0, 0, 0] }; E.draft.scoring.stars[i] = parseInt(v, 10) || 0; }); });
  ['hammer', 'swap', 'shuffle'].forEach(function (k, i) { bindField('fT' + i, function (v) { E.draft.tools[k] = parseInt(v, 10) || 0; }); });
  bindField('fIntent', function (v) { E.draft.editorNotes = E.draft.editorNotes || {}; E.draft.editorNotes.designIntent = v; });
  $('fId').addEventListener('change', function (e) {   // rename = new stable id for a draft; duplicates refused
    var v = e.target.value.trim(), old = E.draft.levelId;
    if (!/^[a-z0-9_]+$/.test(v)) { toast('levelId 只能用小写字母、数字、下划线'); e.target.value = old; return; }
    if (v !== old && allIds()[v]) { toast('levelId 已存在：' + v); e.target.value = old; return; }
    if (CAT.levels[old]) { toast('内置关卡保持 levelId；要新 ID 请用“复制”'); e.target.value = old; return; }
    var all = drafts(); delete all[old]; store(K_DRAFTS, all);
    edit(function () { E.draft.levelId = v; }); saveDraft(true);
  });
  $('bAddGoal').onclick = function () { edit(function () { E.draft.goals.push({ type: 'collect_piece', typeId: 'jelly_bear', count: 10 }); }); };

  // ---------------------------------------------------------------- validation (same module the build uses)
  function runValidate() {
    var v = LS.validate(E.draft); v.at = new Date().toISOString(); E.val = v; saveVal({ contentHash: v.contentHash, rulesetVersion: v.rulesetVersion, counts: v.counts, at: v.at });
    E.draft.editorNotes = E.draft.editorNotes || {};
    renderIssues(); renderList(); return v;
  }
  function renderIssues() {
    var el = $('issues'), st = $('vState'), sum = $('vSummary'); el.innerHTML = ''; E.hl = [];
    [].forEach.call(document.querySelectorAll('.bad'), function (n) { n.classList.remove('bad'); });
    var v = E.val;
    if (!v) { st.textContent = '未校验'; st.className = 'badge'; sum.textContent = '编辑后结果失效，需要重新校验。'; draw(); return; }
    if (v.stale || !v.issues) { st.textContent = '已过期'; st.className = 'badge b-stale'; sum.textContent = '上次结果属于旧内容（' + (v.contentHash || '?') + '），请重新校验。'; draw(); return; }
    st.textContent = v.counts.error ? '结构错误' : v.counts.block ? '禁止发布' : '结构通过'; st.className = 'badge ' + (v.counts.error ? 'b-err' : v.counts.block ? 'b-block' : 'b-ok');
    sum.innerHTML = 'A 结构错误 ' + v.counts.error + ' · B 内容矛盾 ' + v.counts.block + ' · C 警告 ' + v.counts.warn + '<br>初始化模拟：' + (v.sim ? v.sim.initOk + '/' + v.sim.seeds + ' seed 成功，平均合法操作 ' + v.sim.avgLegalMoves : '未运行（有结构错误）') +
      '<br>内容 ' + v.contentHash + ' · ' + v.rulesetVersion + '<br><i>' + esc(v.note) + '</i>';
    v.issues.forEach(function (is) {
      var d = document.createElement('div'); d.className = 'issue ' + is.sev;
      d.innerHTML = '<b>' + { error: 'A 错误', block: 'B 禁止发布', warn: 'C 警告' }[is.sev] + '</b> ' + esc(is.msg) + '<br><small class="mono">' + is.code + (is.cells.length ? ' · 格 ' + is.cells.map(function (c) { return '(' + c[0] + ',' + c[1] + ')'; }).join(' ') : '') + (is.field ? ' · 字段 ' + is.field : '') + '</small>';
      d.onclick = function () { locate(is); };
      el.appendChild(d);
      is.cells.forEach(function (c) { E.hl.push([c[0], c[1], is.sev === 'warn' ? '#d99a2b' : '#d4605a']); });
    });
    draw();
  }
  function locate(is) {
    if (is.cells.length) { E.sel = is.cells[0]; E.hl = is.cells.map(function (c) { return [c[0], c[1], '#3c7bd0']; }); showProps(); draw(); }
    if (is.field) {
      var key = is.field.replace(/\[.*$/, ''), el = document.querySelector('[data-field="' + is.field + '"]') || document.querySelector('[data-field="' + key + '"]');
      if (el) { el.classList.add('bad'); el.scrollIntoView({ block: 'center' }); if (el.focus) el.focus(); }
    }
  }

  // ---------------------------------------------------------------- import / export (real files)
  $('bExport').onclick = function () {
    var txt = LS.serialize(E.draft), blob = new Blob([txt], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = E.draft.levelId + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    var v = E.val && !E.val.stale && E.val.issues ? E.val : null;
    toast('已导出 ' + a.download + (v ? (v.publishable ? '（结构通过）' : '（注意：校验未通过）') : '（未校验）'));
    if (E.base.fresh) { E.base = { rev: E.draft.contentRevision, hash: LS.contentHash(E.draft) }; saveDraft(true); }   // exported once → later edits create r+1
    window.__lastExport = txt;   // test hook
  };
  $('bImport').onclick = function () { $('fImport').value = ''; $('fImport').click(); };
  $('fImport').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { importText(String(rd.result), f.name); };
    rd.readAsText(f);
  });
  function importText(txt, name) {   // validate first; failure leaves the current draft untouched
    var r = LS.parse(txt);
    if (!r.ok) { toast('导入失败（' + name + '）：' + r.errors.map(function (x) { return x.msg; }).join('；'), 4000); return { ok: false, errors: r.errors }; }
    var D = drafts();
    if (D[r.def.levelId] && !confirm('已存在同 ID 草稿 ' + r.def.levelId + '，覆盖？')) return { ok: false, errors: [{ code: 'cancel' }] };
    if (E.dirty) saveDraft(true);
    open(r.def, { rev: r.def.contentRevision, hash: LS.contentHash(r.def) }, false);
    var v = runValidate(); toast('已导入 ' + r.def.levelId + ' · ' + (v.structuralOk ? '结构通过' : '有结构错误 ' + v.counts.error));
    return { ok: true, levelId: r.def.levelId };
  }

  // ---------------------------------------------------------------- playtest: real game in an iframe; draft snapshot restored on return
  var PT = { snap: null, token: 0, seed: 1, log: [] };
  function startPlaytest(seed) {
    var v = runValidate();
    if (!v.structuralOk) { toast('有 A 类结构错误，不能试玩（点击错误定位）', 3000); return false; }
    PT.snap = LS.serialize(E.draft); PT.seed = seed >>> 0; PT.token++; PT.log = []; PT.status = null;
    $('ptSeed').textContent = PT.seed; $('ptLog').innerHTML = ''; $('ptLast').textContent = '—'; $('ptState').textContent = '';
    $('pt').classList.add('open');
    var fr = $('ptFrame');
    if (!PT.loaded) { fr.src = 'index.html?playtest=1'; PT.loaded = true; }
    else sendLoad();
    return true;
  }
  function sendLoad() { var fr = $('ptFrame'); if (fr.contentWindow) fr.contentWindow.postMessage({ type: 'jelly_playtest_load', levelJson: PT.snap, seed: PT.seed, token: PT.token }, '*'); }
  function endPlaytest() {
    $('pt').classList.remove('open');
    var now = LS.serialize(E.draft), same = now === PT.snap;
    toast(same ? '已返回：草稿与试玩前完全一致 ✓（' + LS.contentHash(E.draft) + '）' : '警告：草稿与试玩前不一致！', 3000);
    window.__ptReturn = { same: same, hash: LS.contentHash(E.draft) };   // test hook
    // keep the iframe loaded (faster retry) but stop it from running a board in the background
    var fr = $('ptFrame'); fr.src = 'about:blank'; PT.loaded = false;
  }
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || !d.type) return;
    if (d.type === 'jelly_playtest_ready') sendLoad();
    else if (d.type === 'jelly_playtest_exit') endPlaytest();
    else if (d.type === 'jelly_playtest_error') toast('试玩加载失败：' + JSON.stringify(d.errors));
    else if (d.type === 'jelly_playtest_status') {
      if (d.token !== PT.token) return;   // a stale game instance — ignore
      PT.status = d;
      $('ptState').textContent = 'phase ' + d.phase + ' · 步数 ' + d.moves + ' · 分 ' + d.score + '\n目标 ' + d.goals.map(function (g) { return (g.typeId || g.type).replace('jelly_', '') + ' ' + g.progress + '/' + g.target; }).join(' · ') + '\n道具 锤' + d.tools.hammer + ' 换' + d.tools.swap + ' 排' + d.tools.shuffle + '\nhash ' + d.hash + ' · 操作 ' + d.log;
      $('ptState').style.whiteSpace = 'pre-line';
      if (d.lastEvent && d.kind === 'event') { $('ptLast').textContent = d.lastEvent; var li = document.createElement('div'); li.textContent = d.lastEvent; $('ptLog').prepend(li); PT.log.push(d.lastEvent); }
    }
  });
  $('ptSame').onclick = function () { $('ptFrame').contentWindow.postMessage({ type: 'jelly_playtest_restart', seed: PT.seed, token: ++PT.token }, '*'); $('ptLog').innerHTML = ''; };
  $('ptNew').onclick = function () { PT.seed = (Math.random() * 1e9) >>> 0; $('seed').value = PT.seed; $('ptSeed').textContent = PT.seed; $('ptFrame').contentWindow.postMessage({ type: 'jelly_playtest_restart', seed: PT.seed, token: ++PT.token }, '*'); $('ptLog').innerHTML = ''; };
  $('ptBack').onclick = endPlaytest;
  $('ptCopy').onclick = function () { try { navigator.clipboard.writeText(String(PT.seed)); toast('已复制 seed ' + PT.seed); } catch (e) { toast('seed ' + PT.seed); } };

  // ---------------------------------------------------------------- toolbar
  $('bUndo').onclick = undo; $('bRedo').onclick = redo; $('bSave').onclick = function () { saveDraft(false); };
  $('bValidate').onclick = function () { var v = runValidate(); toast(v.structuralOk ? (v.publishable ? '结构通过（不代表已证明可解）' : '结构通过，但有 B 类矛盾：禁止发布') : '有 ' + v.counts.error + ' 个结构错误'); };
  $('bPlay').onclick = function () { startPlaytest(parseInt($('seed').value, 10) || 0); };
  $('bSeedNew').onclick = function () { $('seed').value = (Math.random() * 1e9) >>> 0; };
  $('bNew').onclick = function () { if (E.dirty) saveDraft(true); var id = uniqueId('new_level'); var d = LS.blankLevel(id); open(d, { rev: 1, hash: LS.contentHash(d), fresh: true }, false); toast('已新建 ' + id); };
  $('bDup').onclick = function () {
    if (E.dirty) saveDraft(true);
    var d = LS.deep(E.draft), id = uniqueId(d.levelId.replace(/_copy(_\d+)?$/, '') + '_copy');
    d.levelId = id; d.contentRevision = 1; d.displayName = (d.displayName || '') + ' 副本'; d.chapterId = 'drafts';
    d.editorNotes = Object.assign({}, d.editorNotes, { validationStatus: 'draft_unvalidated' });
    open(d, { rev: 1, hash: LS.contentHash(d), fresh: true }, false); toast('已复制为 ' + id + '（新 levelId，修订从 r1 开始）');
  };
  $('bDel').onclick = function () {
    var id = E.draft.levelId, all = drafts(); if (!all[id]) { toast('当前不是本地草稿'); return; }
    if (!confirm('删除本地草稿 ' + id + '？（内置关卡不受影响）')) return;
    delete all[id]; store(K_DRAFTS, all); var first = CAT.catalog.chapters[0].levels[0]; E.dirty = false; openId(CAT.levels[id] ? id : first);
  };
  $('search').addEventListener('input', renderList);
  ['vUnder', 'vOcc', 'vOver', 'vCoord', 'vBlocked'].forEach(function (id) { $(id).addEventListener('change', draw); });
  $('autoSp').addEventListener('change', function () { if ($('autoSp').checked) edit(function () { var a = JSON.stringify(E.draft.board.spawners); E.draft.board.spawners = LS.autoSpawners(E.draft); return JSON.stringify(E.draft.board.spawners) !== a; }); });
  [].forEach.call(document.querySelectorAll('[data-mode]'), function (b) { b.onclick = function () { E.mode = b.dataset.mode; [].forEach.call(document.querySelectorAll('[data-mode]'), function (x) { x.className = x === b ? 'on' : ''; }); }; });
  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveDraft(false); }
  });
  window.addEventListener('beforeunload', function () { if (E.dirty) saveDraft(true); });

  // ---------------------------------------------------------------- test hooks (automation only)
  window.JellyEditor = {
    draft: function () { return LS.serialize(E.draft); }, contentHash: function () { return LS.contentHash(E.draft); },
    open: openId, select: function (layer, toolId) { E.layer = layer; renderPalette(); var p = paletteFor(layer).filter(function (x) { return x.id === toolId; })[0]; if (p) { E.tool = p; renderPalette(); } return !!p; },
    cellCenter: function (r, c) { var b = cv.getBoundingClientRect(), k = b.width / cv.width; return { x: b.left + (PAD + c * CELL + CELL / 2) * k, y: b.top + (PAD + r * CELL + CELL / 2) * k }; },
    validate: function () { var v = runValidate(); return { counts: v.counts, structuralOk: v.structuralOk, publishable: v.publishable, codes: v.issues.map(function (i) { return i.sev + ':' + i.code; }), sim: v.sim, contentHash: v.contentHash }; },
    importText: importText, playtest: startPlaytest, endPlaytest: endPlaytest, ptStatus: function () { return PT.status; }, ptLog: function () { return PT.log.slice(); },
    state: function () { return { levelId: E.draft.levelId, rev: E.draft.contentRevision, undo: E.undo.length, redo: E.redo.length, dirty: E.dirty, layer: E.layer, tool: E.tool && E.tool.id, hl: E.hl.length }; },
    undo: undo, redo: redo, save: function () { saveDraft(false); }, newLevel: function () { $('bNew').click(); return E.draft.levelId; }, duplicate: function () { $('bDup').click(); return E.draft.levelId; }
  };

  // ---------------------------------------------------------------- boot
  renderPalette();
  var cur = load(K_CUR, null), D0 = drafts();
  if (cur && (D0[cur] || CAT.levels[cur])) openId(cur); else openId(CAT.catalog.chapters.length ? CAT.catalog.chapters[0].levels[0] : (function () { var d = LS.blankLevel('new_level'); return d.levelId; })());
  if (!E.draft) { var bl = LS.blankLevel(uniqueId('new_level')); open(bl, null, false); }
})();
