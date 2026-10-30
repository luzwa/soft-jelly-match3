/* Jelly Match-3 — stage C level select / pre-level goal preview / chapter complete / challenges (DOM overlay over the canvas).
 * Talks to the game only through window.JellyGameAPI (set by game.js). Plain script, works from file://. */
(function () {
  'use strict';
  var API = null, root = null, cur = { screen: null };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function css() {
    var st = document.createElement('style');
    st.textContent = [
      '#jm{position:fixed;inset:0;z-index:20;display:none;overflow:auto;-webkit-overflow-scrolling:touch;background:linear-gradient(#f4f1e2,#e9efdc);font-family:"PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#45402f}',
      '#jm.on{display:block}#jm .wrap{max-width:430px;margin:0 auto;padding:14px 14px 40px}',
      '#jm h1{font-size:26px;margin:8px 0 2px;text-align:center;font-weight:800}#jm .sub{text-align:center;color:#6f6a52;font-size:12px;margin-bottom:10px}',
      '#jm .tabs{display:flex;gap:8px;justify-content:center;margin:8px 0 12px}#jm .tab{border:0;border-radius:18px;padding:8px 22px;font:700 15px inherit;font-family:inherit;background:#fbf6e6;color:#6f6a52;box-shadow:0 2px 0 #d8ceb0}',
      '#jm .tab.on{background:#7aa35a;color:#fff;box-shadow:0 2px 0 #557a3c}',
      '#jm .ch{background:#fffaf0;border-radius:18px;padding:12px 12px 10px;margin:0 0 12px;box-shadow:0 3px 0 #e2d7b8}',
      '#jm .ch h2{margin:0 0 2px;font-size:17px;display:flex;justify-content:space-between;align-items:baseline}#jm .ch h2 small{font-size:12px;color:#8a7f5c;font-weight:700}',
      '#jm .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:8px}',
      '#jm .lv{position:relative;border:0;border-radius:14px;aspect-ratio:1/1.12;background:#eaf2dc;box-shadow:0 2px 0 #c9d6b4;font:800 17px inherit;font-family:inherit;color:#3f5233;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center}',
      '#jm .lv .st{font-size:9px;letter-spacing:-1px;color:#e8a92a;height:11px;line-height:11px}#jm .lv .st i{font-style:normal;color:#d5ccb1}',
      '#jm .lv.lock{background:#ece6d6;color:#b5ab90;box-shadow:0 2px 0 #d8cfb6}#jm .lv.next{outline:3px solid #f0a64a;outline-offset:-3px}',
      '#jm .lv .tag{position:absolute;top:-5px;right:-4px;background:#f0a64a;color:#fff;font-size:9px;border-radius:7px;padding:1px 4px}',
      '#jm .lv .role{position:absolute;bottom:-6px;font-size:8px;color:#b0763a;background:#fff3dc;border-radius:6px;padding:0 3px;white-space:nowrap}',
      '#jm .note{font-size:11px;color:#8a7f5c;text-align:center;margin:10px 4px;line-height:1.5}',
      '#jm .modal{position:fixed;inset:0;background:rgba(60,55,35,.42);display:flex;align-items:center;justify-content:center;z-index:21}',
      '#jm .card{width:min(340px,90vw);background:#fffaf0;border-radius:22px;padding:18px 18px 14px;box-shadow:0 6px 0 #d9cca7}',
      '#jm .card h3{margin:0 0 10px;text-align:center;font-size:21px}#jm .goals{display:flex;gap:14px;justify-content:center;margin:6px 0 10px}',
      '#jm .goal{display:flex;flex-direction:column;align-items:center;font-weight:800;font-size:16px}#jm .goal img{width:52px;height:52px;object-fit:contain}',
      '#jm .row{display:flex;justify-content:space-between;font-size:13px;color:#6f6a52;margin:4px 2px}#jm .row b{color:#3f5233;font-family:ui-monospace,Menlo,Consolas,monospace}',
      '#jm .tip{background:#f2f7e8;border-radius:12px;padding:8px 10px;font-size:13px;line-height:1.5;margin:8px 0;color:#4d5a3b}',
      '#jm .btns{display:flex;gap:10px;justify-content:center;margin-top:12px}#jm .btn{border:0;border-radius:24px;padding:11px 26px;font:800 16px inherit;font-family:inherit;background:#7aa35a;color:#fff;box-shadow:0 3px 0 #557a3c}',
      '#jm .btn.sec{background:#f4ecd6;color:#45402f;box-shadow:0 3px 0 #d8ceb0}#jm .btn:active{transform:translateY(2px)}',
      '#jm .chal{background:#fffaf0;border-radius:18px;padding:12px;margin:0 0 12px;box-shadow:0 3px 0 #e2d7b8}#jm .chal h2{margin:0;font-size:17px}',
      '#jm .chal .meta{font-size:11px;color:#8a7f5c;margin:4px 0 6px;line-height:1.5}#jm table{width:100%;border-collapse:collapse;font-size:12px}#jm td{padding:3px 4px;border-top:1px solid #efe6cc}',
      '#jm td.n{font-family:ui-monospace,Menlo,Consolas,monospace;text-align:right}#jm .empty{font-size:12px;color:#a59c80;padding:4px 0}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function stars(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '★' : '<i>★</i>'; return s; }
  function show(html) { root.innerHTML = '<div class="wrap">' + html + '</div>'; root.classList.add('on'); root.scrollTop = cur.scroll || 0; }
  function hide() { root.classList.remove('on'); root.innerHTML = ''; cur.screen = null; }
  function select(tab) {
    cur.screen = 'select'; cur.tab = tab || cur.tab || 'levels';
    var h = '<h1>果冻消消乐</h1><div class="sub">计分 ' + esc(API.scoreVersion()) + ' · 本地进度</div>' +
      (function () { var ps = API.progressStatus ? API.progressStatus() : { writable: true }; return ps.writable ? (ps.source === 'migrated_v1' ? '<div class="note">已从旧版进度迁移（旧存档原样保留）</div>' : '') : '<div class="note" style="color:#b0502a">存档无法读取或来自更新版本（' + esc(ps.reason || '') + '）：本次只读，不会覆盖原存档</div>'; })() +
      '<div class="tabs"><button class="tab' + (cur.tab === 'levels' ? ' on' : '') + '" data-tab="levels">关卡</button><button class="tab' + (cur.tab === 'chal' ? ' on' : '') + '" data-tab="chal">挑战</button></div>';
    if (cur.tab === 'levels') {
      var ch = API.chapters(), nextId = API.nextOpenLevel();
      ch.forEach(function (c) {
        var done = 0, st = 0; c.levels.forEach(function (l) { if (l.cleared) done++; st += l.stars; });
        h += '<div class="ch"><h2>' + esc(c.name) + '<small>' + done + '/' + c.levels.length + ' · ★' + st + '/' + c.levels.length * 3 + '</small></h2><div class="grid">';
        c.levels.forEach(function (l, i) {
          var cls = 'lv' + (l.unlocked ? '' : ' lock') + (l.levelId === nextId ? ' next' : '');
          h += '<button class="' + cls + '" data-lv="' + esc(l.levelId) + '" aria-label="' + esc(l.name) + (l.unlocked ? '' : '（未解锁）') + '"' + (l.unlocked ? '' : ' disabled') + '>' +
            (l.unlocked ? '' : '🔒') + (i + 1) + '<span class="st">' + (l.unlocked ? stars(l.stars) : '') + '</span>' +
            (l.legacyOnly ? '<span class="tag">旧版</span>' : '') + (l.role === 'challenge' ? '<span class="role">挑战</span>' : l.role === 'relax' ? '<span class="role">放松</span>' : l.role === 'teach' ? '<span class="role">教学</span>' : '') + '</button>';
        });
        h += '</div></div>';
      });
      h += '<div class="note">星级阈值为暂定值（机器人诊断推算，待真人试玩校准）；星级只用于评分，不阻挡进入下一关。<br>“旧版”= 旧计分版本时已通关，新版计分下尚无成绩。</div>';
    } else {
      API.challenges().forEach(function (c) {
        h += '<div class="chal"><h2>' + esc(c.name) + '</h2><div class="meta">' + esc(c.focusText) + '<br>固定条件：seed ' + c.seed + ' · ' + c.moves + ' 步 · 无道具 · 无额外步数 · ' + esc(c.versions) + '</div>';
        if (c.ranked.length) {
          h += '<table>'; c.ranked.slice(0, 5).forEach(function (r) { h += '<tr><td>第 ' + r.rank + (r.tie ? '（并列）' : '') + '</td><td class="n">' + r.rec.score + ' 分</td><td class="n">剩 ' + r.rec.movesLeft + ' 步</td></tr>'; }); h += '</table>';
        } else h += '<div class="empty">还没有通关成绩</div>';
        h += '<div class="meta">尝试 ' + c.attempts + ' 次' + (c.bestUnfinished ? ' · 未通关最高 ' + c.bestUnfinished.score + '（不进入成绩榜）' : '') + '</div>';
        h += '<div class="btns"><button class="btn" data-chal="' + esc(c.challengeId) + '">开始挑战</button></div></div>';
      });
      h += '<div class="note">只记录本机成绩：仅“目标完成且规则执行有效”的局进入成绩榜；按总分排序，同分比剩余步数，仍相同则并列；不比较用时。没有全球排行榜。</div>';
    }
    show(h);
  }
  function preview(id) {
    var p = API.levelPreview(id); if (!p) return;
    cur.preview = id;
    var h = '<div class="modal"><div class="card"><h3>' + esc(p.name) + '</h3><div class="goals">';
    p.goals.forEach(function (g) { h += '<div class="goal"><img alt="" src="' + g.icon + '"><span>' + esc(g.label) + '</span></div>'; });
    h += '</div><div class="row"><span>步数</span><b>' + p.moves + '</b></div>' +
      '<div class="row"><span>星级（暂定）</span><b>' + p.stars.join(' / ') + '</b></div>' +
      '<div class="row"><span>本版最佳</span><b>' + (p.best ? p.best.score + (p.best.assisted ? '（用道具）' : '') : '—') + '</b></div>' +
      '<div class="row"><span>无道具最佳</span><b>' + (p.noTool ? p.noTool.score : '—') + '</b></div>' +
      (p.tip ? '<div class="tip">' + esc(p.tip) + '</div>' : '') +
      '<div class="btns"><button class="btn sec" data-act="back">返回</button><button class="btn" data-act="play" data-id="' + esc(id) + '">开始</button></div></div></div>';
    var m = document.createElement('div'); m.innerHTML = h; root.appendChild(m.firstChild); cur.screen = 'preview';
  }
  function chapterDone(info) {
    cur.screen = 'chapter';
    var h = '<div class="modal"><div class="card"><h3>' + esc(info.name) + ' 完成！</h3>' +
      '<div class="row"><span>通关</span><b>' + info.cleared + '/' + info.total + '</b></div><div class="row"><span>星星</span><b>★' + info.stars + '/' + info.total * 3 + '</b></div>' +
      '<div class="btns">' + (info.nextChapterFirst ? '<button class="btn" data-act="play" data-id="' + esc(info.nextChapterFirst) + '">下一章</button>' : '<span class="tip">已经是最后一章 🎉</span>') +
      '<button class="btn sec" data-act="select">返回选关</button></div></div></div>';
    show(h);
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b) { if (e.target.classList.contains('modal') && cur.screen === 'preview') { e.target.remove(); cur.screen = 'select'; } return; }
    if (b.dataset.tab) { cur.scroll = 0; select(b.dataset.tab); return; }
    if (b.dataset.lv) { cur.scroll = root.scrollTop; preview(b.dataset.lv); return; }
    if (b.dataset.chal) { hide(); API.startChallenge(b.dataset.chal); return; }
    var a = b.dataset.act;
    if (a === 'back') { var m = root.querySelector('.modal'); if (m) m.remove(); cur.screen = 'select'; }
    else if (a === 'play') { hide(); API.startFormal(b.dataset.id); }
    else if (a === 'select') select('levels');
  }
  window.JellyMenu = {
    init: function (api) { API = api; css(); root = document.createElement('div'); root.id = 'jm'; document.body.appendChild(root); root.addEventListener('click', onClick); },
    select: select, preview: function (id) { if (cur.screen !== 'select') select('levels'); preview(id); }, chapterDone: chapterDone, hide: hide,
    state: function () { return { screen: cur.screen, tab: cur.tab, preview: cur.preview, visible: !!(root && root.classList.contains('on')) }; }
  };
})();
