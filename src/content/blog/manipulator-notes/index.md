---
title: Notes From the Manipulator
description: A medium-length post with a code block and a pull quote.
pubDate: 2026-05-15
tags: [robotics, canadarm]
---

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
nostrud exercitation ullamco laboris.

<!--more-->

## Calibration

Nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit
in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

```bash
# dump the joint angles
npm run verify:arm -- --dump joints.json
cat joints.json | jq '.frames[0]'
```

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia
deserunt mollit anim id est laborum.

> The end-effector doesn't care what you meant — only where you told it to go.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
doloremque laudantium, totam rem aperiam. Some inline emphasis: *this is
italic*, **this is bold**, and `this is code`.
