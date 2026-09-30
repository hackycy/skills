# 移动 H5 技术规则

这些规则用于保护移动端可用性，不规定一种统一视觉风格。

## Viewport

独立 HTML 应包含等价设置：

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

以手机为第一目标。

390px 可以作为常用首轮评审宽度，再检查约 375px、430px 和真实目标设备。

**不要**把页面实现成固定 `width: 390px` 的画布。

## 高度与 safe area

适用时优先动态 viewport 单位：

```css
min-height: 100dvh;
```

内容贴近设备边缘时考虑：

```css
padding-bottom: env(safe-area-inset-bottom);
padding-top: env(safe-area-inset-top);
```

如果宿主 App 已经处理 safe area，不要重复叠加。先检查项目上下文。

## 触控

交互目标通常应提供约 44px 的可用触控区域，即使可见图标更小。这是移动端人体工学经验，不要把它误写成所有场景的固定视觉高度。

- 不依赖 hover 承担关键功能；
- 提供可见 pressed / active / selected 状态；
- 扩大 hit area 时不要让相邻区域重叠；
- 高频动作要考虑拇指位置和底部固定 chrome 占用。

“控件够大”不代表它位置合理。

## 首屏

产品页首屏优先展示有任务价值的上下文、内容、状态或动作。

不要把首屏浪费在：

- 空 hero；
- 过大的页面标题；
- 比数据本身更抢眼的筛选 chrome；
- 推迟真实任务的品牌装饰。

例外必须有产品理由。

## 字体

字体尺度来自 Visual Contract，不使用一套固定“移动端字号模板”。

确保：

- 主要文字在手机距离可读；
- 次要元数据不至于过小；
- 中英文混排有合理行高；
- 长标签有明确 wrap / truncate；
- 比较型数字稳定对齐；
- 动态数字需要时用 tabular numerals。

外部字体不可靠时默认系统字体，并提供合理 fallback；核心 UI 不应被字体加载阻塞。

## 布局

优先正常文档流、Grid 和 Flexbox，再考虑 absolute positioning。

避免：

- 意外横向滚动；
- 把桌面多栏硬塞进手机；
- 动态文本区域固定高度；
- 不必要的 fixed 元素争抢首屏空间；
- 浮动主按钮遮挡列表；
- 用负 margin / `calc()` hack 逃离错误父布局。

如果使用底部导航或 sticky action，要为正文留出底部空间，避免最后一段内容被遮挡。

横向滚动可以用于确实适合的 chip row / carousel，但不能拿来掩盖页面 overflow。

## 表单与软键盘

尽量使用正确 input type 和 autocomplete。

确保：

- 输入后 label 仍然清楚；
- 错误靠近对应字段，且不只依赖颜色；
- relevant 时有 disabled / loading / submitting；
- sticky submit 尽量不遮住键盘上方焦点字段；
- 多步骤表单保存上下文和进度；
- 高风险提交提供匹配风险的确认。

不要为了样式一致性，用不可访问的自制控件替代原生/成熟 primitive。

## 列表和重复记录

根据内容选择开放列表、分组行、卡片或类表格式对齐。

不要默认每条记录都是浮动卡片。

高频运营列表应优化扫描：

- 标识位置稳定；
- 状态靠近它修饰的对象；
- 行结构可预测；
- separator 克制；
- 高优先级状态无需打开详情即可看到；
- 行操作不和数据本身竞争注意力。

## 导航

按任务需要使用移动端合适模式，例如：

- 深层流程中的返回；
- 3–5 个高频顶层目的地的底部导航；
- 同级视图的 tabs / segmented controls；
- 上下文选择的 bottom sheet。

这些只是例子，不是功能清单。

不要把桌面侧栏压进手机，除非产品上下文确实需要。

底部导航也不是默认答案。短流程可能只需要 back / close 和必要动作。

## Sticky / Fixed UI

固定区域在手机上成本很高，因为它永久占 viewport。

只有在“持续可见确实节省重复操作”时使用，例如：

- 顶层导航；
- 高频动作；
- 关键上下文；
- 用户滚动时会反复使用的控制区。

检查：

- safe area；
- 键盘行为；
- 内容 padding；
- stacking；
- nested scroll container。

## 颜色与可访问性

关键状态不能只靠颜色。

保持足够文字/背景对比。高风险、运营和关键操作优先可读性，不要为了“高级灰”牺牲识别。

focus-visible 在移动 Web 也重要，因为键盘、switch control、辅助技术和桌面测试可能使用同一界面。

## 动效

简单 H5 动效优先 CSS transition / animation。

动效应该解释：

- 因果；
- 层级；
- 连续性；
- 状态变化。

高频任务页除非表示实时状态，不使用持续动画。

避免 `transition: all`。

支持 reduced motion：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## JavaScript

只实现需求或当前流程真正暗示的交互。

例如 filter、tab、toggle、menu/sheet、表单校验、loading/submitting demo 都**只是可能的例子，不是必须覆盖的功能清单**。

demo 数据应足够独立，方便后续接后端。

不要为了纯视觉效果引入重依赖。

## 已有框架

在现有 App 中：

- 复用路由和状态模式；
- 优先项目已有可访问组件；
- 不为一页替换技术栈；
- 保护 API 契约；
- 保护可访问性和键盘行为；
- 已有 semantic token 能表达方向时优先复用。

已有组件是工具，不是保留错误构图的理由。
