# CLI 契约

npm 包的可执行命令为 `agent-notes`；项目入口为 `node .agents/notes/runtime/cli.mjs`。`install` 与 `tool update` 由调用者选定的完整 npm 包执行；日常命令和 `hosts set` 由项目锁定 runtime 执行，npm 入口会委派。runtime 还提供 `status`、`repair`。误用来源在问答和恢复前返回 `PACKAGE_COMMAND_REQUIRED`。工具命令 `tool update` 与 Note 的 `update <id>` 独立，不提供旧命令或参数别名。

所有命令接受 `--root <path>`、`--json` 和 `--help`。root 省略时发现唯一 Notes 根，多根报 `ROOT_CONFLICT`，缺失报 `ROOT_NOT_FOUND`；首装使用 Git 根或当前目录。带值参数接受空格或等号；host/topic 可重复，paths 支持 `--paths a b --paths c`。单值、布尔开关和同一 host 不可重复，未知/错位/缺值参数退出 2。

## 命令与参数

| 命令 | 主要参数 | 输入与结果 |
| --- | --- | --- |
| `install` | 重复 `--host <id>`，`--notes-dir`、`--language`、`--no-interactive` | 首装或完整同身份安装的幂等检查 |
| `hosts set` | 重复 `--host <id>`，`--no-interactive` | 替换完整非空接入集合，保留锁定版本、bundle 和配置 |
| `tool update` | `--dry-run`、`--recover` | 使用明确选择的 npm 包切换工具版本，保留集合 |
| `repair` | `--dry-run`、`--recover` | 同版本、同 bundle 修复受管资产 |
| `status` | 通用参数 | 只读检查身份、接入集合、源与资产完整性 |
| `context` | `--paths <paths...>`、重复 `--topic`、`--include-archived` | 返回匹配 Note 的指针 |
| `show <id>` | 通用参数 | 返回路径、原文 SHA-256 和正文 |
| `check` | `--base`、`--head`、`--staged`、`--maintenance` | 检查指定快照、历史与维护候选 |
| `create` | `--input <json-file\|->` | 从完整草稿创建 proposed 或 implemented |
| `update <id>` | 同上 | 维护同一决定；rejected 只接受限定元数据 |
| `transition <id>` | 同上，加 `--to implemented\|rejected` | 交付或拒绝 proposed，保持身份并修复引用 |
| `archive <id>` | 同上，可选 `--base` | 封存 implemented，要求可信 Git 基线 |
| `prune <id>` | 同上，可选 `--base` | 条件清理未归档记录，要求可信 Git 基线 |

四个安装写命令与五个内容写命令接受互斥的 `--dry-run`、`--recover`。预览不写项目、锁、备份或 journal，不执行恢复；status 也不恢复。中断现场阻止普通写入；显式恢复先校验并恢复旧事务，再重新规划请求。输入校验、问答及取消先于恢复写入；执行时重新检查现场。内容写入材料见[写入参考](writing.md)。

## 初始化与配置

| 接入值 | skill 根 | 选择身份 |
| --- | --- | --- |
| generic | .agents/skills | 独立通用接入，首次默认 |
| codex | .agents/skills | Codex 本地 CLI 的静态候选接入 |
| claude-code | .claude/skills | Claude Code 本地 CLI 的静态候选接入 |

generic 与 codex 是两个独立选择，共享同源同路径资产；Claude 副本共用同一个 runtime。CLI 始终保留全部 AGENTS/CLAUDE 文件原文，不生成、导入、选择、修改或清理这些文件。静态安装成功不证明宿主实际发现、正文加载或自然触发；具体支持证据以安装指南为准。

stdin 与 stderr 均为终端、非 CI 且无 `--json`/`--no-interactive` 时，install 询问缺少的接入、Notes 根与语言。默认 generic、`.agents/notes`、`zh-CN`。无人值守采用同样默认，已安装时复用现集合及配置。重复 install 的显式集合变化要求 hosts set；版本变化要求 tool update，受管损坏要求 repair。同版本不同 bundle 一律拒绝。

hosts set 的重复 --host 是完整目标集合；终端缺参预选现集合，无人值守缺参报错，空集合始终拒绝。输入完成后直接执行。Esc/Ctrl+C 退出 130，提示走 stderr，结果走 stdout；取消不写项目。--recover 问答使用只读恢复投影，收齐后复查现场再恢复。

Notes 根只在首次 install 选择，之后保持不变，包括只选择 Claude 的项目。默认布局为：

```text
.agents/notes/
  config.json
  install.json
  runtime/
    cli.mjs
    source-index.json
    assets/
  local/
  proposed/
  implemented/
  rejected/
  archived/
```

生命周期目录按需创建。自定义 `--notes-dir docs/decisions` 后，入口为 `node docs/decisions/runtime/cli.mjs`，skill 中的命令和链接使用实际根。配置为：

```json
{
  "format": "agent-notes-config/1",
  "notes_dir": ".agents/notes",
  "language": "zh-CN"
}
```

目录须为规范项目相对字面路径，与 skill、控制文件互斥；禁止 symlink、Git 元数据、node_modules、空白及 Git 通配符。语言只选择模板，不改变已有 Note 合法性。已有配置、Notes、归档与 seal 保留原字节，已有项目内容不授予工具文件所有权。

两份 skill 为 agent-note 与 agent-note-maintenance。共享参考、格式、模板保存在 runtime/assets，专用资料随 skill 投影，链接按目的位置重算，不使用 symlink。受管文件、配置、清单与 Notes 随 Git 分发，local 草稿、锁和备份忽略。Git executable 是安装写命令的必要依赖；普通目录不自动 git init。Git 块由精确投影确定，真实 Git 验证外部规则兼容性；冲突需人工调整。

## 版本与升级

包版本由调用者/包管理器选择，tool update 不查询最新或自动下载，允许较低版本；未知接入/协议在写前失败。既有 Note 文档不迁移、不重新封存。版本相同且 bundle 相同、资产完整时幂等；任何普通管理命令遇到缺失或手改都要求 repair，包括正准备删除的资产。

runtime/source-index.json 精确列举源文件；未知邻接文件不扩张身份或所有权。已物化源只用于同一 Notes 根，资源只物化一次。source/1 索引与全部所需源经校验后才能生成资产；源损坏使用匹配的完整 npm 包 repair，不执行未知脚本取得授权。

install.json 使用 agent-notes-install/2，记录 version、bundle_sha256、integrations 和完整 path/kind/hash 收据；不得漏项、多项、重复或混入项目内容。只读取当前协议；旧清单/journal 拒绝，不视为空安装、不自动迁移。缺失或损坏清单不能靠扫描接管，需恢复有效所有权或验证 journal。

repair 仅同版本同 bundle。可读手改在覆盖前保存完整原文、完整替换及有界差异摘要；摘要不等于 unified diff。必要备份失败不覆盖，部分 local 证据可能保留。不可读、symlink、类型异常和坏规则标记停止；缺失资产直接重建。规则块按 CRLF 归一比较，块外字节保持。未知同名 skill 目录即使内容相同也冲突；移除仅删精确文件并尝试 rmdir 空专属目录，未知内容及公共容器保留。残留未知目录会阻止再次接入。

分发与内容写入共用锁和 journal。distribution journal 验证双端 source/1、install/2 和完整转换，prepared 只回 before，committed 仅验证 after 后收尾；第三种字节、未知动作或源不足时保留现场。容量超限报告对象/实际量/上限，不截断；单端点最大 16 MiB，journal 逻辑载荷 64 MiB、编码 96 MiB，本次必要备份 64 MiB，完整相对路径最多 1024 UTF-8 字节。恢复细节见[事务和恢复](writing.md#事务和恢复)。

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

`--json` 向 stdout 输出单个对象，包含 `command`、`result`、`scope`、`data`、`diagnostics`、`review`，不混入进度日志或提示。解析失败同样使用此结构；帮助文本位于 `data.help`，result 为 ok。scope 标明实际快照与解析后的基线；diagnostics 给出 code、相关对象或路径及说明；review 列出语义待复核项。

| 退出码 | result | 含义 |
| --- | --- | --- |
| 0 | ok | 操作完成或所列机械校验通过，仍可能包含 review |
| 1 | failed | 结构、读取或事务失败 |
| 2 | invalid-input | 输入或格式无法解析 |
| 3 | needs-decision | 写命令缺少必须的记录理由或决策材料 |
| 130 | 无 | 初始化问答被取消，stderr 显示取消消息 |

CLI 不能仅凭字段或 Git diff 证明是否必须记录、是否仍为同一决定、是否完整吸收，亦不能证明 Agent 已读或理解。被删除记录、无法从快照恢复的中间状态和首次归档来源不足等情况按实际检查范围列入 review；结构通过不等于语义审核完成。
