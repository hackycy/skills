# Visual Contract

Create this contract internally after composition search and before implementation.

It is page-scoped and disposable. Do not write it into the project unless the user asks for design documentation.

The contract exists to prevent a good verbal concept from silently becoming generic CSS.

## Template

```yaml
visual_contract:
  archetype: <short phrase>
  thesis: <one sentence specific to this page>

  primary_job: <verb phrase>
  first_viewport: <what must be understood or acted on first>

  composition:
    chosen_hypothesis: <name>
    top: <header/summary/focal-object strategy>
    body: <list/sections/form/timeline/editorial/etc>
    action: <inline/sticky/contextual/floating/none>
    navigation: <bottom tabs/back-only/tabs/etc>
    scan_path: <expected visual path>

  signature:
    idea: <one concrete domain-derived idea>
    product_reason: <why it belongs here>
    manifestations:
      - <visible place/state 1>
      - <visible place/state 2>
      - <visible place/state 3>

  taste:
    creativity: <1-10>
    density: <1-10>
    variance: <1-10>
    motion: <1-10>
    atmosphere: [<word>, <word>, <word>]
    bold_area: <where expression is spent>
    quiet_area: <what remains restrained>

  hierarchy:
    primary: <what wins>
    secondary: <what supports>
    tertiary: <metadata/chrome>

  typography:
    family: <actual stack or project token>
    display_family: <same or alternate; actual choice>
    character: <compact/editorial/friendly/technical/etc>
    body_size: <px/rem/token>
    title_size: <px/rem/token>
    metadata_size: <px/rem/token>
    primary_weight: <value/token>
    secondary_weight: <value/token>
    numeric_treatment: <tabular/lining/etc when relevant>
    line_height_character: <tight/normal/airy plus concrete values if useful>

  color:
    strategy: <neutral + accent / tonal / high contrast / image-led/etc>
    tokens:
      canvas: <actual value/token>
      surface: <actual value/token>
      surface_raised: <actual value/token or none>
      text_primary: <actual value/token>
      text_secondary: <actual value/token>
      accent: <actual value/token>
      danger: <actual value/token>
      warning: <actual value/token>
      success: <actual value/token>
    semantic_rule: <how state meaning is expressed beyond color>

  spacing:
    base: <4px/8px/etc>
    screen_gutter: <value>
    section_gap: <value>
    group_gap: <value>
    row_padding: <value>

  surfaces:
    grouping: <spacing/dividers/cards/sheets/etc>
    depth_strategy: <none/border-only/tonal/subtle-shadow/layered>
    control_radius: <value>
    surface_radius: <value>
    pill_usage: <where allowed, if anywhere>

  imagery_icons:
    imagery: <none/supporting/hero/dominant + source strategy>
    icons: <library/line/filled/custom geometric + consistency rule>

  interaction:
    feedback: <pressed/loading/selection/etc>
    motion_character: <restrained/fluid/expressive>
    authored_moment: <one purposeful moment or none>

  avoid:
    - <specific default that would weaken this direction>
    - <specific default>
    - <specific default>
```

## Contract rules

- Choose one direction. Never fill fields with "either/or".
- The thesis must be specific enough that two unrelated products would not share it unchanged.
- The signature must affect real hierarchy, structure, state, or interaction. Decorative background texture alone is not a signature.
- Use project tokens when they already encode the intended values. Otherwise choose actual page-level values rather than leaving adjectives.
- Radius, shadows, cards, gradients, dark mode, and motion are consequences of the direction, not defaults.
- Every bold choice must have a quiet counterweight.
- If the page is a redesign, preserve behavior and data meaning while allowing a new contract.

## Example: equipment alarm list

```yaml
archetype: operational-severity-stream
thesis: A high-signal field interface where unresolved severity forms one continuous scan path from summary to records.

primary_job: triage unresolved alarms
first_viewport: critical count, current filter, first actionable alarms

composition:
  chosen_hypothesis: status-first
  top: compact severity summary aligned to filter states
  body: open aligned record stream
  action: contextual
  navigation: bottom tabs
  scan_path: severity rail -> device -> alarm text -> time/state

signature:
  idea: severity rail
  product_reason: alarm priority should remain visible while scanning
  manifestations:
    - summary counts
    - filter selection
    - record leading marker

taste:
  creativity: 3
  density: 9
  variance: 2
  motion: 1
  atmosphere: [decisive, compact, technical, calm]
  bold_area: severity/type contrast
  quiet_area: surfaces/navigation

spacing:
  base: 4px
  screen_gutter: 16px
  section_gap: 20px
  group_gap: 8px
  row_padding: 12px 0

surfaces:
  grouping: whitespace + dividers
  depth_strategy: tonal
  control_radius: 10px
  surface_radius: 12px
  pill_usage: short filter states only

avoid:
  - card-per-alarm
  - decorative gradients
  - oversized page title
```

## Example: coffee loyalty home

```yaml
archetype: tactile-membership-home
thesis: Reward progress feels cumulative and tangible while routine account information stays quiet.

primary_job: understand progress and choose the next reward action
first_viewport: membership identity, progress, next reward

composition:
  chosen_hypothesis: focal-object-first
  top: compact identity + progress focal object
  body: rewards then recent activity with varied rhythm
  action: reward-related and contextual
  navigation: bottom tabs
  scan_path: progress -> next reward -> benefits -> activity

signature:
  idea: accumulated-fill progress language
  product_reason: membership value grows through repeated purchases
  manifestations:
    - main progress object
    - reward threshold marks
    - redeem confirmation transition

taste:
  creativity: 7
  density: 4
  variance: 6
  motion: 4
  atmosphere: [warm, tactile, optimistic, crafted]
  bold_area: progress object + display type
  quiet_area: activity rows + navigation

avoid:
  - generic fintech balance card
  - blue-purple gradient identity
  - uniform rounded-card grid
```
