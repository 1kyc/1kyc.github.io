// gen-destinations.mjs — dev-only generator (run with `node`, never shipped).
//
// Hides the real endpoint paths so they never appear as plaintext in the
// served site. Each destination path is XOR-encrypted with a keystream derived
// from SHA-256(solution-key). The solution key is whatever the maze produces
// when it is solved for that destination, so the path is only recoverable once
// the visitor actually solves the maze.
//
//   keystream      = SHA-256(utf8(key))                 // 32 bytes
//   cipher[i]      = pathBytes[i]  XOR keystream[i]     // paths <= 32 bytes
//
// The display LABEL is hidden the same way, but under a SEPARATE keystream —
// never reuse the path keystream for a second plaintext (two-time pad: the
// XOR of two ciphertexts under one keystream leaks plaintext relations):
//
//   labelStream    = SHA-256(utf8(key + ':label'))
//   labelCipher[i] = labelBytes[i] XOR labelStream[i]
//
// Output: one file per maze, src/lib/destinations.<maze>.json — an array of
// { key, cipher(hex), labelCipher(hex) }. Neither the real PATH nor the
// human LABEL appears as plaintext in any emitted JSON.
//
// The runtime counterpart (src/lib/crypto.ts: decodePath / decodeLabel)
// mirrors both derivations byte-for-byte using the Web Crypto API.

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Canonical destinations. This is the ONLY place the paths live in source as
// plaintext; this file is not bundled to the browser.
const DESTINATIONS = {
	home: { path: '/home', label: 'Home' },
	blog: { path: '/blog', label: 'Blog' },
	projects: { path: '/projects', label: 'Projects' },
	about: { path: '/about', label: 'About' },
};

// Per maze: destinationId -> the solution KEY string that maze yields when
// solved for that destination. The key is the XOR decryption key, so the maze
// must be able to reproduce it byte-for-byte at solve time.
//   - wordsearch: the key IS the hidden word (currently == destination id —
//     the words themselves are pending a user decision).
//   - backdoors:  the escape hatch; it self-decodes at mount, so its keys
//     ship BY DESIGN — but they are opaque tokens (k0..k3), never the goal
//     names, so the table alone reads as noise.
//   - (future) rubik: e.g. { home: 'U:white', blog: 'F:red', ... } — a
//     canonical token derived only from the solved face, not the whole cube.
const IDENTITY = Object.fromEntries(
	Object.keys(DESTINATIONS).map((id) => [id, id]),
);
// backdoors: deliberately meaningless positional tokens (see note above).
const BACKDOORS = Object.fromEntries(
	Object.keys(DESTINATIONS).map((id, i) => [id, `k${i}`]),
);
// manipulator ("orbit"): each destination is a capture target with an orbital
// codename. The codename IS the solution key — the string the target resolves to
// when the Canadarm2 end-effector captures it (never shown as a path). Every
// ghost target maps its codename -> destination the same way.
const MANIPULATOR = {
	home: 'HARMONY',
};
// alchemy (falling-sand, v2 "wuxing"): each destination's key is the ARTIFACT
// the visitor assembles on the canvas (a hollow brick build → house,
// ink-stained paper → scroll, forged metal + steam → piston,
// glass over forged metal → mirror). The artifact name IS the solution key —
// the sim reproduces it byte-for-byte when its pattern detector fires.
const ALCHEMY = {
	home: 'house',
	blog: 'scroll',
	projects: 'piston',
	about: 'mirror',
};
const MAZE_KEYS = {
	wordsearch: IDENTITY,
	backdoors: BACKDOORS,
	manipulator: MANIPULATOR,
	alchemy: ALCHEMY,
};

/**
 * XOR the path bytes against the SHA-256(key) keystream and hex-encode.
 * @param {string} key the maze's solution key (decryption key)
 * @param {string} path the real destination path
 * @returns {string} hex cipher
 */
function encode(key, path) {
	const keystream = createHash('sha256').update(key, 'utf8').digest();
	const pathBytes = Buffer.from(path, 'utf8');
	if (pathBytes.length > keystream.length) {
		throw new Error(`path too long for keystream: ${path}`);
	}
	const out = Buffer.alloc(pathBytes.length);
	for (let i = 0; i < pathBytes.length; i++) {
		out[i] = pathBytes[i] ^ keystream[i];
	}
	return out.toString('hex');
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'src', 'lib');
mkdirSync(outDir, { recursive: true });

for (const [maze, keys] of Object.entries(MAZE_KEYS)) {
	const entries = Object.entries(keys).map(([destId, key]) => {
		const dest = DESTINATIONS[destId];
		if (!dest) throw new Error(`unknown destination "${destId}" in maze "${maze}"`);
		return {
			key,
			cipher: encode(key, dest.path),
			// separate keystream (key + ':label') — see the header note
			labelCipher: encode(`${key}:label`, dest.label),
		};
	});
	const outFile = resolve(outDir, `destinations.${maze}.json`);
	writeFileSync(outFile, JSON.stringify(entries, null, '\t') + '\n', 'utf8');
	console.log(`wrote ${entries.length} destinations -> ${outFile}`);
}
