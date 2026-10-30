/* Jelly Match-3 — player progress store v2 (stage C). Pure data functions + a tiny storage adapter; no DOM, no timers.
 * Namespace: 'jelly_m3_progress_v2' (editor drafts live under jelly_editor_v1:*, playtest never writes here).
 * Migration: reads 'jelly_m3_progress_v1' once if v2 is absent. v1 is never modified or deleted.
 *   v1 {v:1, cleared:{levelId:{cleared, best:{contentRevision, movesLeft, stars}}}} → v2 levels[levelId].cleared + .legacy
 *   (old stars / moves were measured on the pre-C0 score scale, so they are kept as legacy info only and never compared
 *   with jelly_score_v1 results — no fake "new record" against an old scoring version).
 * Records are keyed by stable levelId, then by recKey = scoreVersion|r<contentRevision>; each holds best (any) and
 * noTool (no off-board tools used) — only valid clears enter either.
 * Challenges: keyed by challengeId, then by the full fixed-condition configKey; only valid clears are ranked
 * (score desc, then movesLeft desc, else tie). Unfinished runs only count as attempts (+ best unfinished, never ranked). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JellyProgress = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KEY = 'jelly_m3_progress_v2', LEGACY_KEY = 'jelly_m3_progress_v1', VERSION = 2, KEEP = 10;
  function fresh() { return { v: VERSION, migratedFrom: null, levels: {}, challenges: {} }; }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function migrateV1(old) {
    var st = fresh(); st.migratedFrom = 1;
    if (isObj(old) && isObj(old.cleared)) Object.keys(old.cleared).forEach(function (id) {
      var e = old.cleared[id]; if (!isObj(e) || !e.cleared) return;
      st.levels[id] = { cleared: true, records: {}, legacy: isObj(e.best) ? { contentRevision: e.best.contentRevision, movesLeft: e.best.movesLeft, stars: e.best.stars, scoring: 'pre_C0' } : null };
    });
    return st;
  }
  // parse + validate; anything unknown or newer is refused (caller keeps the raw string untouched)
  function parse(raw) {
    if (raw == null) return { ok: true, state: null };
    var o; try { o = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'corrupt' }; }
    if (!isObj(o) || typeof o.v !== 'number') return { ok: false, reason: 'corrupt' };
    if (o.v > VERSION) return { ok: false, reason: 'newer_version' };
    if (o.v !== VERSION || !isObj(o.levels) || !isObj(o.challenges)) return { ok: false, reason: 'corrupt' };
    return { ok: true, state: o };
  }
  /* load(storage) → { state, source: 'v2'|'migrated_v1'|'fresh'|'readonly', reason?, writable }.
   * A corrupt or newer v2 blob is never overwritten: the store becomes read-only for this session (writable=false). */
  function load(storage) {
    var raw = null, rawOld = null;
    try { raw = storage.getItem(KEY); rawOld = storage.getItem(LEGACY_KEY); } catch (e) { return { state: fresh(), source: 'fresh', reason: 'storage_unavailable', writable: false }; }
    var p = parse(raw);
    if (!p.ok) return { state: fresh(), source: 'readonly', reason: p.reason, writable: false };
    if (p.state) return { state: p.state, source: 'v2', writable: true };
    if (rawOld != null) { var o = null; try { o = JSON.parse(rawOld); } catch (e) { o = null; } if (o && o.v === 1) return { state: migrateV1(o), source: 'migrated_v1', writable: true }; }
    return { state: fresh(), source: 'fresh', writable: true };
  }
  function save(storage, ld) { if (!ld.writable) return false; try { storage.setItem(KEY, JSON.stringify(ld.state)); return true; } catch (e) { return false; } }
  function recKey(scoreVersion, contentRevision) { return scoreVersion + '|r' + contentRevision; }
  function better(a, b) { return !b || a.score > b.score || (a.score === b.score && a.movesLeft > b.movesLeft); }   // a strictly better than b
  function slim(r) { return { score: r.score, movesLeft: r.movesLeft, stars: r.stars, maxCascade: r.maxCascade, maxStreak: r.maxStreak, assisted: !!r.assisted, seed: r.seed, at: r.at || null }; }
  /* recordLevel(state, run) — run = {levelId, contentRevision, scoreVersion, won, score, movesLeft, stars, maxCascade, maxStreak, assisted, seed, at}
   * → {cleared, firstClear, prevBest, isNewBest, delta, prevNoTool, isNewNoTool}. Losing never changes bests (attempt counted). */
  function recordLevel(st, run) {
    var L = st.levels[run.levelId] || (st.levels[run.levelId] = { cleared: false, records: {}, legacy: null });
    var k = recKey(run.scoreVersion, run.contentRevision), R = L.records[k] || (L.records[k] = { best: null, noTool: null, plays: 0, clears: 0 });
    R.plays++;
    var out = { cleared: L.cleared, firstClear: false, prevBest: R.best ? slim(R.best) : null, isNewBest: false, delta: null, prevNoTool: R.noTool ? slim(R.noTool) : null, isNewNoTool: false, recKey: k };
    if (!run.won) return out;
    R.clears++; if (!L.cleared) { L.cleared = true; out.firstClear = true; } out.cleared = true;
    var r = slim(run);
    if (better(r, R.best)) { out.isNewBest = true; out.delta = R.best ? r.score - R.best.score : null; R.best = r; }
    if (!run.assisted && better(r, R.noTool)) { out.isNewNoTool = true; R.noTool = r; }
    return out;
  }
  function levelView(st, levelId, scoreVersion, contentRevision) {
    var L = st.levels[levelId]; if (!L) return { cleared: false, best: null, noTool: null, legacy: null };
    var R = L.records[recKey(scoreVersion, contentRevision)];
    return { cleared: !!L.cleared, best: R && R.best, noTool: R && R.noTool, legacy: L.legacy || null, otherVersions: Object.keys(L.records).filter(function (k) { return k !== recKey(scoreVersion, contentRevision); }) };
  }
  // chapter flow: the first level of the ordered list is open; each next one opens when the previous is cleared
  function unlocked(st, orderedIds) { var u = {}; for (var i = 0; i < orderedIds.length; i++) { u[orderedIds[i]] = i === 0 || !!(st.levels[orderedIds[i - 1]] && st.levels[orderedIds[i - 1]].cleared); } return u; }
  // challenge ranking: score desc, then movesLeft desc; equal on both → tie (same rank). Time is never used.
  function cmpChallenge(a, b) { return b.score - a.score || b.movesLeft - a.movesLeft; }
  function rankList(list) { var out = [], rank = 0; list.forEach(function (r, i) { if (i === 0 || cmpChallenge(list[i - 1], r) !== 0) rank = i + 1; out.push({ rank: rank, rec: r, tie: (i > 0 && cmpChallenge(list[i - 1], r) === 0) || (i + 1 < list.length && cmpChallenge(list[i + 1], r) === 0) }); }); return out; }
  /* recordChallenge(state, cfg, run) — cfg.configKey fixes content/rules/score/rng versions + seed + initial config.
   * Only run.won && run.valid enter the ranked list. Returns {valid, rank, isNewBest, prevBest}. */
  function recordChallenge(st, cfg, run) {
    var C = st.challenges[cfg.challengeId] || (st.challenges[cfg.challengeId] = {});
    var E = C[cfg.configKey] || (C[cfg.configKey] = { clears: [], attempts: 0, bestUnfinished: null });
    E.attempts++;
    var valid = !!(run.won && run.valid);
    var prev = E.clears[0] ? slim(E.clears[0]) : null;
    if (!valid) { if (!run.won && (!E.bestUnfinished || run.score > E.bestUnfinished.score)) E.bestUnfinished = slim(run); return { valid: false, rank: null, isNewBest: false, prevBest: prev, reason: run.won ? 'invalid' : 'not_cleared' }; }
    var r = slim(run); E.clears.push(r);
    E.clears.sort(cmpChallenge);   // stable sort: an equal later run stays after the earlier one (displayed as a tie)
    var idx = E.clears.indexOf(r); if (E.clears.length > KEEP) E.clears.length = KEEP;
    var ranked = rankList(E.clears), rank = idx < E.clears.length ? ranked[idx].rank : null;
    return { valid: true, rank: rank, isNewBest: idx === 0 && (!prev || cmpChallenge(r, prev) < 0), prevBest: prev };
  }
  function challengeView(st, challengeId, configKey) {
    var C = st.challenges[challengeId], E = C && C[configKey];
    return E ? { ranked: rankList(E.clears), attempts: E.attempts, bestUnfinished: E.bestUnfinished, otherConfigs: Object.keys(C).filter(function (k) { return k !== configKey; }).length } : { ranked: [], attempts: 0, bestUnfinished: null, otherConfigs: C ? Object.keys(C).length : 0 };
  }
  return { KEY: KEY, LEGACY_KEY: LEGACY_KEY, VERSION: VERSION, KEEP: KEEP, fresh: fresh, parse: parse, load: load, save: save, migrateV1: migrateV1, recKey: recKey,
    recordLevel: recordLevel, levelView: levelView, unlocked: unlocked, cmpChallenge: cmpChallenge, rankList: rankList, recordChallenge: recordChallenge, challengeView: challengeView };
});
