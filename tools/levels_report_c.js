// Writes docs/LEVELS_C.md (Chinese): per formal level / challenge — chapter role, intent, goals, moves, bot diagnosis, provisional stars.
'use strict';
const fs = require('fs'), path = require('path');
global.window = {}; require('../levels/levels_data.js');
const D = window.JELLY_LEVELS, B = require('../levels/bot_report.json'), V = require('../levels/validation_report.json');
const ROLE = { teach: '教学', normal: '常规', challenge: '章节挑战', relax: '放松', challenge_fixed: '固定条件挑战' };
const GN = g => g.type === 'collect_piece' ? '收集 ' + g.typeId.replace('jelly_', '') + '×' + g.count : g.type === 'clear_underlay' ? '清糖霜(全部)' : g.type === 'deliver' ? '送达果篮(全部)' : g.typeId === 'gummy_tie' ? '解绑带(全部)' : '开饼干箱(全部)';
const pc = x => x == null ? '—' : Math.round(x * 100) + '%';
let out = '# 阶段C 正式关卡与挑战（自动生成：node tools/levels_report_c.js）\n\n';
out += `机器人诊断：${B.tool}，策略 ${Object.entries(B.strategies).map(([k, v]) => k + ' v' + (v.version || v)).join('、')}；每关每策略 ${B.seeds.n} 个 seed（${B.seeds.from}–${B.seeds.to}）；不使用道具；core ${B.coreVersion} / ${B.rulesetVersion} / ${B.scoreVersion} / ${B.rngAlgo}。\n\n`;
out += '> 机器人胜率 ≠ 玩家通过率。random_legal = 随机合法交换（下限参考）；goal_greedy = 单步前瞻（会“偷看”真实补子，强于真人的可见信息，偏乐观）。星级 = goal_greedy 通关分数的 p10/p35/p80（bot_greedy_quantiles_v1），状态 provisional_bot_derived，需真人试玩校准。\n\n';
function rows(ids) {
  let t = '| 关卡 | 定位 | 步数 | 目标 | 随机胜率 | 贪心胜率 | 贪心用步 p50 | 暂定星级 | 校验警告 |\n|---|---|---|---|---|---|---|---|---|\n';
  ids.forEach(id => { const d = D.levels[id], b = B.levels[id], s = b && b.summary, v = V[id];
    t += `| ${d.displayName} (${id}) | ${ROLE[d.editorNotes.chapterRole] || d.editorNotes.chapterRole} | ${d.moveLimit} | ${d.goals.map(GN).join(' + ')} | ${pc(s && s.random_legal.winRate)} | ${pc(s && s.goal_greedy.winRate)} | ${s && s.goal_greedy.movesUsedWinP50 != null ? s.goal_greedy.movesUsedWinP50 : '—'} | ${d.scoring.stars.join('/')} | ${(v.issues || []).filter(x => x.startsWith('warn')).map(x => x.slice(5)).join(', ') || '—'} |\n`; });
  t += '\n'; ids.forEach(id => { const d = D.levels[id]; t += `- **${id}** 设计意图：${d.editorNotes.intent || d.editorNotes.designIntent || ''}${d.editorNotes.playerTip ? '；关前提示：“' + d.editorNotes.playerTip + '”' : ''}\n`; });
  return t + '\n';
}
D.catalog.chapters.filter(c => c.formal).forEach(c => { out += '## ' + c.name + '\n\n' + rows(c.levels); });
out += '## 固定条件挑战\n\n' + rows(D.catalog.challenges.map(c => c.levelId));
out += '固定配置（configKey）：\n\n' + D.catalog.challenges.map(c => '- `' + c.configKey + '`').join('\n') + '\n\n挑战关的机器人数据来自 100 个不同 seed；正式挑战只用固定 seed，单一 seed 的难度可能偏离该分布。\n';
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'LEVELS_C.md'), out); console.log('wrote docs/LEVELS_C.md', out.length);
