# Anti-patterns: Replace Defaults with Decisions

These are not universal bans. They are common model habits that should not appear merely because they are easy to generate.

## Generic visual defaults

Do not default to blue-purple gradients, gradient text, glassmorphism, neon blobs, costume serif/monospace, giant marketing titles, excessive shadows, one large radius everywhere, pills everywhere, colored icon squares, or generic illustration filler.

Replacement principle: return to product truth, hierarchy, and the chosen expression profile.

## Composition defaults

Avoid card-per-section, card-per-record, desktop KPI strips on mobile, squeezed desktop navigation, empty hero space, identical section blocks, filters that outweigh content, floating actions that cover content, scan-heavy center alignment, and sheet/modal flows when inline interaction is clearer.

Also avoid **method defaults**:

- every page has one giant focal CTA;
- every page has a special “signature idea”;
- every signature is repeated three times to prove it exists;
- every operational page uses the same named composition pattern;
- every page is visually reinvented despite belonging to an established product.

Replacement principle: choose structure from the actual use mode and inherit good product conventions.

## Typography defaults

Avoid size-only hierarchy, arbitrary neighboring sizes, weak gray everywhere, all-caps Latin used as a premium costume, decorative eyebrow labels everywhere, oversized numbers without semantic priority, and generic marketing copy in product UI.

## Interaction defaults

Avoid animation on every component, repeated fade-and-slide entrances, hover-first interactions, ambiguous icon-only primary actions, fake controls, unnecessary skeletons, `transition: all`, and destructive actions styled like routine actions.

Do not implement filters/tabs/sheets/toggles merely because they were listed as examples in design guidance.

## Surface defaults

Avoid border + shadow + tint on ordinary cards, heavy borders where spacing already groups content, nested rounded cards, decorative progress rings without comparative value, color stripes on every record, and unrelated background textures.

## Domain-costume default

Do not turn domain objects into literal visual motifs just because Domain World found them. Product-specificity can be structural and linguistic.

## De-template audit

Ask:

1. Is the dominant outcome/use mode legible?
2. Did implementation preserve the chosen structural logic?
3. If an authored idea was chosen, is it useful rather than decorative?
4. If no authored idea was chosen, does the page still feel deliberate?
5. Does typography create hierarchy?
6. Is rhythm driven by content importance?
7. Could the same screenshot belong unchanged to an unrelated product?
8. Does this page still look like the same product as neighboring screens when it should?

If generic, redesign the most generic layer. If over-authored, simplify before adding more ideas.
