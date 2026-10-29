# MooTu 研究版

这个目录从 `../gpt-site-release` 复制，用于恢复基于证据的决策和可复现评测。父目录及原演示发布包没有修改。副本没有复制 `.env`、密钥、部署身份、依赖目录或构建产物，也没有替换线上网站。

## 使用

要求 Node.js >= 22.19。在本目录运行：

```sh
npm ci
npm run dev
```

打开 [http://localhost:4174](http://localhost:4174) 。在当前工作区可复用父目录已安装的依赖；搬走副本后运行 `npm ci` 独立安装。默认是明确标注的规则基线；启用 DeepSeek 时，手动按 `.env.example` 配置本目录 `.env`。

```sh
npm run check
npm test
npm run eval
npm run build
```

真实模型评测需要你自行提供密钥，可能产生 API 费用：

```sh
node --env-file-if-exists=.env eval/run.mjs --model
```

已使用 DeepSeek 进行一轮真实模型合成评测，见 [规则与模型对照](eval/COMPARISON.md)。测试中的 faux provider 只验证工具闭环，不算模型能力评测。模型评测没有密钥或运行失败会报告失败，不会混进规则结果。

## 入口

后续修复与新复测见 [意愿状态与失败审计](eval/autonomy-v2/README.md)；[新结果](eval/autonomy-v2/RESULTS.md)与旧基线分开保存。

**新增测试集和结果入口：[eval/RESULTS.md](eval/RESULTS.md)**。四组共 22 个用例，每个都有独立输入、预期和实际输出。运行 `npm run eval:all` 更新报告；语义挑战不符会返回非零，这是保留的能力缺口。


- [改动与剩余限制](docs/RESTORATION.md)：哪些演示逻辑已移除，哪些研究设施还没实现。
- [评测协议](eval/PROTOCOL.md)：指标、对照、人工盲评和真实小组研究设计。
- [输入输出契约](eval/IO.md)：逐字稿、成员名单、设备事件与决策输出。
- [示例输入](eval/example-input.json)：可上传到界面的 JSON 会话。
- [基线结果](eval/results/rule/summary.md)：实际运行结果与失败点。
- `eval/cases.jsonl`：12 个作者构造的跨话题合成会话，共 21 个初始标注点。
- `eval/annotation-template.csv`：人工独立标注模板，评分留空。

现有数据只用于管线验证与回归，尚未构成独立测试集。规则基线在 3 个语义收敛判断上失败；真实模型已对 12 个决策用例完成三轮重复测试，另验证了 15 分钟整场输入链路；真实用户体验和具身干预效果尚未测量。

版本管理建议见 [GitHub 组织建议](docs/GITHUB-PLAN.md)。

重复运行结果见 [稳定性报告](eval/STABILITY.md)。整场输入示例与实际输出见 [15分钟讨论时间轴](eval/full-session/TIMELINE.md)。

当前采用一个仓库、main 主线、两个基线标签。详见 [版本怎么分](docs/VERSIONS.md)。
