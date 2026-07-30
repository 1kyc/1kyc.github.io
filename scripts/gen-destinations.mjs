// gen-destinations.mjs — dev-only generator (run with `node`, never shipped).
//
// Hides the real endpoint paths so they never appear as plaintext in the
// served site. Each destination path is XOR-encrypted with a keystream derived
// from SHA-256(solution-key). The solution key is whatever the maze produces
// when it is solved for that destination, so the path is only recoverable once
// the visitor actually solves the maze.
//
//   keystream = SHA-256(utf8(key))             // 32 bytes
//   cipher[i] = pathBytes[i] XOR keystream[i]  // paths are short (<= 32 bytes)
//
// Output: one file per maze, src/lib/destinations.<maze>.json — an array of
// { key, label, cipher(hex) }. The real PATH string is intentionally absent
// from every emitted JSON.
//
// The runtime counterpart (src/lib/crypto.ts) mirrors this scheme byte-for-byte
// using the Web Crypto API.

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
//   - wordsearch: the key IS the hidden word (here == destination id).
//   - backdoors:  the escape hatch; it just decodes, so keys are the ids.
//   - (future) rubik: e.g. { home: 'U:white', blog: 'F:red', ... } — a
//     canonical token derived only from the solved face, not the whole cube.
// Both current mazes use the same trivial mapping: the solution key IS the
// destination id. Derive that identity map once from DESTINATIONS instead of
// spelling it out per maze (a future non-identity maze, e.g. rubik, gets its
// own explicit map).
const IDENTITY = Object.fromEntries(
	Object.keys(DESTINATIONS).map((id) => [id, id]),
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
// ink-stained paper → scroll, forged metal + steam → automaton,
// glass over forged metal → mirror). The artifact name IS the solution key —
// the sim reproduces it byte-for-byte when its pattern detector fires.
const ALCHEMY = {
	home: 'house',
	blog: 'scroll',
	projects: 'automaton',
	about: 'mirror',
};
const MAZE_KEYS = {
	wordsearch: IDENTITY,
	backdoors: IDENTITY,
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
		return { key, label: dest.label, cipher: encode(key, dest.path) };
	});
	const outFile = resolve(outDir, `destinations.${maze}.json`);
	writeFileSync(outFile, JSON.stringify(entries, null, '\t') + '\n', 'utf8');
	console.log(`wrote ${entries.length} destinations -> ${outFile}`);
}
