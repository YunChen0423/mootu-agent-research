# 输入输出契约 v1.0

## 会话输入

可运行示例见 `example-input.json`。网页上传支持 JSON 会话对象或发言数组；TXT 会话没有成员名单，无法表示从未开口的成员，研究评测应优先使用 JSON。

```json
{
  "participants": [{"id":"林","name":"林"},{"id":"周","name":"周"}],
  "duration": 120,
  "discussionStart": 0,
  "transcript": [
    {"id":"u1","start":1,"end":15,"speaker":"林","text":"可以先做社区共享书架。","type":"participant_utterance"}
  ]
}
```

时间单位是原始录音秒数，0 <= start < end，duration 必须覆盖全部事件。显式 ID 必须唯一，participants.id 非空且唯一。已有名单时发言者必须在名单内；Core、MooTu、现场、设备是系统角色。名单未给时只能从整个输入推断，评测中应显式提供预先已知的名单。CLI/API 严格拒绝字符串时间，网页 TXT 解析会先转换成数字。

模型在检查时刻 t 只能看到 end <= t 的完整发言。start/end 不能用于提前暴露整句；真实流式发言应拆成各自有时间戳的片段。

类型：participant_utterance、robot_utterance、scene_event、device_event。导入机器人原话只作为记录，不作为预测输出。

## 投票事件（推荐结构化）

```json
{"id":"v0","start":40,"end":41,"speaker":"Core","text":"开始投票","type":"robot_utterance","data":{"phase":"voting","candidates":[{"id":"c1","label":"共享书架"},{"id":"c2","label":"预约工具"}]}}
```

```json
{"id":"v1","start":45,"end":46,"speaker":"设备","text":"收到成员选择","type":"device_event","data":{"vote":{"participantId":"林","candidateId":"c1"}}}
```

```json
{"id":"v2","start":70,"end":71,"speaker":"Core","text":"投票结束","type":"robot_utterance","data":{"phase":"result_confirmation"}}
```

一次会话支持一轮投票，候选 >=2；冻结候选后仅接受已知成员+有效候选，首票有效，重复票拒绝。所有成员都有有效票且结束后才能选唯一最高票方案。平票返回整理；缺票、无票时 winner=null。口头“五票支持”不等于有五个具名投票记录。

## 分析 API

本地 POST `/api/analyze`，body 为上述会话；返回 mode、model、architecture、events、analysis、trace、execution。模型未配置时 mode=fallback、decisionSource=rule_fallback；模型运行失败返回错误，不隐式计为模型成功。

每条 events 含 time、stage、strategy、target、reason、evidence、metrics、diagnostics、candidates、expectedEffect、followUp、confidence、decisionSource。规则的 confidence=null；模型 confidence 是未校准自报，不能解释为正确概率。metrics 的 participation/diversity/flow 都是启发式 0–100 代理量，不是心理量表。

合法策略：observe、invite_quiet_member、open_new_direction、sustain_flow、prepare_convergence、advance_decision。只有邀请可以带成员 target。规则可接受的输出并非唯一一句话，文本质量另走盲评。

`analysis.candidateSnapshots` 每项包含 time 和 labels；方案只有到该时间才能使用。Core/Pod dispatch 是 simulated。

## 评测数据与产物

`cases.jsonl` 每行含 id、topic、provenance、session、checkpoints；每个检查点指定 time、acceptableStrategies、可选 target、stage。checkpoints 应落在固定 30 秒网格或会话终点，否则报告 missing_checkpoint。

```sh
npm run eval
node eval/run.mjs --input /absolute/path/test.jsonl --out /absolute/path/results
```

输出 report.json（配置/数据/源文件哈希、逐项评分和失败）、predictions.jsonl（逐会话完整预测和 trace）、summary.md。example-output.json 是实际规则分析结果，绝非手写理想答案。人工金标准单独存放，绝不能发送给待评模型。

## 新增分组测试集

`testsets/` 下有正常讨论、语义挑战、投票协议和非法输入四组。每个用例独立保存 `input.json` 与 `expected.json`。运行 `npm run eval:all`，结果从 [RESULTS.md](RESULTS.md) 查看。

决策用例调用真实分析适配层（默认显式指定无模型的规则模式）；投票协议调用 SessionHarness；非法输入调用 validateSession 并检查 400 错误。三类输出分别评分，不混为统一“模型准确率”。时间回溯用例的 candidateSnapshots 是显式提供给 Harness 的模拟输入，当前网页上传不会主动注入该字段。
