// Stage B demo video (real game, file://, real core + real presentation) with captions:
// 绑带 · 送达到出口 · 层叠 · 生成锚点 · 同色+绑带目标 · 三种特殊棋子生成与发动 · 六种两两组合 · 全盘攻击
// Boards for the special / combo clips are set through JellyDebug.seedBoard (QA hook, marked in the caption as 调试摆盘).
// usage: node tests/demo_stageB.js [baseDir-url] [outDir]
'use strict';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const { chromium } = require(process.env.PW || '/workspace/jelly/test/node_modules/playwright-core');
const ROOT = path.join(__dirname, '..');
const BASE = (process.argv[2] || ('file://' + ROOT)).replace(/\/$/, '');
const OUT = process.argv[3] || '/workspace/jelly/shots_v3b';
const VID = path.join(OUT, 'video_tmp_demo'); fs.mkdirSync(VID, { recursive: true });
const log = [];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 960 }, recordVideo: { dir: VID, size: { width: 430, height: 960 } } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const W = ms => pg.waitForTimeout(ms);
  let n = 0; const shot = async name => pg.screenshot({ path: path.join(OUT, 'demo_' + String(++n).padStart(2, '0') + '_' + name + '.png') });
  const cap = async t => pg.evaluate(t => {
    let el = document.getElementById('__cap'); if (!el) { el = document.createElement('div'); el.id = '__cap'; el.style.cssText = 'position:fixed;left:6px;right:6px;bottom:6px;z-index:99;background:rgba(30,26,20,.86);color:#ffe9b0;font:600 14px/1.35 sans-serif;padding:7px 10px;border-radius:10px;pointer-events:none;text-align:center'; document.body.appendChild(el); }
    el.textContent = t;
  }, t);
  const idle = () => pg.waitForFunction(() => { const s = JellyDebug.state(); return s.phase === 'ready' || s.phase === 'result'; }, null, { timeout: 30000 });
  const level = async (id, seed) => { await pg.evaluate(([id, s]) => JellyDebug.startLevelId(id, s), [id, seed || 1]); await idle(); await W(500); };
  const swap = async (r1, c1, r2, c2, wait) => { await pg.evaluate(a => JellyDebug.swap(...a), [r1, c1, r2, c2]); await W(wait || 650); };
  const done = async (label) => { await idle(); await W(500); const c = await pg.evaluate(() => ({ vc: JellyDebug.visualCheck(), goals: JellyDebug.core().goals, d: JellyDebug.delivered() })); log.push({ label, vc: c.vc, goals: c.goals.map(g => g.progress + '/' + g.target), delivered: c.d }); };

  await pg.goto(BASE + '/index.html?level=vb_01_ties&seed=1'); await pg.waitForFunction(() => window.JellyDebug && JellyDebug.state().phase === 'ready', null, { timeout: 30000 }); await W(800);
  // 1. ties
  await cap('① 软糖绑带：被绑的果冻不能交换（拒绝、不扣步）'); await W(900);
  await swap(3, 1, 3, 2, 1200); await shot('tie_refused');
  await cap('② 移动旁边的果冻，让被绑的果冻原地参与三连 → 绑带解除、宿主同批消除；紧邻的绑带不解除');
  await W(700); await swap(2, 2, 3, 2, 450); await shot('tie_release'); await done('ties'); await W(900);
  // 2. delivery
  await cap('③ 送达：清掉果篮下方的果冻，果篮随重力落到出口（绿色箭头）'); await level('vb_02_delivery'); await W(900);
  await swap(6, 2, 6, 3, 1500); await shot('delivery_1');
  await cap('④ 送达后腾出的空位继续下落，第二个果篮也到达出口：同一步送达 2 个，各计 1 次'); await W(1200); await shot('delivery_2'); await done('delivery'); await W(800);
  await cap('⑤ 小锤敲压在糖霜上的果篮：只削掉糖霜，果篮免疫、不算送达'); await pg.evaluate(() => JellyDebug.hammer(3, 5)); await W(1200); await done('basket_on_frost'); await W(500);
  // 3. layers
  await cap('⑥ 层叠：小锤敲只有果篮的格子 → 无效，不扣道具'); await level('vb_05_layers'); await W(600);
  await pg.evaluate(() => JellyDebug.hammer(0, 5)); await W(1400); await shot('hammer_basket_refused');
  await cap('⑦ 地垫(2层)+果冻+绑带同格参与匹配：绑带解除、果冻消除、地垫 2→1，邻格箱子 −1（三层分别结算）');
  await swap(1, 0, 2, 0, 600); await shot('layers'); await done('layers'); await W(900);
  // 4. anchor
  await cap('⑧ 生成锚点：自然连消形成四连，锚点落在被绑格 → 解绑、只计 1 次收集、糖霜 −1、箱子 −1，在解绑格生成划线');
  await level('vb_04_anchor'); await W(900); await swap(6, 0, 6, 1, 800); await shot('anchor'); await done('anchor'); await W(1200);
  // 5. same colour + ties
  await cap('⑨ 【规则测试摆放】彩虹 × 河豚：绑带里的河豚也是同色目标，被绑的河豚划线被击中→解绑并触发一次');
  await level('vb_03_rainbow_ties'); await W(900); await swap(3, 3, 3, 4, 900); await shot('rainbow_ties'); await done('rainbow_ties'); await W(1500);
  // 6. specials: creation + activation (debug boards on the baseline level)
  const B = r3 => ['s f j b g s f', 'j b b f j b g', 'b s g f b s j', r3, 'f j b j s g s', 's b j f g j b', 'j f s b f s g'];
  const seed = async rows => { await pg.evaluate(r => JellyDebug.seedBoard(r), rows); await W(700); };
  await level('verify_01_baseline');
  await cap('⑩ 直线四连 → 划线（方向与四连垂直，沿用 v2 规则）〔调试摆盘〕'); await seed(B('g g s g j f b')); await swap(2, 2, 3, 2, 1300); await shot('make_line'); await done('make_line');
  await cap('⑪ L/T 形 → 炸弹（区域）〔调试摆盘〕'); await seed(['s f j b g s f', 'j b b f j b g', 'b s g f b s j', 'g g s j f f b', 'f j g j s g s', 's b g f g j b', 'j f s b f s g']); await swap(2, 2, 3, 2, 1300); await shot('make_bomb'); await done('make_bomb');
  await cap('⑫ 直线五连 → 彩虹（同色）〔调试摆盘〕'); await seed(B('g g s g g f b')); await swap(2, 2, 3, 2, 1300); await shot('make_rainbow'); await done('make_rainbow');
  const ACT = sp => ['s f j b g s f', 'j b b f j b g', 'b s ' + sp + ' f b s j', 'g g s j f s b', 'f j b j s g s', 's b j f g j b', 'j f s b f s g'];
  await cap('⑬ 划线发动：整行直接攻击〔调试摆盘〕'); await seed(ACT('g-')); await swap(2, 2, 3, 2, 1400); await shot('fire_line'); await done('fire_line');
  await cap('⑭ 炸弹发动：3×3 区域〔调试摆盘〕'); await seed(ACT('g*')); await swap(2, 2, 3, 2, 1400); await shot('fire_bomb'); await done('fire_bomb');
  await cap('⑮ 彩虹 × 普通果冻：清除该颜色全部普通果冻〔调试摆盘〕'); await seed(ACT('R')); await swap(2, 2, 3, 2, 1600); await shot('fire_rainbow'); await done('fire_rainbow');
  // 7. six combos on a tie level (ties are released by the combos' direct attacks)
  const P5 = ['s', 'f', 'j', 'b', 'g'];
  const comboRows = (a, b) => { const rows = []; for (let r = 0; r < 7; r++) { const t = []; for (let c = 0; c < 7; c++) t.push(P5[(r + 2 * c) % 5]); rows.push(t); } rows[3][3] = a; rows[3][4] = b; return rows.map(r => r.join(' ')); };
  const COMBOS = [['划线＋划线 = 十字', 'f-', 'b|'], ['划线＋炸弹 = 三行三列', 'f-', 'b*'], ['炸弹＋炸弹 = 5×5', 'f*', 'b*'], ['彩虹＋划线 = 该色全部变划线并发动', 'R', 'b-'], ['彩虹＋炸弹 = 该色全部变炸弹并发动', 'R', 'b*'], ['彩虹＋彩虹 = 全盘攻击', 'R', 'R']];
  for (let i = 0; i < COMBOS.length; i++) {
    const [name, a, b] = COMBOS[i];
    await level('b_tie_intro', 3);
    await cap('⑯ 组合 ' + (i + 1) + '/6：' + name + '（绑带关：攻击覆盖的绑带一起解除）〔调试摆盘〕'); await seed(comboRows(a, b));
    await swap(3, 3, 3, 4, i >= 3 ? 1500 : 1000); await shot('combo_' + (i + 1)); await done('combo_' + (i + 1)); await W(400);
  }
  // 8. full-board attack with obstacles
  await cap('⑰ 【规则测试摆放】彩虹＋彩虹全盘攻击：普通果冻全离场；2HP 箱子剩 1、2 层糖霜剩 1、绑带解除；果篮被箱子挡住，不会被凭空计为送达');
  await level('vb_06_board_attack'); await W(1000); await swap(3, 2, 3, 3, 1700); await shot('board_attack'); await done('board_attack'); await W(1800);
  await cap('阶段B 演示结束（表现与核心一致：每段结束时 visualCheck 为空）'); await W(1500);

  await pg.close(); await ctx.close(); await browser.close();
  const webm = fs.readdirSync(VID).filter(f => f.endsWith('.webm')).map(f => path.join(VID, f))[0];
  execSync(`ffmpeg -y -loglevel error -i "${webm}" -c:v libx264 -pix_fmt yuv420p -crf 24 -preset veryfast -movflags +faststart "${path.join(OUT, 'stageB_demo.mp4')}"`);
  fs.rmSync(VID, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, 'demo_log.json'), JSON.stringify({ when: new Date().toISOString(), errs, log }, null, 1));
  const bad = log.filter(l => l.vc.length); console.log(JSON.stringify(log.map(l => l.label + ' ' + l.goals.join(',') + (l.vc.length ? ' VC:' + l.vc.join(',') : ''))), 'errors', errs, 'visual mismatches', bad.length);
  process.exit(errs.length || bad.length ? 1 : 0);
})().catch(e => { console.error('DEMO CRASH', e); process.exit(2); });
