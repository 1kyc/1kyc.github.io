// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';
import expressiveCode from 'astro-expressive-code';

// Content-pipeline plugins (see src/lib/*).
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import { remarkCallouts } from './src/lib/remark-callouts';

// https://astro.build/config
export default defineConfig({
	site: 'https://1kyc.github.io',
	// Bind the dev/preview server to all interfaces so the port is reachable
	// through the devcontainer's forwarded port (it otherwise binds IPv6-only).
	server: { host: true },
	markdown: {
		// Astro keeps gfm + smart punctuation on by default and runs these on top.
		// EC takes over fenced-code rendering (it sets markdown.syntaxHighlight
		// false for us and injects itself into the pipeline), so the old Shiki
		// dual-theme config is gone — migrated into the expressiveCode() integration
		// below.
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
	],
});
