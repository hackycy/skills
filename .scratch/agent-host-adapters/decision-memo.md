# 决策备忘录：宿主适配收敛于安装投影层

日期：2026-11-10。状态：研究推荐，未采纳为产品决定；没有实现适配层。固定基线与产物 hash 见 [baseline.json](baseline.json)。

## 推荐及其边界

推荐将宿主适配收敛在 `distribution` 内的**安装投影 Module**：一份随工具 bundle 固定的、声明式的安装 profile 表，经小 Interface 生成 skills、入口、资源链接映射和精确候选资产；现有安装器继续负责预检、差异、备份、Git 规则验证、smoke、统一 Result 和事务。CLI 选项、交互选择、布局互斥、清单路径授权和恢复路径授权，从同一可信描述派生。Provider 表是输入，安装投影才是 seam。

这能让**复用既有静态策略的新宿主**成为可测试的配置增量，但不能承诺任何宿主只加一行。新入口语法、新批准模型、hooks、plugins 或 global 写入都可能需要代码，后三者还超出当前 Agent Notes 产品范围。新增描述应随包发版、进入项目锁定 runtime 的 bundle hash；不允许项目手改配置表后继续同版本 repair。

还有一个不能由抽象消除的限制：如果“不变”包含**原样 0.3.0 二进制必须读懂新 target**，真正新增 target 无法实现。0.3.0 在 runtime 委派之前严格校验 target、顶层字段和资产路径。若这一前向兼容要求不可放宽，只能在技能发现、常驻入口加载语义和项目作用域均获证据支持时复用现有 `agents` / `claude` profile。新 CLI 可以增加解析到旧 profile id 的宿主 alias；已经发布的 0.3.0 参数 parser 不会获得新 alias，旧 CLI 仍须传既有 `--target agents` 或 `--target claude`。

## 为什么 seam 在这里

Agent Notes 已有一条真实的变化轴：同一 Notes 根、两份 skill、同一 runtime，要投影到不同 skills 目录和常驻入口。它属于安装产物如何落盘，既不是 Notes 的领域语义，也不是宿主事件模型。现在这些知识散在 CLI、manifest、manage、layout、git-rules 和 transaction 的授权规则中；把 Provider 限定为 CLI 名字到目录的映射，无法消除这些变化点。

固定源码可复核：[安装规划](https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/distribution/manage.ts)、[清单授权](https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/distribution/manifest.ts)、[恢复授权](https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/workflow/transaction.ts)。独立发布产物实验及第三目标补丁由[改动面调查](research/notes/report.md)和[失败实验](research/failures/report.md)给出；这些安装实验不等于宿主实际加载或 agent 服从规则。

Impeccable 提供了正面借鉴，也提供反例。其构建工厂的 Provider 描述可以选择目录、frontmatter 和变体；但安装目录/别名/global 路径在 Rust 里另有表，运行时身份又有一份。固定版本三个视图分别有 21、19、20 项，含别名和共享目录，不能把这个计数理解为支持数量或缺陷数量。结构复核见[可重跑审计](research/synthesis/audit-provider-tables.py)与[结果](research/synthesis/provider-views.json)，历史新增宿主及实际安装见[对照调查](research/failures/report.md)。因此不照搬“有一张 Provider 表”的表象，要集中同一安装事实的派生来源。

## 四种方案的权衡

| 方案 | 维护成本 | 兼容性 | 可测试性 | UX | 安全与冲突 |
| --- | --- | --- | --- | --- | --- |
| 多处硬编码枚举 | 当前两目标直接；新增行为需同步多处 | 严格拒绝未知值，但旧读新失败 | 单分支容易测，漏同步较难发现 | 命名目标清楚 | 白名单明确，但清单与恢复授权可漂移 |
| 包内声明式 profile + 统一安装投影 | 既有策略内新增配置；新策略仍需代码 | 保留 install/1 形状，仍需 reader/writer 发布治理 | 表驱动契约 + 真实包安装 + 中断恢复 | 保留 target/help/prompt，别名可复用 profile | 可信路径授权单源派生，重叠/异内容在预检拒绝 |
| 通用 `--skills-dir/--entry` | 把宿主知识转嫁给每个用户 | 任意路径无处持久化授权；与严格 install/1 不合 | 参数组合无界，需额外编码/路径/语义测试 | 适合专家临时复制，默认接入负担大 | 路径安全不等于授权；任意 entry 可能覆盖项目文件 |
| 全矩阵 | 宿主×scope×入口×hook/plugin×版本，组合大 | 需要额外能力/版本协议 | 验证大量未使用组合 | 选择复杂且容易暗示能力等价 | 扩大权限和冲突面，超出项目静态资产范围 |

表中对候选设计的评价是基于观察作出的设计推断，不是已实现的性能或成本测量。无法从一个合成第三目标推算所有宿主的改动成本。

## 安装投影 Interface 应隐藏什么

可信描述只包含：稳定 profile id、显示名和 aliases、项目内字面 skills 根、入口候选及顺序、已验证静态入口策略的标识、共享路由关系、安装/保留状态。不包含 shell、用户回调、远端加载器或可执行插件。`host` 是 agent 环境，`profile` 是安装布局；多个 host 可以复用一个 profile，host 名称不能直接成为持久化 target。

投影返回候选资产和所需路径集合，不直接写文件。调用者使用这些集合完成现有预检与事务；NotesLayout 仍只决定 Notes/runtime/local 根，不能变成宿主目录的大对象。Git 规则从投影的 owned roots 与精确文件产生，不再用宿主名字的正则表达式推断。

恢复必须保留独立的信任约束：journal 和项目 manifest 都不能授权任意写路径。恢复先于合法清单，须用**工具内固定的完整 catalog**（包括已退役 profile 的可恢复/可清理路径）校验；不能只按当前 manifest targets 决定授权。这里共享事实来源，不取消清单与 journal 各自的验证。

## 保持现有契约的迁移路径

1. 在当前 `agents`、`claude` 行为不变的版本中，先把散落的安装事实收敛为可信描述及投影。用实际旧包的文件树、入口块外字节、hash、repair 和 journal 实验做对照；不变更 Notes、Result 或 install/1 字段。
2. 先核对具体 host/client/version 是否同时支持现有 profile 的技能发现路径、常驻入口加载语义与项目作用域。只有 skills/list 成功不足以认定完整接入；未实测入口时保持文档/源码层能力声明。满足条件后，可在新 CLI 加解析到旧 id 的 alias、文档和契约夹具，持久化 targets 仍是旧 id；原样旧 CLI 使用原有 target 拼写。
3. 若必须新 profile，先发布能读取其 id/路径并恢复其 journal 的 bridge reader，再开放 writer。新 reader 仍严格拒绝未定义字段与越界路径，绝不通过“接受任意 targets/paths”换兼容。
4. 新 profile writer 只对约定的工具版本集合承诺回滚。撤销支持时保留 retired reader/recovery 描述，停止新安装；不能删除表的一行后让旧资产失去可管理身份。
5. 保持现有项目 target set 不可变：当前重复 init 改集合会失败，upgrade 也不接收 target。新增宿主支持与现有项目增删 target 是不同能力。若还要求原地切换，需另立产品决定；本研究不偷偷增加它。

install/1 仍只记录 `format/version/bundle_sha256/targets/assets`，assets 仍记录精确 file/block/hash。新增表可编译进 CLI 字节，由原 bundle hash 覆盖，不需要增字段。bridge 无法让已经发布的 0.3.0 获得前向读取能力；不认识新 profile 的旧 CLI 安全拒绝是预期限制。

## 代价与接受条件

一次性收敛需触及现有多个读取与授权位置，并补入口组合、重叠路径、恢复和真实旧包的契约验证。此后每个 profile 仍需官方发现机制证据、静态策略契约和实际安装验证；配置增量不是零测试，也不是免发版。新宿主需要新策略时，测试和实现成本必须显式呈现。

宿主能力矩阵记录的是 2026-11-10 的文档、固定源码及本机发现观察，不是 Impeccable 4.8.2 发布时的兼容状态；它作为能力证据附件，不直接成为运行时政策 DSL。

推荐成立的条件是：Agent Notes 持续保持项目内静态安装、相同两份 skill 和 runtime 语义。若实际要求跨项目 global 原子事务、强制调用 context/check 或宿主会话事件，当前 seam 和产品范围需要重新决策。具体反例、证据缺口和推翻条件见[可证伪性](falsifiability.md)。
