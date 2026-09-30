# Rendered Visual Review

Use after the page has been rendered in a real browser or equivalent visual surface.

The goal is not pixel perfection to a reference image. Judge whether implementation expresses the chosen product-specific direction, preserves product continuity where needed, and works as mobile UI.

Review the whole screen before individual components.

## Pass 1: whole-screen read

At a representative phone width (around 390px is a useful baseline), ask:

- What wins first, or what stable scan anchors organize attention?
- Is the dominant outcome/use mode understandable quickly?
- Does early viewport space contain useful context/content/state/action?
- Does the screen look like mobile product UI rather than reduced desktop or a marketing landing page?
- Are there clear dense and quiet regions, or is rhythm flat?
- Does it still look like the surrounding product when continuity should matter?

Do not start by adjusting border radii.

## Pass 2: squint test

Blur attention or reduce the screenshot.

Check:

- task-led screens retain a clear focal path;
- monitoring/scanning/browsing surfaces retain stable attention anchors;
- primary/secondary/tertiary zones remain distinguishable;
- decoration does not steal attention;
- critical states remain visible without becoming a wall of alerts.

## Pass 3: composition and scan path

Compare the render with the chosen structural reasoning.

- Did implementation drift into generic stacked cards?
- Is early viewport space doing useful work?
- Are repetitive records aligned predictably?
- Are forms grouped progressively rather than merely boxed?
- Are actions placed according to frequency, context, risk, and reachability?
- Are there awkward dead zones or cramped clusters?

Fix structure before cosmetic polish.

## Pass 4: authored-idea fidelity — only if applicable

If the Visual Contract chose an authored idea:

- is its useful consequence visible?
- does it improve understanding/action?
- does it belong to the product?
- is surrounding UI quiet enough for it to matter?

There is no minimum manifestation count.

If the contract chose restraint, skip this pass. Do not fail a page for lacking a special visual motif.

## Pass 5: distinctiveness / replacement test

Mentally replace product nouns with an unrelated category.

Could the same layout, palette, typography, surfaces, icon containers, and section rhythm remain unchanged?

If yes, identify the most generic layer and redesign it from product truth/domain material. Product-specificity may come from information structure or language; do not add random decoration.

## Pass 6: product continuity test

When this page belongs to an existing app, compare it with neighboring screens:

- does typography still belong to the same product?
- do color semantics, controls, navigation, radius, and motion remain coherent?
- did page-level exploration invent a second design system?

Intentional redesign scope is an exception; otherwise fix unnecessary divergence.

## Pass 7: typography

Inspect real content. Check meaningful distinctions among title/body/values/labels/metadata, weight and contrast beyond size, readable phone-distance text, mixed-language rhythm, stable numbers where comparison matters, and intentional handling of long labels/values.

## Pass 8: color, shape, surfaces

Check accent use, semantic states beyond color, coherent grouping/depth strategy, meaningful use of cards, and whether borders/shadows/radii/pills are too frequent or loud.

## Pass 9: controls and ergonomics

Check comfortable tap targets, safe-area treatment, fixed/sticky viewport cost, keyboard visibility, touch alternatives to hover, destructive-action clarity, and whether optional filters/tabs/navigation dominate content without task justification.

## Pass 10: states and copy

Where relevant, inspect loading, empty, error, disabled, submitting, selected/pressed. Copy should identify the state and next useful action when recovery exists.

## Pass 11: width resilience

Spot-check narrower and wider phone widths around 375–430px, plus known target devices:

- no accidental horizontal scrolling;
- no clipped labels;
- no broken fixed widths;
- no oversized empty gaps;
- sticky/fixed UI does not obscure content;
- long content does not destroy alignment.

## Refinement format

Internally summarize each pass:

```text
KEEP
- strongest successful decisions

FIX
- highest-impact problems

CHANGE
- exact implementation changes to make now
```

Batch related corrections, re-render, and normally stop after 1–3 passes once remaining changes are subjective micro-polish.

## Completion gate

Do not call the page finished until:

- dominant outcome/use mode is clear;
- composition matches the chosen reasoning;
- authored idea is useful if one was chosen, or restraint remains deliberate if none was chosen;
- replacement test no longer reads as obviously interchangeable;
- product continuity holds where applicable;
- mobile ergonomics and width resilience hold;
- remaining issues are low-impact polish.
