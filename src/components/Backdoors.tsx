/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { getDestinations } from '../lib/destinations';
import { decodePath } from '../lib/crypto';

const MAZE_ID = 'backdoors';

interface Link {
	label: string;
	href: string;
}

// Resolved once (MAZE_ID is constant, the table is a static import). PLACEHOLDER
// seeds the pre-decode render with labels only, so no path leaks before mount.
const DESTS = getDestinations(MAZE_ID);
const PLACEHOLDER: Link[] = DESTS.map((d) => ({ label: d.label, href: '' }));

/**
 * The deliberate escape hatch: a plain list of real links. Because this is a
 * client-rendered island, the paths aren't in the static HTML — they're decoded
 * at mount and only then written onto the anchors.
 */
export default function Backdoors() {
	const [links, setLinks] = useState<Link[]>(PLACEHOLDER);

	useEffect(() => {
		let alive = true;
		// Decode each link independently: one failure leaves that single anchor
		// href-less rather than dropping ALL the escape-hatch links.
		Promise.all(
			DESTS.map(async (d) => {
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

	// `links` starts as PLACEHOLDER (labels only) and is replaced once decode
	// resolves, so no path leaks before mount.
	const items = links;

	return (
		<div class="backdoors">
			<div class="backdoors__session">
				<p class="backdoors__line backdoors__cmd">
					pwd<span class="backdoors__comment">huh. found it.</span>
				</p>
				<p class="backdoors__line backdoors__out">/backdoors</p>
				<p class="backdoors__line backdoors__cmd">ls -1F</p>
			</div>
			<nav class="backdoors__ls" aria-label="backdoors">
				<ul>
					{items.map((item) => (
						<li key={item.label}>
							<a href={item.href || undefined}>{item.label}</a>
						</li>
					))}
				</ul>
			</nav>
			<p
				class="backdoors__line backdoors__cmd backdoors__prompt"
				aria-hidden="true"
			></p>
		</div>
	);
}
