import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createSessionHarness} from '../public/session-harness.js';
import {validateSession} from '../public/input-contract.js';
const root=dirname(fileURLToPath(import.meta.url));
const mode=process.argv.includes('--model')?'model':'rule';
if(mode==='model'&&!process.env.DEEPSEEK_API_KEY) throw new Error('--model 需要显式密钥；不会降级成规则评测');
const manifest=JSON.parse(await readFile(`${root}/testsets/manifest.json`,'utf8'));
const totals=[];
const timestamp=new Date().toISOString();
const hash=value=>createHash('sha256').update(value).digest('hex');
const link=path=>relative(root,path).split('\\').join('/');
const get=(obj,path)=>path.split('.').reduce((v,key)=>v?.[key],obj);
const display=value=>value===undefined?'missing':JSON.stringify(value);
const esc=text=>String(text).replace(/\|/g,'\\|').replace(/\n/g,' ');
for(const suite of manifest) {
 const source=`${root}/testsets/${suite.path}`;
 const dataset=await readFile(source,'utf8');
 const cases=dataset.trim().split('\n').map(JSON.parse);
 const out=`${root}/results/testsets/${mode}/${suite.id}`;
 await mkdir(out,{recursive:true});
 const results=[];
 if(suite.kind==='decision') {
  const args=[`${root}/run.mjs`,'--input',source,'--out',out,...mode==='model'?['--model']:[]];
  const child=spawnSync(process.execPath,args,{cwd:resolve(root,'..'),encoding:'utf8',maxBuffer:20*1024*1024});
  if(child.status!==0&&!child.stdout?.includes('"outputDir"')) throw new Error(`评测执行失败 ${suite.id}: ${child.stderr||child.error||child.stdout}`);
  const report=JSON.parse(await readFile(`${out}/report.json`,'utf8'));
  const raw=(await readFile(`${out}/predictions.jsonl`,'utf8')).trim();
  const predictions=raw?raw.split('\n').map(JSON.parse):[];
  for(const item of cases) {
   const checks=report.checks.filter(c=>c.id===item.id);
   const errors=report.failures.filter(c=>c.id===item.id);
   const violations=report.invariantViolations.filter(c=>c.id===item.id);
   const mismatches=[];
   for(const check of checks) {
    if(!check.strategyCorrect)mismatches.push(`${check.time}s 策略期望 ${check.expected.acceptableStrategies.join('/')}，实际 ${check.predicted.strategy}`);
    if(check.stageCorrect===false)mismatches.push(`${check.time}s 阶段期望 ${check.expected.stage}，实际 ${check.predicted.stage}`);
    if(check.targetCorrect===false)mismatches.push(`${check.time}s 邀请目标期望 ${check.expected.target}，实际 ${check.predicted.target}`);
   }
   for(const error of errors)mismatches.push(error.error);
   for(const violation of violations)mismatches.push(violation.type);
   if(checks.length!==item.checkpoints.length&&!errors.length)mismatches.push('未覆盖全部预期检查点');
   const actual=predictions.find(c=>c.id===item.id);
   results.push({id:item.id,description:item.description,passed:!mismatches.length,mismatches,checks,actual:actual||null});
  }
 } else {
  for(const item of cases) {
   const checks=[];const mismatches=[];let actual;
   if(suite.kind==='protocol') {
    const session=validateSession(item.session);
    const harness=createSessionHarness({...session,candidateSnapshots:item.candidateSnapshots||[]});
    actual=[];
    for(const expected of item.checkpoints) {
     const blackboard=harness.setTime(expected.time);
     actual.push({time:expected.time,blackboard});
     for(const [key,value] of Object.entries(expected.expect)) {
      const predicted=get(blackboard,key),passed=isDeepStrictEqual(predicted,value);
      checks.push({time:expected.time,key,expected:value,predicted,passed});
      if(!passed)mismatches.push(`${expected.time}s ${key}: 期望 ${display(value)}，实际 ${display(predicted)}`);
     }
    }
   } else {
    let error;
    try {validateSession(item.session);}catch(caught){error=caught;}
    const passed=Boolean(error&&error.status===400&&error.message.includes(item.expectedErrorContains));
    actual={accepted:!error,status:error?.status??200,error:error?.message??null};
    checks.push({expectedErrorContains:item.expectedErrorContains,predicted:actual,passed});
    if(!passed)mismatches.push(`期望拒绝且原因包含 ${item.expectedErrorContains}，实际 ${display(actual)}`);
   }
   results.push({id:item.id,description:item.description,passed:!mismatches.length,mismatches,checks,actual});
  }
 }
 for(const result of results)await writeFile(`${out}/${result.id}.actual.json`,JSON.stringify(result,null,2)+'\n');
 const summary={suite:suite.id,title:suite.title,kind:suite.kind,mode,timestamp,datasetSha256:hash(dataset),cases:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,assertions:results.reduce((n,r)=>n+r.checks.length,0),results};
 await writeFile(`${out}/suite-report.json`,JSON.stringify(summary,null,2)+'\n');
 totals.push({...summary,path:out});
 console.log(`${suite.title}: ${summary.passed}/${summary.cases} 用例全部满足预期，${summary.failed} 个不符`);
}
const lines=['# 测试集与评测结果','',`最近运行：${timestamp}。模式：**${mode==='rule'?'规则基线（未调用真实模型）':'真实模型决策 + 同一协议检查'}**。`,'',`${totals.reduce((n,s)=>n+s.cases,0)} 个用例分成 ${totals.length} 类。这里的“用例通过”要求该用例所有指定检查点和约束都满足预期；与旧报告按单项计算的策略可接受率不同。`,'', '**全部数据均为作者构造的合成输入，预期标签尚未经独立人工验证。语义挑战集用于主动暴露不足；不能把它视作独立 holdout，也不能把通过率当成真人实验效果。**','', '|测试集|用例数|全部符合|不符合|输入与预期|详细结果|','|---|---:|---:|---:|---|---|'];
for(const suite of totals)lines.push(`|${suite.title}|${suite.cases}|${suite.passed}|${suite.failed}|[查看](testsets/${suite.suite}/README.md)|[JSON](${link(suite.path)}/suite-report.json)|`);
lines.push('','## 每个用例的输入、预期、实际输出','','预期输出用允许策略/目标/阶段或协议事实表示；不要求机器人回复逐字一致。普通会话输入可上传主页面；非法输入集检验 API/验证器契约。时间回溯用例的 candidateSnapshots 是 Harness 输入，由评测器提供，当前网页上传不注入这些模拟快照。expected.json 只给评分器，不能传给待评模型。','','|用例|检查目的|输入|预期|实际输出|结果|','|---|---|---|---|---|---|');
for(const suite of totals)for(const item of suite.results) {
 const path=`testsets/${suite.suite}/${item.id}`;
 lines.push(`|${item.id}|${esc(item.description)}|[JSON](${path}/input.json)|[JSON](${path}/expected.json)|[JSON](${link(suite.path)}/${item.id}.actual.json)|${item.passed?'通过':'不符'}|`);
}
lines.push('','## 与预期不符的地方','');
const misses=totals.flatMap(s=>s.results.filter(r=>!r.passed).map(r=>({...r,suite:s.suite})));
if(!misses.length)lines.push('此次没有发现预期不符。');
for(const item of misses)lines.push(`- **${item.id}**：${item.mismatches.map(esc).join('；')}。`);
lines.push('','这些结果保留了失败，没有为了让分数好看而修改预期。新增修复后重跑同一数据，才能比较差异。','','## 如何重跑','','在 `research-copy` 目录运行：','','```sh','npm run eval:all','```','','输出保存在 `eval/results/testsets/rule/`，本页会更新。用例不符时命令返回非零，报告仍完整保存。','','真实模型另行运行（需要本目录配置 API Key，可能产生费用）：','','```sh','node --env-file-if-exists=.env eval/run-suites.mjs --model','```','','模型结果保存在 `eval/results/testsets/model/`，不会覆盖规则结果；本页显示最后一次运行。投票协议和输入拒绝直接检验确定性代码，不计入模型能力。','','旧的 12 会话/21 点报告仍在 [旧基线摘要](results/rule/summary.md)。完整指标与人工研究设计见 [评测协议](PROTOCOL.md)。');
await writeFile(`${root}/RESULTS.md`,lines.join('\n')+'\n');
await writeFile(`${root}/results/testsets/${mode}/index.json`,JSON.stringify({timestamp,mode,totals:totals.map(({results,path,...s})=>s)},null,2)+'\n');
console.log(`可读报告：${root}/RESULTS.md`);
if(misses.length)process.exitCode=1;
