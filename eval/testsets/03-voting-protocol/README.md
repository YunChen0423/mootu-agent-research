# 投票与时间协议

所有输入均为作者构造的合成数据；预期是行为要求，尚未独立人工验证。

|用例|目的|输入|预期|
|---|---|---|---|
|vote-complete|全员具名投票结束后，确认真实多数。|[input.json](vote-complete/input.json)|[expected.json](vote-complete/expected.json)|
|vote-missing|缺一位成员时不得宣布赢家。|[input.json](vote-missing/input.json)|[expected.json](vote-missing/expected.json)|
|vote-tie|票数相同时回到候选整理，不能默认第一项获胜。|[input.json](vote-tie/input.json)|[expected.json](vote-tie/expected.json)|
|vote-duplicate|首票有效，重复票不覆盖，也不增加总票数。|[input.json](vote-duplicate/input.json)|[expected.json](vote-duplicate/expected.json)|
|declared-votes-without-records|机器人宣告三票不等于实际存在三张具名票。|[input.json](declared-votes-without-records/input.json)|[expected.json](declared-votes-without-records/expected.json)|
|future-candidates-and-backward-seek|往前/往后拖动不能把未来候选带回早期时刻。|[input.json](future-candidates-and-backward-seek/input.json)|[expected.json](future-candidates-and-backward-seek/expected.json)|
