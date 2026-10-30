# v2.2 mobile — progress notes (resume file)

Updated: 2026-10-10 12:15 (UTC+8)

## Done
- Baseline v2.1 profiled (work22/prof_results.jsonl labels `v2.1`, `v2.1-rerun`, `*-count`). Tools: test/prof_v22.js, test/run_prof_v22.sh.
- Code (game_v2.2/js):
  - tiers high/medium/low + auto controller (hysteresis) + `?q=`; dev HUD `?dev=1`. Debug: `JellyDebug.tier()/tierInfo()/setTier()/layerStats()`.
  - GL DPR cap (2/1.75/1.5); 2D DPR 3 (low: 2).
  - cA dirty regions with a single bounding-rect clip.
  - cB skips work when empty; otherwise only clears/clips a bbox.
  - Board on its own canvas `cBoard` (shake = CSS transform); chain glow on its own low-res canvas `cGlow` (CSS opacity).
  - Decals drawn as GL atlas quads (atlas slots 6–7).
  - Banner/praise text sprites.
  - Renderer: persistent VBO + bufferSubData, pooled items, lit uniforms once per frame, front-only shell on medium/low.
  - Volume: NG per tier, static data cache.
  - softbody: scratch lerpPose, rigid flying pieces (medium/low).
  - Low tier sim H = 1/60 (verified: test/timestep_v2.2.js → work22/timestep_v2.2.txt).
  - Pooled/capped particles via sprites; pose double-buffer; audio suspended while hidden.
  - Assets: tools/make_mobile_assets.py (256px sprites + material, icons ≤192px, lossless PNG). Runtime download 4511 KB → 1957 KB.
- After-profiles: labels `v22b-high`, `v22b-auto`, `v22b-medium`, `v22b-low` (+ `-count`).

## Remaining
1. QA on 8841: `qa_v21.js` (QA_OUT=shots_v2.2/qa/) for http, `?octo=B`, `?renderer=2d`, file://. Also run test/toggle_v22.js and test/tier_v22.js.
2. Pixel-diff: test/visual_v22.js → shots_v2.2/visual/.
3. Demo: test/mobile_demo_v22.js 4 → shots_v2.2/mobile_demo.mp4. Settle log at 6x: `node mobile_demo_v22.js 6 -`.
4. Write docs/PERF_v2.2.md (Chinese) and add CHANGES.
5. Zip to releases/Jelly_Match3_Web_v2.2.0-mobile.zip (check md5 of the other release files before and after). Append a line to releases/VERSIONS.md.

Servers: 8821 = game_v2.1, 8831 = v2.1 instrumented, 8841 = game_v2.2 (`python3 -m http.server` from each dir).

## ~12:15 UTC+8 — QA re-run after resume
- qa_v21 http (q=high, auto), ?octo=B, ?renderer=2d, file://: all PASS, no console errors (logs work22/qa_*.txt)
- toggle_v22 PASS (q= forcing, clean UI, dev HUD, tier buttons); tier_v22: down high→medium→low under load, up back to high.
- Next: visual_v22 pixel diff → mobile demo → docs → zip.
- ~12:17 visual_v22 done: PSNR 34.5–36.9 dB, meanAbs 1.25–1.43, >16 diff 1.9–2.4% px (shots_v2.2/visual)
- 12:20 mobile_demo.mp4 done (390x844, 35 s, 4x, auto: high→medium@3.8s→low@9.5s; 6x same). QA all PASS. Next: PERF doc, zip.
- 12:20 PERF_v2.2.md + README v2.2 header written. Next: zip + VERSIONS.md.
- 12:20 DONE: zip releases/Jelly_Match3_Web_v2.2.0-mobile.zip (1.97 MB, file:// re-QA from unzipped copy PASS), VERSIONS.md line appended; other releases/ files md5-unchanged.
