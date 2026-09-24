# mobile-interface-design

An Agent Skill for designing and implementing distinctive mobile-first H5 interfaces when there is no UI designer or mockup.

It is intentionally **page-specific**: it does not require a global `DESIGN.md`. Each request can receive a different visual direction derived from its product context.

## What it does

The skill uses a design-search loop rather than jumping directly from requirements to CSS:

1. preserves product truth and existing behavior;
2. infers the page intent and primary mobile job;
3. extracts a product-specific **Domain World**;
4. internally explores 2-3 structurally different compositions;
5. calibrates creativity, density, variance, and motion;
6. chooses one **Signature Idea**;
7. commits a concrete page-level Visual Contract with actual implementation tokens;
8. builds real HTML/CSS/JS or the project's existing frontend stack;
9. renders and critiques the result when browser tooling is available;
10. runs replacement, signature, and squint tests to catch interchangeable AI-template UI;
11. uses a small static validator for mobile correctness and a few high-confidence generated-UI defaults.

## Why the extra design-search steps?

Avoiding gradients, cards, or large radii is not enough to make an interface distinctive.

The skill asks the agent to derive visual material from the product's own world, consider more than its first plausible layout, and make one design idea visible in multiple parts of the final screen.

This is intended to move the result from:

`correct mobile UI -> polished generic UI`

toward:

`product-specific, intentionally designed mobile UI`

without requiring a permanent design system.

## Install

Copy the `mobile-interface-design` directory into the skills directory used by your coding agent.

Common setups vary by product/version. Keep `SKILL.md` at the root of the skill folder and keep `resources/`, `examples/`, and `scripts/` beside it.

If your environment supports the Skills CLI, you can also place this folder in a Git repository and install it using that environment's skill installer.

## Optional dependency

For best results, `mobile-interface-design` may use Anthropic's public `frontend-design` skill when it is installed.

`frontend-design` acts as a visual craft dependency; `mobile-interface-design` remains authoritative for mobile product hierarchy, density, navigation, ergonomics, first-viewport utility, and WebView constraints.

The dependency is optional and never blocks the task.

## Browser review

For the full loop, give the coding agent a real browser/rendering tool such as Playwright, a browser MCP, or a built-in browser.

The skill asks the agent to:

- review at 390px first;
- inspect the whole composition before details;
- verify the Signature Idea is actually visible;
- run a replacement test for genericness;
- refine 1-3 times;
- spot-check around 375px and 430px.

Without browser tooling the skill still works, but it can only perform static visual reasoning and validation.

## Example

```text
Use `$mobile-interface-design`.

做一个移动端 H5 设备告警页面，原生 HTML/CSS/JS。
需要严重/一般/提示筛选，列表显示设备名、告警内容、时间和状态，
底部导航：首页 / 设备 / 告警 / 我的。
直接实现，不需要先给我设计分析。
```

## Static validation

```bash
node /path/to/mobile-interface-design/scripts/validate-mobile-h5.mjs ./index.html
```

The validator is intentionally heuristic. Browser review and product-specific design reasoning remain stronger quality signals.

## Design philosophy

The skill combines:

- subject-matter-grounded visual direction;
- internal divergence/convergence before implementation;
- semantic taste controls;
- one page-specific signature idea;
- concrete implementation tokens rather than adjective-only design contracts;
- mobile technical constraints;
- rendered critique and de-template tests;
- lightweight deterministic validation.

See `NOTICE.md` for references and inspiration.
