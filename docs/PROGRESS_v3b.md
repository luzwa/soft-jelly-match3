# v3.1.0-stageB PROGRESS
Spec: specs/Jelly_Match3_Level_Editor_Codex_Brief_V1.md 阶段B (§16, §19)
## 17:09 UTC+8 — started: copied game_v3a → game_v3b (Stage A progress kept as docs/PROGRESS_v3a.md)
## 17:14 UTC+8 — M1 core + schema + levels + core tests
- Audit: line(4直→⟂划线)/area(L/T→炸弹)/same-colour(5直→彩虹) and all six combos already exist in v2/v3a core → reused unchanged. Added: rainbow+line/bomb with no ordinary target → refused (no_target).
- rules_core: st.over (gummy_tie), basket occupant, st.exits, settle() = fall→deliver loop, hammer 'immune', tie hosts fixed for gravity/shuffle/swap. CORE 3.1.0-stageB, ruleset jelly_rules_v1 kept (stage A hashes identical).
- level_schema: exits/ties/baskets/deliver validation (A: exit_not_bottom/dup/void, tie_host, basket_on_exit, deliver_no_exit; B: basket_no_exit, deliver_short, no_baskets, tie_short).
- levels: verify_b (vb_01..06, 03/06 are rule-test fixtures), chapter_b samples (b_tie_intro, b_deliver_intro); invalid: bad_stage_b retired, 7 new bad_* samples.
- tests: stageA_core 24/24 (2 adapted: invalid map + 'stage-B refused' → 'beyond stage B refused'); stageB_core 23/23.
## 17:18 UTC+8 — M2 game + editor + art
- game.js: new canvas #cOver (ties + baskets, signature-redrawn), exits on board layer, deliver playback (deliver/fall events), tie release fx, goal icons __tie/__basket, refusals (tied tug, no_target, immune), visualCheck covers ties/baskets; debug ties()/baskets()/delivered().
- editor: exit brush (terrain), gummy_tie brush (overlay), delivery_basket brush (occupant), refusals per compatibility matrix, props text, goal UI (clear_obstacle typeId crate/tie, deliver), 显示覆盖层 toggle.
- obstacle_art.js: tie/basket/exit PLACEHOLDER; tools/export_obstacle_png.js → assets/obstacles (14 png + manifest, status PLACEHOLDER).
- regression: stageA e2e on v3b 27/27 (work3b/e2eA).
## 17:34 UTC+8 — M3 verification + docs + release
- Fixes: e2e props check re-selects a tied cell; tie dedup count clamped ≥0 for direct hits without atkN (display only; new assertion in stageB fuzz).
- stageA_core 24/24, stageB_core 23/23, e2e_stageB 26/26, e2e_stageA on v3b 27/27; QA qa_v21 http/B/2d 19/19 + file ok, toggle 13/13, tier sequence = v3a; 4× perf no regression (work3b/prof_results.jsonl).
- Demo: shots_v3b/stageB_demo.mp4 (95 s, captions) + demo_01..21 png.
- docs/STAGE_B.md written; README updated; zip releases/Jelly_Match3_Web_v3.1.0-stageB.zip + VERSIONS.md line.
