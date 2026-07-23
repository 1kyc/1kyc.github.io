---
title: 'Kitchen Sink: Every Authoring Feature'
description: 'A draft that exercises code blocks, math, callouts, reading time, and the table of contents in one place.'
pubDate: 2026-07-22
tags: ['meta', 'demo', 'authoring']
draft: true
---

This draft is a verification harness for the Phase 1 authoring features. It is
`draft: true`, so it never ships to production — but it renders in `npm run dev`
and `npm run preview` so review and QA can see every feature in one page.

<!--more-->

It is deliberately long enough, with enough nested headings, to trigger both the
reading-time estimate in the meta line and the table of contents (sidebar on
wide screens, a `Contents` disclosure on mobile).

## Code blocks

Expressive Code renders fenced blocks: a title bar, line highlighting, diff
markers, and a copy button — all with zero framework JavaScript.

```js title="orbit.js" {2-3} ins={6} del={5}
export function period(semiMajorAxisMeters, mu) {
	// The two highlighted lines below are the heart of Kepler's third law.
	const a = semiMajorAxisMeters;
	return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
	const legacy = slowPeriod(a, mu); // removed
	return fastPeriod(a, mu); // added
}
```

A plain block with no title still highlights and gets a copy button:

```bash
npm run verify:arm -- --dump joints.json
cat joints.json | jq '.frames[0]'
```

### Inline code

Inline spans like `const mu = 3.986e14` stay as mono chips, untouched by
Expressive Code.

## Math

Inline math renders with KaTeX: the orbital period is $T = 2\pi\sqrt{a^3/\mu}$,
where $\mu = GM$. Display math gets its own centered block:

$$
T = 2\pi \sqrt{\frac{a^3}{\mu}} \qquad v = \sqrt{\mu\left(\frac{2}{r} - \frac{1}{a}\right)}
$$

All of it is rendered to HTML and CSS at build time — the browser downloads no
math JavaScript, only the self-hosted KaTeX stylesheet and fonts.

## Callouts

All five callout kinds, driven by `:::` container directives in plain Markdown:

:::note
This is a **note** — the neutral, informational callout. Inline `code` and
[links](/blog) work inside it.
:::

:::tip
This is a **tip**: use the shared `reading-time` helper so the index cards and
the post meta line can never disagree.
:::

:::warning
This is a **warning**. Double-check the plugin order before shipping.
:::

:::important
This is an **important** callout — do not skip the license bookkeeping for
bundled fonts.
:::

:::caution[Heads up]
This is a **caution** with a custom title. Container directives keep posts as
portable plain Markdown — no per-post MDX imports required.
:::

## Structure and headings

The next few subsections exist only to give the table of contents some depth so
its nested h2/h3 rendering is visible.

### First subsection

Lorem ipsum dolor sit amet, consectetur adipiscing elit. The TOC should nest
this h3 under its parent h2.

### Second subsection

Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Wrap-up

If you can see a titled code block with a highlighted range and diff markers,
inline and display math, five distinct callouts, a reading-time estimate, and a
nested table of contents — every Phase 1 feature is wired up correctly.
