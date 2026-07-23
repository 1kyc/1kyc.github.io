// remark-callouts.ts — GitHub-style callouts from container directives.
//
// Uses remark-directive's `:::name … :::` container syntax so posts stay plain,
// portable Markdown (no per-post MDX imports). This transform rewrites the five
// supported directive names into semantic <aside class="callout callout-<type>">
// blocks with a title row; content.css styles them against the token system.
//
//   :::tip
//   Body text.
//   :::
//
//   :::warning[Custom title]
//   Body text with a caller-supplied title (inline markdown preserved).
//   :::
import type { Paragraph, PhrasingContent, Root } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';
import type { RemarkPlugin } from '@astrojs/markdown-remark';
import { visit } from 'unist-util-visit';

// The five recognised callout kinds and their default (fallback) titles.
const CALLOUTS = {
	note: 'Note',
	tip: 'Tip',
	warning: 'Warning',
	important: 'Important',
	caution: 'Caution',
} as const;

type CalloutType = keyof typeof CALLOUTS;

function isCalloutType(name: string): name is CalloutType {
	return Object.prototype.hasOwnProperty.call(CALLOUTS, name);
}

export const remarkCallouts: RemarkPlugin = () => {
	return (tree) => {
		visit(tree as Root, 'containerDirective', (node: ContainerDirective) => {
			if (!isCalloutType(node.name)) return;
			const type = node.name;
			const data = node.data ?? (node.data = {});

			// Optional custom title via the directive label — :::note[My title].
			// remark-directive parses the label into a leading paragraph flagged
			// `directiveLabel`; lift its inline children so emphasis/code survive.
			let titleChildren: PhrasingContent[] = [
				{ type: 'text', value: CALLOUTS[type] },
			];
			const first = node.children[0];
			if (
				first?.type === 'paragraph' &&
				(first.data as { directiveLabel?: boolean } | undefined)?.directiveLabel
			) {
				titleChildren = first.children;
				node.children.shift();
			}

			const titleNode: Paragraph = {
				type: 'paragraph',
				data: { hName: 'p', hProperties: { className: ['callout-title'] } },
				children: titleChildren,
			};
			node.children.unshift(titleNode);

			data.hName = 'aside';
			data.hProperties = { className: ['callout', `callout-${type}`] };
		});
	};
};

export default remarkCallouts;
