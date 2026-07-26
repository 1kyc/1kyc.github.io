---
title: 'Cheatsheet'
description: 'My own reference for how to write posts here — frontmatter, code blocks, math, callouts, and everything the reading-room design styles.'
pubDate: 2026-07-23
tags: ['meta', 'authoring', 'reference']
draft: true
---

My cheat-sheet for writing here: each section shows the raw Markdown, then how it renders. It stays `draft: true` — it never ships to production, but renders in `npm run dev`.

<!--more-->

Posts are plain Markdown (`.md`), no per-post component imports. Each post is a folder — `src/content/blog/<slug>/index.md` — so images colocate; the URL is the folder name and the date lives in frontmatter. Text above the `<!--more-->` marker becomes the card excerpt when a post has no `description`.

## Frontmatter

```yaml
---
title: 'Cheatsheet'                     # required
description: 'One-line card blurb…'     # optional → falls back to the excerpt
pubDate: 2026-07-23                     # required; drives sort order
updatedDate: 2026-07-24                 # optional
tags: ['meta', 'authoring']             # optional
cover: ./cover.png                      # optional, colocated + auto-optimized
coverAlt: 'Description of the cover'    # optional
draft: true                             # optional; true hides it in production
lang: en                                # en | zh-Hans | ja (switches the CJK face)
---
```

**Renders as:** the title, date, and `#`-tag chips at the top of this post (`description` becomes the lede beneath the title).

## Emphasis and links

```md
**bold**, *italic*, `inline code`, and a [link](/blog).
```

**Renders as:**

**bold**, *italic*, `inline code`, and a [link](/blog).

## Headings and the table of contents

```md
## A section heading
### A subsection
```

**Renders as:** section headings that build the table of contents automatically — the sticky sidebar (wide screens) or `Contents` disclosure (narrow) on this post. It appears only with **three or more** headings.

## Lists

```md
- unordered, with an accent marker
- nests cleanly
  - like this

1. ordered
2. same rhythm
```

**Renders as:**

- unordered, with an accent marker
- nests cleanly
  - like this

1. ordered
2. same rhythm

## Blockquote

```md
> A quiet left rule and a tinted surface,
> for pulling a line out of the flow.
```

**Renders as:**

> A quiet left rule and a tinted surface,
> for pulling a line out of the flow.

## Code blocks

Fenced blocks run through Expressive Code — title bar, highlighted ranges, diff markers, and a copy button, all with zero framework JavaScript.

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

**Renders as:**

```js title="orbit.js" {2-3} ins={6} del={5}
export function period(semiMajorAxisMeters, mu) {
	// The two highlighted lines are Kepler's third law.
	const a = semiMajorAxisMeters;
	return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
	const legacy = slowPeriod(a, mu); // removed
	return fastPeriod(a, mu);         // added
}
```

Inline code — `const mu = 3.986e14` — stays a mono chip in running text.

## Math

KaTeX renders at build time — no client JavaScript, and the stylesheet loads only on pages that contain math.

```md
Inline $T = 2\pi\sqrt{a^3/\mu}$, and a display block:

$$
v = \sqrt{\mu\left(\frac{2}{r} - \frac{1}{a}\right)}
$$
```

**Renders as:**

Inline $T = 2\pi\sqrt{a^3/\mu}$, and a display block:

$$
v = \sqrt{\mu\left(\frac{2}{r} - \frac{1}{a}\right)}
$$

## Callouts

Five kinds, written as `:::` container directives; add a custom title in brackets.

```md
:::note
Neutral aside.
:::

:::caution[Custom title]
The strongest warning, with a title.
:::
```

**Renders as:**

:::note
Neutral aside — inline `code` and [links](/blog) work inside.
:::

:::tip
A helpful tip.
:::

:::important
Something worth emphasizing.
:::

:::warning
Proceed carefully.
:::

:::caution[Custom title]
The strongest warning, with a title.
:::

## Tables

```md
| Body | Semi-major axis (AU) | Period (yr) |
| --- | --- | --- |
| Earth | 1.00 | 1.00 |
| Mars | 1.52 | 1.88 |
```

**Renders as:**

| Body | Semi-major axis (AU) | Period (yr) |
| --- | --- | --- |
| Earth | 1.00 | 1.00 |
| Mars | 1.52 | 1.88 |

## Horizontal rule

```md
---
```

**Renders as:**

---
