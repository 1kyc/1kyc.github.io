// crypto.ts — runtime path decoder (browser, Web Crypto API).
//
// Mirrors scripts/gen-destinations.mjs byte-for-byte:
//   keystream = SHA-256(utf8(solution))
//   path[i]   = cipher[i] XOR keystream[i]
//
// The real destination path is only recoverable with the correct solution word
// (the maze answer), so it never has to ship as plaintext.

/** Decode a hex string into a Uint8Array of bytes. */
function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) {
		throw new Error('invalid hex: odd length');
	}
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		if (Number.isNaN(byte)) throw new Error('invalid hex in cipher');
		out[i] = byte;
	}
	return out;
}

/**
 * Recover a destination path from its cipher using the puzzle solution as key.
 * @param cipherHex hex-encoded XOR cipher (from destinations.json)
 * @param solution  the solved maze word (the decryption key)
 * @returns the plaintext path, e.g. "/somewhere"
 */
export async function decodePath(
	cipherHex: string,
	solution: string,
): Promise<string> {
	const cipher = hexToBytes(cipherHex);
	const keyBytes = new TextEncoder().encode(solution);
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', keyBytes),
	);
	if (cipher.length > digest.length) {
		throw new Error('cipher longer than keystream');
	}
	const out = new Uint8Array(cipher.length);
	for (let i = 0; i < cipher.length; i++) {
		out[i] = cipher[i] ^ digest[i];
	}
	return new TextDecoder().decode(out);
}
