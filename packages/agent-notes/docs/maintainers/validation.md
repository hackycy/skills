# 维护验证

从仓库根执行命令；以实际脚本和本次改动为准，不把一次历史验收结果作为后续变更通过的依据。

## 按改动选择检查

| 改动 | 检查要求 |
| --- | --- |
| 维护文档 | `pnpm lint`、受影响的相对链接与锚点、`git diff --check` |
| TypeScript 或配置 | 上述检查，加 `pnpm exec tsc --noEmit` 与对应 Vitest 测试 |
| 格式、关系、历史保护或状态操作 | 包级测试，保留正反样例及历史格式兼容覆盖 |
| README、安装指南、assets 或安装布局 | 构建并打包，检查实际 tarball 的分发范围与已安装项目的文档引用 |
| 分发、委派、升级、修复或事务 | 包级测试，加仓库外 `test:bundle` 与 `test:install` |

包级测试命令为 `pnpm --filter @hackycy/agent-notes test`；单文件测试可在末尾传入 `tests/<name>.test.ts`。根 `pnpm test` 扫描 workspace 包。

真实终端用例从源码启动 CLI，但安装仍校验 `dist/cli.mjs`、`dist/source-index.json` 和当前 assets。首次运行或修改源码/资源后，先完成 `pnpm --filter @hackycy/agent-notes build`，再运行测试；不要与会清理并重建 dist 的 build/pack 并发。

## 行为覆盖

- `reader.test.ts`、`commands.test.ts`：契约样例、范围发现、路径与 symlink 边界、工作树/index/commit 隔离、关系与冻结基线。
- `workflow.test.ts`：草稿、expected_hash、身份保持、交付/拒绝、AST 引用修复、内容承接、条件清理与归档。
- `transaction.test.ts`：写失败回滚、真实子进程 SIGKILL、锁竞争、输入/runtime 并发变化、恢复冲突保留外部编辑。
- `distribution.test.ts`：七集合、49 次集合转换、常驻规则文件不变、Git 忽略/属性、资产所有权、备份、重复安装、版本切换、同版本修复与恢复。
- `capacity.test.ts`、`projection.test.ts`：协议及完整投影的独立上限与 +1、累计超限、真实大端点解码、备份总量、非法编码及读取期间增长。
- `assets.test.ts`：产品资源的引用闭包、公开文档的 npm 可达性和维护文档链接。
- `cli-input.test.ts`：全部命令参数、按运行来源区分的帮助与错误、安装缺项/复用/冲突、取消零写入、恢复只读投影及真实 CLI 恢复入口。
- `terminal.test.ts`：独立 PTY 进程覆盖默认问答、输入纠错、Esc/Ctrl+C、退出码 130、stdout 分离及无人值守开关。macOS/Linux 需 Python 3 标准库提供 PTY 驱动；Windows 跳过此组，不能据此宣称 Windows 终端已验证。

改变行为时增加能观察到用户保证的回归场景，避免只重复实现。历史格式样例使用 [contract-examples.json](../../tests/contract-examples.json)，新增工具能力后仍须保持旧合法样例通过。完整替代与完整吸收、基线冻结与首次归档来源、结构通过与语义 review 都要分别覆盖。

## 实际包验收

`pnpm --filter @hackycy/agent-notes build` 构建 standalone ESM CLI。在包目录执行 `pnpm pack --pack-destination <产物目录>`；prepack 会先构建。产物放仓库根已忽略的 `.cache/agent-notes-validation/` 或系统临时目录。

解压实际 tarball 到仓库外，保留其完整目录结构，再从仓库根运行：

```sh
pnpm --filter @hackycy/agent-notes test:bundle /absolute/extracted/package/dist/cli.mjs
pnpm --filter @hackycy/agent-notes test:install /absolute/path/to/package.tgz
```

`test:bundle` 可追加 Node 可执行文件路径，再追加另一版本的已解压 CLI 路径。它验证七集合、49 次转换、全部集合 A/B 双向切换、离线 runtime、stdin/JSON、生命周期、备份、冻结和 Git 换行转换；提供另一版本时验证工具版本切换，并逐字节检查 Notes、配置及 seal 保留。版本切换验收使用两份基于当前实现、版本号与至少一个真实资源增删不同的隔离包。

`test:install` 通过 `npm install --offline --ignore-scripts` 安装实际 tarball，运行真正的 npm bin；检查 npm 文档和运行资源完整，维护材料未入包，安装指南未进入 runtime；覆盖 generic/codex/claude-code 七集合、中英文模板、自定义 Notes 根、Git/普通目录、子目录调用与安装后的文档链接。两种 smoke 都清理自己的临时项目。

分发验收覆盖 `package.json` 的 Node 下限及 Node 24。`core.autocrlf=true` 的 Git clone 测试检查换行转换，不能代替 Windows 原生运行验证；报告实际平台。完整包应包含 runtime、两个 skill、模板、schema 和运行参考文档，维护指南、研究副本与缓存不进入包。

同类接入的改动面另运行 `pnpm exec tsx packages/agent-notes/tests/extension-smoke.ts <仓库外证据目录> <Node绝对路径>`。它仅在隔离源码的描述表追加 example-agent，构建并打包两个真实测试包，分别使用新 skill 根和共享根；解包后检查安装、集合撤出与真实 SIGKILL 后由安装 runtime 恢复。夹具不得污染正式 catalog；证据目录须不存在，构建使用仓库依赖，最终 CLI 在仓库外运行。

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

故障注入按物理布局、共享、配置创建、repair 手改端点与 A/B 源变化选代表场景，不把每个 SIGKILL 断点重复跑满 49 对。容量按[固定计量规则](integrations.md#容量预算)检查，用 [capacity-audit.ts](../../tests/capacity-audit.ts) 测量七集合的安装、A→B、B→A 及源缺失/损坏后的匹配包 repair，记录源/资产/动作数、所有衍生路径、端点、补充资料、逻辑/编码/备份量及内存/耗时观测。

## 宿主声明与平台政策

机械验收通过只证明安装模型。宿主证据分为官方文档 D、固定实现 C、独立安装/发现 I、正文加载与实际工作流 A；同一实现的源码和单测不当作两份独立宿主证据。

| 编号 | 证据 | 要求 |
| --- | --- | --- |
| H01 | 文档与可取得的实现 | 固定抓取时间/hash 或 commit、路径和启用条件；闭源 loader 标不可取得，不能用 README 补造 C |
| H02 | 真实新产物的发现 | 两份 skill 的 name/path/来源/启用状态，单宿主与组合均观察；隔离项目与用户环境，安装器文件清单不等于宿主发现 |
| H03 | 显式正文加载 | 两份 skill 各自有可观察的读取/trace；名单、名称回复或模型自称已读不足以证明正文加载 |
| H04 | 显式调用后工作流 | agent-note 实际运行相关路径/主题的 context、阅读正文、范围变化重查、交付 check，保留 argv/结果；maintenance 按职责验证，写 Note 仍需授权 |
| H05 | 自然任务触发 | 与显式点名样例分开记录，用于评估 description，不由单次成功推断每次自动触发 |

声明某固定本地 CLI 版本完整 skill 接入须有 H02–H04；缺少时仅称候选或已验证的层次。闭源缺 C 不自动判不可支持，文档和独立过程分别说明依据。generic 只承诺通用静态布局。真实模型、登录或凭据实验依届时授权执行，不能靠改全局配置或注入规则文件弥补证据缺口。

本期采用 Node 默认跨平台设计，Windows/Linux 原生实验不作为阻断门槛；当前 macOS 完整机械矩阵须覆盖 Node 22.12.0 本身及精确 Node 24 版本。其他原生 OS 的路径、rename、锁、权限和终端行为未测就标未测，平台分支、PTY skip 和 macOS CRLF 实验均不替代原生结果。发现差异后修复通用实现或明确限制。

## 实验记录

每次实际验收固定代码提交/工作树身份与 tarball hash、宿主 executable 版本/hash、Node/npm/Git、原生 OS/架构、argv/cwd、筛选后的隔离环境、stdout/stderr/退出码、前后文件及目录树、字节/hash 差异、journal/备份与复现脚本位置。失败和跳过保留；不记录凭据，不将旧包或早期失败后的成功日志外推到未跑产物。

test:install 使用 PATH 中的 npm 和 process.execPath；换 Node 时须在相应真实 Node/npm 环境运行并记录两者版本，不能拿 test:bundle 的 Node 参数代替。离线证据使用明确的离线限制，清空 Node 注入变量本身不证明无网络。Git 使用真正 check-ignore/check-attr 及 checkout/clone；权限测试需原生实际拒写，root 绕过或模拟不算；目录树单独记录，文件 hash 树不能证明空目录恢复。

若同类新增仍需多处宿主硬编码、合法双端无法独立重建、恢复覆盖外部编辑、正常候选超预算，或精确 Git 规则普遍阻断正常项目，应携反例重审实现/设计。若必要宿主无法仅靠两份 skill 提供可用流程，降低支持声明并重审范围，不暗中加入 hooks 或常驻规则管理。

## 文档一致性

按[内容归属](design.md#文档内容与分发)选择文档位置。维护入口与 `docs/maintainers/` 可引用源码和测试；产品资源的本地链接在 `assets/` 内闭合，README 和安装指南的链接在 npm 包内闭合。检查源码链接后，还要检查安装后的链接，因为宿主 skill 的共享资源和专用资料位于不同目录。

改变资源布局时，使用当前实现的不同版本夹具验证替换；旧清单中的废弃资产被清理，普通管理先要求修复，repair 备份手改内容后恢复，未知邻接文件保留。Notes、项目配置与归档 seal 逐字节保持；已安装 runtime 仍能通过 repair 离线恢复宿主 skill；源文件损坏时完整同版本 npm 包能修复。

README 保持概览和参考性质；参数、契约、写入规则各有一个定义位置。清理文档时保留上游固定 commit，移除失效路径、重复 schema 和结束的讨论状态；不能以删文档掩盖真实契约差异。

当前接入模型的真实包、Node、容量和宿主证据见[实现验收记录](adapter-validation.md)。历史通过记录不替代未来改动的重跑。
