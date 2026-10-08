---
name: goal-loop
description: 将已收敛的 map、ADR、spec 或 implementation plan 编译为 Gate 计划、可恢复执行记录和供用户跨轮复制的固定提示词；支持合同修订、状态诊断与证据验证。
---

# Goal Loop

用户初始化一次，保存一份固定提示词，之后反复复制同一正文启动 Goal，直到整个 effort 完成。用户不需要选择 Gate、查询 Revision、执行控制命令或获取下一轮提示词；使用说明见 [README](README.md)。

本 skill 将已接受的决策拆成可验收的 Gate 计划，建立、修订或恢复执行记录，并交付固定 prompt。用户发送该正文后，执行 agent 读取最新状态并推进当前 Gate；初始化请求本身不启动实施。已有用户授权持续有效。

工件职责：

- `implementation-plan.md` 定义目标、顺序、范围、切片依据与验收合同。
- `goal/runbook.md` 展示当前状态和恢复点；JSON 提交记录与内容寻址对象是运行事实的权威，history 保存可追溯视图。
- `goal/prompt.md` 是供用户复制的固定正文。计划与 runbook 不引用或依赖它，执行 agent 直接使用用户粘贴的内容。

## 定位与决策收敛

唯一定位用户指定的 effort 和 Git 仓库。读取适用的 AGENTS.md、CLAUDE.md、领域上下文，以及参与范围、验收、约束和回退的 map、spec、ADR、issue。无法定位时报告已检查的位置。

只阻断影响当前 effort 的未解决决策、缺失依赖或未接受 ADR。无关 TODO 不阻止编译。领域上下文提供术语与事实，不单独产生 Gate；已有用户授权持续有效，不把本 skill 作为重复确认的理由。

## 按操作加载

| 操作 | 阅读与执行 |
| --- | --- |
| 编译合同与初始化 | 阅读 [合同编译](references/implementation-plan-schema.md)，编写计划并审查决策覆盖；使用 [控制命令](references/control-script.md) 中的 bootstrap |
| 交付固定提示词 | 阅读 [固定模板](references/goal-prompt-template.md)；bootstrap 冻结正文，按下文交付；复制文件丢失时可运行 recover 恢复原文 |
| 合同或来源变化 | 阅读 [合同修订](references/contract-revisions.md)，预览影响后提交修订 |
| 诊断、恢复、证据核验 | 先读 status；按需阅读 [存储与恢复](references/storage-and-recovery.md)，通过 attempt 或 commit 定位事实 |
| 验证 | 运行 validate；完整性、合同漂移、派生视图分别诊断 |

常规恢复只加载 `status`、`context` 和当前 Gate 所需代码。`context` 提供全局约束、当前合同与 checkpoint；历史按需读取，不默认加载 passed Gate 历史。

## 编译审查

从整体完成标准反推 Gate，每个 Gate 有单一可验证目标和清晰依赖。按 [合同编译](references/implementation-plan-schema.md) 明确范围、slice_policy、验证时机与顺序、回退和人工交接要求；项目具体任务只进入计划。

核对“来源决策 → Gate Exit → 检查 → Evidence inputs”。脚本验证引用完整性；模型检查全部已接受需求是否覆盖、检查是否足以证明实际结果，以及输入是否覆盖代码、测试、配置和依赖清单。适用的集成、回归和兼容性验证应纳入合同。

将领域含义固定为 [术语表](references/glossary.md) 中的对象。运行事实只经控制脚本提交；计划修订走合同修订流程。

## 固定 prompt 与执行边界

模板只替换 effort、Python 和控制脚本的稳定路径，生成文件全部是可发送的指令正文。同一 effort 跨 Gate、checkpoint、人工验收和合同修订复用相同字节，不注入当前 Gate、Revision、attempt ID、进度或项目合同，也不要求执行 agent 再读取 prompt 文件。

执行细节以 [固定模板](references/goal-prompt-template.md) 为准：启动时读取最新状态并锁定 Gate/GateRun；在当前 Gate 内持续完成多个 slice，失败修复后重验，每个稳定 slice 记录进展。Gate 通过后只激活直接后继并结束本轮。人工交接、真实阻塞或预算不足的稳定 checkpoint 也可成为本轮结束点；它们不代表整个 effort 完成。

`goal/prompt.md` 缺失或被改动不影响运行状态有效性；视图刷新和 recover 可从冻结对象恢复原文。冻结对象仍参与完整性校验。更新 skill 只影响新初始化的 effort，已有 effort 保留原 prompt 和记录，不要求升级或重新 bootstrap。

## 完成与验证

使用 Python 3.11+，仅依赖标准库；支持 Windows、Linux、macOS 本地文件系统。明确运行中的 Python 和 skill 脚本绝对路径，路径含空格时传独立参数或正确引用。

初始化后给出实际存在的计划、runbook 和固定 prompt 路径，并在一个可复制代码块中完整输出生成正文，不留待用户替换的占位符。明确说明：“后续每次启动任务，都使用这同一段提示词，直到报告整个 effort 完成。”

修订、恢复或验证后说明结果与实际路径；需要重新交付提示词时输出该 effort 已冻结的原文。每轮执行报告本轮结果、需要的验收或恢复输入，以及是否可以复用原提示词继续，不生成下一轮版本。格式不匹配的目录原样保留，不提供兼容读取、迁移或覆盖。

修改本 skill 时运行：

```text
python -B -m unittest discover -s skills/goal-loop/tests -v
pnpm lint
```

测试覆盖真实 CLI、固定 prompt、状态转换、进程锁、证据绑定和提交中断。另运行 skill frontmatter 验证，手工检查 Markdown/YAML 路径，并按 README 走查同一提示词跨 Gate、checkpoint 和人工验收的使用流程。
