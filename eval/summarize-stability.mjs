// Recompute report metrics from saved outputs; this script never calls a model.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const root=dirname(fileURLToPath(import.meta.url));
const folders=(await readdir(`${root}/results/stability`)).sort();
const out=process.argv[2]?resolve(process.argv[2]):`${root}/results/stability/${folders.at(-1)}`;
const summary=JSON.parse(await readFile(`${out}/summary.json`,'utf8'));
const rows=[];let allPass=0,totalPass=0,failures=0,allIdentical=0,allWindows=0,labelIdentical=0,labelWindows=0;
const tuple=e=>JSON.stringify([e.strategy,e.target??null,e.stage]);
for(const c of summary.cases){
 const runs=await Promise.all([1,2,3].map(async round=>JSON.parse(await readFile(`${out}/${c.id}.run-${round}.json`,'utf8'))));
 const gold=runs[0].checks.map(e=>e.expected);
 const checks=runs.map(r=>gold.map(expected=>{
  const e=r.result?.events.find(e=>e.time===expected.time);
  return Boolean(e&&expected.acceptableStrategies.includes(e.strategy)&&(expected.stage==null||e.stage===expected.stage)&&(expected.target==null||(e.strategy==='invite_quiet_member'&&e.target===expected.target)));
 }));
 const passes=runs.map((r,i)=>r.status==='complete'&&checks[i].every(Boolean)&&!(r.violations?.length));
 const times=runs[0].result.events.map(e=>e.time);
 const agree=times.map(time=>{
  const values=runs.map(r=>r.result?.events.find(e=>e.time===time));
  return {time,agree:values.every(Boolean)&&new Set(values.map(tuple)).size===1,tuples:values.map(e=>e?JSON.parse(tuple(e)):null)};
 });
 const labelled=agree.filter(w=>gold.some(g=>g.time===w.time));
 const passCount=passes.filter(Boolean).length;totalPass+=passCount;if(passCount===3)allPass++;
 failures+=runs.filter(r=>r.status!=='complete').length;
 allIdentical+=agree.filter(w=>w.agree).length;allWindows+=agree.length;
 labelIdentical+=labelled.filter(w=>w.agree).length;labelWindows+=labelled.length;
 rows.push({id:c.id,suite:c.suite,passCount,perRound:passes,identicalWindows:agree.filter(w=>w.agree).length,windows:agree.length,identicalLabelledWindows:labelled.filter(w=>w.agree).length,labelledWindows:labelled.length,fluctuations:agree.filter(w=>!w.agree)});
}
if(totalPass!==summary.shortRunPasses||allPass!==summary.casesAlwaysPass||allIdentical!==summary.identicalWindows||allWindows!==summary.windowCount)throw new Error('独立重算与原报告不一致');
const full=JSON.parse(await readFile(`${out}/full-session-15min.run-1.json`,'utf8'));
const input=JSON.parse(await readFile(`${root}/full-session/input.json`,'utf8'));
const expectedTimes=Array.from({length:31},(_,i)=>i*30);
const fullTimes=full.result?.events.map(e=>e.time)||[];
const fullValid=full.status==='complete'&&isDeepStrictEqual(fullTimes,expectedTimes);
const enriched={...summary,independentlyVerified:true,identicalLabelledWindows:labelIdentical,labelledWindowCount:labelWindows,perRoundPasses:[0,1,2].map(i=>rows.filter(r=>r.perRound[i]).length),details:rows,fullSession:{...summary.fullSession,timelineVerified:fullValid,utteranceCount:input.transcript.length}};
await writeFile(`${out}/summary.json`,JSON.stringify(enriched,null,2)+'\n');
const rel=relative(root,out).split('\\').join('/');
const lines=['# 模型重复运行稳定性结果','',`完成时间：${new Date(summary.completedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（Asia/Shanghai）。`,'',`模型：${summary.metadata.model}。12 个决策用例各 3 次，共 36 次会话运行；复用原首轮并新增两轮，数据、核心策略代码与配置经过哈希核对。`,'',`- 符合预期的会话运行：**${totalPass}/36**。`,`- 三轮都符合预期的用例：**${allPass}/12**。`,`- 各轮符合预期：${enriched.perRoundPasses.map((n,i)=>`第${i+1}轮 ${n}/12`).join('；')}。`,`- 执行失败：${failures}。`,`- 标注检查点的三轮决策完全一致：**${labelIdentical}/${labelWindows}**。`,`- 全时间轴决策完全一致：${allIdentical}/${allWindows}（包含强制观察的启动期，因此通常比关键检查点更容易一致）。`,'','一致性只比较 strategy、target、stage，不要求话术逐字相同。**一致不代表正确；不同输出也可能都属于合理策略。三次是初步重复检查，不足以证明真实场景泛化或给出可靠的总体概率。**','','|用例|第1轮|第2轮|第3轮|标注点三轮相同|全部窗口三轮相同|','|---|---|---|---|---:|---:|'];
for(const row of rows)lines.push(`|${row.id}|${row.perRound.map((p,i)=>`[${p?'符合':'不符'}](${rel}/${row.id}.run-${i+1}.json)`).join('|')}|${row.identicalLabelledWindows}/${row.labelledWindows}|${row.identicalWindows}/${row.windows}|`);
lines.push('','## 波动位置','');
for(const row of rows)for(const w of row.fluctuations)lines.push(`- ${row.id}，${w.time}s：${w.tuples.map((t,i)=>`第${i+1}轮 ${JSON.stringify(t)}`).join('；')}。`);
lines.push('','## 标签解释与审计','',
 '本轮沿用原有预期，没有为了提高分数而调整标签。但这些预期尚未经独立人工验证：例如 declines-invitation 第三轮选择 open_new_direction，没有点名吴，因此只能记为“不符合预设 observe”，不能直接据此断言违反了吴的拒绝。requested-thinking-time 的 120 秒已超过所请求的一分钟思考期，该时刻的策略变化不一定是错误。',
 '', '后续应让独立标注者分别判断“是否应向全组提问”和“是否允许点名特定成员”，并允许多个合理策略。不要把当前合成标签一致率解释成真人场景正确率。');
lines.push('','## 整场讨论输入','',`另用一份 **15 分钟、4 位成员、60 条发言**的合成完整讨论做输入链路验证。模型执行状态：${full.status}；输出 ${fullTimes.length} 条决策；0–900 秒、每 30 秒一条的完整时间轴检查：${fullValid?'通过':'未通过'}。这次长会话只运行一遍，不计入短用例的三轮稳定性分数，也没有人工质量金标准。`,'','- [整场输入 JSON](full-session/input.json)','- [整场实际输出的可读时间轴](full-session/TIMELINE.md)','- [结构预期](full-session/expected.json)',`- [整场实际输出](${rel}/full-session-15min.run-1.json)`,'- [整场输入说明](full-session/README.md)',`- [完整机器可读汇总](${rel}/summary.json)`,'','## 现在支持什么输入输出','', '可以一次输入整场带时间戳和说话人的逐字稿。系统会沿时间轴逐次读取已完成的近期发言与历史决策，输出每个时间点的阶段、策略、对象、依据、候选和机器人话术。','', '当前模型每窗最多读取最近 60 秒中的 8 条已完成发言；历史决策记忆不等同于完整会议逐字稿的可靠长期摘要。长时间偏好保留、早期方案追溯仍需另测。原始录音/视频的可靠自动转写和多人说话人分离尚未完整接入。','', '重复运行使用 Provider 默认采样设置，没有强制随机种子或温度。复用首轮串行记录，新两轮最多并行 3 个会话，因此不直接比较不同轮的延迟。所有数据为作者合成，预期未经独立人工验证；没有真人小组效果证据。');
await writeFile(`${root}/STABILITY.md`,lines.join('\n')+'\n');
console.log(JSON.stringify({shortRunPasses:totalPass,shortRuns:36,casesAlwaysPass:allPass,perRoundPasses:enriched.perRoundPasses,identicalLabelledWindows:labelIdentical,labelledWindowCount:labelWindows,identicalWindows:allIdentical,windowCount:allWindows,executionFailures:failures,fullTimelineVerified:fullValid,report:`${root}/STABILITY.md`},null,2));
if(!fullValid||failures)process.exitCode=1;
