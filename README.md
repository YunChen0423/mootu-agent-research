# MooTu 研究版

本仓库是 MooTu HCI 课程项目的正式研究代码，包含讨论主持 Agent、网页界面、浏览器 MuJoCo 仿真、输入协议和可复现合成评测。最初从演示发布包建立，已移除强制邀请、按片长收敛和虚构票数等演示编排。

## 使用

要求 Node.js >= 22.19。在本目录运行：

```sh
npm ci
npm run dev
```

打开 [http://localhost:4174](http://localhost:4174)。请在本仓库运行 `npm ci` 独立安装依赖。默认是明确标注的规则基线；启用 DeepSeek 时，按 `.env.example` 配置本目录 `.env`，密钥只留本地。

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

## 提交版本与三个仓库

- [mootu-agent-research](https://github.com/YunChen0423/mootu-agent-research)：本仓库，正式研究代码与评测，以 `main` 为提交入口。
- [mootu-agent](https://github.com/YunChen0423/mootu-agent)：网站演示代码，保留展示编排。[线上演示](https://mootu-agent-lab.rich-hake-3298.chatgpt.site/)属于该演示版本，未宣称已部署研究版。
- [mootu-simulation](https://github.com/YunChen0423/mootu-simulation)：原始 OBJ / MJCF 机器人模型、Python 物理控制和键盘交互演示。

研究版网页已包含导出的模型和网格，无需另装 Python；首次仿真会从 CDN 下载固定版本的 MuJoCo WASM 和 Three.js，需要联网。可选 Python 桥接器另需原始仿真仓库，详见其 README。

当前实现包含按完成发言逐窗决策、候选校验与冷却、具名投票验证，以及带来源和有效期的成员意愿状态。真实硬件 dispatch 仍为 simulated；现场输入无可靠多人说话人分离。

最新版本程序回归为 36 项。旧基线 12 个决策用例三轮共 30/36 次符合作者标签；最新意愿修复完成三个定向用例单轮验证，不能将旧成绩当成最新代码全量成绩。全部数据为合成开发输入，尚无独立人工标签或真人效果结论。见 [提交状态](docs/SUBMISSION.md)。

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

现有数据只用于管线验证与回归，尚未构成独立测试集。历史规则基线在 3 个语义收敛判断上失败；历史模型基线已对 12 个决策用例完成三轮重复测试，另验证了 15 分钟整场输入链路。最新意愿修复与历史基线分开报告；真实用户体验和具身干预效果尚未测量。

版本管理建议见 [GitHub 组织建议](docs/GITHUB-PLAN.md)。

重复运行结果见 [稳定性报告](eval/STABILITY.md)。整场输入示例与实际输出见 [15分钟讨论时间轴](eval/full-session/TIMELINE.md)。

当前采用一个仓库、main 主线、两个基线标签。详见 [版本怎么分](docs/VERSIONS.md)。
