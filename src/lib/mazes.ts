// mazes.ts — the maze registry + selection logic.
//
// Adding a new maze later: append it to MAZES with kind: 'real' and add one
// entry to MAZE_LOADERS pointing at its component. pickRandomMaze() will
// include it automatically; the fallback 'backdoors' is never chosen at random.
// No edits to MazeApp's render logic are needed.

import type { FunctionComponent } from 'preact';

export type MazeKind = 'real' | 'fallback';

export interface MazeDef {
	id: string;
	label: string;
	kind: MazeKind;
}

export const MAZES: readonly MazeDef[] = [
	{ id: 'wordsearch', label: 'word search', kind: 'real' },
	{ id: 'backdoors', label: 'backdoors', kind: 'fallback' },
];

/**
 * Lazy loaders — one dynamic import per maze, keyed by id. Each resolves to a
 * module whose default export is the maze's Preact component. Driving rendering
 * off this map (instead of a static switch) keeps every maze in its own JS
 * chunk, so the landing-island bundle doesn't grow as mazes are added.
 */
export const MAZE_LOADERS: Record<
	string,
	() => Promise<{ default: FunctionComponent }>
> = {
	wordsearch: () => import('../components/WordSearch'),
	backdoors: () => import('../components/Backdoors'),
};

/** All user-facing, randomly-selectable mazes (excludes the fallback). */
export const REAL_MAZES: readonly MazeDef[] = MAZES.filter(
	(m) => m.kind === 'real',
);

/** Look up a maze by id (any kind), or undefined if unknown. */
export function findMaze(id: string): MazeDef | undefined {
	return MAZES.find((m) => m.id === id);
}

/** Pick a random REAL maze. Never returns the fallback. */
export function pickRandomMaze(): MazeDef {
	const i = Math.floor(Math.random() * REAL_MAZES.length);
	// REAL_MAZES is non-empty by construction.
	return REAL_MAZES[i]!;
}

/**
 * Resolve the maze to show on load. Honors an explicit `?m=<id>` (including
 * `backdoors`, so a direct link can be shared); otherwise picks a random real
 * maze. Pure: takes a location.search string, returns a MazeDef.
 */
export function resolveInitialMaze(search: string): MazeDef {
	const params = new URLSearchParams(search);
	const requested = params.get('m');
	if (requested) {
		const match = findMaze(requested);
		if (match) {
			return match;
		}
	}
	return pickRandomMaze();
}
