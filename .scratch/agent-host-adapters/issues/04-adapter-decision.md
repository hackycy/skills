# 在现有保证下选择宿主适配抽象层

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: host_capabilities
Parent: ../map.md
Blocked by: 01, 02, 03

## Question

综合证据比较硬编码枚举、声明式 Provider 表、通用路径参数、全矩阵，覆盖维护成本、兼容、测试、UX、安全冲突五维。推荐具体边界及拒绝条件，解释新增同类宿主何时能成为配置变更、何时不能。给出迁移顺序、旧读新及回滚方案、反例和推翻条件。汇总五项材料与可复现入口，逐项审计独立证据。

## Comments

## Answer

三项前置研究均 resolved 后认领并完成汇总审计。五项交付：

1. [决策备忘录](../decision-memo.md)：比较硬编码枚举、包内声明式 profile + 安装投影、通用路径参数、全矩阵的维护、兼容、测试、UX 与安全冲突；推荐 seam 在 distribution 安装投影，而非 Notes 领域或宿主事件模型。推荐是设计推断，尚未实现或采纳。
2. [宿主能力矩阵](../research/hosts/report.md)：逐格 skills/入口/导入/commands/hooks/plugins/scope，区分 host/client/profile 与 D/C/I/A；当前能力是 2026-11-10 observed，不追溯为 Impeccable 4.8.2 发布时状态。
3. [实验与失败矩阵](../experiment-matrix.md)：固定 npm/ZIP/engine、隔离安装、离线、权限、并发、中断和恢复；I-install/I-discovery 与 A 分开，并附报告及 runner。
4. [新增 target 改动面与兼容方案](../research/notes/report.md)：实测 7 源码文件/9 具名函数/3 定义位置，严格旧 reader、委派前拒绝、bridge 条件、target-set 不可变与真实历史布局断点；桥接/回滚是有前提方案，未实现验证。
5. [反例、缺口与可证伪性](../falsifiability.md)：逐条推翻条件、证据等级与独立性限制、平台和 A 层未验证项，以及最小后续证据包。

审计修订只限以上父汇总的 decision-memo.md、experiment-matrix.md、falsifiability.md：

- profile 复用须同时核对具体 host/client/version 的技能发现、常驻入口加载语义和 scope，skills/list 不能单独作为完整接入证明。
- alias 只可能进入新 CLI；原样 0.3.0 parser 不会新增拼写，旧工具仍传既有 --target agents/claude。真正新 profile 仍需 reader/writer 发布治理，不能靠新 runtime 越过旧 manager 校验。
- 任何一个必须支持的宿主需要事件/hooks 才能履行要求，就足以重新讨论推荐范围；不设任意的“两宿主”门槛。
- 将“入口被加载”明确为“入口加载协议（未实测入口加载）”；所有 A 未测，闭源宿主单一官方来源和 Codex D 站点 timeout 保留。
- 已复核研究者用固定公钥独立验证 Impeccable bundle 的 Ed25519 envelope/size/hash；本地 override 安装不等于 CLI 远程下载/验签端到端。engine 仅按发布 manifest 校验 hash，不混写为签名验证。

固定源码、真实发行物和独立进程实验与推荐没有发现需改变产品范围的矛盾。没有新增实验、没有改产品源码，没有改 map，也没有为这次汇总向 hosts research 分支追加提交。最终运行 [verify-research.py](../verify-research.py) 检查相对文件链接与 JSON；该检查不冒充事实审查或 A 层验证。剩余 unknown/A/平台缺口均定位为后续正式支持承诺的验证门槛，非本轮研究任务未完成。父任务负责主汇总发布/保留。
