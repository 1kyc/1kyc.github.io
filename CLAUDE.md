# 1kyc.github.io

My **GitHub Pages** user site, published at https://1kyc.github.io.

## Landing page (the maze)

`/` (`src/pages/index.astro`) is a "maze": an interactive puzzle that hides the
root's real nav from crawlers. The maze isolates the LANDING PAGE ONLY — it is
not a site-wide crawler-hostile stance. Content pages (the blog especially) are
meant to be openly discoverable and indexable; the maze guards only the root.
Stack: Astro + **Preact islands** (interactive bits only). Content pages are
static/zero-JS by default; the one sanctioned exception is a small vanilla
theme-toggle script (no framework island) in the shared `Layout.astro`.

- **Destinations are hash-hidden.** Real paths never appear as plaintext or
  `<a href>` in the served HTML/JS. `scripts/gen-destinations.mjs` (run
  `npm run gen:dest`) is the ONLY place paths live in plaintext; it XOR-encrypts
  each path with a SHA-256(solution-key) keystream into
  `src/lib/destinations.<maze>.json`. `src/lib/crypto.ts` `decodePath()` reverses
  it at solve-time. Keep the generator and runtime byte-compatible.
- **Registry:** `src/lib/mazes.ts` — `MAZES` + `MAZE_LOADERS` (one lazy
  `import()` per maze, so each maze is its own JS chunk). `pickRandomMaze()`
  never returns the `backdoors` fallback; `?m=<id>` selects/shares a maze.
- **Adding a maze:** add a `MAZES` entry + a `MAZE_LOADERS` loader + the
  component + its key map in the generator; regenerate. No `MazeApp` edits.
- **Selector:** `MazeMenu.tsx` — a tap/click/arrow dropdown behind a subtle
  toggle. `backdoors` is revealed only deliberately (long-press the toggle, `b`,
  or `?m=backdoors`). The menu opens on `:focus-within`, so every close path must
  blur focus inside `.selector`.
- Styling: `src/styles/maze.css` (imported only by the landing). Ambient moiré
  background lives in `.maze::after` (calm centre, intricate edges).

## Licensing + privacy

- **Dual-licensed:** `LICENSE` (MIT) covers the code; `LICENSE-CONTENT`
  (CC BY 4.0) covers the posts in `src/content/blog/`; bundled third-party
  assets keep their own (`CREDITS.md`, `licenses/`). The README's License table
  is the summary; `/about` links both. Adding a license = update all three.
- **No site footer.** The reference shelf a footer would carry (privacy,
  licensing, feed) lives in `/about`'s "The site" list — `/about` is in the nav,
  so it's one hop from anywhere. Pages end where their content ends; don't
  reintroduce a footer without asking.
- **`src/pages/privacy.astro`** is prose ABOUT code, so it goes stale silently.
  It carries a KEEP IN SYNC list naming the files whose behavior it describes —
  honor it when touching comments, theme storage, search, or any new third
  party. No consent banner: nothing stores on the device pre-sign-in (ePrivacy
  turns on device storage, not on IP transmission), but the transparency notice
  is required either way.

## Workflow rules

- `main` is protected — never push to it directly. Work on a `feat/…`, `fix/…`,
  or `chore/…` branch.
- Verify before pushing: `npm run check` and `npm run build` must both pass.
- Push the branch and give the user the PR URL; the user merges. Don't merge.

## Subagents

The main session orchestrates the leaf subagents in `.claude/agents/` (they
don't call each other):

- **developer** — builds/modifies site code.
- **designer** — visual design + asset creation (backgrounds, palette, type).
- **reviewer** — reads the diff for correctness/quality; returns a `VERDICT:`.
- **qa** — runs check + build and verifies behavior; reports pass/fail.

The **`/iterate`** skill drives them through design → dev → review → qa. See the
skill for the loop mechanics, its interactive/unattended modes, and stop
conditions.