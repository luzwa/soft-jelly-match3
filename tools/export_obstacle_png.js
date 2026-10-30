// Renders the PLACEHOLDER procedural obstacle art (js/obstacle_art.js) to PNG previews + assets/obstacles/manifest.json.
// The game and the editor draw the same code at runtime; the PNGs are for review / handoff only. usage: node tools/export_obstacle_png.js
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || '/workspace/jelly/test/node_modules/playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'assets/obstacles');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const pg = await b.newPage();
  await pg.setContent('<html><body></body></html>'); await pg.addScriptTag({ path: path.join(ROOT, 'js/obstacle_art.js') });
  const items = [['frosting_pad_layers_2', 'frosting', 2], ['frosting_pad_layers_1', 'frosting', 1], ['cookie_crate_hp_3', 'crate', 3], ['cookie_crate_hp_2', 'crate', 2], ['cookie_crate_hp_1', 'crate', 1], ['spawner_marker', 'spawner', 0],
    ['gummy_tie_tied', 'tie', 0], ['gummy_tie_releasing', 'tie', 0.45], ['delivery_basket_idle', 'basket', 0], ['delivery_basket_landing', 'basket', 1], ['exit_marker', 'exit', 0],
    ['goal_icon_gummy_tie', 'goal_tie', 0], ['goal_icon_delivery_basket', 'goal_basket', 0]];
  const files = [];
  for (const [name, fn, v] of items) {
    const url = await pg.evaluate(([fn, v]) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.scale(2.56, 2.56); const A = window.JellyObstacleArt;
      if (fn === 'frosting') A.frosting(x, 3, 3, 94, v, 0, 1); else if (fn === 'crate') A.crate(x, 3, 3, 94, v, 0, 1); else if (fn === 'spawner') A.spawner(x, 3, 30, 94, 1);
      else if (fn === 'tie') A.tie(x, 3, 3, 94, v, 1); else if (fn === 'basket') A.basket(x, 3, 3, 94, v, 1); else if (fn === 'exit') A.exit(x, 3, -20, 94, 1);
      else if (fn === 'goal_tie') { x.fillStyle = '#c9e9da'; x.beginPath(); x.arc(50, 50, 34, 0, 6.3); x.fill(); A.tie(x, 4, 4, 92, 0, 1); } else if (fn === 'goal_basket') A.basket(x, 4, 4, 92, 0, 1);
      return c.toDataURL('image/png'); }, [fn, v]);
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64')); files.push(name + '.png');
  }
  // contact sheet at real board cell size (~54 px) to check legibility, incl. stacked states (frosting + jelly stand-in + tie)
  const sheet = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 11 * 64 + 8; c.height = 72; const x = c.getContext('2d'); x.fillStyle = '#efe2c6'; x.fillRect(0, 0, c.width, c.height); const A = window.JellyObstacleArt;
    const cells = [['f', 2], ['f', 1], ['c', 3], ['c', 2], ['c', 1], ['t'], ['ft'], ['k'], ['fk'], ['e'], ['s']];
    cells.forEach(([k, v], i) => { const X = 8 + i * 64, Y = 9; x.fillStyle = '#fbf3e1'; x.fillRect(X, Y, 54, 54);
      if (k === 'f') A.frosting(x, X, Y, 54, v, 0, 1); else if (k === 'c') A.crate(x, X, Y, 54, v, 0, 1);
      else if (k === 't' || k === 'ft') { if (k === 'ft') A.frosting(x, X, Y, 54, 2, 0, 1); x.fillStyle = '#ff9db8'; x.beginPath(); x.arc(X + 27, Y + 29, 19, 0, 6.3); x.fill(); A.tie(x, X, Y, 54, 0, 1); }
      else if (k === 'k' || k === 'fk') { if (k === 'fk') A.frosting(x, X, Y, 54, 1, 0, 1); A.basket(x, X, Y, 54, 0, 1); }
      else if (k === 'e') { A.exit(x, X, Y, 54, 1); } else A.spawner(x, X, Y + 10, 54, 1); });
    return c.toDataURL('image/png'); });
  fs.writeFileSync(path.join(OUT, 'contact_sheet_cell54.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  await b.close();
  const P = 'placeholder';
  const manifest = { status: 'PLACEHOLDER', note: '阶段A/B 占位美术：程序化绘制（js/obstacle_art.js），奶油/粉彩风格，非最终资源；层数/耐久/绑带靠结构区分（双层台阶、丝带/盖子/裂纹、交叉绑带＋结），不只靠颜色。游戏与编辑器运行时直接调用同一绘制代码，PNG 仅供评审与交接。',
    source: 'js/obstacle_art.js', generatedBy: 'tools/export_obstacle_png.js', size: 256,
    assets: { frosting_pad: { layer: 'underlay', states: { layers_2: 'frosting_pad_layers_2.png', layers_1: 'frosting_pad_layers_1.png' }, status: P },
      cookie_crate: { layer: 'occupant', states: { hp_3: 'cookie_crate_hp_3.png', hp_2: 'cookie_crate_hp_2.png', hp_1: 'cookie_crate_hp_1.png' }, status: P },
      spawner: { layer: 'terrain', states: { default: 'spawner_marker.png' }, status: P },
      gummy_tie: { layer: 'overlay', stage: 'B', states: { tied: 'gummy_tie_tied.png', releasing: 'gummy_tie_releasing.png' }, goalIcon: 'goal_icon_gummy_tie.png', editorBrush: 'same drawing (editor palette)', status: P },
      delivery_basket: { layer: 'occupant', stage: 'B', states: { idle: 'delivery_basket_idle.png', landing: 'delivery_basket_landing.png' }, goalIcon: 'goal_icon_delivery_basket.png', editorBrush: 'same drawing (editor palette)', status: P },
      exit: { layer: 'terrain', stage: 'B', states: { marker: 'exit_marker.png' }, editorBrush: 'same drawing (editor palette)', status: P } },
    preview: 'contact_sheet_cell54.png' };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('wrote', files.length + 1, 'png + manifest.json to', OUT);
})();
