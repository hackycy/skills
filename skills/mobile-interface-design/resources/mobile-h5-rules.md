# Mobile H5 Technical Rules

These rules protect mobile usability without imposing one visual style.

## Viewport

For standalone HTML, include a viewport configuration equivalent to:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Design phone-first.

Primary review width: 390px.
Spot-check approximately 375px and 430px.

Never implement the page itself as a fixed `width: 390px` canvas.

## Height and safe areas

Prefer dynamic viewport units where appropriate:

```css
min-height: 100dvh;
```

Account for notched devices when content touches screen edges:

```css
padding-bottom: env(safe-area-inset-bottom);
padding-top: env(safe-area-inset-top);
```

Do not double-apply safe-area padding when the host app already provides it. Inspect project context.

## Touch interaction

Interactive targets should generally offer at least ~44px usable touch area even when the visible glyph is smaller.

Do not depend on hover for essential controls.

Provide visible pressed/active/selected states.

Avoid overlapping enlarged hit areas.

For frequent actions, consider thumb reach and how much fixed chrome occupies the lower viewport. A control being "mobile-sized" does not automatically make it ergonomically placed.

## First viewport

On a product screen, useful task information should normally appear before decorative or identity-heavy content.

Do not spend the first viewport on:

- an empty hero;
- an oversized page title;
- filters whose visual weight exceeds the data;
- branding that delays the primary job.

Exceptions require a product reason, not a visual preference.

## Typography

Choose type scale from the Visual Contract rather than using one global mobile scale.

Ensure:

- primary text is comfortably readable;
- secondary metadata is not microscopic;
- line height supports Chinese and mixed-language text when present;
- long labels wrap or truncate intentionally;
- important numeric values use stable alignment where comparison matters;
- dynamic numbers use tabular numerals when useful.

Use system fonts by default when external fonts are unavailable or unreliable. If using web fonts, provide sensible fallbacks and do not block the core UI on font load.

## Layout

Use normal flow, grid, and flexbox before absolute positioning.

Avoid:

- accidental horizontal overflow;
- desktop multi-column layouts squeezed into mobile;
- fixed heights around dynamic text;
- unnecessary fixed elements competing for viewport space;
- floating primary actions that cover list content;
- negative-margin/calc hacks used to escape a broken parent layout.

If bottom navigation or sticky actions are used, reserve content padding so the last content is not obscured.

Horizontal scroll is acceptable for content that benefits from it, such as a deliberate chip row or carousel. It must not be a workaround for page overflow.

## Forms and keyboards

Use correct input types and autocomplete behavior where possible.

Ensure:

- labels remain understandable after typing;
- errors appear near the field and are not color-only;
- disabled/loading/submitting states are represented when relevant;
- sticky submit actions do not hide the focused input behind the keyboard when avoidable;
- multi-step forms preserve context and progress;
- destructive or irreversible submission gets appropriate confirmation.

Do not replace native/headless form primitives with inaccessible custom controls merely for visual consistency.

## Lists and repeated records

Choose open lists, grouped rows, cards, or table-like alignment based on content.

Do not default every repeated item to a floating card.

For high-frequency operational lists, optimize scan paths:

- stable identifier positions;
- status near the identifier it modifies;
- predictable row anatomy;
- restrained separators;
- high-priority state visible without opening the row;
- row actions that do not compete with the data.

## Navigation

Use mobile-native navigation patterns when suitable:

- back navigation for deep flows;
- bottom navigation for 3-5 top-level destinations;
- tabs/segmented controls for sibling views;
- bottom sheets for contextual choices.

Avoid desktop sidebars unless the product context specifically requires them.

Bottom navigation should not become a universal default. A short focused flow may need only back/close and a primary action.

## Sticky and fixed UI

Fixed/sticky elements are expensive on a phone because they permanently consume viewport area.

Use them when persistence saves repeated effort:

- top-level navigation;
- frequent primary actions;
- critical context;
- filters used repeatedly while scrolling.

Check:

- safe areas;
- keyboard behavior;
- content padding;
- stacking;
- nested scroll containers.

## Color and accessibility

Do not rely on color alone for critical states.

Maintain sufficient text/background contrast. Critical operational text and actions should favor readability over subtlety.

Use semantic state meaning consistently.

Focus-visible styles still matter on mobile web because keyboards, switches, accessibility tools, and desktop testing may interact with the same surface.

## Motion

Prefer CSS transitions/animations for simple H5 interactions.

Motion should follow the Taste Profile and explain:

- cause/effect;
- hierarchy;
- continuity;
- state change.

Avoid perpetual animation on frequent task screens unless it communicates live state.

Avoid `transition: all`.

Support reduced motion for meaningful animation:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## JavaScript

Implement interactions the user can reasonably expect:

- filters;
- tabs;
- toggles;
- menus/sheets;
- form validation;
- loading/submitting demo states when useful.

Keep demo data separate enough that backend wiring is straightforward.

Do not add heavy frontend dependencies solely for cosmetic effects.

## Existing frameworks

Inside an existing app:

- reuse routing and state patterns;
- prefer existing accessible primitives/components when they do not force a poor result;
- do not replace the stack for one page;
- preserve API contracts;
- preserve accessibility and keyboard behavior;
- use existing semantic tokens when they express the intended direction.

Existing components are tools, not an excuse to reproduce a weak composition unchanged.
