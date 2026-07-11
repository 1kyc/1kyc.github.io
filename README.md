# 1kyc.github.io

My personal [GitHub Pages](https://pages.github.com/) site, built with [Astro](https://astro.build) and published at **https://1kyc.github.io**.

## Development

This repo includes a devcontainer, so the simplest path is **VS Code → "Reopen in Container"**. Otherwise, with Node ≥ 22.12 installed locally:

```sh
npm install        # install dependencies
npm run dev        # start the dev server at http://localhost:4321
```

## Commands

| Command           | Action                                       |
| :---------------- | :------------------------------------------- |
| `npm run dev`     | Start the local dev server at `localhost:4321` |
| `npm run build`   | Build the production site to `./dist/`       |
| `npm run preview` | Preview the production build locally         |

## Deployment

Deployment is automatic. Pushing to `main` triggers the
[`Deploy to GitHub Pages`](.github/workflows/deploy.yml) workflow, which builds
the site and publishes it to GitHub Pages.

> One-time setup: in the repo's **Settings → Pages**, set **Source** to
> **GitHub Actions**.

## Credits

Third-party 3D models (Canadarm2, ISS, Mobile Base System) and their licenses
are listed in [CREDITS.md](CREDITS.md).
