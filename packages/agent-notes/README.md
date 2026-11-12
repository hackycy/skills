# @hackycy/agent-notes

将需要长期保留的工程决策写成项目内的 Markdown Note，让 Agent 在修改相关代码前按路径或主题找到理由与取舍。CLI 负责查询、写入、生命周期转换和结构校验，两份项目 skill 引导 Agent 使用这些能力。

适合记录代码、测试和现有文档无法解释的“为什么这样做、放弃了什么”，例如兼容性取舍、持久化策略或模块责任边界。普通任务可以零 Note 完成；创建记录由用户显式要求或接受 Agent 的建议后发起，同一工作已有授权可继续使用。必要 Note 与相关代码在同一个 PR 交付。

## 快速开始

准备 Node.js >=22.12.0 与 Git，在目标项目根目录执行。将 `X.Y.Z` 替换为提供下述命令的完整 npm 包版本；已发布的旧协议版本不提供这些命令。

以下以 Codex 本地 CLI、默认 Notes 目录和中文模板为例，先预览再安装：

```sh
cd /path/to/project
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --no-interactive --dry-run
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --no-interactive
node .agents/notes/runtime/cli.mjs status --json
```

`status` 检查已安装工具与资源的完整性。日常命令使用项目锁定的 `runtime/cli.mjs`，检出项目后可离线运行。

按使用环境选择接入值：

| `--host` | skill 安装位置 | 用途 |
| --- | --- | --- |
| `generic` | `.agents/skills` | 通用静态布局，首次安装的默认选择 |
| `codex` | `.agents/skills` | Codex 本地 CLI 的静态候选接入 |
| `claude-code` | `.claude/skills` | Claude Code 本地 CLI 的静态候选接入 |

同时接入两个宿主时使用 `--host codex --host claude-code`。generic 与 codex 共享 skill 文件，所有接入共用一个 Notes 根和 runtime。两份 skill 的职责分别是：

- `agent-note`：修改前查询并阅读相关 Note，范围变化后重查，获授权后记录或更新同一决定，交付前检查。
- `agent-note-maintenance`：交付或拒绝提案，维护替代关系，判断内容吸收、归档与条件清理。

安装器保留所有 AGENTS/CLAUDE 文件原文。安装完整性与宿主实际发现、加载 skill 分别验证；如需使用指定工作流，可在任务中显式点名相应 skill。安装不保证每次自然触发或自动执行查询与检查，证据边界见[安装指南](docs/installation.md#验证安装与日常使用)。

将生成的 runtime、skill、配置、安装清单、Git 受管规则块和 Notes 纳入版本控制；`local/` 中的草稿、备份和事务状态保持忽略。自定义 Notes 根、模板语言和交互安装见[接入项目](docs/installation.md#接入项目)。下文命令均使用默认根 `.agents/notes`，自定义后需替换入口路径。

## 日常使用

### 修改前查询并阅读

传入本次变更涉及的项目相对路径，也可通过 `--topic` 匹配 Note 中的精确主题词：

```sh
node .agents/notes/runtime/cli.mjs context --paths src/orders/service.ts --topic event-ownership
```

结果包含 Note ID、标题、状态、路径、阅读时机和匹配原因。`context` 返回阅读指针，随后用 `show` 阅读正文；将下文的 `<id>` 替换为查询结果中的实际 ID：

```sh
node .agents/notes/runtime/cli.mjs show <id> --json
```

新增文件查询预期路径，重命名查询旧、新路径，删除查询旧路径；范围扩大或方案变化后重新查询。省略路径和主题时只查询全局 Note 及其依赖。默认不查询归档，追溯历史时可加 `--include-archived`，或按 ID 直接 `show`。匹配规则见[查询参考](assets/references/cli.md#查询)。

### 记录与维护决定

先查询已有记录：同一决定的事实变化使用 `update <id>`，另一决定新建 Note 并关联原记录。获授权后，从[中文提案模板](assets/templates/proposed.zh-CN.md)或[中文已交付模板](assets/templates/implemented.zh-CN.md)起草；英文项目使用对应的[提案模板](assets/templates/proposed.en.md)或[已交付模板](assets/templates/implemented.en.md)。

将完整草稿和操作 JSON 放在 `.agents/notes/local/`，按[新建输入示例](assets/references/writing.md#新建)准备 `create.json`，然后预览并写入：

```sh
node .agents/notes/runtime/cli.mjs create --input .agents/notes/local/create.json --dry-run --json
node .agents/notes/runtime/cli.mjs create --input .agents/notes/local/create.json --json
```

CLI 生成稳定 ID 和文件路径，返回写入结果。更新前先用 `show <id> --json` 取得最新 `data.hash`，将其作为写入材料的 `expected_hash`，防止覆盖期间发生的编辑。

未交付提案使用 `proposed`；交付或拒绝时通过 `transition` 转为 `implemented` 或 `rejected`。交付不自动归档，替代关系也不自动允许删除旧记录。归档永久冻结；清理须按记录状态满足相应条件。具体输入和操作见[维护和交付](assets/references/writing.md#维护和交付)、[归档](assets/references/writing.md#归档)与[条件清理](assets/references/writing.md#条件清理)。

### 交付前检查

检查当前工作树，或检查将提交的 Git index：

```sh
node .agents/notes/runtime/cli.mjs check --json
node .agents/notes/runtime/cli.mjs check --staged --json
```

检查覆盖格式、关系、相对链接、生命周期与历史保护。查看 `diagnostics` 中的错误和 `review` 中的待评审项；退出码为 0 时仍可能有语义评审项。CLI 校验机械约束，作者与评审判断记录价值、是否仍为同一决定及内容是否完整吸收。

指定提交范围使用 `--base <commit> --head <commit>`；维护巡检使用 `check --maintenance --json`，它只报告候选。快照选择和退出码见[检查快照](assets/references/cli.md#检查快照)与[输出参考](assets/references/cli.md#输出与退出码)。

## 管理项目工具

首次接入使用 `install`；后续按目标选择命令：

| 目标 | 命令 |
| --- | --- |
| 检查安装与受管资源 | `node .agents/notes/runtime/cli.mjs status --json` |
| 替换完整接入集合 | `node .agents/notes/runtime/cli.mjs hosts set --host codex --host claude-code` |
| 切换工具版本 | `npx --yes @hackycy/agent-notes@X.Y.Z tool update` |
| 修复当前版本的工具文件 | `node .agents/notes/runtime/cli.mjs repair` |

`hosts set` 接收完整的非空目标集合，保留工具版本。`tool update` 使用本次明确选择的 npm 包版本，保留接入集合；它与维护 Note 的 `update <id>` 是不同命令。`repair` 保持同版本、同 bundle，源文件或 CLI 损坏时改用匹配的完整 npm 包修复。

安装、集合调整、版本切换和修复都支持 `--dry-run` 预览。版本切换示例：

```sh
npx --yes @hackycy/agent-notes@X.Y.Z tool update --dry-run
npx --yes @hackycy/agent-notes@X.Y.Z tool update
```

工具升级保留 Notes、项目配置和归档 seal。受管文件由工具维护，手改后应先修复；未知同名内容不自动接管。旧安装清单和旧事务记录没有自动迁移支持，具体步骤见[安装、升级与修复](docs/installation.md)。

写入中断后，按[事务和恢复](assets/references/writing.md#事务和恢复)处理，再用原写命令附加 `--recover` 显式恢复；`--recover` 与 `--dry-run` 互斥。恢复冲突时保留外部编辑与事务现场。

## 参考

| 查找内容 | 文档 |
| --- | --- |
| 安装、自定义目录、宿主接入、升级与修复步骤 | [安装指南](docs/installation.md) |
| 完整命令、参数、配置、快照、输出和退出码 | [CLI 契约](assets/references/cli.md) |
| 草稿与 JSON 输入、写入、引用修复和事务恢复 | [写入与生命周期](assets/references/writing.md) |
| Note 字段、正文、关系、归档与兼容承诺 | [文档契约](assets/formats/document.md) |

产品负责项目内的文档治理，不管理 hooks、宿主事件、全局安装位置或 Git hook/CI 配置。
