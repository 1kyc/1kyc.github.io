// tags.ts — tag aggregation + URL slugs for the discovery pages.
//
// Tags live on posts as free-form strings; this derives the browse surfaces from
// them (the /blog/tags index and each /blog/tags/<slug> page). Slugs are how a
// tag becomes a path segment, so the slug function is the single contract shared
// by every place that links to or generates a tag page.

import { getPublishedPosts, type Post } from './posts';

export type TagCount = { tag: string; slug: string; count: number };

/**
 * URL-safe slug for a tag: lowercased, whitespace/underscores collapsed to a
 * single hyphen, edge hyphens trimmed, and symbols/punctuation dropped. Unicode
 * LETTERS and NUMBERS are kept (the `u` flag), so ASCII tags (`web dev` → `web-dev`)
 * and non-ASCII ones (`日本語` → `日本語`) both yield readable, addressable slugs.
 *
 * The raw (decoded) slug is used BOTH as the <a href> and as the getStaticPaths
 * `params` value — Astro percent-encodes the param exactly once when it emits the
 * route, and the browser encodes the matching href the same way, so they always
 * round-trip. (Never pre-encode here: that would be double-encoded by Astro.)
 */
export function tagSlug(tag: string): string {
	const slug = tag
		.toLowerCase()
		.trim()
		.replace(/[\s_]+/g, '-')
		.replace(/[^\p{L}\p{N}-]+/gu, '')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
	// Only an all-punctuation tag empties the slug; keep it addressable with the
	// raw lowercased text (still decoded — Astro/the browser do the single encode).
	return slug || tag.toLowerCase().trim();
}

/**
 * All distinct tags across published posts, with post counts. Sorted by count
 * (most-used first), ties broken alphabetically. The first display spelling seen
 * for a given slug wins, so `Web` and `web` share one page under one label.
 */
export async function getTags(): Promise<TagCount[]> {
	const posts = await getPublishedPosts();
	const bySlug = new Map<string, { tag: string; count: number }>();
	for (const post of posts) {
		for (const tag of post.data.tags) {
			const slug = tagSlug(tag);
			const existing = bySlug.get(slug);
			if (existing) existing.count += 1;
			else bySlug.set(slug, { tag, count: 1 });
		}
	}
	return [...bySlug.entries()]
		.map(([slug, { tag, count }]) => ({ tag, slug, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Published posts carrying a given tag slug, newest first. */
export async function getPostsByTag(slug: string): Promise<Post[]> {
	return (await getPublishedPosts())
		.filter((post) => post.data.tags.some((tag) => tagSlug(tag) === slug))
		.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}
