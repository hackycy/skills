# 设计评审

评审后台和产品界面时，同时检查 **任务效率、信息结构、操作语法、状态完整性与视觉工艺**。标准不是“布局成立”，也不是“看起来像某个成熟 SaaS”，而是：高频任务是否被产品结构真正支持，视觉是否让判断更快、更稳。

默认只报告问题，不修改代码。用户明确要求修复时才进入实施。

## 第一步：范围与意图

确定：

- 评审对象；
- 核心使用者与主要任务；
- 核心对象和状态；
- 当前页面 archetype；
- `.product-interface-design/system.md` 中已确定的约束。

如果无法判断，声明最小假设，不用通用审美代替产品意图。

## 第二步：Task Flow Lens

优先回答：

- 用户进入后 5 秒内是否知道下一步？
- 高频动作是否稳定可见，还是被藏进 overflow？
- 批量任务是否真的能批量完成？
- 搜索、筛选、排序和保存视图是否形成稳定工作集？
- 进入详情再返回时，筛选、排序、selection、scroll 是否保持？
- 危险动作的确认强度是否匹配风险？
- 是否存在“为了看一个字段不断跳页”的结构性摩擦？

任何会让高频任务重复付出额外步骤的问题，优先级高于圆角、阴影和细节审美。

## 第三步：Information & Scan Lens

- 当前视图的 primary task 是什么？
- 用户需要稳定扫描的 3–6 个 anchors 是什么？
- 状态、数值、时间、身份是否形成稳定对齐？
- 是否把数据库字段平铺成 UI，而不是根据信息价值重组？
- 列表是否真正支持比较，还是每行都是独立卡片？
- 监控/控制台是否拥有稳定异常信号，而不是大 Hero 数字占据注意力？

## 第四步：Archetype & Interaction Lens

检查当前骨架是否匹配任务：

- Table-first 是否被 KPI 卡片挤压主空间？
- Queue 是否体现优先级、原因、SLA 和连续处理？
- Master-detail 是否减少来回跳页？
- Object workspace 是否围绕对象身份、状态、关联和时间组织？
- Console 是否支持高密度扫描、实时变化和异常定位？
- Settings 是否按影响范围与心智模型分组，而不是统一卡片化？

涉及数据工作流时，核对 `Search → Filter → Saved View → Sort → Selection → Batch → Row Action → Detail → Return Context`。

## 第五步：State Lens

检查：loading、empty、no results、partial、stale、error、permission、selected/batch、pending mutation、success/failure 是否被正确区分。

缺少关键状态会使真实产品在边界情况下立即退化，应视严重程度定级。

## 第六步：Visual Craft Lens

### 层级

不是机械要求“一个巨大焦点”，而是检查一个 primary task 是否清楚、scanning anchors 是否稳定。次要动作与元数据应降级。

### 字体与颜色

字号、字重、颜色共同形成层级。动态数字使用 tabular nums。强调色用于状态、动作和身份，不用于装饰。

### 表面与深度

深度策略一致；边框安静；侧栏与画布不形成两个割裂世界；嵌套圆角合理。

### 构图与密度

密度是否被明确选择为 compact / default / comfortable / touch-first？控制区与内容区是否有节奏？桌面后台是否因追求“卡片感”浪费大量空间？

### 细节与动效

交互状态完整；点击目标合理；高频操作避免多余动画；popover / dialog / drawer 方向与触发上下文一致。

## 第七步：Implementation Lens

- 是否复用项目组件与可访问 primitive；
- 是否存在 `<div onClick>`、不完整自制 select/dialog；
- 是否存在负 margin、escape-hatch calc、absolute positioning 修骨架；
- 是否使用 primitive → semantic → component token，而不是散落硬编码；
- 是否重复复制长 className 或 variant。

## 定级

### 阻断

明显损害核心任务或让结构无法成立，例如：

- 高频任务需要重复无价值步骤；
- 列表/详情来回丢失上下文；
- 批量处理缺失或作用范围不明确；
- 队列没有优先级与处理语法；
- 页面 archetype 与任务错配；
- 无法扫描比较；
- 关键状态缺失；
- 不可访问的自制复杂控件；
- 视觉层级完全平坦或结构严重泛化。

### 应修复

真实体验或工艺缺口，但不阻断主要任务，例如次要动作层级、列宽、默认排序、单个状态反馈、边框/字距/密度不一致。

### 提示

影响轻微，只提一次，不扩展成愿望清单。

## 报告格式

按以下顺序：

1. Task flow；
2. Information / scan；
3. Archetype / interaction；
4. State；
5. Visual craft；
6. Implementation。

每条发现说明：**当前行为或默认值是什么 → 如何损害任务或辨识度 → 应作出的具体产品/设计决定**，并引用文件与行号。

最后给出明确结论：批准或不批准。

## 批准标准

必须同时满足：

- 高频任务路径短而稳定；
- 搜索、筛选、选择、批量操作、详情与返回上下文逻辑清楚；
- archetype 与任务匹配；
- scanning anchors 稳定，能快速比较；
- 状态模型完整；
- 密度明确且适合输入方式；
- 视觉层级、字体、颜色、深度和节奏执行一致；
- 使用现有组件和可访问原语；
- 不像通用 AI dashboard，也不是靠装饰制造差异。
