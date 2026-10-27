# 规则与真实模型对照

此页为首轮对照；后续三轮重复结果见 [稳定性报告](STABILITY.md)。

仅比较同一测试集的当前保存结果。用例通过要求所有指定检查点均符合；投票和输入协议由相同确定性代码执行，不代表模型贡献。

|测试组|规则基线|真实模型|数据一致|
|---|---:|---:|---|
|正常讨论与基本介入|6/6|5/6|相同|
|语义与自主性挑战|0/6|6/6|相同|
|投票与时间协议|6/6|6/6|相同|
|非法输入与边界|4/4|4/4|相同|

## 决策用例详情


### 正常讨论与基本介入

模型：deepseek-chat；成功执行 6/6 个会话；动作约束违规 0。

|用例|规则|模型|模型不符原因|
|---|---|---|---|
|balanced-1|通过|通过||
|balanced-2|通过|通过||
|quiet-1|通过|通过||
|quiet-2|通过|通过||
|stalled-1|通过|不符|90s 策略期望 open_new_direction/sustain_flow，实际 observe|
|stalled-2|通过|通过||

### 语义与自主性挑战

模型：deepseek-chat；成功执行 6/6 个会话；动作约束违规 0。

|用例|规则|模型|模型不符原因|
|---|---|---|---|
|convergence-1|不符|通过||
|convergence-2|不符|通过||
|declines-invitation|不符|通过||
|requested-thinking-time|不符|通过||
|asr-unusable-content|不符|通过||
|repeated-idea-paraphrases|不符|通过||

## 解释范围

- 所有测试仍为作者合成，标签未独立人工验证。模型单次运行，不报告稳定性或统计显著性。
- 差异可能来自模型提案，也可能来自 Harness 拒绝/保护规则；需要结合各用例的 candidates、reason 和 trace 审计。
- 请求失败是运行失败，不能解释成该会话已产生一个错误策略。
- 当前没有 provider usage/cost 统计，不能精确报告费用。
- 逐项原始输出从 [总报告](RESULTS.md) 查看；规则输出保留在 `results/testsets/rule/`，模型输出在 `results/testsets/model/`。
