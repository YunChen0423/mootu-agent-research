import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const evaluation = resolve(root, '..');
const baseline = 'results/stability/2026-10-27T06-34-06-891Z';
const manifest = JSON.parse(await readFile(`${evaluation}/testsets/manifest.json`, 'utf8'));
const cases = (await Promise.all(manifest.filter(s => s.kind === 'decision').map(async suite => (await readFile(`${evaluation}/testsets/${suite.path}`, 'utf8')).trim().split('\n').map(JSON.parse)))).flat();
const files = {}, runs = [];
const explanations = {
  'balanced-1': ['strategy_quality_review', '均衡且仍有新方案，模型改为追问比较条件。是否属于不必要打断需要独立标注，不能仅靠自身效用分证明合理。'],
  'quiet-1': ['utility_margin_gate', '模型提出了邀请，但与观察的效用差为 6，低于程序门槛 8；不是模型完全没有识别到安静成员。不能为追分直接降低门槛。'],
  'stalled-1': ['confidence_gate_or_single_member_bug', '首轮开放问题因模型自报置信度 55 < 60 被拦截；第三轮点名唯一成员，暴露了缺少至少两名成员的相对低参与前置条件。'],
  'declines-invitation': ['rubric_scope_mismatch', '第三轮向全组提问且未点名吴，不符合旧 observe 标签，但不能据此判为违反吴的拒绝。是否应打断仍需独立判断。'],
  'repeated-idea-paraphrases': ['strategy_quality_review', '候选理由已提到想法属于同一簇，但执行选择仍波动；不能将观察直接归因为完全没有识别语义重复。']
};
for (const item of cases) for (let round = 1; round <= 3; round++) {
  const path = `${baseline}/${item.id}.run-${round}.json`;
  const text = await readFile(`${evaluation}/${path}`, 'utf8');
  files[path] = createHash('sha256').update(text).digest('hex');
  const raw = JSON.parse(text);
  const mismatches = item.checkpoints.flatMap(label => {
    const event = raw.result?.events.find(e => e.time === label.time);
    const passed = event && label.acceptableStrategies.includes(event.strategy) && (label.stage == null || label.stage === event.stage) && (label.target == null || event.strategy === 'invite_quiet_member' && event.target === label.target);
    return passed ? [] : [{ time: label.time, expected: label, actual: event ? { strategy: event.strategy, target: event.target, stage: event.stage, reason: event.reason, selectionMargin: event.selectionMargin, candidates: event.candidates } : null }];
  });
  runs.push({ id: item.id, round, originalPassed: raw.passed, rescoredLegacyPassed: !mismatches.length, mismatches, category: mismatches.length ? explanations[item.id]?.[0] || 'needs_review' : null, explanation: mismatches.length ? explanations[item.id]?.[1] || '需要逐项审查' : null });
}
const changed = runs.filter(r => r.originalPassed !== r.rescoredLegacyPassed);
const report = { createdAt: new Date().toISOString(), purpose: 'Read-only baseline audit; no model calls or relabelling.', legacyPasses: runs.filter(r => r.rescoredLegacyPassed).length, runs: runs.length, originalScoreDisagreements: changed.length, baselineHashes: files, failures: runs.filter(r => !r.rescoredLegacyPassed) };
await writeFile(`${root}/BASELINE-AUDIT.json`, JSON.stringify(report, null, 2) + '\n');
const lines = ['# 旧基线失败审计', '', `沿用原标签重算：${report.legacyPasses}/${report.runs}，与原记录差异 ${changed.length} 次。没有修改旧数据、标签或结果。`, '', '|用例|轮次|审计发现|', '|---|---:|---|', ...report.failures.map(r => `|${r.id}|${r.round}|${r.explanation}|`), '', '## 评分口径', '', '- 保留“原检查点策略符合率”，不通过放宽标签宣称模型提升。', '- 新增意愿约束评估：是否向拒绝成员点名、是否打断有效思考期、偏好是否被正确提取并跨窗口保留；与策略质量分开报告。', '- 面向全组的问题不自动判为违反个人拒绝；它是否是一次合适的介入仍需独立人工审查。', '- 候选理由只是模型的自述，不能作为语义正确性金标准；效用权重和置信度门槛没有校准证据。', '- 新用例是开发集回归；暂无独立 holdout 或独立人工标签。', '', '## 实现修复', '', '增加有原话/说话人/时间证据的意愿状态，逐窗口更新、过期、本人明确撤销；在效用排序前过滤违反意愿或缺少相对参与证据的候选。最高分候选不合格时仍检查其他合格候选，不强迫发言或降低原门槛。', '', '详见 [实现与限制](README.md)、[定向复测](RESULTS.md) 和 [完整审计数据](BASELINE-AUDIT.json)。'];
await writeFile(`${root}/BASELINE-AUDIT.md`, lines.join('\n') + '\n');
console.log(JSON.stringify({ legacyPasses: report.legacyPasses, total: report.runs, disagreements: changed.length }));
if (changed.length) process.exitCode = 1;
