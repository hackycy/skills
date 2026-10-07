---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为可修订的 Gate 合同、可恢复执行记录、检查尝试和证据快照；支持合同修订、状态诊断与恢复。
---

# Goal Loop

把已接受的决策编译成跨 Goal 的执行协议。模型判断语义，控制脚本约束状态、检查尝试和证据；Gate 限定执行范围，稳定 slice 提供恢复点。

本 skill 建立、修订、诊断或恢复执行控制面。实施 Gate 使用生成的 `goal/prompt.md`，建立控制面本身不授权实施 Gate。

## 定位与决策收敛

唯一定位用户指定的 effort 和 Git 仓库。读取适用的 AGENTS.md、CLAUDE.md、领域上下文，以及参与范围、验收、约束和回退的 map、spec、ADR、issue。无法定位时报告已检查的位置。

只阻断影响当前 effort 的未解决决策、缺失依赖或未接受 ADR。无关 TODO 不阻止编译。领域上下文提供术语与事实，不单独产生 Gate；已有用户授权持续有效，不把本 skill 作为重复确认的理由。

## 按操作加载

| 操作 | 阅读与执行 |
| --- | --- |
| 编译合同与初始化 | 阅读 [合同编译](references/implementation-plan-schema.md)，编写计划并审查决策覆盖；使用 [控制命令](references/control-script.md) 中的 bootstrap |
| 生成执行入口 | bootstrap 同时冻结 prompt；只需恢复派生入口时运行 recover，不重新编译合同 |
| 合同或来源变化 | 阅读 [合同修订](references/contract-revisions.md)，预览影响后提交修订 |
| 诊断、恢复、证据核验 | 先读 status；按需阅读 [存储与恢复](references/storage-and-recovery.md)，通过 attempt 或 commit 定位事实 |
| 验证 | 运行 validate；完整性、合同漂移、派生视图分别诊断 |

常规恢复只加载 `status`、`context` 和当前 Gate 所需代码。`context` 提供全局约束、当前合同与 checkpoint；历史按需读取，不默认加载 passed Gate 历史。

## 编译审查

核对“来源决策 → Gate Exit → 检查 → Evidence inputs”。脚本验证引用完整性；模型负责判断检查是否足以证明 Exit，以及输入是否覆盖代码、测试、配置和依赖清单。机器无法从一组通过结果推断需求覆盖充分。

将领域含义固定为 [术语表](references/glossary.md) 中的对象。运行事实只经控制脚本提交。JSON 提交记录与内容寻址对象为权威；runbook、history、state、baseline 和 prompt 均为派生视图。

## 执行约束

- D/M 检查先 start 固定待验对象和快照，再观察或交接，最后 finish；R 检查由 check run 从合同执行。
- 每个结果属于具体 attempt。过期、失败、取消或中断不会恢复先前通过结果；恢复通过需要另一次检查。
- 人工验收 pending 时结束当前 Goal，不等待、不轮询。收到对应 attempt 的明确结果后继续。
- 合同漂移时停止实现；诊断、取消、恢复和合同修订仍可执行。
- Gate pass 只激活直接后继，然后结束当前 Goal。重新打开 Gate 保留代码与历史，不自动回滚实现。
- 直接描述具体对象、字段和可观察行为；避免依赖重构阶段或发布时间的相对名称。

## 完成与验证

使用 Python 3.11+，仅依赖标准库；支持 Windows、Linux、macOS 本地文件系统。明确运行中的 Python 和 skill 脚本绝对路径，路径含空格时传独立参数或正确引用。

每次操作后说明完成了编译、修订、恢复还是验证，并给出实际存在的入口与结果路径。格式不匹配的目录原样保留；不提供兼容读取、迁移或覆盖。

修改本 skill 时运行：

```text
python -B -m unittest discover -s skills/goal-loop/tests -v
pnpm lint
```

测试覆盖真实 CLI、状态转换、进程锁、证据绑定和提交中断；三平台 CI 执行同一测试集。手工检查 Markdown/YAML 路径。
