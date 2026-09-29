# 产品界面设计系统

## 产品模型

**核心使用者：** [具体角色与场景]

**高频任务：** [最多 3 个]

**核心对象：** [订单 / 客户 / 告警 / 工单 / ...]

**关键状态：** [决定下一步动作的状态]

**主要成功指标：** [速度 / 准确率 / 覆盖率 / 决策质量 / ...]

## 页面模式

**主 archetype：** [Table-first | Queue | Master-detail | Object workspace | Console | Builder | Settings]

**详情模式：** [Full page | Drawer | Split view | Inline expand]

**Primary task：** [这一屏真正要完成的任务]

**Scanning anchors：** [3–6 个稳定扫描点]

## 数据工作流

**Search 范围：** [当前表 / 对象 / 全局]

**Filter：** [常驻维度 / 高级筛选 / 当前 scope 展示]

**Saved views：** [无 | 个人 | 共享]

**Selection：** [当前页 / 全部结果 / 不支持]

**Batch actions：** [动作及风险]

**Row actions：** [常驻 / hover / overflow]

**Return context：** [filter / sort / cursor / scroll / selection]

## 方向

**性格：** [精密与密度 | 温暖与亲和 | 精致与信任 | 大胆与清晰 | 实用与功能 | 数据与分析]

**底色：** [暖 | 冷 | 中性 | 染色]

**深度：** [仅边框 | 轻微阴影 | 分层阴影 | 表面色差]

**密度：** [compact | default | comfortable | touch-first]

**标志性元素：** [至少包含一个结构或交互层的产品特征]

## Token

### Primitive

```css
--slate-950: ...;
--slate-700: ...;
--blue-600: ...;
--space-1: 4px;
--space-2: 8px;
```

### Semantic

```css
--text-primary: var(--slate-950);
--text-secondary: ...;
--surface-canvas: ...;
--surface-raised: ...;
--border-subtle: ...;
--action-primary: var(--blue-600);
--status-danger: ...;
```

### Component

仅在组件确实需要独立控制时定义：

```css
--table-row-selected-bg: ...;
--filter-chip-border: ...;
--input-focus-ring: ...;
```

### 间距

基数：[4px | 8px]

尺度：[4, 8, 12, 16, 24, 32, 48, 64]

### 圆角

控件：[值]

容器：[值]

浮层：[值]

### 字体

字体：[具体字体及回退]

字级：[值]

字重：[400, 500, 600]

比例：[1.2 | 1.25 | 1.333]

数字：`tabular-nums`

## 组件模式

### [组件名称]

- 密度 variant：[compact/default/...]
- 高度：[值]
- 内边距：[值]
- 圆角：[值]
- 字体：[字号/字重]
- 状态：[default/hover/active/focus/disabled/loading/...]
- 用途：[何时使用]

## 决策

| 决策 | 理由 | 日期 |
|---|---|---|
| [选择] | [它如何服务任务、数据或产品世界] | YYYY-MM-DD |
