# Agent Notes 上游流程对齐评审

> 状态：部分已决策；D5 选 C（2026-11-17），D1 选 A、D4 选 B（2026-11-18），D7 选 A（2026-11-19），其余待定
>
> 评审日期：2026-11-16
>
> 本包基线：`c321a05`，`@hackycy/agent-notes` 0.4.0
>
> 上游基线：DeepSeek Harness `687f282e8625c6b8d11ff58211a90524be2e4317`，来源身份见[版本锁](upstreams.lock.json)
>
> 性质：维护者评审材料，不是产品契约。决策后，采纳项并入[设计约束](design.md)、[上游依据](upstreams.md)或对应 skill/契约，本文删除或转为决策记录。

## 结论

当前 CLI 与 DeepSeek Harness Notes 的主干生命周期同构：记录门槛、`proposed`/`implemented`/`rejected` 的起点与转换、同 PR 交付、implemented 随代码维护事实、只归档 implemented 并永久冻结、rejected 仅在仍有防错价值时保留，这些判断标准一致。

基线差异集中在 8 个点。D1 和 D4 已在 skill 层对齐上游：新建前定向审计，不再单独确认记录。D5 已选择 C 并落地为 `context` 默认排除与受管 `.rgignore` 双层规则。D7 已选择 A，由接入项目按 README 示例配置 CI。D2–D3、D6 和 D8 仍待定。

## 当前 CLI 的流程骨架

```text
context --paths/--topic → show → check
        ↓
local/ 草稿 → create(proposed|implemented)
        ↓                         ↘
     update(同一决定)          transition → implemented → archive
                                   ↘ rejected → prune(有条件)
```

- 读取：`context` 按 scope paths、精确 topic、global、requires 闭包返回指针；`show` 返回正文和原文 hash；`check` 校验结构、关系、链接和历史，`--maintenance` 给出维护候选。
- 写入：草稿放 `local/`，`create` 生成稳定 ID（`an-UUID`）和 `lifecycle/class/日期-slug` 路径；`update` 用 `expected_hash` 防止覆盖；`transition` 保持身份并修复活跃引用；`archive` 需要可信 Git 基线并写 seal；`prune` 需要 owner、coverage 和逐项入链处理。
- 保证：dry-run、写锁、journal、`--recover`；归档和清理要求可信基线；不维护持久索引，每次从文件在内存重建。
- 分工：`agent-note` 与 `agent-note-maintenance` 编排动作，CLI 只做机械校验和事务，长期价值和语义身份留给作者与评审。

## 已一致的部分

| 流程节点 | 一致之处 |
| --- | --- |
| 何时写 | 只记录代码、测试和现有文档不能承载的长期理由；机械性和局部 UI 改动可零 Note |
| 起点状态 | 提案走 `proposed`，已实施走 `implemented`；没有 `accepted` 状态；进入 Plan 不授予写权限 |
| 同一决定与新决定 | 同一决定更新原 Note；不同决定新建并互链；partial/full 只表达实际替代范围 |
| implemented 维护 | 事实随代码更新，不把原决定改写成另一个决定 |
| 交付 | 必要 Note 与相关代码在同一 PR |
| rejected | 保留原提案和真实拒绝理由；只有仍能防止诱人错误时才保留 |
| 归档 | 只归档 implemented；封存后永久冻结；修复活跃入链，不校验冻结出链；不按年龄、字数或配额 |
| 语义边界 | 脚本只证明机械校验通过，价值判断由作者与评审核实 |
| 文档分层 | 一个事实只有一个归属，决策理由与使用参考分开 |

## 决策点

以下编号可直接用于回复，例如“D1 选 A，D5 选 C”。

### D1. 新建 Note 时是否绑定替代审计

- 评审基线：`agent-note` skill 第 3 步只要求“不同决定新建并关联旧 Note”；`check --maintenance` 能列出失配 scope 和替代候选，但 skill 没有要求创建时执行。
- 上游做法：归档 skill 要求每个新 Note 触发同决定、同机制或同替代方案的 active Notes 审计，并在同一 PR 归档完整替代、保留并互链部分替代、拒绝过时提案、删除失去防错价值的 rejected；归档政策 note 明确“不把已知匹配推迟到之后的语料清理”。
- 影响：新决定可能留下冗余的 active authority；`supersedes` 关系可能只表达意图，没有同步处理旧记录；后续审计成本更高。
- 选项：
  - A. 对齐上游：`agent-note` 新建分支在起草前做定向审计，在同一 PR 分类处理。
  - B. 折中：skill 要求检查候选并说明处理结果，但清理可以延后到维护任务。
  - C. 保持现状：只靠作者判断和按需执行维护命令。
- 决策：A（2026-11-18）。起草前按[维护 skill](../../assets/skills/agent-note-maintenance/SKILL.md)审计，同一 PR 处理确认的匹配，不扩展清理条件。

### D2. 机械性 implemented 记录能否直接删除

- 本包现状：`prune` 的 implemented 必须有现行 owner、owner 的 `expected_hash` 和 coverage，否则只能 `archive`。没有“小 UI 或纯机械 implemented 直接删除”的路径。
- 上游做法：直接删除只描述小 UI 调整或纯机械变更的完整 triplet（英文、中文、sidecar），修复或移除入链；明确不要把符合直接删除条件的记录归档。
- 影响：低价值 implemented 记录会进入归档，增加冻结历史噪声；采用本包前已经存在的这类记录无法按上游策略清理。
- 选项：
  - A. 增加无 owner 的机械性删除路径（例如 `prune --mechanical`），要求 reason、入链处理和可信基线。
  - B. 保持现状，并在文档中说明低价值 implemented 由 archive 承载，把差异写成产品选择。
  - C. 只调整维护 skill 的优先级，不扩展 CLI。
- 建议：若目标是保留完整历史，B；若要与上游清理语义一致，A（需要 CLI 变更和测试）。
- 决策：待定。

### D3. implemented 是否必须包含验证章节

- 本包现状：`implemented` 必填“问题、决策、考虑过的替代方案、后果、验证”五节，验证必须写实际结果与可定位证据。
- 上游做法：固定章节为 Problem、Decision、Alternatives considered、Consequences；Testing 或 Verification 可以在正文中说明，但不是格式门禁的必需章节。
- 影响：本包交付材料更重，验证证据更可追溯；与上游格式不完全等价。
- 选项：
  - A. 保持必填。
  - B. 改为可选，完全对齐上游章节门禁。
  - C. 按改动类型区分：影响行为、兼容性或持久化的 implemented 必填，纯文档或流程记录可选。
- 建议：A，除非明确要与上游格式完全对齐。
- 决策：待定。

### D4. 记录前是否需要用户授权

- 评审基线：需要用户接受记录建议或显式要求。
- 上游做法：作者按记录判据直接添加或更新，没有显式授权步骤。
- 影响：本包多一次交互；但避免在用户不知情时写入项目文档。这是产品安全选择，不是流程缺陷。
- 选项：
  - A. 保持现状。
  - B. 对齐上游：Agent 按判据自主记录，事后评审。
  - C. 分级：`proposed` 需要授权，implemented 的事实维护和交付转换可在已有工作授权内自主进行。
- 决策：B（2026-11-18）。在任务允许的范围内按判据直接记录，保留 Plan、只读和明确禁止记录的写入边界。见[设计约束](design.md#规划与记录分别判断)。

### D5. 归档是否从仓库搜索中默认排除

- 评审基线：`context` 默认排除 archived，`--include-archived` 显式包含；安装器只托管 `.gitignore` 和 `.gitattributes`，不托管 `.rgignore`。
- 上游做法：用 `.rgignore` 将 archive 排除在遍历父目录的搜索之外；历史查询需要显式指向归档目录。
- 影响：Agent 使用普通 grep/ripgrep 时可能读到冻结事实，误当成现行指导；本包文档又说“全文搜索沿用仓库搜索”，两者存在落差。
- 选项：
  - A. 托管 `.rgignore` 块，把归档排除在默认搜索外；需要扩展受管文件、安装、修复和验证。
  - B. 不托管搜索配置，在文档和 skill 中明确只有 `context` 保证排除，要求 Agent 用 `context` 查询。
  - C. 两者都做：`context` 保证 + `.rgignore` 兜底。
- 建议：C；至少 B。A 涉及安装协议扩展，需要单独评估。
- 决策：C（2026-11-17）。保持 `context` 默认活跃查询，安装根级 `.rgignore` 排除父目录搜索中的归档，并保留显式历史查询。合法 install/2 安装支持原地升级，利用索引中的新模板区分新旧投影，协议格式保持不变。工具边界见[发现契约](../../assets/references/cli.md#归档与全文搜索)，所有权和恢复见[安装投影](integrations.md#完整安装收据)。

### D6. rejected 是否允许维护路由元数据

- 本包现状：rejected 的 `update` 只接受 `scope`、`read_when`、`relations` 和由 CLI 计算的引用修复，正文与拒绝理由保留。
- 上游做法：rejected 是冻结的提案，裁决在 `Status:` 行；没有路由元数据维护条款。
- 影响：本包可以让旧拒绝记录继续被正确查询到；严格来说不是“完全冻结”。
- 选项：
  - A. 保持现状，并在契约中说明这是发现质量增强。
  - B. 收紧为只允许引用修复，与上游冻结语义一致。
  - C. 保持但要求每次路由维护记录 reason，并由 `check` 保护裁决内容（现状已要求 reason）。
- 建议：A；它不改变裁决内容，只改善可发现性。
- 决策：待定。

### D7. 校验强制点是否进入 hook 或 CI

- 本包现状：产品范围不含 hook 和 CI，`check` 由项目自行接入；文档明确这些配置由项目及宿主管理。
- 上游做法：lefthook 与 CI 调用 verifier，PR CI 提供可信 base SHA。
- 影响：治理政策相同，但强制力不同；没有接入 CI 的项目可能跳过检查。
- 选项：
  - A. 保持产品边界，在文档中给出可选的 CI 调用示例，不自动安装。
  - B. 提供专用 CI 命令或配置生成器。
  - C. 自动安装 hook/CI，与当前产品边界冲突。
- 决策：A（2026-11-19）。接入项目可通过 GitHub Actions 将 `check` 设为合并必需检查，见 [README 示例](../../README.md#在-ci-中校验-pull-request)。

### D8. 是否对齐上游的格式与双语布局

- 本包现状：稳定 ID、YAML frontmatter、JSON Schema、单语言模板。
- 上游做法：路径即身份、`Status:` 行、英文/中文/sidecar 三件套。
- 影响：本包的移动、转换和引用修复更强；上游的双语一致性更强。两者服务的目标不同。
- 选项：
  - A. 保持现状，维持[上游依据](upstreams.md)中“不采纳多文件翻译布局”的声明。
  - B. 对齐上游的路径身份和双语三件套。
  - C. 保持单语言，但在文档契约中明确未来跨语言扩展点。
- 建议：A；除非明确要把双语治理作为产品能力。
- 决策：待定。

## 非决策项：已有意扩展

以下差异已经写入设计或契约，不需要重新决策，列出以便区分“扩展”和“缺口”：

- 用 `context` 的 scope 查询替代上游的目录树和全文搜索；发现能力更强，但依赖 scope 维护准确。
- 用 `related`/`requires`/`supersedes` 结构关系替代纯正文链接；增加图环校验、requires 闭包和反向关系维护。
- 内容写入、安装和修复共用写锁、journal 与恢复协议；上游主要依赖 Git 和 CI。
- rejected 基线保护、归档来源校验和条件清理的 owner/coverage 证据；上游有对应的冻结与合并规则，但检查粒度不同。
- 单语言模板、稳定 ID 和 frontmatter 属于本包身份设计，不随上游格式变化。

## 决策清单

| ID | 决策点 | 建议 | 落地成本 | 决策 |
| --- | --- | --- | --- | --- |
| D1 | 新建 Note 时绑定替代审计 | A | skill + 设计文档，低 | A，已落地 |
| D2 | 机械性 implemented 直接删除 | A 或 B | CLI + 契约 + 测试，高 | 待定 |
| D3 | implemented 必填验证章节 | A | 文档契约，低 | 待定 |
| D4 | 记录前用户授权 | B | skill + 设计文档，低 | B，已落地 |
| D5 | 归档从仓库搜索默认排除 | C 或 B | 安装器 + 测试，中高；仅文档则低 | C，已落地 |
| D6 | rejected 路由元数据维护 | A | 文档契约，低 | 待定 |
| D7 | hook/CI 强制点 | A | 文档，低 | A，已落地 |
| D8 | 格式与双语布局 | A | 无需改动 | 待定 |

## 依据与阅读范围

本包材料：

- [设计约束与依据](design.md)：记录判据、生命周期、职责分工和产品边界。
- [CLI 契约](../../assets/references/cli.md)：命令、查询、检查快照和输出。
- [写入与生命周期](../../assets/references/writing.md)：新建、更新、转换、归档、清理和恢复。
- [文档契约](../../assets/formats/document.md)：身份、frontmatter、关系、正文和归档清单。
- [agent-note skill](../../assets/skills/agent-note/SKILL.md)与[agent-note-maintenance skill](../../assets/skills/agent-note-maintenance/SKILL.md)。
- 实现证据：`src/cli/arguments.ts`（命令面）、`src/distribution/projection.ts`（受管 Git 与搜索规则）、`src/distribution/git-rules.ts`（Git 语义验证）、`tests/search.test.ts`（真实 ripgrep）。

上游材料均固定到版本锁中的提交：

- `.agents/notes/README.md`：布局、分类、记录判据、正文骨架和生命周期移动。
- `.agents/notes/implemented/AGENTS.md`：implemented 事实维护边界。
- `.agents/notes/archived/AGENTS.md`：冻结与 seal 例外。
- `.agents/skills/dsh-archive-agent-notes/SKILL.md`：替代审计、分类、归档和验证流程。
- `.agents/notes/implemented/process/2026-07-26-frozen-agent-note-archive.md`：归档政策及其拒绝的替代方案。
- `docs/AGENTS.md`：文档层次与一个事实一个归属。
- `scripts/archived-agent-notes.ts`：三元组、seal 和 append-only manifest 校验。

上游学习副本不在本机时，按版本锁的 commit 从 GitHub 重新取得。本次评审读取的是固定提交，不是上游 HEAD；上游后续变化需要按[更新上游研究](upstreams.md#更新上游研究)重新核对。

## 后续动作

1. 按决策清单逐项确定 A/B/C，并在本文记录日期和结论。
2. 采纳项按[内容归属](design.md#文档内容与分发)写入唯一维护位置：治理原则进 `design.md`，上游事实与采纳范围进 `upstreams.md`，命令行为进 `cli.md`/`writing.md`，格式规则进 `document.md`，动作编排进两份 skill。
3. D2 若调整 CLI 行为，决策后按[维护验证](validation.md)补充测试和实际产物验证。D5 已完成 C 的实现，保留现有协议，并补充搜索、原地升级与恢复验收。
4. 决策完成并落地后，删除本文或将其转为简短的决策记录，避免与 `design.md`、`upstreams.md` 形成第二个事实归属。
