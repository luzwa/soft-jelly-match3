# 阶段C 说明（v3.3.0-stageC，2026-10-10，UTC+8）

依据：增补 V2（明确覆盖处优先）、V1 §9.3/§12–16、`specs/stageC_instructions_zh.md`（本轮决定见 `docs/RULE_DECISIONS.md`）。
检查点 v3.2.0-C0（18:47 UTC+8）只含 C0；本版在其上完成 C1/C2。

## 1. 已完成

### C0 计分与表现
- 计分核心 `js/score_service.js`（`jelly_score_v1`，配置冻结）：每波基础分 × 连消倍率、制作奖、主动组合、果篮送达 1000、技巧连击（+0/300/700/1200/1800 封顶）、通关 2000 + 余步 500×N。由规则核心在波次/送达/回合结束时统一结算并写入账本，表现层只播放事件。
- 顶部：等宽 26 px 总分 + “本次 +N”；单一滚动追分（最后一次加分后 200–400 ms 追平，硬上限 600 ms）。
- 每波合并为一个飘字；标签最多 2 个：“N连消 · 得分×k”“技巧N连 · +X”；中央大字只在第 3/5/8 波与主动组合出现，≤40% 棋盘宽，80/220/100 ms，新的替换旧的、不排队。
- 飞出特效在工具栏上方淡出，棋盘与道具不被遮挡。
- 结算：操作分 → +通关 2000 → +余步×500 逐步揭示；点击只跳过动画，不改分、不重复发放；顶部总分 == 结算总分；显示新纪录/差值、最高连消、最佳技巧链；明细默认折叠。
- 障碍下方托盘与编辑器“受阻区域”覆盖显示（`blockedCells`）；vb_03 / vb_04 保留为规则夹具；测试关永不写进度、星级、纪录。

### C1 关卡与进度
- **默认入口 = 选关页**（DOM 覆盖层 `js/menu.js`，file:// 可用）：5 章 × 6 关列表，锁/星级/“下一关”高亮/定位（教学/挑战/放松）标记；关前目标预览（目标图标与数量、步数、暂定星级、本版最佳、无道具最佳、教学提示）。
- 闭环（V1 §15）：选关 → 关前目标 → 游戏 → 成功/失败 → 下一关/重玩/返回选关；第 1 关默认开放，通关开放下一关（跨章连续）；章节最后一关通关后进入“章节完成”页（显示通关数/星数，“下一章”或“已是最后一章”），不索引不存在的关卡。暂停菜单可返回选关。
- 进度存档 v2：独立命名空间 `jelly_m3_progress_v2`，首次从 `jelly_m3_progress_v1` 迁移（旧键原样保留，不删不改）；存档损坏或来自更新版本 → 本次只读并在选关页提示，绝不覆盖。
- 个人最佳按 `scoreVersion|contentRevision` 分组；“最佳”与“无道具最佳”分开记录；失败只计尝试次数，不改最佳。
- 30 关正式内容（`tools/make_levels_c.js` → `levels/src/c1_01…c5_06.json`，编辑器同一数据格式）：每关有设计意图、预期难度、章节定位，教学关有玩家提示；全部通过校验（0 A / 0 B，20/20 seed 初始化成功）。逐关表见 `docs/LEVELS_C.md`。
- 机器人诊断（V1 §13.1）：`tools/bots.js`，策略 `random_legal v1`、`goal_greedy v1`，每关每策略 100 个 seed（1–100），不用道具，报告 `levels/bot_report.json`（含操作结果、hash、样本量）。
- 暂定星级：`tools/apply_stars.js`，方法 `bot_greedy_quantiles_v1` = goal_greedy 通关分数的 p10/p35/p80（不足 10 局通关时回退到全部机器人通关分，再不足用公式），写入每关 `scoring.starsStatus = provisional_bot_derived`、`starsMethod`、`starsBasis`。选关页与预览标注“暂定”。
- 调试介入（seedBoard / setMoves / setGoalsLeft）会把本局标记为 tainted：不写进度、不写纪录，结算页说明原因。

### C2 纪录与固定条件挑战
- 3 个挑战（独立于章节，选关页“挑战”标签）：特效工坊（偏特殊构造）、层层剥开（偏障碍处理）、果篮快递（偏综合送达）。
- 固定条件：无盘外道具（库存 0）、无额外步数、无开局增益；固定 seed（20261010/11/12）；“再次挑战”永远同 seed、同开局。
- 比较键 `configKey` = mode | challengeId | levelId | 内容修订 | 可玩内容 hash（棋盘/开局/生成池与权重/步数/目标/道具）| 规则版本 | 计分版本 | 随机算法版本 | seed | 步数 | 初始盘面 hash。游戏开局重新计算并核对；任一项不一致、调试介入、结算保护（max_waves）触发、使用道具 → 不进入成绩榜。
- 排序：仅“目标完成且有效”的局上榜；总分降序 → 余步降序 → 仍同则并列（显示“并列”）；不使用用时；未通关局只保留尝试次数与“未通关最高分”，不压过通关成绩；每组保留前 10。
- 只显示本机纪录，并明确写出“没有全球排行榜”；无任何伪造的联网名次或百分位。

## 2. 已验证（无头 Chrome + Node；2026-10-10 19:00 前后 UTC+8）
| 项目 | 结果 |
|---|---|
| stageA_core / stageB_core（102 局规则哈希与阶段B一致） | 24/24、23/23 |
| stageC0_score（增补 §10 A–G、账本 oracle 102 局 / 2755 波） | 16/16 |
| stageC_progress（迁移、只读、分组、无道具、挑战排序/并列/无效） | 11/11 |
| stageC_levels（目录、33 关校验、意图/定位/提示、暂定星级字段、挑战配置可复现） | 12/12 |
| e2e_stageA / e2e_stageB / e2e_stageC0 | 27/27、26/26、29/29 |
| e2e_stageC（http 录屏版 + file:// 版） | 30/30、30/30 |
| 旧 QA：qa_v21 http / octo B / 2d / file、toggle、tier | 19/19、19/19、19/19、2/2、13/13、final=high |
| 4× CPU 降速（swiftshader，390×844 DPR3）| 见下 |

性能（帧间隔 avg / p95 ms，JS avg ms）：
- v3.1.0-stageB：idle 24–29 / 33–50，1.1–1.3；cascade 54 / 117，6.7；combo 67 / 217，10.7
- v3.3.0-stageC：idle 19–28 / 33–50，0.95–1.3；cascade 47–49 / 100，5.0–5.7；combo 66–68 / 133–150，9.3–9.9
- 差异在多次运行噪声内；选关页打开时游戏循环不做任何工作。

交付物：`shots_v3c/C0_score_demo.mp4`（390×844，正常速度）；`shots_v3c/stageC/C1_C2_walkthrough.mp4`（390×844，65 s：选关 → 预览 → 真实拖动通关 → 下一关 → 返回选关 → 调试局不写入 → 章节完成 → 下一章 → 挑战两次同分并列 → 只读存档）与 `C1_01…C1_09` 截图；`docs/LEVELS_C.md`。

## 3. 未验证
- 真机、真人手感、字体在真实设备上的渲染；分数动画节奏只在无头浏览器与录屏中检查。
- **30 关难度未经真人试玩**（V1 §13.2 要求 5–8 位试玩者）：全部标为“结构校验 + 机器人诊断，未试玩”。机器人胜率 ≠ 玩家通过率。
- goal_greedy 单步前瞻会“偷看”真实补子，比真人掌握的信息多，星级阈值可能偏高（尤其 3 星）；需真人数据校准。
- 挑战关的机器人数据来自 100 个不同 seed，而正式挑战只用一个固定 seed；该 seed 的具体难度只由 e2e 的一局（特效工坊，贪心通关 45400 分）与机器人分布间接反映。

## 4. 已知问题
- 第一章机器人通关很快（贪心 p50 只用 3–4 步），教学关偏松；第五章“综合挑战”c5_05 随机策略 0%、贪心 66%，可能偏难。均待真人试玩后调整。
- 校验 C 级警告 few_moves：c2_05 / c3_04 / c4_05 开局平均可用交换偏少（约 2.4–2.7 个，可能出现“只有一个选择”）；第五章多关有 cut_off（箱子/去角使局部暂时断供），属有意设计但需试玩确认不会“等颜色”。
- `?level=<id>` 是开发/QA 直达入口：可直接进入未解锁的正式关，且该局会正常写进度（同一内容、同一规则）。正式玩家入口是选关页。
- `?dev=1` 跳过选关页并进入第一个开发章节（legacy_01，旧默认关），以保持开发习惯与阶段 A/B 测试不变。
- 旧 v1 进度只记录了 legacy_01…03（现为开发章节），迁移后保留为“旧版”记录，但不解锁正式第 1–5 章；正式章节从 1-1 开始。
- 技巧连击第 1 次（+0）也显示“技巧1连”标签（无“+X”），用于提示链已开始。
- e2e_stageB“小锤解绑”一项载入导出文件时用随机 seed，偶发连锁导致失败（本轮一次 25/26，重跑 26/26），为阶段B 测试既有的不确定性，非规则回归。

## 5. 规格冲突与取舍
- 见 `docs/RULE_DECISIONS.md` §5（增补 A–G 与公式一致；F 为合成例子；彩虹＋特殊取色按本轮决定；旧星级尺度全部重设为暂定）。
- **QA 夹具变更**：默认入口改为选关页后，旧的 qa_v21 / toggle / tier 脚本需加 `?level=legacy_01`（`test/toggle_v22_c.js`、`test/tier_v22_c.js` 仅在每个 goto 加此参数；qa_v21 通过 URL 参数传入）。阶段 A/B/C0 的 e2e 脚本本身未修改。
- 增补 §14 要求比较键含 initialStateHash：实现为核心 `stateHash`（开局盘面 + 状态）；另加“可玩内容 hash”以覆盖生成权重等在 contentRevision 未递增时的变化。星级重标不改变比较键（星级不属于可玩内容）。
- V1 §15 “地图先用清晰的章节列表”：采用章节列表，无地图美术。
- 挑战关显示的星级同样来自机器人（暂定），只作参考；挑战排名只看总分与余步。

## 6. 文件
- 新增：`js/menu.js`、`js/progress_store.js`、`js/score_service.js`、`tools/bots.js`、`tools/apply_stars.js`、`tools/level_dsl.js`、`tools/make_levels_c.js`、`tools/levels_report_c.js`、`levels/src/c*_*.json`、`levels/src/chal_*.json`、`levels/bot_report.json`、`tests/stageC0_score.test.js`、`tests/stageC_progress.test.js`、`tests/stageC_levels.test.js`、`tests/e2e_stageC0.js`、`tests/e2e_stageC.js`、`docs/LEVELS_C.md`、`docs/RULE_DECISIONS.md`。
- 重新生成：`node tools/make_levels_c.js && node tools/make_levels.js && node tools/bots.js --levels <ids> --seeds 100 && node tools/apply_stars.js levels/bot_report.json && node tools/make_levels.js && node tools/levels_report_c.js`。
