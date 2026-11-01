import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildObservations, runAgent } from '../public/agent-engine.js';
import { createSessionHarness } from '../public/session-harness.js';
import { validateSession } from '../public/input-contract.js';
import { sanitizeEvents, sanitizeLiveDecision } from '../agent/policy.mjs';
import { runAIAgent } from '../ai-agent.mjs';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
const config=JSON.parse(await readFile(new URL('../public/config/actions.json',import.meta.url)));
const people=['林','周','吴'].map(id=>({id,name:id}));
const lines=[{start:1,end:15,speaker:'林',text:'可以先做社区共享书架。'},{start:20,end:35,speaker:'周',text:'也许增加归还提醒。'},{start:40,end:55,speaker:'林',text:'或者用预约减少排队。'},{start:60,end:75,speaker:'周',text:'先比较成本。'},{start:80,end:95,speaker:'林',text:'我们需要一个低成本方案。'}];
const input={transcript:lines,participants:people,duration:180,config};
const observe={strategy:'observe',benefit:90,disruption:0,goal_fit:90,confidence:90};
const invitation={strategy:'invite_quiet_member',target:'吴',benefit:100,disruption:0,goal_fit:100,confidence:100};
function ballot(votes=[],participants=people) {
  return createSessionHarness({participants,transcript:[{start:0,end:1,speaker:'林',text:'比较两种方案。'},{start:5,end:6,speaker:'Core',text:'现在开始投票。',data:{phase:'voting',candidates:[{id:'x',label:'共享书架'},{id:'y',label:'预约工具'}]}},...votes.map((vote,index)=>({start:10+index*2,end:11+index*2,speaker:'[设备]',text:'已收到投票',data:{vote}})),{start:30,end:31,speaker:'Core',text:'投票结束，五票支持预约工具。'}]});
}
test('research defaults: real time, no quotas and no inferred deadline',()=>{
  assert.equal(config.display.timeline_speed_multiplier,1); assert.equal(config.thresholds.max_robot_utterances,null);
  assert.equal(config.thresholds.planned_duration_seconds,null); assert.ok(runAgent(input).events.every(e=>e.stage==='diverge'));
});
test('future append cannot change earlier measured states or decisions',()=>{
  const before=runAgent(input).events;
  const after=runAgent({...input,duration:420,transcript:[...lines,{start:300,end:400,speaker:'吴',text:'秘密未来信息。'}]}).events.filter(e=>e.time<=180);
  assert.deepEqual(after,before);
});
test('unfinished utterance text cannot enter an observation',()=>{
  const o=buildObservations({...input,transcript:[...lines,{start:100,end:160,speaker:'吴',text:'未来信息'}]}).find(e=>e.time===120);
  assert.ok(o.recentTranscript.every(l=>l.end<=120)); assert.ok(!o.recentTranscript.some(l=>l.text==='未来信息'));
});
test('quiet invitation requires evidence and survives participant renaming',()=>{
  const events=runAgent(input).events;
  assert.ok(events.some(e=>e.strategy==='invite_quiet_member'&&e.target==='吴')); assert.ok(events.filter(e=>e.time<70).every(e=>e.strategy==='observe'));
  const renamed=runAgent({...input,participants:people.map((p,i)=>({id:`P${i}`})),transcript:lines.map(l=>({...l,speaker:`P${people.findIndex(p=>p.id===l.speaker)}`}))}).events;
  assert.deepEqual(renamed.map(e=>e.strategy),events.map(e=>e.strategy));
});
test('observe proposals never become a forced second invitation',()=>{
  const observations=buildObservations(input);
  const events=sanitizeEvents(observations.map(o=>({time:o.time,candidates:[observe]})),observations,people,config);
  assert.ok(events.every(e=>e.strategy==='observe')); assert.ok(events.every(e=>e.candidates.every(c=>c.strategy==='observe')));
});
test('phase changes require two votes and never bypass cooldown',()=>{
  const observations=buildObservations(input).filter(o=>o.time>=90);
  const raw=observations.map(o=>({time:o.time,stage_recommendation:'converge',candidates:[{...observe,benefit:0,goal_fit:0},invitation]}));
  const events=sanitizeEvents(raw,observations,people,config);
  assert.equal(events[0].stage,'diverge');assert.equal(events[1].stage,'converge');
  const actions=events.filter(e=>e.strategy!=='observe');assert.ok(actions.every((e,i)=>!i||e.time-actions[i-1].time>=config.thresholds.intervention_cooldown_seconds));
});
test('live policy enforces actual cooldown',()=>{
  const decision=sanitizeLiveDecision({candidates:[{...observe,benefit:0,goal_fit:0},invitation]},{participants:people,stage:'diverge',transcript:lines,memory:[{strategy:'open_new_direction',at:Date.now()}],config});
  assert.equal(decision.strategy,'observe');
});
test('missing model is explicitly labelled rule fallback',async()=>{
  const result=await runAIAgent({...input,apiKey:''});assert.equal(result.mode,'fallback');assert.ok(result.events.every(e=>e.decisionSource==='rule_fallback'));
});
test('causal model executes a complete tool chain per observation',async()=>{
  const provider=fauxProvider();const responses=[];
  const reads=['observe_discussion_window','get_participation_metrics','get_flow_metrics','get_diversity_metrics','read_recent_memory','check_intervention_cooldown'];
  const actions=['propose_intervention','generate_robot_action','dispatch_core_action','dispatch_pod_feedback','record_expected_effect'];
  for(const time of [0,30,60,90,120,150,180]) for(const calls of [reads.map(t=>[t,{}]),[['evaluate_candidates',{summary:'当前窗口',events:[{time,stage_recommendation:'diverge',evidence:[],missing_evidence:[],preference_updates:[],reviewed_source_ids:lines.flatMap((line,i)=>line.end<=time&&line.end>time-30?[`evt-${i+1}`]:[]),candidates:[observe]}]}]],actions.map(t=>[t,{}])]) responses.push(fauxAssistantMessage(calls.map(([t,p],i)=>fauxToolCall(t,p,{id:`${time}-${responses.length}-${i}`})),{stopReason:'toolUse'}));
  provider.setResponses(responses);
  const result=await runAIAgent({...input,apiKey:'',streamFn:provider.provider.streamSimple,modelDefinition:provider.getModel()});
  assert.equal(result.architecture,'pi-causal');assert.equal(result.events.length,7);assert.ok(result.execution.every(e=>e.recorded));
  assert.ok(result.events.every(e=>e.strategy==='observe'));assert.deepEqual(result.analysis.candidateSnapshots.map(s=>s.time),[0,30,60,90,120,150,180]);
});
test('timestamped candidate synthesis and backward seeking exclude future options',()=>{
  const h=createSessionHarness({transcript:lines,participants:people,candidateSnapshots:[{time:100,labels:['共享书架','预约工具']}]});
  assert.equal(h.setTime(50).candidates.items.length,0);assert.equal(h.setTime(120).candidates.items.length,2);assert.equal(h.setTime(50).candidates.items.length,0);
});
test('candidates alone never open voting and silent roster members remain',()=>{
  const h=createSessionHarness({transcript:[...lines,{start:100,end:110,speaker:'Core',text:'整理候选：一是共享书架，二是预约工具。'}],participants:people});
  assert.notEqual(h.setTime(120).phase,'voting');assert.equal(h.participants.length,3);
});
test('declared results cannot fabricate counts without individual votes',()=>{
  const ledger=ballot().setTime(40).voteLedger;assert.equal(ledger.winner,null);assert.deepEqual(ledger.tallies.map(t=>t.count),[0,0]);
});
test('ties, missing votes and duplicate votes remain explicit',()=>{
  const ledger=ballot([{participantId:'林',candidateId:'x'},{participantId:'周',candidateId:'y'},{participantId:'吴',candidateId:'y'},{participantId:'林',candidateId:'y'}]).setTime(40).voteLedger;
  assert.equal(ledger.winner.candidateId,'y');assert.equal(ledger.winner.count,2);assert.equal(ledger.rejected.length,1);
  const incomplete=ballot([{participantId:'林',candidateId:'x'}]).setTime(40).voteLedger;assert.equal(incomplete.status,'incomplete');assert.equal(incomplete.winner,null);
  const tied=ballot([{participantId:'林',candidateId:'x'},{participantId:'周',candidateId:'y'}],people.slice(0,2)).setTime(40);
  assert.equal(tied.voteLedger.status,'tie');assert.equal(tied.phase,'ballot_preparation');
});
test('invalid timestamps, repeated IDs and unknown speakers are rejected',()=>{
  assert.throws(()=>validateSession({...input,transcript:[{...lines[0],end:-1}]}),/时间/);
  assert.throws(()=>validateSession({...input,transcript:lines.map(l=>({...l,id:'same'}))}),/唯一/);
  assert.throws(()=>validateSession({...input,participants:[{id:'陌生人'}]}),/名单以外/);
});
test('UI and simulation cannot invent votes or present recorded robot speech as a decision',async()=>{
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');const sim=await readFile(new URL('../public/browser-mujoco.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/participantCount - 1|robotLine\?\.text \|\| contextualUtterance/);
  assert.doesNotMatch(sim,/\(index \+ 1\) % candidates.length|participantIndex < winner.count|elapsed >= 5\.5/);
});
test('semantic annotations from the future cannot cause premature convergence',()=>{
  const early=buildObservations({...input,semantic:{windows:[{time:180,stage_recommendation:'converge',idea_diversity:0}]}}).find(e=>e.time===90);
  assert.equal(early.suggestedStage,'diverge');
});
test('unknown device voters and candidates are rejected rather than counted',()=>{
  const ledger=ballot([{participantId:'陌生人',candidateId:'x'},{participantId:'林',candidateId:'unknown'}]).setTime(40).voteLedger;
  assert.equal(ledger.records.length,0);assert.equal(ledger.rejected.length,2);assert.equal(ledger.winner,null);
});
test('duplicate candidate identifiers are rejected at the input boundary',()=>{
  assert.throws(()=>validateSession({...input,transcript:[...lines,{start:100,end:110,speaker:'Core',text:'投票',data:{candidates:[{id:'x',label:'书架'},{id:'x',label:'预约'}]}}]}),/候选/);
});
