# 执行术语

Goal Loop 的任务、执行状态与追溯资料使用以下术语。

## 任务与执行

**Effort**：有独立目标、执行顺序和完成条件的一项工作。

**Goal**：用户发送固定 prompt 启动的一次任务。

**Gate**：按顺序执行、具有明确范围和 Exit 的工作单元。

**Slice**：可独立验证并可保存 checkpoint 的一小块工作。

**Check**：Gate 声明的 Directed、Repository 或 Manual acceptance 验证。

**Fingerprint**：标识某次检查所依据的证据内容的摘要。

**Exit**：Gate 的可观察完成条件。

## 任务资料

**Plan**：定义 effort 目标、Gate 顺序、执行边界与验收条件的合同。

**Runbook**：保存 effort 当前执行事实与恢复位置的记录。

**Checkpoint**：当前 Gate 最近保存的恢复状态。

**History**：供诊断、交接和纠正方向时查阅的执行经过。
_避免_：当前状态权威来源。

**Revision**：识别 runbook 是否已被其他执行者更新的并发写入标记。
_避免_：任务版本、skill 版本。

## 执行材料维护

**执行材料**：指导并支持 agent 推进 effort 的提示词、执行规则和工具。

**刷新执行材料**：按用户要求调整执行材料，同时保留 effort 的任务合同、执行事实和历史的维护操作。
_避免_：任务升级、版本迁移、重新初始化任务。
