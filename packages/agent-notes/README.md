# @hackycy/agent-notes

Agent Notes 将值得长期保留的工程提案和决策写成项目内的 Markdown Note。后续修改相关代码时，Agent 可以找到当初的理由、取舍和验证依据，继续维护同一决定。

本教程以用户与 Agent 的协作为主线，从一个模糊想法开始，走到创建、交付和再次使用 Note。准备草稿、调用 CLI 通常由 Agent 完成；命令示例帮助你理解它实际做了什么，也可以手动执行。

- [什么时候需要 Note](#什么时候需要-note)
- [快速开始](#快速开始)
- [日常使用：从一个想法开始](#日常使用)
- [目录与 Git](#目录与-git)
- [管理与深入参考](#管理与深入参考)

## 什么时候需要 Note

值得记录的是代码、测试和现有文档无法充分承载的长期理由。例如，代码能显示“这里只缓存商品名称”，但未来维护者还需要知道为什么价格不能一起缓存、为什么暂时放弃共享缓存。这些取舍影响后续修改，就可能值得留下 Note。

修改按钮文案、机械性重命名或普通局部修复通常可以零 Note 完成。任务大小和是否进入 Plan，都不能单独决定是否需要记录。

| 参与者 | 在形成和保存 Note 时做什么 |
| --- | --- |
| 用户 | 提供目标、业务约束和反馈；明确要求记录，或接受 Agent 的记录建议 |
| Agent | 查询已有 Notes、调查项目事实、澄清关键问题、比较方案，并在授权范围内整理和维护记录 |
| CLI | 校验输入、文档结构、关系、链接和历史保护；生成身份与路径，执行写入和状态转换 |
| 作者与评审 | 判断记录是否有长期价值、理由是否真实、修改是否仍属于同一决定 |

决策在调查和协作中形成，Note 保存其中需要长期保留的内容。CLI 不会从聊天自动推导方案，也没有内置需求澄清或方案审批关卡。下文的讨论方式是协作示例，具体调查和判断依赖 Agent、用户与评审。

开始前先区分三件事：

| 进展 | 对记录意味着什么 |
| --- | --- |
| 同意记录 | 授权 Agent 准备和保存材料；同一工作已有授权时继续沿用 |
| 有了具体提案，或已经认可方向 | 尚未交付时可以保存为 `proposed`；提案仍可以继续讨论和修改 |
| 完成实施和验证 | 可以保存为 `implemented`，正文描述实际决定、后果和验证 |

安装工具、说出一个想法或进入 Plan 都不会自动生成正式 Note。材料完整后，Agent 才通过 CLI 明确指定状态并保存。

## 快速开始

准备 Node.js >=22.12.0 与 Git，在目标项目根目录执行。将 `X.Y.Z` 替换为提供下述命令的完整 npm 包版本；已发布的旧协议版本不提供这些命令。

以下以 Codex 本地 CLI、默认 Notes 根 `.agents/notes` 和中文模板为例，先预览再安装：

```sh
cd /path/to/project
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --no-interactive --dry-run
npx --yes @hackycy/agent-notes@X.Y.Z install --host codex --no-interactive
node .agents/notes/runtime/cli.mjs status --json
```

预览不写项目；实际安装生成 runtime、项目 skill、配置和安装清单，并维护 Git 规则。`status` 返回安装身份、接入集合与资源完整性结果。日常命令使用项目锁定的 runtime，检出项目后可离线运行。

| 使用环境 | 安装参数 | skill 位置 |
| --- | --- | --- |
| Codex 本地 CLI | `--host codex` | `.agents/skills` |
| Claude Code 本地 CLI | `--host claude-code` | `.claude/skills` |
| 通用静态布局，首次默认 | `--host generic` | `.agents/skills` |

同时使用两个宿主时传入 `--host codex --host claude-code`。generic 与 codex 共享 skill 文件，所有接入共用一个 Notes 根和 runtime。交互安装、自定义根和语言见[接入项目](docs/installation.md#接入项目)。下文都使用默认根，自定义后需替换命令入口和示例路径。

安装提供两份项目 skill：`agent-note` 用于查询、阅读、获授权后记录及交付检查；`agent-note-maintenance` 用于交付、拒绝、归档和条件清理。你可以在任务中明确要求使用，例如：

> 使用 agent-note，先查已有的相关记录，再帮我分析商品列表查询慢的问题。若有值得保留的取舍，先说明记录价值。

安装器保留所有 AGENTS/CLAUDE 文件原文。安装成功证明静态资源完整；宿主是否发现、加载 skill，以及 Agent 是否执行了工作流，需要分别验证。具体边界见[验证安装与日常使用](docs/installation.md#验证安装与日常使用)。

## 日常使用

下面使用一个假设场景：商品列表查询慢，用户考虑增加缓存。业务约束和调查结果仅用于教学，不代表本仓库的真实业务或性能结论。在自己的项目中，应替换成实际事实、路径和验证依据。

### 1. 只有一个想法时，先弄清问题

> 用户：商品列表有点慢，我想加个缓存。
>
> Agent：我先查相关 Notes 和查询实现，确认慢在哪里，再核实哪些字段允许延迟。

Agent 在规划相关变更或首次编辑前，按受影响路径和主题查询已有记录：

```sh
node .agents/notes/runtime/cli.mjs context --paths src/catalog/list.ts --topic catalog-cache --json
```

`context` 返回相关 Note 的 ID、标题、状态、路径、阅读时机和匹配原因。新项目可以没有匹配项；有匹配项时，Agent 用 `show <id> --json` 或直接打开路径阅读正文。查询不会新建 Note。

调查后，假设发现商品名称、分类和封面被重复读取；已有查询优化仍未达到性能目标，还需要核实数据新鲜度要求：

> Agent：商品展示字段最多可以延迟多久？价格和库存也允许延迟吗？
>
> 用户：名称、分类和封面可以延迟一分钟，价格和库存必须实时。

这时“加缓存”才有了可以比较方案的约束。如果仍然不知道瓶颈或允许的延迟，继续调查和讨论即可；需要落盘的探索草稿可以放在 `local/`，材料完整后再创建正式记录。

### 2. 形成具体提案，并判断是否记录

假设 Agent 已经比较继续优化查询、进程内短时缓存和共享缓存，结合当前部署规模提出建议：

> Agent：建议先用进程内缓存，只保存商品名称、分类和封面，最多保留 60 秒；价格与库存继续实时查询。当前规模下先不引入共享缓存，接受不同实例在这一分钟内展示字段略有差异。
>
> Agent：这个一致性边界值得记录，方便以后扩展列表字段时知道哪些内容不能一起缓存。要将提案保存为 Note 吗？
>
> 用户：记下来，方案后面再实施。

用户已授权记录，且已经有具体提案，但尚未实施，因此 Agent 准备 `proposed`。你也可以一开始就说“用 agent-note 把这项工作中的长期取舍记录下来”；已有授权无需在每次更新时重复获取，信息不足时仍先补齐材料。

如果调查只得到一个普通局部修复，理由能由代码、测试或现有文档承载，这项工作可以不创建 Note。Agent 应按真实考虑填写替代方案；没有其他可行候选时如实解释，不为填满章节编造讨论。

### 3. 准备完整草稿

Agent 读取项目配置，使用配置语言的模板起草。下面是一份可用于创建的完整中文提案，保存到 `.agents/notes/local/catalog-cache.md`：

```md
---
scope:
  paths: [src/catalog/**]
  topics: [catalog-cache]
read_when: 修改商品列表缓存、展示字段或数据新鲜度要求时。
---
# 商品列表缓存

## 问题

商品列表重复读取名称、分类和封面，现有查询优化后仍未达到性能目标。
业务允许这些展示字段最多延迟 60 秒，价格和库存必须实时读取。
需要明确缓存边界，避免以后增加列表字段时把价格和库存一并缓存。

## 提案

在商品列表读取模块中增加进程内缓存，只保存名称、分类和封面。
条目从加载完成起最多保留 60 秒，命中时不延长有效期；过期后重新读取，
不继续返回旧条目。价格和库存每次实时查询，不写入这份缓存。
缓存条目数设置上限，并允许关闭缓存以便回退。

## 考虑过的替代方案

继续优化查询：已检查并优化现有查询，但仍未达到目标，因此考虑减少重复读取。
共享缓存：能减少多实例的重复加载，但会增加部署和失效处理成本。
当前业务接受 60 秒内各实例展示字段略有差异，先采用进程内缓存。
缓存整个列表响应：会把价格和库存也变成延迟数据，不满足实时要求。

## 验收标准

过期测试确认条目在 60 秒后重新加载，持续命中不会延长有效期。
价格和库存变更后，下次列表请求仍能读取最新值。
相同数据和负载下，对比关闭和开启缓存：热缓存时展示字段的重复查询减少，
接口 P95 延迟降低；记录数据规模、负载、延迟和内存占用。
验证缓存条目上限生效，关闭缓存后列表仍能正常读取。

## 风险

各实例缓存独立，展示字段在允许的 60 秒内可能不同。
冷启动或同时过期会集中回源，需要观察数据库负载。
缓存增加进程内存占用，实施时需根据实际数据规模确定条目上限。
如果以后要求商品展示字段即时更新，需要重新评估失效方式和缓存位置。
```

`scope` 说明哪些代码路径或主题与本 Note 有关，影响记录能否被准确找到；`read_when` 提醒后续 Agent 何时阅读。新建草稿只提供这些元数据和可选关系，不填写正式的 `format`、`id`、`status`；字段与章节规则见[文档契约](assets/formats/document.md)。

这份草稿记录了具体提案、取舍和待完成的验收，还没有声称验证通过。Agent 应将教学中的假设替换成项目事实；完整模板见[中文提案](assets/templates/proposed.zh-CN.md)和[中文已交付决定](assets/templates/implemented.zh-CN.md)。

### 4. 正式创建 proposed

Agent 再将创建输入保存到 `.agents/notes/local/create.json`：

```json
{
  "class": "architecture",
  "status": "proposed",
  "document": ".agents/notes/local/catalog-cache.md",
  "rationale": "保留仅缓存商品展示字段、价格与库存保持实时，以及暂不引入共享缓存的理由，防止后续扩展越过一致性边界。"
}
```

这里的 `status: proposed` 明确指定创建状态，`class: architecture` 指定类别。`rationale` 说明记录价值，长期理由也要写进正文。草稿放入 `local/` 后，仍然只是输入材料；执行创建命令才会生成正式 Note。

先预览并阅读诊断与评审项：

```sh
node .agents/notes/runtime/cli.mjs create --input .agents/notes/local/create.json --dry-run --json
```

预览检查草稿及拟写入的结果，不写文件，不生成正式 ID；`data.id` 为 null。解决诊断，并确认候选记录中没有应该更新的同一决定后，再实际创建：

```sh
node .agents/notes/runtime/cli.mjs create --input .agents/notes/local/create.json --json
node .agents/notes/runtime/cli.mjs check --json
```

创建结果返回 `data.id` 和 `data.path`。CLI 生成 `an-` 开头的身份，并按首次创建的 UTC 日期、类别和标题生成路径，形如 `.agents/notes/proposed/architecture/YYYY-MM-DD-商品列表缓存.md`。保存结果中的真实 ID，后续命令用它替换 `<id>`。

此时正式 Note 已位于 `proposed/`。CLI 保留 `local/` 中的原始草稿；后续以正式 Note 为准，按需准备新的编辑草稿。`check` 检查结构、关系、链接和历史保护，仍需阅读 `review`；机械校验通过不证明提案合理或声明的事实已经核实。更完整的写入输入见[新建参考](assets/references/writing.md#新建)。

### 5. 实施、继续讨论或放弃

创建 proposed 后，可以继续完善同一提案，也可以等待实施。即使用户说“方案可以，就这么做”，尚未交付时仍保持 proposed。

实施并完成实际验证后，可以这样要求 Agent：

> 使用 agent-note-maintenance，将商品列表缓存提案按实际交付结果整理为 implemented，写清实际条目上限、性能对比和测试证据。

Agent 先读取原 Note 和最新 hash，把提案整理成“问题、决策、考虑过的替代方案、后果、验证”，再准备转换输入。`expected_hash` 使用 `show` 返回的最新 `data.hash`，防止覆盖期间发生的编辑。

```sh
node .agents/notes/runtime/cli.mjs show <id> --json
node .agents/notes/runtime/cli.mjs transition <id> --to implemented --input .agents/notes/local/deliver.json --dry-run --json
node .agents/notes/runtime/cli.mjs transition <id> --to implemented --input .agents/notes/local/deliver.json --json
```

`deliver.json` 和交付草稿需按[维护和交付输入](assets/references/writing.md#维护和交付)准备；上面的命令在材料完成后执行。验证章节写入真实结果与可定位证据，不能把计划中的性能改善写成已经发生。转换保留原 ID、首次日期、标题生成的文件名和类别，移动到 `implemented/architecture/`，并修复可确定的活跃引用。

| 实际结果 | 如何处理 |
| --- | --- |
| 继续完善同一提案 | 使用 `update <id>`，保持 proposed |
| 提案实施并验证完成 | `transition --to implemented` |
| 决定放弃缓存提案 | `transition --to rejected`，保留提案正文和真实拒绝理由 |
| 开始记录时已经实施并验证 | 可直接创建 implemented，无需补建 proposed；使用已交付模板 |

需要的 Note 和相关代码在同一个 PR 交付，可以分为多个 commit；纯提案或拒绝记录可以单独提交。交付前让 Agent 再运行 `check`；检查暂存区时使用 `check --staged --json`。快照选择见[检查快照](assets/references/cli.md#检查快照)。CLI 写入不会替你暂存、提交或推送。

### 6. 下一次修改时重新使用

以后你可能提出新的需求：

> 使用 agent-note，先读商品列表缓存的相关决定，再分析能否把促销标签也放进缓存。

Agent 再按当前受影响路径和主题调用 `context`，然后读取结果中的 Note：

```sh
node .agents/notes/runtime/cli.mjs context --paths src/catalog/list.ts --topic catalog-cache --json
node .agents/notes/runtime/cli.mjs show <id> --json
```

`context` 提供阅读指针，`show` 返回正文、当前路径和原文 hash。Agent 据此理解已有的一致性边界，并核实促销标签的新鲜度要求。默认查询活跃记录；proposed 表示候选方案，rejected 保留未采纳理由，阅读时应结合状态与替代关系判断当前指导。

同一决定的事实或范围变化用 `update`；如果改为另一项决定，例如因新的实时要求改用共享缓存，则新建并关联原记录，按实际范围表达替代关系。全文或相同主题只能帮助找到候选，是否仍为同一决定由作者与评审判断。

新增文件查询预期路径，重命名查询旧、新路径，删除查询旧路径；范围扩大或方案变化后重新查询。匹配来自 `scope` 的路径、精确主题词、全局标记和依赖关系；省略路径与主题时只返回全局记录及其依赖。记录能否被准确找到需要持续维护 scope，完整规则见[查询参考](assets/references/cli.md#查询)。

## 目录与 Git

`--notes-dir` 选择整个 Notes 根，包含正式记录、项目配置、工具和本地工作材料。默认布局如下，生命周期目录按需创建：

```text
.agents/notes/
├── config.json       # Notes 根和模板语言
├── install.json      # 工具版本、接入集合和安装清单
├── runtime/          # 项目锁定的 CLI、参考、格式和模板
├── local/            # 本地草稿、操作输入、备份和事务状态
├── proposed/         # 尚未交付的提案
├── implemented/      # 已实施并验证的决定
├── rejected/         # 未采纳的提案及拒绝理由
└── archived/         # 永久冻结的历史记录
```

正式文件采用 `<状态>/<类别>/日期-主题.md`。例如 `implemented/architecture/` 表示“已实施的架构类决定”：前一层表达生命周期，后一层按类别组织文件，便于按类别浏览。类别还包括 feature、bug-fix、simplification、process、testing；相关性查询主要依据 Note 的 scope 与关系。当前格式要求类别目录，字段与路径定义见[文档根与身份](assets/formats/document.md#1-文档根身份与编码)。

| 内容 | Git 管理方式 |
| --- | --- |
| 正式 Notes，包括 proposed、rejected 和归档清单 | 纳入版本控制；提案与拒绝理由也是共享记录 |
| runtime、项目 skill、config.json、install.json、Git 受管规则块 | 纳入版本控制，便于检出后使用相同工具 |
| local 中的草稿、操作 JSON、备份、锁和 journal | 安装器生成规则保持忽略，留在本机 |

`local/` 是工作材料目录。草稿和 JSON 用于准备写入，`backups/` 用于修复受管工具文件前保存原文等材料，`write-lock/` 用于写入互斥和中断恢复；一次正常事务结束后会清理写锁，但可以留下空的 local 父目录。

如果看到中断事务的 `write-lock/journal.json`，保留现场并按[事务和恢复](assets/references/writing.md#事务和恢复)处理。恢复时为原写命令附加 `--recover`；它与 `--dry-run` 互斥，恢复冲突需要协调外部编辑与 journal，不能当成普通草稿直接删除。

## 管理与深入参考

工具版本切换使用 `tool update`，维护 Note 正文使用 `update <id>`。调整接入集合、升级和同版本修复的步骤见[安装、升级与修复](docs/installation.md)。

已交付且仍指导当前工作的 Note 保持活跃；不再指导工程但值得追溯时，按[归档规则](assets/references/writing.md#归档)处理，归档后永久冻结。记录被替代不会自动归档或允许删除；删除需要满足[条件清理](assets/references/writing.md#条件清理)，包括独有内容的承接与入链处理。

| 查找内容 | 文档 |
| --- | --- |
| 安装、自定义根、宿主接入、升级与修复 | [安装指南](docs/installation.md) |
| 完整命令、参数、配置、查询、快照和退出码 | [CLI 契约](assets/references/cli.md) |
| 草稿与 JSON 输入、更新、状态转换、归档与恢复 | [写入与生命周期](assets/references/writing.md) |
| Note 字段、正文、关系、路径与历史保护 | [文档契约](assets/formats/document.md) |

Agent Notes 负责项目内的文档治理；hooks、宿主事件、全局安装位置和 Git hook/CI 配置由项目及宿主管理。
