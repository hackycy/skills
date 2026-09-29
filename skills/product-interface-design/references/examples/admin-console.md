# 示例：Console / Monitoring

适合日志、部署、基础设施、incident、监控、实时状态工具。

## 骨架

- Context bar：环境、时间范围、服务/项目范围；
- Signal zone：真正的异常与趋势，不用泛化 KPI 卡；
- Dense stream/table：日志、事件、部署、trace；
- Detail / inspector：当前事件细节；
- Action strip：acknowledge、assign、retry、rollback 等业务动作。

## 关键决定

- 时间和 scope 必须持续可见；
- 严重级别、服务、影响范围、持续时间是稳定扫描锚点；
- 多个锚点并存，不强制造一个巨大 Hero；
- 实时数据需要 stale / paused / reconnect 状态；
- 高频键盘导航不加阻塞动画。

## 反模式

- 首屏被 4 张大数字卡占满；
- 所有异常都用高饱和红色，导致没有优先级；
- 日志列表行高过大；
- scope / time range 隐藏在深层 filter 弹窗。
