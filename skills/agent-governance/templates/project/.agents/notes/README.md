# Agent Notes

Agent Note 是给未来工程师和 Agent 阅读的长期 RFC/ADR 类决策记录。它保存源码、测试和普通文档很难长期表达的部分：**为什么这样决定、认真考虑过什么替代方案、付出了什么代价，以及什么证据证明它已经成立**。

它不是实现日记、聊天记录、任务日志、changelog、事故复盘，也不是当前系统文档的替代品。

## 文件模型

每个 Agent Note 只维护一个 Markdown 文件：

```text
.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic.md
```

正文默认简体中文；文件名 topic 使用英文小写 kebab-case。机器字段使用固定英文键。新 Note 模板包含 `REQUIRED` 占位符，在真实内容填写完成前 verifier 会故意失败，防止空壳 Note 进入主分支。

规范 header：

```text
# Agent Note: <标题>

Status: proposed|implemented|rejected
Scope: <稳定英文 scope>
Supersedes: none | .agents/notes/...,.agents/notes/...
Related: none | .agents/notes/...,.agents/notes/...

## 问题
```

`Scope / Supersedes / Related` 是新 Note 的推荐结构化元数据；旧 Note 可以没有这些字段。关系路径使用 repo-relative `.agents/notes/...`，这样 lifecycle 移动不会改变引用语义。

## 生命周期

- `proposed`：长期决策仍未解决。
- `implemented`：决策已经交付并仍是当前 authority。
- `rejected`：被拒方案仍值得作为未来 guardrail 保留。
- `archived`：不再是当前 authority、但有历史价值的冻结证据。

生命周期转换必须同时调整路径、`Status:` 和正文语义。`proposed → implemented` 需要把未来式 Proposal 改写为当前事实 Decision，并用真实 Consequences/Verification 替代计划式内容。

## 分类

分类是封闭集合：`feature / bug-fix / simplification / architecture / process / testing`。taxonomy 属于 verifier 和框架 manifest 的 canonical contract，不能通过手工修改 `framework.json` 扩展。

## 什么时候应该写

适合记录：架构边界、模块 ownership、协议或持久化语义、兼容性与安全规则、重要行为权衡、CI/发布/工具链政策、测试策略，以及明确删除长期维护能力的 simplification。

通常不记录：纯机械重构、常规依赖升级、局部 UI 调整、没有长期取舍的简单 bug 修复、已能从源码/测试/普通文档直接看清的事实。

## Supersession

新建或修改 Note 前，按主题、关键机制、路径/symbol、ownership boundary、Scope 和被拒替代方案搜索活跃记录：

- **独立补充**：双方继续活跃；
- **重复 authority**：优先更新已有 Note；
- **部分替代**：双方保留，并通过正文/`Related` 明确适用边界；
- **完全替代**：新 Note 成为当前 authority；旧 Note 依据未来价值保持活跃、归档、拒绝或删除，并通过 `Supersedes` 保留关系。

机器只能校验关系目标存在、自引用等结构问题；“是否真的 supersede”仍是工程语义判断。

## 生命周期骨架

`proposed` 必需章节顺序：`问题 → 提案 → 考虑过的替代方案 → 验收标准 → 风险`。

`implemented`：`问题 → 决策 → 考虑过的替代方案 → 后果 → 验证`。不得出现提案/计划/迁移计划/验收标准等 proposal-era H2。

`rejected`：`问题 → 提案 → 拒绝原因 → 考虑过的替代方案`。

允许在必需章节之间插入真正有用的技术章节，但 H2 标题不得重复。verifier 会忽略 fenced code block 内的伪 heading，并检查 header 唯一性、章节顺序、内容非空、占位符、关系和活跃 Note 的相对 Markdown 链接。

## Archive：冻结而不是“旧目录”

`archived` 保留 implemented 结构，并在 `Status: implemented` 下一行加入：

```text
Archived: YYYY-MM-DD
```

只能使用：

```bash
python3 .agents/scripts/archive_agent_note.py \
  .agents/notes/implemented/architecture/YYYY-MM-DD-topic.md \
  --root .
```

归档脚本会：检查源 Note、阻止仍有活跃入站引用的归档、移动到 `archived/<class>/`、加入 `Archived` 日期，并在 `archived/manifest.json` 中记录 SHA-256 seal。归档后任意正文改写都会使治理检查失败。不要手工重新 seal 被改写的历史。

## 知识路由

- **Agent Note**：长期决策 rationale 和 alternatives。
- **源码/测试/docs**：当前行为与 API 事实。
- **postmortem**：真实事故如何发生、为何测试/review/监控没拦住、增加了什么 guardrail。
- **upgrade/migration guide**：用户或下游需要执行的 breaking-change 迁移步骤。

同一事实尽量只有一个 owner；其他地方用链接，不要复制整段事实。

## 必跑校验

```bash
python3 .agents/scripts/governance_check.py --root .
```

它聚合 Note 格式、链接、taxonomy、archive seal 和 framework 本地完整性，适合作为 CI contract。
