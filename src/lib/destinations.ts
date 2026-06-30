// destinations.ts — typed access to the generated per-maze cipher tables.
//
// One table per maze, produced by `npm run gen:dest` (scripts/gen-destinations.mjs).
// Each deliberately contains no plaintext paths — only the solution key, a
// display label, and the XOR cipher. Resolve a real path at runtime with
// decodePath(cipher, key).
//
// Adding a new maze: add its key map in the generator, regenerate, then import
// the emitted JSON here and register it in TABLES.

import wordsearch from './destinations.wordsearch.json';
import backdoors from './destinations.backdoors.json';

export interface Destination {
	/** the maze's solution key for this destination; also the decryption key */
	key: string;
	/** human-facing label for the fallback list */
	label: string;
	/** hex-encoded XOR cipher of the real path */
	cipher: string;
}

const TABLES: Record<string, readonly Destination[]> = {
	wordsearch: wordsearch as Destination[],
	backdoors: backdoors as Destination[],
};

/** All destinations for a maze (empty if the maze has no table). */
export function getDestinations(mazeId: string): readonly Destination[] {
	return TABLES[mazeId] ?? [];
}

/** Find a destination within a maze by its solution key. */
export function findDestination(
	mazeId: string,
	key: string,
): Destination | undefined {
	return getDestinations(mazeId).find((d) => d.key === key);
}
