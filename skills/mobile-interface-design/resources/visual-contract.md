# Visual Contract

Create this contract internally before implementation. It is page-scoped and disposable.

Do not write it to the project unless the user asks for design documentation.

## Template

```yaml
visual_contract:
  archetype: <short phrase>
  thesis: <one sentence describing the dominant visual idea>

  taste:
    creativity: <1-10>
    density: <1-10>
    variance: <1-10>
    motion: <1-10>

  atmosphere:
    - <word>
    - <word>
    - <word>

  hierarchy:
    primary: <what must be noticed first>
    secondary: <next priority>
    tertiary: <supporting information>

  composition:
    top: <header/hero/summary strategy>
    body: <list/sections/form/editorial/etc>
    action: <inline/sticky/floating/none>
    navigation: <bottom tabs/back-only/etc>

  typography:
    character: <compact/editorial/friendly/technical/etc>
    emphasis: <size/weight/contrast/number treatment/etc>

  color:
    strategy: <neutral + accent / tonal / high contrast / image-led/etc>
    semantic_states: <how success/warning/danger are differentiated>

  surfaces:
    grouping: <spacing/dividers/cards/sheets/etc>
    elevation: <none/subtle/layered>
    radius: <sharp/restrained/soft/expressive>

  imagery_icons:
    imagery: <none/supporting/hero/dominant>
    icons: <line/filled/mixed-with-reason>

  interaction:
    feedback: <pressed/loading/selection/etc>
    motion_character: <restrained/fluid/expressive>

  avoid:
    - <specific default that would weaken this direction>
```

## Contract rules

- Choose one direction. Do not fill fields with "either/or".
- The thesis must be specific enough that two unrelated pages would not share it unchanged.
- The contract must derive from the page intent, not from fashionable visual styles.
- Radius, shadows, card usage, and gradients are consequences of the direction, not defaults.
- If the page is a redesign of existing code, preserve behavior and data meaning while permitting a new visual contract.

## Examples

### Equipment alarm list

```yaml
archetype: operational-status-list
thesis: A high-signal field interface where severity and unresolved state dominate everything else.
taste: { creativity: 3, density: 9, variance: 2, motion: 1 }
atmosphere: [decisive, compact, technical, calm]
composition:
  top: compact status summary + filters
  body: aligned record list
  action: contextual, not floating
  navigation: bottom tabs
surfaces:
  grouping: separators and whitespace before cards
  elevation: none
  radius: restrained
avoid: [card-per-record, decorative gradients, oversized titles]
```

### Coffee loyalty home

```yaml
archetype: lifestyle-membership-home
thesis: A warm membership screen that makes progress and the next reward feel tangible without becoming promotional clutter.
taste: { creativity: 7, density: 4, variance: 6, motion: 4 }
atmosphere: [warm, tactile, optimistic, crafted]
composition:
  top: identity + reward progress focal block
  body: benefits and recent activity with varied rhythm
  action: clear reward-related primary action
  navigation: bottom tabs
surfaces:
  grouping: selective panels, open whitespace
  elevation: subtle
  radius: soft but not pill-heavy
avoid: [generic fintech look, blue-purple gradients, uniform card grid]
```
