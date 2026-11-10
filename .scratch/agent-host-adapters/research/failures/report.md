# 两种 CLI 的安装适配与失败恢复边界

研究日期：2026-11-10。范围是安装与故障恢复，不实现产品适配层，不发布、不调用付费模型。证据类型：**D** 官方文档声明；**C** 固定源码；**I** 实际发行物安装/故障实验；**A** 真实 agent 行为。本报告没有 A 证据。安装成功、skill 被发现、入口被加载、agent 执行 context/check 是四个独立命题。

## 结论与可推翻条件

1. **Impeccable 的 Provider 不是单个安装适配协议。** 构建变体表、安装目录/别名/用户目录规则、运行时 Provider 身份分别存在；真实 Devin 新宿主 commit 改了 20 个文件，Replit 共用 .agents 的小扩展仍改了 9 个文件。可借用其声明式变体思路，但不能据此推导“新增宿主只改一行”。[C: 构建表][i-providers]、[C: 安装规则][i-install-providers]、[C: runtime Provider][i-context-provider]、[独立历史证据](results/history.json)。若未来协议能从同一 descriptor 生成这些消费者，才可重新判断收敛程度。
2. **CLI 版本、engine 版本、skill 版本分别锁定。** npm impeccable@4.8.2 实际 tarball 携 shim 与 engine checksums，optionalDependencies 固定 engine 0.1.21；默认 bundle resolver 选择当时发布的 skill，未随 npm 4.8.2 固定为 skill 4.8.2。此次实际实验显式使用已验签的 skill-v4.8.2 universal.zip。[C: shim][i-shim]、[C: bundle resolver][i-bundle]、[I: 版本与 hash](results/environment.json)。
3. **Impeccable 的 staging/校验保护下载阶段，不能提升为 Notes 的多文件事务保证。** 双目标复制在第二目标权限拒绝时留下 63 文件；进程组 SIGKILL 留下 4 文件；并发有一组 1/0，其余三组 0/0，结果随调度变化。没有观察到锁/journal，安装复制调用链是逐目录删除后复制。--force 重跑可把本例补齐到干净 125 文件，但没有冲突保留与回滚协议。[C: 复制路径][i-bundle]、[I: 权限](results/impeccable-permission-partial.json)、[I: SIGKILL](results/impeccable-process-killed.json)、[I: 并发](results/impeccable-concurrent-a.json)。
4. **Notes 0.3.0 在已测试故障上保住现有事务协议。** 权限拒绝回滚后项目 hash 树为空；竞争者返回 WRITE_BUSY；真实 artifact repair 在首个项目文件原子替换后被杀，后续 context 返回 RECOVERY_REQUIRED；外部编辑使 --recover 返回 RECOVERY_CONFLICT 且 diff=0；人工协调回 journal 端点后恢复成功。适配层不应绕过统一事务执行器。[C: transaction][n-transaction]、[I: 完整结果索引](results/summary.json)、[I: hash 比较](results/comparisons.json)。
5. **保留事务不等于所有旧版本都能升级。** 真实 0.2.0 新安装的 config 位于 .agent-notes/config.json，而 notes_dir 是 .agents/notes；0.3.0 要求配置所在根等于 notes_dir，于预检返回 INVALID_CONFIG、退出 2，未进入中断注入点。此次确认的是既有跨版本断点，不是成功升级实验；没有修产品或手改旧配置掩盖它。[C: readConfig][n-reader]、[I: 旧配置](results/notes-020-fixture.json)、[I: 升级拒绝](results/notes-upgrade-020-to-030.json)。

## 固定基线与信任链

| 项目 | 固定身份 | 实际使用 |
| --- | --- | --- |
| Impeccable CLI / skill 源码 | cli-v4.8.2 / skill-v4.8.2，commit 035c8f319edd019936525a062fe99e83ca8d12c6 | 忽略目录 .cache/upstreams/impeccable；没有编译替代发行物 |
| Impeccable npm | impeccable@4.8.2 | 直接解包运行 package/cli/bin/cli.js；避免包管理器自动添装 optionalDependency 改变实验条件 |
| Impeccable engine | engine-v0.1.21 Darwin arm64 官方 binary | 先按 npm 包内 manifest 校验 SHA-256，才执行；不声称 binary 的编译 provenance 已逐字节重建 |
| Impeccable skill | skill-v4.8.2 universal.zip + .sig.json | SHA-256、size、Ed25519 envelope 全通过；公钥来自固定源码 scripts/bundle-signing-keys.json |
| Notes | release f74deccc5991e0452b3cb83feba51fe1c6bb1c1c，npm @hackycy/agent-notes@0.3.0 | 直接解包运行 dist/cli.mjs；固定 tarball SHA-256 |
| Notes 旧版探针 | @hackycy/agent-notes@0.2.0 | 仅检验真实旧安装升级边界，不替代 0.3.0 基线 |

发行物 URLs 与完整 SHA-256 写在 [prepare.mjs](prepare.mjs)，每次运行会拒绝不符字节。实际 size/hash、环境、隔离目录见 [environment.json](results/environment.json)。关键值：

| 发行物 | SHA-256 |
| --- | --- |
| impeccable-4.8.2.tgz | ab8a8d7b994f746bdfb460f29b28fe2fbdcb72e2b6efee9912506a50b9926226 |
| agent-notes-0.3.0.tgz | 1ade7e4e25d9155001743d5a057188561c5c41b6f7e3685677a880155d3b0463 |
| impeccable-darwin-arm64 engine 0.1.21 | 086fd22e54c445a0e792f66d2f168e35ec93f7c59054e1fde539d0d95b01ce41 |
| universal.zip skill 4.8.2 | 2d91255946127a5862cea0811c269b0943984840de76b90d32e4c2c5293c103a |

签名 envelope 为 schema=1、keyId=release-2026-09、version=4.8.2、artifact=universal.zip、size=18249867；本次用 Node crypto 独立核验签名与字节，再把本地 bundle 交给 CLI。**IMPECCABLE_BUNDLE_PATH 是本地可信输入 override，CLI 不为它执行远程签名流程**；因此不能把本次安装称为 CLI 的远程验签端到端测试。[C: bundle][i-bundle] + [I: harness](run.mjs)。

## Impeccable 的实际安装 seam

| 阶段 | 固定实现与数据 | 对适配边界的意义 |
| --- | --- | --- |
| 构建变体 | PROVIDERS 中 configDir、providerTags、frontmatterFields、agentFormat、emitHooks、versionInMetadata、writeOpenAIMetadata；factory/build 输出不同宿主资产 | 不只复制到不同目录，也变更内容、frontmatter 与 sidecar |
| 安装定位 | PROVIDER_DIRS/ALIASES/DISPLAY、HARNESS_HINTS、global-path override、scope detection；codex/replit 映射 .agents | host 身份与 target 目录不一一对应；同目录仍需不同检测/提示身份 |
| 运行定位 | context::Provider 持 id/command_prefix/command/skill_dir/self_cmd/self_raw；env override 优先，否则按 skill 目录推导 | 命令拼写和引用目录是 runtime presentation 能力，不是领域规则 |
| bundle 传输 | 本地 dir/zip override；否则 resolver 必须跳到固定 GitHub skill-vX universal.zip，同 release ZIP 与签名配对，验证后解压到临时目录 | 版本选择与网络信任属于分发层；不要混入 Notes target metadata |
| 安装写入 | copy_provider_skills / refresh_provider_skills 按 target、skill 循环 rm_rf(dest) + copy_dir；agents、commands、hooks 各走分支 | staged bundle 不提供目标树整体事务；异常边界需要单独设计 |
| engine 物化 | 安装后按本机平台取 scripts/VERSION，在 scripts/bin/<os>-<arch>/ 放 engine；下载/写失败只打印 stderr | skill 安装可成功，但启动仍缺 engine |

源码定位分别是 [PROVIDERS][i-providers]、[安装规则][i-install-providers]、[运行 Provider][i-context-provider]、[bundle][i-bundle]、[commands][i-commands]、[engine materialization][i-engine]。这不是对每一个官方宿主声明的独立验证；宿主实际加载能力仍需其官方规范与 A 证据补齐。

真实历史的反例：

- [Devin commit 7ddc958][i-devin] 共 20 文件；除 PROVIDERS 外，改 crates/context/src/{pin,provider}.rs、crates/skills/src/{bundle,providers}.rs、scripts/build.js、transformers/index.js、scripts/lib/utils.js、AGENTS、workflow 与测试。全 paths/count 见 [history.json](results/history.json)。这证明该实现尚有跨消费者知识。
- [Replit commit f75ee2a][i-replit] 共 9 文件；没有新增独立构建 Provider，却需改 commands.rs、providers.rs、检测测试与 oracle，给 .agents 共享路径保留 Replit 标签。它证明“共享 target”仍不等于“同一个 host”。

## bootstrap、缓存、平台

**npm shim 的链路**：IMPECCABLE_BIN 文件 → 可 resolve 的 @impeccable/cli-<os>-<arch> optional package → ~/.impeccable/bin/0.1.21/impeccable（可改 IMPECCABLE_HOME）→ 从 release channel 下载。env 与 optional package 路径不在此 shim 内做 manifest hash 校验；版本缓存与下载要求 manifest digest。verified stamp 持 accepted digest、size，并要求 binary mtime 不晚于 stamp。下载验证后写 PID .part，再 rename；stamp 失败则下次重 hash。这个优化不能等价为对恶意保留 size/mtime 改写的完整防篡改保护，本次只测试普通损坏。[C: shim][i-shim]。

**skill launcher 的链路另有差异**：IMPECCABLE_BIN → 同目录平台 binary（engine-probe 版本匹配）→ unversioned home engine（handshake）→ versioned cache（hash/stamp）→ PATH engine（handshake）→ 下载。它还设置 IMPECCABLE_SKILL_DIR / IMPECCABLE_SELF；shell 路径无需 Node，但依赖本机 shell、hash 和下载工具。其 sibling binary 以版本 handshake 接受本地同版本 build，并非每次 hash。[C: POSIX launcher][i-launcher] + [I: launcher override/离线](results/impeccable-installed-launcher-override.json)。

**本次 I 证据严格区分三个位置**：研究者用于启动 npm shim 的已校验 engine 位于 .cache/.../releases；shim cache 位于隔离 HOME；安装后 skill 自含 engine 位于两个宿主的 scripts/bin/darwin-arm64。IMPECCABLE_BIN 的成功不能证明后两者存在。初始离线安装只有 125 个 bundle 文件，launcher engine-probe 返回 127；给安装器回放官方已校验 engine 后多 2 文件，hash 均为 086f...ce41、mode 755，launcher 离线返回 impeccable-engine 0.1.21。[I: 位置/hash对比](results/comparisons.json)、[I: 自含启动](results/impeccable-selfcontained-launcher-offline.json)。

平台分支只做代码与 shim 分支观察：

| 分支 | C 行为 | 本次实验/限制 |
| --- | --- | --- |
| Darwin arm64 | 有 checksum、optional package、官方 release asset | 真机 engine 与安装/launcher 已运行 |
| Darwin x64、Linux x64/arm64、Windows x64 | manifest/optionalDeps 列出 | Linux arm64、Windows x64 的 shim 分支用 preloader 观察到对应 URL；fetch 固定回 404，未下载/执行 foreign binary |
| Windows arm64 | POSIX/PowerShell launcher 可下载回退 x64；shim 对已缓存 x64 digest 有接受分支，但首次 download 只查 arm64 checksum | shim 分支观察在缺 arm64 manifest 时直接拒绝，未发请求。不能宣称 npm shim 具有同等首次下载 fallback |
| FreeBSD/其他架构 | 缺 manifest 的 download fail closed | freebsd-x64 分支观察拒绝；不声称原生 FreeBSD 运行过 |
| Notes | Node >=22.12；路径/原子替换在 Node fs 抽象下 | 真机仅 Darwin arm64/Node24.16；未做 Windows 原生、网络盘、大小写盘或 Windows ACL |

分支结果：[Linux](results/branch-shim-linux-arm64.json)、[Windows x64](results/branch-shim-win32-x64.json)、[Windows arm64](results/branch-shim-win32-arm64.json)、[FreeBSD](results/branch-shim-freebsd-x64.json)；注入代码见 [platform.cjs](platform.cjs)。它改 process.platform/arch 并截住 fetch，只是控制流验证，**不是 OS 模拟器或跨平台运行成功**。

## 实装树与内容差异

Impeccable 用同一官方 ZIP、--providers=codex,claude --project --no-hooks --yes，安装 125 文件；每个实际文件的 SHA-256 都等于 ZIP 对应 entry，见 [comparisons.json](results/comparisons.json)。包含 .agents/skills/impeccable/{SKILL.md,agents/,reference/,scripts/} 和 .claude/skills/impeccable/ 同类树，另有 .claude/agents/*.md；此范围未生成 AGENTS/CLAUDE instruction 入口，也因显式 --no-hooks 未安装 hooks。该结果不能推导默认 --yes 是否装 hooks。

Notes 双 target 安装 22 文件：共享 .agents/notes/{config.json,install.json,runtime/cli.mjs,runtime/assets/...}；每个 target 两个 SKILL.md；AGENTS.md、.claude/CLAUDE.md 与 Git 规则受管块。fresh .claude/CLAUDE.md 导入 ../AGENTS.md，共用 routing；安装清单记录完整文件/块 hash。具体入口原文与 install.json 见 [installed-entry-preview.json](results/installed-entry-preview.json)，完整路径/size/hash/mode 见 [Notes安装结果](results/notes-init-offline.json) 与 [Impeccable安装结果](results/impeccable-init-offline-local-bundle.json)。这只证明静态内容与磁盘布局。

## 故障与恢复矩阵

所有退出码均来自实际发行物，未用 mock CLI 替代。offline 用 Darwin sandbox-exec deny network*，不是仅设置一个 proxy。权限注入用 sandbox 拒绝指定子树 file-write*，OS 返回拒绝；不是原生 ACL/chmod 全组合测试。

| 情景 | Notes 0.3.0 实际结果 | Impeccable 实际结果 | 恢复/范围 |
| --- | --- | --- | --- |
| 离线首次安装 | init 0，22 文件 | 已有已验签 local ZIP +外置 engine 启动 shim，install 0，125 文件；engine 下载 stderr 失败 | 不包含首次 npm fetch；Impeccable skill 尚缺自含 engine |
| 离线日常读取 | context/check 0，diff=0 | 无 engine 的 installed launcher 127；IMPECCABLE_BIN override 0；engine 物化后离线 0 | 区分获取依赖与运行时读取 |
| 未支持 target | init --target cursor → 2/INVALID_INPUT，diff0 | --providers=not-a-host → 1/Unknown provider(s)，diff0 | 都是 CLI 选择拒绝；不涉及宿主加载 |
| 修改受管 skill | repair 0，恢复 skill，创建原文/diff 备份 | 本矩阵未单独测试手改 skill 保留 | Notes source +I 支持备份协议；不推断 Impeccable 保留修改 |
| runtime source 损坏 | local repair 1/INVALID_BUNDLE，diff0；相同完整 npm 包 repair 0 | 普通 engine cache 损坏被拒绝，离线 127 | 工具 source 与 executable cache 是不同概念 |
| 下载内容损坏 | CLI 不自行下载版本；首次包下载归包管理器，本次不测 npm cache | HTTP 回放坏 engine 字节 → checksum mismatch/127，home无缓存写入 | 本地回放，非 GitHub 网络事故 |
| ZIP 损坏 | 不适用该分发结构 | 本地 non-ZIP → 1，project diff0 | 发生目标写入前；未测试 remote验签故障端到端 |
| 再安装时下载不可用 | npm已在本地，离线工具管理可运行 | 已装且不添加target/hooks时，missing local bundle → install 0、保持原树 | 成功码包括“无法检查更新但保留现有安装” |
| 第二 target 无写权限 | init 1，回滚，project文件hash树为空 | install 1，.agents 已留下63文件 | 解除拒绝后重跑补62文件，等于干净125文件 |
| 进程终止 | repair 真正首个项目rename后 SIGKILL；有journal，随后context 1/RECOVERY_REQUIRED | 观察到首个SKILL后杀整个shim/engine进程组，留4文件，未完成输出，无journal | Impeccable --force重跑补121文件并等于干净树；不等价事务恢复 |
| 外部编辑阻止恢复 | --recover 1/RECOVERY_CONFLICT，编辑与journal保留、diff0 | 无相应恢复协议，本次不编造等价操作 | Notes协调回journal after端点后 --recover 0/recovered:true |
| 并发 | 持有真实writer于首个replace后暂停，竞争repair 1/WRITE_BUSY；原writer继续0 | 4组同时 --force；1组出现1/0，其余0/0；失败为目标文件打开异常 | 此次次数不能估算失败概率；成功竞态也不能证明有锁 |
| 0.2→0.3升级 | 旧config根与notes_dir不一致 → 2/INVALID_CONFIG，diff0 | 未比较其他CLI版本 | upgrade恢复故障未到达commit阶段，repair恢复已独立验证 |

逐案 argv、cwd、完整显式 env、stdout、stderr、status/signal、before/after 文件树、hash diff 记录于 [results/](results/summary.json)。home cache 改动单列 homeBefore/homeAfter/homeDiff；不是把 cache 变化混算成项目变更。并发 A/B 的 before/after 覆盖重叠，不能把每个 diff 归因给独立进程；失败输出与最终树是观测事实。

关键记录：

- [Notes权限回滚](results/notes-permission-rollback.json)、[活跃锁](results/notes-concurrent-contender.json)、[被杀repair](results/notes-repair-killed.json)、[查询拒绝](results/notes-repair-interrupted-context.json)、[恢复冲突](results/notes-recovery-conflict.json)、[协调后恢复](results/notes-recovery-after-reconcile.json)。
- [Impeccable权限部分写入](results/impeccable-permission-partial.json)、[补齐](results/impeccable-partial-rerun.json)、[进程终止](results/impeccable-process-killed.json)、[重跑](results/impeccable-killed-force-rerun.json)、[cache损坏](results/impeccable-corrupt-cache-offline.json)、[校验后下载回放](results/impeccable-verified-download.json)、[坏下载回放](results/impeccable-download-checksum-mismatch.json)。

## 未支持宿主的四层问题

| 命题 | 此报告证据 | 能得出的结论 |
| --- | --- | --- |
| CLI 是否接受安装选择 | 上表两条具体拒绝命令与退出码 | 对显式未知target/provider拒绝，不写项目 |
| 宿主能否发现 SKILL.md | 已存在符合相应目录的文件，未启动宿主 | 只有安装位置事实；不能证明发现 |
| 宿主是否读取 AGENTS/CLAUDE 入口 | Notes已生成路由与import，未观察宿主加载 | 只有入口文本事实；不能证明加载 |
| agent 是否调用 context/check | 未做真实A试验；无聊天/模型调用 | 完全未验证，文件存在和命令可运行不能替代它 |

D 证据仅取固定版本契约：[Notes CLI 契约][n-cli]与[写入恢复契约][n-writing]声明锁、journal、备份和相同bundle修复边界；上述 C/I 实验独立检查了相应行为。README只用于提出问题，没有作为宿主支持的结论证据。

因此此报告支持的架构约束是：target descriptor 可以表达文件/入口生成与能力声明，实际写入仍交给 Notes 的拥有权清单、统一 Result 与事务执行器；host 发现/加载/行为作为独立能力与证据维护。它不支持为未知host写通用目录后宣称支持，也不支持从Impeccable的重复安装可修复推导Notes可以弱化journal。

## 复现与验证

在 Darwin arm64、Node24.16.0、pnpm12.14.0 执行。脚本每次创建新的 .cache/host-adapter-study/failures-run-*，所有子进程 HOME/TMPDIR/XDG cache/IMPECCABLE_HOME 均在其中；不改用户全局宿主配置。项目均 git init，防止 Git 根向上误落到本仓库。原始大 ZIP、engine、缓存均留忽略目录，不提交。

```sh
node .scratch/agent-host-adapters/research/failures/prepare.mjs /absolute/repository
node .scratch/agent-host-adapters/research/failures/run.mjs /absolute/repository
```

[prepare.mjs](prepare.mjs) 获取固定 URL 并验证 checksum。[run.mjs](run.mjs) 独立验证 bundle 签名、运行原始 tarball、记录所有结果；[fault.cjs](fault.cjs) 只在进程内预载拦住真实 fs.renameSync 后 kill/stop，不修改产品文件；[platform.cjs](platform.cjs) 只观察shim选择。默认结果目录可由第二个参数覆盖。已在一个不含任何前置缓存的新目录重新执行prepare与完整run，六个官方URL均HTTP200、hash通过，完整run退出0；记录见 [clean-reproduction.json](results/clean-reproduction.json)。外部HTTP只用于下载prepare inputs；run的engine传输使用本地HTTP回放官方已校验字节，并显式记录请求于 [download-fixture.json](results/download-fixture.json)。

源码测试与 artifact 实验分开：本报告上述行为来自 npm artifact/官方binary，源码阅读只是 C 证据；[source-tests.json](results/source-tests.json) 单列本仓库测试命令结果，不用它替代I实验。没有编译或运行上游 Rust 测试，也没有把上游自带测试视为真实宿主A证据。[validation.json](results/validation.json) 记录四个脚本 node --check 与 pnpm lint 均通过。额外源码 Vitest 尝试在60秒内未结束，保留timeout原文，不计为测试通过；这不改变已经执行完的artifact实验结果。

未验证：真实Windows/Linux/FreeBSD执行，Windows权限与ARM emulation；npm optional platform package安装行为；npm缓存损坏/离线首次包获取；remote resolver当前最新内容与真实服务5xx/签名故障；网络盘fsync与跨机器锁；恶意保留mtime/size的缓存改写；所有hooks分支；真实agent发现/入口加载/context/check。对应行为即使源码有分支也只记C，不能升级为I或A。

[i-providers]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/scripts/lib/transformers/providers.js
[i-install-providers]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/crates/skills/src/providers.rs
[i-context-provider]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/crates/context/src/provider.rs
[i-shim]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/cli/bin/cli.js
[i-bundle]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/crates/skills/src/bundle.rs
[i-commands]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/crates/skills/src/commands.rs
[i-engine]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/crates/skills/src/engine_binary.rs
[i-launcher]: https://github.com/pbakaus/impeccable/blob/035c8f319edd019936525a062fe99e83ca8d12c6/skill/scripts/impeccable
[i-devin]: https://github.com/pbakaus/impeccable/commit/7ddc958a40ecd58a622eecc1302c69a14a83ec72
[i-replit]: https://github.com/pbakaus/impeccable/commit/f75ee2a201cefd39c3bd54cf0ac1f141d82119e2
[n-transaction]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/workflow/transaction.ts
[n-reader]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/notes/reader.ts

[n-cli]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/assets/references/cli.md
[n-writing]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/assets/references/writing.md
