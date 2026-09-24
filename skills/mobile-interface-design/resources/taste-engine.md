# Taste Engine

The Taste Engine calibrates how much visual expression the page can support after intent, domain material, and composition are understood.

It is page-scoped. No persistent design system is required.

## Four controls

Rate each from 1 to 10 internally.

### Creativity

How far may the page depart from familiar mobile product composition?

- 1-3: utilitarian, familiar, task-first;
- 4-6: polished with a recognizable point of view;
- 7-8: expressive composition, typography, imagery, or interaction;
- 9-10: art-directed/campaign-like; rarely appropriate for repeated product tasks.

High creativity never excuses unclear hierarchy or hidden actions.

### Density

How much meaningful information should fit on screen?

- 1-3: spacious, focal, low-content;
- 4-7: balanced daily-app density;
- 8-10: compact operational/cockpit density.

Density is not clutter. High density requires stronger alignment, stable scan paths, and tighter typography discipline.

### Variance

How much structural variation or asymmetry should sections use?

- 1-3: predictable and repetitive for speed;
- 4-6: controlled changes in rhythm;
- 7-8: visibly art-directed or editorial;
- 9-10: intentionally unconventional and rarely suitable for task-heavy H5.

Variance should track content importance. Random offsets are not art direction.

### Motion

How prominent should animation be?

- 1-3: state feedback only;
- 4-6: useful transitions and a few authored moments;
- 7-8: expressive choreography for infrequent consumer experiences;
- 9-10: motion-centered experience.

Motion must communicate causality, hierarchy, continuity, or brand mood. Repeated task screens should not make users wait for animation.

Always honor reduced-motion preferences for meaningful motion.

## Expression budget

In addition to the four numeric controls, explicitly choose where visual boldness is spent.

Example:

```text
BOLD
severity typography and status rail

QUIET
background, row containers, navigation chrome, secondary metadata
```

Another:

```text
BOLD
reward-progress focal object and warm editorial type

QUIET
transaction list, bottom navigation, secondary controls
```

A page with everything emphasized has no point of view.

## Typical starting profiles

Use these as calibration references only.

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

## Translate controls into decisions

### Low creativity

Prefer:

- familiar navigation;
- explicit labels;
- stable alignment;
- restrained palette;
- low-risk interaction patterns;
- quality expressed through hierarchy, spacing, type, and states.

Low creativity is not permission to be generic.

### High creativity

Permit one or two strong ideas:

- a domain-derived composition;
- distinctive type hierarchy;
- dramatic but useful crop/imagery;
- controlled asymmetry;
- a strong color relationship;
- an interaction that clarifies a product concept.

Do not stack effects.

### High density

Prefer:

- compact readable type;
- stable row anatomy;
- short labels;
- alignment over containers;
- separators/spacing before card-per-record;
- persistent controls only when they save repeated work.

### Low density

Permit:

- larger focal content;
- more whitespace;
- stronger imagery;
- fewer simultaneous actions.

## Atmosphere vocabulary

Choose 3-6 words pointing in one coherent direction.

Examples:

- restrained, precise, trustworthy, quiet;
- warm, tactile, editorial, intimate;
- energetic, crisp, athletic, direct;
- technical, compact, utilitarian, decisive;
- premium, dark, cinematic, sparse;
- fresh, airy, optimistic, friendly;
- dense, analytical, controlled, high-signal.

Avoid generic adjectives that do not constrain implementation: "modern", "clean", "beautiful", "premium" by themselves are insufficient.

Avoid contradictory piles unless the tension is intentional and can be translated into design decisions.

## Taste rule

The page should have one dominant visual thesis, one signature idea, and at most one secondary accent idea.

Good:

> compact maintenance interface with a severity rail that organizes scanning across summary, filter, and rows.

Weak:

> modern clean UI with cards, gradients, glass, bold fonts, soft shadows, neon icons, and minimalism.
