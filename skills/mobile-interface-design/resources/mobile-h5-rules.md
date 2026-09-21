# Mobile H5 Technical Rules

These rules protect mobile usability without imposing one visual style.

## Viewport

For standalone HTML, include a viewport configuration equivalent to:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Design for phone widths first.

Primary review width: 390px.
Spot-check approximately 375px and 430px.

Never implement the page itself as a fixed `width: 390px` canvas.

## Height and safe areas

Prefer dynamic viewport units where appropriate:

```css
min-height: 100dvh;
```

Account for WebView/notched devices when elements touch screen edges:

```css
padding-bottom: env(safe-area-inset-bottom);
padding-top: env(safe-area-inset-top);
```

Do not double-apply safe-area padding when the host app already provides it; inspect project context.

## Touch interaction

Interactive targets should generally provide at least ~44px of usable touch area, even if the visible icon is smaller.

Do not depend on hover to reveal essential controls.

Provide visible pressed/active/selected states where appropriate.

## Typography

Choose type scale from the Visual Contract. Do not force one global mobile scale.

But ensure:

- primary text is comfortably readable on a phone;
- secondary metadata does not become microscopic;
- line height supports Chinese and mixed-language text when present;
- long labels wrap or truncate intentionally;
- important numeric values use stable alignment where comparison matters.

Use system fonts by default when external fonts are unavailable. If using web fonts, provide sensible fallbacks and avoid blocking the core UI on a font load.

## Layout

Use normal-flow layout, grid, and flexbox before absolute positioning.

Avoid:

- accidental horizontal overflow;
- desktop multi-column layouts squeezed into mobile;
- fixed heights around dynamic text;
- unnecessary `position: fixed` elements competing for viewport space;
- floating primary actions that cover list content.

If bottom navigation or sticky actions are used, reserve content padding so the last content is not obscured.

## Forms

Use correct input types where possible.

Ensure:

- labels remain understandable after typing;
- errors appear near the field and are not color-only;
- disabled/loading/submitting states are represented when relevant;
- sticky submit actions do not hide the focused input behind the keyboard when avoidable.

## Lists and repeated records

Choose between open lists, grouped rows, cards, and table-like alignment based on the content.

Do not default every repeated item to a floating card.

For high-frequency operational lists, optimize scan paths:

- stable column/label positions;
- status near the identifier it modifies;
- predictable row heights where possible;
- clear but restrained separators;
- high-priority state visible without opening the row.

## Navigation

Use mobile-native navigation patterns when suitable:

- back navigation for deep flows;
- bottom navigation for 3-5 top-level destinations;
- tabs/segmented controls for sibling views;
- bottom sheets for contextual choices.

Avoid desktop sidebars unless the product context specifically requires them.

## Color and accessibility

Do not rely on color alone for critical states.

Maintain sufficient text/background contrast. Critical operational text and actions should favor readability over subtlety.

Use semantic state meaning consistently within the page.

## Motion

Prefer CSS transitions/animations for simple H5 interactions.

Motion should follow the Taste Profile.

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

Do not add perpetual animation to frequent task screens unless it communicates a live state.

## JavaScript

Implement interactions the user can reasonably expect from the screen:

- filters;
- tabs;
- toggles;
- menus/sheets;
- form validation;
- loading demo states when useful.

Keep demo data separate enough that backend wiring is straightforward.

Do not add heavy frontend dependencies solely for cosmetic effects.

## Existing frameworks

When working inside an existing application:

- reuse its routing and state patterns;
- prefer existing utilities/components when they do not force a poor visual result;
- do not replace the stack just to implement one page;
- preserve API contracts and accessibility behavior.
