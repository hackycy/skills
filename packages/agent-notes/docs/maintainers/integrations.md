# 安装投影与恢复

本模型将宿主差异限制为项目 skill 布局，保持 Notes 领域、统一 Result、项目锁定 runtime 和事务检查。旧命令、install/1、旧 journal 和旧 target 不提供 reader/迁移；未知格式安全失败。所有常驻规则文件由项目维护。

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

容量固定在 [protocol.ts](../../src/distribution/protocol.ts)：索引 1 MiB、源 256 项/单项 8 MiB/合计 16 MiB，接入 64 项，收据 2 MiB/1024 项，端点 16 MiB，变更和目录各 4096 项，journal 逻辑 64 MiB/编码 96 MiB，必要备份 64 MiB/摘要 64 KiB。限制同时成立，先有界读取与累计校验；超限不截断、不自动扩容。生成计划和恢复证据在锁/备份前预检，备份完整落盘后才覆盖。

实现验证和仍缺的宿主/平台证据见[验证要求](validation.md)及交付记录；机械安装不能替代宿主正文加载或 agent 工作流证明。
