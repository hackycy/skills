# Anti-patterns: Replace Defaults with Decisions

These are not universal bans. They are common model habits that should not appear merely because they are easy to generate.

When one appears, ask whether it follows from the Visual Contract. If not, replace it with a product-specific decision rather than simply removing decoration.

## Generic visual defaults

Do not default to:

- blue-purple gradients as identity;
- gradient text for ordinary headings;
- glassmorphism without a meaningful layered context;
- blurred neon blobs as background filler;
- warm-cream + serif + clay-accent simply because it looks "editorial";
- near-black + acid accent simply because it looks "technical";
- giant marketing titles in task screens;
- excessive soft shadows;
- every surface floating independently;
- one large radius repeated everywhere;
- pills for every button, input, filter, badge, and tab;
- icons inside colored rounded squares by reflex;
- generic illustration added only to make a screen feel designed.

Replacement principle: go back to Domain World, hierarchy, and the Signature Idea.

## Composition defaults

Avoid:

- card-per-section;
- card-per-record;
- dashboard KPI strips copied onto mobile;
- desktop sidebar logic squeezed into phone width;
- empty hero space that delays useful content;
- identical section blocks that create template rhythm;
- filters that visually outweigh the content;
- floating primary actions that cover content when an in-flow/sticky action is clearer;
- center alignment in scan-heavy operational screens;
- modal/sheet flows for choices that can happen more clearly inline.

Replacement principle: choose a composition around the primary job and content shape.

## Typography defaults

Avoid:

- relying only on font-size changes for hierarchy;
- arbitrary neighboring sizes such as 15/16/17px without a meaningful scale;
- weak gray text everywhere;
- all-caps Latin labels mixed into Chinese UI purely to signal "premium";
- monospace used as a costume for "technical";
- oversized numbers with no semantic priority;
- decorative eyebrow labels above every section heading;
- generic marketing copy in product UI.

Replacement principle: let weight, contrast, line-height, alignment, and domain vocabulary carry hierarchy.

## Interaction defaults

Avoid:

- animation on every component;
- identical fade-and-slide entrance for every section;
- hover-first interactions on touch devices;
- ambiguous icon-only primary actions;
- fake controls;
- loading skeletons for content that would not plausibly load that way;
- `transition: all`;
- destructive actions styled like routine actions.

Replacement principle: motion and states should explain cause, consequence, and priority.

## Surface defaults

Avoid:

- border + shadow + tinted background on the same ordinary card;
- heavy borders where spacing already communicates grouping;
- nested rounded cards;
- decorative progress rings with no comparative advantage;
- side accent stripes added to every callout/record merely for color;
- background grids/stripes/noise with no connection to the product world.

Replacement principle: choose one depth/grouping strategy and make it serve the structure.

## De-template audit

When the rendered page still feels generic, do not add more decoration.

Ask, in order:

1. Is the primary job visible immediately?
2. Did the chosen composition survive implementation?
3. Is the signature idea visible in at least three places/states?
4. Does typography create a real hierarchy?
5. Is the rhythm varied according to content importance?
6. Could the same screenshot belong to an unrelated product?

If the answer to the last question is yes, revisit Domain World and Signature Idea rather than polishing shadows and radii.
