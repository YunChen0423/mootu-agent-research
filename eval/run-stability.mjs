import {readFile,writeFile,appendFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runAIAgent} from '../ai-agent.mjs';
import {validateSession} from '../public/input-contract.js';
import {STRATEGIES} from '../agent/policy.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const project=resolve(root,'..');
if(!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('稳定性测试需要显式 API Key');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=`${root}/results/stability/${stamp}`;
await mkdir(out,{recursive:true});
const config=JSON.parse(await readFile(`${project}/public/config/actions.json`,'utf8'));
const model=process.env.DEEPSEEK_MODEL||'deepseek-chat';
const hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(await readFile(`${root}/testsets/manifest.json`,'utf8'));
const sourceSuites=manifest.filter(s=>s.kind==='decision');
const cases=[];const allResults=[];
const corePaths=['ai-agent.mjs','agent/pi-runtime.mjs','agent/tools.mjs','agent/policy.mjs','public/agent-engine.js','public/config/actions.json'];
const coreHashes=Object.fromEntries(await Promise.all(corePaths.map(async path=>[path,hash(await readFile(`${project}/${path}`))])));
for(const suite of sourceSuites){
 const text=await readFile(`${root}/testsets/${suite.path}`,'utf8');
 const baseline=JSON.parse(await readFile(`${root}/results/testsets/model/${suite.id}/suite-report.json`,'utf8'));
 const firstReport=JSON.parse(await readFile(`${root}/results/testsets/model/${suite.id}/report.json`,'utf8'));
 for(const [path,sha] of Object.entries(coreHashes))if(firstReport.metadata.sourceManifest.find(file=>file.path===path)?.sha256!==sha)throw new Error(`核心代码 ${path} 已变更，不能合并旧首轮`);
 if(hash(text)!==baseline.datasetSha256||hash(JSON.stringify(config))!==firstReport.metadata.configSha256||model!==firstReport.metadata.model)throw new Error('已有首轮与当前数据/配置/模型不一致，不能直接合并重复实验');
 for(const c of text.trim().split('\n').map(JSON.parse)){
  const first=baseline.results.find(r=>r.id===c.id);
  if(!first?.actual?.result)throw new Error(`首轮 ${c.id} 缺少完整模型结果`);
  cases.push({...c,suite:suite.id});
  const result={id:c.id,suite:suite.id,repetition:1,status:'complete',result:first.actual.result,passed:first.passed,checks:first.checks,mismatches:first.mismatches,source:`eval/results/testsets/model/${suite.id}/${c.id}.actual.json`};
  allResults.push(result);
  await writeFile(`${out}/${c.id}.run-1.json`,JSON.stringify(result,null,2)+'\n');
 }
}
function score(c,result){
 const checks=c.checkpoints.map(expected=>{
  const predicted=result.events.find(e=>e.time===expected.time);
  const strategyCorrect=Boolean(predicted&&expected.acceptableStrategies.includes(predicted.strategy));
  const stageCorrect=expected.stage==null?null:predicted?.stage===expected.stage;
  const targetCorrect=expected.target==null?null:predicted?.strategy==='invite_quiet_member'&&predicted?.target===expected.target;
  return {time:expected.time,expected,predicted:predicted?{strategy:predicted.strategy,target:predicted.target,stage:predicted.stage}:null,strategyCorrect,stageCorrect,targetCorrect};
 });
 const ids=new Set(c.session.participants.map(p=>p.id));let last=-Infinity;const violations=[];
 for(const e of result.events){
  if(!STRATEGIES.includes(e.strategy)||(e.target&&!ids.has(e.target))||(e.strategy!=='invite_quiet_member'&&e.target))violations.push({time:e.time,type:'invalid_strategy_or_target'});
  if(e.strategy!=='observe'){
   if(e.time-last<config.thresholds.intervention_cooldown_seconds)violations.push({time:e.time,type:'cooldown'});
   last=e.time;
  }
 }
 const mismatches=checks.filter(c=>!c.strategyCorrect||c.stageCorrect===false||c.targetCorrect===false).map(c=>({time:c.time,expected:c.expected,predicted:c.predicted}));
 return {checks,violations,mismatches,passed:!mismatches.length&&!violations.length};
}
const fullInput=JSON.parse(await readFile(`${root}/full-session/input.json`,'utf8'));
// Whole-session smoke is separate from repeated short-case stability statistics.
const tasks=[{id:'full-session-15min',suite:'full-session',repetition:1,session:fullInput,full:true},...Array.from({length:2},(_,i)=>cases.map(c=>({...c,repetition:i+2}))).flat()];
const metadata={schemaVersion:'1.0',startedAt:new Date().toISOString(),model,providerOrigin:new URL(process.env.DEEPSEEK_BASE_URL||'https://api.deepseek.com').origin,coreHashes,config,configSha256:hash(JSON.stringify(config)),rounds:3,reusedFirstRound:true,concurrency:3,shortCaseCount:cases.length,fullSessionSeparate:true,sampling:'provider default; no seed or temperature override',sourceDatasets:Object.fromEntries(await Promise.all(sourceSuites.map(async s=>[s.id,hash(await readFile(`${root}/testsets/${s.path}`))])))};
// Do not serialize credentials or request headers.
await writeFile(`${out}/metadata.json`,JSON.stringify(metadata,null,2)+'\n');
console.log(`Output: ${out}`);
let cursor=0,completed=0;
async function worker(){
 while(cursor<tasks.length){
  const task=tasks[cursor++];const started=performance.now();
  const file=`${out}/${task.id}.run-${task.repetition}.json`;
  const progress=`${out}/${task.id}.run-${task.repetition}.progress.jsonl`;
  await writeFile(progress,'');
  console.log(`START ${task.id} round=${task.repetition}`);
  let entry;
  try{
   const session=validateSession(task.session);
   const result=await runAIAgent({...session,config,onProgress:async value=>{
    await appendFile(progress,JSON.stringify({time:value.time,elapsedMs:Math.round(performance.now()-started),events:value.events})+'\n');
   }});
   if(result.mode!=='deepseek')throw new Error('模型运行意外降级');
   entry={id:task.id,suite:task.suite,repetition:task.repetition,status:'complete',latencyMs:performance.now()-started,result,...task.full?{passed:null}:score(task,result)};
  }catch(error){entry={id:task.id,suite:task.suite,repetition:task.repetition,status:'failed',passed:false,error:error.message,latencyMs:performance.now()-started};}
  await writeFile(file,JSON.stringify(entry,null,2)+'\n');
  allResults.push(entry);completed++;
  await writeFile(`${out}/progress.json`,JSON.stringify({completed,total:tasks.length,latest:{id:entry.id,repetition:entry.repetition,status:entry.status,passed:entry.passed}},null,2)+'\n');
  console.log(`DONE ${task.id} round=${task.repetition} status=${entry.status} passed=${entry.passed}`);
 }
}
await Promise.all(Array.from({length:3},worker));
const tuple=e=>JSON.stringify([e.strategy,e.target??null,e.stage]);
const summaries=cases.map(c=>{
 const runs=allResults.filter(r=>r.id===c.id).sort((a,b)=>a.repetition-b.repetition);
 const expectedTimes=runs[0].result.events.map(e=>e.time);
 const windows=expectedTimes.map(time=>{
  const values=runs.map(r=>r.result?.events.find(e=>e.time===time));
  return {time,allAvailable:values.every(Boolean),identical:values.every(Boolean)&&new Set(values.map(tuple)).size===1,tuples:values.map(e=>e?JSON.parse(tuple(e)):null)};
 });
 const labelledWindows=windows.filter(w=>c.checkpoints.some(e=>e.time===w.time));
 return {id:c.id,suite:c.suite,passes:runs.filter(r=>r.passed).length,runs:runs.length,executionFailures:runs.filter(r=>r.status!=='complete').length,allThreePass:runs.every(r=>r.passed),identicalWindows:windows.filter(w=>w.identical).length,windowCount:windows.length,identicalLabelledWindows:labelledWindows.filter(w=>w.identical).length,labelledWindowCount:labelledWindows.length,windows};
});
const shortResults=allResults.filter(r=>r.suite!=='full-session');
const full=allResults.find(r=>r.suite==='full-session');
const summary={metadata,completedAt:new Date().toISOString(),shortRuns:shortResults.length,shortRunPasses:shortResults.filter(r=>r.passed).length,executionFailures:shortResults.filter(r=>r.status!=='complete').length,casesAlwaysPass:summaries.filter(s=>s.allThreePass).length,identicalWindows:summaries.reduce((n,s)=>n+s.identicalWindows,0),windowCount:summaries.reduce((n,s)=>n+s.windowCount,0),cases:summaries,fullSession:{status:full?.status,error:full?.error,events:full?.result?.events.length??0,duration:fullInput.duration,lastTime:full?.result?.events.at(-1)?.time}};
await writeFile(`${out}/summary.json`,JSON.stringify(summary,null,2)+'\n');
const rel=relative(root,out).split('\\').join('/');
const localDate=new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const lines=['# 模型重复运行稳定性测试','',`完成时间：${localDate}（Asia/Shanghai）；模型：${model}。`,'','12 个决策用例各运行 3 次：复用已保存首轮，再增加两轮。数据和策略配置保持一致；新两轮独立启动上下文，最多 3 个独立会话并行。投票/输入校验是确定性代码，不重复计入模型稳定性。','',`- 用例运行符合预期：${summary.shortRunPasses}/${summary.shortRuns}。`,`- 三轮都符合预期的用例：${summary.casesAlwaysPass}/${cases.length}。`,`- 执行失败：${summary.executionFailures}。`,`- 全时间轴决策三轮完全一致：${summary.identicalWindows}/${summary.windowCount} 个窗口。一致性比较 strategy + target + stage，不比较话术逐字一致。`,'','**一致不等于正确，正确也不要求逐字输出一致。三次只是初步重复性检查，不能证明真实场景泛化或统计稳定性。**','','|用例|符合预期次数|三轮相同的窗口|执行失败|第1轮|第2轮|第3轮|','|---|---:|---:|---:|---|---|---|'];
for(const s of summaries)lines.push(`|${s.id}|${s.passes}/${s.runs}|${s.identicalWindows}/${s.windowCount}|${s.executionFailures}|[JSON](${rel}/${s.id}.run-1.json)|[JSON](${rel}/${s.id}.run-2.json)|[JSON](${rel}/${s.id}.run-3.json)|`);
lines.push('','## 发生波动的判断','');
for(const s of summaries)for(const w of s.windows.filter(w=>!w.identical))lines.push(`- ${s.id} ${w.time}s：${w.tuples.map((t,i)=>`第${i+1}轮 ${JSON.stringify(t)}`).join('；')}。`);
lines.push('','## 整场讨论输入检查','',`另外输入一份 15 分钟合成讨论。执行状态：${summary.fullSession.status}；生成 ${summary.fullSession.events} 条时间轴决策，最后时间 ${summary.fullSession.lastTime??'N/A'} 秒。此用例只检查整场输入链路，不计入上述短用例稳定性分数。`,'','- [整场输入](full-session/input.json)','- [输入与输出说明](full-session/README.md)',`- [整场实际输出](${rel}/full-session-15min.run-1.json)`,`- [本轮完整指标与窗口波动](${rel}/summary.json)`,'','没有真人录音、独立人工标注或真实小组效果验证；Provider 默认采样设置，没有强制温度/随机种子。旧的逐次单轮报告仍保留。');
await writeFile(`${root}/STABILITY.md`,lines.join('\n')+'\n');
console.log(JSON.stringify({out,shortRunPasses:summary.shortRunPasses,shortRuns:summary.shortRuns,casesAlwaysPass:summary.casesAlwaysPass,identicalWindows:summary.identicalWindows,windowCount:summary.windowCount,executionFailures:summary.executionFailures,fullSession:summary.fullSession},null,2));
if(summary.executionFailures||summary.fullSession.status!=='complete')process.exitCode=1;
