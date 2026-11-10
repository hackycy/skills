# 项目 skill 接入实现验收

日期：2026-11-10。对象为未发布工作树，基线 f74deccc5991e0452b3cb83feba51fe1c6bb1c1c；实际候选 tarball 从本次实现构建，在 checkout 外解包验证。A 的 manifest 版本仍为 0.3.0，B 为隔离的 0.3.1 夹具；两者都是新协议，不能与已发布的旧 0.3.0 混同。未发布 npm、推送 Git 或更改用户全局宿主配置。

实现模型见[安装投影与恢复](integrations.md)，用户操作见[安装指南](../installation.md)。两张决策地图保留历史研究与设计记录；本记录只报告实现后的实际观察。

## 已验证结果

| 范围 | 结果与复现入口 |
| --- | --- |
| 包级回归 | Node 22.12.0 和 24.16.0 各 11 个测试文件、261 项全部通过，无跳过；另复跑文档引用闭包 |
| 类型与风格 | 仓库 pnpm lint、pnpm exec tsc --noEmit、git diff --check |
| 七集合和集合替换 | 真实 A tarball，默认/自定义 Notes 根各七集合、49 次转换、同集合幂等；收据及所有受管字节等于新安装投影。见 [integration-matrix.ts](../../tests/integration-matrix.ts) |
| 双端资源 | A/B 版本不同，B 新增 assets/references/variant-b.md；七集合各自 A→B→A，共 14 次切换，旧资源移除、配置/Note/archive seal 原字节保持 |
| 源、物化与所有权 | source/1 canonical/重复键/未知字段/顺序/hash/路径与上限拒绝；install/2 完整 inventory 对照；同版异 bundle 拒绝；notes-two 重复物化不变；未知邻接资源不扩张身份 |
| 精确移除 | generic/codex 共享交接、未知 skill 内容保留、空专属目录清理、公共容器保留、残留同名目录再次接入拒绝 |
| 恢复 | 四个操作真实 SIGKILL prepared；首装配置前后、清单切换后、跨版本资源变化及 committed 崩溃；恢复前及最后一步的第三种字节保留；额外/遗漏端点、公共目录、块外变化和补充源缺失拒绝。见 [distribution.test.ts](../../tests/distribution.test.ts) |
| 失败与并发 | 原生非 root 的只读备份目录使 repair 停止并保留原文；独立 CLI 子进程锁竞争；内容/安装共用锁；输入及 runtime 竞态；缺 Git 写前停止，普通目录不 git init |
| Git | 精确 ignore/attribute 检查、未知邻接文件的忽略/可见状态双向保留、嵌套冲突、坏标记拒绝、提交中外部 Git 输入变化回滚；真实 core.autocrlf clone 后 status/check 与冻结字节保持 |
| CLI | install/hosts set/tool update 分工；Note update 保留；无旧别名；终端缺项/预选/取消/CI/JSON；取消恢复问答不写中断现场 |
| npm 与离线运行 | npm install --offline --ignore-scripts 后真正 bin，包引用闭包、runtime 引用闭包、同版备份修复、本地源损坏后完整匹配包修复、未知邻接文件保持、从非 Git 子目录发现自定义根 |
| 同类扩展改动面 | 两份真实隔离测试包，各仅在 catalog 加一行 example-agent，分别使用新根和共享根；两 Node 下安装、撤出、共享及真实 SIGKILL 后由已安装 runtime 恢复均通过。正式 choices 不含该项。见 [extension-smoke.ts](../../tests/extension-smoke.ts) |

真实 tarball 验收分别执行于 macOS 26.5.1 arm64、Node **22.12.0** / npm **10.9.0** 和 Node **24.16.0** / npm **11.17.0**，Git 2.50.1。bundle smoke 对应参数确实指定各自 Node，npm/bin smoke 在对应 Node/npm PATH 中执行；不是只替换了日志中的版本名。

本次最终复核 A tarball SHA-256：4d5f5c1772b141482d85a4e81ec99ccb1ec42c2234dbfcb5498a78ac266ce244。
B tarball SHA-256：7d360cb149226b11d491be562cddfa6235cbcfc600c525c05eaf2b03803af71f。产物分别位于本机 /tmp/agent-notes-assurance-a2-pack 和 /tmp/agent-notes-assurance-b2-pack；此前 final-a/final-b 产物与日志保留为早期证据，不作为修正后代码的通过依据。

## 容量与运行观测

[capacity-audit.ts](../../tests/capacity-audit.ts) 对两个真实解包 CLI 的七集合，分别执行安装、A→B、B→A 和匹配源 repair，共 28 场景/Node。repair 同时损坏本地源和宿主 skill，记录 prepared journal、补充证据、完整备份和全部衍生路径。

| 维度 | 实测最大值 | 已定上限 |
| --- | ---: | ---: |
| journal 原始编码 | 3,694,391 B | 96 MiB |
| 逻辑载荷（端点、双端索引/源与控制） | 5,613,860 B | 64 MiB |
| 单端点 | 1,375,486 B | 16 MiB |
| 单源 / 源合计 | 1,375,486 / 1,421,065 B | 8 / 16 MiB |
| 源索引 / 源项 | 2,410 B / 13 项 | 1 MiB / 256 项 |
| 必要补充源 | 2,673 B | 计入逻辑载荷 |
| 必要完整备份与摘要 | 6,742 B | 64 MiB |
| 资产 / 变更 / 目录动作 | 20 / 20 / 12 | 1024 / 4096 / 4096 |
| 端点相对路径 / 备份衍生路径 | 69 / 134 UTF-8 B | 1024 B |

固定限额未提高。[capacity.test.ts](../../tests/capacity.test.ts) 与纯投影测试分层覆盖索引、清单、源单项/总量/项数、完整投影与收据项数、端点、变更/目录项数、journal 解码与编码、备份合计的最大值和 +1；也覆盖合法单项累计超限、非法 UTF-8/base64、路径规范及实际读取期间增长。journal 编码的独立 96 MiB 上限在通用 JSON 层测试，不伪造不可能同时满足解码约束的最大完整事务。摘要由固定模板和有界路径生成，合法最大路径下远小于 64 KiB；备份测试仍将完整摘要计入总量并精确验证 64 MiB 与 +1。正常管理、prepare、恢复和备份均执行限制，超限不截断。

七集合 audit 整体耗时：Node 22 39.26 s，Node 24 37.83 s。/usr/bin/time -l 记录的 audit 进程最大 RSS 为 Node 22 305,610,752 B、Node 24 425,066,496 B。RSS 含 tsx、测试快照及多次管理，不是单次用户 CLI 内存保证；并行验证负载也会影响耗时，不设性能承诺。

## 完成复核

首次实现报告的 240 项测试不足以关闭完整验收。本次复核补齐真实宿主描述扩展包和独立容量边界，并修正了以下可复现问题：恢复收尾重建观察基准会漏掉最后一步外部修改；大端点的重复分组正则及解码前预算；内容事务编码前的累计预算；Git 仅检查未知忽略规则的单向变化；journal 可自报公共创建目录；文本物化的 UTF-8 有损解码。最终包重新构建，前述机械验证均对修正后的包或源码重新运行。

机械矩阵的复现定位：M01–M03 对应真实 bundle 矩阵，M04–M09 对应 CLI/投影/分发测试及 npm smoke，M10–M11 对应真实 Git 和缺工具测试，M12–M15 对应原生备份权限、锁、竞态、多断点 SIGKILL 和恢复冲突测试，M16 对应输入与真实 PTY，M17 对应两 Node 的 npm/bin 与离线 runtime，M18 对应隔离扩展包，M19 对应边界测试及 28 场景/Node 的容量 audit，M20 对应包范围、文档闭包、旧语义拒绝及历史 Note 契约回归。宿主声明和跨平台边界仍按下一节限定。

## 宿主和证据边界

Codex CLI **0.156.1**：隔离 HOME/CODEX_HOME，以真实新包安装 codex 与 claude-code，然后通过本地 app-server initialize、skills/list 查询。返回 agent-note 与 agent-note-maintenance，来源均为项目 `.agents/skills/.../SKILL.md`，scope repo，enabled true。这是 I 层发现证据，未启动 thread/turn、未调用模型。

Claude Code CLI **2.1.319**：本次只记录本地版本；旧研究的官方文档与 help 事实继续作为背景。尚无新产物的真实 skill 发现/正文加载证据。两宿主均未进行显式正文加载、模型 context/check 工作流或自然触发实验，因此产品文档仅称静态候选接入；没有把机械验收写成完整宿主支持承诺。

Windows/Linux 原生、真实宿主正文与工作流、自然触发效果未运行。Node 通用跨平台设计和 macOS Git 换行检查不替代这些证据。对全部预算维度的最大值组合未作穷举压力测试；固定边界不是所有维度最大值的笛卡尔积承诺。

## 重跑与证据

从仓库根执行[验证要求](validation.md)中的 lint、tsc、包级测试、实际 pack、checkout 外 test:bundle/test:install。test:bundle 传两份当前协议、含真实资源差异的 CLI；capacity-audit.ts 同样传两个绝对 CLI 路径，可用 /usr/bin/time -l 包裹。设置 AGENT_NOTES_EVIDENCE 为输出前缀时，矩阵保存每次 argv/cwd/stdout/stderr/退出码及耗时。

本地原始账本保留于根目录已忽略的 `.cache/agent-notes-adapter-implementation/`。最终复核使用 assurance-final-* 日志、assurance-release-node*.matrix.json、assurance-artifacts.json 及 assurance-source-files.json；扩展包的完整构建与运行记录在 /tmp/agent-notes-assurance-final-extension22 和 extension24 的 evidence.json。早期失败保留，包括初期 smoke/路径问题，以及本次大 Buffer 深比较导致测试断言进程内存耗尽、夹具依赖/catalog 构建问题和预期未更新；相应问题修正后重跑，未以跳过掩盖失败。缓存与隔离包不进入 npm 或提交。
