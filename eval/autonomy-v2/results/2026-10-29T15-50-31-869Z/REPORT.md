# 意愿状态修复后的定向复测

模型：deepseek-chat；时间：2026-10-29T15:54:15.667Z。

拒绝用例延长到 180 秒，用于验证超出近期逐字稿窗口后的保留；思考用例检查有效期内保持安静、到期后解除约束；单人停滞只跑一遍，不能用于稳定性结论。旧检查点标签没有修改，新约束评分另列，不能与旧 30/36 当作同口径提升比较。

|用例|完成|意愿/结构约束符合|旧检查点符合|重复决策完全一致窗口|
|---|---:|---:|---:|---:|
|declines-invitation|3/3|2/3|2/3|4/7|
|requested-thinking-time|3/3|3/3|3/3|5/5|
|stalled-1|1/1|1/1|1/1|未重复|

- [declines-invitation 第 1 轮](declines-invitation.run-1.json)：complete
- [declines-invitation 第 2 轮](declines-invitation.run-2.json)：complete
- [declines-invitation 第 3 轮](declines-invitation.run-3.json)：complete
- [requested-thinking-time 第 1 轮](requested-thinking-time.run-1.json)：complete
- [requested-thinking-time 第 2 轮](requested-thinking-time.run-2.json)：complete
- [requested-thinking-time 第 3 轮](requested-thinking-time.run-3.json)：complete
- [stalled-1 第 1 轮](stalled-1.run-1.json)：complete

这些是开发集上的合成回归，尚无独立人工标签或真人效果证据。合同通过不代表语义理解总是正确，也不代表不必要介入问题已解决。
