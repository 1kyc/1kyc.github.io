/**
 * True when `text` plausibly contains KaTeX math — a display `$$…$$` block or an
 * inline `$…$` span (the delimiters remark-math renders). Deliberately permissive:
 * a false positive only ships the (small, self-hosted) KaTeX stylesheet on a page
 * that didn't strictly need it, whereas a false negative would leave real math
 * unstyled — so it biases toward matching. Used at build time to gate the
 * per-page <KatexStyles> link, mirroring how hasCjk gates <CjkFonts>.
 */
const MATH = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/;

export function hasMath(text: string): boolean {
	return MATH.test(text);
}
