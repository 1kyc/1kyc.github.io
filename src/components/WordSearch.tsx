/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedPointerEvent } from 'preact';
import { getDestinations, findDestination } from '../lib/destinations';
import { decodePath } from '../lib/crypto';

const MAZE_ID = 'wordsearch';
const SIZE = 10;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type Cell = [row: number, col: number];

// 8 directions (incl. reverse + diagonals). Words may read backwards, so the
// solver checks both the forward and reversed selection on pointer up.
const DIRECTIONS: ReadonlyArray<Cell> = [
	[0, 1],
	[0, -1],
	[1, 0],
	[-1, 0],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

const randLetter = (): string =>
	ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;

const key = (r: number, c: number): string => `${r},${c}`;

// Fixed hint letters seeded onto the center diagonal so it spells 1KYC. Words
// place around these; the final fill preserves them. Rendered in the brand color.
// Coords are derived from SIZE so the run stays centered if the grid is resized.
const BRAND_WORD = '1KYC';
const BRAND_START = Math.floor((SIZE - BRAND_WORD.length) / 2);
const BRAND_CELLS: ReadonlyArray<readonly [number, number, string]> = [...BRAND_WORD].map(
	(ch, i) => [BRAND_START + i, BRAND_START + i, ch] as const,
);
const BRAND_KEYS = new Set(BRAND_CELLS.map(([r, c]) => key(r, c)));

/** Try to place every word into a fresh grid; returns null if any word fails. */
function tryBuild(words: readonly string[]): (string | null)[][] | null {
	const grid: (string | null)[][] = Array.from({ length: SIZE }, () =>
		Array.from({ length: SIZE }, () => null),
	);

	// Seed the fixed hint letters first so word placement flows around them.
	for (const [r, c, ch] of BRAND_CELLS) grid[r]![c] = ch;

	for (const word of words) {
		let placed = false;
		for (let attempt = 0; attempt < 200 && !placed; attempt++) {
			const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]!;
			const [dr, dc] = dir;
			const r0 = Math.floor(Math.random() * SIZE);
			const c0 = Math.floor(Math.random() * SIZE);
			const endR = r0 + dr * (word.length - 1);
			const endC = c0 + dc * (word.length - 1);
			if (endR < 0 || endR >= SIZE || endC < 0 || endC >= SIZE) continue;

			// check the run is free or already matches
			let fits = true;
			for (let i = 0; i < word.length; i++) {
				const ch = grid[r0 + dr * i]![c0 + dc * i];
				if (ch !== null && ch !== word[i]!.toUpperCase()) {
					fits = false;
					break;
				}
			}
			if (!fits) continue;

			for (let i = 0; i < word.length; i++) {
				grid[r0 + dr * i]![c0 + dc * i] = word[i]!.toUpperCase();
			}
			placed = true;
		}
		if (!placed) return null;
	}
	return grid;
}

/** Build a filled grid, retrying placement a few times if needed. */
function buildGrid(words: readonly string[]): string[][] {
	let layout: (string | null)[][] | null = null;
	for (let i = 0; i < 50 && layout === null; i++) {
		layout = tryBuild(words);
	}
	const safe = layout ?? tryBuild([]) ?? [];
	return safe.map((row) => row.map((ch) => ch ?? randLetter()));
}

/** Cells along the straight line a->b, or just [a] if not a straight run. */
function linePath(a: Cell, b: Cell): Cell[] {
	const [r0, c0] = a;
	const [r1, c1] = b;
	const dr = r1 - r0;
	const dc = c1 - c0;
	const straight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
	if (!straight) return [a];
	const steps = Math.max(Math.abs(dr), Math.abs(dc));
	const sr = Math.sign(dr);
	const sc = Math.sign(dc);
	const out: Cell[] = [];
	for (let i = 0; i <= steps; i++) out.push([r0 + sr * i, c0 + sc * i]);
	return out;
}

/** Resolve the grid cell under a viewport point, or null. */
function cellFromPoint(x: number, y: number): Cell | null {
	const el = document.elementFromPoint(x, y);
	const target = el?.closest<HTMLElement>('[data-row]');
	if (!target) return null;
	return [Number(target.dataset.row), Number(target.dataset.col)];
}

export default function WordSearch() {
	// generated once on mount (component is client:only)
	const [grid] = useState<string[][]>(() =>
		buildGrid(getDestinations(MAZE_ID).map((d) => d.key)),
	);
	const [selection, setSelection] = useState<Cell[]>([]);
	const [hovered, setHovered] = useState<Cell | null>(null);
	const [found, setFound] = useState<Set<string>>(() => new Set());
	const [toast, setToast] = useState<string | null>(null);

	const draggingRef = useRef(false);
	const startRef = useRef<Cell | null>(null);
	const selectionRef = useRef<Cell[]>([]);
	// Post-solve navigation timer — cleared on unmount so switching mazes within
	// the 700ms confirm window doesn't force-navigate away after the component is
	// gone.
	const navTimerRef = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
		},
		[],
	);

	const setSel = (path: Cell[]): void => {
		selectionRef.current = path;
		setSelection(path);
	};

	const finalize = async (): Promise<void> => {
		const path = selectionRef.current;
		setSel([]);
		setHovered(null);
		if (path.length < 2) return;

		const letters = path.map(([r, c]) => grid[r]![c]!).join('');
		const forward = letters.toLowerCase();
		const reversed = forward.split('').reverse().join('');
		const entry =
			findDestination(MAZE_ID, forward) ?? findDestination(MAZE_ID, reversed);
		if (!entry) return;

		// lock the cells in, confirm, then decode + navigate
		setFound((prev) => {
			const next = new Set(prev);
			for (const [r, c] of path) next.add(key(r, c));
			return next;
		});
		setToast(entry.label.toLowerCase());
		const dest = await decodePath(entry.cipher, entry.key);
		navTimerRef.current = window.setTimeout(() => {
			window.location.href = dest;
		}, 700);
	};

	const onPointerDown = (e: TargetedPointerEvent<HTMLDivElement>): void => {
		const pos = cellFromPoint(e.clientX, e.clientY);
		if (!pos) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		draggingRef.current = true;
		startRef.current = pos;
		setHovered(null);
		setSel([pos]);
	};

	const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>): void => {
		const pos = cellFromPoint(e.clientX, e.clientY);
		if (draggingRef.current) {
			if (pos && startRef.current) setSel(linePath(startRef.current, pos));
		} else {
			setHovered(pos);
		}
	};

	const onPointerUp = (e: TargetedPointerEvent<HTMLDivElement>): void => {
		if (!draggingRef.current) return;
		draggingRef.current = false;
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		void finalize();
	};

	const activeSet = new Set(selection.map(([r, c]) => key(r, c)));

	return (
		<>
			<div
				class="grid"
				style={`--cols:${SIZE}`}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerLeave={() => {
					if (!draggingRef.current) setHovered(null);
				}}
			>
				{grid.map((row, r) =>
					row.map((ch, c) => {
						const k = key(r, c);
						const cls = ['cell'];
						if (found.has(k)) cls.push('cell--found');
						else if (activeSet.has(k)) cls.push('cell--active');
						else if (hovered && hovered[0] === r && hovered[1] === c)
							cls.push('cell--hover');
						if (BRAND_KEYS.has(k)) cls.push('cell--brand');
						return (
							<div key={k} class={cls.join(' ')} data-row={r} data-col={c}>
								{ch}
							</div>
						);
					}),
				)}
			</div>
			{toast && <p class="word-found">{toast}</p>}
		</>
	);
}
