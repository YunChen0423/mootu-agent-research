# 测试集与评测结果

最新重复运行结果见 [稳定性报告](STABILITY.md)；整场输入与输出示例见 [15分钟时间轴](full-session/TIMELINE.md)。

最近运行：2026-10-27T06:03:24.303Z。模式：**真实模型决策 + 同一协议检查**。

22 个用例分成 4 类。这里的“用例通过”要求该用例所有指定检查点和约束都满足预期；与旧报告按单项计算的策略可接受率不同。

**全部数据均为作者构造的合成输入，预期标签尚未经独立人工验证。语义挑战集用于主动暴露不足；不能把它视作独立 holdout，也不能把通过率当成真人实验效果。**

|测试集|用例数|全部符合|不符合|输入与预期|详细结果|
|---|---:|---:|---:|---|---|
|正常讨论与基本介入|6|5|1|[查看](testsets/01-normal/README.md)|[JSON](results/testsets/model/01-normal/suite-report.json)|
|语义与自主性挑战|6|6|0|[查看](testsets/02-semantic-challenges/README.md)|[JSON](results/testsets/model/02-semantic-challenges/suite-report.json)|
|投票与时间协议|6|6|0|[查看](testsets/03-voting-protocol/README.md)|[JSON](results/testsets/model/03-voting-protocol/suite-report.json)|
|非法输入与边界|4|4|0|[查看](testsets/04-invalid-input/README.md)|[JSON](results/testsets/model/04-invalid-input/suite-report.json)|

## 每个用例的输入、预期、实际输出

预期输出用允许策略/目标/阶段或协议事实表示；不要求机器人回复逐字一致。普通会话输入可上传主页面；非法输入集检验 API/验证器契约。时间回溯用例的 candidateSnapshots 是 Harness 输入，由评测器提供，当前网页上传不注入这些模拟快照。expected.json 只给评分器，不能传给待评模型。

|用例|检查目的|输入|预期|实际输出|结果|
|---|---|---|---|---|---|
|balanced-1|参与均衡且有新想法，保留自主讨论。|[JSON](testsets/01-normal/balanced-1/input.json)|[JSON](testsets/01-normal/balanced-1/expected.json)|[JSON](results/testsets/model/01-normal/balanced-1.actual.json)|通过|
|balanced-2|参与均衡且有新想法，保留自主讨论。|[JSON](testsets/01-normal/balanced-2/input.json)|[JSON](testsets/01-normal/balanced-2/expected.json)|[JSON](results/testsets/model/01-normal/balanced-2.actual.json)|通过|
|quiet-1|名单中的吴持续低参与；达到证据阈值后邀请，随后保持冷却。|[JSON](testsets/01-normal/quiet-1/input.json)|[JSON](testsets/01-normal/quiet-1/expected.json)|[JSON](results/testsets/model/01-normal/quiet-1.actual.json)|通过|
|quiet-2|名单中的吴持续低参与；达到证据阈值后邀请，随后保持冷却。|[JSON](testsets/01-normal/quiet-2/input.json)|[JSON](testsets/01-normal/quiet-2/expected.json)|[JSON](results/testsets/model/01-normal/quiet-2.actual.json)|通过|
|stalled-1|长时间没有内容推进，可用开放问题激活讨论。|[JSON](testsets/01-normal/stalled-1/input.json)|[JSON](testsets/01-normal/stalled-1/expected.json)|[JSON](results/testsets/model/01-normal/stalled-1.actual.json)|不符|
|stalled-2|长时间没有内容推进，可用开放问题激活讨论。|[JSON](testsets/01-normal/stalled-2/input.json)|[JSON](testsets/01-normal/stalled-2/expected.json)|[JSON](results/testsets/model/01-normal/stalled-2.actual.json)|通过|
|convergence-1|成员已明确开始比较取舍；应识别收敛，允许保持观察而不重复提醒。|[JSON](testsets/02-semantic-challenges/convergence-1/input.json)|[JSON](testsets/02-semantic-challenges/convergence-1/expected.json)|[JSON](results/testsets/model/02-semantic-challenges/convergence-1.actual.json)|通过|
|convergence-2|成员已明确开始比较取舍；应识别收敛，允许保持观察而不重复提醒。|[JSON](testsets/02-semantic-challenges/convergence-2/input.json)|[JSON](testsets/02-semantic-challenges/convergence-2/expected.json)|[JSON](results/testsets/model/02-semantic-challenges/convergence-2.actual.json)|通过|
|declines-invitation|吴明确表示暂时不想被点名；低参与本身不能推翻这一偏好。|[JSON](testsets/02-semantic-challenges/declines-invitation/input.json)|[JSON](testsets/02-semantic-challenges/declines-invitation/expected.json)|[JSON](results/testsets/model/02-semantic-challenges/declines-invitation.actual.json)|通过|
|requested-thinking-time|成员明确申请一段安静思考时间，仍在该时间内时不应按沉默触发追问。|[JSON](testsets/02-semantic-challenges/requested-thinking-time/input.json)|[JSON](testsets/02-semantic-challenges/requested-thinking-time/expected.json)|[JSON](results/testsets/model/02-semantic-challenges/requested-thinking-time.actual.json)|通过|
|asr-unusable-content|所有片段明确不可辨认，应该保留观察并提示缺少可靠证据，不应依据乱码启发。|[JSON](testsets/02-semantic-challenges/asr-unusable-content/input.json)|[JSON](testsets/02-semantic-challenges/asr-unusable-content/expected.json)|[JSON](results/testsets/model/02-semantic-challenges/asr-unusable-content.actual.json)|通过|
|repeated-idea-paraphrases|多句话是同一书籍共享想法的改写；不应把字串不同当作不同方案。|[JSON](testsets/02-semantic-challenges/repeated-idea-paraphrases/input.json)|[JSON](testsets/02-semantic-challenges/repeated-idea-paraphrases/expected.json)|[JSON](results/testsets/model/02-semantic-challenges/repeated-idea-paraphrases.actual.json)|通过|
|vote-complete|全员具名投票结束后，确认真实多数。|[JSON](testsets/03-voting-protocol/vote-complete/input.json)|[JSON](testsets/03-voting-protocol/vote-complete/expected.json)|[JSON](results/testsets/model/03-voting-protocol/vote-complete.actual.json)|通过|
|vote-missing|缺一位成员时不得宣布赢家。|[JSON](testsets/03-voting-protocol/vote-missing/input.json)|[JSON](testsets/03-voting-protocol/vote-missing/expected.json)|[JSON](results/testsets/model/03-voting-protocol/vote-missing.actual.json)|通过|
|vote-tie|票数相同时回到候选整理，不能默认第一项获胜。|[JSON](testsets/03-voting-protocol/vote-tie/input.json)|[JSON](testsets/03-voting-protocol/vote-tie/expected.json)|[JSON](results/testsets/model/03-voting-protocol/vote-tie.actual.json)|通过|
|vote-duplicate|首票有效，重复票不覆盖，也不增加总票数。|[JSON](testsets/03-voting-protocol/vote-duplicate/input.json)|[JSON](testsets/03-voting-protocol/vote-duplicate/expected.json)|[JSON](results/testsets/model/03-voting-protocol/vote-duplicate.actual.json)|通过|
|declared-votes-without-records|机器人宣告三票不等于实际存在三张具名票。|[JSON](testsets/03-voting-protocol/declared-votes-without-records/input.json)|[JSON](testsets/03-voting-protocol/declared-votes-without-records/expected.json)|[JSON](results/testsets/model/03-voting-protocol/declared-votes-without-records.actual.json)|通过|
|future-candidates-and-backward-seek|往前/往后拖动不能把未来候选带回早期时刻。|[JSON](testsets/03-voting-protocol/future-candidates-and-backward-seek/input.json)|[JSON](testsets/03-voting-protocol/future-candidates-and-backward-seek/expected.json)|[JSON](results/testsets/model/03-voting-protocol/future-candidates-and-backward-seek.actual.json)|通过|
|negative-duration|发言结束早于开始，应拒绝。|[JSON](testsets/04-invalid-input/negative-duration/input.json)|[JSON](testsets/04-invalid-input/negative-duration/expected.json)|[JSON](results/testsets/model/04-invalid-input/negative-duration.actual.json)|通过|
|string-timestamp|API 契约要求数值秒数，应拒绝字符串。|[JSON](testsets/04-invalid-input/string-timestamp/input.json)|[JSON](testsets/04-invalid-input/string-timestamp/expected.json)|[JSON](results/testsets/model/04-invalid-input/string-timestamp.actual.json)|通过|
|duplicate-event-id|重复事件 ID 应拒绝，避免票据和证据歧义。|[JSON](testsets/04-invalid-input/duplicate-event-id/input.json)|[JSON](testsets/04-invalid-input/duplicate-event-id/expected.json)|[JSON](results/testsets/model/04-invalid-input/duplicate-event-id.actual.json)|通过|
|unknown-participant|发言者不在显式名单，应拒绝。|[JSON](testsets/04-invalid-input/unknown-participant/input.json)|[JSON](testsets/04-invalid-input/unknown-participant/expected.json)|[JSON](results/testsets/model/04-invalid-input/unknown-participant.actual.json)|通过|

## 与预期不符的地方

- **stalled-1**：90s 策略期望 open_new_direction/sustain_flow，实际 observe。

这些结果保留了失败，没有为了让分数好看而修改预期。新增修复后重跑同一数据，才能比较差异。

## 如何重跑

在 `research-copy` 目录运行：

```sh
npm run eval:all
```

输出保存在 `eval/results/testsets/rule/`，本页会更新。用例不符时命令返回非零，报告仍完整保存。

真实模型另行运行（需要本目录配置 API Key，可能产生费用）：

```sh
node --env-file-if-exists=.env eval/run-suites.mjs --model
```

模型结果保存在 `eval/results/testsets/model/`，不会覆盖规则结果；本页显示最后一次运行。投票协议和输入拒绝直接检验确定性代码，不计入模型能力。

旧的 12 会话/21 点报告仍在 [旧基线摘要](results/rule/summary.md)。完整指标与人工研究设计见 [评测协议](PROTOCOL.md)。
