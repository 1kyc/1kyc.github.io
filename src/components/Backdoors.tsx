/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { getDestinations } from '../lib/destinations';
import { decodePath } from '../lib/crypto';

const MAZE_ID = 'backdoors';

interface Link {
	label: string;
	href: string;
}

/**
 * The deliberate escape hatch: a plain list of real links. Because this is a
 * client-rendered island, the paths aren't in the static HTML — they're decoded
 * at mount and only then written onto the anchors.
 */
export default function Backdoors() {
	const [links, setLinks] = useState<Link[]>([]);

	useEffect(() => {
		let alive = true;
		// Decode each link independently: one failure leaves that single anchor
		// href-less rather than dropping ALL the escape-hatch links.
		Promise.all(
			getDestinations(MAZE_ID).map(async (d) => {
				try {
					return { label: d.label, href: await decodePath(d.cipher, d.key) };
				} catch {
					return { label: d.label, href: '' };
				}
			}),
		).then((resolved) => {
			if (alive) setLinks(resolved);
		});
		return () => {
			alive = false;
		};
	}, []);

	// Before decode resolves, render labels without hrefs so no path leaks early.
	const items: Link[] =
		links.length > 0
			? links
			: getDestinations(MAZE_ID).map((d) => ({ label: d.label, href: '' }));

	return (
		<nav class="backdoors" aria-label="backdoors">
			<ul>
				{items.map((item) => (
					<li key={item.label}>
						<a href={item.href || undefined}>{item.label}</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
