# mobile-interface-design

An Agent Skill for designing and implementing mobile-first H5 interfaces when there is no UI designer or mockup.

It is intentionally **page-specific**: it does not require a global `DESIGN.md`. Every request can get a different visual direction based on its product context.

## What it does

1. infers the page intent;
2. chooses a page-specific taste profile;
3. commits to a Visual Contract;
4. optionally uses an installed `frontend-design` skill as the visual execution layer;
5. builds real HTML/CSS/JS (or your existing frontend stack);
6. avoids common generic-AI UI defaults;
7. renders and self-reviews when browser tooling is available;
8. includes a small static mobile-H5 validator.

## Install

Copy the `mobile-interface-design` directory into the skills directory used by your coding agent.

Common setups vary by product/version, so use the skill-directory convention supported by your agent. The important part is that `SKILL.md` remains at the root of this folder and the `resources/` directory stays beside it.

If your environment supports the Skills CLI, you can also place this folder in a Git repository and install it using that environment's skill installer.

## Optional dependency

For best results, also install Anthropic's public `frontend-design` skill. `mobile-interface-design` will use it when available, but it is not required.

## Browser review

For the full loop, give your coding agent access to a real browser/rendering tool such as Playwright, a browser MCP, or its built-in browser. The skill explicitly asks the agent to inspect 390px output and refine it.

Without browser tooling the skill still works, but it can only perform static visual reasoning and validation.

## Example

```text
Use `$mobile-interface-design`.

做一个移动端 H5 设备告警页面，原生 HTML/CSS/JS。
需要严重/一般/提示筛选，列表显示设备名、告警内容、时间和状态，底部导航：首页 / 设备 / 告警 / 我的。
直接实现，不需要先给我设计分析。
```

## Static validation

```bash
node /path/to/mobile-interface-design/scripts/validate-mobile-h5.mjs ./index.html
```

The validator is heuristic. Browser review remains the stronger quality signal.

## Design philosophy

This skill synthesizes several public patterns rather than copying another skill verbatim:

- distinctive, context-grounded visual direction before coding;
- semantic taste controls such as density, variance, and motion;
- a mission-control `SKILL.md` with supporting resources and executable validation;
- rendered visual feedback rather than assuming first-pass code is visually good.

See `NOTICE.md` for references.
