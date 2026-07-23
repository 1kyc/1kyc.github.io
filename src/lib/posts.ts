// posts.ts — one source of truth for "which posts are live" and their order.
//
// The draft rule (hide drafts in PROD builds, show them in dev) was previously
// inlined in every route that touched the collection. Centralizing it here means
// the blog index, post pages, tag pages, and the RSS feed can never drift into
// disagreeing about what's published.

import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Published posts: drafts are hidden in PROD builds, shown in dev for preview. */
export async function getPublishedPosts(): Promise<Post[]> {
	return (await getCollection('blog')).filter((post) =>
		import.meta.env.PROD ? !post.data.draft : true,
	);
}

/** Published posts, newest first (the default order everywhere they're listed). */
export async function getSortedPosts(): Promise<Post[]> {
	return (await getPublishedPosts()).sort(
		(a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
	);
}
