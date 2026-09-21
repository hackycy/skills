# Taste Engine

The Taste Engine converts page intent into a useful amount of visual expression.

It is inspired by the idea of semantic design controls, but it is intentionally page-scoped: no persistent design system is required.

## Four controls

Rate each from 1 to 10 internally.

### Creativity

How far may the page depart from conventional mobile UI composition?

- 1-3: utilitarian, familiar, task-first
- 4-6: polished with a recognizable point of view
- 7-8: expressive composition, typography, or imagery
- 9-10: campaign/editorial/art-directed; only when the context earns it

High creativity must not reduce usability.

### Density

How much meaningful information should fit on screen?

- 1-3: spacious, focal, low-content
- 4-7: balanced daily-app density
- 8-10: compact operational/cockpit density

Density is not the same as visual clutter. High-density UI needs stronger alignment and hierarchy.

### Variance

How much structural variation/asymmetry should the composition use?

- 1-3: predictable, repetitive, efficient
- 4-6: controlled variation between sections
- 7-8: visibly art-directed or editorial
- 9-10: intentionally unconventional; rarely suitable for task-heavy H5

### Motion

How prominent should animation be?

- 1-3: state feedback only
- 4-6: smooth transitions and useful micro-interactions
- 7-8: expressive choreography in consumer/marketing experiences
- 9-10: cinematic; only when motion is central to the experience

Always honor reduced-motion preferences when implementing significant animation.

## Typical starting profiles

Use these only as calibration references. Adapt to the actual brief.

| Context | Creativity | Density | Variance | Motion |
|---|---:|---:|---:|---:|
| warehouse / field operations | 2 | 9 | 1 | 1 |
| monitoring / alarm center | 3 | 9 | 2 | 2 |
| B2B task management | 4 | 7 | 3 | 2 |
| finance account | 4 | 6 | 3 | 2 |
| booking / local service | 5 | 5 | 4 | 3 |
| consumer membership | 6 | 4 | 5 | 4 |
| commerce discovery | 7 | 5 | 6 | 4 |
| editorial / lifestyle | 7 | 3 | 7 | 3 |
| event / launch campaign | 9 | 3 | 8 | 7 |

## Translate controls into design decisions

### Low creativity

Prefer:

- familiar navigation;
- explicit labels;
- restrained palettes;
- strong alignment;
- low-risk type choices;
- minimal decorative surfaces.

Do not make it bland. Quality comes from hierarchy, spacing, type, and state design.

### High creativity

Permit one or two strong ideas, for example:

- distinctive type scale;
- editorial section composition;
- dramatic image crop;
- unexpected but usable navigation treatment;
- intentional asymmetry;
- a strong color relationship.

Do not stack every effect at once.

### High density

Use:

- compact but readable type;
- short labels;
- list/table-like alignment where appropriate;
- separators and grouping before cards;
- stable spatial rhythm;
- persistent filters/actions when valuable.

### Low density

Allow:

- larger focal content;
- more whitespace;
- stronger imagery;
- fewer simultaneous actions.

### High variance

Variation should correspond to content importance. Random offsets are not art direction.

### High motion

Motion should express causality, hierarchy, or brand mood. Avoid animation that delays frequent tasks.

## Atmosphere vocabulary

Select 3-6 words that point in one direction. Examples:

- restrained, precise, trustworthy, quiet
- warm, tactile, editorial, intimate
- energetic, youthful, crisp, playful
- technical, compact, utilitarian, decisive
- premium, dark, cinematic, sparse
- fresh, airy, optimistic, friendly
- dense, analytical, controlled, high-signal

Avoid contradictory piles such as "minimal, maximalist, playful, corporate, brutalist" unless the tension is intentional and explainable.

## Taste rule

The page should have one dominant visual thesis and at most one secondary accent idea.

Good: "compact operational interface with unusually strong status typography."

Weak: "modern clean UI with cards, gradients, glass, bold fonts, soft shadows, neon icons, and minimalism."
