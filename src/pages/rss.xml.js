// RSS 2.0 feed for the blog, generated at build time by @astrojs/rss.
// Discoverable via the <link rel="alternate"> in Layout.astro's <head>.
import rss from '@astrojs/rss';
import { getSortedPosts } from '../lib/posts';
import { excerpt } from '../lib/excerpt';

export async function GET(context) {
	const posts = await getSortedPosts();
	return rss({
		title: '1kyc — Blog',
		description: 'Posts from 1kyc.github.io.',
		// context.site is the `site` from astro.config (https://1kyc.github.io), so
		// item links resolve to absolute URLs.
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: excerpt(post),
			pubDate: post.data.pubDate,
			link: `/blog/${post.id}/`,
			categories: post.data.tags,
		})),
	});
}
