import { useEffect, useState } from 'preact/hooks';
import type { Destination } from './destinations';
import { decodePath } from './crypto';

export interface DecodedLink {
	label: string;
	href: string;
}

/**
 * Decode a maze's destinations into `{ label, href }` links at mount. Starts as
 * labels-only (href `''`) so no real path sits in the pre-mount HTML, then fills
 * the hrefs in after an in-effect decode. Each link decodes independently, so one
 * failure leaves that single anchor href-less rather than dropping them all.
 *
 * Shared by every client-rendered fallback that exposes the real nav as plain
 * links (Backdoors, the manipulator/no-WebGL fallback).
 */
export function useDecodedLinks(dests: readonly Destination[]): DecodedLink[] {
	const [links, setLinks] = useState<DecodedLink[]>(() =>
		dests.map((d) => ({ label: d.label, href: '' })),
	);
	useEffect(() => {
		let alive = true;
		Promise.all(
			dests.map(async (d) => {
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
	return links;
}
