// Stage A end-to-end flow (real browser, real mouse on the editor canvas):
// 编辑关卡 → 设置目标 → 校验(含错误定位) → 导出真实文件 → 正式游戏加载同一份 JSON 并通关 → 编辑器试玩(同 seed 重试) → 返回未被修改的草稿
// usage: node tests/e2e_stageA.js [baseDir-url] [outDir]     (default: file:// of this folder; needs playwright-core + Chrome)
'use strict';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const PW = process.env.PW || '/workspace/jelly/test/node_modules/playwright-core';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
const BASE = (process.argv[2] || ('file://' + ROOT)).replace(/\/$/, '');
const OUT = process.argv[3] || '/workspace/jelly/shots_v3a';
const VID = path.join(OUT, 'video_tmp'); fs.mkdirSync(VID, { recursive: true });
const results = []; let shotN = 0;
function ok(name, cond, info) { results.push({ name, ok: !!cond, info: info === undefined ? '' : info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, recordVideo: { dir: VID, size: { width: 1440, height: 900 } } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  pg.on('dialog', d => d.accept());
  const shot = async (name) => { const f = path.join(OUT, String(++shotN).padStart(2, '0') + '_' + name + '.png'); await pg.screenshot({ path: f }); };
  const W = ms => pg.waitForTimeout(ms);
  const caption = async (t) => pg.evaluate(t => {   // on-screen caption for the video (outside the game canvas)
    let el = document.getElementById('__cap'); if (!el) { el = document.createElement('div'); el.id = '__cap'; el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99;background:rgba(30,26,20,.85);color:#ffe9b0;font:600 18px/1.4 sans-serif;padding:8px 18px;border-radius:12px;pointer-events:none;max-width:90vw;text-align:center'; document.body.appendChild(el); }
    el.textContent = t;
  }, t);

  // ---- 0. a fake player progress record that must survive untouched
  await pg.goto(BASE + '/editor.html'); await W(800);
  const PROG = JSON.stringify({ v: 1, cleared: { legacy_01: { cleared: true, best: { contentRevision: 1, movesLeft: 7, stars: 2 } } } });
  await pg.evaluate(p => { localStorage.clear(); localStorage.setItem('jelly_m3_progress_v1', p); }, PROG);
  await pg.reload(); await W(1000);
  await caption('① 编辑器（file:// 打开）：新建关卡');
  const id = await pg.evaluate(() => JellyEditor.newLevel()); await W(500);
  ok('editor: new level', /^new_level/.test(id), id);

  // ---- 1. layered painting with the real mouse (one drag = one undo step)
  const C = async (r, c) => pg.evaluate(([r, c]) => JellyEditor.cellCenter(r, c), [r, c]);
  const drag = async (cells) => { let p = await C(cells[0][0], cells[0][1]); await pg.mouse.move(p.x, p.y); await pg.mouse.down(); for (const [r, c] of cells.slice(1)) { p = await C(r, c); await pg.mouse.move(p.x, p.y, { steps: 4 }); await W(60); } await pg.mouse.up(); await W(150); };
  const pick = async (layer, tool) => { await pg.click(`#layerBtns [data-layer="${layer}"]`); await pg.click(`#pal [data-tool="${tool}"]`); await W(150); };
  await caption('② 地形层：挖出空洞（出生口随段顶端自动更新）');
  await pick('terrain', 'cell_off'); await drag([[3, 0], [3, 1]]); await drag([[3, 5], [3, 6]]);
  await caption('③ 地面层：拖动铺 2 层 / 1 层糖霜');
  await pick('underlay', 'frosting_pad:2'); await drag([[6, 2], [6, 3], [6, 4]]);
  await pick('underlay', 'frosting_pad:1'); await drag([[5, 3]]);
  await caption('④ 占据层：放饼干箱（HP 1–3）与固定果冻');
  await pick('occupant', 'cookie_crate:2'); await drag([[4, 1]]);
  await pick('occupant', 'cookie_crate:1'); await drag([[4, 5]]);
  await pick('occupant', 'cookie_crate:3'); await drag([[2, 3]]);
  await shot('editor_painted');
  // refused combination: crate on frosting
  await pick('occupant', 'cookie_crate:1'); const before = await pg.evaluate(() => JellyEditor.draft()); await drag([[6, 3]]);
  ok('editor: crate on frosting refused at placement', before === await pg.evaluate(() => JellyEditor.draft()), await pg.textContent('#toast'));
  await W(400);
  // undo / redo a stroke
  await pick('occupant', 'jelly:jelly_bear'); const preStroke = await pg.evaluate(() => JellyEditor.draft());
  await drag([[0, 2], [0, 3], [0, 4]]);
  const u0 = await pg.evaluate(() => JellyEditor.state()), postStroke = await pg.evaluate(() => JellyEditor.draft());
  await pg.click('#bUndo'); await W(200); const afterUndo = await pg.evaluate(() => JellyEditor.draft());
  await pg.click('#bRedo'); await W(200); const afterRedo = await pg.evaluate(() => JellyEditor.draft());
  const bears = t => (t.match(/jelly_bear"/g) || []).length;
  ok('editor: one 3-cell drag = one undo step; undo/redo exact', afterUndo === preStroke && afterRedo === postStroke && bears(postStroke) - bears(preStroke) === 3, u0);
  await pg.click('#bUndo'); await W(200);   // keep the board random-filled at the top

  // ---- 2. goals + moves via the form
  await caption('⑤ 设置目标与步数（清糖霜 + 开箱子），道具数量');
  await pg.selectOption('#goals [data-field="goals[0]"] [data-k=type]', 'clear_underlay'); await W(200);
  await pg.click('#bAddGoal'); await W(200);
  await pg.selectOption('#goals [data-field="goals[1]"] [data-k=type]', 'clear_obstacle'); await W(200);
  await pg.fill('#fName', 'E2E 演示关'); await pg.press('#fName', 'Tab');
  await pg.fill('#fT0', '9'); await pg.press('#fT0', 'Tab');
  await pg.fill('#fMoves', '0'); await pg.press('#fMoves', 'Tab'); await W(300);

  // ---- 3. validation with error location, then fix
  await caption('⑥ 校验：步数 0 → A 类结构错误，点击定位到字段');
  await pg.click('#bValidate'); await W(400);
  let v = await pg.evaluate(() => JellyEditor.validate());
  ok('validate: moves=0 caught as structural error', !v.structuralOk && v.codes.includes('error:moves'), v.codes);
  await pg.click('#issues .issue.error'); await W(400);
  ok('validate: clicking the issue highlights the field', await pg.evaluate(() => document.getElementById('fMoves').classList.contains('bad')));
  await shot('editor_validation_error');
  await pg.fill('#fMoves', '25'); await pg.press('#fMoves', 'Tab'); await W(200);
  const stale = await pg.textContent('#vState');
  ok('validate: editing invalidates the previous result', /未校验|已过期/.test(stale), stale);
  await caption('⑦ 修正后重新校验：结构通过（≠ 已证明可解）');
  await pg.click('#bValidate'); await W(500);
  v = await pg.evaluate(() => JellyEditor.validate());
  ok('validate: fixed level passes structure check', v.structuralOk && v.publishable, { codes: v.codes, sim: v.sim });
  await shot('editor_validation_ok');
  await pg.click('#bSave'); await W(300);

  // ---- 4. export a real file
  await caption('⑧ 导出真实 JSON 文件（Blob 下载）');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#bExport')]);
  const expPath = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(expPath);
  const exported = fs.readFileSync(expPath, 'utf8'), draftTxt = await pg.evaluate(() => JellyEditor.draft());
  ok('export: downloaded file == canonical draft', exported === draftTxt, path.basename(expPath) + ' ' + exported.length + ' bytes');
  const draftHash = await pg.evaluate(() => JellyEditor.contentHash());
  // re-import (lossless) — and a broken file must not damage the draft
  const rt = await pg.evaluate(t => { const r = JellyEditor.importText(t, 'roundtrip.json'); return [r.ok, JellyEditor.draft() === t]; }, exported);
  ok('import: re-import of the export is lossless', rt[0] && rt[1]);
  const bad = await pg.evaluate(t => { const r = JellyEditor.importText(t, 'broken.json'); return [r.ok, JellyEditor.draft()]; }, exported.replace('"schemaVersion": 1', '"schemaVersion": 99'));
  ok('import: newer-schema file refused, draft untouched', !bad[0] && bad[1] === exported);
  await W(600);

  // ---- 5. the real game loads the same JSON and is won
  await caption('⑨ 正式游戏（file://）载入导出的同一份 JSON');
  await pg.goto(BASE + '/index.html?dev=1&q=high'); await pg.waitForFunction(() => window.JellyDebug && JellyDebug.state().phase === 'ready', null, { timeout: 30000 });
  await pg.setInputFiles('#__noexist', []).catch(() => { });
  await pg.setInputFiles('input.lf', expPath);
  await pg.waitForFunction(id => JellyDebug.state().levelId === id && JellyDebug.state().phase === 'ready', id, { timeout: 20000 });
  const g0 = await pg.evaluate(() => ({ s: JellyDebug.state(), c: JellyDebug.core() }));
  const sameHash = await pg.evaluate(t => JellyLevelSchema.contentHash(JellyLevelSchema.parse(t).def), exported);
  ok('game: loaded the exported level (same levelId + contentHash)', g0.s.levelId === id && sameHash === draftHash && g0.s.source === 'file', { levelId: g0.s.levelId, seed: g0.s.seed, hash: sameHash });
  ok('game: goals from the file', JSON.stringify(g0.c.goals.map(g => g.type)) === JSON.stringify(['clear_underlay', 'clear_obstacle']), g0.c.goals);
  await W(800); await shot('game_loaded_export');
  // invalid actions do not cost anything
  const inv = await pg.evaluate(() => { const c0 = JellyDebug.core(); const h = JellyDebug.hammer(3, 0); return { h, c1: JellyDebug.core(), c0 }; });
  await W(400);
  ok('game: hammer on a void cell is refused (no tool spent)', inv.c1.tools.hammer === inv.c0.tools.hammer && inv.c1.hash === inv.c0.hash, inv.c1.tools);
  await pg.evaluate(() => JellyDebug.setTimeScale(1));
  await caption('⑩ 正式游戏中通关：交换消除 + 小锤敲箱子/糖霜（真实核心 + 真实表现）');
  for (let i = 0; i < 60; i++) {
    const s = await pg.evaluate(() => JellyDebug.state()); if (s.phase === 'result') break;
    if (s.phase !== 'ready') { await W(250); continue; }
    const c = await pg.evaluate(() => JellyDebug.core());
    if (i < 3) { const m = await pg.evaluate(() => JellyDebug.findMove()); if (m) { await pg.evaluate(m => JellyDebug.swap(m[0][0], m[0][1], m[1][0], m[1][1]), m); await W(900); if (i === 1) await shot('game_cascade'); continue; } }
    const target = await pg.evaluate(() => { const v = JellyDebug.core().view; for (let r = 0; r < 7; r++) { const t = v[r].split(' '); for (let c = 0; c < 7; c++) if (/^X/.test(t[c]) || /~/.test(t[c])) return [r, c]; } return null; });
    if (target && c.tools.hammer > 0) { await pg.evaluate(t => JellyDebug.hammer(t[0], t[1]), target); await W(1000); }
    else {   // no hammer left: pick the legal swap closest to a remaining obstacle (a human would aim too)
      const m = await pg.evaluate(() => {
        const v = JellyDebug.core().view, T = []; for (let r = 0; r < 7; r++) { const t = v[r].split(' '); for (let c = 0; c < 7; c++) if (/^X/.test(t[c]) || /~/.test(t[c])) T.push([r, c]); }
        let best = null, bd = 1e9; JellyDebug.moves().forEach(m => { const d = Math.min(...T.map(t => Math.min(Math.abs(t[0] - m[0]) + Math.abs(t[1] - m[1]), Math.abs(t[0] - m[2]) + Math.abs(t[1] - m[3])))); if (d < bd) { bd = d; best = m; } });
        return best ? [[best[0], best[1]], [best[2], best[3]]] : null; });
      if (!m) break; await pg.evaluate(m => JellyDebug.swap(m[0][0], m[0][1], m[1][0], m[1][1]), m); await W(900);
    }
  }
  await pg.waitForFunction(() => JellyDebug.state().phase === 'result', null, { timeout: 20000 }).catch(() => { });
  await W(1800);
  const gEnd = await pg.evaluate(() => ({ s: JellyDebug.state(), c: JellyDebug.core(), vc: JellyDebug.visualCheck(), prog: localStorage.getItem('jelly_m3_progress_v1') }));
  ok('game: exported level won in the real game', gEnd.s.result && gEnd.s.result.win && gEnd.c.phase === 'won', { result: gEnd.s.result, goals: gEnd.c.goals, moves: gEnd.c.moves });
  ok('game: presentation mirrors the core (visualCheck)', gEnd.vc.length === 0, gEnd.vc);
  ok('game: a loaded file does not write player progress', gEnd.prog === PROG);
  await shot('game_won_export');
  // restart epoch: a restart in the middle of a cascade — old callbacks must not touch the new board
  await caption('⑪ 重开防护：连锁进行中重开，旧回调不能修改新棋盘');
  await pg.evaluate(() => JellyDebug.restart(true)); await pg.waitForFunction(() => JellyDebug.state().phase === 'ready', null, { timeout: 20000 });
  const fresh = await pg.evaluate(() => JellyDebug.core().hash);
  const ep = await pg.evaluate(() => { const m = JellyDebug.findMove(); JellyDebug.swap(m[0][0], m[0][1], m[1][0], m[1][1]); return JellyDebug.epoch(); });
  await W(120); await pg.evaluate(() => JellyDebug.restart(true));
  await W(4500);
  const rs = await pg.evaluate(() => ({ hash: JellyDebug.core().hash, vc: JellyDebug.visualCheck(), ep: JellyDebug.epoch(), st: JellyDebug.state() }));
  ok('restart mid-cascade: new board equals a fresh same-seed board; visuals in sync', rs.hash === fresh && rs.vc.length === 0 && rs.ep > ep && rs.st.moves === 25, { fresh, now: rs.hash, vc: rs.vc });

  // ---- 6. back to the editor: real playtest, same-seed retry, return to the untouched draft
  await caption('⑫ 回到编辑器：草稿仍在（localStorage 草稿命名空间）');
  await pg.goto(BASE + '/editor.html'); await W(1200);
  const back = await pg.evaluate(() => ({ d: JellyEditor.draft(), s: JellyEditor.state() }));
  ok('editor: draft restored after leaving the page', back.d === exported, back.s);
  await pg.fill('#seed', '424242'); await pg.press('#seed', 'Tab');
  await caption('⑬ 试玩：同一核心 + 正式表现，显示最近一条伤害/目标事件');
  await pg.click('#bPlay');
  const fr = await (async () => { for (let i = 0; i < 60; i++) { const f = pg.frames().find(f => /playtest=1/.test(f.url())); if (f) { try { if (await f.evaluate(() => window.JellyDebug && JellyDebug.state().phase === 'ready' && JellyDebug.state().source === 'playtest')) return f; } catch (e) { } } await W(250); } return null; })();
  ok('playtest: iframe running the draft', !!fr);
  const p0 = await fr.evaluate(() => ({ s: JellyDebug.state(), c: JellyDebug.core() }));
  ok('playtest: same level + requested seed', p0.s.levelId === id && p0.s.seed === 424242 && p0.s.mode === 'playtest', { levelId: p0.s.levelId, seed: p0.s.seed });
  await fr.evaluate(() => JellyDebug.setTimeScale(1));
  const m1 = await fr.evaluate(() => JellyDebug.findMove()); await fr.evaluate(m => JellyDebug.swap(m[0][0], m[0][1], m[1][0], m[1][1]), m1); await W(2500);
  const tgt = await fr.evaluate(() => { const v = JellyDebug.core().view; for (let r = 0; r < 7; r++) { const t = v[r].split(' '); for (let c = 0; c < 7; c++) if (/^X/.test(t[c])) return [r, c]; } return null; });
  if (tgt) { await fr.evaluate(t => JellyDebug.hammer(t[0], t[1]), tgt); await W(2200); }
  const p1 = await pg.evaluate(() => ({ st: JellyEditor.ptStatus(), log: JellyEditor.ptLog() }));
  ok('playtest: editor shows live status + last damage/goal event', p1.st && p1.st.log >= 2 && p1.log.length >= 1, { last: p1.log[p1.log.length - 1], moves: p1.st && p1.st.moves });
  await shot('playtest_events');
  const h1 = await fr.evaluate(() => JellyDebug.core().hash);
  await caption('⑭ 同 seed 重试：开局与第一次完全相同');
  await pg.click('#ptSame'); await W(3500);
  const p2 = await fr.evaluate(() => ({ c: JellyDebug.core(), s: JellyDebug.state() }));
  ok('playtest: same-seed retry reproduces the start state', p2.c.hash === p0.c.hash && p2.s.seed === 424242 && p2.c.log === 0, { start: p0.c.hash, retry: p2.c.hash, afterPlay: h1 });
  // same inputs again → same result hash (determinism inside the real game)
  await fr.evaluate(m => JellyDebug.swap(m[0][0], m[0][1], m[1][0], m[1][1]), m1); await W(2500);
  if (tgt) { await fr.evaluate(t => JellyDebug.hammer(t[0], t[1]), tgt); await W(2200); }
  const h2 = await fr.evaluate(() => JellyDebug.core().hash);
  ok('playtest: same seed + same inputs → identical core hash', h2 === h1, { h1, h2 });
  await shot('playtest_retry');
  await caption('⑮ 返回编辑器：草稿与试玩前一致，玩家进度未变');
  await pg.click('#ptBack'); await W(1200);
  const ret = await pg.evaluate(() => ({ r: window.__ptReturn, d: JellyEditor.draft(), prog: localStorage.getItem('jelly_m3_progress_v1'), keys: Object.keys(localStorage).sort() }));
  ok('return: draft identical to the pre-playtest snapshot', ret.r && ret.r.same && ret.d === exported, ret.r);
  ok('return: player progress untouched; editor data only under jelly_editor_v1:*', ret.prog === PROG && ret.keys.every(k => k === 'jelly_m3_progress_v1' || k.startsWith('jelly_editor_v1:') || k === 'jelly_m3_v2_settings'), ret.keys);
  await shot('editor_after_return');
  await W(1500);

  // ---- 7. rule-level determinism across quality tiers (same level/seed/inputs, q=high vs q=low)
  const hashes = [];
  for (const q of ['high', 'low']) {
    const p = await ctx.newPage();
    await p.goto(BASE + '/index.html?q=' + q + '&level=verify_04_overlap_dedupe&seed=3'); await p.waitForFunction(() => window.JellyDebug && JellyDebug.state().phase === 'ready', null, { timeout: 30000 });
    await p.evaluate(() => JellyDebug.swap(4, 3, 4, 4)); await p.waitForFunction(() => JellyDebug.state().phase === 'ready', null, { timeout: 30000 });
    const m = await p.evaluate(() => JellyDebug.findMove()); await p.evaluate(m => JellyDebug.swap(m[0][0], m[0][1], m[1][0], m[1][1]), m); await p.waitForFunction(() => JellyDebug.state().phase === 'ready', null, { timeout: 30000 });
    hashes.push(await p.evaluate(() => [JellyDebug.tier(), JellyDebug.core().hash])); await p.close();
  }
  ok('tiers: q=high and q=low give the same logical result', hashes[0][1] === hashes[1][1], hashes);
  ok('no page errors', errs.length === 0, errs);

  await pg.close(); await ctx.close(); await browser.close();
  // video → mp4
  const webm = fs.readdirSync(VID).filter(f => f.endsWith('.webm')).map(f => path.join(VID, f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  if (webm) { execSync(`ffmpeg -y -loglevel error -i "${webm}" -c:v libx264 -pix_fmt yuv420p -crf 26 -preset veryfast -movflags +faststart "${path.join(OUT, 'stageA_flow.mp4')}"`); }
  fs.rmSync(VID, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, 'e2e_results.json'), JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));
  const nf = results.filter(r => !r.ok).length; console.log('\n' + (results.length - nf) + ' passed, ' + nf + ' failed'); process.exit(nf ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
