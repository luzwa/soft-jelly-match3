# v3.2/3.3 Stage C PROGRESS
Specs: specs/Jelly_Match3_Scoring_LightCompetitive_Addendum_V2.md (overrides V1 where explicit), V1 §9.3/§12–16, specs/stageC_instructions_zh.md. Stage B progress kept as docs/PROGRESS_v3b.md.
## 18:18 UTC+8 — started: copied game_v3b → game_v3c
## 18:22 UTC+8 — M1 C0 scoring core
- js/score_service.js (JellyScore, jelly_score_v1, frozen CONFIG, ledger/breakdown/ledgerHash, finalize idempotent); loaded before rules_core in index/editor.
- rules_core 3.2.0-C0: scoreTokenId (tok) through normal→special; commitWave → scoreWave (pieces/frost/crate hp+kill/ties/natural creations/active combo first wave); deliver → scoreDelivery 1000; beginAction/endAction (skill streak); endTurn finalize (2000 + 500×moves). wave/deliver/end events carry ev.sc. stateHash includes score+streak.
- tests: stageC0_score 16/16 (§10 A–G exact, oracle on 102 games / 2755 waves, determinism, refusals, streak, baskets, hammer under basket); stageA_core 24/24; stageB_core 23/23 (last test now = rule continuity vs fixture tests/fixtures/rules_ref_v3.1.0-stageB.json, 102 identical).
- docs/RULE_DECISIONS.md written.
- NEXT: C0 presentation in game.js (score widget, chaser, wave popups, centre text, result panel, skip), tray check, e2e, video, checkpoint zip v3.2.0-C0.
## 18:45 UTC+8 — M2 C0 presentation done → checkpoint v3.2.0-C0
- game.js: score widget (26 px mono total + “本次 +N”), single rolling chaser (≤400 ms after last points, hard cap 600 ms), per-wave merged popups (≤2 tags: “N连消 · 得分×k” / “技巧N连 · +X”), centre text only waves 3/5/8 + active combos (≤40% board width, 80+220+100 ms, replaces), fly-offs/crate fx fade before the tool row, result panel (actionTotal → +2000 → +500×moves, tap-skip, folded details, record line, max cascade / best skill chain), top total == result total.
- progress_store.js (jelly_m3_progress_v2, migration from v1, read-only on corrupt/newer); level_schema blockedCells + editor “受阻区域” overlay; tray under obstacles checked (shots_v3c/tray_*).
- tests: stageC_progress 11/11; e2e_stageC0 29/29 (+ shots_v3c/C0_score_demo.mp4 390×844); stageA/B/C0 core 24/23/16; e2e_stageA 27/27; e2e_stageB 26/26 (first run 25/26: pre-existing seed-random flake in “hammer released the tie” — exported-file run uses a random seed and a cascade matched the 2nd host; rerun 26/26); QA http/B/2d 19/19 each, file 2/2, toggle 13/13, tier final=high.
- perf 4× CPU (swiftshader, headless): v3b vs v3c idle avg 24–29 vs 28 ms, cascade 54 vs 49, combo 67 vs 68 — within run-to-run noise.
- Checkpoint has NO formal chapters yet (catalog = v3b dev chapters, nothing writes progress). Level select / 30 levels / challenges follow in C1/C2.
## 18:47 UTC+8 — checkpoint releases/Jelly_Match3_Web_v3.2.0-C0.zip (+ VERSIONS line; other release files md5-unchanged)
## 19:10 UTC+8 — M3 C1/C2 done
- 30 formal levels + 3 challenges in levels/src; catalog v2 (formal ch1–ch5, dev chapters formal:false, frozen challenge configs); bots 100 seeds × 2 strategies → levels/bot_report.json; provisional stars applied; docs/LEVELS_C.md.
- js/menu.js level select / preview / chapter complete / challenge list; game.js chapter flow, challenge mode (fixed seed, no tools, validity), debug taint, ?dev=1 → legacy_01.
- tests: stageC_levels 12/12; e2e_stageC 30/30 (http + video, file://); full regression green (see STAGE_C.md §2).
