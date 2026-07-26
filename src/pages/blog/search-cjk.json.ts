// Build-time substring index for CN/JP posts.
//
// Pagefind indexes by word + prefix, which suits English but hides mid-word CJK
// characters (a single 夜/色 is meaningful yet often not word-initial). CN/JP
// posts are therefore kept OUT of Pagefind (no data-pagefind-body — see
// [...slug].astro) and emitted here as plain text instead; <BlogSearch> loads
// this once and does a true substring scan over it. Small by design — this is
// only ever the handful of CN/JP posts.
//
// getPublishedPosts() applies the usual draft rule, so a production build (no
// INCLUDE_DRAFTS) emits [] for draft-only CN/JP content — nothing leaks.
import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../../lib/posts';
import { formatDate } from '../../lib/date';
import { toPlainText } from '../../lib/plaintext';

export const GET: APIRoute = async () => {
	const posts = (await getPublishedPosts()).filter(
		(post) => post.data.lang === 'zh-Hans' || post.data.lang === 'ja',
	);
	const index = posts.map((post) => ({
		url: `/blog/${post.id}/`,
		title: post.data.title,
		date: formatDate(post.data.pubDate),
		tags: post.data.tags,
		body: toPlainText(post.body ?? ''),
	}));
	return new Response(JSON.stringify(index), {
		headers: { 'Content-Type': 'application/json' },
	});
};
