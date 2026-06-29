# 1kyc.github.io

My **GitHub Pages** user site, published at https://1kyc.github.io.

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