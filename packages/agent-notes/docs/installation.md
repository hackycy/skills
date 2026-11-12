# 安装、升级与修复

本指南用于把 Agent Notes 接入项目并维护已安装工具。日常查询和记录见[README](../README.md)，完整参数与错误定义见[CLI 契约](../assets/references/cli.md)。

## 准备环境

- 安装 Node.js >=22.12.0 与 Git executable；普通目录也可安装，CLI 不会执行 `git init`。
- 在目标项目根目录运行命令。
- 将示例中的 `X.Y.Z` 替换为选定的完整 npm 包版本。以下命令面向新协议候选版本，已发布的旧协议包不提供这些命令。

首次安装和版本切换由 npm 包执行；日常命令使用项目锁定的 runtime。示例采用 `npx`，也可使用 `pnpm dlx` 或已安装的对应版本 bin。

## 接入项目

首次接入先选择宿主和 Notes 根，再任选交互安装或显式安装一种方式。

### 选择宿主和 Notes 根

| 接入值 | skill 根 | 选择场景 |
| --- | --- | --- |
| `generic` | `.agents/skills` | 使用通用静态布局 |
| `codex` | `.agents/skills` | 使用 Codex 本地 CLI 的候选接入 |
| `claude-code` | `.claude/skills` | 使用 Claude Code 本地 CLI 的候选接入 |

可重复传入 `--host` 选择多个接入。generic/codex 共享 skill 文件，全部接入共用一个 Notes 根和 runtime。CLI 保留所有 AGENTS/CLAUDE 文件原文。

首次安装可用 `--notes-dir docs/decisions` 选择整个 Notes 根，或用 `--language en` 选择英文模板。Notes 根包含配置、runtime、local 和生命周期记录；后续管理命令保留既有根与配置，不迁移目录。具体限制见[初始化与配置](../assets/references/cli.md#初始化与配置)。

### 交互安装

终端会询问缺项，默认选择 `generic`、`.agents/notes` 和中文模板：

```sh
cd /path/to/project
npx --yes @hackycy/agent-notes@X.Y.Z install
```

### 显式预览并安装

脚本或希望固定选择时，先预览，再执行相同请求：

```sh
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --host claude-code --dry-run --json
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --host claude-code --json
```

`--json`、`--no-interactive` 或 CI 环境会禁用问答。首次无人值守安装省略的值采用默认项，已有安装复用现集合与配置。重复 `install` 只检查相同身份的完整安装；调整接入集合使用 `hosts set`，切换版本使用 `tool update`。

## 验证安装与日常使用

默认 Notes 根下执行：

```sh
node .agents/notes/runtime/cli.mjs status --json
node .agents/notes/runtime/cli.mjs context --paths src/example.ts
node .agents/notes/runtime/cli.mjs check --json
```

| 命令 | 确认结果 |
| --- | --- |
| `status` | 安装身份、接入集合与受管资源完整 |
| `context` | 按任务路径返回相关 Note 的阅读指针；新项目可以没有匹配项 |
| `check` | 查看结构诊断及语义评审项；机械校验通过仍需检查 `review` |

自定义根后替换入口路径，例如 `node docs/decisions/runtime/cli.mjs status --json`。项目锁定 runtime 可离线运行；阅读正文、写入和交付检查见[日常使用](../README.md#日常使用)。

将 runtime、skill、配置、安装清单、Git 受管规则块和 Notes 纳入版本控制。`local/` 中的草稿、备份和 journal 由生成的规则忽略。受管 skill 通过工具更新；项目补充规则由项目自行维护。

安装成功只证明静态资源完整。Codex CLI 与 Claude Code CLI 的实际发现、正文加载和工作流执行需要分别验证，因此这里称为静态候选接入；安装不保证自然触发 skill 或自动执行 `context`/`check`。Windows/Linux 采用 Node 通用实现，macOS 或 Git 换行测试不构成其他系统的原生运行证据。

## 调整完整接入集合

`hosts set` 的全部 `--host` 值构成新的完整集合。例如，以下请求只保留 Claude Code 接入：

```sh
node .agents/notes/runtime/cli.mjs hosts set --host claude-code --dry-run
node .agents/notes/runtime/cli.mjs hosts set --host claude-code
node .agents/notes/runtime/cli.mjs status --json
```

版本和 Notes 根保持不变。终端缺参时可选择现集合；无人值守缺参报错，空集合始终拒绝。最后一个共享消费者撤出后才删除共享文件；未知邻接内容保留，残留同名 skill 目录会阻止再次接入。

## 升级项目版本

用目标版本的完整 npm 包先预览，再切换并检查：

```sh
npx --yes @hackycy/agent-notes@X.Y.Z tool update --dry-run
npx --yes @hackycy/agent-notes@X.Y.Z tool update
node .agents/notes/runtime/cli.mjs status --json
node .agents/notes/runtime/cli.mjs check --json
```

目标版本由包管理器选择，`tool update` 不自行查询或下载最新版本，也允许切换到较低版本。它保留接入集合、项目配置、Notes 和归档 seal；维护 Note 正文仍使用 `update <id>`。

遇到受管文件损坏时先修复再切换；同版本但 bundle 不同会拒绝。旧 `install/1`、旧 journal 和旧命令没有迁移或别名支持。版本规则见[版本与升级](../assets/references/cli.md#版本与升级)。

## 修复当前安装

runtime 可启动且源文件完整时，从项目入口修复：

```sh
node .agents/notes/runtime/cli.mjs repair --dry-run
node .agents/notes/runtime/cli.mjs repair
node .agents/notes/runtime/cli.mjs status --json
```

`repair` 保持相同版本与 bundle，可读手改在覆盖前完整备份。未知邻接文件保留，不加入工具所有权。

源文件或 CLI 本身损坏时，使用 `install.json` 所记录版本且 bundle 匹配的完整 npm 包：

```sh
npx --yes @hackycy/agent-notes@X.Y.Z repair --dry-run
npx --yes @hackycy/agent-notes@X.Y.Z repair
```

清单缺失或无效时不会扫描目录重建所有权。不可读文件、symlink、类型异常和坏规则块需要先人工处理；必要备份失败时不覆盖受管文件，可能留下部分 local 证据。CLI 无法启动时可能没有统一 JSON 结果，应从外部匹配包执行修复。

## Git 规则与容量冲突

Git 受管块由精确资产投影生成。若外部规则隐藏工具文件，或生成块改变未知邻接文件的可见/忽略状态，命令会报冲突并指出路径。

1. 对报告路径运行 `git check-ignore -v --no-index <path>` 和 `git check-attr text eol -- <path>`。
2. 按项目意图调整块外或嵌套规则。
3. 重新执行原命令的 `--dry-run`，确认后再写入。

CLI 不改写全局 Git 配置，也不生成环境专用的另一套受管块。容量错误会报告对象、实际量与上限；先保存完整原文并人工整理，再重新预览。不要截断 journal、删除未知内容或绕过检查。容量和所有权限制见[CLI 版本与升级参考](../assets/references/cli.md#版本与升级)。

## 中断与冲突

`status` 和 `--dry-run` 只读，不恢复事务。写入中断后，先按[事务和恢复](../assets/references/writing.md#事务和恢复)检查现场，再给原写命令附加 `--recover`。例如修复中断后：

```sh
node .agents/notes/runtime/cli.mjs repair --recover --json
```

显式恢复验证并恢复旧事务，再执行当前请求；输入与问答取消先于恢复写入。`--recover` 与 `--dry-run` 互斥。恢复冲突或源证据不足时保留外部编辑和 journal，按恢复参考处理后再重试。
