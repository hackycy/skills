# Intent Engine

Use this resource to determine what the mobile screen is for before choosing how it looks.

Do not expose this analysis unless the user asks for design rationale.

## Start with a use scene, not a persona label

Identify a concrete person-in-context.

Weak:

> operations user

Stronger:

> a maintenance technician checking unresolved equipment alarms while walking the floor

Weak:

> consumer

Stronger:

> a returning member opening the app in a queue to see whether a reward is available

The use scene influences density, reachability, motion, copy, and what belongs in the first viewport.

## Primary job

Express the single most important job as a verb phrase:

- triage urgent alarms;
- find and purchase an item;
- verify a transaction;
- submit a field inspection;
- compare appointment slots;
- read and save an article;
- scan inventory quickly;
- start today's training.

If several jobs compete, identify one primary and demote the rest.

The first viewport should make the primary job or its key state obvious.

## Usage frequency

- rare: onboarding, account closure, special campaign;
- occasional: booking, checkout, profile setup;
- frequent: messaging, task lists, order operations;
- continuous: monitoring, dispatch, scanning, market watch.

Frequent interfaces can support higher density and usually benefit from less decorative friction.

## Task pressure and error cost

- relaxed / exploratory;
- normal;
- time-sensitive;
- high-risk / error-sensitive.

Higher pressure means:

- less ambiguity;
- more stable alignment;
- clearer state/action distinction;
- more conservative motion;
- stronger confirmation around destructive or irreversible actions.

## Information density

Estimate required density from the task and content.

- low: one focal object or decision;
- medium: mixed content and several actions;
- high: repetitive records, monitoring, comparison, operations.

Density is a product decision, not an aesthetic preference.

## Emotional character

How much identity/mood should the interface communicate?

- low: operations, settings, high-risk utilities;
- medium: finance, productivity, booking;
- high: lifestyle, entertainment, campaigns, editorial, discovery commerce.

Emotional expression should not obscure operational meaning.

## Dominant content shape

Identify what the page is mostly made of:

- repetitive records;
- one detailed entity;
- forms/inputs;
- numbers/statuses;
- images/products;
- long text;
- map/location;
- conversations;
- time/calendar;
- steps/progress;
- route/journey.

Composition should follow content shape rather than forcing all content into cards.

## Action structure

Identify:

- primary action;
- secondary actions;
- destructive actions;
- repeated row-level actions;
- passive/read-only states.

Ask whether the primary action should be:

- always visible;
- contextual;
- inline after required information;
- sticky near the thumb;
- absent because the screen is primarily informational.

Do not use a floating action merely because mobile apps often have one.

## First-viewport contract

Internally complete:

```text
Within the first viewport, the user must be able to understand:
- ...

and must be able to do:
- ...
```

This contract helps prevent decorative headers, oversized titles, and filter chrome from consuming the screen.

## Decision heuristics

- Operational + frequent + high density -> compact hierarchy, stable scan paths, strong states, minimal ornament.
- Commerce + exploratory + image-heavy -> stronger imagery and browse rhythm, selective promotional emphasis.
- Finance + error-sensitive -> precise terminology, controlled color, strong numeric hierarchy, conservative motion.
- Content + reading -> typography and reading rhythm dominate chrome.
- Form + high risk -> progressive grouping, inline validation, explicit completion state, minimal distraction.
- Campaign + rare + emotional -> more expressive composition and motion may be justified.
- Travel/journey + time-sensitive -> current position and next action should dominate decorative destination content.
- Field use + movement/poor lighting -> larger targets, clear contrast, short labels, restrained motion.

These are tendencies, not templates.
