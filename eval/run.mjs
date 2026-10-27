import { readFile, writeFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { runAIAgent } from '../ai-agent.mjs';
import { validateSession } from '../public/input-contract.js';
import { STRATEGIES } from '../agent/policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const mode=args.includes('--model')?'model':'rule';
if(mode==='model'&&!process.env.DEEPSEEK_API_KEY) throw new Error('--model 要求显式提供 DEEPSEEK_API_KEY；评测不会偷偷改成规则模式');
const inputPath=resolve(option('--input',`${root}/eval/cases.jsonl`));
const outputDir=resolve(option('--out',`${root}/eval/results/${mode}`));
const datasetText=await readFile(inputPath,'utf8');
const cases=datasetText.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
if(!cases.length) throw new Error('评测数据不能为空');
const config=JSON.parse(await readFile(`${root}/public/config/actions.json`,'utf8'));
const hash=(value)=>createHash('sha256').update(value).digest('hex');
async function sourceFiles(dir) {
  let result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(['node_modules','dist','.git','docs','eval'].includes(entry.name)) continue;
    const path=`${dir}/${entry.name}`;
    if(entry.isDirectory()) result.push(...await sourceFiles(path));
    else if(/\.(js|mjs|json)$/.test(entry.name)) result.push(path);
  }
  return result.sort();
}
const sourceManifest=[];
for(const path of await sourceFiles(root)) sourceManifest.push({path:path.slice(root.length+1),sha256:hash(await readFile(path))});
await mkdir(outputDir,{recursive:true});
await writeFile(`${outputDir}/progress.jsonl`,'');
const predictions=[], failures=[], rows=[];
for(const item of cases) {
  const session=validateSession(item.session);
  if(!item.id||!Array.isArray(item.checkpoints)||!item.checkpoints.length) throw new Error('每个评测会话需要 id 和 checkpoints');
  for(const label of item.checkpoints) if(!Number.isFinite(label.time)||!label.acceptableStrategies?.length||label.acceptableStrategies.some(s=>!STRATEGIES.includes(s))) throw new Error(`无效标签：${item.id}`);
  const started=performance.now();
  try {
    const result=await runAIAgent({...session,config,apiKey:mode==='rule'?'':process.env.DEEPSEEK_API_KEY,onProgress:async({time,events})=>{
      await appendFile(`${outputDir}/progress.jsonl`,JSON.stringify({id:item.id,time,elapsedMs:Math.round(performance.now()-started),events})+'\n');
    }});
    if(mode==='model'&&result.mode!=='deepseek') throw new Error('模型运行意外降级');
    const latencyMs=performance.now()-started;
    let lastAction=-Infinity;
    const invariantViolations=[];
    const roster=new Set((session.participants.length?session.participants:session.transcript.map(l=>({id:l.speaker}))).map(p=>p.id));
    for(const event of result.events) {
      if(!STRATEGIES.includes(event.strategy)) invariantViolations.push({time:event.time,type:'unknown_strategy'});
      if(event.target&&!roster.has(event.target)) invariantViolations.push({time:event.time,type:'unknown_target'});
      if(event.strategy!=='invite_quiet_member'&&event.target) invariantViolations.push({time:event.time,type:'invalid_target_channel'});
      if(event.strategy!=='observe') {
        if(event.time-lastAction<config.thresholds.intervention_cooldown_seconds) invariantViolations.push({time:event.time,type:'cooldown_violation'});
        lastAction=event.time;
      }
      if(Object.values(event.metrics).some(v=>!Number.isFinite(v)||v<0||v>100)) invariantViolations.push({time:event.time,type:'invalid_metric'});
    }
    const prediction={id:item.id,topic:item.topic,mode:result.mode,latencyMs,invariantViolations,result};predictions.push(prediction);
    for(const label of item.checkpoints) {
      const event=result.events.find(e=>e.time===label.time);
      if(!event) { failures.push({id:item.id,time:label.time,error:'missing_checkpoint'}); continue; }
      rows.push({id:item.id,time:label.time,expected:label,predicted:{strategy:event.strategy,target:event.target,stage:event.stage},strategyCorrect:label.acceptableStrategies.includes(event.strategy),stageCorrect:label.stage==null?null:event.stage===label.stage,targetCorrect:label.target==null?null:event.strategy==='invite_quiet_member'&&event.target===label.target});
    }
  } catch(error) { failures.push({id:item.id,error:error.message}); }
}
function metrics(observations) {
  let tp=0,fp=0,fn=0,tn=0;
  for(const row of observations) {
    const expected=row.expected.acceptableStrategies;
    // Mixed acceptable actions are ambiguous for binary intervention scoring.
    if(expected.includes('observe')&&expected.length>1) continue;
    const gold=!expected.includes('observe'), predicted=row.predicted.strategy!=='observe';
    if(gold&&predicted)tp++;else if(!gold&&predicted)fp++;else if(gold)fn++;else tn++;
  }
  const ratio=(n,d)=>d?n/d:null;
  const stage=observations.filter(r=>r.stageCorrect!=null), target=observations.filter(r=>r.targetCorrect!=null);
  const labelledClasses=[...new Set(observations.flatMap(r=>r.expected.acceptableStrategies))];
  return {checkpoints:observations.length,acceptableStrategyAccuracy:ratio(observations.filter(r=>r.strategyCorrect).length,observations.length),stageAccuracy:ratio(stage.filter(r=>r.stageCorrect).length,stage.length),targetAccuracyIncludingMissedInvitations:ratio(target.filter(r=>r.targetCorrect).length,target.length),intervention:{tp,fp,fn,tn,precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),f1:ratio(2*tp,2*tp+fp+fn),falseInterventionRate:ratio(fp,fp+tn)},perStrategy:Object.fromEntries(labelledClasses.map(s=>{const group=observations.filter(r=>r.expected.acceptableStrategies.length===1&&r.expected.acceptableStrategies[0]===s);return[s,{n:group.length,recall:ratio(group.filter(r=>r.predicted.strategy===s).length,group.length)}]}))};
}
const alwaysObserve=rows.map(row=>({...row,predicted:{strategy:'observe',target:null,stage:'diverge'},strategyCorrect:row.expected.acceptableStrategies.includes('observe'),stageCorrect:row.expected.stage==null?null:row.expected.stage==='diverge',targetCorrect:row.expected.target==null?null:false}));
const metadata={schemaVersion:'1.0',startedAt:new Date().toISOString(),mode,model:mode==='model'?(process.env.DEEPSEEK_MODEL||'deepseek-chat'):null,node:process.version,dataset:{path:inputPath,sha256:hash(datasetText),sessions:cases.length,provenance:[...new Set(cases.map(c=>c.provenance||'unspecified'))]},config,configSha256:hash(JSON.stringify(config)),sourceSha256:hash(JSON.stringify(sourceManifest)),sourceManifest};
const report={metadata,coverage:{sessionsCompleted:predictions.length,sessionsFailed:failures.length,expectedCheckpoints:cases.reduce((n,c)=>n+c.checkpoints.length,0),scoredCheckpoints:rows.length},metrics:metrics(rows),alwaysObserveBaseline:metrics(alwaysObserve),invariantViolations:predictions.flatMap(p=>p.invariantViolations.map(v=>({id:p.id,...v}))),failures,checks:rows,limits:['Synthetic fixtures with author labels; no human validation or causal efficacy claim.','Accuracy denominators exclude failed or missing checkpoints; consult coverage and failures.','Model confidence is an uncalibrated self-report.','Whole-session latency includes all sequential model tool loops.']};
await mkdir(outputDir,{recursive:true});
await writeFile(`${outputDir}/report.json`,JSON.stringify(report,null,2)+'\n');
await writeFile(`${outputDir}/predictions.jsonl`,predictions.map(p=>JSON.stringify(p)).join('\n')+'\n');
await writeFile(`${outputDir}/summary.md`, `# MooTu ${mode} 评测\n\n数据：${cases.length} 个会话，${rows.length} 个已评分检查点。完成 ${predictions.length}/${cases.length}，失败 ${failures.length}。\n\n|指标|当前系统|始终观察基线|\n|---|---:|---:|\n${[['策略可接受率','acceptableStrategyAccuracy'],['阶段准确率','stageAccuracy'],['邀请目标命中率（含漏邀）','targetAccuracyIncludingMissedInvitations']].map(([label,key])=>`|${label}|${report.metrics[key]==null?'N/A':(report.metrics[key]*100).toFixed(1)+'%'}|${report.alwaysObserveBaseline[key]==null?'N/A':(report.alwaysObserveBaseline[key]*100).toFixed(1)+'%'}|`).join('\n')}\n\n约束违反：${report.invariantViolations.length}。详见 report.json 的分母、逐项错误与配置哈希。\n\n这些是作者构造的合成回归输入，不能证明真实讨论收益。模型评测和人工研究需单独执行。\n`);
console.log(JSON.stringify({mode,coverage:report.coverage,metrics:report.metrics,invariantViolations:report.invariantViolations.length,outputDir},null,2));
if(failures.length||report.invariantViolations.length) process.exitCode=1;
