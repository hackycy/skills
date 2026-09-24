# Composition Search

Use this resource before the Visual Contract.

The goal is to avoid premature convergence: language models often turn the first plausible layout into the final layout. Search the information architecture briefly before styling it.

Do not show these alternatives unless the user asks for options.

## Generate 2-3 structural hypotheses

Each hypothesis must differ in hierarchy or content organization.

Valid differences:

- status-first vs object-first;
- action-first vs summary-first;
- timeline vs grouped sections;
- single focal entity vs dense record stream;
- progressive form vs one-screen form;
- image-led discovery vs category-led discovery.

Invalid differences:

- light vs dark;
- blue vs green;
- 12px vs 20px radius;
- cards vs the same cards with fewer shadows.

## Describe each hypothesis compactly

For each candidate, capture:

```text
NAME
one short structural phrase

FIRST VIEWPORT
what appears before the first meaningful scroll

SCAN PATH
what the eye/thumb is expected to do

PRIMARY ACTION
where it lives and why

DOMAIN LINK
which product-native structure or signal this composition uses

RISK
the most likely usability or implementation weakness
```

## Compare candidates

Choose the strongest direction using these lenses:

### Primary-task clarity

Can the user understand what to do or what changed within a few seconds?

### First-viewport value

Does the first screen contain useful task information rather than branding chrome, empty hero space, or controls that dominate the content?

### Scan efficiency

For repetitive data, do identifiers, states, values, and actions stay in predictable positions?

For exploratory content, does the layout create a useful path rather than a random collage?

### Domain specificity

Does the composition use something from the product's world, or could it belong unchanged to a different category?

### Thumb ergonomics

Are frequent actions reachable? Do sticky areas compete for limited viewport height? Are filters and navigation proportionate to their importance?

### Implementation realism

Can this direction be implemented robustly with the available stack, data, assets, and timeframe?

## Choose, then stop searching

Once one hypothesis clearly fits the task, commit to it.

Do not keep generating alternatives for novelty. Search exists to escape the model's first default, not to delay implementation.

## Mobile composition patterns to consider

These are prompts for reasoning, not templates.

### Status-first

Useful when exceptions, urgency, or unresolved state is the job.

Potential structure:

`summary -> severity/status controls -> prioritized records -> contextual action`

### Object-first

Useful when the user is focused on one device, booking, account, order, or media item.

Potential structure:

`identity/state -> key facts -> primary action -> supporting history/details`

### Stream-first

Useful for messages, events, activity, alarms, or repeated operational records.

Potential structure:

`compact controls -> high-signal rows -> progressive detail`

### Step-first

Useful for error-sensitive forms and submissions.

Potential structure:

`current step/context -> grouped fields -> validation -> sticky/in-flow completion action`

### Journey-first

Useful for travel, delivery, onboarding, or multi-stage processes.

Potential structure:

`current position -> sequence -> next decision -> secondary detail`

### Discovery-first

Useful for commerce, media, lifestyle, and location browsing.

Potential structure:

`one strong discovery cue -> curated groups -> progressive browse controls`

Do not choose a pattern because its name matches the product category. Choose because it organizes the user's real job.
