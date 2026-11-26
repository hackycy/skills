---
status: accepted
---

# ADR 0001 · 多版本文档格式通过 Adapter 共存

按文件的 `format` 选择 Adapter，将 Note、归档清单和项目配置的持久表示转换为各自的 canonical 模型。读索引、写入计划和历史检查共用这三个模型与各自的来源信息。核心 policy 继续负责身份、生命周期、关系生效、历史保护和写入事务。默认创建 v1。实验 v2 仅在本地测试入口注册，用于验证混合版本读写、归档和显式迁移。

| 考虑过的方案 | 决定依据 |
| --- | --- |
| 替换唯一解析器，读取时统一转成最新格式 | 会使旧文档的可读性和写回安全绑定到新格式。封存历史仍需要旧解码和原始字节，隐式迁移还会扩大每次写入的影响范围。 |
| 按版本复制 reader、relations、history 或 planner | 混合版本的依赖和反链仍然要跨版本解析。复制会让 seal、rejected 保护与基线规则随版本分叉。 |
| 通用版本框架、迁移链和 capability 矩阵 | 目前只有三类文档和两种载体。显式注册和直接映射足以支撑逐文件分派，两端可表示性也更容易独立验证。 |

端口的收益是每个调用者只处理一份领域含义，以及一个能定位原字节的来源。表示等价的新版本只需一个 Adapter 文件和一条 registry 注册。增加可观察的领域行为，或引入旧 sniff 无法读取的外层载体，需要扩大相应接口或修改核心 policy。归档清单和配置共用分派约定，各自暴露实际支持的写操作。当前行为以文档契约和维护约束为准。 [文档契约](../../../assets/formats/document.md) · [设计约束与依据](../design.md)

## 端口与 canonical 模型草案

`Note` 是同一工程决定在三种状态下的持久内容。路径派生的 lifecycle 另行计算，archived 路径中的 Note 仍为 implemented。`Manifest` 按 Note ID 保存归档 seal 和可复核的来源。`Config` 是某个快照内生效的 Notes 根和模板语言。三个模型的 `format` 均位于来源信息中。下方代码展示设计接口。实际类型与函数以 [canonical 模型](../../../src/notes/model.ts)、[Adapter 端口](../../../src/notes/formats/ports.ts)和 [registry](../../../src/notes/formats/registry.ts)为准。

```ts
type Status = 'proposed' | 'implemented' | 'rejected'
type Lifecycle = Status | 'archived'

interface Note {
  metadata: {
    id: string
    status: Status
    scope: Scope
    read_when: string
    rejection_reason?: string
    relations?: {
      related?: readonly string[]
      requires?: readonly string[]
      supersedes?: readonly Supersession[]
    }
    archive?: { date: string, reason: string }
  }
  title: string
  body: string
}

type Scope
  = | { global: true }
    | { paths: readonly string[], topics?: readonly string[] }
    | { paths?: readonly string[], topics: readonly string[] }

interface Supersession {
  id: string
  extent: 'full' | 'partial'
  reason: string
  activation?: 'on-proposal'
}

interface Manifest {
  entries: Readonly<Record<string, {
    path: string
    sha256: string
    source: { path: string, sha256: string, revision?: string }
  }>>
}

interface Config {
  notes_dir: string
  language: 'zh-CN' | 'en'
}

interface ReadonlyBytes {
  readonly byteLength: number
  copy: () => Uint8Array
}

interface SourceResidue {
  readonly hasComments: boolean
  readonly hasOpaque: boolean
  readonly syntax: unknown
}

interface DraftSource { path: string, bytes: ReadonlyBytes }

interface Source {
  format: string
  path: string
  hash: string
  bytes: ReadonlyBytes
  residue: SourceResidue
}

interface Parsed<T> { value: T, source: Source }
type LocatedNote = Note & {
  path: string
  relativePath: string
  identityPath: string
  lifecycle: Lifecycle
}
```

`ReadonlyBytes` 表示由快照持有且无法通过端口修改的 UTF-8 原字节。实现使用受保护的字节副本。hash 对原始字节计算 SHA-256。`SourceResidue` 记录注释和不透明扩展是否存在。Adapter 写回时从来源字节重新取得 YAML 节点范围和正文边界。核心通过格式模块判定是否能安全转换。`readIndex` 为每个 Note 保存 `Parsed<LocatedNote>`，按 ID 建唯一索引。缺失配置或清单可使用现有默认值，同时标记来源为缺失。写入时才有持久来源，缺失值没有 hash 或伪造的 v1 字节。 [现有模型](../../../src/notes/model.ts) · [索引读取](../../../src/notes/reader.ts)

```ts
interface ReadContext { kind: 'note' | 'manifest' | 'config', path: string }
type FormatRead
  = | { kind: 'format', value: string }
    | { kind: 'missing' }
    | { kind: 'invalid', value: unknown }

// 由共享的载体读取器提供，registry 在选择 adapter 前调用。
declare function readFormat(bytes: ReadonlyBytes, context: ReadContext): FormatRead

type NoteContext = ReadContext & {
  kind: 'note'
  assertPlacement: (metadata: Note['metadata']) => void
}

interface NoteChanges {
  metadata?: {
    status?: Status
    scope?: Scope
    read_when?: string
    rejection_reason?: string | null
    relations?: Note['metadata']['relations'] | null
    archive?: Note['metadata']['archive']
  }
  body?: string
}

type RenderRequest
  = | { purpose: 'create', draftSource?: DraftSource }
    | { purpose: 'conversion', origin: Source }

interface NoteFormatAdapter {
  readonly format: string
  readonly capabilities: Readonly<{ patchFidelity: 'local' | 'legacy' }>

  parse: (bytes: ReadonlyBytes, context: NoteContext) => Parsed<Note>
  validate: (metadata: unknown, context: ReadContext) => Note['metadata']
  checkBody: (body: string, status: Status, context: ReadContext) => string
  render: (note: Note, request: RenderRequest) => ReadonlyBytes
  patch: (
    originalBytes: ReadonlyBytes,
    changes: NoteChanges,
    context: NoteContext & { draftSource?: DraftSource },
  ) => ReadonlyBytes
}
```

`parse` 读取已分派的字节，调用 `validate` 做版本 schema、字段形状和映射，然后调用核心注入的 `assertPlacement` 依次检查 scope 路径语法、文档路径和状态一致性，最后调用 `checkBody` 得到标题。这样可以维持 v1 的报错顺序。共享载体可复用 sniff 阶段的语法树，复用只限同一输入字节。`validate` 检查 ID 拼写及同文档结构约束。ID 唯一性、稳定路径、合法转换、同身份引用修复、关系与历史、seal、锁和事务由核心决定。既有 v1 schema 的 rejected 与 archive 条件仍用于兼容其合法集合及诊断，跨文档规则只有一套实现。 [当前 reader](../../../src/notes/reader.ts) · [正文契约](../../../src/notes/markdown.ts) · [v1 schema](../../../assets/formats/agent-note-1.schema.json)

`render` 负责 create 或严格转换。共享格式模块使用转换请求里的 `origin` 检查来源残留，目标 Adapter 检查可表示性，失败返回 `LOSSY_FORMAT_CONVERSION`。`DraftSource` 是经过预检的可选草稿来源，v1 用它重现草稿键顺序及既有全草稿替换字节。`patch` 消费原字节和获准修改的字段，保留原格式及 ID。字段缺省表示保留，只有可删除字段显式传 `null` 才表示删除。正文在显式传入时替换。归档的合法写入只传本次新增的 `archive` 字段。两种方法的结果都由正常 reader 在目标路径重新读取，再通过 overlay 的现有校验和事务预检。

`patchFidelity` 说明写入能否承诺字节级局部修改。`local` 在解出新字节后验证局部保真，无法定位时拒绝。`legacy` 只用于保留 v1 上线前的写回行为，archive 仍走专用的同字节插入。`read`、`write`、`migrate` 是发布支持策略，置于 registry。字段命名、缩进、章节别名和表示中的默认值在 Adapter 内消化。领域行为通过 canonical 数据和核心 policy 表达，Adapter 无权决定它是否生效。

清单端口暴露 `parse / validate / renderEmpty / appendEntry`，配置端口暴露 `parse / validate / renderInitial`。两者的 `parse` 同样返回 canonical 数据和来源。清单每次只增加一项，核心先验证旧 seal 和新归档来源，再验证输出包含全部旧 entry 且值不变。v1 JSON 清单的序列化保留现有行为。未来若支持清单扩展，追加要保留已有扩展或失败。配置只在首装且文件缺失时渲染。发现自定义根时先找到同一快照的配置候选，再分派并核验 `notes_dir` 与实际 layout 一致。工具升级直接保留配置字节。安装收据及事务 journal 是独立内部协议，恢复既有 `transaction/2` 时用专用 DTO 保留其 v1 形状，不能用当前默认配置格式重新解释旧 journal。 [清单 schema](../../../assets/formats/agent-note-archive-1.schema.json) · [布局发现](../../../src/distribution/layout.ts) · [安装事务](../../../src/distribution/transition.ts)

### 信息损失预算

| 操作 | 往返保证 |
| --- | --- |
| `parse → patch → parse`，局部保真 | 除获准改动的字节范围外，前后完全相同。保留未知扩展、注释、键顺序、标量样式和未修改正文。删除带有无法重新归属的注释的节点、跨入未知子树或无法定位安全改动时，以 `UNSAFE_FORMAT_PATCH` 原子失败。空 patch 返回同字节。 |
| v1 兼容写回 | v1 的 schema 继续拒绝未知键。现有 `patchMetadata` 会重新序列化 YAML，正文逐字节保留。`archiveBytes` 只插入 archive 元数据，已有 frontmatter 和正文原样保留。原有全草稿替换继续使用 `serialize`。 |
| `parse → render → parse`，可转换输入 | canonical 字段、关系数组次序、标题和 Markdown 正文字节相同。允许 frontmatter 的键顺序、空白、引号、缩进和格式标识变化。首轮转换拒绝含注释、opaque 扩展或目标无法表达的 canonical 数据。这里的等价以原正文为准，不折叠 Markdown 或 Unicode。 |
| 读取或复制归档、`show` 与 hash | 直接使用来源字节。已归档 Note 的字节与路径是 seal 的一部分。 |

本 ADR 选择分阶段交付。适配器抽取阶段用旧实现的写回字节作差分基准，并保留 v1 的旧诊断；v2 直接满足局部保真契约。全版本强制局部保真是之后独立验收的 v1 写回调整，会改变某些 v1 编辑的输出排版或使无法安全编辑的请求失败。兼容性抽取无法同时承诺这两种 v1 输出。例如当前只改 `read_when`，`status:    implemented # keep` 会收紧空格，`scope: # routing` 的注释会移到下一行。 [现有写回实现](../../../src/workflow/input.ts)

## Registry 与分派

`noteFormatRegistry` 是 Note、清单和配置三张有类型的只读表的组装点。每条注册包含 kind、format、adapter、schema、`read`、`write`、`migrate: { from, to }`、`introducedIn`、`deprecatedIn`、`removedIn`。schema 字段可以指向既有 JSON Schema 或当前 config 的等价校验器。每个 Adapter 模块导出一条完整注册。registry 的条目文件用静态重导出登记，组装模块读取该文件的命名空间构造表，一条重导出同时完成引用和注册。默认 create 指针按文档类别设定，支持列表和写入选择从当前入口的条目派生。初始化时验证键唯一、Adapter 声明一致、已声明的发行窗口单调以及默认项可写。表、条目和 capability 在组装后冻结，查找模块不暴露可修改的 Map。

| 注册项 | 入口 | read | write | migrate | 支持窗口 |
| --- | --- | --- | --- | --- | --- |
| `agent-note/1` | 生产和测试 | 是 | 是，create 默认 | 测试中允许双向转换，通过可表示性检查 | `introducedIn = 0.1.0`，`deprecatedIn`、`removedIn` 为空 |
| `agent-note/2` | 本地测试 | 是 | 原格式写回或显式迁入 | 双向转换，通过可表示性检查 | 三个发行版本字段都为空 |
| `agent-note-archive/1` | 生产和测试 | 是 | 初始化或追加新 seal | 禁止 | `introducedIn = 0.1.0`，其余为空 |
| `agent-notes-config/1` | 生产和测试 | 是 | 仅初始化缺失配置 | 禁止 | `introducedIn = 0.1.0`，其余为空 |

三个 v1 标识均可在首个发布 tag `@hackycy/agent-notes@0.1.0` 的 reader 中查到。生产与测试入口使用同一个 registry 构造函数。生产入口注册三类 v1 格式，测试入口额外注册实验 v2，并使用同一套命令执行、索引和写入逻辑。两个入口都默认创建 v1。生产 CLI、分发 schema 和模板仅包含 v1 支持；测试入口由本地测试直接装配。后续新增正式格式时评审现有合法文件的兼容承诺，持续保留已封存格式的读取能力。

1. 从受限的同一快照读取字节。按已知文件类别走 Markdown frontmatter 或 JSON 共用载体。验证 UTF-8、分隔符、重复键、YAML alias/tag/merge key 等语法约束，只取顶层 `format`，不扫描正文、不跟随标记跳转、不按输入加载代码。复用快照限额，嵌套和资源耗尽需产生确定性的诊断。
2. 按 kind 和 format 查 registry，查不到或当前入口不可读时列出同类别的支持列表。未来要提供最低版本提示，须有可信的发行映射。`format` 缺失或类型非法一般归入载体错误；对既有 v1 畸形输入保留原诊断优先级。v1 缺字段仍可走拒绝专用的旧 schema 诊断，明确标错的非字符串格式保持旧 `UNSUPPORTED_FORMAT` 行为。
3. 调所选 Adapter 的 `parse`，再由核心组装位置与索引、比较同一快照内的关系。worktree、index、commit 及归档精确来源都独立经过分派。一个 Note 的关联目标或反链既可以是 v1，也可以是 v2。无全局 `--format` 状态。

核心 policy 依赖 canonical 模型和格式模块提供的接口。[生产入口](../../../src/notes/formats/production.ts)和[本地测试入口](../../../tests/formats/experimental.ts)各自装配 registry，将格式接口传给共享的 CLI 执行入口、reader 和 planner。通用格式模块创建这些函数时接收只读注册表，核心不回调组装点。`readIndex`、`checkHistory`、`planWrite` 无版本字面量分支。添加同载体的纯表示版本无需修改这些模块。 [当前 reader](../../../src/notes/reader.ts) · [当前写入入口](../../../src/workflow/execute.ts)

## v1、v2 映射与 policy 判定

**V1NoteAdapter** 保留现有 `parseNote` 的验证顺序、Ajv schema、`checkBody`、`serialize`、`patchMetadata` 和插入 archive 字段的行为。抽取时把路径、scope 约束与生命周期检查留在共享路径，保持诊断顺序、代码、消息与公开结果。差分投影将旧 Note 的 `metadata.format`、`text`、`hash` 放入新版来源，旧、新其余字段原值比较，无需重新解析旧结果来生成期望。原有 `show.data.text` 和 `show.data.hash` 继续使用来源字节。 [读取及错误顺序](../../../src/notes/reader.ts) · [旧序列化与 patch](../../../src/workflow/input.ts)

**V2NoteAdapter** 验证两项变化。表示变化把 `read_when` 改名 `readWhen`。语义实验增加 supersedes 边的 `activation: on-proposal`。`extensions` 用于测试不透明数据的保存，schema 限定为可解析的 JSON 值映射，外层仍严格拒绝未声明的键。其内容不参与领域判定。

| 含义 | v1 → canonical | v2 → canonical | canonical → v1 / v2 |
| --- | --- | --- | --- |
| 格式标识 | `agent-note/1` → 来源 | `agent-note/2` → 来源 | 由各自 Adapter 生成 |
| 阅读条件 | `read_when` → `metadata.read_when` | `readWhen` → `metadata.read_when` | 分别输出 `read_when` / `readWhen` |
| 身份、状态、scope、拒绝理由和归档描述 | `id`、`status`、`scope`、`rejection_reason`、`archive` 逐值映射 | 同左 | 字段名和值保持，保留缺省和数组次序 |
| 普通关系和依赖 | `relations.related/requires` → 同名数组 | 同左 | 原值输出 |
| 替代关系 | `{id, extent, reason}` → 同形 canonical 边 | 原三字段照搬，可选 `activation: on-proposal` 显式保留 | v1 仅可写无 `activation` 的边。v2 原值输出。 |
| 正文与标题 | 保留 Markdown，按 H1 提取标题 | 同左 | 原样写正文，标题由读回确认 |
| 扩展 | 未知元数据键报错 | `extensions` → 原样来源片段 | v2 局部 patch 保留；首轮跨格式转换有扩展即拒绝 |

仅重命名字段的 v1/v2 文件读成同一个 canonical 值，保留两个独立的来源。在同一索引内，v2 后继对 v1 旧决定的反链和 `requires` 校验只用 ID、状态和生命周期。补反链时由被写入文件的来源选回其 Adapter。

语义实验的反例是三条记录。A 是活跃 implemented，B 是 proposed 且完整替代 A，C 的 requires 指向 A。现行规则下，B 的边只表达意图，C 的依赖合法。若允许 B 的边在 proposed 时带 `on-proposal` 并即时生效，A 成为被完整替代的目标，C 的 requires 必须失败。把该字段略去会默默放行 C，把 B 映射成 implemented 则会误改正文契约、路径、转换资格与历史规则。

本地测试装配同一个 v2 Adapter，分别运行现行 policy 和实验 policy。Adapter 将该字段保留到 canonical 边，现行 policy 以 `POLICY_FEATURE_UNSUPPORTED` 拒绝含标记的树。实验 policy 用共享谓词让 active implemented 的边始终生效，让 active proposed 的边仅在明确标记时生效，rejected 和 archived 的出边仍不生效。requires、context/show、维护和清理使用同一生效判定，基线和目标使用同一 policy。拒绝或归档时重新验证相关依赖。 [当前关系生效与依赖校验](../../../src/notes/relations.ts) · [关系契约](../../../assets/formats/document.md#3-关系)

## 写入、迁移和兼容矩阵

下表的迁移命令与 v2 写入供本地端到端测试装配。生产入口保持现有 v1 命令集。

| 操作 | 格式选择与保护 |
| --- | --- |
| `create` | 显式取 registry 的可写默认项，将现有无格式草稿映射为 canonical 输入。ID、slug、归属与初始状态仍由核心产生。 |
| `update`、`transition` | 按所写文件的来源选择 Adapter。编辑草稿必须沿用目标文件格式，保留原 ID 和允许的状态输入。v2 从原字节 patch 已确认改动，draft 不得覆盖已有 opaque 源。v1 沿用兼容写回。状态移动和引用修复在同一事务内。 |
| 反链、prune 引用修复 | 每一份被写的 Note 依各自的来源 patch。仅把核心基于 Markdown AST 计算出的正文补丁交给 Adapter。非 Note Markdown 继续走现有引用修复。遇到只读目标或无法局部安全写回时整笔事务失败。 |
| `archive` | 保留源 Note 格式，插入 archive 元数据。核心锁定已封存的字节、路径、源 hash 与 revision，向清单追加 seal。已封存的文件、已有 seal 和 rejected 正文遵循既有保护。 |
| `migrate <id> --to <format> --input <file>` | 文件或 stdin（`--input -`）提供 `{ expected_hash, reason }`，使用现有写命令的 dry-run 和 recover 约定。只接受 proposed 或未封存的 implemented Note。拒绝 rejected、archived 及同格式请求。两端必须支持迁移，目标可写且能表达同一内容。清单与配置没有迁移命令。 |

`migrate` 在原位置重编码一个活跃 Note，保持路径、ID、状态、全部 canonical 字段及正文原字节。预检比较 `expected_hash`，使用同一快照和 overlay 重读目标、核对等价并运行关系、引用、seal 与历史校验。现有锁和 journal 覆盖载入、持锁后与提交前的观测复查，原字节 hash 仍是并发条件。重试发生在状态确定以后，已提交后的旧 hash 会报告冲突。多个写入计划不会共用迁移状态。 [写入与恢复](../../../assets/references/writing.md) · [写入执行](../../../src/workflow/execute.ts)

`checkHistory` 先做现有的冻结、rejected、身份、生命周期检查，再对活跃同 ID 的不同格式快照分类。

- 路径、状态、canonical 字段和正文字节相同，源符合转换的信息损失预算，且确定性的同一转换入口用基线原字节可重放出目标字节时，报告 `NOTE_FORMAT_MIGRATION`。报告表示可复核的机械变化，Git 两端快照无法证明具体调用了哪个命令。
- 内容、路径或状态同时变化，或无法重放时，沿用 `NOTE_CHANGE_REVIEW` 及相关历史诊断。两端格式相同的原字节变化仍沿用既有评审提示。没有可信基线时只能给出 `NO_HISTORY_BASELINE`。
- 已归档的 Note 和旧 seal 始终先做路径、原始 hash 和条目比较，即使 canonical 等价也会抓到重写或重封存。首次归档可重现来源时，比较同一格式、同一份 implemented 来源与归档内容。局部保真的格式还要重放仅插入 archive 字段的 patch 来验证来源残留和原字节。v1 历史基线保留已有正文和元数据等值检查，实际归档写入继续使用字节插入。若在两次快照之间先迁移再归档，只有精确 revision 或可重现基线能作为独立来源，否则保留 `ARCHIVE_SOURCE_REVIEW`。
- 已 rejected 的基线还须核对格式与原正文和拒绝理由，正文唯一例外是现有可验证的同身份链接修复。基线还是 proposed 而目标已 rejected 时，历史只给出原有拒绝评审及必要的内容评审。单笔写入仍以操作前快照额外校验，因此不能借迁移重写当前 rejected 或 archived 文件。 [当前历史检查](../../../src/notes/history.ts)

| 场景 | 预期 |
| --- | --- |
| 已发布旧 runtime 读取 v1 | 保持原语义和诊断。 |
| 已发布旧 runtime 的 `check` 读取 v2 | `UNSUPPORTED_FORMAT`，退出 2，文本列出旧 runtime 支持的 v1。当前二进制只知道遇到的 format 和支持项，无法提供具体最低版本。 |
| 本地测试入口读取 v1、v2 或混合树 | 同一索引容纳两种格式，正常分派和验证。实验字段仍受 policy 审核。 |
| 生产入口读取实验 v2 | `UNSUPPORTED_FORMAT`，退出 2，列出可读的 `agent-note/1`。 |
| 读取未知 archive manifest 或 config 格式 | `UNSUPPORTED_FORMAT`，退出 2，支持列表只包含对应文档类别。写入停止，缺失配置或清单的默认值规则不适用。 |
| 任一入口遇到真正未知的未来格式 | 硬失败并列出同类支持格式。 |
| 本地测试入口显式 v2 → v1 | 仅可在同一 canonical 内容可表达并通过保真预算时成功。有实验字段、注释或 opaque 扩展时拒绝。 |

实验 v2 未分配发行版本。兼容验收以已发布版本的真实拒绝行为和本地测试入口的混合树行为为依据。未来正式启用新格式时，再由可信发行映射提供精确最低版本及项目 runtime 的升级命令。 [项目 runtime 升级](../../installation.md#升级项目版本) · [CLI 分发入口](../../../src/cli/main.ts)

### CLI 错误契约

外层继续输出单个 JSON 对象。诊断使用 `code`、`message`、`path?`、`note_id?`。新格式的 `UNSUPPORTED_FORMAT` 诊断通过 `details.format` 和 `details.supported_formats` 报告遇到的格式及同类别可读格式。以下以仅注册 v1 的入口读取实验 v2 为例。`scope`、`data` 和 `review` 由实际检查决定。

```json
{
  "command": "check",
  "result": "invalid-input",
  "scope": { "root": "/path/to/project", "snapshot": "worktree", "base": null, "head": null },
  "data": { "structural_check": "failed" },
  "diagnostics": [
    {
      "code": "UNSUPPORTED_FORMAT",
      "path": ".agents/notes/implemented/architecture/2026-10-21-event-ownership.md",
      "message": "Supported format: agent-note/1; found agent-note/2.",
      "details": {
        "format": "agent-note/2",
        "supported_formats": ["agent-note/1"]
      }
    }
  ],
  "review": [
    {
      "code": "NO_HISTORY_BASELINE",
      "message": "Current structure only: no historical baseline is available; previous freezes and transitions cannot be verified."
    }
  ]
}
```

| 失败阶段 | 诊断与退出码 |
| --- | --- |
| 未知、已知但当前不可读的 format | `UNSUPPORTED_FORMAT`，退出 2，`invalid-input` |
| 已识别 v2 但 schema、局部字段或正文非法 | `INVALID_NOTE_V2`，退出 1，`failed`，可附 phase 和字段位置。未来清单或配置版本采用 `INVALID_MANIFEST_V<n>` / `INVALID_CONFIG_V<n>`。 |
| v1 内非法或载体非法 | v1 原有 `INVALID_METADATA`、`INVALID_BODY`、`INVALID_MANIFEST`、`INVALID_CONFIG` 等保留原代码、消息、顺序与退出码；配置形状错误保留退出 2。无法稳定识别版本时优先返回编码、载体或兼容诊断。 |
| policy 或事务违例 | 保持 `INVALID_RELATION`、`INVALID_LIFECYCLE`、`INVALID_TRANSITION`、`FROZEN_NOTE_CHANGED`、`REJECTED_NOTE_CHANGED`、`CONCURRENT_CHANGE` 等，退出 1。新 policy 的未启用字段也退出 1。 |
| 迁移请求失败 | 无效参数或不可选目标退出 2，内容无法无损转换或局部 patch 无法安全写回退出 1，缺少必需决定材料沿用退出 3。 |
| 机械检查通过或存在一般 review | 退出 0。 |

对命令聚合适用退出码 2 优先于结构错误 1 的现有规则。读写路径都保留首个格式问题的原始诊断。当前旧 runtime 对完全未载入的 ID 执行 `show` 会在格式错误后附带 `NOTE_NOT_FOUND`。 [CLI 结果契约](../../../assets/references/cli.md#输出与退出码) · [CLI 结果实现](../../../src/cli/run.ts)

## 测试与证据计划

抽取前基准锁定到提交 `10f4fce058b45bdf069bb148c3019e6de2a352cc`，发布负向基准为 `@hackycy/agent-notes@0.6.0`，对应提交 `e5b53eaf8c216fa572b82d6e094c006f9de58796`。实现阶段从隔离 checkout 以冻结 lockfile 构建前者。比较使用仓库外项目目录和实际 CLI。现有冻结元数据样例、reader 正反例和已知契约作为种子。 [冻结样例](../../../tests/contract-examples.json) · [实际包验收](../validation.md#实际包验收)

草案阶段已在 Node `24.16.0` 下检查发布的 `0.6.0` tarball，SHA-512 integrity 为 `sha512-ZWsabExQPTTgSQFkVMLVsPrJ3RBKAcm413Duc7OWHjaBf7IEzzd3HMz4s4Pg7z0uRVfKPLpaj4sq/Tlp9AQ+Qw==`。仓库外用 `check --json` 读单份 v1 样例退出 0，读 v2 样例或 v1/v2 混合树退出 2，返回 `UNSUPPORTED_FORMAT` 和文档路径，提示只列出现有支持格式。此探针固定旧 CLI 行为，完整差分仍是实现验收项。

| 证据 | 执行与失败条件 |
| --- | --- |
| 每版本冻结语料 | 保存 v1、v2 的原始文件字节、canonical 与来源快照及 CLI 诊断，含合法、缺失、非法、含注释、opaque、双语和混合树。清单和配置各保留 v1 原字节和缺失/非法用例。v2 预期结果由文档映射与手写黄金样例独立确定。 |
| v1 差分与旧包负向 | 同份原字节经固定提交的旧 parser 和新 reader，比较完整 canonical 投影及诊断代码、消息、路径、顺序。运行 `show/check/context` 及现有写命令，比较 CLI JSON、退出码和写回字节。旧发布包与本地构建的 v1 生产入口均读取 v2 fixture 验证拒绝行为。写入差分固定时钟和身份分配，或经两端既有 dry-run 入口使用固定预览 ID。 |
| 属性测试 | 固定并输出随机 seed，生成有块/流式 YAML、注释、引用、双语标题及嵌套扩展的合法字节。通过公共分派读取、patch 后重读，断言未改范围同字节、空 patch 恒等、变动只涉及指定数据。v1 legacy profile 以旧 writer 和正文保真为 oracle。对可转换子集验证同版本和双向跨版本 `parse → render → parse` 的 canonical 等价，独立断言有损输入失败且原字节保持。 |
| Mutation | 在隔离 checkout 各删除 v1 或 v2 注册，把已知版本走未知分支，或误选另一版本的 Adapter。每个 mutant 必须使对应冻结语料、混合树或写回测试失败。额外变异 bypass `expected_hash`、放松冻结及忽略激活字段，要求独立保护用例失败。只接受预期断言失败或预期编译阻断，测试启动错误不记作杀死 mutant。 |
| 架构约束 | 扫描 TypeScript 依赖图，沿 import、重导出和运行时装载检查 `readIndex/checkHistory/planWrite` 所用核心模块不可达版本实现或 schema，且生产入口不可达实验 v2。删掉所有版本 Adapter 但保留 registry 引用，包含核心的生产 CLI 类型检查和构建必须失败。独立 policy 模块用端口假实现测试。 |
| 假 v3 走查 | 在临时 checkout 加一个同载体的假 `agent-note/3` Adapter 文件，内含测试 schema，仅做可逆的阅读条件字段移动。向测试 registry 的条目文件添加一行 `export { v3NoteRegistration } from './adapters/note-v3'`。验收脚本在临时项目生成独立 v3 fixture，经本地测试入口运行共享 reader/CLI 读取 v1/v2/v3 混合树，并复跑 v1/v2 和 policy 测试。断言 Git 改动只含该文件与该行。 |

每条核心不变量有独立输入和观察点，共用测试对 v1/v2 及混合版本跑同一套断言。

| 不变量 | 独立来源和测试观察点 |
| --- | --- |
| ID、稳定路径与生命周期 | 文档契约和固定旧 runtime。用 Git 基线分别伪造 ID 冲突、改日期、跨目录错配，断言 reader/CLI 和 overlay 拒绝。 |
| 关系有效性与实验边 | 另写 A/B/C 的期望真值表，用混合版本 fixtures 直接核验 requires、循环、反链和 full/partial。查询与写入验证都必须得到同一生效结果。 |
| 归档 seal、原始来源与已冻结历史 | Git 固定 commit 和 Git blob 的原始 hash，独立计算预期清单项。正向测试首次归档按原格式加入 seal；负向测试伪造 revision、改文再重封、跨格式换壳和移动。清单与正文都被篡改时仍须被基线识别。 |
| rejected 正文和理由 | 提交或写前快照保存原字节。正向验证同身份链接移动，负向分别验证正文、理由和格式被改写及 migrate 被拒。 |
| 机械迁移与内容变化 | 手写同 canonical 的 v1/v2 两端、仅改正文、改路由字段、合并状态变化和无基线样例。断言审查项与保护诊断，独立比对路径、正文和 hash。 |
| `expected_hash`、事务与恢复 | 真实进程争锁、预检后外部编辑、崩溃注入和 journal 端点测试。观察落盘前后字节与冲突诊断，断言任何失败无半应用迁移，且外部编辑被保留。 |
| 配置、清单的快照一致性 | 用不同根、不同 ref、暂存配置和真实包升级/恢复场景，比较同一快照内读到的配置与 Note，校验配置原字节和旧 seal 在升级前后相同。 |

实现顺序为冻结基准、v1 兼容抽取、本地 v2 混合树、显式迁移与历史分类、假 v3 和 mutation 验收。v2 的完成条件是本地测试通过。落实时按维护验证运行 lint、TypeScript 检查和包级 Vitest，涉及生产分发时在本地 build/pack 并核对实验资源未进入包。本地结果与复现入口见下节。 [reader 测试](../../../tests/reader.test.ts) · [CLI 测试](../../../tests/commands.test.ts) · [写入测试](../../../tests/workflow.test.ts) · [事务测试](../../../tests/transaction.test.ts) · [维护验证](../validation.md)

## 实现验收

固定旧提交使用冻结 lockfile 构建。差分在仓库外的 Git 项目中比较 15 组原始 Note 字节和 64 次 CLI 调用，覆盖 canonical 投影、诊断与退出码，以及各写命令 dry-run 输出的完整前后字节。已发布的 0.6.0 和当前生产包均在纯 v2 树及混合树返回退出码 2。当前包还报告 `details.supported_formats`。 [差分脚本](../../../tests/formats/compatibility.ts)

格式测试覆盖混合版本的 worktree、index 和 commit，归档来源重放、rejected 保护、激活 policy、局部字节保真，以及迁移在 prepared 和 committed 阶段被 SIGKILL 后的恢复。往返属性测试使用固定种子 `0x2C49E10C`，生成 64 组流式或块式 YAML、双语正文、引用和嵌套扩展。 [格式回归](../../../tests/formats/format-adapters.test.ts) · [往返属性测试](../../../tests/formats/roundtrip.test.ts)

隔离检出中的 7 个 mutation 都触发预期断言。移除三种 v1 Adapter 后，TypeScript 和生产构建均因导入缺失失败。假 v3 走查新增一个 Adapter 文件和一行测试注册，实际 CLI 读取了 v1/v2/v3 混合树，并通过 74 个 v1/v2、policy 和架构回归用例。 [扩展验收脚本](../../../tests/formats/extension-proof.sh) · [依赖图检查](../../../tests/formats/architecture.test.ts)

macOS arm64 上，`pnpm lint`、`pnpm exec tsc --noEmit`、`git diff --check`、文档链接检查和 317 个仓库测试通过。Node 22.12.0 与 24.16.0 均通过实际 tarball 的 bundle 和离线 npm 安装验收。每个 Node 版本覆盖 7 个接入集合、49 次宿主组合切换、14 次 A/B 版本切换和 7 次修复。容量审计通过，生产 tarball 只含 v1 schema 和资源。A/B 中的 0.6.1 仅用于本地验收，并包含一项实际资源增量。

| 本地产物 | SHA-256 |
| --- | --- |
| 候选 0.6.0 tarball | `38fb17776a66606f3da617e83fe66e0e07c33f223c0974578234e23a62a3de5c` |
| A/B 测试 0.6.1 tarball | `93aebd9da12c8211eb7509e8782de76d62ac602b968dbcadfaf114ee9be79fc8` |

固定旧提交生成的 prepared 和 committed `transaction/2` journal 由候选恢复模块独立验证并恢复。首次安装在写入 config 后中断时，旧包与候选包的 `install --recover` 预检均会返回 `INVALID_INSTALLATION`。本地迁移的 `--recover` 验收覆盖了两个 journal 阶段。

### 复现命令

差分脚本依次接收固定旧提交构建的 CLI、当前构建或 tarball 中的 CLI，以及已发布 0.6.0 的 CLI。第一份 CLI 需要保留同一隔离检出的 TypeScript 源码与依赖，以便同时比较旧 reader。扩展脚本自行创建隔离检出。

```sh
pnpm exec tsx packages/agent-notes/tests/formats/compatibility.ts /absolute/baseline/dist/cli.mjs /absolute/candidate/dist/cli.mjs /absolute/published/dist/cli.mjs
bash packages/agent-notes/tests/formats/extension-proof.sh
```
