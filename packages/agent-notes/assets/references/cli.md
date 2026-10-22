# CLI 契约

可执行命令为 `agent-notes`；安装后的项目入口为 `node .agent-notes/runtime/cli.mjs`。所有命令支持 `--root <path>` 和 `--json`。未提供 root 时向上定位已有安装；新安装使用 Git 根或当前目录。

## 命令与参数

| 命令 | 主要参数 | 输入与结果 |
| --- | --- | --- |
| `init` | `--target agents` / `--target claude`，可重复；`--notes-dir`、`--language` | 安装共享 runtime 和所选静态入口；target 必须显式指定 |
| `status` | 通用参数 | 管理器/项目 runtime 版本、目标、文档根及资产完整性 |
| `upgrade` | `--dry-run`、`--recover` | 使用本次调用的完整包替换项目受管资产 |
| `context` | `--paths <paths...>`、可重复 `--topic`、`--include-archived` | 返回匹配 Note 的指针，不输出正文 |
| `show <id>` | 通用参数 | 返回当前路径、原文字节 SHA-256 和正文 |
| `check` | `--base <ref>`、`--head <ref>`、`--staged`、`--maintenance` | 检查指定快照、历史差异及维护候选 |
| `create` | `--input <json-file\|->` | 从完整草稿创建 proposed 或 implemented |
| `update <id>` | 同上 | 维护同一决定；rejected 只接受限定元数据 |
| `transition <id>` | 同上，加 `--to implemented\|rejected` | proposed 交付或拒绝，保持身份并移动/修复引用 |
| `archive <id>` | 同上，可选 `--base <ref>` | 封存 implemented；需要可解析的 Git 基线 |
| `prune <id>` | 同上，可选 `--base <ref>` | 条件清理未归档记录；需要可解析的 Git 基线 |

五个内容写命令及 init/upgrade 支持 `--dry-run` 与 `--recover`，两者互斥。预览只显示变更与诊断，不落盘、不创建备份、不分配永久身份；执行时重新预检。`--recover` 先恢复中断事务，再按当前输入执行。输入、expected_hash、草稿链接解释和恢复冲突见[写入参考](writing.md)。

路径相对项目根解析，不随调用子目录改变。CLI 不弹交互式确认，不保存聊天记录或授权令牌；缺少操作材料直接报告。所有文件访问检查项目边界与 symlink，未知格式和读取错误不会作为空结果跳过。

## 初始化与配置

配置位于 `.agent-notes/config.json`：

```json
{
  "format": "agent-notes-config/1",
  "notes_dir": ".agents/notes",
  "language": "zh-CN"
}
```

`notes_dir` 必须是项目内不含空白或 Git 通配符的字面目录；`language` 为 `zh-CN` 或 `en`，只选择模板，不改变既有文档的合法性。配置缺失时初始化，已有配置按原字节保留。init 不创建示例 Note，重复运行不覆盖项目内容；工具版本变化使用 upgrade，安装目标保持原选择。

agents 目标在根 AGENTS 中写受管块，claude 目标使用已有 CLAUDE 入口或创建 `.claude/CLAUDE.md`，两个目标共用 `.agent-notes/runtime/` 和一个文档根。双目标通过 Claude 导入 AGENTS 共用路由；已有独立行的直接导入会被复用，围栏或缩进代码中的示例不算导入。新建 Claude 入口时保留已有 AGENTS 规则的可达性。

两个 skill 从相同内容源安装到目标的 skills 目录，随附的专用参考与其他文件一起安装，Markdown 链接按目标位置重算。共享参考、格式和模板位于 `.agent-notes/runtime/assets/`；该目录中的 skill 源副本用于离线重新安装与修复。已有无关的规则与 skill 可共存；没有安装清单却存在同名 skill、不明 runtime、非空 Notes 根或无主受管块时报告冲突，不隐式接管。

runtime、skill、配置、安装清单和 Notes 随 Git 分发；`.agent-notes/local/` 中的草稿、锁、journal 和备份忽略。安装为需要跟踪的文件生成精确忽略例外，不暴露其他本地 skills。

Notes、完整受管文件、配置与安装清单使用 `text eol=lf`，避免 Git 转换破坏原字节 hash。入口受管块比较允许 CRLF 归一，保存时保留块外字节与项目换行风格；既有 Git 属性冲突在写入前失败。

## 版本与升级

init/upgrade 使用本次调用的完整工具包；版本选择由调用者及包管理器完成。日常命令委派给项目锁定 runtime，离线执行，不查询或下载其他版本。status 区分管理器与项目 runtime 版本。

`.agent-notes/install.json` 记录具体版本、bundle hash、目标和每个受管文件/块的 hash。升级替换这些资产，移除旧清单中的废弃资产；保留 Notes、archive seal、项目配置、未知邻接文件和入口块外原文。相同版本完整时无需改动，损坏时允许修复。

手改受管文件在覆盖前将原文与 diff 备份到 `.agent-notes/local/backups/`，输出具体位置；备份失败则中止。未知同名文件阻止覆盖，清单不能授权越界路径。兼容的工具回退使用相同流程，只改变运行资产，不回退用户文档。

安装、升级与内容写入共用事务锁和 journal。目标 bundle 先在隔离目录验证当前文档契约，再替换资产，最后更新安装清单，完成前复核运行结果及保留的字节。恢复见[事务和恢复](writing.md#事务和恢复)。

## 查询

context 返回 ID、标题、状态、路径、read_when、匹配原因及替代关系；匹配依据为 global、scope paths、精确 topic 和 requires 闭包。没有路径或主题时只返回 global 及其现行依赖，不枚举全库。依赖闭包完整返回，不静默截断。

规划相关变更或首次编辑前查询；新增文件使用预期路径，重命名查询旧新路径，删除查询旧路径，范围扩大后重查。结果只提供指针，按需 show 或直接打开正文。scope 不准确可能漏掉相关记录，需要作者维护，零匹配不证明没有适用决策。

默认查询活跃树；归档需显式 `--include-archived`，或按 ID show。索引每次从文件在内存重建，不维护人工 INDEX、已读状态或持久查询缓存。

## 检查快照

| 调用 | 目标快照 | 基线 |
| --- | --- | --- |
| `check` | 工作树及相关未跟踪 Notes | HEAD，存在时使用 |
| `check --staged` | Git index | HEAD，存在时使用 |
| `check --base REF` | 工作树 | 指定 commit |
| `check --base REF --staged` | Git index | 指定 commit |
| `check --base REF --head REF` | 指定 commit tree | 指定 commit |

`--head` 与 `--staged` 互斥，且必须显式指定 base。ref 解析为固定 SHA 并在结果列出；无效显式 ref 失败，不隐式寻找 merge-base 或远程默认分支。初始提交或非 Git 工作树只检查当前结构，明确报告缺少历史基线。

配置、正文和引用目标始终来自同一个快照，不使用工作树文件补齐 index/commit。快照只作数据解析，验证器是实际启动的 runtime。未解决的 Git 冲突、无法读取的快照和未知格式均失败。

结构检查覆盖目录/格式、ID 唯一性、关系及环、相对链接和锚点、生命周期、rejected 历史保护、归档 seal 与基线冻结。活跃 Markdown 扫描 Git 跟踪及非忽略文件，并额外读取配置文档根；冻结出链、runtime 和 local 不参与现行链接校验。不联网验证外部 URL。

`--maintenance` 增加失配 scope 和替代记录的维护候选，不自动改写、归档或删除。check 的历史限制和归档来源规则见[文档契约](../formats/document.md)。没有 Note diff 的代码变更不会自动失败；同 PR 义务针对整个 base→head，由作者与评审核实长期理由是否完整。

## 输出与退出码

`--json` 向 stdout 输出单个对象，包含 `command`、`result`、`scope`、`data`、`diagnostics`、`review`，不混入进度日志。scope 标明实际快照与解析后的基线；diagnostics 给出 code、相关对象或路径及说明；review 列出语义待复核项。

| 退出码 | result | 含义 |
| --- | --- | --- |
| 0 | ok | 操作完成或所列机械校验通过，仍可能包含 review |
| 1 | failed | 结构、读取或事务失败 |
| 2 | invalid-input | 输入或格式无法解析 |
| 3 | needs-decision | 写命令缺少必须的记录理由或决策材料 |

CLI 不能仅凭字段或 Git diff 证明是否必须记录、是否仍为同一决定、是否完整吸收，亦不能证明 Agent 已读或理解。被删除记录、无法从快照恢复的中间状态和首次归档来源不足等情况按实际检查范围列入 review；结构通过不等于语义审核完成。
