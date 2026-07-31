import { useEffect, useState } from 'preact/hooks';
import type { Destination } from './destinations';
import { decodeLabel, decodePath } from './crypto';

export interface DecodedLink {
	label: string;
	href: string;
}

/**
 * Decode a maze's destinations into `{ label, href }` links at mount. Starts
 * fully sealed — placeholder labels ("···") and empty hrefs — so neither a
 * real path nor a goal name sits in the pre-mount HTML; both decode in-effect.
 * Each field decodes independently, so a single failure leaves that anchor
 * href-less (or falling back to its key as the label) rather than dropping
 * everything.
 *
 * Shared by every client-rendered fallback that exposes the real nav as plain
 * links (Backdoors, the manipulator/no-WebGL fallback).
 */
export function useDecodedLinks(dests: readonly Destination[]): DecodedLink[] {
	const [links, setLinks] = useState<DecodedLink[]>(() =>
		dests.map(() => ({ label: '···', href: '' })),
	);
	useEffect(() => {
		let alive = true;
		Promise.all(
			dests.map(async (d) => {
				const [href, label] = await Promise.all([
					decodePath(d.cipher, d.key).catch(() => ''),
					decodeLabel(d.labelCipher, d.key).catch(() => d.key),
				]);
				return { label, href };
			}),
		).then((resolved) => {
			if (alive) setLinks(resolved);
		});
		return () => {
			alive = false;
		};
	}, []);
	return links;
}
