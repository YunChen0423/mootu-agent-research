import { readFile, writeFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';
import { runAIAgent } from '../../ai-agent.mjs';
import { scoreFollowup } from './score.mjs';
const root = dirname(fileURLToPath(import.meta.url)), project = resolve(root, '../..');
const hash = text => createHash('sha256').update(text).digest('hex');
const casesText = await readFile(`${root}/cases.json`, 'utf8');
const cases = JSON.parse(casesText);
const rounds = Number(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || 3);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw Error('rounds must be 1–10');
if (!process.env.DEEPSEEK_API_KEY) throw Error('Explicit model key required; no rule fallback');
const config = JSON.parse(await readFile(`${project}/public/config/actions.json`, 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = `${root}/results/${stamp}`;
await mkdir(`${root}/results`, { recursive: true });
await mkdir(out); // Never overwrite a previous experiment.
const sourceManifest = {}, sourceSnapshot = {};
for (const path of ['ai-agent.mjs', 'public/agent-engine.js', 'public/config/actions.json', ...((await readdir(`${project}/agent`)).filter(f => f.endsWith('.mjs')).map(f => `agent/${f}`)), 'eval/autonomy-v2/score.mjs', 'eval/autonomy-v2/run.mjs']) { sourceSnapshot[path] = await readFile(`${project}/${path}`, 'utf8'); sourceManifest[path] = hash(sourceSnapshot[path]); }
const metadata = { startedAt: new Date().toISOString(), model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', providerOrigin: new URL(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').origin, rounds, concurrency: 2, sampling: 'provider defaults; no temperature or seed override; not a determinism guarantee', node: process.version, datasetSha256: hash(casesText), sourceManifest, config, rubric: 'Legacy strategy agreement and new autonomy contracts reported separately. Author synthetic; not independently labelled or held out.' };
await writeFile(`${out}/metadata.json`, JSON.stringify(metadata, null, 2) + '\n');
await writeFile(`${out}/source-snapshot.json`, JSON.stringify({ files: sourceSnapshot, cases, verifiedAgainstMetadata: true }, null, 2) + '\n');
console.log(`Output: ${out}`);
const tasks = cases.flatMap(item => Array.from({ length: item.id === 'stalled-1' ? 1 : rounds }, (_, i) => ({ item, round: i + 1 })));
let cursor = 0;
const records = [];
async function worker() {
  while (cursor < tasks.length) {
    const { item, round } = tasks[cursor++];
    const file = `${item.id}.run-${round}`;
    const started = Date.now();
    let record;
    console.log(`START ${file}`);
    try {
      const result = await runAIAgent({ ...item.session, config, onProgress: async value => appendFile(`${out}/${file}.progress.jsonl`, JSON.stringify(value) + '\n') });
      if (result.mode !== 'deepseek') throw Error('Unexpected model fallback');
      record = { id: item.id, round, status: 'complete', elapsedMs: Date.now() - started, score: scoreFollowup(item, result), result };
    } catch (error) { record = { id: item.id, round, status: 'failed', error: error.message, time: error.time, trace: error.trace || [], partialEvents: error.partialEvents || [] }; }
    await writeFile(`${out}/${file}.json`, JSON.stringify(record, null, 2) + '\n');
    records.push(record);
    await writeFile(`${out}/progress.json`, JSON.stringify({ completed: records.length, total: tasks.length }) + '\n');
    console.log(`DONE ${file}: ${record.status}, contract=${record.score?.contractPassed}, legacy=${record.score?.legacyPassed}`);
  }
}
await Promise.all([worker(), worker()]);
const summaries = cases.map(item => {
  const runs = records.filter(r => r.id === item.id).sort((a, b) => a.round - b.round);
  const times = [...new Set(runs.flatMap(r => r.result?.events.map(e => e.time) || []))];
  const identicalWindows = times.filter(time => {
    const values = runs.map(r => r.result?.events.find(e => e.time === time));
    return values.every(Boolean) && new Set(values.map(e => JSON.stringify([e.strategy, e.target, e.stage]))).size === 1;
  }).length;
  return { id: item.id, runs: runs.length, completed: runs.filter(r => r.status === 'complete').length, contractPasses: runs.filter(r => r.score?.contractPassed).length, legacyPasses: runs.filter(r => r.score?.legacyPassed).length, identicalWindows: runs.length > 1 ? identicalWindows : null, windowCount: times.length };
});
await writeFile(`${out}/summary.json`, JSON.stringify({ metadata, completedAt: new Date().toISOString(), summaries }, null, 2) + '\n');
const rel = relative(root, out);
const lines = ['# 意愿状态修复后的定向复测', '', `模型：${metadata.model}；时间：${new Date().toISOString()}。`, '', '拒绝用例延长到 180 秒，用于验证超出近期逐字稿窗口后的保留；思考用例检查有效期内保持安静、到期后解除约束；单人停滞只跑一遍，不能用于稳定性结论。旧检查点标签没有修改，新约束评分另列，不能与旧 30/36 当作同口径提升比较。', '', '|用例|完成|意愿/结构约束符合|旧检查点符合|重复决策完全一致窗口|', '|---|---:|---:|---:|---:|', ...summaries.map(s => `|${s.id}|${s.completed}/${s.runs}|${s.contractPasses}/${s.runs}|${s.legacyPasses}/${s.runs}|${s.identicalWindows == null ? '未重复' : `${s.identicalWindows}/${s.windowCount}`}|`), '', ...records.sort((a,b) => a.id.localeCompare(b.id) || a.round-b.round).map(r => `- [${r.id} 第 ${r.round} 轮](${rel}/${r.id}.run-${r.round}.json)：${r.status}${r.status === 'failed' ? `（${r.error}）` : ''}`), '', '这些是开发集上的合成回归，尚无独立人工标签或真人效果证据。合同通过不代表语义理解总是正确，也不代表不必要介入问题已解决。'];
await writeFile(`${root}/RESULTS.md`, lines.join('\n') + '\n');
console.log(JSON.stringify(summaries, null, 2));
if (records.some(r => r.status !== 'complete' || !r.score.contractPassed)) process.exitCode = 1;
