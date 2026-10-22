# @hackycy/agent-notes

通用工程决策 Notes CLI，提供按范围发现、记录、生命周期校验和运行资产管理。Notes 保存代码、测试与现有文档无法解释的长期理由与取舍，并与相关代码在同一个 PR 交付。

普通 Plan、机械性改动和局部 UI 调整可以零 Note 完成。记录由 Agent 建议获同意或用户显式要求发起；同一决定维护事实，另一决定新建并关联。

## 能力

| 范围 | 命令 | 行为 |
| --- | --- | --- |
| 运行资产 | `init`、`status`、`upgrade` | 安装静态入口与共享 runtime，检查完整性并替换受管资产 |
| 按需读取 | `context`、`show` | 先按路径/主题返回指针，再读取相关正文 |
| 记录与维护 | `create`、`update`、`transition`、`archive`、`prune` | 校验材料、管理身份与状态、修复引用、冻结或条件清理 |
| 仓库检查 | `check` | 检查工作树、index 或指定提交；输出结构问题与语义评审项 |

运行要求为 Node >=22.12.0；安装、升级和 Git 快照检查需要 Git。可执行命令为 `agent-notes`，项目 runtime 位于 `.agent-notes/runtime/cli.mjs`。

## 项目集成

支持通用 `.agents` 与 `.claude` 静态目标，共享一个 Notes 根和 runtime。默认文档布局为 `.agents/notes/<生命周期>/<分类>/YYYY-MM-DD-topic.md`；初始化可指定项目内的其他文档根与中英文模板。

两个内置 skill 随 CLI 一起安装：`agent-note` 负责记录、事实维护和交付，`agent-note-maintenance` 负责替代、吸收、归档与条件清理。入口只提供读取与记录规则，正文按需加载。

日常命令使用项目锁定的 runtime。升级替换受管脚本、skill、模板和规则，保留已有 Notes、归档 seal、项目配置与入口块外原文。安装清单记录版本和内容 hash，手改的受管资产在覆盖前备份。

## 治理边界

`proposed`、`implemented`、`rejected` 表达提案、交付和拒绝；归档保存 implemented 的历史终态。交付不会自动归档，完整替代也不等于全部内容已吸收。清理仅适用于失去防错价值的 rejected，或独有内容已全部由现行记录承接的 implemented；归档文件及 seal 永久冻结。

CLI 校验格式、路径、关系、生命周期、引用、冻结和事务条件。记录价值、是否仍为同一决定、内容是否完整吸收由作者与评审判断。检查通过不代表 Agent 已阅读或理解 Note。

集成为静态文件与通用命令，不包含 coding agent hooks、宿主会话适配或 Git hook/CI 配置管理；项目现有流程可直接调用 check。

## 参考

- [安装与升级](docs/installation.md)：接入项目、确认安装、修复与版本切换。
- [CLI 契约](assets/references/cli.md)：参数、安装与升级、查询、检查快照、输出和退出码。
- [文档契约](assets/formats/document.md)：身份、字段、正文、关系与归档冻结。
- [写入与生命周期](assets/references/writing.md)：各写命令的输入、引用修复及中断恢复。
