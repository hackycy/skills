# Visual Contract（页面视觉契约）

在构图探索后、实现前建立。它只服务当前页面，不要求写入项目，除非用户明确要求保存设计文档。

Visual Contract 的作用，是防止一个不错的设计概念在写 CSS 时悄悄退回通用默认值。

## 建议模板

只填写当前页面真正需要的字段：

```yaml
visual_contract:
  thesis: <一句具体到本页的设计结论>
  use_mode: <task / scan / monitor / browse / read / conversation / form / compare ...>

  continuity:
    inherit:
      - <从已有产品继承的字体/颜色/控件/导航/动效等>
    page_specific:
      - <当前页面确实需要新增的决定>

  viewport_value:
    understand: <首屏必须让用户理解什么>
    act: <首屏是否需要允许动作；不需要可写 none>

  composition:
    lead: <状态/对象/动作/时间/位置/内容/...>
    body: <列表/分组/表单/时间线/阅读流/...>
    action: <常驻/上下文/inline/sticky/none>
    navigation: <继承现有产品，或本页需要的导航>
    attention: <焦点路径或 scanning anchors>

  authored_idea:
    enabled: <true/false>
    reason: <为什么需要或为什么选择克制>
    idea: <仅 enabled=true 时填写>

  expression:
    level: <克制/平衡/强表达>
    density: <稀疏/平衡/紧凑>
    rhythm: <稳定/有变化/编辑感>
    motion: <极少/功能性/表现性>
    atmosphere: [<词>, <词>, <词>]
    bold_area: <表达预算花在哪里>
    quiet_area: <哪里必须安静>

  hierarchy:
    primary: <最重要的内容/任务>
    secondary: <支持内容>
    tertiary: <元数据/chrome>

  typography:
    family: <真实字体栈或 token>
    body_size: <值/token>
    title_size: <值/token>
    metadata_size: <值/token>
    primary_weight: <值/token>
    secondary_weight: <值/token>
    numeric_treatment: <需要时使用 tabular/lining 等>
    line_height: <实际规则>

  color:
    strategy: <中性+强调/tonal/高对比/图像主导/...>
    tokens:
      canvas: <值/token>
      surface: <值/token>
      text_primary: <值/token>
      text_secondary: <值/token>
      accent: <值/token>
      danger: <值/token>
      warning: <值/token>
      success: <值/token>
    semantic_rule: <状态如何不只依赖颜色>

  spacing:
    base: <4px/8px/...>
    screen_gutter: <值>
    section_gap: <值>
    group_gap: <值>
    row_padding: <值>

  surfaces:
    grouping: <留白/divider/card/sheet/...>
    depth_strategy: <none/border-only/tonal/subtle-shadow/...>
    control_radius: <值>
    surface_radius: <值>
    pill_usage: <允许在哪些角色使用>

  imagery_icons:
    imagery: <none/supporting/hero/dominant + 来源策略>
    icons: <项目图标库/线性/填充/自定义几何等>

  interaction:
    feedback: <pressed/loading/selected/...>
    motion_character: <极少/功能性/表现性>

  avoid:
    - <会削弱本页方向的默认套路>
    - <默认套路>
```

## 契约规则

- 选择一个方向，不写“either/or”。
- thesis 必须具体到不能直接复制给另一个无关产品。
- `authored_idea.enabled=false` 是完全合法的成熟结果。
- 如果启用 authored idea，它必须影响理解、结构、状态或交互，而不是纯背景装饰。
- 已有项目 token 能表达方向时优先复用；否则选择真实页面级值，不要只留形容词。
- radius、阴影、卡片、渐变、暗色模式和动效都只是结果，不是默认答案。
- 每个强表达都必须有安静对照区。
- 重设计时保护行为和数据含义，并优先继承仍然合理的产品体系。
