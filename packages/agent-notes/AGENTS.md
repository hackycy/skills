# Agent Notes 维护指南

本包提供通用工程决策 Notes CLI。维护时先遵循仓库根指南，再按改动范围读取下列材料。

## 按改动范围读取

| 改动范围 | 必须读取的材料 |
| --- | --- |
| 记录判据、skill 职责、模块边界或资产所有权 | [设计约束与依据](docs/design.md) |
| Note 字段、章节、关系、发现或历史保护 | [文档契约](contracts/document.md)及对应 JSON Schema |
| 参数、快照、输出、安装或升级 | [CLI 契约](contracts/cli.md) |
| 写入、移动、引用修复、清理或恢复 | [写入与生命周期](writing.md) |
| 校验变更、构建或分发资产 | [验证要求](docs/validation.md) |
| 重新研究上游或调整治理原则 | [上游依据](docs/upstreams.md)与[版本锁](docs/upstreams.lock.json) |

## 保持的产品约束

- Notes 保存代码、测试和现有文档无法承载的长期理由与取舍。普通 Plan 可以零 Note 完成；机械性和局部 UI 改动豁免。必要记录与相关代码在同一 PR 交付。
- 记录由 Agent 建议获同意或用户显式要求发起；同一工作已有授权延续。CLI 校验材料与结构，作者和评审负责记录价值、同一决定及完整吸收的语义判断。
- 同一决定维护事实；另一决定新建并关联。交付不自动归档，完整替代不自动允许删除。rejected 与 implemented 的清理条件、归档永久冻结按文档契约执行。
- 只提供 `.agents` 与 `.claude` 静态入口，共享一个 Notes 根和 runtime。保持 `agent-note`、`agent-note-maintenance` 两个 skill，内容从同一源生成。
- 产品边界是文档治理：不引入 wayfinder 地图、任务树、coding agent hooks、宿主事件/版本适配、会话或已读凭据、PR API、Git hook/CI 配置管理。
- 工具与文档分别治理。升级替换受管 runtime、脚本、skill 和模板，保留 Notes、归档 seal、项目配置与入口块外原文。旧合法文档继续合法，不随工具升级迁移或重封存。

## 修改实现

- `src/cli/` 处理参数、输出和分发；`src/notes/` 统一读取、快照、格式、关系、链接与历史校验；`src/discovery/` 负责范围匹配和指针查询；`src/workflow/` 规划并执行内容事务；`src/distribution/` 管理 bundle、资产与项目 runtime 委派。
- 扩展命令时复用 reader、snapshot 和校验器。工作树、index、commit 的配置、正文和引用目标必须来自同一个快照；快照内容只作为数据读取。
- 内容写入、安装和升级共用事务锁与 journal。保留预检、持锁后及完成前的 hash 复查；恢复冲突保留外部编辑。多文件一致性由恢复协议保证。
- 引用修复使用 Markdown AST；无法确定目标或锚点时停止事务。冻结出链保持历史原样，活跃入链仍需有效。
- 完整受管文件和归档按原始字节计算 hash。只有项目入口受管块的比较允许 CRLF 归一；保存时保留块外原文。修改 Git 属性规则时覆盖真实换行转换场景。
- `init` 是新安装，`upgrade` 是已有安装的资产替换；遇到未知同名文件或未知格式要报错。兼容边界从本包契约开始，不添加旧 agent-governance 接管或迁移层。

## 文档与分发

- README 只描述产品职责、能力边界和参考入口；操作参数与格式维护在契约和写入说明中。维护依据放 `docs/`，不积累阶段进度、讨论地图、测试次数或版本稳定性评价。
- Schema 定义字段形状，文档契约定义跨文件规则；历史格式样例在 `tests/contract-examples.json`。修改模板不能给既有合法文档新增必填条件。
- `assets/`、`contracts/`、README 与 `writing.md` 会进入项目 runtime。这些文件的相对链接必须在源码、npm 包和已安装项目中都可解析；维护专用的 AGENTS.md 和 `docs/` 留在仓库内。
- 上游研究保留固定 commit 和范围；学习副本放仓库根已忽略的 `.cache/upstreams/`，不纳入 Git 或 npm 包。更新研究时同步版本锁并说明采纳的变化。

## 完成条件

运行仓库要求的 lint，检查所有受影响的文档链接。代码、契约或运行资产改动按[验证要求](docs/validation.md)运行对应测试；分发变更须验证实际 tarball 和安装后的引用。报告本次实际检查范围，临时产物放已忽略目录。
