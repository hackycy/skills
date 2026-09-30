# Visual Contract

Create this contract internally after composition search and before implementation.

It is page-scoped, but product-aware. Existing product-wide typography, color semantics, controls, navigation, and motion conventions should be inherited unless redesign scope explicitly changes them.

The contract exists to prevent a good verbal concept from silently becoming generic CSS.

## Template

Use only relevant fields. Do not fill fields mechanically.

```yaml
visual_contract:
  thesis: <one sentence specific to this page>
  use_mode: <task-led / scan-led / compare-led / monitor-led / browse-led / read-led / conversation-led / form-led / other>
  outcome: <what the user should accomplish or understand>

  inheritance:
    keep:
      - <existing product-system decision>
    page_specific:
      - <what this page is allowed to decide differently>

  composition:
    lead: <state/object/action/sequence/time/location/content/conversation/...>
    early_viewport_value: <what earns space near the top>
    body: <structural description>
    action_model: <inline/contextual/sticky/persistent/none>
    navigation: <existing/product-specific choice>
    attention: <focal path / scanning anchors / progressive reveal / stream>

  authored_idea:
    use: <yes/no>
    reason: <why an authored idea helps, or why restraint is better>
    idea: <only if yes>
    consequences:
      - <only the natural, useful consequences; no minimum count>

  expression:
    level: <restrained/balanced/expressive + reason>
    density: <sparse/balanced/dense + reason>
    rhythm: <stable/varied/editorial + reason>
    motion: <minimal/functional/expressive + reason>
    atmosphere: [<word>, <word>, <word>]
    bold_area: <where expression is spent>
    quiet_area: <what remains restrained>

  hierarchy:
    primary: <what wins or what scan anchors matter>
    secondary: <supporting content>
    tertiary: <metadata/chrome>

  typography:
    family: <actual stack or inherited token>
    body_size: <value/token>
    title_size: <value/token>
    metadata_size: <value/token>
    weights: <values/tokens>
    numeric_treatment: <when relevant>
    line_height_character: <concrete choice>

  color:
    strategy: <inherited / neutral + accent / tonal / image-led / other>
    tokens:
      canvas: <actual value/token>
      surface: <actual value/token>
      text_primary: <actual value/token>
      text_secondary: <actual value/token>
      accent: <actual value/token if needed>
      danger: <actual value/token if needed>
      warning: <actual value/token if needed>
      success: <actual value/token if needed>
    semantic_rule: <how critical meaning is expressed beyond color>

  spacing:
    base: <value>
    screen_gutter: <value>
    section_gap: <value>
    group_gap: <value>

  surfaces:
    grouping: <spacing/dividers/selective surfaces/etc>
    depth_strategy: <none/border-only/tonal/subtle-shadow/layered>
    radius_scale: <values/tokens>

  imagery_icons:
    imagery: <none/supporting/dominant + source strategy>
    icons: <existing library / authored SVG / other>

  interaction:
    feedback: <pressed/loading/selection/etc>
    motion_character: <choice from expression profile>

  avoid:
    - <specific default that would weaken this page>
```

## Contract rules

- Choose one direction; no unresolved “either/or”.
- Do not invent a new page visual system when the surrounding product already provides a good one.
- The thesis must explain task and composition, not only mood.
- `authored_idea.use: no` is a valid, often mature choice.
- An authored idea needs no minimum number of manifestations. One strong structural consequence can be enough.
- Product-specificity can come from information structure, language, state, or interaction; it does not require decorative theming.
- Use project tokens when they encode the intended values; otherwise choose actual page-level values.
- Radius, shadows, cards, gradients, dark mode, motion, bottom navigation, sticky CTAs, and sheets are consequences, never defaults.
- Every bold choice needs quiet surrounding structure.
