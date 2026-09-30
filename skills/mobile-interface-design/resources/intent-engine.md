# Intent Engine

Use this resource to determine what the mobile screen is for before choosing how it looks.

Do not expose this analysis unless the user asks for design rationale.

## Start with a use scene, not a persona label

Identify a concrete person-in-context.

Weak: `operations user`

Stronger: `a maintenance technician checking unresolved equipment alarms while walking the floor`

The use scene influences density, reachability, motion, copy, and what deserves early viewport space.

## Dominant outcome or use mode

Do not force every screen into one primary action. First decide what kind of attention the screen needs.

Common modes include:

- **task-led** — complete a clear action;
- **scan-led** — repeatedly inspect many similar items;
- **compare-led** — compare alternatives or values;
- **monitor-led** — maintain awareness of changing state;
- **browse-led** — discover and explore;
- **read-led** — understand content with minimal chrome;
- **conversation-led** — follow and respond to an exchange;
- **form-led** — enter/verify information safely.

Express the dominant outcome as a verb phrase or state of awareness, for example:

- triage urgent alarms;
- understand whether anything needs intervention;
- compare appointment slots;
- read and save an article;
- verify a transaction;
- continue a conversation.

If multiple jobs coexist, identify which one sets the page's attention strategy and which are supporting. Do not demote legitimate parallel scan anchors merely to satisfy “one job”.

## Usage frequency

- rare: onboarding, account closure, special campaign;
- occasional: booking, checkout, profile setup;
- frequent: messaging, task lists, order operations;
- continuous: monitoring, dispatch, scanning, market watch.

Frequent interfaces can support higher density and usually benefit from less decorative friction.

## Task pressure and error cost

- relaxed / exploratory;
- normal;
- time-sensitive;
- high-risk / error-sensitive.

Higher pressure usually means less ambiguity, stable alignment, clearer state/action distinction, conservative motion, and confirmation proportional to irreversible risk.

## Information density

Estimate density from task and content, not category stereotype:

- sparse: one focal object, decision, or narrative;
- balanced: mixed content and actions;
- dense: repetitive records, comparison, monitoring, operations.

## Emotional character

Determine how much identity/mood the screen can support. Operational or high-risk surfaces often need more restraint; discovery or infrequent consumer moments may permit more expression. Treat this as a task-derived tendency, not a category lookup table.

## Dominant content shape

Identify what the page is mostly made of:

- repetitive records;
- one detailed entity;
- forms/inputs;
- numbers/statuses;
- images/products;
- long text;
- map/location;
- conversations;
- time/calendar;
- steps/progress;
- route/journey.

Composition should follow content shape rather than forcing everything into cards.

## Action structure

Identify primary, secondary, destructive, repeated row-level, and passive/read-only actions.

Ask whether an action should be always visible, contextual, inline after required information, sticky near the thumb, or absent because the screen is mainly informational.

Do not add a floating action merely because mobile apps often have one.

## First-viewport value

Do not require every screen to expose a CTA or complete the job above the fold. Instead complete this internally:

```text
The first viewport earns its space by making the user understand:
- ...

and, when appropriate, enabling:
- ...
```

Useful first-viewport value can be context, state, content, orientation, or action.

## Decision heuristics

Heuristics are tendencies, not templates. Derive the final composition from the actual use scene.

- high pressure + repeated scanning -> stable alignment, strong state cues, low decorative friction;
- reading -> typography and content rhythm dominate chrome;
- high-risk form -> progressive grouping, clear validation, explicit completion state;
- movement/poor lighting -> larger reachable targets, high contrast, short labels, restrained motion;
- exploratory browsing -> discovery rhythm may matter more than an early CTA.
