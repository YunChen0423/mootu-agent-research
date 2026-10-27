# 非法输入与边界

所有输入均为作者构造的合成数据；预期是行为要求，尚未独立人工验证。

|用例|目的|输入|预期|
|---|---|---|---|
|negative-duration|发言结束早于开始，应拒绝。|[input.json](negative-duration/input.json)|[expected.json](negative-duration/expected.json)|
|string-timestamp|API 契约要求数值秒数，应拒绝字符串。|[input.json](string-timestamp/input.json)|[expected.json](string-timestamp/expected.json)|
|duplicate-event-id|重复事件 ID 应拒绝，避免票据和证据歧义。|[input.json](duplicate-event-id/input.json)|[expected.json](duplicate-event-id/expected.json)|
|unknown-participant|发言者不在显式名单，应拒绝。|[input.json](unknown-participant/input.json)|[expected.json](unknown-participant/expected.json)|
