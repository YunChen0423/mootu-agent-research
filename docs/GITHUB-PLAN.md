# GitHub 组织建议

建议把这份研究代码纳入 GitHub 版本管理，但暂时不把评测另拆成一个仓库。评测与模型提示、策略阈值、输入契约同步变化，放在一个仓库可以用同一次 commit 对齐代码、测试集和结果。

本次只检查了本地状态：`gpt-site-release` 有本地 Git（main），没有配置 remote；`research-copy` 已独立初始化 Git，准备保存 demo 与 research 两个快照。这不代表你的 GitHub 账号没有其他项目。远程创建与推送仍需有效 GitHub 登录。具体版本方案以 VERSIONS.md 为准。

推荐组织：

```text
同一个研究仓库
  main                 # 基于证据的研究代码
  demo 分支或 demo 标签 # 保留演示版本
  agent/               # 决策与执行边界
  public/              # 交互与仿真
  eval/testsets/       # 合成输入、预期标签、用例说明
  eval/results/        # 可复现的基线报告与实际输出
  eval/PROTOCOL.md     # 冻结的评测协议
```

如果已有正式主仓库，优先在其中建立 research 分支，经过审查后合并；不要把现有 `gpt-site-release/.git` 直接复制到研究副本。若当前演示仓库不适合继续维护、研究成员或发布节奏明显不同，再考虑独立研究仓库。评测成为独立公共 benchmark、被多个系统使用时，才值得另拆数据/评测仓库。

建议首个版本包含：研究源代码、锁文件、测试、四组测试集、预期、当前规则报告和评测协议。运行依赖用 `npm ci`，不提交 node_modules、dist 和 .env。副本已添加对应 ignore。当前记录为合成数据，可以随研究代码版本化；将来真实参与者数据的存储与访问应另按授权管理。

每次实验记录 commit SHA、测试集哈希、配置哈希、模型版本和运行日期。当前 runner 已记录源文件/配置/数据哈希；等接入远程仓库后再加 Git commit SHA。通过 GitHub Actions 自动运行 `npm ci`、`npm run check`、`npm test`；语义挑战已知不符，不要把其评测通过率伪装成 CI 工程测试通过率。
