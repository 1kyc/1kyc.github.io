// posts.ts — one source of truth for "which posts are live" and their order.
//
// The draft rule (hide drafts in PROD builds, show them in dev) was previously
// inlined in every route that touched the collection. Centralizing it here means
// the blog index, post pages, tag pages, and the RSS feed can never drift into
// disagreeing about what's published.

import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

// Whether drafts are included in the output (pages, RSS, sitemap, and — because
// Pagefind indexes the built HTML — search). Shown in dev always; hidden in a
// build UNLESS INCLUDE_DRAFTS=1 is set. That flag exists so a local preview build
// can exercise draft posts + search without un-drafting content (`npm run
// build:drafts`); real deploys never set it, so production still hides drafts.
const INCLUDE_DRAFTS =
	import.meta.env.DEV || process.env.INCLUDE_DRAFTS === '1';

/** Published posts: drafts hidden in production builds (see INCLUDE_DRAFTS). */
export async function getPublishedPosts(): Promise<Post[]> {
	return (await getCollection('blog')).filter(
		(post) => INCLUDE_DRAFTS || !post.data.draft,
	);
}

/** Published posts, newest first (the default order everywhere they're listed). */
export async function getSortedPosts(): Promise<Post[]> {
	return (await getPublishedPosts()).sort(
		(a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
	);
}
