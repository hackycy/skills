# 设计约束与依据

本文解释 Agent Notes 的记录原则、产品边界和维护职责，供修改产品行为或文档布局时使用。命令和格式分别由 [CLI 契约](../../assets/references/cli.md)、[文档契约](../../assets/formats/document.md)定义；安装内部机制见[安装投影与恢复](integrations.md)。

治理原则来自固定版本的 DeepSeek Harness Notes，采纳范围与本包扩展见[上游依据](upstreams.md)。全部维护材料可从[文档导航](../README.md)查找。

## 规划与记录分别判断

工作规模决定是否需要规划，长期理由决定是否需要 Note。仅当代码、测试和文档未解释理由，且漏记可能让人误选已否决的方案时，才写 Note。

任务允许修改项目、记录属于当前工作范围、且用户或项目规则未禁止时，Agent 按记录判据直接创建或更新，无需单独确认。进入 Plan 或加载 skill 不授予写权限，纯规划和只读任务不写入。完整的未交付提案可以保存为 `proposed`；已实施并验证的决定才写为 `implemented`。不为任务生成空壳 Note、免写文件或会话台账。

必要 Note 与相关代码在同一个 PR 交付，可以分布在多个 commit。纯提案、拒绝或文档维护可以独立提交；没有 PR 时，以团队一起检查并集成的完整变更范围为交付单元。

## skill、CLI 与评审的职责

| 参与者 | 职责 |
| --- | --- |
| `agent-note` | 相关规划或首次编辑前查询并阅读；范围变化重查；按判据创建或更新；交付前检查 |
| `agent-note-maintenance` | 新建前定向审计；判断交付、拒绝、替代、剩余价值、吸收、归档与条件清理 |
| CLI | 校验输入、格式、关系、引用、历史保护，执行带并发检查的写入 |
| 作者与评审 | 判断长期价值、语义身份和完整吸收，审查 CLI 无法从快照重建的过程 |

两份 skill 的动作编排以其[运行源](../../assets/skills/)为准。静态安装、宿主发现、正文加载和任务执行分别验证；工具扫描到文件不等于 Agent 已读或理解。

产品只管理项目 skill 与共享 runtime。全部 AGENTS/CLAUDE 文件由项目维护。产品范围不包含 wayfinder 地图、任务树、hooks、宿主事件或版本适配、插件、会话与已读凭据、PR API、Git hook/CI 配置，也不管理全局、桌面、IDE、云或远端宿主接入。

## 决定身份与历史价值

维护首先区分“同一决定的事实变化”和“另一个决定”：前者更新原 Note，后者新建并关联。新建前定向审计涉及同一决定、机制或被拒替代方案的活跃记录，同一 PR 处理确认的匹配。相同标题或 topic 只能提供候选，不能证明语义身份；审计不是全库清理或 CLI 写入门禁。

| 判断 | 设计选择与理由 |
| --- | --- |
| 方向已确定，但尚未交付 | 保持 proposed；同意方向不等于实现完成，无需 accepted 状态 |
| 已实现并验证的新决定 | 可直接创建 implemented，无需人为补一轮提案 |
| 提案未采纳或停止推进 | 保留原提案及真实拒绝理由，转 rejected，无需 withdrawn 状态 |
| 已交付且仍指导工程 | 保持活跃；交付本身不构成归档理由 |
| implemented 不再指导工程，但值得追溯 | 归档并永久冻结，避免历史随实现继续漂移 |
| 活跃 implemented 只记录局部 UI 或纯机械变更 | 优先判断能否直接清理，避免为没有长效理由的记录寻找承接者或增加归档 |
| 合并清理实质性 implemented 或清理 rejected | implemented 需确认全部独有内容已被现行 owner 吸收；rejected 需判断是否已无防错价值 |

partial/full 表达替代范围。合并删除另需确认独有内容已由现行 owner 完整承接。部分替代后继续维护剩余指导范围。

rejected 保留原提案和拒绝理由，允许的维护限于路由元数据及可验证的引用修复；归档则冻结正文、元数据、路径和 seal。精确转换、清理及保护规则由[正文与生命周期](../../assets/formats/document.md#4-正文与生命周期)和[写入参考](../../assets/references/writing.md)定义。

`check --maintenance` 提供维护候选，作者选择具体动作；不按年龄、字数或配额自动清理，也不创建持久维护队列。

归档发现采用 `context` 默认排除与根级 `.rgignore` 双层规则，降低冻结事实被当作现行指导的机会，并保留显式历史查询。具体搜索工具边界由[发现契约](../../assets/references/cli.md#归档与全文搜索)定义。

## 文档内容与分发

按主要读者和事实归属组织文档，以分发范围决定安装内容。每个主题保留一个完整定义位置，其他文档提供摘要与链接。

| 唯一维护位置 | 内容与职责 | 分发范围 |
| --- | --- | --- |
| [README](../../README.md) | 产品概览与入门教程，以用户和 Agent 的完整协作案例解释日常使用 | 仓库、npm |
| [安装指南](../installation.md) | 安装、确认、升级和修复步骤 | 仓库、npm |
| [文档导航](../README.md)、`docs/maintainers/` 与 [AGENTS](../../AGENTS.md) | 导航、设计理由、开发约束、验证和上游依据 | 仅仓库 |
| `assets/skills/` | 两个 skill 的工作流及专用资料 | npm、runtime 与宿主 skills 目录 |
| `assets/references/` | 共享命令行为、写入输入、生命周期操作和恢复 | npm、runtime |
| `assets/formats/` | Schema 与文档跨文件语义 | npm、runtime；Schema 同时作为 CLI 编译输入 |
| `assets/templates/` | 新 Note 的起草材料 | npm、runtime |

Schema 定义字段形状，文档契约定义跨文件规则，模板提供起草提示。修改模板不改变已有 Note 的合法性；新增必填内容必须通过明确的协议演进处理。

`assets/` 是运行资源的唯一编辑源。runtime 保留完整副本以支持离线修复；宿主 skill 是安装投影，共享链接指向 runtime，专用链接指向该 skill 的安装目录。生成副本不增加编辑源，也不作为项目定制入口。

产品资源的本地引用在 `assets/` 内闭合，README 和安装指南的引用在 npm 包内闭合。仓库导航和维护文档可以引用源码、测试及其他维护材料。分发和链接检查见[文档一致性](validation.md#文档一致性)。

## 工具所有权与版本治理

| 对象 | 所有者 | 更新边界 |
| --- | --- | --- |
| runtime、源索引、skill、模板、文档契约、Git 与搜索受管块 | 工具包 | 按工具版本与 bundle 一起替换 |
| `install.json` | 安装器 | 记录精确收据，在事务最后切换 |
| `config.json`、Note、archive manifest | 项目 | 首装仅初始化缺失配置；版本切换保留既有原字节与路径 |
| AGENTS/CLAUDE 与规则块外内容 | 项目 | 工具保留原文 |
| local 草稿、journal、备份 | 本地运行状态 | Git 忽略，通过恢复协议或人工处置 |

工具 SemVer 与持久文档格式独立。升级只替换工具，旧合法 Note 继续合法，归档不迁移或重封存。旧安装管理协议的拒绝范围见[内部协议](integrations.md#source1-与-install2)，不影响合法 Note 的兼容承诺。

`install` 和 `tool update` 从明确选择的完整 npm 包执行；日常命令委派到项目锁定 runtime，以便检出后离线使用。版本切换、集合调整和同版本修复分开，避免调用入口改变命令职责；详细命令契约见[版本与升级](../../assets/references/cli.md#版本与升级)。

未知文件不因邻接关系获得工具所有权。受管损坏先修复，必要备份失败不覆盖；源损坏使用匹配的完整 npm 包。项目定制使用配置或独立补充规则，配置不提供关闭冻结和路径保护等核心约束的政策 DSL。

## 持久文档格式适配

Note、归档清单和项目配置按文件的顶层 `format` 分派给 Adapter。Adapter 将持久表示转换为版本无关的 canonical 模型。核心负责身份、路径与状态、关系生效、历史保护、seal 校验和写入事务。每个文件保留自己的来源，混合版本的 Note 因此可以在同一索引里共享身份和关系规则。产品支持范围见[文档契约](../../assets/formats/document.md#7-兼容承诺)。

| 考虑过的方案 | 取舍 |
| --- | --- |
| 用最新解析器在读取时统一转换 | 封存历史仍依赖旧格式解码及原始字节。隐式转换会把兼容性绑到最新格式，并扩大常规写入的影响范围。 |
| 为每个版本复制 reader、关系、历史和写入逻辑 | 混合版本的依赖与反链仍需跨版本判断，重复实现还会使 seal、rejected 保护与基线规则分叉。 |
| 建通用版本框架和迁移链 | 三类文档共用 Markdown frontmatter 和 JSON 两种载体。静态注册与直接转换便于验证目标是否能表达源内容。 |

### 模型、来源和分派

| 模型 | 内容与写入职责 |
| --- | --- |
| `NoteContent` | 生产格式为 `agent-note/1`。包含决定的 canonical 元数据、正文及提取出的标题。reader 补充路径和 lifecycle，归档路径中的状态仍为 `implemented`。Adapter 可创建、按原格式 patch 或渲染显式转换结果。 |
| `Manifest` | 生产格式为 `agent-note-archive/1`。按 Note ID 保存 seal，含归档路径、SHA-256 和可复核的源路径、hash 及可选 revision。清单缺失时可初始化，每次只追加一个新 seal。 |
| `ProjectConfig` | 生产格式为 `agent-notes-config/1`。记录当前快照的 Notes 根和模板语言。仅首装且缺失时渲染，升级直接保留既有字节。 |

来源保存 `format`、路径、只读原字节、原字节的 SHA-256，以及注释和不透明扩展是否存在。缺失配置或清单可使用默认值，其来源明确缺失。安装恢复使用独立的 `transaction/2` DTO 解读旧 journal 的配置快照。 [Canonical 模型](../../src/notes/model.ts) · [Adapter 端口](../../src/notes/formats/ports.ts) · [Reader](../../src/notes/reader.ts) · [安装事务](../../src/distribution/transition.ts)

1. 共享载体读取器在同一快照内验证 UTF-8、frontmatter 分隔符和映射语法，拒绝重复键、YAML alias、显式 tag 和 merge key，并限制嵌套。分派只读取顶层 `format`。工作树、index、commit 和可复核的归档来源各自按所读字节分派。配置候选按当前快照发现，并核对 `notes_dir` 与实际布局。 [载体读取](../../src/notes/formats/carrier.ts) · [布局发现](../../src/distribution/layout.ts)
2. Registry 按文档类别和格式查找已冻结的注册项。每项声明 Adapter、校验器、读写与迁入迁出权限及 `introducedIn`、`deprecatedIn`、`removedIn`。组装时验证注册唯一、格式标识一致、版本窗口有序及默认项可读可写。三个生产 v1 格式始于工具 `0.1.0`，创建使用 `agent-note/1`。 [Registry](../../src/notes/formats/registry.ts) · [生产注册](../../src/notes/formats/production-entries.ts)
3. 所选 Adapter 执行格式校验和 canonical 映射。Note 的解析先校验元数据，再通过核心注入的检查确认 scope 路径及状态与位置相符，最后校验正文并提取标题，保留 v1 诊断顺序。索引、关系、历史检查和写入规划通过注入的格式接口工作。兼容现有载体的纯表示变更只需一个 Adapter 文件和一条静态注册。载体变化需评审共享读取接口，领域行为变化需显式修改核心规则。 [生产装配](../../src/notes/formats/production.ts)

### 表示变化与领域规则

格式适配抽取时，v2 原型用字段重命名验证表示边界。`read_when` 和 `readWhen` 映射到同一个 canonical `metadata.read_when`，按各自字段名写回。其余共同字段逐值映射，保留缺省和关系数组顺序。原型将声明的 `extensions` 作为不透明来源保留。可选的 `activation: on-proposal` 保留在 canonical 替代边上，v1 无法表达该字段。 [v1 Adapter](../../src/notes/formats/adapters/note-v1.ts) · [v2 原型源码](https://github.com/hackycy/skills/blob/b607b44ba4b382a8a4975a82498bdf0bc70e328c/packages/agent-notes/tests/formats/adapters/note-v2.ts)

原型还验证了提案阶段提前生效的领域规则。活跃 implemented 的替代边生效，活跃 proposed 只有带标记的边提前生效，rejected 和 archived 的出边均不生效。查询、依赖校验、维护和清理共享该判定，基线和目标使用同一规则。例如活跃决定 A 通过 `related` 回链到 proposed 后继 B，C 的 `requires` 指向 A。普通替代下 C 的依赖有效。若在实验规则下 B 提前完整替代 A，C 得到 `INVALID_RELATION`，部分替代时 C 的依赖仍有效。 [关系实现](../../src/notes/relations.ts) · [生产关系契约](../../assets/formats/document.md#3-关系)

### 原格式写回与字节保真

`create` 使用 registry 中的默认格式。更新、状态转换、归档和引用修复按每个被写文件的来源选择 Adapter，编辑草稿须使用目标文件的格式。核心根据 Markdown AST 计算链接修复，并在同一事务中重读、校验生成的 Note。只读格式或无法安全 patch 的目标会中止写入。 [写入规划](../../src/workflow/plan.ts) · [写入执行](../../src/workflow/execute.ts)

| 操作 | 字节保证 |
| --- | --- |
| v1 兼容写回 | 元数据 patch 可重排 YAML，保留原正文字节。全草稿替换沿用原序列化。归档只插入必要字段，保留已有 frontmatter 和正文。若为 v1 引入局部保真，须作为独立的写回变更验收。 |
| v2 原型的局部 patch | 获准改动之外的字节原样保留，包括注释、YAML 排版、不透明扩展和未改正文。空 patch 返回相同字节。若无法定位安全区间或会留下无归属的注释，以 `UNSAFE_FORMAT_PATCH` 终止事务。 |
| 原型的显式迁移 | 格式标识和 frontmatter 排版可变化。canonical 字段、关系数组次序、标题及正文字节均须相同。来源含注释或不透明扩展，或目标无法表达字段时，报 `LOSSY_FORMAT_CONVERSION` 并保留源字节。 |
| 归档读取、`show` 与 hash | 使用来源字节。归档新增的 seal 对应归档文件的实际原字节。 |

归档分别使用 Note 和清单自身的格式。追加后重读清单以核对全部旧条目及新条目。核心验证旧 seal、对应的归档文件以及新归档的原字节和来源。 [归档清单契约](../../assets/formats/document.md#5-归档清单)

### 显式迁移与历史检查

原型用 `migrate` 验证显式迁移。Registry 须存在不同的可读源格式和可读写目标格式，并授予对应的迁出和迁入权限，命令入口才会启用。每次在原路径转换一篇 proposed 或未归档的 implemented Note，输入须提供当前原字节的 `expected_hash` 和非空 `reason`。迁移复用 dry-run、锁、journal 与 recover，在 overlay 重读输出以核对身份、状态与内容。写入事务并发复查原字节 hash。命令只覆盖活跃 Note 的跨格式转换。

历史检查先验证冻结、身份和生命周期。只有活跃 Note 的 ID、路径、状态和内容一致，且从可信基线重放同一转换能得到完全相同的目标字节，才报告 `NOTE_FORMAT_MIGRATION`。同时修改内容或无法重放的变更沿用 `NOTE_CHANGE_REVIEW`。没有可信基线时报告 `NO_HISTORY_BASELINE`。机械迁移提示只说明两端字节可以重放。写命令另与操作前快照比较，保护尚未提交的 rejected 和 archived 文件。

已归档 Note 和旧 seal 即使 canonical 内容等价，也按原路径、原 hash 及完整条目保护。首次归档可复核时，以相同格式的 implemented 来源核对内容。局部保真格式还重放仅插入 archive 字段的 patch，v1 保留原有正文与元数据等值检查。先迁移再归档若缺少可重现基线或精确 source revision，则报告 `ARCHIVE_SOURCE_REVIEW`。rejected 基线要求保留格式、拒绝理由和正文，正文允许现有可验证的同身份引用修复。 [历史检查](../../src/notes/history.ts)

### 格式诊断与兼容范围

生产 CLI、schema 和模板仅提供 v1，迁移入口处于禁用状态。未来正式格式的最低工具版本提示须来自可信发行映射。通用 JSON 结构与退出码见 [CLI 契约](../../assets/references/cli.md#输出与退出码)。

| 场景 | 诊断 |
| --- | --- |
| 未知或不可读的格式标识 | `UNSUPPORTED_FORMAT`，退出 2。字符串标识通过 `details.format` 及 `details.supported_formats` 返回遇到的值和同类可读格式。生产入口遇到实验 v2 时只列出 `agent-note/1`。未知清单和配置格式各列同类格式并停止写入。 |
| 载体出错或格式标识缺失、类型错误 | 载体问题优先。缺失标识沿用默认 v1 校验器的必填诊断，非字符串标识沿用 `UNSUPPORTED_FORMAT`。保留既有 v1 schema、正文和配置诊断。 |
| 写入或核心规则失败 | 只读格式退出 2。关系、历史和事务错误退出 1。缺少必需决定材料沿用退出 3。多项错误聚合时，退出 2 优先于退出 1。 |

兼容性检查见[格式适配验收](validation.md#格式适配验收)。

## 输入校验与交互

[参数层](../../src/cli/arguments.ts)用 cac 集中声明命令、解析语法和生成帮助，用 Zod 校验类型、枚举与跨字段约束。持久文档仍使用 JSON Schema/Ajv；CLI 输入模型不成为文档格式的新权威。

[初始化层](../../src/cli/init.ts)把输入获取与确定性执行分开：先解析显式值和已有配置，只有合格终端才通过 Clack 询问缺项。提示走 stderr，结果走 stdout；脚本、JSON 和内容写命令保持确定性行为。委派使用统一参数模型，不传本地交互开关，也不提前消费写入 stdin。

问答可能长时间等待或被取消，因此取得写锁和恢复事务都在收齐输入之后。缺项的 `install --recover` 先验证 owner、journal 和端点，用 prepared 的 before 或 committed 的 after 构造只读问答视图，避免把中断现场当成有效项目配置；回答后复查现场再恢复。完整显式请求同样先验证输入、来源与意图。

## 事务、快照与信任边界

内容与分发操作共享同一 checkout 的写锁、预期 hash 和 journal。预检、持锁后与完成前复查用于发现并发变化；中断恢复只接受已验证端点，外部编辑冲突保留现场。各 worktree 的锁不提供跨机器互斥，合并仍依靠身份、关系和可信基线校验。

完整资产和归档以原始字节计算 hash；只有规则受管块比较允许 CRLF 归一，保存时保留块外原文。安装投影与恢复如何维持这些约束，见[计划与恢复](integrations.md#计划与恢复)。

工作树、index、commit 检查各自使用同一快照内的配置、正文和引用目标。ref 固定解析为 SHA，快照中的脚本只作数据；调用者负责选择可信基线和实际启动的验证器。

归档 seal 必须与可信基线比较，否则正文和清单被一致改写仍可能自洽。首次归档只有来源字节能从基线或精确 source revision 重现时，独立 check 才能复核全过程；两端快照无法恢复的过程列入 review。退出 0 证明操作完成或机械校验通过，语义结论仍由作者与评审负责。
