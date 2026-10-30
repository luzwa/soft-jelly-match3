# 软糯糯 · feel50 工作副本（2026-10-31）

路径：`/workspace/jelly/work_feel50/`

## 已做
1. **正式关卡 50 关**：章节 ch1–ch8（6+6+6+6+6+6+6+8），由 `tools/make_levels_c.js` + `tools/make_levels.js` 生成。
2. **手感调参**（`js/config.js` motion `1.1.0-feel50`）
   - 按下反馈 90→55ms，普通交换 210→145ms
   - 拒绝回弹 / 归位更快；拖拽阈值 8→6px
   - 补位下落 160→125ms、错峰 28→22ms、上限 340→280ms；落地 125→100ms
   - 道具交换 / 洗牌略加快
   - 保留：match_compress 45 / piece_eject 95 / piece_retire 430（你定的基线）
3. **关卡编辑器**：打开 `editor.html`
   - 新建 / 复制 / 删除草稿、撤销重做
   - 导入 / 导出 JSON、保存到 localStorage（`jelly_editor_v1:*`）
   - 内置 50 关只读可开改成草稿；结构校验内置

## 怎么开
```bash
cd /workspace/jelly/work_feel50
# 任意静态服务器，例如：
python3 -m http.server 8765
# 浏览器：http://127.0.0.1:8765/index.html
# 编辑器：http://127.0.0.1:8765/editor.html
```

## 重生关卡
```bash
node tools/make_levels_c.js && node tools/make_levels.js
```

## 500 关扩展（2026-10-31）
- 正式关已扩到 **500**：Z1=原 ch1–ch8（50），Z2–Z10=`z02`–`z10`（各 50）
- 重生：`node tools/make_levels_500.js && node tools/make_levels.js`
- 详见 `docs/LEVELS_500_CURVE.md` / `docs/LEVELS_500_STATUS.md`
