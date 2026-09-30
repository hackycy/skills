# 参考与启发来源

本 skill 为原创实现，设计思路受到以下公开资料启发：

- Anthropic 的 `frontend-design` Agent Skill：强调面向具体上下文和主题的视觉方向、审慎的字体/构图选择，以及避免模板化默认值。
  https://github.com/anthropics/skills/tree/main/skills/frontend-design

- Google Labs Code 的 `stitch-skills`：使用 `SKILL.md`、resources、examples、scripts 组织 Agent Skill，以及用 atmosphere、density、variance、motion、typography、layout、anti-patterns 等语义维度控制设计。
  https://github.com/google-labs-code/stitch-skills

- `impeccable`：渲染后视觉评审、craft-floor 思路，以及把确定性检测器作为设计推理补充而不是替代。
  https://github.com/pbakaus/impeccable

此前 v2 工作流也复用并调整了本仓库 `product-interface-design` 中的一些原创设计推理模式，尤其是领域探索、signature 概念和反模板评审测试。

当前优化版进一步弱化了“强制 signature”和固定设计流程带来的模板化风险，并加入产品连续性判断。

本包没有直接 vendoring 外部 source skill 文本。说明、示例、resources 和 validator 均为针对 mobile-first H5 生成场景编写的实现。
