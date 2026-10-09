# Goal History Schema

`goal/history/G<n>.md` 是单个已激活 Gate 的简短追溯记录。它不参与默认状态重放，runbook 才是当前状态权威来源。

Schema: `goal-loop/history-v2`

每条记录使用连续 `G<n>-E<4位序号>`，保存 slice、修改文件摘要、检查 ID 和结果、失败修复摘要、风险、下一动作、Manual acceptance 交接或 Gate pass 事实。允许类型：`initialized`、`slice`、`checkpoint`、`failure`、`verification`、`blocked`、`resumed`、`manual-handoff`、`manual-result`、`gate-passed`、`contract-revised`。

检查记录可包含：

- `Check`: `D<n>`、`R<n>` 或 `M<n>`；
- `Outcome`: `pass`、`fail`、`started`、`timed-out`、`interrupted`；
- `Evidence fingerprint`；
- `Matched files`；
- Repository `Exit code` 和简短 `Result`。

不保存 event hash chain、完整 stdout/stderr、完整文件清单、对象引用或回滚方案。需要诊断变化文件时由 agent 临时重新运行检查。
