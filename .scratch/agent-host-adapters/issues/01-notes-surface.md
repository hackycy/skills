# agent-notes 新增 target 的真实改动面与清单兼容边界

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: notes_surface
Parent: ../map.md
Blocked by: none

## Question

固定 agent-notes 0.3.0：以源码、git 历史、现有测试运行和真实 npm 安装量化新增 target 所涉及的文件、函数、测试和文档。用隔离最小补丁或失败复现证明计数，不做估算。实测未知 target、扩展字段/格式、旧 manager/runtime 读新清单、同版本 repair，并区分旧读新与当前测试仅用同实现换版本号的差别。提出保持既有不变量的兼容协议选项。

## Comments

## Answer

研究与可复现实验已完成，见[报告](../research/notes/report.md)及[证据索引](../research/notes/README.md)。隔离分支 `research/host-adapters-notes` 已推送 origin；证据提交 `bbc71c189a72c168a9b5688bca018b98aa1db7ee`。主工作区保留完整副本；产品源码已恢复，未开 PR、未合并。

实测新增虚构静态 target 涉及 7 源码文件、9 具名函数与 3 非具名定义位置（14+/14−）；新增 1 测试文件 5 场景，另核对 6 文档同步点。基线 build 后 277/277，通过真实 npm 0.3.0 bundle/install smoke；合成补丁全套 282/282、typecheck、打包与离线 npm 安装通过。严格清单变体 48 调用均按预期拒绝且零写入；哨兵证明 manager 在 runtime 委派前拒绝未知 target。真实 0.1/0.2/0.3 包矩阵、repair 边界和 prepared SIGKILL 恢复反证已记录。

结论：install/1 保持字段形状并扩 allowlist 可行，但原样旧 0.3.0 不能读取含新 target 清单；先 bridge reader 或复用 agents profile 是不同前置条件。新增 catalog 能力不等于变更已安装 target 集合；现有 init 改集合返回 TARGET_CONFLICT，upgrade --target 返回 INVALID_INPUT。真实 0.1/0.2 与 0.3 尚有布局/配置断点。宿主发现/加载证据与 Agent 主动 context/check 行为分别待验证，未实现桥接或 target-set 迁移。
