# Anti-patterns: Avoid Unexplained AI Defaults

These are not absolute bans. They are patterns that should not appear merely because they are easy for a model to generate.

A pattern is acceptable when it clearly supports the chosen Visual Contract.

## Generic visual clichés

Avoid defaulting to:

- blue-purple gradients as the primary identity;
- gradient text for ordinary product headings;
- glassmorphism without a meaningful layered context;
- blurred neon blobs as background decoration;
- giant marketing-style titles inside operational screens;
- excessive drop shadows;
- every surface floating independently;
- extreme 20-32px rounding on everything;
- making every button, filter, badge, and input pill-shaped;
- placing every icon inside a colored rounded square/circle;
- decorative charts that do not answer a user question;
- empty "hero" areas that consume the first viewport;
- generic KPI card rows copied from desktop dashboards;
- center-aligning task-heavy interfaces;
- random multi-accent palettes;
- decorative gradients used to create hierarchy that typography should provide.

## Composition clichés

Avoid:

- card-per-section and card-per-record without grouping rationale;
- desktop sidebar layouts reduced to phone width;
- identical section blocks producing monotonous "template" rhythm;
- excessive whitespace in high-frequency tools;
- cramped density in lifestyle/editorial screens merely to fit more content;
- floating action buttons that cover content when a sticky/in-flow action is clearer;
- filter controls occupying more visual weight than the data being filtered.

## Typography clichés

Avoid:

- arbitrary font-size jumps without hierarchy logic;
- weak gray-on-gray text everywhere;
- too many weights and styles;
- all-caps Latin labels mixed into Chinese UI purely for "premium" appearance;
- large numerals with no semantic priority;
- overusing monospace fonts to signal "technical" products.

## Interaction clichés

Avoid:

- animation on every component;
- hover-first interactions on touch devices;
- drawers/sheets for actions that can happen inline;
- hiding primary actions behind ambiguous icons;
- fake controls that do not respond;
- decorative loading skeletons with no plausible loading state.

## Corrective principle

When a page feels generic, do not add more decoration first.

Revisit:

1. content priority;
2. composition;
3. type hierarchy;
4. spacing rhythm;
5. one distinctive, context-specific visual decision.
