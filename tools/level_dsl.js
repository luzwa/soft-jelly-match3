// Level-authoring DSL shared by tools/make_levels.js (stage A/B) and tools/make_levels_c.js (stage C formal levels).
'use strict';
const S = require('../js/level_schema.js'), Core = require('../js/rules_core.js');
const FULL = ['1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111'];
const T5 = ['jelly_squid', 'jelly_fugu', 'jelly_jellyfish', 'jelly_bear', 'jelly_fig'];
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
module.exports = { lvl, lvlB, board, F, X, J, TIE, K, AB, FULL, T5, topSpawners };
