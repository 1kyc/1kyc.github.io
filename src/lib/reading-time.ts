// reading-time.ts — one source of truth for "N min read".
//
// Both the post page ([...slug].astro) and the /blog index cards compute the
// estimate by calling this helper directly on the raw post body, so the two
// surfaces can never drift into showing different numbers for the same post.
// (There is deliberately no remark plugin: the value is derivable from the body
// the same way on both surfaces, so a build-pipeline pass would only add a
// second mechanism for the same number.)

const WORDS_PER_MINUTE = 200;

/**
 * Count words in a raw markdown string. Deliberately simple and syntax-agnostic:
 * split on whitespace and count non-empty runs. Markdown punctuation (`#`, `*`,
 * fences) rides along with adjacent words, which is close enough for an estimate
 * and — crucially — identical no matter who calls it.
 */
export function countWords(markdown: string): number {
	const matches = markdown.trim().match(/\S+/g);
	return matches ? matches.length : 0;
}

/** Round a raw word count up to a human-readable "N min read" (floor 1 min). */
export function readingTimeFromWords(words: number): string {
	const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
	return `${minutes} min read`;
}

/** Convenience: raw markdown body → "N min read". */
export function readingTime(markdown: string): string {
	return readingTimeFromWords(countWords(markdown));
}
