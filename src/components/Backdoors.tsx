/** @jsxImportSource preact */
import { getDestinations } from '../lib/destinations';
import { useDecodedLinks } from '../lib/useDecodedLinks';

const MAZE_ID = 'backdoors';

// Resolved once (MAZE_ID is constant, the table is a static import).
const DESTS = getDestinations(MAZE_ID);

/**
 * The deliberate escape hatch: a plain list of real links. Because this is a
 * client-rendered island, the paths aren't in the static HTML — they're decoded
 * at mount and only then written onto the anchors.
 */
export default function Backdoors() {
	// labels-only until the in-effect decode resolves, so no path leaks pre-mount
	const items = useDecodedLinks(DESTS);

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
					{items.map((item, i) => (
						// positional key: labels start as identical placeholders
						<li key={i}>
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
