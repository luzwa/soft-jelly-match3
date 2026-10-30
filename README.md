# 软糯糯果冻三消（Soft Jelly Match-3）

Web 竖屏三消。当前工作线：**feel50**（50 正式关 + 手感调参 + 关卡编辑器）。

- 玩：`index.html`
- 编辑器：`editor.html`
- 交接：`docs/handoff/HANDOFF_2026-10-31.md`
- 变更：`docs/handoff/CHANGELOG_feel50.md`

```bash
python3 -m http.server 8765 --bind 127.0.0.1
node tools/make_levels_c.js && node tools/make_levels.js
```

Owner: Lily · 代码：New Bot（2026-10-31）
