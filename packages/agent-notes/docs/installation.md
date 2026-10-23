# 安装与升级

本指南面向将 Agent Notes 接入项目的使用者。命令参数和行为以 [CLI 契约](../assets/references/cli.md)为准；起草与维护 Note 时读取[写入参考](../assets/references/writing.md)和[文档契约](../assets/formats/document.md)。

## 接入项目

准备 Node >=22.12.0 与 Git，并选择要使用的完整 npm 包版本。将下列 `X.Y.Z` 与项目路径替换为真实值。在项目目录运行 init，按提示选择安装目标、Notes 目录与模板语言：

```sh
pnpm dlx @hackycy/agent-notes@X.Y.Z init
```

已确定的选项可直接传入，例如 `init --target claude` 只询问目录和语言。可加 `--dry-run` 交互预览；重复 init 会复用已安装值。问答中按 Esc 或 Ctrl+C 可取消，项目不变。

脚本或 CI 中显式提供目标，先预览再安装：

```sh
pnpm dlx @hackycy/agent-notes@X.Y.Z init --root /path/to/project --target agents --dry-run --json
pnpm dlx @hackycy/agent-notes@X.Y.Z init --root /path/to/project --target agents --json
```

`--json` 禁用交互；需要普通文本输出的脚本可用 `--no-interactive`。无人值守时目录和语言采用默认值，缺少目标会直接报错。

Claude 项目使用 `--target claude`；同时接入两种入口时传入 `--target agents --target claude`，它们共用 runtime 和 Notes 根。首次接入时可按[初始化与配置](../assets/references/cli.md#初始化与配置)选择文档根和模板语言。

安装完成后，在项目根检查资产：

```sh
node .agent-notes/runtime/cli.mjs status --json
node .agent-notes/runtime/cli.mjs check --json
```

确认 status 的完整性为 `intact`，并处理 check 返回的 diagnostics 与 review。将入口受管块、runtime、skill、配置、安装清单和生成的 Git 规则一同提交；`.agent-notes/local/` 由安装器忽略。

## 使用项目锁定版本

日常查询和写入直接调用 `node .agent-notes/runtime/cli.mjs`。相关代码变更前先运行 context，按返回的指针读取 Note，交付前运行 check；具体规则见[查询](../assets/references/cli.md#查询)与[检查快照](../assets/references/cli.md#检查快照)。

共享参考、格式和模板位于 `.agent-notes/runtime/assets/`。该目录和宿主 skill 是工具受管资产；项目规则放在独立补充文档中，Notes 和配置分别由项目维护。

## 升级与修复

使用目标版本的完整 npm 包预览并执行升级：

```sh
pnpm dlx @hackycy/agent-notes@X.Y.Z upgrade --root /path/to/project --dry-run --json
pnpm dlx @hackycy/agent-notes@X.Y.Z upgrade --root /path/to/project --json
```

再次运行 status 和 check，检查升级输出的变更与备份路径，再提交受管资产变更。版本切换、项目内容保留与同名冲突的规则见[版本与升级](../assets/references/cli.md#版本与升级)；兼容版本的回退使用相同流程。

完整的项目 runtime 也能离线运行 upgrade，按当前版本修复宿主 skill。runtime 的源资产已损坏时，使用相同版本的完整 npm 包修复。受管文件的手改会在覆盖前备份，升级输出会列出具体位置。

中断事务报告 `RECOVERY_REQUIRED` 时，保留现场并按[事务和恢复](../assets/references/writing.md#事务和恢复)处理。未知同名文件冲突需要先确认文件归属，再重新预览；完整检查规则见 [CLI 契约](../assets/references/cli.md)。
