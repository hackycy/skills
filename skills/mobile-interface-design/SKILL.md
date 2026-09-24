---
name: mobile-interface-design
description: Design and implement distinctive, production-oriented mobile-first interfaces for H5 pages, mobile web, and app WebViews when no UI mockup is available.
disable-model-invocation: true
---

# Mobile Interface Design

Design the page, then build it. Do not require a mockup, design file, or persistent design system.

This skill is page-scoped. It exists for mobile product surfaces that must be designed from requirements, not for maintaining a global brand system.

The core loop is:

`requirement -> product truth -> page intent -> domain world -> composition search -> taste profile -> signature idea -> visual contract -> implementation -> rendered critique -> de-template audit -> refinement`

The goal is not merely to avoid ugly or generic UI. The goal is to make enough deliberate design decisions that the result feels specific to the product, task, and use context.

## Mission

Turn incomplete business requirements into a visually coherent, production-oriented mobile interface that:

- feels intentionally designed for this product rather than assembled from common UI defaults;
- makes the primary mobile task obvious within the first viewport;
- derives visual character from the product's own world, not from fashionable templates;
- uses real HTML/CSS/JavaScript and real interaction states;
- remains usable at phone widths and in constrained WebViews;
- can be handed directly to a frontend engineer or used as the implementation itself.

## Default behavior

Default to action. When the user asks for a page, implement the page rather than stopping at design advice, wireframes, UX essays, or component inventories.

Do not ask for a design file. Infer reasonable visual decisions from the business context. Ask a question only when a missing requirement would materially change product behavior, data meaning, safety, or integration; otherwise make a concrete assumption and proceed.

Do not narrate internal design exploration unless the user asks for rationale.

Do not create or require a project-wide `DESIGN.md`. This skill creates a disposable page-level design direction unless the user explicitly asks to preserve a system.

## Precedence and optional dependencies

Inspect project-specific instructions first.

If a `frontend-design` skill is installed and available, it may be loaded as a visual craft dependency. Use it for typography, composition craft, distinctive execution, and anti-template guidance.

This skill remains authoritative for:

- mobile product hierarchy;
- first-viewport utility;
- phone-scale density and ergonomics;
- navigation and action placement;
- WebView/browser constraints;
- touch behavior;
- page-scoped design decisions.

Do not let generic web or marketing guidance turn an app/product screen into a landing page.

If `frontend-design` is unavailable, continue with this skill and its resources. Never block the task on the dependency.

## Inputs to inspect

Before designing, inspect the current project when available:

- existing routes, templates, screens, and components;
- framework and package configuration;
- CSS/Tailwind/theme/token files;
- icons, fonts, and image assets;
- interaction, navigation, and state conventions;
- existing API/data contracts relevant to the screen.

Existing code is product and integration context, not automatically a good visual system. Preserve behavior, data meaning, accessibility, and stack conventions while permitting a new visual direction when redesign is requested.

## Resources

Load only what the current task needs:

1. `resources/intent-engine.md` — identify user, job, pressure, content shape, and mobile priorities.
2. `resources/domain-world.md` — extract product-native visual material and reject category clichés.
3. `resources/composition-search.md` — internally explore structurally different mobile compositions before committing.
4. `resources/taste-engine.md` — calibrate creativity, density, variance, motion, and atmosphere.
5. `resources/visual-contract.md` — commit to one concrete page direction, signature idea, and implementation tokens.
6. `resources/craft-floor.md` — minimum visual and interaction craft expected from the shipped result.
7. `resources/mobile-h5-rules.md` — technical constraints for mobile browsers and WebViews.
8. `resources/anti-patterns.md` — common model defaults and how to replace them with decisions.
9. `resources/visual-review.md` — rendered critique, distinctiveness tests, and refinement loop.

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

## 2. Resolve page intent

Use `resources/intent-engine.md`.

Internally establish:

- who is using the screen and in what situation;
- the single primary job;
- usage frequency;
- task pressure/risk;
- information density;
- emotional character;
- dominant content shape;
- primary and secondary actions;
- what must be understood in the first viewport.

Express the primary job as a verb phrase. If the hierarchy cannot be tied to that job, it is not yet a design decision.

## 3. Build a Domain World

Use `resources/domain-world.md`.

Extract product-native material before selecting UI style:

- 5-8 domain objects, materials, signals, metaphors, or visual phenomena;
- 4-6 plausible colors/material qualities/light conditions from the domain;
- characteristic vocabulary or data forms;
- one candidate signature element;
- three category-default treatments to reject and domain-grounded replacements.

The purpose is not literal skeuomorphism. The purpose is to give the model more specific design material than "modern", "clean", or "premium".

Use the removal test: if the product name disappeared, the domain clues should still make the intended world guessable.

## 4. Search compositions before styling

Use `resources/composition-search.md`.

Before committing to a Visual Contract, internally produce 2-3 structurally different composition hypotheses.

They must differ in hierarchy or information architecture, not merely color, radius, or theme. Examples:

- status-first vs object-first;
- timeline-first vs card-list;
- task-first vs summary-first;
- single focal object vs progressive groups.

Compare the hypotheses by:

- primary-task clarity;
- first-viewport usefulness;
- scan efficiency;
- domain specificity;
- thumb ergonomics;
- implementation realism.

Choose one. Do not expose alternatives unless the user requested them.

This step exists to prevent the model's first plausible layout from automatically becoming the final layout.

## 5. Infer a taste profile

Use `resources/taste-engine.md`.

At minimum establish internally:

- Creativity: 1-10
- Density: 1-10
- Variance: 1-10
- Motion: 1-10
- 3-6 atmosphere words
- expression budget: where the page is allowed to be bold and where it should stay quiet

The purpose is not to maximize expression. It is to choose how much visual personality the task can support without sacrificing clarity.

## 6. Choose one Signature Idea

A finished page needs at least one design decision that is specific enough to be memorable and useful.

The signature may be:

- a domain-derived information structure;
- a distinctive status treatment;
- a meaningful progress metaphor;
- a characteristic type treatment;
- an unusual but usable navigation relationship;
- a content-specific spatial rhythm;
- imagery or data presentation that belongs to the subject.

It must affect real UI, not exist as decorative wallpaper.

Internally answer:

- What is the signature idea?
- Why does it belong to this product?
- Where will it appear in at least 3 visible places or states?
- What surrounding elements should stay restrained so the signature has room to work?

If the answer is only "overall vibe", the signature is not concrete enough.

## 7. Commit to a concrete Visual Contract

Use `resources/visual-contract.md`.

Choose one direction and commit before implementation. The contract must include:

- archetype and thesis;
- chosen composition;
- hierarchy;
- signature idea;
- taste profile and expression budget;
- typography decisions;
- color strategy and actual page-level color tokens;
- spacing/density tokens;
- surfaces/depth/radius strategy;
- imagery/icon strategy;
- interaction/motion character;
- explicit defaults to avoid.

Do not write "either/or". Do not leave the contract at adjectives such as "technical", "warm", or "premium". Translate the direction into enough concrete tokens that implementation cannot silently fall back to generic CSS habits.

## 8. Design through content, not decoration

Prioritize in this order:

1. product truth;
2. information hierarchy;
3. composition and spatial rhythm;
4. typography;
5. interaction affordance;
6. semantic color;
7. surfaces/elevation;
8. decoration.

Do not compensate for weak hierarchy with gradients, shadows, pills, cards, blobs, or animation.

Copy is part of interface design. Controls should name what happens. Empty/error states should explain the next useful action. Avoid filler copy that sounds like generic product marketing.

## 9. Implement real mobile UI

Follow the project's existing stack when one exists.

If no stack is specified, default to:

- semantic HTML;
- modern CSS;
- vanilla JavaScript;
- no build step.

When the user requests React, Vue, Svelte, Tailwind, a component library, or another stack, use it while retaining all mobile, craft, and design-search rules.

Implementation should include realistic content and the states necessary to understand the interface. Controls that can reasonably work should work.

Use `resources/mobile-h5-rules.md` and `resources/craft-floor.md`.

## 10. Render and critique

If a browser, Playwright, browser MCP, screenshot tool, or equivalent rendering capability is available:

1. run the page;
2. render at 390px width first;
3. inspect the whole page before individual components;
4. review it using `resources/visual-review.md`;
5. fix high-impact issues in one coherent batch;
6. re-render;
7. repeat until no high-impact design issues remain, normally 1-3 passes;
8. spot-check around 375px and 430px.

The first render is a draft, not proof of quality.

Do not ask the user to perform visual review when the agent can do it.

If rendering is unavailable, perform a static critique and say only that rendered visual QA was unavailable. Do not claim visual verification.

## 11. Run the de-template audit

Before considering the page done, use `resources/anti-patterns.md` and apply three tests:

### Replacement test

If the product nouns were replaced with a different category, could the same composition, palette, typography, surfaces, and icon treatment remain unchanged?

If yes, the design is insufficiently grounded. Revisit the Domain World and Signature Idea.

### Signature test

Can at least three visible decisions be pointed to as consequences of the signature idea?

If no, the page has a written concept but not a designed concept.

### Squint test

When visually blurred or viewed at a glance, is there still one clear focal path and a readable rhythm of dense vs quiet regions?

If no, fix hierarchy and composition before micro-polish.

## 12. Run static validation

When Node.js is available and the output is HTML/CSS/JS, run:

`node scripts/validate-mobile-h5.mjs <html-file>`

If this skill is installed outside the project, use the validator at this skill's own path.

Treat validator output as heuristics. Fix clear failures and high-confidence warnings. Never distort an intentional design merely to silence a detector.

# Output policy

When the user asked for implementation:

- edit/create the actual project files;
- keep the final explanation concise;
- mention the implemented screen and important interactions;
- mention rendered visual verification only when it actually occurred;
- do not output the internal Domain World, composition candidates, or Visual Contract unless requested.

When the user asked only for a visual concept, produce the concept in the richest visual form supported by the environment rather than a long prose specification.

# Quality bar

A successful result should feel like a plausible shipped mobile product, not a prompt demo.

It should have:

- a clear primary job visible in the first viewport;
- a visual point of view grounded in the product's world;
- one recognizable signature idea with visible consequences;
- deliberate hierarchy, density, and rhythm;
- typography that carries hierarchy rather than merely delivering text;
- restrained and meaningful color/depth/effects;
- touch-friendly interaction and mobile-native navigation;
- believable loading/empty/error/disabled states when relevant;
- coherent icons and content language;
- no accidental horizontal overflow;
- resilient treatment from roughly 375-430px;
- no obvious interchangeable AI-template structure.

If the page is technically correct but visually interchangeable with unrelated products, the task is not finished.
