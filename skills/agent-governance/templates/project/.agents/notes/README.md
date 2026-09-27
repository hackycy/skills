# Agent Notes

Agent Note 是给未来工程师和 Agent 阅读的长期 RFC/ADR 类决策记录。它保存“为什么这样决定、认真考虑过什么替代方案、付出了什么代价”，也就是源码和普通文档很难长期表达的部分。

它不是实现日记、聊天记录、任务日志、changelog，也不是当前系统文档的替代品。

## 语言与文件模型

每个 Agent Note 只维护一个 Markdown 文件：

```text
.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic.md
```

正文默认使用简体中文。不创建英文副本、`.zh.md` 或 `.i18n.yaml`，也不存在翻译同步流程。

为了机械校验，文件中的 `Status:` 使用固定机器值：`proposed`、`implemented` 或 `rejected`。正文标题和内容使用中文。

## 什么时候应该写

当一个变化产生未来仍可能被重新审视的长期 rationale 时，创建或更新 Agent Note。常见场景包括：架构边界、持久数据/协议语义、兼容性选择、安全与信任规则、ownership、重要行为权衡、CI/发布/工具链政策、测试策略，以及明确移除某项长期维护能力的 simplification。

纯机械重构、常规依赖升级、细小 UI 调整、没有长期权衡的明显 bug 修复，以及已经能从源码/测试直接看清的实现流水账，通常不需要单独 Note。

## 生命周期

- `proposed`：长期决策仍未解决。
- `implemented`：决策已经交付并仍是当前 authority。
- `rejected`：被拒方案仍值得作为未来 guardrail 保留。
- `archived`：冻结历史证据，不再是当前 authority。

## 分类

分类是封闭集合：

- `feature`：面向用户或模型的新能力决策。
- `bug-fix`：具有长期教训的重大缺陷、事故或行为修复。
- `simplification`：有意删除/缩小长期维护的行为或表面积。
- `architecture`：源码/运行时边界、ownership、协议、存储和结构性决策。
- `process`：CI、发布、工具链、vendoring、工作流和仓库政策。
- `testing`：测试架构、策略、fixture、可靠性和 coverage policy。

## 新建 Note 前的 supersession 检查

先搜索活跃 Note 中与当前决策、关键机制、路径/symbol、ownership boundary 和被拒替代方案相关的记录，然后判断：

- 独立补充：两者都保持活跃；
- 部分替代：两份 Note 都保留，并明确交叉链接适用边界；
- 完全替代：新的 Note 成为当前 authority，旧记录按实际价值转 archive、rejected 或删除；
- 重复：优先更新已有当前权威，而不是制造第二份等价 Note。

## 推荐结构

`proposed`：

- `## 问题`
- `## 提案`
- `## 考虑过的替代方案`
- `## 验收标准`
- `## 风险`

`implemented`：

- `## 问题`
- `## 决策`
- `## 考虑过的替代方案`
- `## 后果`
- `## 验证`

`rejected`：

- `## 问题`
- `## 提案`
- `## 拒绝原因`
- `## 考虑过的替代方案`

`archived` 保留 implemented 结构，并在 `Status: implemented` 下加入：

```text
Archived: YYYY-MM-DD
```

## 写作边界

保留可审阅的工程 rationale、机制、替代方案、后果、验证证据和明确的 coverage gap。不要保存 chain-of-thought、聊天过程、逐步尝试日志或已经失效的执行计划。

implemented Note 应描述系统现在如何工作，以及为什么仍采用这个决策。实现路径、symbol、默认值或验证证据变化时可以刷新事实引用；但如果决策本身反转，应新建 superseding Note，而不是悄悄把旧记录改成相反结论。
