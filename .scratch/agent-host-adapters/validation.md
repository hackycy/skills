# 本轮验证范围

研究日期 2026-11-10。主工作区产品源码、包配置、运行资产、AGENTS 均无修改；新增内容仅 `.scratch/agent-host-adapters/`。合成第三目标只在独立 worktree 实验，已恢复产品文件，保留 patch/fixture 作为证据。

| 检查 | 实际结果 | 解释 |
| --- | --- | --- |
| 主工作区 `pnpm lint` | exit 0 | 收到全部研究副本后执行；文档链接另查 |
| `verify-research.py` | 全部相对文件链接及JSON通过 | 检查inline/reference链接，排除带原文行号的来源摘录；不冒充事实、远程可用性或A层验证 |
| Python AST / Node --check | 8 Python、6 mjs/cjs 脚本通过 | 结果见 syntax-validation.json，不执行脚本的破坏性实验阶段 |
| 固定 tarball/source 资产对照 | npm0.3.0 的11个assets原始字节与release源码一致 | 可用 research/synthesis/reproduce-baseline.py 重跑；dist执行仍以真实tarball为准 |
| Impeccable三处provider视图 | 固定源码21/19/20项 | 仅结构观察，不等于支持宿主数量；见 research/synthesis/provider-views.json |
| Notes基线完整测试 | build后9文件277/277通过 | 子研究隔离worktree；首次未build失败保留，不列为通过 |
| 合成第三目标完整测试 | 10文件282/282通过，typecheck/build/pack/离线安装通过 | 虚构静态host，非真实宿主支持；只保留研究patch |
| 真实npm0.3 smoke | test:bundle、test:install通过 | 发布包验收；不是同实现换version的真实旧包兼容证据 |
| 两CLI故障runner | 从全新cache prepare +完整run exit0 | 预期产品失败也记录为实验成功观察；不可把runner0解读为每个子命令成功 |
| 补充源码Vitest限时运行 | failures子研究60秒超时，保留记录 | 未冒充通过；notes子研究另有独立完整通过结果，两个检查不混写 |
| 宿主discovery复跑 | Codex/OpenCode隔离fixture再次一致 | 无model turn，非入口注入或context/check行为 |

固定证据见[Notes报告](research/notes/report.md)、[故障报告](research/failures/report.md)、[宿主验证](research/hosts/validation.md)。

未运行：原生Windows/Linux安装、终端和权限矩阵；所有agent模型turn/A行为；bridge或正式Provider实现；原地target-set迁移。源码平台分支注入、Git换行转换与本地HTTP字节回放均按其真实范围标记。

研究提交在独立证据worktree执行 staged diff --check，主工作区保持main与既有产品文件原样。
