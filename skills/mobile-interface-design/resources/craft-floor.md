# Mobile Craft Floor

Load this after the Visual Contract is settled.

This is a quality floor, not a design direction. The committed contract and explicit brief choose the look; this resource verifies whether the result was built with enough craft.

## Hierarchy

- One primary focal path should win within the first viewport.
- Secondary actions and metadata must be visibly quieter, not merely smaller.
- Important states must be clear without making every state equally loud.
- Sections should group by proximity and rhythm before adding containers.

If everything is emphasized, nothing is.

## Typography

Typography must do real hierarchy work.

Check:

- body text is comfortably readable at phone distance;
- metadata is not microscopic;
- title/body/metadata differ through weight and contrast, not only adjacent font sizes;
- mixed Chinese/Latin text has usable line height and punctuation rhythm;
- comparable numbers use `font-variant-numeric: tabular-nums` when appropriate;
- long labels, values, and localized strings wrap or truncate intentionally;
- line-height and tracking are chosen, not browser accidents.

System fonts are acceptable for utility screens. A display typeface should be used only when the context earns it and the asset is available reliably.

## Spacing and rhythm

Use a small spacing scale rather than unrelated values.

A good mobile page usually needs contrast between:

- tight internal groups;
- normal component spacing;
- larger section separation.

Avoid a page where every gap is the same. Rhythm should reveal content relationships.

When a heading introduces a group, the space above it should usually be larger than the space between the heading and its content.

## Surfaces and depth

Choose one dominant grouping/depth strategy:

- open layout + spacing;
- dividers;
- tonal surfaces;
- restrained borders;
- subtle shadow layers.

Do not mix every strategy by default.

Cards should represent meaningful grouping, independence, or interaction. They are not the default wrapper for each section or record.

Nested cards require a strong reason.

## Shape

Use a small radius scale.

Large rounded rectangles and pills are high-salience shapes. Reserve them for roles that benefit from that shape rather than applying them to every surface.

A pill is most defensible for:

- compact filters/chips;
- short statuses;
- segmented selection;
- tags with bounded text.

Normal buttons, rows, panels, and inputs do not automatically need pill geometry.

## Color

Accent color should communicate action, identity, or state.

Check:

- text/background contrast is sufficient;
- critical states do not rely on color alone;
- multiple accents are not competing without semantic need;
- muted text remains readable;
- dark/light mode comes from the actual use context or project system, not category stereotype.

A domain-derived palette should still behave like a product UI palette.

## Icons and imagery

Use a coherent icon language.

Prefer:

- existing project icon set;
- a real icon library;
- authored SVG for simple geometric/product-specific marks.

Avoid emoji or unrelated Unicode glyphs as a substitute for an icon system.

Images should carry content or atmosphere the UI cannot communicate better through layout and type. Do not add generic stock-like illustration solely to fill empty space.

## Interaction states

Relevant controls should account for:

- default;
- pressed/active;
- selected;
- focus-visible when keyboard interaction exists;
- disabled;
- loading/submitting where relevant.

Data surfaces should include believable empty/error/loading states when those states materially affect the screen.

Controls should keep the same action vocabulary through the interaction: "Save" should result in "Saved", not a differently named operation.

## Motion

Prefer response to user action over ambient motion.

A page may have one authored motion moment when the taste profile supports it. Do not give every section the same fade-and-slide entrance.

Avoid `transition: all`.

For frequent task screens, motion should be nearly invisible and fast.

Respect `prefers-reduced-motion`.

## Browser/WebView surfaces

Remember that mobile product craft includes things the design did not explicitly draw:

- focus rings;
- text selection;
- input caret;
- native form appearance;
- scroll behavior;
- overscroll;
- safe areas;
- keyboard interaction;
- sticky/fixed element behavior.

Theme or normalize these only when necessary. Do not break platform behavior for cosmetic consistency.

## Content quality

Use realistic content that exercises the layout:

- long and short names;
- mixed status values;
- different timestamps;
- edge-case numbers;
- empty and error copy when relevant.

A page that only works with perfectly short demo copy is not finished.

## Distinctiveness floor

Before finalizing, identify at least three visible consequences of the chosen signature idea.

If the signature exists only in the design rationale, implementation has drifted back to a template.

The craft floor prevents sloppiness. It does not choose the visual world. When mechanical polish conflicts with the committed product-specific direction, preserve the direction and solve the craft problem inside it.
