import {readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const suites=JSON.parse(await readFile(`${root}/testsets/manifest.json`,'utf8'));
const lines=['# 规则与真实模型对照','','仅比较同一测试集的当前保存结果。用例通过要求所有指定检查点均符合；投票和输入协议由相同确定性代码执行，不代表模型贡献。','','|测试组|规则基线|真实模型|数据一致|','|---|---:|---:|---|'];
const details=[];
for(const suite of suites){
 const rule=JSON.parse(await readFile(`${root}/results/testsets/rule/${suite.id}/suite-report.json`,'utf8'));
 const model=JSON.parse(await readFile(`${root}/results/testsets/model/${suite.id}/suite-report.json`,'utf8'));
 const same=rule.datasetSha256===model.datasetSha256;
 if(!same)throw new Error(`${suite.id} 数据哈希不一致，不能直接比较`);
 lines.push(`|${suite.title}|${rule.passed}/${rule.cases}|${model.passed}/${model.cases}|相同|`);
 if(suite.kind==='decision'){
  const modelReport=JSON.parse(await readFile(`${root}/results/testsets/model/${suite.id}/report.json`,'utf8'));
  const ruleReport=JSON.parse(await readFile(`${root}/results/testsets/rule/${suite.id}/report.json`,'utf8'));
  if(ruleReport.metadata.configSha256!==modelReport.metadata.configSha256)throw new Error('配置哈希不一致');
  details.push('',`### ${suite.title}`,`\n模型：${modelReport.metadata.model}；成功执行 ${modelReport.coverage.sessionsCompleted}/${modelReport.coverage.sessionsCompleted+modelReport.coverage.sessionsFailed} 个会话；动作约束违规 ${modelReport.invariantViolations.length}。`, '\n|用例|规则|模型|模型不符原因|','|---|---|---|---|');
  for(const item of model.results){
   const previous=rule.results.find(r=>r.id===item.id);
   details.push(`|${item.id}|${previous.passed?'通过':'不符'}|${item.passed?'通过':'不符'}|${item.mismatches.join('；').replace(/\|/g,'\\|')}|`);
  }
 }
}
lines.push('','## 决策用例详情','',...details,'','## 解释范围','','- 所有测试仍为作者合成，标签未独立人工验证。模型单次运行，不报告稳定性或统计显著性。','- 差异可能来自模型提案，也可能来自 Harness 拒绝/保护规则；需要结合各用例的 candidates、reason 和 trace 审计。','- 请求失败是运行失败，不能解释成该会话已产生一个错误策略。','- 当前没有 provider usage/cost 统计，不能精确报告费用。','- 逐项原始输出从 [总报告](RESULTS.md) 查看；规则输出保留在 `results/testsets/rule/`，模型输出在 `results/testsets/model/`。');
await writeFile(`${root}/COMPARISON.md`,lines.join('\n')+'\n');
console.log(`${root}/COMPARISON.md`);
