# 项目 skill 接入实现验收

本记录保存 **2026-11-10** 对特定候选产物的实际观察，供追溯实现和证据使用。当前设计见[安装投影与恢复](integrations.md)，后续改动的检查要求见[维护验证](validation.md)。

## 验收对象

| 项目 | 当次身份 |
| --- | --- |
| 源码 | 未发布工作树，基线 `f74deccc5991e0452b3cb83feba51fe1c6bb1c1c`；实现随后提交为 `8745a26` |
| A 包 | manifest 版本 0.3.0，新安装协议候选包 |
| B 包 | 隔离的 0.3.1 夹具，新增 `assets/references/variant-b.md` |
| 运行位置 | 从候选 tarball 在 checkout 外解包验证 |
| 外部操作 | 未发布 npm、未推送 Git、未更改用户全局宿主配置 |

A/B 都采用新协议，不能与已发布的旧 0.3.0 混同。下面的通过结论仅适用于当次源码和产物，不替后续修改背书。

### 环境与产物

原生环境为 macOS 26.5.1 arm64、Git 2.50.1。两个 Node 环境分别执行：

| Node | npm | 执行方式 |
| --- | --- | --- |
| 22.12.0 | 10.9.0 | bundle 显式指定该 Node；npm/bin 检查使用对应 PATH |
| 24.16.0 | 11.17.0 | bundle 显式指定该 Node；npm/bin 检查使用对应 PATH |

最终复核产物：

| 产物 | SHA-256 | 当时本机目录 |
| --- | --- | --- |
| A | `4d5f5c1772b141482d85a4e81ec99ccb1ec42c2234dbfcb5498a78ac266ce244` | `/tmp/agent-notes-assurance-a2-pack` |
| B | `7d360cb149226b11d491be562cddfa6235cbcfc600c525c05eaf2b03803af71f` | `/tmp/agent-notes-assurance-b2-pack` |

此前 final-a/final-b 产物及日志保留为早期证据，不作为修正后代码通过的依据。本机临时路径仅用于定位当次材料，不保证其他环境存在。

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

## 容量与运行观测

[capacity-audit.ts](../../tests/capacity-audit.ts) 对两个真实解包 CLI 的七集合，分别执行安装、A→B、B→A 和匹配源 repair，共 28 场景/Node。repair 同时损坏本地源和宿主 skill，记录 prepared journal、补充证据、完整备份和全部衍生路径。

| 维度 | 实测最大值 | 当次采用上限 |
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

## 当次修复与复核

首次实现报告的 240 项测试尚未覆盖完整验收。最终复核补齐真实宿主描述扩展包和独立容量边界，并修复以下可复现问题后重新构建和运行：

| 问题 | 复核关注点 |
| --- | --- |
| 恢复收尾重新读取观察基准，漏掉最后一步外部修改 | 保持初始观察值，完成前复查 |
| 大端点重复分组正则及解码前预算不足 | 大端点处理与分配前限额 |
| 内容事务编码前累计预算不足 | 编码前累计逻辑载荷 |
| Git 只检查未知忽略规则的单向变化 | 忽略/可见状态双向保持 |
| journal 可自报公共创建目录 | 目录动作从可信投影授权 |
| 文本物化使用 UTF-8 有损解码 | 非法文本编码拒绝 |

上述机械验证均针对修正后的包或源码重跑。矩阵编号与当次证据对应如下；编号定义见[安装模型验收矩阵](validation.md#安装模型验收矩阵)。

| 编号 | 当次证据 |
| --- | --- |
| M01–M03 | 真实 bundle 矩阵与 A/B 切换 |
| M04–M09 | CLI、投影、分发测试及 npm smoke |
| M10–M11 | 真实 Git 和缺工具检查 |
| M12–M15 | 原生备份权限、锁、竞态、多断点 SIGKILL 与恢复冲突 |
| M16 | 输入与真实 PTY |
| M17 | 两个 Node 环境的 npm/bin 与离线 runtime |
| M18 | 隔离扩展包 |
| M19 | 边界测试及 28 场景/Node 的容量审计 |
| M20 | 包范围、文档闭包、旧语义拒绝与历史 Note 契约回归 |

## 宿主和证据边界

当次宿主 executable 身份：

| 宿主 | 版本 | SHA-256 |
| --- | --- | --- |
| Codex CLI | 0.156.1 | `0196e89fe5a7598f816ee54232c3d7c26d75e502ab5cfe2c9240e81d90f7255a` |
| Claude Code CLI | 2.1.319 | `1f53587e92dee8e089fa349188a4cda64fa34ace6e7b0ca2ee278ddaa3cc2ebd` |

Codex 在隔离 HOME/CODEX_HOME 中，用真实新包同时安装 codex 与 claude-code，经本地 app-server initialize、skills/list 返回两份 skill：路径为项目 `.agents/skills/.../SKILL.md`，scope 为 repo，enabled 为 true。这是 I 层的组合发现证据；未启动 thread/turn 或调用模型。

Claude Code 只记录本地版本，没有新产物的真实 skill 发现或正文加载证据。固定官方资料与源码来源见[项目 skill 接入依据](upstreams.md#项目-skill-接入依据)。

当次未验证的范围：

- Codex 单宿主的新产物发现，以及两宿主 H03/H04 的正文加载与实际工作流。
- 显式模型 context/check 工作流和自然触发效果。
- Windows/Linux 原生运行；Node 通用实现和 macOS Git 换行检查不替代这些证据。
- 所有容量维度最大值的组合压力；独立边界不承诺其笛卡尔积可接受。

因此，当次结论是静态候选接入及表中已验证层次，未宣称完整宿主支持。声明条件统一由[宿主声明与平台政策](validation.md#宿主声明与平台政策)定义。

## 重跑与证据

重跑流程以[维护验证](validation.md)为准。A/B 检查使用当前协议且有真实资源差异的两份 CLI；capacity-audit 同样传入两份绝对路径，可用 `/usr/bin/time -l` 记录观测。`AGENT_NOTES_EVIDENCE` 输出逐次矩阵调用证据的方法见[实验记录](validation.md#实验记录)。

当次原始材料的位置如下，均为本地忽略内容，不进入 npm 或提交：

| 材料 | 位置或名称 |
| --- | --- |
| 原始账本 | 仓库根 `.cache/agent-notes-adapter-implementation/` |
| 最终复核日志 | `assurance-final-*` |
| 矩阵调用记录 | `assurance-release-node*.matrix.json` |
| 产物与源码身份 | `assurance-artifacts.json`、`assurance-source-files.json` |
| Node 22 扩展包证据 | `/tmp/agent-notes-assurance-final-extension22/evidence.json` |
| Node 24 扩展包证据 | `/tmp/agent-notes-assurance-final-extension24/evidence.json` |

早期失败保留，包括初期 smoke/路径问题、大 Buffer 深比较导致断言进程内存耗尽、夹具依赖/catalog 构建问题和预期未更新。修正后重跑，未用跳过掩盖失败。
