# Sample Requests and Calibration

These examples show intended reasoning behavior. They are not visual templates.

Do not copy their visual solutions into unrelated products.

## 1. Operational alarm page

### Request

> 做一个移动端 H5 设备告警列表，原生 HTML/CSS/JS。需要严重/一般/提示筛选，显示设备名、告警内容、时间、状态，底部有首页/设备/告警/我的。

### Expected internal calibration

```text
PRIMARY JOB
triage unresolved alarms

DOMAIN WORLD
equipment plates, severity lamps, timestamps, acknowledgement state, field inspection marks

COMPOSITION SEARCH
A status-first: severity summary -> filter -> aligned alarm stream
B device-first: device groups -> nested alarms
C time-first: event timeline

CHOOSE
A; fastest for urgent scanning

SIGNATURE
a severity rail that aligns summary, filters, and records

REJECT
card-per-alarm -> open aligned rows
large dashboard KPIs -> compact severity summary
decorative dark-tech chrome -> restrained field-tool surfaces
```

Expected implementation: high density, explicit status/action states, no card-per-record default, signature visible across at least three parts of the screen.

## 2. Consumer coffee membership home

### Request

> 做一个咖啡品牌会员首页 H5，需要积分、距离下一等级、可兑换权益、最近消费记录。年轻一些，但不要像活动落地页。

### Expected internal calibration

```text
PRIMARY JOB
understand membership progress and choose the next useful reward action

DOMAIN WORLD
cup fill, roast label, stamp accumulation, receipt marks, ceramic, roasted brown, milk foam

COMPOSITION SEARCH
A balance-card-first
B progress-object-first
C promotional-carousel-first

CHOOSE
B; membership value is accumulation, not banking

SIGNATURE
accumulated-fill progress language reused in hero, reward thresholds, and redeem feedback

REJECT
fintech balance card -> tactile progress focal object
promo carousel -> quieter benefit groups
uniform rounded panels -> mixed open space + selective surfaces
```

Expected implementation: warmer and more expressive than an operations page, but still a usable recurring app screen.

## 3. Finance detail page

### Request

> 帮我做手机端账单详情，展示金额、状态、商户、时间、支付方式、退款入口。要让用户觉得可靠，不要太花。

### Expected internal calibration

```text
PRIMARY JOB
verify what happened to one transaction and find the appropriate next action

DOMAIN WORLD
receipt, ledger line, settlement state, merchant identity, payment instrument, refund status

COMPOSITION SEARCH
A amount-first receipt
B action-first support screen
C timeline-first transaction history

CHOOSE
A; transaction identity and state should resolve before action

SIGNATURE
receipt-like alignment and stable value columns, not literal paper decoration

TASTE
low motion, moderate density, strong numeric hierarchy, restrained semantic color
```

Expected implementation: conservative motion, clear state, precise terminology, refund action visible but not visually equal to the transaction identity.

## 4. Running activity home

### Request

> 做一个跑步 App 的首页，展示今天训练、周跑量、最近一次跑步、开始跑步按钮。偏专业但不要像数据后台。

### Expected internal calibration

```text
PRIMARY JOB
understand today's training context and start or resume a run

DOMAIN WORLD
lane marks, split times, cadence, route traces, reflective gear, lap timing

COMPOSITION SEARCH
A KPI-dashboard
B training-plan-first
C recent-run-first

CHOOSE
B; today's plan should determine the page, not aggregate metrics

SIGNATURE
split/lap typography and track-like progression marks reused across plan, weekly load, and recent run

REJECT
four KPI cards -> integrated weekly training strip
generic neon fitness dark mode -> use-scene-driven palette
floating start FAB over content -> anchored thumb-reachable primary action
```

Expected implementation: athletic information hierarchy without turning into a desktop analytics dashboard.

## 5. Booking / local service

### Request

> 做一个手机端理发预约页面，需要选择门店、理发师、日期时间和项目，最后确认预约。

### Expected internal calibration

```text
PRIMARY JOB
make a confident appointment choice with minimal backtracking

DOMAIN WORLD
service menu, availability windows, staff identity, chair/station, duration, confirmation

COMPOSITION SEARCH
A all-fields form
B step-first progressive booking
C calendar-first dense planner

CHOOSE
B unless the product context shows expert repeat usage

SIGNATURE
availability is treated as a time rhythm shared by date selection, staff availability, and confirmation summary

REJECT
long generic form -> progressive grouped choices
modal for every choice -> inline/sheet only when it reduces complexity
decorative lifestyle hero -> useful context in first viewport
```

Expected implementation: clear current step/context, touch-friendly time slots, selected/disabled states, and a confirmation summary that uses the same language as the selection flow.

## 6. Redesign existing code

### Request

> 这个 H5 表单太丑了，功能不要动，重新设计并直接改代码。

### Expected behavior

1. inspect current behavior, validation, data semantics, and stack;
2. preserve product truth and interaction contracts;
3. build Domain World from the actual product context;
4. explore 2-3 structural alternatives only if layout change is compatible with behavior;
5. commit a new page-specific Visual Contract;
6. implement without breaking function;
7. render-review and run the replacement/signature/squint tests;
8. run the static validator when applicable.

A redesign is not "change colors and radius". It should improve hierarchy, composition, type, rhythm, states, and domain specificity while preserving behavior.
