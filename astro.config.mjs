// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import expressiveCode from 'astro-expressive-code';

// Content-pipeline plugins (see src/lib/*).
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import { remarkCallouts } from './src/lib/remark-callouts';

// Canonical origin — the single source for `site` and anything derived from it
// (e.g. the sitemap filter below), so they can't drift apart.
const SITE = 'https://1kyc.github.io';

// https://astro.build/config
export default defineConfig({
	site: SITE,
	// Bind the dev/preview server to all interfaces so the port is reachable
	// through the devcontainer's forwarded port (it otherwise binds IPv6-only).
	server: { host: true },
	markdown: {
		// Astro 6.4 deprecated the top-level markdown.remarkPlugins/rehypePlugins in
		// favor of a processor built with unified() from @astrojs/markdown-remark.
		// gfm + smart punctuation stay on by default; EC detects this unified
		// processor and injects its fenced-code rehype plugin into it (which is why
		// expressiveCode() must still come BEFORE mdx() in integrations).
		processor: unified({
			remarkPlugins: [
				// Math: `$…$` / `$$…$$` → math nodes for rehype-katex to render.
				remarkMath,
				// Callouts: enable `:::name` directives, then rewrite ours to <aside>.
				// remarkDirective MUST precede remarkCallouts (it parses the syntax).
				remarkDirective,
				remarkCallouts,
			],
			rehypePlugins: [
				// KaTeX: render math to HTML+CSS at BUILD time (browser gets no JS). Its
				// stylesheet is self-hosted, loaded per-page via <KatexStyles> (only on
				// posts that contain math).
				rehypeKatex,
			],
		}),
	},
	integrations: [
		// Expressive Code MUST come BEFORE mdx() so it wraps the MDX pipeline.
		// Dual theme migrated from the old Shiki config: github-dark is the base
		// (matching the site's dark default) and github-light is the alternate.
		expressiveCode({
			themes: ['github-dark', 'github-light'],
			// Track the site's theme system: EC keys its dark-mode media query and
			// its explicit-override selector to the SAME `data-theme` attribute the
			// vanilla toggle sets on <html>. theme.type is 'dark' | 'light', so this
			// yields [data-theme='dark'] / [data-theme='light'] — an explicit choice
			// wins over prefers-color-scheme exactly like content.css's palette.
			themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
			useDarkModeMediaQuery: true,
			styleOverrides: {
				// Fold the code panel into the reading-room token system.
				borderRadius: 'var(--radius)',
				borderColor: 'var(--border)',
				codeFontFamily: 'var(--font-mono)',
				codeFontSize: 'var(--fs-sm)',
				uiFontFamily: 'var(--font-mono)',
			},
		}),
		preact(),
		mdx(),
		// Discovery (Phase 2): a sitemap over every built page, and Pagefind, which
		// indexes the static HTML after build (data-pagefind-body scopes it to blog
		// post articles) and serves /pagefind/ in dev + preview for <BlogSearch>.
		sitemap({
			// Exclude the maze root: it's the puzzle gate, deliberately NOT meant for
			// clean discovery (the real homepage is /home). Content pages stay in.
			filter: (page) => page !== `${SITE}/`,
		}),
		pagefind(),
	],
});
