# Agent Notes 第三 target：实际改动面与清单兼容边界

固定基线：源码 release f74deccc5991e0452b3cb83feba51fe1c6bb1c1c；npm 0.3.0 的 gitHead 为 2f40a83c64e896b4bba17e95e24a249057c52702，两者只差发布版本字段。研究日期 2026-11-10，macOS arm64、Node 24.16.0、pnpm 12.14.0。研究分支 research/host-adapters-notes；没有提交产品实现。

## 可直接用于决策的结论

1. **保留 install/1 字段形状、所有权和事务机制可以新增 target；原样 0.3.0 二进制读取新 target 不可能同时成立。** 本次 synthetic writer 只扩展 allowlist，仍写 format/version/bundle_sha256/targets/assets 五个顶层字段；真实 npm 0.3.0 的 status/context/upgrade/repair 均返回 INVALID_INSTALLATION、退出 2、零文件变化。新 runtime 不能补救，因为 manager 在 spawn 前读取同一清单。[C1]、[C2]；[strict-results.json](strict-results.json) 的 manager-predelegation-sentinel；[compat-results.json](compat-results.json) 的 reader-0.3.0。
2. **真实改动跨越安装投影与安全边界。** 一个刻意简单的第三 target 实际改了 7 个源码文件、9 个具名函数及 3 个非具名定义位置；源码 diff 为 14 行加入/14 行删除。另加 1 个实验测试文件的 5 个场景、1 处实验包版本修改。它不是任意真实宿主的工时或最少文件数：仅证明“同样 skill 树 + 独立 Markdown 入口”的具体 target 成立。[synthetic.patch](synthetic.patch)；[synthetic-results.json](synthetic-results.json)；[supplemental-results.json](supplemental-results.json)。
3. **新增 catalog 能力不等于已安装项目能 add/remove target。** 现有 init 改集合返回 TARGET_CONFLICT；upgrade --target claude 返回 INVALID_INPUT；upgrade 使用原 targets。实验新版本也保留此语义。若“不变”包含 target-set 不可变，则新 target 仅适用于新安装，或宿主复用现有 agents profile；不能承诺现有项目配置回滚。[C3]、[C4]；strict 的 add-target-init / upgrade-target-flag。
4. **已有版本切换测试不是实际旧版兼容保证。** 当前单测的 bundle('0.1.0'/'0.2.0') 由同一 manage 实现消费；维护文档也明说 smoke 的两份包是“当前实现、版本号不同”。真实 0.1.0/0.2.0 npm 包使用 .agent-notes 清单/runtime 布局，0.3.0 已迁入 Notes 根；实际旧读新与新读旧均出现布局/配置断点，不能用同实现夹具替代。[C5]、[D1]、[H2]；strict 中真实旧包矩阵。

## 方法、证据类别与复跑

- D：产品/维护文档声明；C：固定 commit 源码与历史；I：实际 npm tarball、真实 CLI 进程及文件 hash；A：agent 实际读取/调用行为。本文没有 A 类成功证据。安装成功只证明文件与 CLI 行为，不证明任何宿主会发现 skill、读入口或主动 context/check。[D2]
- npm 0.1.0、0.2.0、0.3.0 均由固定版本 npm pack 获取，校验 registry dist.integrity 后用 npm install --offline --ignore-scripts 安装；运行真实 dist/cli.mjs。0.3.0 tarball SHA-256 为 1ade7e4e25d9155001743d5a057188561c5c41b6f7e3685677a880155d3b0463，与父任务给定 baseline 逐字节一致。0.2.0 registry gitHead 为 8c61b88f6fe1bd9604bbf3e0fd6eb0635e70a643；0.1.0 registry 无 gitHead，因此只把其 tarball integrity 当分发身份，源码解释链接到相应发布标签，不冒充包内证明。
- [run.mjs](run.mjs) 记录每条 argv/cwd、选择的非敏感环境项、stdout/stderr 文件名与 SHA-256、退出码/信号、文件树前后 hash 和 diff。原始输出及安装树留在已忽略的 .cache/host-adapter-study/notes；合成包成功构建一轮的原始输出在 notes-attempt2。项目实验最终使用系统临时目录，隔离 HOME/npm cache/Git 全局配置，不写用户宿主配置，不调用模型。补充全套测试是普通 shell 捕获，未使用隔离 HOME；测试本身只写自己的临时项目，记录见 supplemental-results.json。
- [baseline-results.json](baseline-results.json) 有 15 条执行记录和 3 条 tarball 身份；[strict-results.json](strict-results.json) 有 97 条进程记录；[compat-results.json](compat-results.json) 有 51 条进程记录；[synthetic-results.json](synthetic-results.json) 有 6 条构建/验证记录。这些是观察到的集合，不是独立测试用例数。

下列命令只能在干净、隔离的固定基线 worktree 中运行，不能在 main 或日常开发 checkout 运行；研究分支名称以 research/host-adapters- 开头。安装冻结依赖后，从该 worktree 根执行：

~~~sh
pnpm install --frozen-lockfile --ignore-scripts
node .scratch/agent-host-adapters/research/notes/run.mjs baseline
node .scratch/agent-host-adapters/research/notes/run.mjs strict
node .scratch/agent-host-adapters/research/notes/run.mjs synthetic
node .scratch/agent-host-adapters/research/notes/run.mjs compat
pnpm --filter @hackycy/agent-notes test
~~~

synthetic 会修改隔离 worktree 的产品源并生成测试；compat 会短暂恢复旧 transaction.ts 做反证，再恢复补丁。实验后先保存 diff，再 git restore 产品源码和 package.json、删除生成的 third-target.test.ts；最终提交只保留研究目录。prepare-synthetic.py 对固定原文作断言，不支持重复应用；重跑 synthetic 前须恢复基线。原始结果中的绝对 cwd 是本轮证据位置，脚本自身按其所在仓库计算路径。

## 实际改动清单：C 类

实验 target 名 study，skills 投影 .study/skills，入口 NOTES-STUDY.md；它是虚构静态宿主，不声称兼容任何真实产品。Notes 模型、Result、单 runtime、bundle hash、资产 inventory、manifest 最后切换、锁/journal/hash 复核算法都未改。

| 实际源码文件 | 改动的具名函数 | 其余定义/为什么涉及 |
| --- | --- | --- |
| src/cli/arguments.ts | declarations | schema.target：枚举、去重提示、help；否则参数层先拒绝 |
| src/cli/init.ts | finish | prompts.targets：交互可选项及无人值守缺值消息 |
| src/distribution/manifest.ts | managedPath、readInstallation | Target 类型：入口块所有权及清单 target allowlist；skill 文件路径本来按 target 拼接 |
| src/distribution/manage.ts | protectLayout、manage | Notes 根不得覆盖新宿主 skill/入口；旧入口识别和新入口选择 |
| src/distribution/git-rules.ts | planGitRules | ownedRoots regex 必须包含新 target，否则未来 skill 文件不继承 ignore 例外 |
| src/distribution/layout.ts | hasProjectRoute | 无 Git、定制 Notes 根、从子目录调用时识别第三入口 |
| src/workflow/transaction.ts | distributionPath | 恢复器独立白名单须接受新入口和两个具名 skill 的路径，不能从清单授权任意路径 |

源码总计以 patch 和 git diff --numstat 计数为 **7 文件、9 具名函数、3 非具名定义位置、14+/14−**；非具名位置是 schema.target、prompts.targets、Target。blockPaths 虽含旧入口但没有调用点，本补丁未改；不能把所有 rg 命中都算必要代码。route/claudeRoute、rewriteLinks、bundle、reader 的模型/快照处理、Result 与 commitTransaction 算法均复用，不进入这个实际修改集合。[C1]、[C3]、[C6]、[C7]、[C8]

这个计数只覆盖已验证的路径形状。真实宿主若使用非 .<target>/skills 布局、不同 frontmatter、非 Markdown 入口、多个优先级目录或自定义执行逻辑，需要另一次明确实验；不能从本次 7 文件推出其成本。Provider 描述表可以收敛重复声明，但其输出仍须经 managedPath、protectLayout、distributionPath 与事务所有权校验；放宽为任意字符串/任意脚本会破坏本研究保留的不变量。

## 测试和文档的具体受影响集合

**实际新增测试**为 [third-target.test.ts.fixture](third-target.test.ts.fixture) 一个文件的 5 场景：单 study 与三 target 两组安装及链接闭包、未来 skill 的 Git 可见性、CLI/恢复路径约束、Notes 根碰撞保护。另有独立 CLI 实验覆盖 npm 安装、自定义根/普通目录子目录、宿主文件修复、跨版本读取、prepared SIGKILL 恢复。实验 package.json 只需改 version 区分二进制，属于实验脚手架，不是新增 target 的产品需求。

**实际检查过的既有验证入口为 7 文件**，未宣称都已增加第三 target 参数化：tests/distribution.test.ts、cli-input.test.ts、terminal.test.ts、layout.test.ts、transaction.test.ts、bundle-smoke.ts、install-smoke.ts。正式实现应把新 target 放入相应安装/布局/恢复/分发场景；尤其旧二进制矩阵须保留本轮真实 tarball，不能再只修改当前实现的 version。

**核实需要同步的文档为 6 文件**；本轮只研究，未改这些产品文档。它们是具体命中集合，未声称所有未来宿主都只需改这六处：

| 文档 | 已核实的现有声明与同步点 |
| --- | --- |
| [AGENTS.md][D3] | 仅两个静态入口的产品约束；新增 target 必须显式调整这条限制 |
| [README.md][D4] | target 可选 agents/claude/两者、布局概览 |
| [docs/installation.md][D5] | 目标选择与接入步骤 |
| [assets/references/cli.md][D6] | 参数枚举、宿主目录、静态路由与版本/修复契约 |
| [docs/maintainers/design.md][D2] | host 入口/skill/CLI 分工，目标和所有权的设计约束 |
| [docs/maintainers/validation.md][D1] | 单/双目标验证范围与真实历史包兼容要求 |

观察到的验证结果：先 build 后基线 **9 文件 277/277 通过**；真实 npm 0.3.0 test:bundle 与 test:install 通过；合成补丁 typecheck、构建、打包、npm 离线安装通过，补丁下完整测试 **10 文件 282/282 通过**。首次新 worktree 未 build 跑测试为 272 通过/5 失败，失败均在需要完整 bundle 的路径；补 build 后消失。首次实验测试 stub 漏掉 smoke 需要的 command/data.notes，修正 stub 后 5/5 通过；这属于测试脚手架纠错，不是 target 缺陷。原始失败留缓存，不纳入通过证据。

## 严格 install.json 边界与 manager 委派顺序

以真实 npm 0.3.0 初始化 agents 项目，逐一只改一个条件，再比较完整文件树（不含 .git）：

| 清单变体 | package status/context/repair/upgrade | 项目 runtime status/context/repair | 项目 runtime upgrade |
| --- | --- | --- | --- |
| targets 增加 study | INVALID_INSTALLATION，2 | 同左 | PACKAGE_COMMAND_REQUIRED，2 |
| 顶层增加 extension | INVALID_INSTALLATION，2 | 同左 | 同上 |
| asset 增加 extension | INVALID_INSTALLATION，2 | 同左 | 同上 |
| assets 增加 .study/skills/agent-note/SKILL.md | INVALID_INSTALLATION，2 | 同左 | 同上 |
| assets 增加 NOTES-STUDY.md block | INVALID_INSTALLATION，2 | 同左 | 同上 |
| format 改为 agent-notes-install/2 | UNSUPPORTED_FORMAT，2 | 同左 | 同上 |

这 **48 条调用全部零写入**。路径两行刻意保留 agents targets，隔离验证路径白名单；后续真实 synthetic 清单才同时包含新 target/真实资产。清单 parser 还检查版本/bundle hash 形状、重复 targets/paths、runtime 必须在 inventory、file/block kind 与安全路径；本文没有把未逐项变异的规则冒充新增实测。[C1]

delegate 只对日常八命令工作，先 readInstallation，再查 runtime hash，再 spawn；status/repair/upgrade 由 manage 自己读清单。[C2]、[C3]。哨兵实验把 locked runtime 头部加“写 marker”，同步清单 runtime hash，再加入未知 target：manager context 退出 2、marker 不存在；直接运行 runtime 则 marker 出现后同样退出 2。这是“新 runtime 未获得控制权”的进程级反证，不只是源码推断。runtime init/upgrade 的 PACKAGE_COMMAND_REQUIRED 更早发生，故不能把其失败算作 manifest reader 已工作。[C4]

## 真正旧版与新 writer 矩阵

### 自然项目布局：I 类实际二进制

| reader → writer/安装 | status | context | upgrade/降级 | repair |
| --- | --- | --- | --- | --- |
| npm 0.3.0 → npm 0.3.0 agents | 成功 | 成功 | 同版本完整无变化 | 同版本恢复成功 |
| npm 0.3.0 → study writer，仅 agents targets | 成功，分别报告 manager/runtime | 成功并委派新 runtime | 成功降到 0.3.0；再以 study 包 upgrade 成功 | REPAIR_VERSION_MISMATCH，2 |
| npm 0.3.0 → study writer，含 study target（单/三 target） | INVALID_INSTALLATION，2 | 同左，未委派 | 同左，降级前读不了清单 | 同左 |
| npm 0.2.0 → 原生 0.3.0 / study 新布局 | NOT_INSTALLED，2 | INVALID_FRONTMATTER，1 | NOT_INSTALLED，2 | NOT_INSTALLED，2 |
| npm 0.1.0 → 原生 0.3.0 / study 新布局 | NOT_INSTALLED，2 | INVALID_FRONTMATTER，1 | NOT_INSTALLED，2 | INVALID_INPUT，2（该版无 repair 命令） |
| npm 0.3.0 → npm 0.1.0 / 0.2.0 原生旧布局 | INVALID_CONFIG，2 | 本轮未对这一方向单独调用 | INVALID_CONFIG，2 | 本轮未对这一方向单独调用 |

旧包的 context 会把新布局 runtime/assets 和 local 下 Markdown 当 Notes 校验，故不是“成功绕过清单”。0.3.0 新 reader 发现 .agent-notes/config.json 后，其安全根限制拒绝旧 Notes 配置。所有上述兼容失败调用零文件变化。真实 0.1/0.2 → 0.3 的迁移在该基线没有被支持；本研究不补迁移实现。[H2]、[C9]；strict 真实旧版本行。

### 隔离 parser 边界，不把布局缺失当未知 target

先各用真实 0.1.0/0.2.0 包创建其原生合法安装（均成功），再在各自 .agent-notes/install.json 对上表六个字段/路径条件逐一变异。两版 package status 和各自已安装 runtime context 都对前五种返回 INVALID_INSTALLATION/2，format/2 返回 UNSUPPORTED_FORMAT/2，均零写入。这证明旧 parser 本身严格；不伪造新版资产布局来假称自然兼容。相关 24 条读取在 strict 的 own-layout / oldruntime 行。[H1]、[H3]

### repair、切版本和中断边界

- 同版本完整 upgrade 无变化；宿主受管 skill 损坏时 upgrade 返回 REPAIR_REQUIRED/1，runtime repair 可从完整同版本源恢复并备份。runtime 源模板损坏时 runtime repair 返回 INVALID_BUNDLE/1，完整同版本 npm 包 repair 成功。repair 不能承担版本迁移；版本相同而 bundle 不同也被拒绝。[C3]、[D6]；strict same-upgrade-damaged / runtime-repair-host / runtime-source-damaged / same-package-repair。
- 普通 agents target 的 study 新 runtime 可以被 0.3 manager 委派、也可以 downgrade；说明版本差异本身不必阻断。含 study target 后连 downgrade 入口都过不了旧 parser，不能靠“把版本配回去”解决。要回旧版，需新版本在受管事务中提供明确的 target 移除/映射迁移；现行 v1 target-set 不可变约束下不能承诺此能力。[C1]、[C3]；compat 039–044 与 005–008/025–028。
- 真实 SIGKILL 在 prepared 事务应用第一步后留下 owner/journal/runtime。仅撤销 distributionPath 扩展，recover 返回 RECOVERY_CONFLICT/1 且 tree diff 空；恢复补丁后 recover 成功，文件树回到空。允许“新路径加入 inventory”但漏改恢复白名单，会制造无法自动恢复的安装。该实验没有修改锁、journal 格式或 before/after 协议。[C8]；compat prepared-kill / prepared-old-recover / prepared-recover。

## 在“不变”约束下的兼容协议选项

| 选项 | 保留什么 | 旧 0.3.0 二进制 | 前置条件与限制 |
| --- | --- | --- | --- |
| format/1 原字段，仅扩 target allowlist | 字段形状、精确 inventory、manifest 最后切换、事务与单 runtime | 含新 target 必然读失败 | 接受最低 manager/runtime 版本提升；新 target 用新安装，原 target 项目升级仍保留集合 |
| 先 bridge reader，再 new writer | 可保留 install/1 字段形状与所有权机制 | 原样 0.3 仍失败；已部署 bridge 才可能成功 | bridge 必须先明确识别新 target 的路径/块/恢复授权，并保留日常委派与 hash 校验；需要真实 bridge→writer→rollback 测试，本文未实现、未验证 |
| 完全不改 reader，宿主复用 agents profile | 二进制、target set、清单、事务均可不动 | 继续读取 agents 清单 | 只有宿主实际发现 .agents/skills 与加载 AGENTS.md 才成立；需 I 类宿主发现/加载证据。是否主动 context/check 另需 A 类证据，不可仅改名便宣称完成适配 |
| 新 format 或扩顶层 Provider 字段 | 无法保持现有字段形状 | 立即 UNSUPPORTED_FORMAT 或 INVALID_INSTALLATION | 本任务若要求形状/format 不变，则排除此项；不作为悄然推荐 |

因此，若要求“旧 0.3 原样 + 新独立 target 身份/路径 + 清单不变 + 日常 manager 可委派”四者同时成立，现有实现给出反例，不能靠 Provider 抽象消除。推荐把 profile 的声明/投影集中在 distribution 邻域，而不是让宿主越过 inventory/transaction；迁移策略需先选上表哪项，再谈 catalog 实现。这个建议是架构候选，未形成已采纳产品决定。

## 未验证项与反例

- study 是虚构宿主；无 A 类证据支持新路径被宿主读取、名称/frontmatter 合法、冲突优先级正确、Agent 主动运行 context/check。
- 未实现 bridge reader、target-set 编辑/迁移、真实新版 Provider 或 format/2；兼容选项的可行条件不是已通过实验。
- macOS Git 换行 smoke 不等同 Windows；本轮未跑 Node 最低版本、Windows、宿主付费模型或外部服务。
- 本实验合成目标保留现有两 skill、使用普通 Markdown 入口及 .<target>/skills；非标准布局、链接解析器或自定义回调可能扩大改动面。
- 源码与真实执行为关键结论提供 C/I 两类独立证据；“宿主会自动遵循规则”“bridge 可无缝部署”等没有第二来源，故明确留作未验证。

## 固定来源

[C1]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/distribution/manifest.ts#L30
[C2]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/distribution/delegate.ts#L16
[C3]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/distribution/manage.ts#L162
[C4]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/cli/arguments.ts#L157
[C5]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/tests/distribution.test.ts#L28
[C6]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/distribution/git-rules.ts#L101
[C7]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/distribution/layout.ts#L182
[C8]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/workflow/transaction.ts#L27
[C9]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/src/notes/reader.ts#L68
[D1]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/docs/maintainers/validation.md
[D2]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/docs/maintainers/design.md
[D3]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/AGENTS.md
[D4]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/README.md
[D5]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/docs/installation.md
[D6]: https://github.com/hackycy/skills/blob/f74deccc5991e0452b3cb83feba51fe1c6bb1c1c/packages/agent-notes/assets/references/cli.md
[H1]: https://github.com/hackycy/skills/blob/8c61b88f6fe1bd9604bbf3e0fd6eb0635e70a643/packages/agent-notes/src/distribution/manifest.ts#L37
[H2]: https://github.com/hackycy/skills/commit/2f40a83c64e896b4bba17e95e24a249057c52702
[H3]: https://github.com/hackycy/skills/blob/88e9f4406f4d52ef47b7de12b1e9f527fa1dda1c/packages/agent-notes/src/distribution/manifest.ts#L37
