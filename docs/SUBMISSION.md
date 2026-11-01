# 课程提交状态 · 2026-11-01

正式代码入口是本仓库 `main`，包含成员意愿状态与工具链失败诊断修复。项目按 HCI 课程研究原型提交，当前没有真实机器人、Pod 或真人效果实验。

## 仓库分工

|仓库|作用|
|---|---|
|[mootu-agent-research](https://github.com/YunChen0423/mootu-agent-research)|研究代码、网页、受限 Agent 工具调用、输入校验及合成评测|
|[mootu-agent](https://github.com/YunChen0423/mootu-agent)|保留 5 倍回放、邀请次数和阶段推进等编排的网站演示|
|[mootu-simulation](https://github.com/YunChen0423/mootu-simulation)|原始 MJCF / OBJ 模型、Python 物理控制和键盘交互演示|

线上演示属于演示仓库，本次没有重新部署研究版。研究网页自带导出的模型和网格，可独立运行；首次仿真需要联网下载固定版本的 MuJoCo WASM 与 Three.js。

## 本次验证

在隔离目录复制提交源码，排除 `.env`、`node_modules`、`dist` 和 Git 元数据，以 Node.js 24.14.0 运行 `npm ci` 独立安装：

- 研究版：语法检查、36 项测试、Worker 构建通过。
- 演示版：语法检查、72 项测试、Worker 构建通过。
- HTTP 检查：两版首页、XML 和压缩网格均可读取；无密钥时 API 明确返回 fallback；研究版非法时间返回 400。原始摘要见 [HTTP 结果](submission-http-smoke.json)。
- 研究版原 12 会话规则评测完整执行：21 个标签点，阶段符合 18/21，约束违规 0。
- 研究版四组 22 用例：正常 6/6、语义与自主性挑战 0/6、投票协议 6/6、非法输入 4/4；`eval:all` 因保留的语义失败返回非零。新结果单独保存在 [提交复测](../eval/submission-20261101/README.md)，没有覆盖历史结果。
- 原始仿真：MuJoCo 3.14.0，14 个 OBJ SHA-256 核对一致；`robot.xml` 和 `interaction_demo.xml` 均编译，每个场景运行 100 步，状态保持有限。两个场景各为 11 bodies / 13 joints / 10 actuators。

本次未调用付费模型，未重新进行图形浏览器或 Python viewer 人工验收。HTTP 与物理步进成功不能替代完整交互体验验证。独立安装使用 Node 24.14.0；仓库声明的最低版本 Node 22.19 未在本机另装复测。

## 结果解释

历史模型基线为 12 个决策用例各三轮，共 30/36 次符合作者标签。最新成员意愿修复仅完成三个定向用例的单轮真实模型验证，不能将历史成绩移用于最新实现，也不能把 3/3 结构约束符合解释为策略质量或稳定性已经解决。

全部评测为合成开发数据，尚未有独立人工标签和保留测试集；最终实现的 12 用例全量模型重复、方案语义去重、长期方案记忆、置信度校准和真人实验仍待完成。现场模式缺乏可靠多人身份与逐句结束时间，完整证据链主要针对导入逐字稿。

## 复现

```sh
npm ci
npm run dev
# http://localhost:4174
npm run check
npm test
npm run build
node eval/run.mjs --out /tmp/mootu-rule-check
```

`npm run eval:all` 会更新规则结果和总入口页，语义挑战不符时退出码为 1；需要保留历史时请在独立副本运行。真实模型调用需自行按 `.env.example` 设置密钥，并将新实验写入新的结果目录。不要提交 `.env`、依赖目录或本机虚拟环境。
