# Rendered Visual Review

Use after the page has been rendered in a real browser or equivalent visual surface.

The goal is not pixel perfection to a reference image; there is no reference image. The goal is to determine whether the implementation actually expresses the chosen Visual Contract and works as mobile UI.

## Review order

Review the whole screen first. Do not start by tweaking individual border radii.

### 1. First-viewport comprehension

At ~390px width, ask:

- Can the screen's primary job be understood quickly?
- Is the most important content/action visually dominant?
- Is the first viewport consumed by decorative chrome rather than useful content?
- Does the top area feel like mobile product UI rather than a landing page?

### 2. Hierarchy

- Are primary, secondary, and tertiary information clearly separated?
- Does semantic importance match visual weight?
- Are dangerous/urgent states visible without overwhelming every other state?
- Is the primary action obvious but not visually noisy?

### 3. Composition and rhythm

- Are margins and alignments coherent?
- Are sections grouped by spacing before extra containers are introduced?
- Is repeated content easy to scan?
- Are there awkward dead zones or crowded clusters?
- Is the page rhythm too repetitive/template-like?

### 4. Typography

- Are titles, body, metadata, and numeric values meaningfully distinct?
- Is any text too small on a phone?
- Do Chinese/mixed-language lines breathe correctly?
- Are line breaks or truncation visually awkward?

### 5. Color and surfaces

- Is accent color used intentionally?
- Do surfaces help grouping or merely create card clutter?
- Are borders/shadows too weak, too strong, or too frequent?
- Are semantic states distinguishable beyond color alone?

### 6. Controls and mobile ergonomics

- Are common targets comfortably tappable?
- Do bottom bars/sticky actions respect the safe area and content padding?
- Are filters, tabs, and menus placed where a thumb can reasonably reach them?
- Does any essential action depend on hover?

### 7. Visual Contract fidelity

Compare observed design with the internal contract:

- Does the actual density match the intended density?
- Is the intended atmosphere visible without reading a description?
- Did implementation drift into generic cards/pills/gradients?
- Was the one dominant visual thesis actually expressed?

### 8. Width resilience

Spot-check around 375px and 430px:

- no horizontal scrolling;
- no clipped labels;
- no broken fixed widths;
- no huge empty gaps on wider phones;
- sticky/fixed elements do not obscure content.

## Refinement format

Internally summarize each pass as:

```text
KEEP
- ...

FIX
- ...

CHANGE
- exact implementation changes
```

Then immediately make the changes. Do not only produce critique.

Prioritize high-impact fixes. Normally 1-3 passes are enough. Stop when additional changes are mostly subjective micro-polish or begin to weaken the coherent direction.
