# Agent 宿主适配架构研究

本研究已交付，结论是：将宿主差异集中在 `distribution` 的可信、随包固定的安装 profile 描述与安装投影 Module；保留既有 Notes 模型、项目 runtime 锁定、Result、精确所有权清单和事务。新增同类宿主可以是配置增量，新语义仍需代码。原样 0.3.0 读懂新 target、现有项目 target-set 切换，都不能由 Provider 表自动获得。

状态为研究推荐，未采纳为产品决定，未实现适配层。日期 2026-11-10，具体基线与 hash 见 [baseline.json](baseline.json)。

## 五项交付

| 交付 | 内容 |
| --- | --- |
| [决策备忘录](decision-memo.md) | seam、四方案五维比较、推荐、代价、迁移及拒绝条件 |
| [宿主能力矩阵](research/hosts/report.md) | 六宿主、Copilot 各客户端、.agents/.claude profiles，逐格来源/置信度；D/C/I/A 分层 |
| [实验与失败矩阵](experiment-matrix.md) | 离线、缓存/源损坏、部分写入、并发、权限、中断、旧读新、平台；链接可重跑命令 |
| [新增 target 改动面与兼容方案](research/notes/report.md) | 实测七源码文件、九具名函数、三个定义位置、五新增测试场景、六文档同步点、真实旧包矩阵 |
| [反例、缺口与可证伪性](falsifiability.md) | 会改变推荐的证据、未验证假设、独立证据不足格及后续支持门槛 |

[Wayfinder 地图](map.md)与四个具名 research 票据保留调查决策脉络；详情只由各报告持有。推荐的交叉审计在[选择宿主适配抽象层](issues/04-adapter-decision.md)。

## 复跑与证据

- [Notes 证据索引](research/notes/README.md)：固定 npm 包、源码测试、strict/synthetic/compat runner；synthetic 会改实验源码，必须在可丢弃 worktree 跑。
- [两 CLI 对照报告](research/failures/report.md)：固定 URL/checksum prepare + artifact 故障 runner；真实执行要求 Darwin arm64 与 sandbox-exec，不伪装跨平台结果。
- [宿主来源与发现](research/hosts/report.md)：官方网页及固定源码 fetch/probe/discover/summarize；runner 可指定 cache，缺 executable 明确跳过，不调用模型。
- [验证范围](validation.md)、[脚本语法检查](syntax-validation.json)、[相对链接与 JSON 检查器](verify-research.py)。

完整 argv/cwd/env/stdout/stderr/退出码/树hash与diff的记录、原始日志位置和hash均在各报告/结果中。大 ZIP、engine、网页与部分原始stdout保留在忽略 cache；第三方可由固定版本脚本重建。live网页重抓形成新快照，不能保证重建当日页面字节。

## 研究分支

按 wayfinder 使用临时研究分支，无 PR、不合并。工作区保留可读副本。

| 子研究 | 固定证据提交 |
| --- | --- |
| [Notes 改动面](https://github.com/hackycy/skills/tree/research/host-adapters-notes) | bbc71c189a72c168a9b5688bca018b98aa1db7ee |
| [安装与故障](https://github.com/hackycy/skills/tree/research/host-adapters-failures) | 4e68a731ef043d8c1f5fdb0ca26f756caad89f9f |
| [宿主能力](https://github.com/hackycy/skills/tree/research/host-adapters-hosts) | 5069079dc1295129891d405e9c59516db4b28b93 |

本地 `.scratch/agent-host-adapters/` 是当前完整研究包；全部汇总与子研究副本另保存在 `research/host-adapters-synthesis`，同为不合并的证据分支。
