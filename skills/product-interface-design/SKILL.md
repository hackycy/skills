---
name: product-interface-design
description: 为后台、仪表盘、SaaS、数据工具和复杂产品界面建立任务模型、数据模型、操作语法、页面骨架、视觉方向、设计系统与严格评审能力。
disable-model-invocation: true
metadata:
  source: https://github.com/Dammyjay93/interface-design
  upstream-commit: 2f9be3206855bcb2d1d0af262c8bae25cba6658d
  local-variant: admin-workflow-v2
---

# 产品界面设计

为后台、仪表盘、SaaS 应用、运营工具、审批台、数据界面、设置页和复杂交互产品做明确的产品与设计决策。

目标不是把界面做得“整洁、现代、像成熟 SaaS”，而是让它从具体人的任务、数据结构和操作路径自然长出来。视觉工艺仍然重要，但后台体验优先由 **任务流、数据模型、页面骨架、操作效率、状态完整性与密度** 决定。

本 skill 不用于营销页、落地页、活动页或纯品牌设计。

## 模式路由

只加载当前任务真正需要的参考文件：

- **设计或实现**：使用本文件。涉及后台、表格、筛选、批量操作、队列、详情工作区或控制台时，同时读取 [后台交互模式](references/admin-interaction-patterns.md)。
- **设计评审**：读取 [references/design-review.md](references/design-review.md)。评审默认只报告问题，不改代码；用户明确要求修复时才实施。
- **去模板化**：读取 [references/design-deslop.md](references/design-deslop.md)。只做当前范围内可控改进，不改变业务行为。
- **设计系统记忆**：新建系统文件时读取 [references/system-template.md](references/system-template.md)。需要示例时按方向读取对应 examples。
- **后台基准或回归检查**：读取 [references/evaluation-scenarios.md](references/evaluation-scenarios.md)。

## 先读现状

开始前检查现有应用、路由、数据对象、设计 token、组件库、样式约定和 `.product-interface-design/system.md`：

- 已存在系统文件时，把其中的任务模式、页面骨架、密度、视觉方向和组件模式视为约束，除非用户要求改版。
- 不只扫描“有哪些组件”，还要找出当前产品已经形成的交互惯例：筛选方式、详情打开方式、批量操作、保存视图、分页、抽屉、返回上下文等。
- 新界面优先延续稳定模式；已有模式明显损害任务效率时，应指出问题而不是机械复用。

## 决策顺序：先产品，后视觉

后台和工具类界面必须按以下顺序思考：

`Intent → Task Model → Data Model → Page Archetype → Action Hierarchy → Density → State Model → Visual Direction → Craft → Validation`

不得从“选什么颜色、卡片怎么排、侧栏多宽”开始。

## 一、Intent：具体的人、任务和感受

动代码前形成紧凑简报：

- **谁在使用？** 写具体角色与场景；他们五分钟前做什么，五分钟后做什么。
- **必须完成什么？** 用动词表达核心任务，如审核退款、定位故障、清理异常订单、比较渠道表现。
- **应该有什么感觉？** 使用能指导取舍的描述，例如“像工作台一样紧凑”“像控制室一样稳定”“像文档编辑器一样安静”。

上下文足够时直接做合理假设；只有缺失会改变整体方案时才询问。

## 二、Task Model：先画出工作，而不是画页面

对后台、SaaS、数据工具，先回答：

1. 用户最频繁完成的 3 个任务是什么？
2. 每个任务的频率：高频 / 常规 / 低频？
3. 风险：可逆 / 需要确认 / 高风险不可逆？
4. 单条还是批量？
5. 是否需要在多条记录之间比较？
6. 是否需要连续处理下一条，而不是处理完返回列表？
7. 用户成功的信号是什么：处理速度、准确率、覆盖率、异常发现还是决策质量？

把高频、低风险动作放到主路径；把低频、高风险动作降级并增加确认或恢复机制。

## 三、Data Model：让信息结构来自对象关系

识别：

- **核心对象**：订单、客户、告警、部署、付款、内容、工单等。
- **对象主状态**：哪些状态决定用户下一步动作？
- **关键维度**：用户主要扫描、排序、比较或筛选什么？
- **关系**：父子、时间线、归属、依赖、来源、影响范围。
- **变化**：哪些字段需要看当前值，哪些需要看趋势、差异或历史。

字段并不天然拥有展示权。只有帮助用户判断和行动的信息才应稳定露出；其余内容进入详情、展开或按需展示。

## 四、Page Archetype：先选骨架

不要默认“Sidebar + Header + KPI Cards + Table”。根据任务选择页面原型：

### Table-first
适合大量同类对象的扫描、筛选、比较、排序和批量处理。主角是数据表，不是 KPI 卡片。

### Queue
适合审核、客服、风控、moderation、待办。主角是“下一件要处理的事”和处理吞吐，通常需要稳定的优先级、原因、时限和连续处理机制。

### Master-detail
适合从列表快速切换对象，同时保持筛选与上下文。左侧或主区负责扫描，右侧详情负责判断与处理。

### Object workspace
适合围绕单个复杂对象持续工作，如客户、订单、项目、账户。页面围绕对象身份、状态、时间线、关联资源和关键动作组织。

### Console
适合日志、监控、incident、deployment、基础设施工具。高密度、实时、状态驱动，强调快速扫描、时间和异常。

### Builder / Configurator
适合规则、流程、自动化、报表或配置构建。主角是编辑模型和即时反馈，而不是列表。

### Settings
适合低频配置。按影响范围和心智模型分组，避免把所有设置做成相同卡片。

如果一个视图混合多个原型，必须明确哪个是主原型，其他只是辅助区。

## 五、Action Hierarchy：后台的“产品感”主要来自操作语法

对每个视图明确：

- **Primary task**：当前页面最主要完成的任务。
- **Persistent actions**：高频动作稳定可见，不藏进 overflow。
- **Contextual actions**：只有选中、悬停、状态满足或进入详情后才出现。
- **Batch actions**：多选后工具栏应进入 selection mode，明确显示选中数量、作用范围和退出方式。
- **Dangerous actions**：和常规动作分离；根据风险使用 confirm、typed confirmation、undo 或延迟执行。
- **Keyboard path**：高频专业工具应支持合理的键盘路径；不要给所有按钮都加快捷键。

操作层级必须服务频率与风险，而不是视觉对称。

## 六、数据工作流

后台涉及表格、列表或记录管理时，必须决定完整链路：

`Search → Filter → Saved View → Sort → Selection → Batch Action → Row Action → Detail → Return Context`

具体规则读取 [后台交互模式](references/admin-interaction-patterns.md)。最低要求：

- 搜索范围清楚；
- 当前 filter scope 可见、可移除、可恢复；
- 多选后明确进入批量模式；
- row click、checkbox 和 inline action 不互相冲突；
- 进入详情再返回时保留筛选、排序、页码/游标、selection 或 scroll 中对任务有价值的上下文；
- `empty`、`no results`、`permission denied`、`error` 不混成同一种空白状态。

## 七、Density：密度是生产力策略

禁止用一套尺寸覆盖所有产品。选择并写明密度档：

### Compact
高频专业桌面工具。常见控件高度 28–32px，表格行约 28–36px，页面间距紧凑。适合鼠标/键盘密集操作。

### Default
大多数 SaaS 与后台。控件约 32–36px，表格行约 36–44px，在效率与舒适之间平衡。

### Comfortable
低频、表单型或混合输入场景。控件约 40px，区块留白更明显。

### Touch-first
触摸为主时使用约 44px 或更大的目标尺寸。

可访问性目标尺寸与视觉尺寸不是同一概念：小图标可以通过透明命中区扩大点击目标，但相邻目标不得重叠。不要把桌面专业后台机械做成 44px 高的所有控件。

## 八、Focus：一个主任务，不等于一个巨大视觉焦点

每个视图必须有一个 **primary task**，但允许存在多个稳定 **scanning anchors**。

- 详情页、设置页可以有明显单焦点。
- 监控台、交易台、审核台、运营后台往往需要多个并行锚点，例如严重级别、金额、来源、时限、负责人。
- 对这类页面，目标不是制造一个巨大 Hero，而是建立稳定、重复、可预测的扫描路径。

若用户需要连续比较多个对象，稳定对齐比戏剧性层级更重要。

## 九、State Model：状态必须在结构阶段决定

至少考虑：

- loading / skeleton；
- empty；
- no results；
- partial data；
- stale / delayed；
- error；
- permission denied；
- offline / reconnect（适用时）；
- selected / batch mode；
- optimistic / pending / success / failed mutation。

不要等视觉完成后再补状态；状态会直接改变布局和操作。

## 十、产品领域探索

在任务、数据和骨架明确后，再建立视觉方向：

- **领域**：至少 5 个来自产品世界的概念、隐喻或词汇。
- **色彩世界**：至少 5 种自然存在于该领域的颜色、材质或光线。
- **标志性元素**：一个只可能属于这个产品的视觉、结构或交互元素。
- **拒绝默认方案**：列出 3 个此类界面最容易落入的套路，并给出有领域或任务依据的替代。

检验：去掉产品名后，别人仍应能猜出它服务的领域；同时去掉颜色后，别人仍应能看出它服务的任务。

## 十一、视觉层级与构图

### 文字层级

选择比例：高密度界面约 `1.2`，多数产品约 `1.25`，更强调表现力时约 `1.333`。字号、字重、颜色共同建立层级；动态数字使用 `tabular-nums`。

### 空间节奏

不要整页都是相同卡片与相同 gap。高密度控制区、主工作区、辅助信息区必须通过密度和留白形成不同节奏。

### 颜色

强调色是稀缺资源。优先用中性色建立结构，用颜色表达状态、动作、身份和异常。不要用五种浅色装饰业务类别。

### 深度

只选择一种主深度策略：仅边框、轻微阴影、分层阴影或表面色差。优先空间、字重和轻微色调，再考虑边框。

## 十二、设计系统架构

使用三层 token，而不是在“诗意命名”和“通用 gray”之间二选一：

1. **Primitive**：原始色阶与尺寸，如 `slate-950`, `blue-600`, `space-3`。
2. **Semantic**：用途，如 `--text-primary`, `--surface-canvas`, `--status-danger`。
3. **Component**：必要时映射到特定组件，如 `--table-row-selected-bg`, `--filter-chip-border`。

其他规则：

- 文字至少 primary / secondary / tertiary / muted 四层；
- 间距使用 4px 或 8px 基数；
- 圆角按控件 / 容器 / 浮层形成尺度；
- 控件拥有独立背景、边框和 focus token；
- 同一组件不同密度使用明确 variant，不散落随机高度；
- 暗色模式降低语义色饱和度，使用边界和表面亮度而不是黑色重阴影。

## 十三、控件与实现

### 控件：原生 → 现有 primitive → 自行实现

优先原生语义元素；复杂 select、combobox、dialog、popover、tooltip、dropdown、tabs、date picker 优先项目已有组件或成熟 headless primitive。自行实现时补齐键盘、焦点、ARIA、点击外部关闭和滚动锁定。

### 样式：系统 → 组件 → token → utility

先复用项目组件和 variant；第二次真实复用时再抽象。优先语义 token，不复制长 className，不用结构性 hack 修正错误骨架。

## 十四、静态细节与动效

- 交互元素至少有 default / hover / active / focus / disabled；
- 高频键盘操作不要动画；
- 常规 UI 动画通常低于 300ms；
- 只动画 transform 和 opacity，避免 `transition: all`；
- 标题可用 `text-wrap: balance`，正文 `text-wrap: pretty`；
- 图标、数字和文本进行光学校正；
- hover-only 信息必须有键盘与触摸替代路径。

## 十五、实施流程

1. 检查现有应用、设计系统、交互惯例和设计记忆。
2. 写出 Intent、Task Model、Data Model。
3. 选择 Page Archetype，明确 Action Hierarchy、Density、State Model。
4. 涉及后台数据工作流时，完成 Search/Filter/View/Selection/Action/Detail 链路。
5. 完成领域探索与视觉方向。
6. 必要时展示方向样本或参考图，但图像只作为参考，不替代真实实现。
7. 使用现有组件和原语实现。
8. 运行 build、typecheck 和 tests。
9. 对非平凡 UI 做桌面与移动/窄屏视觉验证。
10. 用下面的交付检查迭代，失败则继续改。

写每个非平凡视图前，内部明确：

```text
Intent:        [具体的人、任务、感受]
Task model:    [最频繁的任务、频率、风险、是否批量]
Data model:    [核心对象、状态、关键维度、关系]
Archetype:     [Table / Queue / Master-detail / Workspace / Console / Builder / Settings]
Primary task:  [这一屏真正要完成什么]
Scan anchors:  [用户需要稳定扫到的 3–6 个信息锚点]
Actions:       [persistent / contextual / batch / dangerous]
Density:       [compact / default / comfortable / touch-first]
States:        [本屏必须覆盖的关键状态]
Visual:        [层级、色板、深度、字体、间距]
```

## 十六、交付前检查

### Task Path Test
用户能否快速完成高频任务？是否被迫反复打开 overflow、来回跳页或重新设置筛选？

### Scan Test
不逐字阅读时，是否能稳定定位关键状态、值和动作？列、数值、状态是否对齐且可比较？

### Context Return Test
从详情返回列表后，是否保留对工作有价值的筛选、排序、游标、selection 或 scroll 上下文？

### Batch Test
批量选择后，范围是否清楚、动作是否明确、危险性是否匹配确认级别？

### State Test
loading、empty、no results、error、permission、mutation feedback 是否被正确区分？

### Swap Test
把字体换成默认字体、布局换成标准 dashboard 模板后，如果体验几乎不变，说明关键产品结构仍由默认方案驱动。

### Squint Test
模糊视线后，区域与层级仍可读，但没有边线、卡片或强调色突兀跳出。

### Signature Test
指出至少 5 个具体位置体现产品自身模式，其中至少 2 个必须是结构或交互，而不能只靠颜色和字体。

### Responsive Test
窄屏下无重叠、截断、不可达操作；桌面后台不应为了“响应式”简单把复杂工作流堆成纵向卡片。

## 保存设计记忆

任务完成后询问：“要把这些模式保存给后续会话使用吗？”只有用户同意后才写入 `.product-interface-design/system.md`。

记录：

- 核心使用者、任务模型、关键对象；
- 主页面 archetype 和详情模式；
- 搜索、筛选、保存视图、批量操作与返回上下文约定；
- 密度档、深度策略、字级比例、焦点与扫描锚点模式；
- 颜色 token 三层映射；
- 使用两次以上且值得稳定复用的组件模式；
- 关键状态、视觉参考与标志性交互。
