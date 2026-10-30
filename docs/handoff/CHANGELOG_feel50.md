# CHANGELOG · feel50（2026-10-31）

## 相对 v3.3.0-stageC
### 关卡
- 正式关从 30 → **50**
- 新增第六章「综合运用」c6_01–c6_06
- 新增第七章「通路与节奏」c7_01–c7_06（异形盘 / 节奏）
- 新增第八章「终章」c8_01–c8_08
- 修复若干 DSL 行宽 ≠7 的关卡行

### 手感（motion 1.1.0-feel50）
- pointer_press 90→**55**ms
- ordinary_swap 210→**145**ms；拒绝出/回位加快
- drag_threshold 8→**6**px
- refill base 160→**125**、per-cell 28→**22**、max 340→**280**；land 125→**100**
- tool_swap / shuffle 略加快
- **未改**：match_compress 45 / piece_eject 95 / piece_retire 430

### 编辑器
- 沿用并确认 `editor.html` 可用：新建/复制/删除草稿、撤销重做、导入导出、结构校验

### 交付物
- 工作副本 `work_feel50`
- 云盘：设计文案 + 优化记录 + 完整快照
- GitHub：`luzwa/soft-jelly-match3`

## feel500（2026-10-31）
### 关卡
- 正式关 **50 → 500**
- 新增 `tools/make_levels_500.js`：Z2–Z10 模板生成（霜/箱/绑/送达/异形 remix）
- `tools/make_levels.js` FORMAL 接入 `z02`–`z10`
- 文档：`docs/LEVELS_500_CURVE.md`、`docs/LEVELS_500_STATUS.md`
- 抽样 bot：`levels/bot_report_sample500.json`（74 关）
- 发布：`releases/Jelly_Match3_feel500.tar.gz`
