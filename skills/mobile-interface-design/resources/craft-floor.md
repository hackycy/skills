# Mobile Craft Floor

Load after the Visual Contract is settled.

This is a quality floor, not a design direction. The contract and brief choose the look; this resource checks whether the result was built with enough craft.

## Hierarchy and attention

- The dominant outcome/use mode should be legible.
- Task-led screens need a clear focal path; scan/monitor/browse surfaces may need multiple stable anchors instead.
- Secondary actions and metadata must be visibly quieter.
- Important states must be clear without making every state equally loud.
- Group by proximity and rhythm before adding containers.

If everything is emphasized, nothing is.

## Typography

Typography must do real hierarchy work.

Check readable body text, non-microscopic metadata, meaningful use of weight/contrast, intentional mixed Chinese/Latin rhythm, stable numeric alignment when comparison matters, and intentional wrapping/truncation.

System fonts are acceptable for utility screens. Display type requires context and reliable assets.

## Spacing and rhythm

Use a small spacing scale. Create meaningful contrast between tight groups, normal component spacing, and section separation.

Avoid pages where every gap, card, and section rhythm is identical.

## Surfaces and depth

Choose one dominant grouping/depth strategy: open layout + spacing, dividers, tonal surfaces, restrained borders, or subtle shadow layers.

Cards should represent meaningful grouping, independence, or interaction. They are not the default wrapper for each section or record.

## Shape

Use a small radius scale. Large rounded rectangles and pills are high-salience shapes; reserve them for roles that benefit from the geometry.

## Color

Accent color should communicate action, identity, or state. Critical states must not rely on color alone. Domain-derived palettes still need product-UI contrast and restraint.

## Icons and imagery

Prefer the existing project icon set, a real icon library, or authored SVG for simple product-specific marks. Avoid emoji/Unicode as a production icon system.

Images should carry content or atmosphere the UI cannot communicate better through layout and type.

## Interaction states

Relevant controls should account for default, pressed/active, selected, focus-visible when applicable, disabled, and loading/submitting where relevant.

Data surfaces should include believable empty/error/loading states when those states materially affect the screen.

## Motion

Prefer response to user action over ambient motion. Do not give every section the same entrance animation. Frequent task screens should feel nearly instantaneous. Respect `prefers-reduced-motion`.

## Browser/WebView surfaces

Remember focus rings, text selection, input caret, native form appearance, scroll/overscroll, safe areas, keyboard interaction, and sticky/fixed behavior.

Do not break platform behavior for cosmetic consistency.

## Content quality

Use realistic content that exercises long/short names, mixed states, timestamps, edge-case numbers, and localization. A page that only works with perfect demo copy is not finished.

## Authorship floor

If the contract chose an authored idea, verify that its useful consequence survived implementation. There is no three-instance quota.

If the contract chose restraint, judge the page by hierarchy, continuity, content quality, and craft—not by whether it contains a recognizable visual gimmick.
