// Deterministic author-written fixtures. Expected labels are design hypotheses, not independent human truth.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const old=(await readFile(`${root}/cases.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
const clone=value=>structuredClone(value);
const normal=['balanced-1','balanced-2','quiet-1','quiet-2','stalled-1','stalled-2'].map(id=>({...clone(old.find(c=>c.id===id)),kind:'decision',description:id.startsWith('balanced')?'参与均衡且有新想法，保留自主讨论。':id.startsWith('quiet')?'名单中的吴持续低参与；达到证据阈值后邀请，随后保持冷却。':'长时间没有内容推进，可用开放问题激活讨论。'}));
const p=['林','周','吴'].map(id=>({id,name:id}));
const utterance=(id,start,end,speaker,text,data)=>({id,start,end,speaker,text,...data?{data}:{}});
const quiet=clone(old.find(c=>c.id==='quiet-1').session);
const challenge=old.filter(c=>c.id==='convergence-1'||c.id==='convergence-2').map(c=>({...clone(c),kind:'decision',description:'成员已明确开始比较取舍；应识别收敛，允许保持观察而不重复提醒。'}));
challenge.push({id:'declines-invitation',kind:'decision',topic:'社区活动',provenance:'author_synthetic',description:'吴明确表示暂时不想被点名；低参与本身不能推翻这一偏好。',session:{...quiet,transcript:[utterance('decline',0,3,'吴','我暂时不想发言，请先不要点我；等我准备好会主动说。'),...quiet.transcript.map((l,i)=>({...l,id:`q-${i}`,start:l.start+4,end:l.end+4}))],duration:125},checkpoints:[{time:90,acceptableStrategies:['observe'],stage:'diverge'}]});
challenge.push({id:'requested-thinking-time',kind:'decision',topic:'校园活动',provenance:'author_synthetic',description:'成员明确申请一段安静思考时间，仍在该时间内时不应按沉默触发追问。',session:{participants:[p[0]],duration:120,transcript:[utterance('thinking',45,55,'林','请给我一分钟安静思考，先不要提问，我想好了会说。')]},checkpoints:[{time:90,acceptableStrategies:['observe'],stage:'diverge'}]});
challenge.push({id:'asr-unusable-content',kind:'decision',topic:'识别质量',provenance:'author_synthetic',description:'所有片段明确不可辨认，应该保留观察并提示缺少可靠证据，不应依据乱码启发。',session:{participants:[p[0]],duration:120,transcript:[utterance('asr-1',1,8,'林','[无法辨认]'),utterance('asr-2',30,38,'林','[识别失败]'),utterance('asr-3',60,68,'林','[无法辨认]')]},checkpoints:[{time:90,acceptableStrategies:['observe'],stage:'diverge'}]});
challenge.push({id:'repeated-idea-paraphrases',kind:'decision',topic:'图书共享',provenance:'author_synthetic',description:'多句话是同一书籍共享想法的改写；不应把字串不同当作不同方案。',session:{participants:p,duration:180,transcript:[utterance('r1',1,18,'林','可以搭一个借书的架子。'),utterance('r2',21,38,'周','或者摆放一组供大家取阅书籍的柜子。'),utterance('r3',41,58,'吴','我想到给居民设置互相交换读物的格架。'),utterance('r4',61,78,'林','也许让邻居把闲置图书放到公共柜格里。'),utterance('r5',81,98,'周','方案还是做一个社区里互相借阅读物的地方。'),utterance('r6',101,118,'吴','可以在楼下摆架子让大家共享家中的书。'),utterance('r7',121,138,'林','还是想到在街坊公共区域放一排互借书本的搁架。')]},checkpoints:[{time:150,acceptableStrategies:['open_new_direction','sustain_flow'],stage:'diverge'}]});
const start=utterance('discussion',0,2,'林','我们比较共享书架和预约工具。');
const open=utterance('open',5,6,'Core','现在开始投票。',{phase:'voting',candidates:[{id:'c1',label:'共享书架'},{id:'c2',label:'预约工具'}]});
const close=utterance('close',30,31,'Core','投票结束。',{phase:'result_confirmation'});
const vote=(who,candidate,index)=>utterance(`vote-${index}`,10+index*2,11+index*2,'设备','收到一条设备投票。',{vote:{participantId:who,candidateId:candidate}});
function protocol(id,description,votes,checkpoints,participants=p,closing=close) {return {id,kind:'protocol',topic:'投票协议',provenance:'author_synthetic',description,session:{participants,duration:40,transcript:[start,open,...votes.map(([who,c],i)=>vote(who,c,i)),closing]},checkpoints};}
const protocols=[
protocol('vote-complete','全员具名投票结束后，确认真实多数。',[['林','c1'],['周','c2'],['吴','c2']],[{time:20,expect:{phase:'voting','voteLedger.status':'collecting','voteLedger.winner':null}},{time:40,expect:{phase:'result_confirmation','voteLedger.status':'complete','voteLedger.winner.candidateId':'c2','voteLedger.winner.count':2,'voteLedger.records.length':3}}]),
protocol('vote-missing','缺一位成员时不得宣布赢家。',[['林','c1'],['周','c2']],[{time:40,expect:{'voteLedger.status':'incomplete','voteLedger.winner':null,'voteLedger.records.length':2}}]),
protocol('vote-tie','票数相同时回到候选整理，不能默认第一项获胜。',[['林','c1'],['周','c2']],[{time:40,expect:{phase:'ballot_preparation','voteLedger.status':'tie','voteLedger.winner':null}}],p.slice(0,2)),
protocol('vote-duplicate','首票有效，重复票不覆盖，也不增加总票数。',[['林','c1'],['周','c2'],['吴','c2'],['林','c2']],[{time:40,expect:{'voteLedger.records.length':3,'voteLedger.rejected.length':1,'voteLedger.winner.candidateId':'c2','voteLedger.winner.count':2}}]),
protocol('declared-votes-without-records','机器人宣告三票不等于实际存在三张具名票。',[],[{time:40,expect:{'voteLedger.status':'empty','voteLedger.records.length':0,'voteLedger.winner':null,'voteLedger.tallies.0.count':0,'voteLedger.tallies.1.count':0}}],p,utterance('declare',30,31,'Core','投票结束，三票支持预约工具。')),
{id:'future-candidates-and-backward-seek',kind:'protocol',topic:'时间可见性',provenance:'author_synthetic',description:'往前/往后拖动不能把未来候选带回早期时刻。',session:{participants:p,duration:120,transcript:[start]},candidateSnapshots:[{time:100,labels:['共享书架','预约工具']}],checkpoints:[{time:50,expect:{'candidates.items.length':0}},{time:110,expect:{'candidates.items.length':2}},{time:50,expect:{'candidates.items.length':0}}]}
];
const base=clone(old[0].session);
const invalid=[
{id:'negative-duration',description:'发言结束早于开始，应拒绝。',session:{...clone(base),transcript:[utterance('bad',10,5,'林','错误时间。')]},expectedErrorContains:'时间'},
{id:'string-timestamp',description:'API 契约要求数值秒数，应拒绝字符串。',session:{...clone(base),transcript:[utterance('bad','1',5,'林','错误时间类型。')]},expectedErrorContains:'时间'},
{id:'duplicate-event-id',description:'重复事件 ID 应拒绝，避免票据和证据歧义。',session:{...clone(base),transcript:base.transcript.map(l=>({...l,id:'duplicate'}))},expectedErrorContains:'唯一'},
{id:'unknown-participant',description:'发言者不在显式名单，应拒绝。',session:{...clone(base),participants:[{id:'陌生人'}]},expectedErrorContains:'名单以外'}
].map(c=>({...c,kind:'invalid',provenance:'author_synthetic',topic:'输入契约'}));
const suites=[{id:'01-normal',title:'正常讨论与基本介入',kind:'decision',cases:normal},{id:'02-semantic-challenges',title:'语义与自主性挑战',kind:'decision',cases:challenge},{id:'03-voting-protocol',title:'投票与时间协议',kind:'protocol',cases:protocols},{id:'04-invalid-input',title:'非法输入与边界',kind:'invalid',cases:invalid}];
for(const suite of suites) {
 const dir=`${root}/testsets/${suite.id}`;await mkdir(dir,{recursive:true});
 await writeFile(`${dir}/cases.jsonl`,suite.cases.map(c=>JSON.stringify(c)).join('\n')+'\n');
 const lines=[`# ${suite.title}`,'','所有输入均为作者构造的合成数据；预期是行为要求，尚未独立人工验证。','', '|用例|目的|输入|预期|','|---|---|---|---|'];
 for(const c of suite.cases) {
  await mkdir(`${dir}/${c.id}`,{recursive:true});
  await writeFile(`${dir}/${c.id}/input.json`,JSON.stringify({...c.session,...c.candidateSnapshots?{candidateSnapshots:c.candidateSnapshots}:{}},null,2)+'\n');
  const expected={id:c.id,kind:c.kind,description:c.description,provenance:c.provenance,checkpoints:c.checkpoints,...c.expectedErrorContains?{expectedErrorContains:c.expectedErrorContains}:{},note:'检查策略集合、目标、阶段和协议事实；不要求逐字匹配机器人话术。'};
  await writeFile(`${dir}/${c.id}/expected.json`,JSON.stringify(expected,null,2)+'\n');
  lines.push(`|${c.id}|${c.description}|[input.json](${c.id}/input.json)|[expected.json](${c.id}/expected.json)|`);
 }
 await writeFile(`${dir}/README.md`,lines.join('\n')+'\n');
}
await writeFile(`${root}/testsets/manifest.json`,JSON.stringify(suites.map(({cases,...suite})=>({...suite,path:`${suite.id}/cases.jsonl`,count:cases.length})),null,2)+'\n');
console.log(`Generated ${suites.length} suites, ${suites.reduce((n,s)=>n+s.cases.length,0)} cases with separate inputs and expectations.`);
