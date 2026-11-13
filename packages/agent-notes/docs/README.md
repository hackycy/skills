# Agent Notes 文档导航

使用 Agent Notes 从[产品概览与入门教程](../README.md)开始。维护本包时，先读[包级维护指南](../AGENTS.md)，再按改动范围选择文档。

## 使用与接入

| 目标 | 阅读入口 |
| --- | --- |
| 从想法形成提案，与 Agent 创建、交付和再次使用 Note | [产品概览与入门教程](../README.md) |
| 安装、验证接入、调整宿主、升级或修复 | [安装指南](installation.md) |
| 查命令、参数、配置、快照与退出码 | [CLI 契约](../assets/references/cli.md) |
| 准备写入材料、处理引用与中断恢复 | [写入与生命周期](../assets/references/writing.md) |
| 查 Note 格式、关系与历史保护 | [文档契约](../assets/formats/document.md) |

## 开发与维护

| 目标 | 阅读入口 | 文档职责 |
| --- | --- | --- |
| 判断产品边界、记录原则与内容归属 | [设计约束与依据](maintainers/design.md) | 解释持续适用的设计选择 |
| 修改安装、投影、所有权或恢复实现 | [安装投影与恢复](maintainers/integrations.md) | 解释模块协作、内部协议与容量计量 |
| 为本次变更选择检查并复现验收 | [维护验证](maintainers/validation.md) | 定义验证流程、验收矩阵和证据要求 |
| 追溯治理原则或更新上游研究 | [上游依据](maintainers/upstreams.md)及[版本锁](maintainers/upstreams.lock.json) | 区分固定来源事实与本包采纳的规则 |
| 查询 2026-11-10 的实际验证结果 | [项目 skill 接入实现验收](maintainers/adapter-validation.md) | 保存特定产物的历史证据与未验证项 |

`installation.md` 是面向使用者的操作指南，`maintainers/` 是仅供仓库维护的材料。历史验收记录只证明当时的产物；本次变更需要哪些检查，以维护验证为准。

本导航和维护材料仅留仓库。README 与安装指南进入 npm 包；`assets/` 中的运行参考、格式和模板还会进入项目 runtime。完整归属规则见[文档内容与分发](maintainers/design.md#文档内容与分发)。
