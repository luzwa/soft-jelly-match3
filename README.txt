果冻三消 Jelly Match-3 · Web · v3.3.0-stageC（计分 · 30 关 · 进度 · 固定挑战）
=========================================
阶段C（详见 docs/STAGE_C.md、docs/LEVELS_C.md、docs/RULE_DECISIONS.md）
- 打开 index.html 先进入选关页：5 章 × 6 关，通关开放下一关；关前目标预览；最后一关后进入章节完成页。
- “挑战”标签：3 个固定条件挑战（无道具、无额外步数、固定 seed），只记本机成绩：按总分、余步排序，同分并列，没有全球排行榜。
- 进度存档 jelly_m3_progress_v2（自动从 v1 迁移，旧存档保留）；个人最佳按计分版本/内容修订分组，无道具最佳单独记录。
- 星级为暂定值（机器人诊断推算），30 关未经真人试玩。
- 开发入口：?level=<id>&seed=N 直达；?dev=1 进入旧开发关并打开开发面板。
- 测试：node tests/stageC_levels.test.js；node tests/e2e_stageC.js [url] [outDir] [--video]（需 playwright-core + Chrome）。
- 所有验证在无头浏览器中完成，未经真机/真人手感验证。

果冻三消 Jelly Match-3 · Web · v3.2.0-C0（计分核心与表现 · 检查点）
=========================================
阶段C0（详见 docs/STAGE_C.md、docs/RULE_DECISIONS.md）
- 计分核心 js/score_service.js（jelly_score_v1）：每波得分、连消倍率、技巧连击、送达、通关 2000 + 余步 500×N；规则核心统一结算，表现层只播放。
- 计分表现：顶部总分（等宽字体）+“本次 +N”，单一滚动追分；每波最多 2 个合并标签；中央大字只在第 3/5/8 波与关键组合出现；结算面板逐步揭示、可点击跳过、明细折叠。
- 进度存档 v2（jelly_m3_progress_v2，从 v1 迁移）；测试关/编辑器试玩永不写进度。
- 测试：node tests/stageC0_score.test.js；node tests/stageC_progress.test.js；node tests/e2e_stageC0.js。
- 所有验证在无头浏览器中完成，未经真机/真人手感验证。

果冻三消 Jelly Match-3 · Web · v3.1.0-stageB（绑带 · 送达与出口 · 特殊能力审计）
=========================================
阶段B（详见 docs/STAGE_B.md）
- 软糖绑带：被绑果冻不能交换/下落/被洗牌，可原地参与匹配或被直接攻击解绑；可作为“清除障碍”目标。
- 送达：果篮（不可匹配、不可交换、免疫攻击、受重力）落到出口格才计数；出口只能在竖直段最下方；一次操作可连续送达多个。
- 特殊能力审计：划线/区域/同色与六种组合沿用既有规则；新增“彩虹+划线/炸弹无可转换目标时拒绝且不扣步”。
- 编辑器：出口、绑带、果篮画笔 + 兼容矩阵拒绝 + 送达/绑带目标 + A/B/C 校验。
- 阶段B 验证关：index.html?level=vb_01_ties … vb_06_board_attack；样例关 b_tie_intro、b_deliver_intro。
- 新美术（绑带/果篮/出口/目标图标）为占位图 PLACEHOLDER。
- 测试：node tests/stageA_core.test.js；node tests/stageB_core.test.js；node tests/e2e_stageB.js；node tests/demo_stageB.js（需 playwright-core + Chrome）。
- 所有验证在无头浏览器中完成，未经真机/真人手感与美术验收。

果冻三消 Jelly Match-3 · Web · v3.0.0-stageA（障碍 · 关卡数据 · 关卡编辑器）
=========================================
阶段A（详见 docs/STAGE_A.md）
- 纯确定性规则核心 js/rules_core.js：游戏、编辑器试玩、规则测试共用；目标/耐久/胜负在核心判定，表现层只回放事件；同 seed 同输入同结果。
- 两种障碍：糖霜地垫（1–2 层）、饼干箱（1–3 HP，挡掉落、不挡直线攻击、下方不补子）；同一障碍每个结算波最多 −1。占位美术（PLACEHOLDER）。
- 版本化关卡数据 levels/src/*.json → levels/levels_data.js（node tools/make_levels.js）；校验 A 结构错误 / B 禁止发布 / C 警告。
- 关卡编辑器：双击 editor.html（file:// 可用）：分层摆放、目标与步数、撤销重做、草稿、导入导出、校验定位、真实试玩、同 seed 重试、返回原草稿。
- 正式游戏：index.html；?level=<id>&seed=N 直接进关；?dev=1 / Shift+D 开发面板可“载入关卡 JSON”。
- 测试：node tests/stageA_core.test.js；node tests/e2e_stageA.js（需 playwright-core + Chrome）。
- 所有验证在无头浏览器中完成，未经真机/真人手感验证。

果冻三消 Jelly Match-3 · Web · v2.2.0-mobile（手机性能版）
=========================================
v2.2（详见 docs/PERF_v2.2.md）
- 画布分层 + WebGL 批处理 + DPR 上限 + 粒子对象池 + 256px 贴图，画面保持 v2.1（含八爪鱼 B）。
- 自动画质分档 high / medium / low（带迟滞）；?q=high|medium|low 强制档位；?dev=1 显示性能面板（档位 / fps / 帧时间）。
- 数据来自无头浏览器 + CPU 降速模拟，未经真机验证。

果冻三消 Jelly Match-3 · Web V2「Q弹软糯」 · v2.1.0-octoAB（第一阶段候选）
=========================================
v2.1 第一阶段（详见 docs/AUDIT_v2.1.md 与 docs/CHANGES_v2.1.md）
- 软体模拟改为固定 1/120 s 时间步 + 插值 + 后台恢复限幅 + 稳定棋子休眠（所有棋子；弹性参数未改）。
- 八爪鱼 A/B 显示样板（仅开发用）：默认 A（=V2）；?octo=B 或 ?dev=1 开发面板 / Shift+D 切换到 B（二维模拟驱动的轻量三维外壳 + 固定灯光）。
  B 为候选方案，尚未经过真机手感与美术验收。
打开方式：双击 index.html（Chrome / Edge，file:// 直接可玩，无需服务器、无 CDN、无构建）。

V2 新增
- 软体果冻：每颗果冻是 6×6 贴图网格 + 形状匹配弹簧模拟（WebGL2/WebGL 渲染，不支持时自动降级 Canvas2D；?renderer=2d 可强制 2D）。
  小熊最结实、无花果软糯、水母最软，章鱼/鱿鱼/水母的触手会拖后摆动；落地抖动、邻居落地也会晃、呼吸感。
- 触感：按住会在手指处被按出凹陷；拖动先像橡皮一样被拉长再“啪”地换位；松手不换位会弹回并晃动；
  轻点有各自反应（河豚鼓起、水母上浮、章鱼甩触手、鱿鱼甩动、无花果压扁、小熊蹦一下）；支持 navigator.vibrate 震动。
- 消除反馈：先挤压蓄力再爆开，同色果冻汁飞溅 + 地面汁渍、冲击环、得分飘字、大消除短暂停顿（hit-stop）与震屏，
  周围果冻被冲击推晃，整颗果冻带旋转拉伸弹飞出屏幕。
- 连消：弹跳的「连消 ×N」横幅、递升音高的和弦、COMBO 计量条、棋盘发光，夸奖词：好Q! / 超弹! / 软糯爆发! / 果冻狂欢!
- 特殊果冻：4 连 → 条纹（整行/整列扫除）；L/T 形 → 炸弹（3×3 爆炸，冲击波传遍棋盘）；5 连 → 彩虹（电弧消除同色）。
  组合：条纹+条纹 十字；条纹+炸弹 三行三列；炸弹+炸弹 5×5；彩虹+普通 消除该色；彩虹+条纹/炸弹 把该色全部变成特殊果冻再引爆；彩虹+彩虹 全屏。
  小锤敲特殊果冻会直接引爆。
- 合成音效：按压、弹簧 boing、湿润的 pop、升调连消和弦、条纹/炸弹/彩虹专属音效（设置中可静音）。
- 设置：音效 / 减少动态 / 震动 开关。

文件：index.html；js/config.js（规则数据内联）；js/sprites.js（果冻贴图 data URI，保证 file:// 下 WebGL 可用）；
js/core.js（缓动、时钟、音频、震动）；js/softbody.js（软体模拟）；js/renderer.js（WebGL/2D 渲染）；js/game.js（游戏逻辑与界面）。
