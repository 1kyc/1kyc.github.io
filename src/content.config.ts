import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const blog = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string().optional(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			lang: z.enum(['en', 'zh-Hans', 'ja']).default('en'),
			tags: z.array(z.string()).default([]),
			cover: image().optional(),
			coverAlt: z.string().optional(),
			draft: z.boolean().default(false),
			// Comments (Giscus) are on by default for every post; set
			// `comments: false` in a post's frontmatter to hide the section.
			comments: z.boolean().default(true),
		}),
});

export const collections = { blog };
