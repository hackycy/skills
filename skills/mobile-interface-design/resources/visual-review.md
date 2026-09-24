# Rendered Visual Review

Use after the page has been rendered in a real browser or equivalent visual surface.

The goal is not pixel perfection to a reference image. There may be no reference image. The goal is to judge whether the implementation expresses the chosen product-specific direction and works as mobile UI.

Review the whole screen before individual components.

## Pass 1: whole-screen read

At ~390px width, inspect without zooming into details.

Ask:

- What wins first?
- What is the expected eye/thumb path?
- Is the primary job understandable quickly?
- Is useful content present in the first viewport?
- Does the screen look like mobile product UI rather than a reduced desktop page or marketing landing page?
- Are there clear dense and quiet regions, or is the rhythm flat?

Do not start by adjusting border radii.

## Pass 2: squint test

Blur your attention or view the screenshot at reduced scale.

Check:

- one dominant focal path remains visible;
- primary/secondary/tertiary zones remain distinguishable;
- no decorative object steals attention from the task;
- critical states are visible without turning the page into a wall of alerts.

If the hierarchy disappears when text cannot be read, typography/spacing/contrast are too flat.

## Pass 3: composition and scan path

Compare the render with the chosen composition hypothesis.

- Did implementation drift back into generic stacked cards?
- Is the first viewport doing what the hypothesis promised?
- Are repetitive records aligned predictably?
- Are forms grouped progressively rather than merely boxed?
- Are important actions placed according to frequency and thumb reach?
- Are there awkward dead zones or cramped clusters?

Fix structure before cosmetic polish.

## Pass 4: signature fidelity

Name the signature idea, then point to at least three visible manifestations.

Check:

- does it improve understanding or action?
- does it belong to the product's domain?
- is it repeated coherently rather than copied mechanically?
- is the surrounding UI quiet enough for it to matter?

If fewer than three real consequences are visible, the implementation has lost its design thesis.

## Pass 5: distinctiveness / replacement test

Mentally replace the product nouns with an unrelated category.

Could the same:

- layout;
- palette;
- typography;
- surfaces;
- icon containers;
- section rhythm

remain unchanged?

If yes, identify the most generic layer and redesign it from Domain World. Do not fix genericness by adding random decoration.

## Pass 6: typography

Inspect real content.

- Are title, body, values, labels, and metadata meaningfully distinct?
- Does hierarchy use weight and contrast as well as size?
- Is any text too small at phone distance?
- Do Chinese/mixed-language lines breathe correctly?
- Are important numbers aligned and stable where comparison matters?
- Do long labels/wrapped values look intentional?
- Does the chosen type treatment reinforce the intended atmosphere?

## Pass 7: color, shape, and surfaces

- Is accent color used for action, identity, or state rather than spread everywhere?
- Are semantic states distinguishable beyond color?
- Is there one coherent depth/grouping strategy?
- Are cards actually grouping meaningful content?
- Are borders/shadows/radii too frequent or too loud?
- Are pills reserved for roles that benefit from pills?

## Pass 8: controls and ergonomics

- Are frequent targets comfortably tappable?
- Do bottom bars and sticky actions respect safe area and reserve content space?
- Can filters/tabs be reached and understood without dominating content?
- Does any essential action depend on hover?
- Are focused inputs likely to remain visible above the keyboard?
- Are destructive actions unmistakable?

## Pass 9: states and copy

Where relevant, inspect:

- loading;
- empty;
- error;
- disabled;
- submitting;
- selected/pressed.

Check whether the copy names the state and next action clearly. Avoid vague "Something went wrong" when a useful recovery can be stated.

## Pass 10: width resilience

Spot-check around 375px and 430px:

- no accidental horizontal scrolling;
- no clipped labels;
- no broken fixed widths;
- no oversized empty gaps on wide phones;
- sticky/fixed elements do not obscure content;
- long content does not destroy alignment.

## Refinement format

Internally summarize each pass as:

```text
KEEP
- strongest successful decisions

FIX
- highest-impact problems

CHANGE
- exact implementation changes to make now
```

Make changes immediately, then re-render.

Batch related corrections so each render tests a coherent design change rather than one tiny value.

Normally 1-3 refinement passes are enough. Stop when remaining changes are subjective micro-polish or would weaken the chosen direction.

## Completion gate

Do not call the page finished until:

- primary job is clear;
- composition matches the chosen hypothesis;
- signature appears visibly in at least three places/states;
- replacement test no longer reads as obviously interchangeable;
- mobile ergonomics and width resilience hold;
- remaining issues are low-impact polish.
