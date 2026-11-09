# @hackycy/agent-notes

通用工程决策 Notes CLI，提供按范围发现、记录、生命周期校验和运行资产管理。Notes 保存代码、测试与现有文档无法解释的长期理由与取舍，并与相关代码在同一个 PR 交付。

普通 Plan、机械性改动和局部 UI 调整可以零 Note 完成。记录由 Agent 建议获同意或用户显式要求发起；同一决定维护事实，另一决定新建并关联。

## 快速开始

准备 Node >=22.12.0 与 Git，在要接入的项目根目录运行（将项目路径替换为真实值）：

```sh
cd /path/to/project
npx --yes @hackycy/agent-notes@latest init
```

`npx` 从 npm 临时获取 CLI；`--yes` 跳过 npm 的下载确认，`init` 仍会交互询问安装目标、Notes 目录和模板语言。使用 pnpm 时，初始化命令也可以写成：

```sh
pnpm dlx @hackycy/agent-notes@latest init
```

安装目标可选 `agents`（通用 `.agents` 入口）、`claude`（Claude 入口）或两者；目录默认 `.agents/notes`，语言默认 `zh-CN`。初始化会安装项目 runtime、静态入口和两个 skill，首条 Note 在后续需要记录决定时创建。

初始化成功后，在项目根目录验证：

```sh
node .agents/notes/runtime/cli.mjs status --json
node .agents/notes/runtime/cli.mjs check --json
```

确认 `status` 的 `data.integrity` 为 `intact`，并处理 `check` 的 diagnostics 与 review。此后日常命令使用项目锁定的 runtime，其他成员检出已提交的安装文件后也能直接运行。

全局安装、固定版本、非交互初始化、自定义目录及升级步骤见[安装与升级](docs/installation.md)。

## 升级项目版本

在已接入项目的根目录，通过 npm 获取最新版并升级项目中的运行资产：

```sh
npx --yes @hackycy/agent-notes@latest upgrade
```

使用 pnpm 时为 `pnpm dlx @hackycy/agent-notes@latest upgrade`。可先加 `--dry-run` 预览；固定版本时将 `@latest` 换成所需版本。升级后重新运行 `status`、`check`，并提交安装文件的变更。

## 修复当前安装

例如，初始化生成的 `.agents/skills/agent-note/SKILL.md` 被误删或修改后，可以使用项目当前版本的原始文件恢复：

```sh
node .agents/notes/runtime/cli.mjs repair
```

`repair` 保持项目版本不变，覆盖已修改的工具文件前会备份。runtime 的源文件也损坏时，使用项目当前版本的 npm 包执行 `repair`；具体步骤见[修复当前安装](docs/installation.md#修复当前安装)。

## 能力

| 范围 | 命令 | 行为 |
| --- | --- | --- |
| 项目安装 | `init`、`upgrade` | 通过 npm 包首次接入或切换项目工具版本 |
| 安装检查与修复 | `status`、`repair` | 检查安装文件，使用当前版本恢复受管文件 |
| 按需读取 | `context`、`show` | 先按路径/主题返回指针，再读取相关正文 |
| 记录与维护 | `create`、`update`、`transition`、`archive`、`prune` | 校验材料、管理身份与状态、修复引用、冻结或条件清理 |
| 仓库检查 | `check` | 检查工作树、index 或指定提交；输出结构问题与语义评审项 |

npm 包的可执行命令为 `agent-notes`；项目 runtime 位于 `.agents/notes/runtime/cli.mjs`，提供日常命令、`status` 和 `repair`。

## 项目集成

支持通用 `.agents` 与 `.claude` 静态目标。Note 文档、`runtime/`、`local/`、`config.json` 和 `install.json` 统一放在 `.agents/notes/`；文档布局为 `<根目录>/<生命周期>/<分类>/YYYY-MM-DD-topic.md`。初始化的 `--notes-dir` 调整整个根目录，例如 `docs/decisions` 对应 `node docs/decisions/runtime/cli.mjs`。模板可选中英文。两个 skill 仍安装到宿主规定的 skills 目录。

两个内置 skill 随 CLI 一起安装：`agent-note` 负责记录、事实维护和交付，`agent-note-maintenance` 负责替代、吸收、归档与条件清理。入口只提供读取与记录规则，正文按需加载。

日常命令使用项目锁定的 runtime。升级替换受管脚本、skill、模板和规则，保留已有 Notes、归档 seal、项目配置与入口块外原文。安装清单记录版本和内容 hash，手改的受管资产在覆盖前备份。

## 治理边界

`proposed`、`implemented`、`rejected` 表达提案、交付和拒绝；归档保存 implemented 的历史终态。交付不会自动归档，完整替代也不等于全部内容已吸收。清理仅适用于失去防错价值的 rejected，或独有内容已全部由现行记录承接的 implemented；归档文件及 seal 永久冻结。

CLI 校验格式、路径、关系、生命周期、引用、冻结和事务条件。记录价值、是否仍为同一决定、内容是否完整吸收由作者与评审判断。检查通过不代表 Agent 已阅读或理解 Note。

集成为静态文件与通用命令，不包含 coding agent hooks、宿主会话适配或 Git hook/CI 配置管理；项目现有流程可直接调用 check。

## 参考

- [安装、升级与修复](docs/installation.md)：接入项目、确认安装、升级与修复。
- [CLI 契约](assets/references/cli.md)：参数、安装与升级、查询、检查快照、输出和退出码。
- [文档契约](assets/formats/document.md)：身份、字段、正文、关系与归档冻结。
- [写入与生命周期](assets/references/writing.md)：各写命令的输入、引用修复及中断恢复。
