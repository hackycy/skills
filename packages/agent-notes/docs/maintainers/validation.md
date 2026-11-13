# 维护验证

本文用于为本次变更选择检查、运行真实包验收并保存证据。从仓库根执行命令，另有目录说明的除外。历史通过结果见[实现验收记录](adapter-validation.md)，不替代本次检查。

## 按改动选择检查

以下要求按涉及的范围叠加；先确定改了什么，再选择检查，避免把全部实验当作文档修改的固定门槛。

| 改动 | 必须检查 |
| --- | --- |
| 维护文档 | `pnpm lint`、受影响的相对链接与锚点、`git diff --check` |
| TypeScript 或配置 | 文档检查，加 `pnpm exec tsc --noEmit` 与对应 Vitest 测试 |
| 格式、关系、历史保护或状态操作 | 包级测试，包含正反样例和历史格式兼容 |
| README、安装指南、assets 或安装布局 | 构建并打包，检查真实 tarball 范围和安装后引用 |
| 分发、委派、升级、修复或事务 | 包级测试，加仓库外 `test:bundle` 与 `test:install` |

## 本地检查顺序

文档和风格检查：

```sh
pnpm lint
pnpm --filter @hackycy/agent-notes test tests/assets.test.ts
git diff --check
```

`assets.test.ts` 检查产品资源、公开文档与维护文档的引用闭包；新增导航或其他未覆盖文档还需检查其相对链接和锚点。文档应符合[内容归属](design.md#文档内容与分发)。

代码或资源改变后，先构建，再运行依赖当前 dist 的测试：

```sh
pnpm --filter @hackycy/agent-notes build
pnpm exec tsc --noEmit
pnpm --filter @hackycy/agent-notes test
```

可在包级测试末尾传 `tests/<name>.test.ts` 只运行相关文件；根 `pnpm test` 扫描 workspace 包。真实终端测试虽从源码启动 CLI，安装仍校验 dist 与当前 assets。build/pack 会清理 dist，不能与依赖这些文件的检查并发。

## 行为覆盖

| 修改的保证 | 测试入口 |
| --- | --- |
| 契约、范围发现、路径/symlink、快照隔离、关系与冻结基线 | [reader.test.ts](../../tests/reader.test.ts)、[commands.test.ts](../../tests/commands.test.ts) |
| 草稿、expected_hash、身份保持、状态转换、AST 引用修复与内容承接 | [workflow.test.ts](../../tests/workflow.test.ts) |
| 回滚、真实 SIGKILL、锁竞争、输入/runtime 竞态与外部编辑保留 | [transaction.test.ts](../../tests/transaction.test.ts) |
| 接入集合、所有权、Git 规则、备份、版本切换与恢复 | [distribution.test.ts](../../tests/distribution.test.ts) |
| 独立上限与 +1、累计超限、大端点解码、非法编码与文件增长 | [capacity.test.ts](../../tests/capacity.test.ts)、[projection.test.ts](../../tests/projection.test.ts) |
| 产品、npm 文档及维护材料的引用闭包 | [assets.test.ts](../../tests/assets.test.ts) |
| 参数、来源限制、缺项/复用/冲突、取消、恢复只读投影与真实 CLI | [cli-input.test.ts](../../tests/cli-input.test.ts) |
| 独立 PTY 问答、纠错、Esc/Ctrl+C、退出码 130 和输出分离 | [terminal.test.ts](../../tests/terminal.test.ts) |

macOS/Linux 的 PTY 用例需要 Python 3 标准库；Windows 跳过这组，不构成 Windows 终端验证。新增回归场景应观察用户保证，而非重复实现。新增能力后仍需保持[历史格式样例](../../tests/contract-examples.json)合法。

分别覆盖完整替代与完整吸收、基线冻结与首次归档来源、结构通过与语义 review，不能用其中一项代替另一项。

## 实际包验收

在包目录运行 pack，prepack 会构建 standalone ESM CLI；产物放已忽略的 `.cache/agent-notes-validation/` 或系统临时目录：

```sh
cd packages/agent-notes
pnpm pack --pack-destination /absolute/artifacts
```

将真实 tarball 解压到仓库外，保留完整包结构。回到仓库根运行：

```sh
pnpm --filter @hackycy/agent-notes test:bundle /absolute/extracted/package/dist/cli.mjs
pnpm --filter @hackycy/agent-notes test:install /absolute/artifacts/package.tgz
```

| 入口 | 验证范围 |
| --- | --- |
| [test:bundle](../../tests/bundle-smoke.ts) | 七种非空集合的默认/自定义根、49 次替换、runtime、stdin/JSON、生命周期、备份、冻结与 Git 换行；提供 B 包时再验证双向版本切换 |
| [test:install](../../tests/install-smoke.ts) | `npm install --offline --ignore-scripts` 与真实 npm bin、包内容与引用、单独接入、中英文模板、自定义根、Git/普通目录、子目录发现及修复 |

两种 smoke 都清理自己的临时项目。完整 npm 包应包含 CLI、索引、运行参考、两个 skill、模板、schema、README 和安装指南；维护材料、研究副本与缓存不入包，README 和安装指南不入 runtime。

版本切换使用两份基于当前实现的隔离 A/B 包：版本号不同，且至少有一个真实资源增删。`test:bundle` 的完整参数顺序为：

```sh
pnpm --filter @hackycy/agent-notes test:bundle /absolute/a/dist/cli.mjs /absolute/node /absolute/b/dist/cli.mjs
```

该检查逐字节比较 Notes、配置和 seal。分发验收覆盖 package.json 的 Node 下限及精确 Node 24 版本；`test:install` 必须在相应 Node/npm PATH 中运行，不能用 bundle 的 Node 参数代替。原生平台要求见[宿主声明与平台政策](#宿主声明与平台政策)。

## 容量与同类接入扩展

按[容量计量](integrations.md#容量预算)验证独立上限和累计边界，并对真实候选包运行：

```sh
pnpm exec tsx packages/agent-notes/tests/capacity-audit.ts /absolute/a/dist/cli.mjs /absolute/b/dist/cli.mjs
```

审计覆盖七集合的安装、A→B、B→A 及同时损坏本地源与宿主 skill 后的匹配包 repair。记录源、资产、动作数、衍生路径、端点、补充资料、逻辑/编码/备份量及内存/耗时；正常候选超预算时携实测复审。

同类接入扩展另运行：

```sh
pnpm exec tsx packages/agent-notes/tests/extension-smoke.ts /absolute/new-evidence-directory /absolute/node
```

证据目录须不存在。脚本仅在隔离源码描述表增加 example-agent，构建两份真实包，分别验证新根和共享根的安装、撤出及 SIGKILL 后恢复；构建使用仓库依赖，最终 CLI 在仓库外运行，正式 catalog 不加入夹具。

## 安装模型验收矩阵

以下 M01–M20 是持续维护的机械交付要求，历史运行结果另记于[实现验收记录](adapter-validation.md)。真实矩阵见 [integration-matrix.ts](../../tests/integration-matrix.ts)，协议和故障用例见 [projection.test.ts](../../tests/projection.test.ts)、[distribution.test.ts](../../tests/distribution.test.ts) 及上面的行为覆盖入口。

| 编号 | 场景 | 必须观察到的结果 |
| --- | --- | --- |
| M01 | 真实 tarball 的七种非空集合，默认/自定义根 | 完整文件树、两份或四份 skill、收据与可信投影一致，链接闭合，AGENTS/CLAUDE 原字节保留 |
| M02 | 同 bundle 的 7×7 完整集合替换 | 49 个终态等于全新目标投影，同集合幂等，共享文件不误删，额外内容保留 |
| M03 | 真实隔离 A/B 包，七集合双向版本切换 | 版本及实际资源增删均不同；各端使用对应源，Notes/config/archive seal 原字节保留 |
| M04 | 命令职责、来源、委派与 Note update | 非法输入/集合/来源在恢复或写入前失败；工具版本切换和 Note 更新独立 |
| M05 | install/2 漏项、多项、重复、错 kind/hash、未知字段/格式及清单缺失 | 无效所有权与资产损坏分开，不扫描重建或接管；合法 journal 恢复仍受端点约束 |
| M06 | source/1 规范编码、重复键、路径、闭包、额外文件及同版异 bundle | 非规范或不完整源拒绝，额外内容不进入身份，同版异 hash 不当作幂等或匹配修复 |
| M07 | 未物化/已物化源、自定义根与重复投影 | 只物化一次，同根字节一致，异根失败；匹配包按同根物化后核对身份 |
| M08 | 未知同名路径、父子/大小写/规范化碰撞、symlink 与类型 | 写前冲突，不接管、覆盖、改名或按前缀授权；记录实际文件系统行为 |
| M09 | 额外内容、共享消费者撤出、空/非空专属目录及重新接入 | 只删精确受管文件，未知内容与公共容器保留，残留同名根阻止重新接入 |
| M10 | 确定 Git 块与外部/嵌套/高优先级规则 | 块字节稳定，真实 Git 验证可跟踪、local 忽略、LF 及未知邻接边界；冲突不改投影迁就 |
| M11 | 非 Git 项目及缺 Git executable | 不 git init；仍生成规则；缺 Git 在项目写入前失败 |
| M12 | 受管缺失/手改、Git 坏标记、干净 repair、本地坏源与匹配包 | 普通管理要求 repair；同身份修复，手改先完整备份，缺失重建，坏标记/不可验证源停止 |
| M13 | 备份/权限失败、锁竞争及持锁后/完成前输入变化 | 不覆盖未成功备份内容，不抢活锁，复查变化中止；如实报告部分 local/journal 写入 |
| M14 | 真实子进程在 prepared、替换中、清单切换前后及 committed 后被终止 | 独立重建两端源；prepared 回 before，committed 验 after 收尾；目录动作受约束 |
| M15 | 恢复前/中第三种字节、额外 entries/目录、块外改写、缺补充源 | 保留编辑和 journal，候选路径不授权，资料不足停止，不执行旧脚本/下载或跳过校验 |
| M16 | dry-run/status/问答/取消/recover 及真实 PTY | 预览/status/取消不写项目或恢复，互斥参数先失败，问答先于锁和恢复，stdout/提示分离 |
| M17 | 仓库外 npm bin、离线 runtime、Node 下限与 Node 24 | npm --offline --ignore-scripts 真安装；runtime 不依赖 checkout/node_modules/联网，stdin/JSON/文档生命周期有效 |
| M18 | test-only example-agent 的真实隔离包 | 仅增加描述及夹具/证据/派生构建，不新增调用方宿主分支；新根、共享与恢复成立 |
| M19 | 索引/清单/源/端点/journal/备份预算 | 读取/解码前及累计过程限额，分层覆盖最大合法值、+1、单项合法但累计超限、非法编码/引用与现场增长，不截断 |
| M20 | 包/文档范围及旧管理语义退出 | 源索引与资源齐全，维护/研究/cache 不入包，无旧命令/target/install/1 alias 或 reader；历史 Note 契约继续有效 |

故障注入按物理布局、共享、配置创建、repair 手改端点与 A/B 源变化选择代表场景，无需把每个 SIGKILL 断点重复跑满 49 对。完整矩阵与各类回归共同证明模型，单个 smoke 不能覆盖全部要求。

## 宿主声明与平台政策

机械验收只证明安装模型。宿主证据分为官方文档 D、固定实现 C、独立安装/发现 I、正文加载与实际工作流 A；同一实现的源码和单测不算两份独立宿主证据。

| 编号 | 证据 | 要求 |
| --- | --- | --- |
| H01 | 文档与可取得的实现 | 固定抓取时间/hash 或 commit、路径和启用条件；闭源 loader 标不可取得，不能用 README 补造 C |
| H02 | 真实新产物的发现 | 观察两份 skill 的 name/path/来源/启用状态，覆盖单宿主与组合并隔离用户环境；文件清单不等于宿主发现 |
| H03 | 显式正文加载 | 两份 skill 各有可观察读取/trace；名单、名称回复或模型自称已读不足以证明加载 |
| H04 | 显式调用后工作流 | agent-note 实际查询、阅读、范围变化重查和交付 check；maintenance 按职责验证，保留 argv/结果，写 Note 仍需授权 |
| H05 | 自然任务触发 | 与显式点名样例分开，用于评估 description，不从单次成功推断每次触发 |

完整接入声明须具备该固定本地 CLI 版本的 H02–H04；缺项时只声明候选或已验证层次。闭源缺 C 不自动判不可支持；generic 只承诺通用静态布局。真实模型、登录或凭据实验依届时授权执行，不通过改全局配置或注入规则文件弥补证据缺口。

平台政策：

- 采用 Node 默认跨平台设计，Windows/Linux 原生实验不作为当前阻断门槛；未测的路径、rename、锁、权限和终端行为标为未测。
- macOS 完整机械矩阵须覆盖 Node 22.12.0 本身及精确 Node 24 版本。
- macOS 的 `core.autocrlf=true` clone、平台分支和 PTY skip 不代替其他系统的原生运行。发现差异后修复通用实现或明确限制。

## 实验记录

每次验收保存能重现该产物和环境的证据：

| 类别 | 必须记录 |
| --- | --- |
| 产物身份 | 代码 commit/工作树身份、tarball hash、宿主 executable 版本/hash |
| 环境 | Node/npm/Git 版本、原生 OS/架构、筛选后的隔离环境；不记录凭据 |
| 执行 | argv、cwd、stdout、stderr、退出码、失败与跳过、复现脚本位置 |
| 状态变化 | 前后文件及目录树、字节/hash 差异、journal 与备份 |

设置 `AGENT_NOTES_EVIDENCE` 为输出前缀时，bundle 矩阵保存逐次调用与耗时到 `<prefix>.matrix.json`。目录树须单独记录，文件 hash 树不能证明空目录恢复。

离线证据需要明确离线限制，清空 Node 注入变量本身不证明无网络。Git 用真实 check-ignore/check-attr 和 checkout/clone；权限检查需要原生实际拒写，root 绕过或模拟不算。旧包、早期失败后其他产物的成功日志都不能外推为当前产物通过。

出现下列反例时，应复审实现或设计：同类新增仍需多处宿主硬编码、合法双端无法独立重建、恢复覆盖外部编辑、正常候选超预算、精确 Git 规则普遍阻断正常项目。必要宿主无法仅靠两份 skill 提供流程时降低声明并重审范围，不暗中加入 hooks 或常驻规则管理。

## 文档一致性

按[内容归属](design.md#文档内容与分发)检查三个位置：

1. 源码中检查本地链接与锚点；产品资源在 assets 内闭合，README/安装指南在 npm 范围内闭合，仓库导航与维护文档可指向源码和测试。
2. 真实 tarball 中确认分发范围，维护材料和研究缓存未进入包。
3. 安装后再次检查引用；宿主 skill 的共享资源和专用资料位于不同目录，源码链接通过不代表投影后通过。

资源布局变化还需 A/B 替换验证：废弃受管资产被清理，手改先修复并备份，未知邻接文件保留，Notes/配置/seal 原字节保持，本地源损坏可从匹配完整包修复。

README 提供产品概览与入门教程，示例串联用户和 Agent 从想法到记录及再次使用的过程；参数、格式与写入规则仍以各自契约为准。教程示例须与实际输入及输出一致，区分协作建议和 CLI 强制规则。清理文档保留上游固定 commit 和实际未验证项，不用删除内容掩盖契约差异。完成时报告本次实际检查范围，历史结果继续留在[实现验收记录](adapter-validation.md)。
