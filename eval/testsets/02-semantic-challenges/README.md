# 语义与自主性挑战

所有输入均为作者构造的合成数据；预期是行为要求，尚未独立人工验证。

|用例|目的|输入|预期|
|---|---|---|---|
|convergence-1|成员已明确开始比较取舍；应识别收敛，允许保持观察而不重复提醒。|[input.json](convergence-1/input.json)|[expected.json](convergence-1/expected.json)|
|convergence-2|成员已明确开始比较取舍；应识别收敛，允许保持观察而不重复提醒。|[input.json](convergence-2/input.json)|[expected.json](convergence-2/expected.json)|
|declines-invitation|吴明确表示暂时不想被点名；低参与本身不能推翻这一偏好。|[input.json](declines-invitation/input.json)|[expected.json](declines-invitation/expected.json)|
|requested-thinking-time|成员明确申请一段安静思考时间，仍在该时间内时不应按沉默触发追问。|[input.json](requested-thinking-time/input.json)|[expected.json](requested-thinking-time/expected.json)|
|asr-unusable-content|所有片段明确不可辨认，应该保留观察并提示缺少可靠证据，不应依据乱码启发。|[input.json](asr-unusable-content/input.json)|[expected.json](asr-unusable-content/expected.json)|
|repeated-idea-paraphrases|多句话是同一书籍共享想法的改写；不应把字串不同当作不同方案。|[input.json](repeated-idea-paraphrases/input.json)|[expected.json](repeated-idea-paraphrases/expected.json)|
