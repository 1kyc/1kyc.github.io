# Bundled asset licenses

Third-party assets that ship inside `node_modules/` (fonts, stylesheets) would
lose their license texts on any clean reinstall, so the licenses are retained
here to keep attribution with the repository.

## Fonts

The content pages set their reading text in the **Noto Serif** family, self-hosted
via [Fontsource](https://fontsource.org/) (the `@fontsource-variable/noto-serif`,
`@fontsource/noto-serif-sc`, and `@fontsource/noto-serif-jp` packages). Because the
font files ship inside `node_modules/`, their license texts would vanish on any
clean reinstall — so the bundled licenses are retained here to keep attribution
with the repository.

All three fonts are released under the **SIL Open Font License, Version 1.1**:

| File | Font | Package |
| --- | --- | --- |
| `Noto-Serif-OFL.txt` | Noto Serif (Latin/Greek/Cyrillic, variable) | `@fontsource-variable/noto-serif` |
| `Noto-Serif-SC-OFL.txt` | Noto Serif SC (Simplified Chinese) | `@fontsource/noto-serif-sc` |
| `Noto-Serif-JP-OFL.txt` | Noto Serif JP (Japanese) | `@fontsource/noto-serif-jp` |

The SC and JP license texts are byte-identical to each other; the Latin variable
family carries a different copyright header, so each is kept as its own file
exactly as bundled by its package.

## Math typesetting

Blog math is rendered at build time by [KaTeX](https://katex.org/) (via
`remark-math` + `rehype-katex`), and its stylesheet + web fonts are self-hosted
from the `katex` package rather than a CDN. KaTeX is released under the **MIT
License**.

| File | Project | Package |
| --- | --- | --- |
| `KaTeX-MIT.txt` | KaTeX (stylesheet + `KaTeX_*` web fonts) | `katex` |

The `KaTeX_*` font files are covered by the same MIT license text (they are part
of the KaTeX distribution), so no separate OFL applies.
