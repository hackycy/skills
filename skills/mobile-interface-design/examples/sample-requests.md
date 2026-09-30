# Sample Requests and Calibration

These examples demonstrate reasoning shape, not reusable visual answers. They intentionally avoid supplying a finished signature motif that can be copied into unrelated tasks.

## 1. Operational alarm page

### Request

> 做一个移动端 H5 设备告警列表，原生 HTML/CSS/JS。需要严重/一般/提示筛选，显示设备名、告警内容、时间、状态，底部有首页/设备/告警/我的。

### Expected internal calibration

```text
USE MODE
scan-led + task-led: triage unresolved alarms

PRODUCT TRUTH
severity, device identity, alarm message, time, acknowledgement state

COMPOSITION SEARCH
compare at least two structurally different ways of leading with urgency vs device context

EXPRESSION
restrained / dense / stable / minimal motion

AUTHORED-IDEA GATE
optional; only use a special structural motif if it makes severity easier to scan

REJECT
giant dashboard KPIs
card-per-alarm
ornamental dark-tech styling
```

Expected implementation: high density, explicit state/action distinction, and no decorative motif required simply to make the page “distinctive”.

## 2. Consumer coffee membership home

### Request

> 做一个咖啡品牌会员首页 H5，需要积分、距离下一等级、可兑换权益、最近消费记录。年轻一些，但不要像活动落地页。

### Expected internal calibration

```text
USE MODE
browse-led with a clear progress/reward outcome

PRODUCT MATERIAL
membership progress, reward thresholds, benefits, purchase history; coffee vocabulary may inform tone without literal skeuomorphism

COMPOSITION SEARCH
compare progress-led, benefits-led, and history-led emphasis if structure is open

EXPRESSION
balanced-to-expressive / balanced density / varied rhythm / functional motion

AUTHORED-IDEA GATE
may be justified, but there is no requirement to invent a coffee-themed motif
```

Expected implementation: recurring product screen, not a campaign landing page; continuity with the existing brand/app system takes precedence over page-level novelty.

## 3. Finance detail page

### Request

> 帮我做手机端账单详情，展示金额、状态、商户、时间、支付方式、退款入口。要让用户觉得可靠，不要太花。

### Expected internal calibration

```text
USE MODE
read-led + task-led: verify one transaction, then act if necessary

ATTENTION
transaction identity/state first; refund is available but should not visually equal identity unless context demands it

EXPRESSION
restrained / sparse-to-balanced / stable / minimal motion

AUTHORED-IDEA GATE
likely no page-specific signature; precision and continuity may be the mature choice
```

Expected implementation: clear state, precise language, conservative motion, and no forced receipt metaphor unless it improves comprehension.

## 4. Running activity home

### Request

> 做一个跑步 App 的首页，展示今天训练、周跑量、最近一次跑步、开始跑步按钮。偏专业但不要像数据后台。

### Expected internal calibration

```text
USE MODE
task-led + scan-led: understand today's training context and start/resume activity

PRODUCT MATERIAL
training plan, weekly load, recent run, route/split/cadence language

COMPOSITION SEARCH
question whether today's plan, recent activity, or readiness should lead based on actual product priority

AUTHORED-IDEA GATE
optional; domain-specific data treatment may be enough without a decorative running motif
```

## 5. Booking / local service

### Request

> 做一个手机端理发预约页面，需要选择门店、理发师、日期时间和项目，最后确认预约。

### Expected internal calibration

```text
USE MODE
form-led: make a confident appointment choice with minimal backtracking

STRUCTURE
derive grouping from dependencies between store/staff/service/time rather than automatically choosing a multi-step wizard

FIRST VIEWPORT
should establish where the user is in the booking context; no requirement for a large CTA if choice must happen first

AUTHORED-IDEA GATE
usually restraint; selection clarity matters more than novelty
```

## 6. Redesign existing code

### Request

> 这个 H5 表单太丑了，功能不要动，重新设计并直接改代码。

### Expected behavior

1. inspect current behavior, validation, data semantics, stack, and neighboring screens;
2. preserve product truth and interaction contracts;
3. inherit good product-wide visual conventions;
4. search alternatives only when the structure is genuinely open and compatible with behavior;
5. commit a page-aware Visual Contract;
6. run the Authored-Idea Gate instead of forcing a signature;
7. implement without breaking function;
8. render-review, run replacement/continuity/squint tests, and validate statically when applicable.

A redesign is not “change colors and radius”, but neither is it permission to invent a new mini-brand for one page.
