# 安装投影与恢复

本模型将宿主差异限制为项目 skill 布局，保持 Notes 领域、统一 Result、项目锁定 runtime 和事务检查。旧命令、install/1、旧 journal 和旧 target 不提供 reader/迁移；未知格式安全失败。所有常驻规则文件由项目维护。

## 选择与取舍

同一 Notes 根、两份 skill 和共享 runtime 需要投影到不同项目目录，这一变化属于 distribution；Notes 文档语义不随宿主改变。将描述、投影和完整校验放在一起，使 CLI、Git、清单与恢复共享安装事实，避免各自维护宿主路径授权。

| 考虑过的方案 | 取舍 |
| --- | --- |
| CLI、布局、清单和恢复分别硬编码宿主 | 每次同类新增都需同步多处，完整 inventory 与恢复授权容易漂移 |
| 任意 skills-dir、入口参数或项目回调 | 把宿主知识转嫁给项目，路径安全也不能证明工具拥有该内容；不提供这些扩展入口 |
| 宿主能力、scope、hooks、插件、版本的通用矩阵 | 引入当前静态项目 skill 之外的状态和权限，缺少对应产品与证据需求 |
| 保留旧协议 reader、别名和迁移桥接 | 本次明确取消旧管理协议兼容负担；严格拒绝未知格式，事务回滚与合法 Note 文档兼容仍保留 |

同类新目录可复用当前算法；新 frontmatter、安装结构或执行语义需要显式修改算法与范围，不能藏进描述表。收益是集中变化点，代价是包内索引、精确所有权和双端恢复必须一起验证。具体宿主范围仅本地 Codex CLI 与 Claude Code CLI；global、桌面/IDE/云/远端接入、规则文件管理、hooks、插件和会话事件不在本期范围。

## 唯一事实来源

[src/distribution/integrations.ts](../../src/distribution/integrations.ts) 是唯一接入描述表，维护 id、label、default、字面 skillRoot。generic/codex 共享 `.agents/skills`，claude-code 使用 `.claude/skills`；两份 skill 的源仅维护一次。build 从表生成索引视图，不增加第二编辑源。

[projection.ts](../../src/distribution/projection.ts) 提供 integrationChoices、project、validate：纯计算物化、链接映射、共享去重、碰撞、完整收据、Git 块和清理候选；不读盘、不运行 Git。manage 收集快照、真实 Git、smoke、备份和 Result。通用 transaction 不持有宿主目录授权；[recovery.ts](../../src/workflow/recovery.ts) 组合固定 journal kind 与可信校验器。

同类目录接入只增加描述、证据与契约夹具；新语义须改算法。描述的 skillRoot 限于安全 `.<namespace>/skills`，参数不接受任意目录。路径须 NFC、项目相对、最多 1024 UTF-8 字节，排除保留设备名、Git 元数据和 node_modules；投影另拒绝大小写、父子文件碰撞。

## source/1 与 install/2

npm `dist/source-index.json`、runtime `source-index.json` 使用 agent-notes-source/1，固定字段顺序为 format/version/notes_dir/integrations/files。接入项字段为 id/label/default/skillRoot，源项为 path/sha256；数组按 UTF-8 字节序排列。JSON 两空格、UTF-8 无 BOM、LF 和单个末尾换行，拒绝重复键、未知字段和非规范编码。

源只列 cli.mjs 与 assets 精确路径，不列自身。npm Adapter 将 cli.mjs 映射到 dist；不扫描邻接文件定义身份。notes_dir 为 null 时模板只物化一次，已物化源只服务同根；CLI 字节不替换。物化索引 SHA-256 定义 bundle，索引本身作为隐含 runtime 资产进入收据。

install/2 字段为 format/version/bundle_sha256/integrations/assets，资产为 path/kind/sha256；完整集合必须等于对应端可信源的重新投影，不靠前缀授权，不存共享引用计数，不包含清单自身、配置或 Notes。旧端使用旧索引，新端使用选定包；不执行旧脚本取得授权。

信任前提是用户选择的完整 npm 包和项目认可的 runtime。hash 验证相对完整性，不认证发布者，也无法检测整套内容被一致恶意替换。

## 计划与恢复

管理职责见[CLI 契约](../../assets/references/cli.md)。普通管理拒绝损坏；repair 仅同身份，匹配完整包可恢复坏源。精确移除保留未知文件，只 rmdir 已空专属 skill 根及其内部父目录。共享公共容器、Notes 根和未知内容不清理。

Git 小块由投影确定生成，块外原文不变。隔离 scratch 用真正 Git 检查精确可见性、忽略邻接边界、Notes/local 和 LF；外部配置与规则加入复查。未知邻接文件既不能从忽略变为可见，也不能从可见变为忽略；本次合法移除的受管文件不算未知邻接内容。不能兼容时报冲突，不生成环境专用块。

distribution 使用 transaction/2，保存 operation、配置、双端收据/索引、精确端点、必要创建/清理目录和缺失干净源的补充证据。source overlay 优先用对应端点、现场未变资源，再用经 hash 校验的必要补充字节；prepared 前必须完整重建两端。恢复重新计算完整合法计划，拒绝额外端点、项目内容改写、无效目录、缺失证据与第三种现场字节。prepared 仅回 before，committed 校验 after 并清理；恢复期间持续复查源与端点。

回滚目录候选也由投影生成，仅包含 runtime 及其内部目录、专属 skill 根及内部父目录；公共容器和 Notes 根不进入删除记录。恢复完成前沿用开始时的未变源观察值，并再次检查全部目标端点，不能重新读取后把外部修改接纳为新的基准。

## 容量预算

限额固定在 [protocol.ts](../../src/distribution/protocol.ts)，MiB = 1,048,576 B，KiB = 1024 B。计量要求如下：

| 对象 | 上限 | 计量边界 |
| --- | ---: | --- |
| source/1 规范 JSON | 1 MiB / 端 | 原始编码在解析、规范重编码之前检查 |
| 接入描述 | 64 项 / 端 | 唯一 ID，恰好一个默认项 |
| 精确源 | 256 项、单项 8 MiB、合计 16 MiB / 端 | 包括 CLI 与 assets，索引本身不列入源项；物化后也须符合限制 |
| install/2 | 2 MiB、1024 资产 / 端 | 完整收据等于投影；隐含的 runtime 源索引计入资产 |
| 完整项目相对路径 | 1024 UTF-8 B | 源、输出、控制、journal、目录及备份衍生路径；不是字符数或 OS 可用保证 |
| journal 文件变更 / 目录动作 | 各 4096 项 | before/after 是一个变更项；创建与清理目录动作合计，不接受重复或不必要动作 |
| 单 before/after 文件端点 | 16 MiB | Git 规则整文件及手改原文都按实际字节计 |
| journal 逻辑载荷 | 64 MiB / 事务 | before/after、双端索引、状态/控制及补充源的逻辑合计；共享引用展开后也累计 |
| journal 原始编码 | 96 MiB / 事务 | 与逻辑限额同时成立，base64 或物理复用不豁免逻辑计量 |
| repair 必要备份 | 64 MiB / 操作 | 完整原文、完整预期替换和差异摘要合计；不是全部历史备份的配额 |
| 单项差异摘要 | 64 KiB | 路径、两端长度/hash、变化说明与完整副本位置；不要求生成完整 unified diff |

限制独立且同时成立，不承诺所有维度最大值的组合均可接受，也不构成峰值内存或耗时保证。读取与解码前检查单项预算，并在逐项处理中累计；现场文件增长、类型变化仍需实际 I/O 和快照复查。

首个受管写入及 prepared 之前预检完整两端重建资料、journal 和必要备份。超限返回对象、实际量、上限和人工处理指引；不截断、不忽略条目、不自动扩容、迁移 Notes 根或清理未知文件。所有必要备份须成功落盘并复查才覆盖；权限/磁盘失败留下的部分 local 证据如实报告，既有历史备份不自动删除。恢复超限或资料不足也保留现场。

真实候选包的七集合、A/B 双向切换与匹配包 repair 都应测量容量；正常候选超限时带实测复审表示方式或预算，不能临时提高常量。测量与边界验收见[维护验证](validation.md)。

实现验证和仍缺的宿主/平台证据见[验证要求](validation.md)及交付记录；机械安装不能替代宿主正文加载或 agent 工作流证明。
