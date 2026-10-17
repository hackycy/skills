# Goal History Schema

`goal/history/G<n>.md` 是单个已激活 Gate 的简短追溯记录。runbook 保存完整的当前状态；正常执行不依赖历史格式，诊断或专项恢复时按需查阅。

生成标识：`goal-loop/history`。已有文件保留原文，不要求统一标识、措辞或历史布局。

追加记录使用 `G<n>-E<至少4位序号>`，从已有可识别编号的最大值继续；编号不作为运行状态的正确性条件。保存 slice、修改文件摘要、检查 ID 和结果、失败修复摘要、风险、下一动作、Manual acceptance 交接或 Gate pass 事实。常用类型：`initialized`、`slice`、`checkpoint`、`failure`、`verification`、`blocked`、`resumed`、`manual-handoff`、`manual-result`、`gate-passed`、`contract-revised`。

写入保留此前全部字节并追加，合同重新验证也追加说明；既有 slice 和失败修复记录不覆盖。重新激活已有 Gate 时继续其记录。缺少当前检查快照的旧任务，兼容读取只提取恢复当前事实必需的相关检查记录，无法确定时报告缺口。

检查记录可包含：

- `Check`: `D<n>`、`R<n>` 或 `M<n>`；
- `Outcome`: `pass`、`fail`、`started`、`timed-out`、`interrupted`；
- `Evidence fingerprint`；
- `Matched files`；
- Repository `Exit code` 和简短 `Result`。

不保存 event hash chain、完整 stdout/stderr、完整文件清单、对象引用或回滚方案。需要诊断变化文件时由 agent 临时重新运行检查。
