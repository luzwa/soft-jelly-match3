// Stage B end-to-end flow (real browser, real mouse on the editor canvas + game board):
// 编辑器画绑带/果篮/出口（含拒绝的组合）→ 目标（送达 + 绑带）→ 校验（B 类错误定位后修正）→ 导出真实文件 →
// 正式游戏载入同一 JSON：绑带宿主拒绝交换、锤子打果篮无效不扣、锤子解绑、送达计数、通关 →
// 验证关 vb_02 用真实鼠标拖动完成同一步两次送达 → 编辑器试玩（同 seed 重试 + 同输入同 hash）→ 返回未改动的草稿
// usage: node tests/e2e_stageB.js [baseDir-url] [outDir]   (default file:// of this folder)
'use strict';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const { chromium } = require(process.env.PW || '/workspace/jelly/test/node_modules/playwright-core');
const ROOT = path.join(__dirname, '..');
const BASE = (process.argv[2] || ('file://' + ROOT)).replace(/\/$/, '');
const OUT = process.argv[3] || '/workspace/jelly/shots_v3b';
const VID = path.join(OUT, 'video_tmp_e2e'); fs.mkdirSync(VID, { recursive: true });
const results = []; let shotN = 0;
function ok(name, cond, info) { results.push({ name, ok: !!cond, info: info === undefined ? '' : info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, recordVideo: { dir: VID, size: { width: 1440, height: 900 } } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  pg.on('dialog', d => d.accept());
  const shot = async (name, p) => { await (p || pg).screenshot({ path: path.join(OUT, 'e2e_' + String(++shotN).padStart(2, '0') + '_' + name + '.png') }); };
  const W = ms => pg.waitForTimeout(ms);
  const caption = async (t, p) => (p || pg).evaluate(t => {
    let el = document.getElementById('__cap'); if (!el) { el = document.createElement('div'); el.id = '__cap'; el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99;background:rgba(30,26,20,.85);color:#ffe9b0;font:600 18px/1.4 sans-serif;padding:8px 18px;border-radius:12px;pointer-events:none;max-width:90vw;text-align:center'; document.body.appendChild(el); }
    el.textContent = t;
  }, t);
  const idle = async (p) => (p || pg).waitForFunction(() => { const s = JellyDebug.state(); return s.phase === 'ready' || s.phase === 'result'; }, null, { timeout: 30000 });

  // ---- 0. player progress that must survive
  await pg.goto(BASE + '/editor.html'); await W(800);
  const PROG = JSON.stringify({ v: 1, cleared: { legacy_01: { cleared: true, best: { contentRevision: 1, movesLeft: 7, stars: 2 } } } });
  await pg.evaluate(p => { localStorage.clear(); localStorage.setItem('jelly_m3_progress_v1', p); }, PROG);
  await pg.reload(); await W(1000);
  await caption('阶段B ① 编辑器：新建关卡');
  const id = await pg.evaluate(() => JellyEditor.newLevel()); await W(400);
  const C = async (r, c) => pg.evaluate(([r, c]) => JellyEditor.cellCenter(r, c), [r, c]);
  const click = async (r, c) => { const p = await C(r, c); await pg.mouse.click(p.x, p.y); await W(180); };
  const pick = async (layer, tool) => { await pg.click(`#layerBtns [data-layer="${layer}"]`); await pg.click(`#pal [data-tool="${tool}"]`); await W(150); };
  const draft = () => pg.evaluate(() => JellyEditor.draft());
  const refused = async (fn, name) => { const b = await draft(); await fn(); const a = await draft(); ok(name, a === b, (await pg.textContent('#toast')).slice(0, 60)); await W(300); };

  // ---- 1. facilities + delivery + ties, with refusals at placement time
  await caption('② 地形层：出口画笔（只能放在竖直段最下端格）');
  await pick('terrain', 'exit');
  await refused(() => click(3, 3), 'editor: exit off a segment bottom refused');
  await click(6, 3);
  await caption('③ 占据层：送达果篮；出口格上不能放果篮');
  await pick('occupant', 'delivery_basket'); await click(2, 3);
  await refused(() => click(6, 3), 'editor: basket on the exit cell refused');
  await pick('occupant', 'cookie_crate:1'); await click(5, 5);
  await caption('④ 覆盖层：软糖绑带（盖在果冻/随机格上；不能盖箱子/果篮）');
  await pick('overlay', 'gummy_tie:1'); await click(4, 1); await click(4, 5);
  await refused(() => click(5, 5), 'editor: tie on a crate refused');
  await refused(() => click(2, 3), 'editor: tie on a basket refused');
  await click(4, 1);   // re-select a tied cell (no change: already tied) to read its properties
  const props = await pg.textContent('#props');
  ok('editor: property panel explains the tie rules', /软糖绑带/.test(props) && /旁边三消不解除/.test(props), props.split('\n').find(l => /覆盖层/.test(l)));
  // undo/redo of a tie stroke
  const preTie = await draft(); await click(1, 1); const postTie = await draft();
  await pg.click('#bUndo'); await W(150); const u = await draft(); await pg.click('#bRedo'); await W(150); const rd = await draft();
  ok('editor: tie placement is one undo step (undo/redo exact)', u === preTie && rd === postTie && postTie !== preTie);
  await pg.click('#bUndo'); await W(150);
  await shot('editor_stageB_painted');

  // ---- 2. goals
  await caption('⑤ 目标：送达全部果篮 + 解除全部绑带；锤子 9');
  await pg.selectOption('#goals [data-field="goals[0]"] [data-k=type]', 'deliver'); await W(200);
  await pg.click('#bAddGoal'); await W(200);
  await pg.selectOption('#goals [data-field="goals[1]"] [data-k=type]', 'clear_obstacle'); await W(200);
  await pg.selectOption('#goals [data-field="goals[1]"] [data-k=typeId]', 'gummy_tie'); await W(200);
  await pg.fill('#fName', 'E2E 阶段B 演示关'); await pg.press('#fName', 'Tab');
  await pg.fill('#fT0', '9'); await pg.press('#fT0', 'Tab'); await W(200);
  const goals = JSON.parse(await draft()).goals;
  ok('editor: goals = deliver(all) + clear_obstacle(gummy_tie, all)', JSON.stringify(goals) === JSON.stringify([{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }, { type: 'clear_obstacle', typeId: 'gummy_tie', scope: 'all' }]), goals);

  // ---- 3. validation: B (basket without exit) located, then fixed
  await caption('⑥ 校验：第 5 列果篮没有出口 → B 类“禁止发布”，点击定位到格子');
  await pick('occupant', 'delivery_basket'); await click(2, 5);
  await pg.click('#bValidate'); await W(400);
  let v = await pg.evaluate(() => JellyEditor.validate());
  ok('validate: basket in a segment without exit → B (blocks publishing, structure still OK)', v.structuralOk && !v.publishable && v.codes.includes('block:basket_no_exit'), v.codes);
  await pg.click('#issues .issue.block'); await W(400);
  const hl = await pg.evaluate(() => JellyEditor.state().hl);
  ok('validate: clicking the B issue highlights the cell', hl >= 1, hl);
  await shot('editor_validation_B');
  await caption('⑦ 擦除多余果篮后重新校验：结构通过、可发布（≠ 已证明可解）');
  await pick('occupant', 'erase'); await click(2, 5);
  await pg.click('#bValidate'); await W(500);
  v = await pg.evaluate(() => JellyEditor.validate());
  ok('validate: fixed level passes (0 A / 0 B)', v.structuralOk && v.publishable, { codes: v.codes, sim: v.sim });
  await shot('editor_validation_ok'); await pg.click('#bSave'); await W(300);

  // ---- 4. export
  await caption('⑧ 导出真实 JSON（含 exits / gummy_tie / delivery_basket）');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#bExport')]);
  const expPath = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(expPath);
  const exported = fs.readFileSync(expPath, 'utf8'), J = JSON.parse(exported);
  ok('export: file == canonical draft and carries stage B content', exported === await draft() && J.board.exits.length === 1 && J.initial.placements.filter(p => p.typeId === 'gummy_tie').length === 2 && J.initial.placements.some(p => p.typeId === 'delivery_basket'),
    { exits: J.board.exits, ties: J.initial.placements.filter(p => p.layer === 'overlay').map(p => [p.row, p.col]) });

  // ---- 5. the game plays the same JSON
  await caption('⑨ 正式游戏（file://）载入导出的同一份 JSON');
  await pg.goto(BASE + '/index.html?dev=1&q=high'); await pg.waitForFunction(() => window.JellyDebug && JellyDebug.state().phase === 'ready', null, { timeout: 30000 });
  await pg.setInputFiles('input.lf', expPath);
  await pg.waitForFunction(id => JellyDebug.state().levelId === id && JellyDebug.state().phase === 'ready', id, { timeout: 20000 });
  await W(900);
  let g = await pg.evaluate(() => ({ c: JellyDebug.core(), ties: JellyDebug.ties(), bk: JellyDebug.baskets(), vc: JellyDebug.visualCheck() }));
  ok('game: ties + basket + goals from the file; visuals mirror the core', g.ties.length === 2 && g.bk.length === 1 && g.c.goals[0].target === 1 && g.c.goals[1].target === 2 && g.vc.length === 0, { ties: g.ties, bk: g.bk, goals: g.c.goals });
  await shot('game_loaded_stageB');
  // tied host: real mouse drag → refused, nothing spent
  await caption('⑩ 被绑住的果冻：拖动换位被拒绝（不扣步数），原地还能参与匹配');
  const a = await pg.evaluate(() => JellyDebug.cellCenter(4, 1)), b = await pg.evaluate(() => JellyDebug.cellCenter(4, 2));
  const h0 = await pg.evaluate(() => JellyDebug.core());
  await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 6 }); await pg.mouse.up(); await W(700);
  const h1 = await pg.evaluate(() => JellyDebug.core());
  ok('game: dragging a tied host is refused; moves + hash unchanged', h1.hash === h0.hash && h1.moves === h0.moves, { moves: h1.moves });
  await shot('game_tied_refused');
  // hammer on a basket-only cell → refused, not spent
  await caption('⑪ 小锤敲果篮：果篮免疫且格子无可受击底层 → 无效，不扣道具');
  const hb = await pg.evaluate(() => { const t0 = JellyDebug.core().tools.hammer; const r = JellyDebug.hammer(2, 3); return { r, t0, t1: JellyDebug.core().tools.hammer }; });
  ok('game: hammer on the basket refused, tool not spent', hb.r === false && hb.t0 === hb.t1, hb); await W(600);
  // hammer on a tie → released + host consumed, goal +1
  await caption('⑫ 小锤敲绑带：绑带解除、宿主同批消耗，绑带目标 +1');
  await pg.evaluate(() => JellyDebug.hammer(4, 5)); await idle();
  g = await pg.evaluate(() => ({ c: JellyDebug.core(), ties: JellyDebug.ties(), ev: JellyDebug.lastEvents().slice(-1)[0] }));
  ok('game: hammer released the tie (goal 1/2)', g.c.goals[1].progress === 1 && g.ties.length === 1, g.ev);
  // drive the basket down to the exit with the hammer (column 3 under it)
  await caption('⑬ 清掉果篮下方的果冻：果篮下落到出口 → 送达 +1（核心先计数，再播放滑入出口）');
  for (let i = 0; i < 8; i++) {
    const s = await pg.evaluate(() => JellyDebug.core()); if (s.goals[0].progress >= 1 || s.phase !== 'ready') break;
    await pg.evaluate(() => JellyDebug.hammer(6, 3)); await idle(); await W(150);
    if (i === 1) await shot('game_basket_falling');
  }
  g = await pg.evaluate(() => ({ c: JellyDebug.core(), d: JellyDebug.delivered(), ev: JellyDebug.lastEvents() }));
  ok('game: basket delivered exactly once at the exit', g.c.goals[0].progress === 1 && g.d === 1 && g.ev.filter(x => /送达/.test(x)).length === 1, g.ev.filter(x => /送达/.test(x)));
  await shot('game_delivered');
  await caption('⑭ 最后一个绑带：解除后通关（先判胜）');
  await pg.evaluate(() => JellyDebug.hammer(4, 1));
  await pg.waitForFunction(() => JellyDebug.state().phase === 'result', null, { timeout: 20000 }).catch(() => { }); await W(1800);
  const end = await pg.evaluate(() => ({ s: JellyDebug.state(), c: JellyDebug.core(), vc: JellyDebug.visualCheck(), prog: localStorage.getItem('jelly_m3_progress_v1') }));
  ok('game: exported stage B level won; visuals in sync; no progress written', end.s.result && end.s.result.win && end.c.phase === 'won' && end.vc.length === 0 && end.prog === PROG, { goals: end.c.goals, vc: end.vc });
  await shot('game_won_stageB');

  // ---- 6. verification level with the real mouse: two deliveries in one action
  await caption('⑮ 验证关 B2：真实鼠标拖动 (6,2)→(6,3)，同一步连续送达 2 个（各计 1 次）');
  await pg.evaluate(() => JellyDebug.startLevelId('vb_02_delivery', 5)); await idle(); await W(600);
  const p1 = await pg.evaluate(() => JellyDebug.cellCenter(6, 2)), p2 = await pg.evaluate(() => JellyDebug.cellCenter(6, 3));
  await pg.mouse.move(p1.x, p1.y); await pg.mouse.down(); await pg.mouse.move(p2.x, p2.y, { steps: 6 }); await pg.mouse.up();
  await W(1300); await shot('vb02_delivering');
  await idle(); await W(400);
  g = await pg.evaluate(() => ({ c: JellyDebug.core(), vc: JellyDebug.visualCheck(), d: JellyDebug.delivered() }));
  ok('vb_02: one drag → 2 deliveries, goal 2/3, 1 move spent, visuals in sync', g.d === 2 && g.c.goals[0].progress === 2 && g.c.moves === 19 && g.vc.length === 0, { d: g.d, goals: g.c.goals, moves: g.c.moves, vc: g.vc });
  // restart in the middle of the delivery chain: old callbacks must not touch the new board
  await pg.evaluate(() => JellyDebug.restart(true)); await idle();
  const fresh = await pg.evaluate(() => JellyDebug.core().hash);
  await pg.evaluate(() => JellyDebug.swap(6, 2, 6, 3)); await W(700); await pg.evaluate(() => JellyDebug.restart(true)); await W(3500); await idle();
  g = await pg.evaluate(() => ({ h: JellyDebug.core().hash, vc: JellyDebug.visualCheck(), bk: JellyDebug.baskets().length }));
  ok('restart mid-delivery: fresh board, baskets back, visuals in sync', g.h === fresh && g.vc.length === 0 && g.bk === 3, g);

  // ---- 7. editor playtest
  await caption('⑯ 回到编辑器：试玩同一草稿（同一核心 + 正式表现）');
  await pg.goto(BASE + '/editor.html'); await W(1200);
  ok('editor: draft restored', await draft() === exported);
  await pg.fill('#seed', '777'); await pg.press('#seed', 'Tab'); await pg.click('#bPlay');
  const fr = await (async () => { for (let i = 0; i < 60; i++) { const f = pg.frames().find(f => /playtest=1/.test(f.url())); if (f) { try { if (await f.evaluate(() => window.JellyDebug && JellyDebug.state().phase === 'ready' && JellyDebug.state().source === 'playtest')) return f; } catch (e) { } } await W(250); } return null; })();
  ok('playtest: iframe running the draft with the seed', !!fr && (await fr.evaluate(() => JellyDebug.state().seed)) === 777);
  const s0 = await fr.evaluate(() => JellyDebug.core().hash);
  const seq = async () => { await fr.evaluate(() => JellyDebug.hammer(4, 5)); await W(1800); await fr.evaluate(() => JellyDebug.hammer(6, 3)); await W(1800); return fr.evaluate(() => JellyDebug.core().hash); };
  const hA = await seq(); await shot('playtest_stageB');
  const lg = await pg.evaluate(() => JellyEditor.ptLog());
  ok('playtest: editor shows the tie event', lg.some(x => /绑带/.test(x)), lg.slice(-2));
  await pg.click('#ptSame'); await W(3000);
  const s1 = await fr.evaluate(() => JellyDebug.core().hash); const hB = await seq();
  ok('playtest: same seed restart = same start; same inputs = same hash', s1 === s0 && hA === hB, { s0, s1, hA, hB });
  await pg.click('#ptBack'); await W(1200);
  const ret = await pg.evaluate(() => ({ r: window.__ptReturn, d: JellyEditor.draft(), prog: localStorage.getItem('jelly_m3_progress_v1') }));
  ok('return: draft untouched, progress untouched', ret.r && ret.r.same && ret.d === exported && ret.prog === PROG, ret.r);
  await shot('editor_after_return');

  // ---- 8. determinism across tiers on a stage B level
  const hashes = [];
  for (const q of ['high', 'low']) {
    const p = await ctx.newPage();
    await p.goto(BASE + '/index.html?q=' + q + '&level=vb_05_layers&seed=9'); await p.waitForFunction(() => window.JellyDebug && JellyDebug.state().phase === 'ready', null, { timeout: 30000 });
    await p.evaluate(() => JellyDebug.swap(1, 0, 2, 0)); await idle(p);
    await p.evaluate(() => JellyDebug.hammer(3, 5)); await idle(p);
    const m = await p.evaluate(() => JellyDebug.findMove()); await p.evaluate(m => JellyDebug.swap(m[0][0], m[0][1], m[1][0], m[1][1]), m); await idle(p);
    hashes.push(await p.evaluate(() => [JellyDebug.tier(), JellyDebug.core().hash, JellyDebug.visualCheck().length])); await p.close();
  }
  ok('tiers: q=high and q=low give the same logical result on vb_05', hashes[0][1] === hashes[1][1] && !hashes[0][2] && !hashes[1][2], hashes);
  ok('no page errors', errs.length === 0, errs);

  await pg.close(); await ctx.close(); await browser.close();
  const webm = fs.readdirSync(VID).filter(f => f.endsWith('.webm')).map(f => path.join(VID, f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  if (webm) execSync(`ffmpeg -y -loglevel error -i "${webm}" -c:v libx264 -pix_fmt yuv420p -crf 26 -preset veryfast -movflags +faststart "${path.join(OUT, 'stageB_e2e_flow.mp4')}"`);
  fs.rmSync(VID, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, 'e2e_stageB_results.json'), JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));
  const nf = results.filter(r => !r.ok).length; console.log('\n' + (results.length - nf) + ' passed, ' + nf + ' failed'); process.exit(nf ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e); process.exit(2); });
