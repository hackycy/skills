# Domain World

Use this resource after page intent and before composition or styling.

The purpose is to give the design concrete material from the product's own world. A model that starts with UI vocabulary tends to produce UI templates. Start with the subject matter instead.

Do not expose this exploration unless the user asks for rationale.

## Extract five kinds of material

### 1. Domain objects and signals

List 5-8 things that belong naturally to the product's world.

Prefer concrete nouns and observable signals over generic business concepts.

Weak:

- efficiency
- trust
- insights
- productivity

Stronger examples:

- running: lane markings, lap splits, cadence, route traces, race bibs, reflective gear;
- logistics: dock doors, manifests, container seals, scan codes, loading windows, route states;
- coffee membership: roast labels, cup fill, stamp cards, origin notes, receipt marks;
- finance: ledger entries, settlement states, account balance, merchant receipts, date grouping;
- field maintenance: equipment plates, severity lamps, inspection marks, work-order stages.

These are not instructions to imitate physical objects literally. They are raw material for hierarchy, rhythm, color, iconography, and interaction.

### 2. Color/material/light world

Identify 4-6 plausible colors, materials, textures, or lighting conditions that occur naturally in the domain.

Examples:

- asphalt charcoal, track oxide, reflective lime, dawn blue;
- thermal paper white, ink black, terminal green, warning amber;
- ceramic cream, roasted brown, milk foam, copper equipment;
- matte enclosure gray, safety yellow, status red, cool display blue.

Translate these into interface color only after checking contrast and context.

Avoid choosing color from category habit alone. "Finance = blue" and "technical = dark mode" are not design reasons.

### 3. Characteristic information forms

Look for domain-native structures:

- sequences;
- routes;
- levels;
- batches;
- comparisons;
- status bands;
- timestamps;
- maps;
- measurements;
- conversations;
- collections;
- checkpoints.

These can suggest composition more productively than deciding "cards or no cards".

### 4. Language and tone

Note the nouns, verbs, units, labels, and sentence style users expect.

A field operator may need terse status language. A lifestyle membership screen can be warmer. A financial detail view should favor precise, stable terminology.

Do not invent jargon merely to make the UI sound branded.

### 5. Candidate signature element

Propose one visual/structural/interaction idea that could plausibly belong to this product.

A signature element should:

- reinforce comprehension or task flow;
- derive from domain material;
- survive removal of decorative styling;
- appear in multiple visible places/states;
- remain usable on a phone.

Examples:

- an alarm severity rail that aligns summary, filters, and list rows;
- a route strip that unifies a trip overview with stops and live status;
- reward progress expressed through fill/accumulation rather than a generic progress ring;
- split-time typography that organizes a running activity screen.

## Reject category defaults

Identify three likely clichés for this kind of page, then replace each with a domain-grounded choice.

Format internally:

```text
DEFAULT
generic KPI cards

WHY IT IS DEFAULT
common dashboard scaffold; not tied to the task

REPLACE WITH
a compact status rail organized by unresolved severity
```

The replacement should solve the same information problem better, not merely look different.

## Domain specificity test

Use the removal test:

> If the product name and logo disappeared, would the remaining visual and information cues still suggest the intended domain?

If not, the design material is too generic.

Do not force literal domain references into every element. One strong product-native structure plus disciplined supporting choices is better than a themed costume.
