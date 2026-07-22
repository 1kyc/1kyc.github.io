// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
	site: 'https://1kyc.github.io',
	// Bind the dev/preview server to all interfaces so the port is reachable
	// through the devcontainer's forwarded port (it otherwise binds IPv6-only).
	server: { host: true },
	// Dual-theme Shiki: emit --shiki-light / --shiki-dark CSS vars (defaultColor
	// false) instead of a single baked-in background, so fenced code panels track
	// prefers-color-scheme. The var switch lives in src/styles/content.css.
	markdown: {
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			defaultColor: false,
		},
	},
	integrations: [preact(), mdx()],
});
