// plaintext.ts — turn a raw Markdown body into plain text for substring search.
//
// Used to build the CN/JP substring index (see /blog/search-cjk.json). Unlike
// excerpt(), this keeps the WHOLE body (no truncation) and strips structure —
// HTML tags (incl. the poems' <br>), code, links, list/heading/quote marks — so
// what remains is the visible prose a reader would scan with a find box.
export function toPlainText(markdown: string): string {
	return markdown
		.replace(/<!--[\s\S]*?-->/g, ' ') // comments, e.g. <!--more-->
		.replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
		.replace(/`([^`]*)`/g, '$1') // inline code
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> text
		.replace(/<[^>]+>/g, ' ') // inline HTML (<br>, etc.)
		.replace(/^#{1,6}\s+/gm, '') // heading hashes
		.replace(/^\s{0,3}>\s?/gm, '') // blockquote marks
		.replace(/^\s*[-*+]\s+/gm, '') // unordered list bullets
		.replace(/^\s*\d+\.\s+/gm, '') // ordered list markers
		.replace(/[*_~]/g, '') // emphasis markers
		.replace(/\s+/g, ' ') // collapse whitespace
		.trim();
}
