import type { CollectionEntry } from 'astro:content';

const MAX_LEN = 160;
const MORE_MARKER = '<!--more-->';

/** Strip common markdown so a paragraph reads as plain text. */
function stripMarkdown(text: string): string {
	return text
		// inline HTML tags (e.g. <br> line breaks in poems) -> space, so they don't
		// surface as literal "&lt;br&gt;" in an excerpt
		.replace(/<[^>]+>/g, ' ')
		// images: ![alt](url) -> alt
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		// links: [text](url) -> text
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		// inline code: `code` -> code
		.replace(/`([^`]*)`/g, '$1')
		// leading heading hashes
		.replace(/^#{1,6}\s+/gm, '')
		// emphasis markers * and _
		.replace(/[*_]/g, '')
		.trim();
}

/**
 * Deterministic, pure excerpt for a blog entry. Resolution order:
 * 1. explicit `data.description`;
 * 2. text before a `<!--more-->` marker in the body;
 * 3. the first paragraph of the body, markdown-stripped and trimmed to ~160 chars.
 */
export function excerpt(entry: CollectionEntry<'blog'>): string {
	if (entry.data.description) {
		return entry.data.description;
	}

	const body = entry.body ?? '';

	const markerIndex = body.indexOf(MORE_MARKER);
	if (markerIndex !== -1) {
		return stripMarkdown(body.slice(0, markerIndex)).trim();
	}

	const firstParagraph = body.split(/\n\s*\n/)[0] ?? '';
	const cleaned = stripMarkdown(firstParagraph).replace(/\s+/g, ' ').trim();

	if (cleaned.length <= MAX_LEN) {
		return cleaned;
	}
	return cleaned.slice(0, MAX_LEN).trimEnd() + '…';
}
