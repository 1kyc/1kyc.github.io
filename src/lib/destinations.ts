// destinations.ts — typed access to the generated per-maze cipher tables.
//
// One table per maze, produced by `npm run gen:dest` (scripts/gen-destinations.mjs).
// Each deliberately contains NO plaintext — only the solution key and two XOR
// ciphers (path + display label, separate keystreams). Resolve at runtime with
// decodePath(cipher, key) / decodeLabel(labelCipher, key).
//
// Adding a new maze: add its key map in the generator, regenerate, then import
// the emitted JSON here and register it in TABLES.

import type { MazeId } from './mazes';
import wordsearch from './destinations.wordsearch.json';
import manipulator from './destinations.manipulator.json';
import alchemy from './destinations.alchemy.json';
import backdoors from './destinations.backdoors.json';

export interface Destination {
	/** the maze's solution key for this destination; also the decryption key */
	key: string;
	/** hex-encoded XOR cipher of the real path */
	cipher: string;
	/** hex-encoded XOR cipher of the display label (separate keystream) */
	labelCipher: string;
}

const TABLES: Record<MazeId, readonly Destination[]> = {
	wordsearch: wordsearch satisfies readonly Destination[],
	manipulator: manipulator satisfies readonly Destination[],
	alchemy: alchemy satisfies readonly Destination[],
	backdoors: backdoors satisfies readonly Destination[],
};

/** Shared empty result so a miss doesn't allocate a fresh array each call. */
const EMPTY: readonly Destination[] = [];

/** All destinations for a maze (empty if the maze has no table). */
export function getDestinations(mazeId: string): readonly Destination[] {
	return TABLES[mazeId] ?? EMPTY;
}

/** Find a destination within a maze by its solution key. */
export function findDestination(
	mazeId: string,
	key: string,
): Destination | undefined {
	return getDestinations(mazeId).find((d) => d.key === key);
}
