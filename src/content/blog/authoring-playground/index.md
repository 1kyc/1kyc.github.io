---
title: 'Authoring Playground'
description: 'My own reference for how to write posts here — frontmatter, code blocks, math, callouts, and everything the reading-room design styles.'
pubDate: 2026-07-23
tags: ['meta', 'authoring', 'reference']
draft: true
---

This is my personal cheat-sheet for writing on this site. It documents the
syntax for every authoring feature **and** renders each one, so it doubles as a
place to eyeball styling changes. It stays `draft: true` — it never ships to
production, but it renders in `npm run dev`.

<!--more-->

Everything below is plain Markdown (`.md`), no per-post component imports. The
text above the `<!--more-->` marker becomes the card blurb / excerpt when a post
has no `description`.

## Frontmatter and file layout

Each post is a folder — `src/content/blog/<slug>/index.md` — so images can sit
next to the prose. The URL is the folder name (`authoring-playground` →
`/blog/authoring-playground`); the date lives in frontmatter, not the filename.

```yaml
---
title: 'Authoring Playground'          # required
description: 'One-line card blurb…'     # optional → falls back to the excerpt
pubDate: 2026-07-23                     # required; drives sort order
updatedDate: 2026-07-24                 # optional
tags: ['meta', 'authoring']            # optional
cover: ./cover.png                      # optional, colocated + auto-optimized
coverAlt: 'Description of the cover'    # optional
draft: true                             # optional; true hides it in production
lang: en                                # en | zh-Hans | ja (switches the CJK face)
---
```

## Headings and the table of contents

Section headings (`##` / `###`) build the table of contents automatically — a
sticky sidebar on the right at wide widths, a `Contents` disclosure on narrow
ones. It only appears once a post has **three or more** headings; below that it
would just be noise. (This post clears the bar.)

## Code blocks

Fenced blocks run through Expressive Code — a title bar, highlighted line
ranges, diff markers, and a copy button, all with zero framework JavaScript:

````md
```js title="orbit.js" {2-3} ins={6} del={5}
export function period(semiMajorAxisMeters, mu) {
	// The two highlighted lines are Kepler's third law.
	const a = semiMajorAxisMeters;
	return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
	const legacy = slowPeriod(a, mu); // removed
	return fastPeriod(a, mu);         // added
}
```
````

…which renders as:

```js title="orbit.js" {2-3} ins={6} del={5}
export function period(semiMajorAxisMeters, mu) {
	// The two highlighted lines are Kepler's third law.
	const a = semiMajorAxisMeters;
	return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
	const legacy = slowPeriod(a, mu); // removed
	return fastPeriod(a, mu);         // added
}
```

A plain block still gets syntax colors and a copy button:

```bash
npm run verify:arm -- --dump joints.json
cat joints.json | jq '.frames[0]'
```

Inline code — `const mu = 3.986e14` — stays a mono chip in the running text.

## Math

Wrap inline math in single dollars and display math in double dollars:

```tex
Inline: $T = 2\pi\sqrt{a^3/\mu}$ where $\mu = GM$.

$$
v = \sqrt{\mu\left(\frac{2}{r} - \frac{1}{a}\right)}
$$
```

Rendered, the orbital period is $T = 2\pi\sqrt{a^3/\mu}$ where $\mu = GM$, and
the vis-viva equation gets its own centered block:

$$
v = \sqrt{\mu\left(\frac{2}{r} - \frac{1}{a}\right)}
$$

KaTeX renders all of this to HTML and CSS **at build time** — the browser
downloads no math JavaScript, only the self-hosted stylesheet (and only on pages
that actually contain math).

## Callouts

Five kinds, written as `:::` container directives. Add a custom title in
brackets:

```md
:::note
A neutral, informational aside.
:::

:::caution[Heads up]
A caution with a custom title.
:::
```

Rendered:

:::note
This is a **note** — the neutral, informational callout. Inline `code` and
[links](/blog) work inside it.
:::

:::tip
This is a **tip**: keep derived values (reading time, TOC) out of frontmatter —
compute them, don't hand-type them.
:::

:::important
This is an **important** callout — don't skip the license bookkeeping for any
bundled font or asset.
:::

:::warning
This is a **warning**. Double-check the remark/rehype plugin order before
shipping a pipeline change.
:::

:::caution[Heads up]
This is a **caution** with a custom title. Container directives keep posts as
portable plain Markdown — no MDX required.
:::

## The rest of Markdown

The reading-room stylesheet also dresses the ordinary elements.

> Blockquotes get a quiet left rule and a tinted surface — good for pulling a
> line out of the flow without shouting.

- Unordered lists use an accent marker,
- nest cleanly,
  - like this,
- and keep the reading measure.

1. Ordered lists,
2. same rhythm.

Tables are set in mono and scroll inside their own box on narrow screens:

| Body | Semi-major axis (AU) | Period (yr) |
| --- | --- | --- |
| Earth | 1.00 | 1.00 |
| Mars | 1.52 | 1.88 |
| Jupiter | 5.20 | 11.86 |

A dashed divider echoes the maze's exit rule:

---

Images placed in the post folder are auto-optimized; the `cover` frontmatter
field is the card thumbnail (declared, not yet rendered on the index).

## Wrap-up

If a titled code block with a highlighted range and diff markers, inline and
display math, five distinct callouts, a reading-time estimate in the meta line,
and a nested table of contents all look right — the whole authoring stack is
wired up, and this page is the place to keep it honest.
