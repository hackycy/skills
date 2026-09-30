# Upstream basis

本版本以 `Dammyjay93/interface-design` 的当前主分支为骨架。

- Repository: https://github.com/Dammyjay93/interface-design
- Upstream commit: `2f9be3206855bcb2d1d0af262c8bae25cba6658d`
- 核心重构来源: `890d9295acdaf57891a20dc2499abfb4b8529784`
- 上游版本标识: `2026.6.20.1332`

## 保留的上游哲学

- craft-first，而不是组件清单
- Intent First
- Product Domain Exploration
- anti-default / Infinite Expression
- Visual Hierarchy & Composition
- self-contained 主 skill
- native → primitive → hand-roll
- system → component → token → utility
- design-review + design-deslop 两个专项模式

## 本版本有意增加的内容

1. **Product Reasoning**：在视觉方向前理解 working set、locate、judge、act、continue、mode。
2. **Capability Gate**：Search、Filter、Saved View、Table、Batch、Sidebar、Pagination 必须有任务依据，不是后台默认槽位。
3. **Attention strategy**：把“一屏一个焦点”扩展成“一个 primary task + 合适的注意力策略”，允许监控/分诊类界面使用多个 scanning anchors。
4. **Token architecture**：推荐 primitive → semantic → component 三层，避免为了“产品味”滥用诗意 token。
5. **Accessibility correction**：WCAG 2.2 AA SC 2.5.8 为 24×24 CSS px 或满足间距等例外；44×44 属于 Enhanced/AAA 目标，不再把 44px 当所有桌面后台的硬性最低尺寸。
6. **Capability audit**：交付前专门删除无任务依据的后台常见能力。

## 有意没有加入的内容

- 后台 archetype 强制路由
- Search → Filter → Saved View 的线性工作流
- Table-first / Queue / Console 等强制页面模板
- “成熟后台必须具备”的组件清单

原因：这些内容很容易从思考辅助退化为生成模板，导致所有后台再次趋同。
