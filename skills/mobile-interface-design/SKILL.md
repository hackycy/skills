---
name: mobile-interface-design
description: Design and implement distinctive, production-oriented mobile-first interfaces for H5 pages, mobile web, and app WebViews when no UI mockup is available.
disable-model-invocation: true
---

# Mobile Interface Design

Design the page, then build it. Do not require a mockup, design file, or persistent design system.

This skill is page-scoped by default, but **product-aware whenever product context exists**. A page may receive a distinct composition, but it should not silently invent a new visual language when the surrounding product already has one.

The core loop is:

`requirement -> product truth -> use mode -> domain material -> composition search -> expression profile -> authored-idea gate -> visual contract -> implementation -> rendered critique -> de-template audit -> refinement`

The goal is not merely to avoid ugly or generic UI. The goal is to make enough deliberate decisions that the result feels specific to the product, task, and mobile use context **without forcing every page to perform a design concept**.

## Mission

Turn incomplete business requirements into a coherent, production-oriented mobile interface that:

- feels intentionally designed for this product rather than assembled from mobile defaults;
- makes the page's dominant outcome or use mode legible early;
- derives structure and expression from the product's own world where useful;
- uses real HTML/CSS/JavaScript and real interaction states;
- remains usable at phone widths and in constrained WebViews;
- preserves product-wide visual and interaction conventions when they already exist;
- can be handed directly to a frontend engineer or used as the implementation itself.

## Default behavior

Default to action. When the user asks for a page, implement the page rather than stopping at design advice, wireframes, UX essays, or component inventories.

Do not ask for a design file. Infer reasonable visual decisions from business and product context. Ask only when a missing requirement would materially change product behavior, data meaning, safety, integration, or navigation semantics.

Do not narrate internal design exploration unless the user asks for rationale.

Do not require a project-wide `DESIGN.md`. When an existing product system is present, inherit it. When none exists, create a disposable page-level direction unless the user explicitly asks to preserve one.

## Precedence and optional dependencies

Inspect project-specific instructions first.

If a `frontend-design` skill is installed and available, it may be loaded as a visual craft dependency. Use it for typography, composition craft, distinctive execution, and anti-template guidance.

This skill remains authoritative for:

- mobile task hierarchy and use mode;
- phone-scale density and ergonomics;
- navigation and action placement;
- WebView/browser constraints;
- touch behavior;
- page-scoped decisions and continuity with the surrounding product.

Do not let generic web or marketing guidance turn an app/product screen into a landing page.

If `frontend-design` is unavailable, continue with this skill and its resources.

## Inputs to inspect

Before designing, inspect the current project when available:

- existing routes, templates, screens, and components;
- framework and package configuration;
- CSS/Tailwind/theme/token files;
- icons, fonts, and image assets;
- interaction, navigation, and state conventions;
- existing API/data contracts relevant to the screen;
- nearby screens that establish product-wide visual language.

Existing code is product and integration context, not automatically a good design system. Preserve behavior, data meaning, accessibility, and stack conventions while permitting a new direction when redesign is requested.

## Resources

Load only what the current task needs:

1. `resources/intent-engine.md` — identify person-in-context, dominant outcome/use mode, pressure, content shape, and mobile priorities.
2. `resources/domain-world.md` — extract product-native structure and language without forcing visual theming.
3. `resources/composition-search.md` — explore structurally different compositions using axes, not named page templates.
4. `resources/taste-engine.md` — choose semantic expression, density, rhythm, and motion levels with task rationale.
5. `resources/visual-contract.md` — commit to one concrete page direction; authored signature is optional and must pass a gate.
6. `resources/craft-floor.md` — minimum visual and interaction craft expected from the shipped result.
7. `resources/mobile-h5-rules.md` — technical constraints for mobile browsers and WebViews.
8. `resources/anti-patterns.md` — common model defaults, including forced signatures and over-authored product screens.
9. `resources/visual-review.md` — rendered critique, continuity, distinctiveness, and refinement loop.

Do not dump these resources into the user response. Apply them.

# Workflow

## 1. Preserve product truth

Before visual exploration, identify what must not be invented or visually distorted:

- business meaning and terminology;
- required information;
- real primary and secondary actions;
- dangerous/destructive actions;
- data relationships;
- existing navigation semantics;
- explicit brand constraints;
- behavior that already works and must remain compatible.

When demo data is necessary, make it plausible and clearly illustrative. Do not invent business claims, guarantees, pricing, or operational facts and present them as real.

## 2. Resolve intent and use mode

Use `resources/intent-engine.md`.

Internally establish:

- who is using the screen and in what situation;
- the **dominant outcome or use mode**, not necessarily a single action;
- usage frequency;
- task pressure/risk;
- information density;
- emotional character;
- dominant content shape;
- action structure;
- what must earn space near the top of the viewport.

A screen may be task-led, scan-led, compare-led, monitor-led, browse-led, read-led, conversation-led, or form-led. Do not force every page into “one primary CTA”.

The first viewport must **earn its space**. It should establish useful context, content, state, or action; it does not always need to complete the job or expose a large CTA.

## 3. Build a Domain World

Use `resources/domain-world.md`.

Extract product-native material before styling:

- domain objects, signals, relationships, units, sequences, and vocabulary;
- plausible colors/material qualities/light conditions only when they genuinely help;
- characteristic information forms;
- category-default treatments to reject and better grounded replacements.

Domain material may influence **information order, copy, grouping, state, or interaction without becoming visible theming**. Do not turn every product into a themed costume.

## 4. Search compositions before styling

Use `resources/composition-search.md`.

Before committing to a Visual Contract, internally explore 2–3 materially different structural hypotheses **when the structure is genuinely open**. For simple or strongly constrained screens, one well-justified composition is enough.

Explore using structural questions such as:

- What leads: state, object, action, sequence, time, location, content, or conversation?
- What remains visible while acting?
- What is scanned repeatedly versus opened for detail?
- What belongs inline versus in a sheet or next screen?
- What should scroll and what, if anything, deserves persistence?

Do not classify the page by a named archetype and then fill in its usual parts.

Choose the composition that best supports task/use-mode clarity, viewport value, scan efficiency, ergonomics, product specificity, continuity, and implementation realism.

## 5. Infer an expression profile

Use `resources/taste-engine.md`.

Choose semantic levels and give each a task reason:

- Expression: restrained / balanced / expressive
- Density: sparse / balanced / dense
- Rhythm: stable / varied / editorial
- Motion: minimal / functional / expressive
- 3–6 atmosphere words
- expression budget: where boldness is useful and what stays quiet

Do not use numerical 1–10 scores. They create false precision and category stereotypes.

## 6. Run the Authored-Idea Gate

A distinctive authored idea is **optional**.

Ask:

- Would a special visual/structural/interaction idea materially improve comprehension, task flow, domain recognition, or brand experience?
- Can it survive removal of decorative styling?
- Does this page have enough expressive latitude, or should it mainly continue the surrounding product system?

If yes, define one authored idea and let it have as many consequences as naturally follow from it. There is **no minimum manifestation count**.

If no, explicitly choose restraint. The correct design decision may be continuity, clarity, and absence of a page-specific signature.

Never invent a metaphor solely because the skill expects one.

## 7. Commit to a concrete Visual Contract

Use `resources/visual-contract.md`.

Commit before implementation. The contract should include only fields that affect this page:

- thesis and dominant use mode;
- chosen composition;
- hierarchy/attention strategy;
- inherited product-system decisions versus page-specific decisions;
- optional authored idea, if it passed the gate;
- expression profile and budget;
- typography;
- color strategy and actual tokens;
- spacing/density;
- surfaces/depth/radius;
- imagery/icon strategy;
- interaction/motion character;
- explicit defaults to avoid.

Do not leave “either/or” choices unresolved. Do not let adjectives substitute for implementation decisions.

## 8. Design through content, not decoration

Prioritize:

1. product truth;
2. use mode and information hierarchy;
3. composition and spatial rhythm;
4. typography;
5. interaction affordance;
6. semantic color;
7. surfaces/elevation;
8. decoration.

Do not compensate for weak hierarchy with gradients, shadows, pills, cards, blobs, animation, or forced domain motifs.

Copy is part of interface design. Controls should name what happens. Empty/error states should explain the next useful action.

## 9. Implement real mobile UI

Follow the project's existing stack when one exists.

If no stack is specified, default to semantic HTML, modern CSS, vanilla JavaScript, and no build step.

When the user requests React, Vue, Svelte, Tailwind, a component library, or another stack, use it while retaining mobile, craft, and design-search rules.

Implement only interactions implied by the requirement or necessary for the chosen flow. Examples such as filters, tabs, sheets, toggles, validation, or submitting states are **not expected coverage lists**.

Use `resources/mobile-h5-rules.md` and `resources/craft-floor.md`.

## 10. Render and critique

If rendering capability is available:

1. run the page;
2. review at a representative phone width, using ~390px as a practical baseline rather than a design canvas;
3. inspect the whole page before components;
4. review using `resources/visual-review.md`;
5. fix high-impact issues in a coherent batch;
6. re-render;
7. repeat until no high-impact issues remain, normally 1–3 passes;
8. spot-check narrower and wider phone widths around 375–430px, plus product-specific device constraints if known.

The first render is a draft, not proof of quality.

If rendering is unavailable, perform a static critique and state only that rendered visual QA was unavailable.

## 11. Run the de-template audit

Use `resources/anti-patterns.md`.

### Replacement test

If product nouns were replaced with an unrelated category, could the same composition, palette, typography, surfaces, and icon treatment remain unchanged?

If yes, revisit the most generic layer. Do not add decoration merely to become different.

### Authorship test

If an authored idea was chosen, did it survive implementation in a useful way? If none was chosen, does the page still feel deliberate through hierarchy, content, continuity, and craft?

A page **passes without a signature** when restraint was the correct decision.

### Squint test

When blurred or viewed at a glance, does the attention strategy still work? A task-led screen may have a focal path; a monitoring or browse surface may have stable scan anchors instead.

## 12. Run static validation

When Node.js is available and the output is HTML/CSS/JS, run:

`node scripts/validate-mobile-h5.mjs <html-file>`

Treat validator output as heuristics. Fix clear failures and high-confidence warnings. Never distort an intentional design merely to silence a detector.

# Output policy

When the user asked for implementation:

- edit/create actual project files;
- keep the final explanation concise;
- mention the implemented screen and important interactions;
- mention rendered visual verification only when it occurred;
- do not output internal exploration or Visual Contract unless requested.

When the user asked only for a visual concept, produce the concept in the richest visual form supported by the environment rather than a long prose specification.

# Quality bar

A successful result should feel like a plausible shipped mobile product, not a prompt demo.

It should have:

- a clear dominant outcome or use mode;
- useful first-viewport content/context with no wasted hero chrome;
- a visual point of view grounded in product context, or deliberate continuity when restraint is better;
- deliberate hierarchy, density, and rhythm;
- typography that carries hierarchy rather than merely delivering text;
- restrained and meaningful color/depth/effects;
- touch-friendly interaction and mobile-native navigation when justified;
- believable loading/empty/error/disabled states when relevant;
- coherent icons and content language;
- no accidental horizontal overflow;
- resilient treatment across common phone widths;
- no obvious interchangeable AI-template structure;
- no forced signature, metaphor, CTA, bottom navigation, sheet, or card pattern merely because the page is mobile.

If the page is technically correct but interchangeable with unrelated products, refine it. If it is distinctive only because it is over-authored, simplify it.
