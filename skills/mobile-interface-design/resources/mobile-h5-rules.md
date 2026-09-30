# Mobile H5 Technical Rules

These rules protect mobile usability without imposing one visual style.

## Viewport

For standalone HTML, include a viewport configuration equivalent to:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Design phone-first. Around 390px is a useful review baseline, not a design canvas. Spot-check narrower and wider common phone widths such as ~375px and ~430px, and honor product-specific device constraints when known.

Never implement the page itself as a fixed-width phone canvas.

## Height and safe areas

Prefer dynamic viewport units where appropriate, e.g. `min-height: 100dvh`.

Account for safe areas when content touches screen edges. Do not double-apply safe-area padding when the host app already provides it.

## Touch interaction

Interactive targets should generally offer about 44px of usable touch area when practical, even when the visible glyph is smaller. This is a mobile ergonomic target, not a requirement that every visible control be 44px tall.

Do not depend on hover for essential controls. Provide visible pressed/active/selected states. Avoid overlapping enlarged hit areas.

Consider thumb reach for frequent actions and the viewport cost of fixed chrome.

## Early viewport

Useful content, context, state, or action should normally appear early. Do not spend the first viewport on empty hero space, oversized titles, filters that dominate content, or branding that delays the user's purpose.

The first viewport does not always need a primary CTA; reading, monitoring, browsing, and conversation screens may earn space differently.

## Typography

Choose type scale from the Visual Contract and surrounding product system. Ensure readable primary text, non-microscopic metadata, intentional wrapping/truncation, suitable Chinese/mixed-language line height, and stable numeric alignment where comparison matters.

Use system fonts when external fonts are unavailable/unreliable; do not block core UI on font load.

## Layout

Use normal flow, grid, and flexbox before absolute positioning.

Avoid accidental horizontal overflow, squeezed desktop multi-column layouts, fixed heights around dynamic text, unnecessary fixed UI, floating actions covering content, and negative-margin/calc hacks that escape a broken layout.

If bottom navigation or sticky actions are justified, reserve content space so the last content is not obscured.

Horizontal scroll is acceptable for deliberate content such as chip rows or carousels, not as a workaround for page overflow.

## Forms and keyboards

Use correct input types and autocomplete behavior. Keep labels understandable after typing, errors near fields and not color-only, relevant loading/disabled/submitting states, keyboard-safe focused inputs, and confirmation proportional to destructive/irreversible risk.

Do not replace accessible native/headless primitives merely for visual consistency.

## Lists and repeated records

Choose open lists, grouped rows, selective cards, or table-like alignment based on content. Do not default every record to a floating card.

For high-frequency lists, favor stable identifiers, state near the identifier it modifies, predictable row anatomy, restrained separators, visible high-priority state, and row actions that do not compete with data.

## Navigation

Choose navigation from the actual information architecture and existing product behavior.

Back navigation, bottom navigation, tabs, segmented controls, and bottom sheets are possible tools—not required mobile ingredients.

Bottom navigation is appropriate only for a small set of stable top-level destinations that users switch among repeatedly. A focused flow may need only back/close and an in-flow action.

## Sticky and fixed UI

Fixed/sticky elements permanently consume scarce viewport height. Use them only when persistence saves repeated effort or protects critical context.

Check safe areas, keyboard behavior, content padding, stacking, and nested scroll containers.

## Color and accessibility

Do not rely on color alone for critical states. Maintain sufficient contrast. Focus-visible styles still matter on mobile web.

## Motion

Motion should follow the expression profile and explain cause/effect, hierarchy, continuity, or meaningful state change. Avoid perpetual motion on frequent task screens. Avoid `transition: all`. Support reduced motion.

## JavaScript

Implement only interactions implied by the requirement or necessary for the chosen flow. Examples include filters, tabs, toggles, menus/sheets, validation, or loading/submitting states; these examples are **not a checklist**.

Keep demo data separable from backend wiring. Do not add heavy dependencies solely for cosmetic effects.

## Existing frameworks

Inside an existing app:

- reuse routing/state patterns;
- prefer existing accessible primitives/components when suitable;
- do not replace the stack for one page;
- preserve API contracts and accessibility behavior;
- inherit product-wide semantic tokens and controls when they support the intended direction.

Existing components are tools, not an excuse to reproduce weak composition unchanged.
