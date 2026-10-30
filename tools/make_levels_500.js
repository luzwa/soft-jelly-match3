// 500 formal levels: zone 1 = existing make_levels_c.js (ch1–ch8, 50) + challenges;
// zones 2–10 = template families with seeded variation (Royal Match–style curve).
// Usage: node tools/make_levels_500.js && node tools/make_levels.js
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../js/level_schema.js');
const { lvlB } = require('./level_dsl.js');
const { LEVELS: C_LEVELS } = require('./make_levels_c.js');
const SRC = path.join(__dirname, '..', 'levels', 'src');

const P4 = { a: ['s', 'u', 'j', 'b'], b: ['u', 'j', 'b', 'f'], c: ['s', 'j', 'b', 'f'], d: ['s', 'u', 'b', 'f'] };
const P5 = ['s', 'u', 'j', 'b', 'f'];
const POOLN = { s: 'jelly_squid', u: 'jelly_fugu', j: 'jelly_jellyfish', o: 'jelly_octopus', b: 'jelly_bear', f: 'jelly_fig' };
const G = {
  collect: (t, n) => ({ type: 'collect_piece', typeId: POOLN[t], count: n }),
  frost: () => ({ type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }),
  crates: () => ({ type: 'clear_obstacle', typeId: 'cookie_crate', scope: 'all' }),
  ties: () => ({ type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }),
  deliver: () => ({ type: 'deliver', typeId: 'delivery_basket', scope: 'all' })
};
const R7 = '. . . . . . .';
const TITLES = [
  '糖霜回廊', '箱墙缺口', '绑带点阵', '果篮滑道', '沙漏腰', '双岛清扫', '阶梯下落', '窄道推进',
  '霜箱交织', '解绑开路', '快递挡板', '边角火力', '密霜牧场', '环箱花园', '十字枷', '三出口',
  '岛屿锚点', '阶梯糖霜', '棋盘箱', '礼品软糖', '综合试炼', '软糯喘息', '高压重组', '决策关',
  '走廊冲刺', '围栏拆解', '绑带迷宫', '果篮突围', '异形清场', '多目标夜'
];

function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/** Role pattern inside a 50-level zone (1-indexed idx). */
function roleFor(idx) {
  // teach openers
  if (idx === 1 || idx === 21) return 'teach';
  // challenges at map ends
  if (idx === 20 || idx === 40 || idx === 50) return 'challenge';
  // superhard: mid-late spikes
  if (idx === 15 || idx === 35) return 'superhard';
  // hard at RM-like offsets (and +20)
  const hardSet = new Set([5, 10, 15, 25, 30, 35, 45]);
  if (hardSet.has(idx) && idx !== 15 && idx !== 35) return 'hard';
  // relax after spikes: 6-7, 11-12, 16-18, 26-27, 31-32, 36-38, 46-48 + zone gift 49
  const relaxSet = new Set([6, 7, 11, 12, 16, 17, 18, 26, 27, 31, 32, 36, 37, 38, 46, 47, 48, 49]);
  if (relaxSet.has(idx)) return 'relax';
  return 'normal';
}

/** Move budget by zone (2–10) and role. */
function movesFor(zone, role) {
  const bands = {
    2: { normal: 27, hard: 28, superhard: 30, challenge: 30, relax: 30, teach: 28 },
    3: { normal: 26, hard: 28, superhard: 30, challenge: 30, relax: 30, teach: 28 },
    4: { normal: 25, hard: 26, superhard: 28, challenge: 28, relax: 28, teach: 26 },
    5: { normal: 24, hard: 26, superhard: 28, challenge: 28, relax: 28, teach: 26 },
    6: { normal: 23, hard: 24, superhard: 26, challenge: 26, relax: 26, teach: 24 },
    7: { normal: 22, hard: 24, superhard: 26, challenge: 26, relax: 26, teach: 24 },
    8: { normal: 24, hard: 25, superhard: 27, challenge: 28, relax: 28, teach: 26 },
    9: { normal: 23, hard: 25, superhard: 27, challenge: 28, relax: 27, teach: 25 },
    10: { normal: 22, hard: 24, superhard: 26, challenge: 28, relax: 26, teach: 24 }
  };
  const b = bands[zone] || bands[10];
  return b[role] || b.normal;
}

function density(zone, role) {
  // 0 soft … 1 max
  let d = (zone - 2) / 8; // 0..1 across z2–z10
  if (zone >= 8) d = Math.min(d, 0.82); // keep late zones tight but not brick walls
  if (role === 'relax' || role === 'teach') d *= 0.55;
  if (role === 'hard') d = Math.min(1, d + 0.15);
  if (role === 'superhard' || role === 'challenge') d = Math.min(1, d + 0.22);
  return clamp(d, 0.15, 1);
}

function useP4(zone, role, rnd) {
  if (role === 'relax') return rnd() < 0.65;
  if (role === 'teach') return rnd() < 0.35;
  return rnd() < 0.08;
}

function poolOf(rnd, p4) {
  if (!p4) return P5.slice();
  return P4[pick(rnd, ['a', 'b', 'c', 'd'])].slice();
}

// ---- grid helpers
function gridFull(fill) {
  const g = [];
  for (let r = 0; r < 7; r++) { g[r] = []; for (let c = 0; c < 7; c++) g[r][c] = fill || '.'; }
  return g;
}
function toRows(g) {
  return g.map(row => {
    if (row.length !== 7) throw new Error('row width ' + row.length);
    return row.join(' ');
  });
}
function playable(g, r, c) { return g[r][c] !== '#'; }
function setTok(g, r, c, tok) { if (r >= 0 && r < 7 && c >= 0 && c < 7 && g[r][c] !== '#') g[r][c] = tok; }
function appendMod(g, r, c, mod) {
  if (r < 0 || r > 6 || c < 0 || c > 6 || g[r][c] === '#') return;
  const t = g[r][c];
  if (t.indexOf(mod) >= 0) return;
  // avoid stacking invalid: crates/baskets can't take frosting in engine? frosting is underlay OK on jelly; crates can't be on frosting.
  // DSL allows Xn without ~ ; K without ~ typically. Skip frost on X/K.
  if (mod[0] === '~' && (t[0] === 'X' || t[0] === 'K')) return;
  if (mod === '^' && (t[0] === 'X' || t[0] === 'K')) return;
  g[r][c] = t + mod;
}

function applyMask(g, kind, rnd) {
  if (kind === 'full') return;
  if (kind === 'corners') {
    setTok(g, 0, 0, '#'); setTok(g, 0, 6, '#'); setTok(g, 6, 0, '#'); setTok(g, 6, 6, '#');
    return;
  }
  if (kind === 'hourglass') {
    const voidCells = [[1, 0], [1, 6], [2, 0], [2, 1], [2, 5], [2, 6], [3, 0], [3, 1], [3, 5], [3, 6], [4, 0], [4, 1], [4, 5], [4, 6], [5, 0], [5, 6]];
    voidCells.forEach(([r, c]) => { g[r][c] = '#'; });
    return;
  }
  if (kind === 'islands') {
    for (let c = 0; c < 7; c++) g[3][c] = '#';
    g[0][3] = '#'; g[6][3] = '#';
    return;
  }
  if (kind === 'stairs') {
    // left-heavy voids on lower-right / upper-left asymmetry
    const voids = [[0, 5], [0, 6], [1, 6], [5, 0], [6, 0], [6, 1]];
    voids.forEach(([r, c]) => { g[r][c] = '#'; });
    return;
  }
  if (kind === 'narrow') {
    for (let r = 0; r < 7; r++) {
      g[r][0] = '#'; g[r][1] = '#'; g[r][5] = '#'; g[r][6] = '#';
    }
    return;
  }
  if (kind === 'ring') {
    // soft: only four corners + mid-edge nibbles
    [[0, 0], [0, 6], [6, 0], [6, 6], [0, 3], [6, 3]].forEach(([r, c]) => { if (rnd() < 0.85) g[r][c] = '#'; });
  }
}

function scatterFrost(g, n, layer2Ratio, rnd) {
  const cells = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (playable(g, r, c) && g[r][c][0] !== 'X' && g[r][c][0] !== 'K') cells.push([r, c]);
  // shuffle
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
  const take = Math.min(n, cells.length);
  for (let i = 0; i < take; i++) {
    const [r, c] = cells[i];
    const layers = rnd() < layer2Ratio ? 2 : 1;
    appendMod(g, r, c, '~' + layers);
  }
}

function placeCrates(g, n, hp2Ratio, rnd) {
  const cells = [];
  for (let r = 1; r < 7; r++) for (let c = 0; c < 7; c++) if (playable(g, r, c) && g[r][c] === '.') cells.push([r, c]);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
  const take = Math.min(n, cells.length);
  for (let i = 0; i < take; i++) {
    const [r, c] = cells[i];
    const hp = rnd() < hp2Ratio ? 2 : 1;
    g[r][c] = 'X' + hp;
  }
}

function placeTies(g, n, rnd) {
  const cells = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    if (!playable(g, r, c)) continue;
    const t = g[r][c];
    if (t[0] === 'X' || t[0] === 'K') continue;
    cells.push([r, c]);
  }
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
  const take = Math.min(n, cells.length);
  for (let i = 0; i < take; i++) appendMod(g, cells[i][0], cells[i][1], '^');
}

function placeDelivery(g, baskets, rnd) {
  // choose distinct columns for baskets near top, exits on bottom of same cols
  const cols = [0, 1, 2, 3, 4, 5, 6].filter(c => playable(g, 6, c));
  for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
  const n = Math.min(baskets, cols.length);
  const used = cols.slice(0, n);
  used.forEach(c => {
    // find topmost playable in column for basket
    let br = -1;
    for (let r = 0; r <= 2; r++) if (playable(g, r, c) && g[r][c] === '.') { br = r; break; }
    if (br < 0) for (let r = 0; r < 5; r++) if (playable(g, r, c) && (g[r][c] === '.' || g[r][c].indexOf('~') >= 0) && g[r][c][0] !== 'X') { br = r; break; }
    if (br < 0) return;
    g[br][c] = 'K';
    // exit at bottom playable
    for (let r = 6; r >= 0; r--) {
      if (playable(g, r, c)) {
        if (g[r][c] === 'K') break; // shouldn't
        if (g[r][c].indexOf('!') < 0) g[r][c] = g[r][c] + '!';
        break;
      }
    }
  });
  return used.length;
}

function crateWallPattern(g, rnd, dens) {
  const row = 2 + Math.floor(rnd() * 3); // 2..4
  for (let c = 1; c <= 5; c++) if (playable(g, row, c) && g[row][c] === '.') g[row][c] = dens > 0.6 && rnd() < 0.35 ? 'X2' : 'X1';
  if (dens > 0.4) {
    for (let r = 1; r <= 5; r++) {
      if (playable(g, r, 1) && g[r][1] === '.' && rnd() < dens) g[r][1] = 'X1';
      if (playable(g, r, 5) && g[r][5] === '.' && rnd() < dens) g[r][5] = 'X1';
    }
  }
}

function frostingCorridor(g, rnd, dens) {
  const cols = dens > 0.5 ? [2, 3, 4] : [3];
  cols.forEach(c => {
    for (let r = 1; r <= 5; r++) {
      if (!playable(g, r, c)) continue;
      if (g[r][c][0] === 'X' || g[r][c][0] === 'K') continue;
      const lay = dens > 0.55 && (r === 2 || r === 4) ? 2 : 1;
      if (g[r][c].indexOf('~') < 0) g[r][c] = g[r][c] + '~' + lay;
    }
  });
}

function tieLattice(g, rnd, dens) {
  const step = dens > 0.6 ? 2 : 3;
  for (let r = 1; r <= 5; r += step) for (let c = 1; c <= 5; c += step) {
    if (playable(g, r, c) && g[r][c][0] !== 'X' && g[r][c][0] !== 'K') appendMod(g, r, c, '^');
  }
  if (dens > 0.45) {
    [[2, 3], [4, 3], [3, 2], [3, 4]].forEach(([r, c]) => appendMod(g, r, c, '^'));
  }
}

/** Choose template family + goals for a generated level. */
function buildLevel(zone, idx, globalNum) {
  const seed = zone * 10007 + idx * 97 + 20261031;
  const rnd = mulberry32(seed >>> 0);
  const role = roleFor(idx);
  const dens = density(zone, role);
  const moves = movesFor(zone, role);
  const p4 = useP4(zone, role, rnd);
  const pool = poolOf(rnd, p4);

  // template rotation by idx + zone
  const families = ['frosting_field', 'crate_wall', 'tie_lattice', 'delivery_lane', 'mask_hourglass', 'mask_islands', 'mask_stairs', 'mask_narrow', 'multi_mix', 'frost_crate'];
  // bias by zone theme
  const themeBias = {
    2: ['frosting_field', 'crate_wall', 'frost_crate', 'frosting_field'],
    3: ['tie_lattice', 'frosting_field', 'multi_mix', 'tie_lattice'],
    4: ['delivery_lane', 'crate_wall', 'delivery_lane', 'frost_crate'],
    5: ['mask_hourglass', 'mask_islands', 'mask_stairs', 'mask_narrow'],
    6: ['frost_crate', 'multi_mix', 'tie_lattice', 'crate_wall'],
    7: ['multi_mix', 'delivery_lane', 'frost_crate', 'tie_lattice'],
    8: ['mask_narrow', 'crate_wall', 'multi_mix', 'mask_hourglass'],
    9: ['multi_mix', 'delivery_lane', 'tie_lattice', 'frost_crate'],
    10: ['multi_mix', 'mask_narrow', 'delivery_lane', 'frost_crate']
  };
  const bias = themeBias[zone] || families;
  let family = bias[idx % bias.length];
  if (role === 'teach') family = bias[0];
  if (rnd() < 0.25) family = pick(rnd, bias);

  const g = gridFull('.');
  let maskKind = 'full';
  if (family === 'mask_hourglass') maskKind = 'hourglass';
  else if (family === 'mask_islands') maskKind = 'islands';
  else if (family === 'mask_stairs') maskKind = 'stairs';
  else if (family === 'mask_narrow') maskKind = 'narrow';
  else if (dens > 0.7 && rnd() < 0.35) maskKind = pick(rnd, ['corners', 'ring', 'stairs']);
  else if (dens > 0.4 && rnd() < 0.2) maskKind = 'corners';
  applyMask(g, maskKind, rnd);

  const layer2 = clamp(0.1 + dens * 0.55, 0.1, 0.7);
  const hp2 = clamp(0.05 + dens * 0.5, 0.05, 0.6);
  let goals = [];
  let intent = '';

  const frostN = Math.round(6 + dens * 14 + (role === 'challenge' ? 4 : 0));
  const crateN = Math.round(4 + dens * 12 + (role === 'superhard' ? 3 : 0));
  const tieN = Math.round(3 + dens * 10);
  const basketN = clamp(Math.round(1 + dens * 2.5 + (role === 'challenge' ? 1 : 0)), 1, 4);

  if (family === 'frosting_field') {
    frostingCorridor(g, rnd, dens);
    scatterFrost(g, frostN, layer2, rnd);
    if (dens > 0.4) placeCrates(g, Math.round(crateN * 0.45), hp2, rnd);
    goals = dens > 0.5 && rnd() < 0.5 ? [G.frost(), G.crates()] : [G.frost()];
    if (goals.length === 1 && rnd() < 0.35) goals.push(G.collect(pick(rnd, pool), Math.round(10 + dens * 10)));
    intent = '糖霜密度模板 zone' + zone + ' dens=' + dens.toFixed(2);
  } else if (family === 'crate_wall') {
    crateWallPattern(g, rnd, dens);
    placeCrates(g, crateN, hp2, rnd);
    if (dens > 0.35) scatterFrost(g, Math.round(frostN * 0.6), layer2 * 0.8, rnd);
    goals = dens > 0.4 ? [G.crates(), G.frost()] : [G.crates()];
    intent = '箱墙模板 zone' + zone;
  } else if (family === 'tie_lattice') {
    tieLattice(g, rnd, dens);
    placeTies(g, tieN, rnd);
    if (rnd() < 0.6) scatterFrost(g, Math.round(frostN * 0.7), layer2, rnd);
    if (rnd() < 0.45) placeCrates(g, Math.round(crateN * 0.5), hp2, rnd);
    goals = [G.ties()];
    if (rnd() < 0.55) goals.push(G.frost());
    else if (rnd() < 0.5) goals.push(G.crates());
    intent = '绑带网格 zone' + zone;
  } else if (family === 'delivery_lane') {
    placeDelivery(g, basketN, rnd);
    if (dens > 0.3) placeCrates(g, Math.round(crateN * 0.55), hp2, rnd);
    if (dens > 0.35) scatterFrost(g, Math.round(frostN * 0.55), layer2, rnd);
    if (dens > 0.5 && rnd() < 0.5) placeTies(g, Math.round(tieN * 0.4), rnd);
    goals = [G.deliver()];
    if (rnd() < 0.6) goals.push(G.frost());
    else if (rnd() < 0.5) goals.push(G.crates());
    intent = '送达走廊 zone' + zone + ' baskets~' + basketN;
  } else if (family.startsWith('mask_')) {
    scatterFrost(g, Math.round(frostN * 0.85), layer2, rnd);
    placeCrates(g, Math.round(crateN * 0.7), hp2, rnd);
    if (rnd() < 0.5) placeTies(g, Math.round(tieN * 0.5), rnd);
    if (family === 'mask_stairs' && rnd() < 0.55) {
      placeDelivery(g, Math.min(2, basketN), rnd);
      goals = [G.deliver(), G.frost()];
    } else if (rnd() < 0.4) goals = [G.frost(), G.crates(), G.ties()];
    else goals = [G.frost(), G.crates()];
    intent = '异形盘 ' + maskKind + ' zone' + zone;
  } else if (family === 'frost_crate') {
    scatterFrost(g, frostN, layer2, rnd);
    placeCrates(g, crateN, hp2, rnd);
    goals = [G.frost(), G.crates()];
    intent = '霜箱交织 zone' + zone;
  } else {
    // multi_mix
    scatterFrost(g, Math.round(frostN * 0.75), layer2, rnd);
    placeCrates(g, Math.round(crateN * 0.7), hp2, rnd);
    placeTies(g, Math.round(tieN * 0.65), rnd);
    const wantDeliver = zone >= 4 && rnd() < 0.45 + dens * 0.2;
    if (wantDeliver) placeDelivery(g, Math.min(3, basketN), rnd);
    goals = [];
    if (wantDeliver) goals.push(G.deliver());
    goals.push(G.frost());
    if (rnd() < 0.7) goals.push(G.crates());
    if (rnd() < 0.55) goals.push(G.ties());
    if (goals.length > 3) goals = goals.slice(0, 3); // schema hard max
    if (goals.length === 1) goals.push(G.crates());
    intent = '多目标混合 zone' + zone + ' goals=' + goals.length;
  }

  // ensure delivery goals have baskets+exits; if deliver goal but no K, add them
  const needDeliver = goals.some(x => x.type === 'deliver');
  let hasK = false, hasEx = false;
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    if (String(g[r][c]).indexOf('K') >= 0) hasK = true;
    if (String(g[r][c]).indexOf('!') >= 0) hasEx = true;
  }
  if (needDeliver && (!hasK || !hasEx)) placeDelivery(g, Math.max(2, basketN), rnd);

  // if crates goal but no crates, place some
  if (goals.some(x => x.typeId === 'cookie_crate')) {
    let n = 0;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (/^X\d/.test(g[r][c])) n++;
    if (n === 0) placeCrates(g, Math.max(4, Math.round(crateN * 0.5)), hp2, rnd);
  }
  if (goals.some(x => x.typeId === 'frosting_pad')) {
    let n = 0;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (String(g[r][c]).indexOf('~') >= 0) n++;
    if (n === 0) scatterFrost(g, Math.max(6, frostN), layer2, rnd);
  }
  if (goals.some(x => x.typeId === 'gummy_tie')) {
    let n = 0;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (String(g[r][c]).indexOf('^') >= 0) n++;
    if (n === 0) placeTies(g, Math.max(4, tieN), rnd);
  }

  // strip deliver goal if still no basket (safety)
  hasK = false;
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (String(g[r][c]).indexOf('K') >= 0) hasK = true;
  if (!hasK) goals = goals.filter(x => x.type !== 'deliver');
  if (!goals.length) goals = [G.frost()];
  if (goals.length > 3) goals = goals.slice(0, 3);

  // Playability guard: deliver + clear-all-ties (or 3 goals on hard) is often a brick wall for bots/players.
  const hasDeliverGoal = goals.some(x => x.type === 'deliver');
  if (hasDeliverGoal) {
    // ties may block lanes — keep as scenery, drop from goals
    goals = goals.filter(x => x.typeId !== 'gummy_tie');
    if (role === 'hard' || role === 'superhard' || role === 'challenge') goals = goals.slice(0, 2);
    // clear solid blockers on exit cells and open one cell under each basket column
    for (let c = 0; c < 7; c++) {
      let basketRow = -1;
      for (let r = 0; r < 7; r++) if (String(g[r][c]).indexOf('K') >= 0) basketRow = r;
      if (basketRow < 0) continue;
      for (let r = basketRow + 1; r < 7; r++) {
        if (g[r][c] === '#') continue;
        if (/^X\d/.test(g[r][c])) {
          // keep some challenge: only clear ~half of crates in the lane on non-relax
          if (role === 'relax' || role === 'teach' || rnd() < 0.55) g[r][c] = '.';
        }
      }
      // ensure exit cell is not a crate
      for (let r = 6; r >= 0; r--) {
        if (g[r][c] === '#') continue;
        if (/^X\d/.test(g[r][c])) g[r][c] = '.';
        if (String(g[r][c]).indexOf('!') < 0) g[r][c] = g[r][c] + '!';
        break;
      }
    }
  }
  if (!goals.length) goals = [G.frost()];

  const rows = toRows(g);
  const title = TITLES[(zone * 7 + idx * 3) % TITLES.length];
  const id = 'z' + String(zone).padStart(2, '0') + '_' + String(idx).padStart(2, '0');
  const chapter = 'z' + String(zone).padStart(2, '0');
  const name = globalNum + ' · ' + title;
  const tip = role === 'teach' ? '这区主题：' + title + '。先找好下手的缺口再铺开。' : undefined;

  const tools = role === 'superhard'
    ? { hammer: 2, swap: 2, shuffle: 2 }
    : role === 'relax' ? { hammer: 3, swap: 3, shuffle: 3 } : { hammer: 3, swap: 3, shuffle: 3 };

  return {
    id, name, chapter, moves, pool, goals, rows, role, tip,
    intent: intent + ' | role=' + role + ' | seed=' + seed,
    tools, diff: role === 'superhard' ? 'superhard' : role === 'hard' || role === 'challenge' ? 'hard' : role === 'relax' ? 'easy' : 'normal'
  };
}

const L = [];
function addGen(o) {
  const pool = o.pool || P5;
  const d = lvlB({
    id: o.id, name: o.name, chapter: o.chapter, moves: o.moves, goals: o.goals, rows: o.rows,
    fillPool: pool, pool: pool.map(t => POOLN[t].slice(6)),
    stars: [8000, 14000, 20000], intent: o.intent, diff: o.diff || 'unrated',
    vs: 'structure_checked_unplaytested', tools: o.tools
  });
  d.spawnPool = pool.map(t => ({ typeId: POOLN[t], weight: 1 }));
  d.editorNotes.chapterRole = o.role || 'normal';
  if (o.tip) d.editorNotes.playerTip = o.tip;
  d.editorNotes.zone = o.chapter;
  d.editorNotes.curve = 'royal_match_500_v1';
  L.push(S.canonical(d));
}

// ---- Zone 1: port existing formal (not challenges)
const formalC = C_LEVELS.filter(d => d.chapterId !== 'challenges');
const challenges = C_LEVELS.filter(d => d.chapterId === 'challenges');
if (formalC.length !== 50) {
  console.warn('expected 50 formal from make_levels_c, got', formalC.length);
}
formalC.forEach(d => {
  const copy = JSON.parse(JSON.stringify(d));
  copy.editorNotes = Object.assign({}, copy.editorNotes, { curve: 'royal_match_500_v1', zone: 'z01', zoneSource: 'make_levels_c' });
  L.push(S.canonical(copy));
});

// ---- Zones 2–10
for (let zone = 2; zone <= 10; zone++) {
  for (let idx = 1; idx <= 50; idx++) {
    const globalNum = (zone - 1) * 50 + idx;
    try {
      addGen(buildLevel(zone, idx, globalNum));
    } catch (e) {
      console.error('FAIL', zone, idx, e.message);
      // fallback safe frosting level
      addGen({
        id: 'z' + String(zone).padStart(2, '0') + '_' + String(idx).padStart(2, '0'),
        name: globalNum + ' · 后备糖霜',
        chapter: 'z' + String(zone).padStart(2, '0'),
        moves: movesFor(zone, 'normal'),
        pool: P5, goals: [G.frost()], role: 'normal',
        rows: [R7, R7, '. .~1 .~1 .~1 .~1 .', '. .~1 .~2 .~1 .~1 .', '. .~1 .~1 .~1 .~1 .', R7, R7],
        intent: 'fallback after error: ' + e.message
      });
    }
  }
}

// challenges
challenges.forEach(d => L.push(S.canonical(JSON.parse(JSON.stringify(d)))));

module.exports = { LEVELS: L, FORMAL_ZONES: ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'z02', 'z03', 'z04', 'z05', 'z06', 'z07', 'z08', 'z09', 'z10'] };

if (require.main === module) {
  const out = process.argv[2] || SRC;
  // remove previous generated z0*.json so orphans don't linger; keep verify/legacy
  if (fs.existsSync(out)) {
    fs.readdirSync(out).filter(f => /^z\d{2}_\d{2}\.json$/.test(f)).forEach(f => fs.unlinkSync(path.join(out, f)));
  }
  L.forEach(d => fs.writeFileSync(path.join(out, d.levelId + '.json'), S.serialize(d)));
  const formal = L.filter(d => d.chapterId !== 'challenges');
  console.log('wrote', L.length, 'json (formal', formal.length + ', challenges', L.length - formal.length + ') to', out);
}
