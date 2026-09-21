---
name: mobile-interface-design
description: Design and implement polished mobile-first interfaces for H5 pages, mobile web, and app WebViews when no UI mockup is available.
disable-model-invocation: true
---

# Mobile Interface Design

Design the page, then build it. Do not require a mockup, design file, or persistent design system.

The core loop is:

`requirement -> page intent -> taste profile -> visual contract -> implementation -> rendered review -> refinement`

Each page may have a different visual character. Never invent or require a project-wide `DESIGN.md` unless the user explicitly asks for one.

## Mission

Turn incomplete business requirements into a visually coherent, production-oriented mobile H5 interface that:

- feels intentionally designed for the specific product and task;
- works at phone widths rather than looking like a desktop page shrunk down;
- uses real HTML/CSS/JavaScript and real interaction states;
- avoids generic AI UI defaults unless they genuinely fit the brief;
- can be handed directly to a frontend engineer or used as the implementation itself.

## Default behavior

Default to action. Do not stop at design advice, wireframes, UX essays, or component inventories when the user asked for a page. Implement the page.

Do not ask for a design file. Infer reasonable visual decisions from the business context. Ask a question only when a missing requirement would materially change the product behavior or make implementation unsafe; otherwise make a sensible assumption and proceed.

Do not narrate the internal design process unless the user asks for it.

## Inputs to inspect

Before designing, inspect the current project when available:

- existing HTML/templates/components;
- package manager and framework configuration;
- CSS/Tailwind/theme files;
- icons, fonts, and image assets;
- routing and existing interaction conventions.

Existing product code is context, not a mandatory visual system. Preserve technical integration and working behavior, but do not mechanically copy weak styling when the request is for a new design or redesign.

## Optional frontend-design dependency

If a `frontend-design` skill is installed and available, load it before implementation and use it as the visual execution layer. Treat this skill as the orchestrator: this skill decides intent, taste, mobile constraints, and review criteria; `frontend-design` helps execute the chosen visual direction.

If `frontend-design` is unavailable, continue using the design execution principles in this skill and its resources. Never block the task on that dependency.

## Required resources

Read these files as needed:

1. `resources/intent-engine.md` — infer what kind of page this is and what matters most.
2. `resources/taste-engine.md` — choose page-specific atmosphere, creativity, density, variance, and motion.
3. `resources/visual-contract.md` — commit to one coherent visual direction before writing CSS.
4. `resources/mobile-h5-rules.md` — technical constraints for mobile browser/WebView UI.
5. `resources/anti-patterns.md` — generic AI UI defaults to avoid unless justified.
6. `resources/visual-review.md` — rendered visual QA and refinement loop.

Do not dump these resources into the user response. Apply them.

# Workflow

## 1. Resolve the page intent

Infer, internally:

- product domain;
- likely user;
- primary job of this screen;
- interaction frequency;
- information density;
- emotional vs operational character;
- urgency/risk level;
- content types;
- primary and secondary actions.

Use `resources/intent-engine.md`.

If the request is vague, select a concrete, plausible interpretation that best matches the supplied business nouns and actions. Do not default every page to a SaaS dashboard.

## 2. Infer a taste profile

Use `resources/taste-engine.md` to choose a page-specific profile. At minimum establish:

- Creativity: 1-10
- Density: 1-10
- Variance: 1-10
- Motion: 1-10
- 3-6 atmosphere/visual keywords

These are reasoning controls, not user-facing settings. Infer them automatically unless the user gives an explicit style direction.

The purpose is not to maximize creativity. The purpose is to select the right amount of visual expression for this task.

## 3. Commit to a Visual Contract

Before writing implementation code, form one concise internal Visual Contract using `resources/visual-contract.md`.

The contract must choose, rather than hedge between:

- visual archetype;
- composition strategy;
- hierarchy strategy;
- typography character;
- color strategy;
- surface/elevation strategy;
- shape/radius tendency;
- imagery/icon strategy;
- interaction/motion character;
- deliberate anti-pattern exclusions.

Do not produce three competing styles unless the user asked for alternatives. For implementation tasks, pick one direction and build it.

## 4. Design through content, not decoration

Make visual decisions from the subject matter and the screen's job.

Prioritize in this order:

1. information hierarchy;
2. composition and spatial rhythm;
3. typography;
4. interaction affordance;
5. semantic color;
6. borders/surfaces/elevation;
7. decoration.

Do not compensate for weak hierarchy with gradients, shadows, pills, cards, or decorative shapes.

## 5. Implement real H5

Follow the project's existing stack if one exists.

If no stack is specified, default to:

- semantic HTML;
- modern CSS;
- vanilla JavaScript;
- no build step required.

When the user explicitly requests React, Vue, Svelte, Tailwind, a component library, or another stack, use that stack while keeping all mobile and taste rules.

Implementation must include realistic content and the states necessary to understand the UI. Do not generate non-functional presentation-only mock markup when the requested controls can reasonably work.

Use `resources/mobile-h5-rules.md`.

## 6. Avoid generic defaults

Before considering the implementation complete, apply `resources/anti-patterns.md`.

A listed pattern is not universally forbidden. It is forbidden as an unexplained default. It may be used when it strongly supports the Visual Contract and product context.

## 7. Render and review when tools allow

If a browser, Playwright, browser MCP, screenshot tool, or equivalent rendering capability is available:

1. run the page;
2. render at 390px width first;
3. capture or inspect the full page;
4. review it using `resources/visual-review.md`;
5. modify the implementation directly;
6. re-render;
7. repeat until there are no high-impact visual issues, normally 1-3 refinement passes;
8. spot-check a narrow phone around 375px and a wide phone around 430px.

The first render is a draft, not proof of quality.

Do not ask the user to perform the visual review for you if browser tooling is available.

If browser tooling is unavailable, perform a static review and state only that rendered visual QA was not available; do not claim the page was visually verified.

## 8. Run static validation

When Node.js is available and the output is HTML/CSS/JS, run:

`node scripts/validate-mobile-h5.mjs <html-file>`

If this skill is installed outside the project, use the validator at this skill's own path.

Treat validator output as heuristics. Fix clear failures and high-confidence warnings; do not distort an intentional design merely to silence a weak heuristic.

# Output policy

When the user asked for implementation:

- edit/create the actual project files;
- keep the final explanation concise;
- mention the implemented page and important interactions;
- mention rendered visual verification only if it actually occurred;
- do not output long design rationale by default.

When the user asked only for a visual concept, produce the concept in the richest visual form supported by the environment instead of writing a long specification.

# Quality bar

A successful result should feel like a plausible shipped mobile product, not a prompt demo.

It should have:

- a clear visual point of view appropriate to the business context;
- deliberate hierarchy and rhythm;
- no accidental horizontal overflow;
- touch-friendly interaction;
- believable empty/loading/error/disabled states when relevant;
- coherent icons and typography;
- restrained use of special effects;
- mobile-specific navigation and action placement;
- visually intentional treatment at 375-430px widths.

If the page is technically correct but visually generic, the task is not finished.
