# 安装、升级与修复

本指南面向将 Agent Notes 接入项目的使用者。命令参数和行为以 [CLI 契约](../assets/references/cli.md)为准；起草与维护 Note 时读取[写入参考](../assets/references/writing.md)和[文档契约](../assets/formats/document.md)。

## 获取 CLI

准备 Node >=22.12.0 与 Git。包名为 `@hackycy/agent-notes`，可执行命令名为 `agent-notes`。可以先通过 npm 临时获取最新版并查看帮助：

```sh
npx --yes @hackycy/agent-notes@latest --help
```

使用 pnpm 时，对应命令为 `pnpm dlx @hackycy/agent-notes@latest --help`。这两种方式只获取并运行 CLI；将运行资产接入项目需要执行下面的 `init`。

也可以全局安装，然后直接调用命令：

```sh
npm install --global @hackycy/agent-notes@latest
agent-notes --help
```

下文使用 `pnpm dlx`；使用 npm 时将命令开头的 `pnpm dlx` 替换为 `npx --yes`。全局安装后，确认已安装所需版本，再直接使用 `agent-notes init` 或 `agent-notes upgrade`。`@latest` 选择 npm 当前默认发布版本；需要固定版本时，将它替换为实际版本，例如 `@0.1.0`。后文的 `X.Y.Z` 均须替换为要使用的完整版本号。

## 接入项目

在要接入的项目根目录运行 init，按提示选择安装目标、Notes 目录与模板语言（将项目路径替换为真实值）：

```sh
cd /path/to/project
pnpm dlx @hackycy/agent-notes@latest init
```

已确定的选项可直接传入，例如 `init --target claude` 只询问目录和语言。可加 `--dry-run` 交互预览；重复 init 会复用已安装值。问答中按 Esc 或 Ctrl+C 可取消，项目不变。

脚本或 CI 中显式提供目标，先预览再安装：

```sh
pnpm dlx @hackycy/agent-notes@X.Y.Z init --root /path/to/project --target agents --dry-run --json
pnpm dlx @hackycy/agent-notes@X.Y.Z init --root /path/to/project --target agents --json
```

`--json` 禁用交互；需要普通文本输出的脚本可用 `--no-interactive`。无人值守时目录和语言采用默认值，缺少目标会直接报错。

Claude 项目使用 `--target claude`；同时接入两种入口时传入 `--target agents --target claude`，它们共用 runtime 和 Notes 根。首次接入时可按[初始化与配置](../assets/references/cli.md#初始化与配置)选择文档根和模板语言。

安装完成后，在项目根检查工具文件：

```sh
node .agents/notes/runtime/cli.mjs status --json
node .agents/notes/runtime/cli.mjs check --json
```

确认 status 的完整性为 `intact`，并处理 check 返回的 diagnostics 与 review。将入口受管块、runtime、skill、配置、安装清单和生成的 Git 规则一同提交；`.agents/notes/local/` 由安装器忽略。

## 使用项目锁定版本

日常查询和写入直接调用 `node .agents/notes/runtime/cli.mjs`。CLI npm 包负责首次接入和工具版本切换；项目 runtime 随安装文件一同提交，其他成员检出后可直接离线使用，无需先全局安装 CLI。相关代码变更前先运行 context，按返回的指针读取 Note，交付前运行 check；具体规则见[查询](../assets/references/cli.md#查询)与[检查快照](../assets/references/cli.md#检查快照)。

Note 文档、runtime、配置、安装清单和 local 统一位于初始化时选择的 Notes 根目录。上面的命令使用默认 `.agents/notes`；若指定 `--notes-dir docs/decisions`，则将命令中的根目录替换为 `docs/decisions`。共享参考、格式和模板位于 `<根目录>/runtime/assets/`，该目录和宿主 skill 是工具受管资产；项目规则放在独立补充文档中，Notes 和配置分别由项目维护。

## 升级项目版本

在项目根目录，通过 npm 获取最新版并执行升级：

```sh
pnpm dlx @hackycy/agent-notes@latest upgrade --dry-run
pnpm dlx @hackycy/agent-notes@latest upgrade
```

也可以指定目标版本和项目路径。将 `X.Y.Z` 与项目路径替换为真实值：

```sh
pnpm dlx @hackycy/agent-notes@X.Y.Z upgrade --root /path/to/project --dry-run --json
pnpm dlx @hackycy/agent-notes@X.Y.Z upgrade --root /path/to/project --json
```

再次运行 status 和 check，检查升级输出的变更与备份路径，再提交受管资产变更。版本切换、项目内容保留与同名冲突的规则见[版本与升级](../assets/references/cli.md#版本与升级)。

版本由本次调用的 npm 包决定，`upgrade` 自身不查询或下载版本。版本相同且安装完整时无改动；版本相同但工具文件损坏时提示使用 `repair`。全局安装的 CLI 同样使用已安装的全局版本；先将全局包更新到所需版本，再运行 `agent-notes upgrade`。

## 修复当前安装

修复指恢复 `init` 安装的工具文件。例如 `.agents/skills/agent-note/SKILL.md` 被误删或修改，而 runtime 中的原始 skill 仍完整时，可以离线重新生成：

```sh
node .agents/notes/runtime/cli.mjs repair --dry-run
node .agents/notes/runtime/cli.mjs repair
```

`repair` 保持项目版本和 bundle 不变，恢复受管文件与规则块，保留 Notes、归档 seal、项目配置及规则块外原文。已修改的受管文件在覆盖前备份，输出会列出具体位置。

本地修复要求 runtime 的源文件完整。源文件也被删除、修改或混入未知文件时，命令会指出问题并提供同版本的 npm 修复命令。使用 `.agents/notes/install.json` 的 `version` 替换下列 `X.Y.Z`：

```sh
pnpm dlx @hackycy/agent-notes@X.Y.Z repair --dry-run
pnpm dlx @hackycy/agent-notes@X.Y.Z repair
```

npm 修复包的版本和 bundle hash 必须与项目安装清单一致；版本不符提示使用 `upgrade`。修复完成后重新运行 `status` 和 `check`。项目 runtime 提供日常命令、`status` 和 `repair`；首次接入和版本升级使用 npm 包。

## 中断与冲突

中断事务报告 `RECOVERY_REQUIRED` 时，保留现场并按[事务和恢复](../assets/references/writing.md#事务和恢复)处理。未知同名文件冲突需要先确认文件归属，再重新预览；完整检查规则见 [CLI 契约](../assets/references/cli.md)。
