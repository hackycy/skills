# 后台交互模式

这份参考用于表格、列表、队列、运营后台、审批台、CRM、日志和数据工具。目标不是增加组件数量，而是把“找 → 判断 → 选 → 操作 → 查看详情 → 返回继续工作”做成稳定语法。

## 1. Search

先决定搜索范围：当前表、当前对象、整个工作区还是命令导航。搜索框 placeholder 应暴露范围，例如“搜索客户、邮箱或订单号”，而不是泛化的“搜索”。

- 高频本地搜索可常驻工具栏。
- 复杂全局搜索应与页面筛选分开，避免一个输入框同时承担导航与过滤。
- 搜索结果状态必须与真正 empty state 分开。

## 2. Filter

筛选器是工作状态，不是装饰控件。

- 高频筛选可以常驻；低频维度进入 popover / advanced filter。
- 激活筛选必须在关闭面板后仍可见，例如 chip、summary 或 filter bar。
- 支持快速清除单项与全部清除。
- 范围或逻辑复杂时显示 `AND / OR` 关系，不能只靠颜色暗示。
- 筛选项多时优先“已选摘要 + 搜索维度”，不要把几十个 checkbox 全铺开。

## 3. Saved View

当用户会重复使用同一组 filter + sort + columns 时，考虑保存视图。

- 视图名称应代表业务工作集，如“本周待审核”而不是“View 3”。
- 明确区分个人视图和共享视图。
- 修改已保存视图时显示 dirty 状态，并提供“更新当前 / 另存为”。

## 4. Sort

排序必须回答“这能帮助用户做什么”。

- 默认排序应服务任务，例如队列优先级或最近异常，而不是数据库自然顺序。
- 多列排序仅在真实需要时开放。
- 当前排序在离开页面再返回时应尽量保持。

## 5. Columns

列的稳定性决定扫描效率。

- 身份列通常固定在前；关键状态靠近身份或首要判断字段。
- 数字右对齐；同类状态与时间保持一致格式。
- 不要默认展示数据库所有字段。
- 低频列进入 column picker；用户自定义列顺序时考虑保存到 view。
- 横向滚动优于把每一行改成卡片，尤其在桌面专业工具里。

## 6. Selection

checkbox 只负责 selection，row click 负责打开详情，两者不应语义重叠。

- 选中后进入明显的 selection mode。
- 显示选中数量与作用范围。
- 若支持“选中当前页 / 选中全部结果”，必须明确差异。
- 批量动作完成后，根据任务决定保留还是清除 selection，并给出反馈。

## 7. Batch Actions

- 高频安全批量动作放在 selection toolbar。
- 高风险动作与普通动作视觉和位置分离。
- 对“全部结果”执行时显示范围说明，例如“将影响 2,431 条记录”。
- 长耗时任务显示 queued / processing / partial failure，而不是只弹一个成功 toast。

## 8. Row Actions

- 高频动作可以内联；低频动作进入 overflow。
- 不要让 hover 才出现的动作成为唯一入口。
- row click、链接、checkbox、inline action 都要有明确命中区，防止误触。
- 行内编辑只适合局部、低风险、结构稳定的字段。

## 9. Detail Pattern

### Full page
用于复杂对象、需要深链接、多区块工作或长时间停留。

### Side drawer / panel
用于快速检查、轻量编辑和连续浏览；返回列表时天然保留上下文。

### Split view
用于高频在列表与详情之间切换，适合 queue / master-detail。

决定详情模式时考虑：信息量、操作复杂度、连续处理频率、是否需要比较多个对象、URL 深链接需求。

## 10. Return Context

从详情回到列表时，尽量保留：

- query / search；
- filters；
- saved view；
- sort；
- column config；
- pagination 或 cursor；
- scroll position；
- 对连续处理有价值的 selection。

后台最常见的体验损耗之一，就是用户每处理一条记录都要重新定位工作集。

## 11. Queue Mode

队列不是普通表格加一个“状态”列。应明确：

- 为什么这条排在这里；
- 优先级 / 风险 / SLA；
- 下一步处理动作；
- 是否支持处理后自动进入下一条；
- 是否可 skip / snooze / assign；
- 处理结果如何回写队列。

## 12. Destructive & High-risk Actions

确认强度与风险匹配：

- 可撤销：优先直接执行 + Undo；
- 中风险：简洁 confirm，明确对象与后果；
- 高风险：typed confirmation、二次验证或延迟执行。

不要对所有删除都套同一个红色 Modal，也不要用 toast 代替关键结果状态。

## 13. States

必须区分：

- **Empty**：系统还没有任何数据；
- **No results**：有数据，但当前搜索/筛选得到 0；
- **Permission denied**：数据存在，但用户无权查看；
- **Partial**：部分数据加载或部分操作失败；
- **Stale**：数据可能过期；
- **Error**：加载失败；
- **Pending mutation**：操作已提交但未最终完成。

每种状态都要告诉用户“发生了什么”和“下一步能做什么”。

## 14. Keyboard & Power-user Paths

高频工具可支持：

- `/` 或明确快捷键聚焦搜索；
- 上下键移动当前项；
- Enter 打开；
- `j/k` 仅在产品确实面向高频键盘用户时考虑；
- Escape 关闭浮层或退出 selection mode。

快捷键不能替代可见 UI，也不能与浏览器/系统常用快捷键冲突。
