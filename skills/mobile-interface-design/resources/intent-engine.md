# Intent Engine

Use this resource to infer what the screen is *for* before choosing how it looks.

Do not expose this analysis unless the user asks for design rationale.

## Infer the screen along these axes

### Product character

Choose the strongest fit, or a deliberate hybrid:

- operational / industrial
- finance / account
- commerce / marketplace
- social / community
- content / reading
- lifestyle / wellness
- booking / travel / local service
- productivity / utility
- communication / support
- event / campaign
- creator / media
- education
- data / monitoring

Do not map every business product to "dashboard". Dashboard is a composition, not a product category.

### Primary user job

Express the single most important job as a verb phrase, for example:

- triage urgent alarms;
- find and purchase an item;
- check account balance and recent activity;
- submit a field inspection;
- compare available appointment slots;
- read and save an article;
- scan inventory quickly.

The page hierarchy should make this job obvious within the first viewport.

### Usage frequency

- rare: onboarding, account closure, special campaign
- occasional: booking, checkout, profile setup
- frequent: messaging, task lists, order operations
- continuous: monitoring, dispatch, scanning, trading/market watch

Frequent interfaces tolerate and often benefit from higher density and lower decoration.

### Task pressure

- relaxed / exploratory
- normal
- time-sensitive
- high-risk / error-sensitive

High-pressure interfaces should reduce ambiguity, decorative friction, and unnecessary motion.

### Information density

Estimate required density from the content and task, not from personal taste.

- low: one decision or one focal object
- medium: mixed content and several actions
- high: repetitive records, monitoring, comparison, operations

### Emotional character

How much should the interface communicate mood or identity?

- low: tools, operations, settings
- medium: finance, productivity, booking
- high: lifestyle, entertainment, campaigns, editorial, commerce discovery

### Content shape

Identify dominant content:

- repetitive list records;
- one detailed entity;
- forms/inputs;
- numbers/statuses;
- images/products;
- long text;
- map/location;
- conversations;
- time/calendar;
- steps/progress.

Choose the composition around the content shape rather than forcing everything into cards.

## Decision heuristics

- Operational + frequent + high density -> compact hierarchy, strong states, minimal ornament.
- Commerce + exploratory + image-heavy -> visual storytelling, stronger imagery, selective promotional emphasis.
- Finance + error-sensitive -> controlled color, clear numeric hierarchy, conservative motion, trust-oriented surfaces.
- Content + reading -> typography and reading rhythm dominate chrome.
- Form + high risk -> progressive grouping, inline validation, clear primary action, minimal distraction.
- Campaign + rare + emotional -> more expressive composition and motion may be appropriate.

These are tendencies, not templates.
