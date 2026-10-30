# 500 关扩展 · 状态

日期：2026-10-31（UTC+8）  
工作副本：`/workspace/jelly/work_feel50/`

## 计数

| 项 | 数量 |
|---|---|
| 正式关（formal catalog） | **500** |
| Z1 手写基线 `ch1`–`ch8` | 50（`c1_01`…`c8_08`） |
| Z2–Z10 生成 `z02`–`z10` | 450（每区 50） |
| 固定条件挑战 `chal_*` | 3（不计入 500） |

验证命令：

```bash
cd /workspace/jelly/work_feel50
node -e "global.window={};require('./levels/levels_data.js');const D=window.JELLY_LEVELS;const n=D.catalog.chapters.filter(c=>c.formal).flatMap(c=>c.levels).length;console.log('FORMAL',n);"
```

期望输出：`FORMAL 500`

## 如何重生

```bash
cd /workspace/jelly/work_feel50
node tools/make_levels_500.js && node tools/make_levels.js
# 等价于：先经 make_levels_c 端口 Z1，再写 z02–z10，再打包 levels_data.js
```

设计坡度：`docs/LEVELS_500_CURVE.md`  
生成器：`tools/make_levels_500.js`  
目录接线：`tools/make_levels.js` 的 `FORMAL` 含 `ch1`–`ch8` + `z02`–`z10`

## 结构校验

- `levels/validation_report.json`：生成关 `z*` **error=0 / block=0**
- Z1 手写关仍保留历史 warn/block（如部分 `basket_no_exit`、`c8_03` init_impossible）——与 feel50 基线一致，本轮未改盘面
- 抽检：所有正式关 `playableMask` 均为 7×7 字串；无空 formal 列表

## 机器人抽样（非全量）

全量 500 × bots 过重；本轮抽样：

- 每隔 10 关 + Z1/Z2 全部 teach/challenge
- 共 **74** 关 × 20 seeds × `goal_greedy` + `random_legal`
- 报告：`levels/bot_report_sample500.json`

抽样区均 greedy 胜率（约）：

| 区 | 抽样 n | greedy 均 | random 均 |
|---|---|---|---|
| Z1 | 27 | ~84% | ~47% |
| Z2 | 7 | ~97% | ~46% |
| Z3–Z4 | 10 | ~90% | ~15% |
| Z5–Z7 | 15 | ~69% | ~4% |
| Z8–Z10 | 15 | ~46% | ~5% |

说明：机器人胜率 ≠ 玩家通过率；后期 random≈0 是预期中的「收步数 / 高决策密度」。个别关 greedy 仍偏低，属 provisional，需真人试玩后再调模板参数或步数。

星级：生成关仍为占位 `[8000,14000,20000]`；抽样报告内含 bot 推算星，**未**写回 levels（避免只校准 74 关造成不一致）。

## 菜单 / 进度

- 正式章节 17 个：`ch1`–`ch8`（共 50）+ `z02`–`z10`（各 50）
- 解锁仍按 formal 列表顺序从第 1 关起；未改 `progress_store` / `editor.html` / motion feel50
- 旧存档若已打到 ch8，进入 z02 需继续通关解锁（id 未改 Z1）

## 已知限制（给 Lily）

1. **Z2–Z10 未真人试玩**；模板+种子变体，可能有偏难/偏易关  
2. **星级 provisional**；建议日后对抽样或全量跑 `bots.js` + `apply_stars.js`  
3. 后期区故意更紧；若手感过虐，优先调 `movesFor` / `density` / 送达清道逻辑，而不是加新障碍  
4. 发布包已打：`/workspace/jelly/releases/Jelly_Match3_feel500.tar.gz`（~2.6MB）  
5. GitHub / Drive 同步：本轮由家长代理推 feel500（见交接 CHANGELOG）

## 文件路径速查

- `docs/LEVELS_500_CURVE.md` — 坡度设计  
- `docs/LEVELS_500_STATUS.md` — 本状态  
- `tools/make_levels_500.js` — 生成器  
- `tools/make_levels.js` — 打包 + FORMAL 目录  
- `levels/levels_data.js` — 运行时数据  
- `levels/bot_report_sample500.json` — 抽样诊断  
