---
title: A Primer on Orbital Mechanics
description: The long one — a full sweep of headings, lists, code, quotes, and tables to stress-test the reading column.
pubDate: 2026-06-28
tags: [astronomy, mechanics, notes]
---

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. This first paragraph is deliberately
long so the reading measure has something to hold onto: ut enim ad minim veniam,
quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

<!--more-->

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
culpa qui officia deserunt mollit anim id est laborum.

## The two-body problem

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore
veritatis et quasi architecto beatae vitae dicta sunt explicabo.

### Conserved quantities

Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit. There
are a few quantities worth tracking:

- **Specific angular momentum** — nisi ut aliquid ex ea commodi consequatur.
- **Specific orbital energy** — quis autem vel eum iure reprehenderit.
- **Eccentricity vector** — qui in ea voluptate velit esse quam nihil molestiae.

#### A nested list, for depth

1. Neque porro quisquam est
   - qui dolorem ipsum quia dolor sit amet
   - consectetur, adipisci velit
2. Sed quia non numquam eius modi
3. Tempora incidunt ut labore et dolore

## Working through it in code

Ut enim ad minima veniam, quis nostrum exercitationem. A fenced code block, so the
base syntax highlighting has something to render before Expressive Code lands:

```js
// vis-viva: orbital speed at distance r
function orbitalSpeed(mu, r, a) {
  return Math.sqrt(mu * (2 / r - 1 / a));
}

const EARTH_MU = 3.986e14; // m^3 / s^2
console.log(orbitalSpeed(EARTH_MU, 6.78e6, 6.78e6));
```

Inline code reads like `orbitalSpeed(mu, r, a)` in the middle of a sentence, and a
[link to nowhere](/blog) should pick up the accent color.

> At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis
> praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias.
> A blockquote wants to feel distinct without shouting.

## A table of orbits

| Regime | Altitude | Period | Notes |
| --- | --- | --- | --- |
| LEO | 160–2000 km | ~90 min | temporibus autem |
| MEO | 2000–35786 km | 2–12 h | quibusdam et aut |
| GEO | 35786 km | 24 h | officiis debitis |

---

Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum
soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime
placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.

Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe
eveniet ut et voluptates repudiandae sint et molestiae non recusandae. Itaque
earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus
maiores alias consequatur aut perferendis doloribus asperiores repellat.
