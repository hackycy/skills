# @hackycy/agent-notes

通用工程决策 Notes CLI。按范围查询长期理由与取舍，记录和维护决定，验证生命周期并冻结归档。普通任务可以零 Note 完成；记录由用户显式要求或接受建议后发起。

## 使用

准备 Node >=22.12.0 与 Git，选择提供新协议的完整 npm 包版本（X.Y.Z 为选定版本）：

```sh
npx --yes @hackycy/agent-notes@X.Y.Z install
node .agents/notes/runtime/cli.mjs context --paths src/example.ts
node .agents/notes/runtime/cli.mjs check --json
```

首次默认通用 generic 接入；Codex 和 Claude Code 本地 CLI 静态候选接入使用重复的 `--host codex --host claude-code`。generic/codex 共享 `.agents/skills`，Claude 使用 `.claude/skills`，共用一个 Notes 根与锁定 runtime。安装器保持所有 AGENTS/CLAUDE 文件原文。

`agent-note` 引导查询、正文阅读、范围变化重查、交付检查和获授权后的记录；`agent-note-maintenance` 负责替代、吸收、归档与条件清理。静态安装完整性与宿主实际发现/加载分别验证，不承诺自然任务每次触发。

## 管理工具

```sh
node .agents/notes/runtime/cli.mjs status --json
node .agents/notes/runtime/cli.mjs hosts set --host claude-code
npx --yes @hackycy/agent-notes@X.Y.Z tool update --dry-run
node .agents/notes/runtime/cli.mjs repair
```

install 首装；hosts set 替换完整非空集合并保持版本；tool update 使用选定包切换版本；repair 同版本同 bundle 修复。Note 的 `update <id>` 独立存在。四个写管理命令支持 --dry-run，显式 --recover 验证旧事务后恢复；status 只读。

已有 Notes、配置和归档 seal 保留。精确安装收据及源索引决定所有权，未知同名内容不接管，未知邻接文件保留，repair 覆盖前备份。旧命令、旧清单与旧 journal 无迁移/兼容支持。源损坏使用匹配的完整 npm 包 repair。

## 参考

- [安装、升级与修复](docs/installation.md)：操作步骤、静态候选宿主与证据边界。
- [CLI 契约](assets/references/cli.md)：命令职责、配置、所有权、输出与退出码。
- [文档契约](assets/formats/document.md)：Note 身份、正文、关系和归档。
- [写入与生命周期](assets/references/writing.md)：输入材料、引用修复和恢复。

proposed、implemented、rejected 表达提案、交付和拒绝。交付不自动归档，完整替代不证明独有内容已吸收；清理有明确条件，归档正文与 seal 永久冻结。CLI 检查机械约束，作者和评审负责记录价值、同一决定与完整吸收的判断。产品不管理 hooks、宿主事件、全局安装位置或 Git hook/CI 配置。
