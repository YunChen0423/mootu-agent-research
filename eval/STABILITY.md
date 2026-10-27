# 模型重复运行稳定性结果

完成时间：2026/10/27 14:45:14（Asia/Shanghai）。

模型：deepseek-chat。12 个决策用例各 3 次，共 36 次会话运行；复用原首轮并新增两轮，数据、核心策略代码与配置经过哈希核对。

- 符合预期的会话运行：**30/36**。
- 三轮都符合预期的用例：**7/12**。
- 各轮符合预期：第1轮 11/12；第2轮 12/12；第3轮 7/12。
- 执行失败：0。
- 标注检查点的三轮决策完全一致：**12/18**。
- 全时间轴决策完全一致：52/63（包含强制观察的启动期，因此通常比关键检查点更容易一致）。

一致性只比较 strategy、target、stage，不要求话术逐字相同。**一致不代表正确；不同输出也可能都属于合理策略。三次是初步重复检查，不足以证明真实场景泛化或给出可靠的总体概率。**

|用例|第1轮|第2轮|第3轮|标注点三轮相同|全部窗口三轮相同|
|---|---|---|---|---:|---:|
|balanced-1|[符合](results/stability/2026-10-27T06-34-06-891Z/balanced-1.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/balanced-1.run-2.json)|[不符](results/stability/2026-10-27T06-34-06-891Z/balanced-1.run-3.json)|1/2|4/5|
|balanced-2|[符合](results/stability/2026-10-27T06-34-06-891Z/balanced-2.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/balanced-2.run-2.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/balanced-2.run-3.json)|2/2|5/5|
|quiet-1|[符合](results/stability/2026-10-27T06-34-06-891Z/quiet-1.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/quiet-1.run-2.json)|[不符](results/stability/2026-10-27T06-34-06-891Z/quiet-1.run-3.json)|1/2|4/5|
|quiet-2|[符合](results/stability/2026-10-27T06-34-06-891Z/quiet-2.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/quiet-2.run-2.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/quiet-2.run-3.json)|2/2|5/5|
|stalled-1|[不符](results/stability/2026-10-27T06-34-06-891Z/stalled-1.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/stalled-1.run-2.json)|[不符](results/stability/2026-10-27T06-34-06-891Z/stalled-1.run-3.json)|1/2|4/5|
|stalled-2|[符合](results/stability/2026-10-27T06-34-06-891Z/stalled-2.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/stalled-2.run-2.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/stalled-2.run-3.json)|2/2|5/5|
|convergence-1|[符合](results/stability/2026-10-27T06-34-06-891Z/convergence-1.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/convergence-1.run-2.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/convergence-1.run-3.json)|0/1|3/5|
|convergence-2|[符合](results/stability/2026-10-27T06-34-06-891Z/convergence-2.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/convergence-2.run-2.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/convergence-2.run-3.json)|1/1|4/5|
|declines-invitation|[符合](results/stability/2026-10-27T06-34-06-891Z/declines-invitation.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/declines-invitation.run-2.json)|[不符](results/stability/2026-10-27T06-34-06-891Z/declines-invitation.run-3.json)|0/1|5/6|
|requested-thinking-time|[符合](results/stability/2026-10-27T06-34-06-891Z/requested-thinking-time.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/requested-thinking-time.run-2.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/requested-thinking-time.run-3.json)|1/1|4/5|
|asr-unusable-content|[符合](results/stability/2026-10-27T06-34-06-891Z/asr-unusable-content.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/asr-unusable-content.run-2.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/asr-unusable-content.run-3.json)|1/1|5/5|
|repeated-idea-paraphrases|[符合](results/stability/2026-10-27T06-34-06-891Z/repeated-idea-paraphrases.run-1.json)|[符合](results/stability/2026-10-27T06-34-06-891Z/repeated-idea-paraphrases.run-2.json)|[不符](results/stability/2026-10-27T06-34-06-891Z/repeated-idea-paraphrases.run-3.json)|0/1|4/7|

## 波动位置

- balanced-1，90s：第1轮 ["observe",null,"diverge"]；第2轮 ["observe",null,"diverge"]；第3轮 ["sustain_flow",null,"diverge"]。
- quiet-1，90s：第1轮 ["invite_quiet_member","吴","diverge"]；第2轮 ["invite_quiet_member","吴","diverge"]；第3轮 ["observe",null,"diverge"]。
- stalled-1，90s：第1轮 ["observe",null,"diverge"]；第2轮 ["open_new_direction",null,"diverge"]；第3轮 ["invite_quiet_member","林","diverge"]。
- convergence-1，90s：第1轮 ["observe",null,"diverge"]；第2轮 ["observe",null,"diverge"]；第3轮 ["sustain_flow",null,"diverge"]。
- convergence-1，120s：第1轮 ["observe",null,"converge"]；第2轮 ["prepare_convergence",null,"converge"]；第3轮 ["observe",null,"converge"]。
- convergence-2，90s：第1轮 ["prepare_convergence",null,"diverge"]；第2轮 ["observe",null,"diverge"]；第3轮 ["observe",null,"diverge"]。
- declines-invitation，90s：第1轮 ["observe",null,"diverge"]；第2轮 ["observe",null,"diverge"]；第3轮 ["open_new_direction",null,"diverge"]。
- requested-thinking-time，120s：第1轮 ["observe",null,"diverge"]；第2轮 ["observe",null,"diverge"]；第3轮 ["open_new_direction",null,"diverge"]。
- repeated-idea-paraphrases，90s：第1轮 ["sustain_flow",null,"diverge"]；第2轮 ["open_new_direction",null,"diverge"]；第3轮 ["observe",null,"diverge"]。
- repeated-idea-paraphrases，150s：第1轮 ["sustain_flow",null,"diverge"]；第2轮 ["open_new_direction",null,"diverge"]；第3轮 ["observe",null,"diverge"]。
- repeated-idea-paraphrases，180s：第1轮 ["observe",null,"diverge"]；第2轮 ["observe",null,"diverge"]；第3轮 ["invite_quiet_member","周","diverge"]。

## 标签解释与审计

本轮沿用原有预期，没有为了提高分数而调整标签。但这些预期尚未经独立人工验证：例如 declines-invitation 第三轮选择 open_new_direction，没有点名吴，因此只能记为“不符合预设 observe”，不能直接据此断言违反了吴的拒绝。requested-thinking-time 的 120 秒已超过所请求的一分钟思考期，该时刻的策略变化不一定是错误。

后续应让独立标注者分别判断“是否应向全组提问”和“是否允许点名特定成员”，并允许多个合理策略。不要把当前合成标签一致率解释成真人场景正确率。

## 整场讨论输入

另用一份 **15 分钟、4 位成员、60 条发言**的合成完整讨论做输入链路验证。模型执行状态：complete；输出 31 条决策；0–900 秒、每 30 秒一条的完整时间轴检查：通过。这次长会话只运行一遍，不计入短用例的三轮稳定性分数，也没有人工质量金标准。

- [整场输入 JSON](full-session/input.json)
- [整场实际输出的可读时间轴](full-session/TIMELINE.md)
- [结构预期](full-session/expected.json)
- [整场实际输出](results/stability/2026-10-27T06-34-06-891Z/full-session-15min.run-1.json)
- [整场输入说明](full-session/README.md)
- [完整机器可读汇总](results/stability/2026-10-27T06-34-06-891Z/summary.json)

## 现在支持什么输入输出

可以一次输入整场带时间戳和说话人的逐字稿。系统会沿时间轴逐次读取已完成的近期发言与历史决策，输出每个时间点的阶段、策略、对象、依据、候选和机器人话术。

当前模型每窗最多读取最近 60 秒中的 8 条已完成发言；历史决策记忆不等同于完整会议逐字稿的可靠长期摘要。长时间偏好保留、早期方案追溯仍需另测。原始录音/视频的可靠自动转写和多人说话人分离尚未完整接入。

重复运行使用 Provider 默认采样设置，没有强制随机种子或温度。复用首轮串行记录，新两轮最多并行 3 个会话，因此不直接比较不同轮的延迟。所有数据为作者合成，预期未经独立人工验证；没有真人小组效果证据。
