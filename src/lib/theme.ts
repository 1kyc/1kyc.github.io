// The site's theme decision, in one place. Browser-only (reads document /
// matchMedia at call time — never at module load), so it's safe to import from
// any bundled Astro <script>.
//
// Contract: an explicit choice on <html data-theme> wins; otherwise fall back to
// the OS `prefers-color-scheme`. This mirrors the CSS in content.css (the base
// :root is dark; `@media (prefers-color-scheme: light) :root:not([data-theme])`
// and `:root[data-theme="light"]` handle the rest) so the JS and CSS never drift.
//
// The theme toggle (Layout.astro) OWNS this decision and announces every flip by
// dispatching a `THEME_CHANGE_EVENT` on window; consumers that live outside the
// CSS cascade (e.g. the giscus iframe, which can't read the page's media query)
// subscribe to it rather than spying on the toggle's DOM writes.

export type Theme = 'light' | 'dark';

/** The current effective theme: explicit override, else OS preference. */
export function effectiveTheme(): Theme {
	const explicit = document.documentElement.dataset.theme;
	if (explicit === 'light' || explicit === 'dark') return explicit;
	return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Event the toggle fires (on window) whenever the explicit theme flips. */
export const THEME_CHANGE_EVENT = 'themechange';
