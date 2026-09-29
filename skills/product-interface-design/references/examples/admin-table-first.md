# 示例：Table-first 后台

适合 CRM、订单、用户、账单、库存和记录管理。

## 骨架

1. 页面标题 + 极少量全局动作；
2. 紧凑工作栏：Search / 高频 Filter / Saved View / Columns；
3. 主表占据绝大部分首屏；
4. Pagination / cursor / result count 与表格绑定；
5. 详情用 drawer、split view 或 full page，按复杂度决定。

## 关键决定

- KPI 只有在会改变当前处理决策时才出现在首屏；否则移到 overview。
- 不把每行改成独立卡片。
- 列顺序按扫描逻辑，不按数据库字段顺序。
- Identity / Status / Decision signal 优先于低价值元数据。
- Filter 激活后保持可见。
- 多选后进入批量模式。

## 反模式

- 顶部四张“总数/新增/转化/活跃”卡片挤压工作区；
- 每个 filter 都藏在同一个大弹窗；
- 行操作全部只在 hover 的 `...`；
- 进入详情后返回列表丢失滚动位置。
