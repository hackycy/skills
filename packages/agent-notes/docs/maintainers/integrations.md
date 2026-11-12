# 安装投影与恢复

本文解释 `src/distribution/` 如何将同一套运行资源安装到不同项目 skill 目录，并验证所有权、版本切换和中断恢复。修改这些实现时配合[维护验证](validation.md)使用；面向使用者的操作步骤见[安装指南](../installation.md)。

## 选择与取舍

宿主差异限定为项目 skill 布局，Notes 语义、统一 Result 和项目锁定 runtime 保持一致。接入描述、投影和完整校验共同提供安装事实，CLI、Git、清单和恢复复用它们。

| 考虑过的方案 | 取舍 |
| --- | --- |
| CLI、布局、清单和恢复各自硬编码宿主 | 同类新增需要同步多处，容易造成收据与恢复授权漂移 |
| 任意 skills-dir、入口参数或项目回调 | 将宿主知识转嫁给项目，安全路径也无法证明工具所有权 |
| 宿主能力、scope、hooks、插件、版本的通用矩阵 | 超出静态项目 skill 布局，增加尚无产品需求和证据支撑的状态与权限 |
| 旧协议 reader、别名和迁移桥接 | 增加管理协议兼容负担；当前选择拒绝未知格式，同时保留合法 Note 文档兼容和事务恢复 |

同类新目录复用投影算法；新增 frontmatter、安装结构或执行语义需要显式修改算法和产品范围。集中变化点的代价，是源索引、精确所有权和双端恢复必须一起验证。具体产品范围见[设计约束](design.md#skillcli-与评审的职责)。

## 唯一事实来源

分发按“源资源 → 物化 → 投影 → 计划与执行 → 恢复校验”协作：

| 模块 | 负责的事实或工作 |
| --- | --- |
| [integrations.ts](../../src/distribution/integrations.ts) | 唯一可编辑接入描述表：id、label、default、字面 skillRoot |
| [layout.ts](../../src/distribution/layout.ts) | 单一 Notes 根及配置、runtime、local、锁的路径 |
| [bundle.ts](../../src/distribution/bundle.ts)、[source.ts](../../src/distribution/source.ts) | 精确源读取、索引验证和按 Notes 根物化 |
| [projection.ts](../../src/distribution/projection.ts) | 纯计算资产、链接映射、共享去重、碰撞、收据、Git 块及目录候选 |
| [manage.ts](../../src/distribution/manage.ts)、[transition.ts](../../src/distribution/transition.ts) | 现场快照、管理计划、真实 Git 检查、smoke、备份与 Result |
| [recovery.ts](../../src/workflow/recovery.ts) | 为通用事务组合固定 journal kind 与可信校验器 |

构建从描述表生成索引视图，不增加第二编辑源。generic/codex 共享 `.agents/skills`，claude-code 使用 `.claude/skills`；两份 skill 的内容仅在 `assets/skills/` 维护。

`project`、`validate` 不读盘、不运行 Git；通用 transaction 不持有宿主目录授权。目录布局和完整收据必须由可信源重新投影，不能从现场文件或路径前缀推断。

同类目录接入增加描述、证据和契约夹具。skillRoot 仅允许安全的 `.<namespace>/skills`；不开放任意目录参数。路径采用 NFC、规范项目相对形式，并排除保留设备名、Git 元数据和 node_modules；投影另拒绝大小写与父子文件碰撞。精确规则由 [protocol.ts](../../src/distribution/protocol.ts)定义。

## source/1 与 install/2

内部格式的编码与校验分别由 [bundle.ts](../../src/distribution/bundle.ts)、[manifest.ts](../../src/distribution/manifest.ts)及 [protocol.ts](../../src/distribution/protocol.ts)实现。

### 精确源与物化身份

npm 的 `dist/source-index.json` 和 runtime 的 `source-index.json` 使用 `agent-notes-source/1`：

- 固定字段顺序为 format/version/notes_dir/integrations/files；接入项为 id/label/default/skillRoot，源项为 path/sha256，数组按 UTF-8 字节序排列。
- JSON 使用两空格、UTF-8 无 BOM、LF 和单个末尾换行。重复键、未知字段和非规范编码均拒绝。
- 源项只列 `cli.mjs` 与 assets 的精确路径，不列索引自身；npm 来源把 CLI 映射到 dist，不扫描邻接文件定义身份。
- notes_dir 为 null 时按实际 Notes 根物化文本资源一次；已物化源仅服务同根。CLI 字节不替换。
- 物化索引的 SHA-256 定义 bundle；索引本身作为隐含 runtime 资产进入安装收据。

### 完整安装收据

`agent-notes-install/2` 包含 format/version/bundle_sha256/integrations/assets，资产项为 path/kind/sha256。完整资产集合必须等于相应端可信源的重新投影，不包含清单自身、项目配置或 Notes。

共享文件从目标集合计算，不保存引用计数。切换时旧端使用旧索引，新端使用选定包；恢复不执行旧脚本取得授权。旧 install/1、旧 journal、旧 target 和命令别名没有 reader 或迁移支持。

信任前提是用户选择的完整 npm 包和项目认可的 runtime。hash 验证相对完整性，不认证发布者，也无法识别整套内容被一致替换的攻击。

## 计划与恢复

### 生成并复查计划

1. 验证来源、配置、安装收据和目标集合；普通管理拒绝受管损坏，`repair` 只接受同版本、同 bundle。
2. 从双端投影生成精确文件变化及目录候选。移除只删除已证明受管的文件，未知内容保留。
3. 在隔离 scratch 中运行真实 Git，检查工具可见性、local 忽略、LF 和未知邻接边界；外部 Git 配置与规则也进入复查。
4. 预检完整恢复资料、容量和必要备份，持锁后复查现场；必要备份成功落盘并复查后才覆盖。

Git 受管块由投影确定，块外原文保留。未知邻接文件的忽略/可见状态须双向保持，本次合法移除的受管文件不算未知邻接。冲突直接报告，不生成环境专用块。

目录删除只允许空的专属 skill 根及其内部父目录；回滚另可处理本事务创建的 runtime 内部目录。共享公共容器、Notes 根和未知目录不进入删除授权。

### 重建事务端点

分发使用 `transaction/2`，保存 operation、配置、双端收据与索引、精确文件端点、必要创建/清理目录及缺失干净源的补充证据。源重建依次采用对应端点、现场未变资源、经 hash 验证的必要补充字节；prepared 前必须完整重建两端。

恢复重新计算合法计划，拒绝额外端点、项目内容改写、无效目录、证据缺失和第三种现场字节：

| journal 状态 | 恢复行为 |
| --- | --- |
| prepared | 验证双端后仅回到 before |
| committed | 验证 after 后收尾，不重新执行转换 |

恢复期间持续复查源与端点。完成前沿用开始时的未变源观察值，并再次检查全部目标端点，不能重新读取现场来接受期间发生的外部修改。用户处理方法见[事务和恢复](../../assets/references/writing.md#事务和恢复)。

## 容量预算

限额由 [protocol.ts](../../src/distribution/protocol.ts)统一定义。下表说明计量对象；MiB = 1,048,576 B，KiB = 1024 B。

| 对象 | 上限 | 计量边界 |
| --- | ---: | --- |
| source/1 规范 JSON | 1 MiB / 端 | 原始编码在解析、规范重编码之前检查 |
| 接入描述 | 64 项 / 端 | 唯一 ID，恰好一个默认项 |
| 精确源 | 256 项、单项 8 MiB、合计 16 MiB / 端 | 包括 CLI 与 assets，索引自身不列入源项；物化后仍须符合限制 |
| install/2 | 2 MiB、1024 资产 / 端 | 完整收据等于投影；runtime 源索引计入资产 |
| 完整项目相对路径 | 1024 UTF-8 B | 源、输出、控制、journal、目录及备份衍生路径；不是字符数或 OS 可用保证 |
| journal 文件变更 / 目录动作 | 各 4096 项 | before/after 合为一个变更项；创建与清理动作合计，不接受重复或不必要动作 |
| 单 before/after 文件端点 | 16 MiB | Git 规则整文件及手改原文按实际字节计 |
| journal 逻辑载荷 | 64 MiB / 事务 | before/after、双端索引、状态/控制及补充源合计；共享引用展开后仍累计 |
| journal 原始编码 | 96 MiB / 事务 | 与逻辑限额同时成立；base64 或物理复用不豁免逻辑计量 |
| repair 必要备份 | 64 MiB / 操作 | 完整原文、完整预期替换与差异摘要合计；不是历史备份总配额 |
| 单项差异摘要 | 64 KiB | 路径、两端长度/hash、变化说明与完整副本位置，不要求完整 unified diff |

读取与解码前检查单项预算，逐项处理时累计总量；文件增长和类型变化还需实际 I/O 与快照复查。各限制独立且同时成立，不承诺全部维度最大值的组合均可接受，也不承诺峰值内存或耗时。

首个受管写入及 prepared 之前预检双端资料、journal 和必要备份。超限报告对象、实际量、上限与人工处理指引，不截断条目、不自动扩容、迁移 Notes 根或清理未知文件。备份失败或恢复证据不足时保留现场，如实报告部分 local 证据，历史备份不自动删除。

容量审计覆盖七集合、A/B 双向切换和匹配包 repair。正常候选超限时，带实测复审表示方式或预算。命令与边界检查见[容量与同类接入扩展](validation.md#容量与同类接入扩展)，特定产物的历史观测见[实现验收记录](adapter-validation.md)。
