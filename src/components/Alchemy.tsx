/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { getDestinations, findDestination } from '../lib/destinations';
import { decodePath } from '../lib/crypto';

const MAZE_ID = 'alchemy';

// ---------------------------------------------------------------------------
// World — a 128×96 cell falling-sand automaton on a 4:3 canvas (CSS scales it
// to the 512px stage at an integer 4×). The sim ticks at ~30fps; rendering
// rides requestAnimationFrame so the brush cursor stays smooth.
// ---------------------------------------------------------------------------
const W = 128;
const H = 96;
const N = W * H;
const STEP_MS = 1000 / 30;
const BRUSH_R = 3;
/** reduced motion: keep stepping this long after the last stroke, then freeze */
const SETTLE_MS = 4000;
/** how long the discovery toast lingers */
const TOAST_MS = 2600;

// Cell materials. Order is load-bearing for MAT_VARS below.
const EMPTY = 0;
const SAND = 1;
const WATER = 2;
const FIRE = 3;
const EMBER = 4;
const SEED = 5;
const METAL = 6;
const OIL = 7;
const STONE = 8;
const GLASS = 9;
const STEAM = 10;
const PLANT = 11;
const RUST = 12;

// Per-material [dominant var, fallback, accent var, fallback] — the CSS custom
// properties live on .alch (maze.css section 7c); the sim reads them once at
// mount via getComputedStyle so palette tweaks stay in CSS. Fire's dominant is
// the flame BODY and its accent the sparse hot core (spatial dither — the
// design bans temporal flicker).
const MAT_VARS: ReadonlyArray<readonly [string, string, string, string]> = [
	['--alch-void', '#0b0e14', '--alch-void', '#0b0e14'], // EMPTY
	['--px-sand-1', '#dcae54', '--px-sand-2', '#b98e3e'], // SAND
	['--px-water-1', '#2f7fd6', '--px-water-2', '#4a9be8'], // WATER
	['--px-fire-2', '#ff7a33', '--px-fire-1', '#ffc23d'], // FIRE (body, core)
	['--px-ember', '#b8401f', '--px-ember', '#b8401f'], // EMBER
	['--px-seed-1', '#96a83c', '--px-seed-2', '#6f7f2a'], // SEED
	['--px-metal-1', '#97a3b2', '--px-metal-2', '#6d7987'], // METAL
	['--px-oil-1', '#664733', '--px-oil-2', '#4e3728'], // OIL
	['--px-stone-1', '#49525f', '--px-stone-2', '#333b46'], // STONE
	['--px-glass-1', '#aee3ea', '--px-glass-2', '#7fc4cf'], // GLASS
	['--px-steam-1', '#a7b8c9', '--px-steam-2', '#8397ab'], // STEAM
	['--px-plant-1', '#4bcf74', '--px-plant-2', '#2f9a52'], // PLANT
	['--px-rust-1', '#a44f27', '--px-rust-2', '#7e3c1f'], // RUST
];

// ---------------------------------------------------------------------------
// Brushes + products. The four PRODUCTS are the solve keys: when a product's
// cumulative created-cell count crosses its (forgiving) threshold it is
// "discovered" and its slot decodes into a real link. Steam counts creations
// (it condenses away), so all four counters are monotonic — nothing
// un-discovers. Product order matches the destinations table (home→glass,
// blog→steam, projects→plant, about→rust), so slots render in table order.
// ---------------------------------------------------------------------------
interface BrushDef {
	id: string;
	mat: number;
}
const BRUSHES: readonly BrushDef[] = [
	{ id: 'sand', mat: SAND },
	{ id: 'water', mat: WATER },
	{ id: 'fire', mat: FIRE },
	{ id: 'seed', mat: SEED },
	{ id: 'metal', mat: METAL },
	{ id: 'oil', mat: OIL },
	{ id: 'stone', mat: STONE },
	{ id: 'erase', mat: EMPTY },
];

// Product indices into the sim's counts array.
const P_GLASS = 0;
const P_STEAM = 1;
const P_PLANT = 2;
const P_RUST = 3;
interface ProductDef {
	key: string;
	threshold: number;
}
const PRODUCTS: readonly ProductDef[] = [
	{ key: 'glass', threshold: 30 },
	{ key: 'steam', threshold: 40 },
	{ key: 'plant', threshold: 30 },
	{ key: 'rust', threshold: 20 },
];

// Brush stamp density — powders/liquids spray, solids build solid, seeds drop
// sparsely so a stroke reads as individual kernels.
const DENSITY: readonly number[] = /* indexed by material */ (() => {
	const d = new Array<number>(MAT_VARS.length).fill(1);
	d[SAND] = 0.5;
	d[WATER] = 0.5;
	d[OIL] = 0.5;
	d[FIRE] = 0.35;
	d[SEED] = 0.12;
	return d;
})();

const rand = Math.random;
const fireLife = (): number => 20 + ((rand() * 20) | 0);

// ---------------------------------------------------------------------------
// Simulation. Typed arrays + a per-step `moved` mask (so a cell that already
// moved this step isn't re-processed when the scan reaches its new position —
// the classic double-move bug). Scan is bottom-up with alternating x order so
// piles and flows stay symmetric.
// ---------------------------------------------------------------------------
interface SimHooks {
	/** monotonic 0..1 progress toward a product's threshold (brew feedback) */
	onProgress(key: string, value: number): void;
	/** fired exactly once when a product crosses its threshold */
	onDiscover(key: string): void;
}

interface Sim {
	readonly grid: Uint8Array;
	step(): void;
	clear(): void;
	paintLine(x0: number, y0: number, x1: number, y1: number, mat: number): void;
}

function createSim(hooks: SimHooks): Sim {
	const grid = new Uint8Array(N); // material per cell
	const aux = new Uint8Array(N); // per-cell counter: fire/ember/steam life, plant energy
	const moved = new Uint8Array(N);
	const counts = new Float64Array(PRODUCTS.length); // cumulative cells created
	const reported = new Float64Array(PRODUCTS.length); // last progress emitted
	const discovered = new Set<string>();
	let frame = 0;

	const swap = (i: number, j: number): void => {
		const m = grid[i];
		const a = aux[i];
		grid[i] = grid[j];
		aux[i] = aux[j];
		grid[j] = m;
		aux[j] = a;
		moved[i] = 1;
		moved[j] = 1;
	};
	const set = (i: number, mat: number, a = 0): void => {
		grid[i] = mat;
		aux[i] = a;
		moved[i] = 1;
	};

	// -- reactions ------------------------------------------------------------

	/** water touching j: metal slowly corrodes to rust; seeds sprout to plant */
	const wetTouch = (j: number): void => {
		const m = grid[j];
		if (m === METAL) {
			if (rand() < 0.015) {
				set(j, RUST);
				counts[P_RUST]++;
			}
		} else if (m === SEED) {
			set(j, PLANT, 4 + ((rand() * 5) | 0));
			counts[P_PLANT]++;
		}
	};

	/**
	 * fire touching j. Returns true if the fire itself was quenched (water wins:
	 * the water flashes to steam, the fire collapses to a dying ember).
	 */
	const fireTouch = (i: number, j: number): boolean => {
		const m = grid[j];
		if (m === WATER) {
			set(j, STEAM, 60 + ((rand() * 60) | 0));
			counts[P_STEAM]++;
			set(i, EMBER, 4 + ((rand() * 6) | 0));
			return true;
		}
		if (m === SAND) {
			if (rand() < 0.2) {
				set(j, GLASS);
				counts[P_GLASS]++;
			}
		} else if (m === OIL || m === PLANT || m === SEED) {
			if (rand() < 0.5) set(j, FIRE, fireLife());
		}
		return false;
	};

	/** embers keep a weak spark: fuels adjacent to them can still catch */
	const emberTouch = (j: number): void => {
		const m = grid[j];
		if (m === OIL || m === PLANT || m === SEED) set(j, FIRE, fireLife());
	};

	const waterAdjacent = (i: number, x: number, y: number): boolean =>
		(y > 0 && grid[i - W] === WATER) ||
		(y < H - 1 && grid[i + W] === WATER) ||
		(x > 0 && grid[i - 1] === WATER) ||
		(x < W - 1 && grid[i + 1] === WATER);

	/** plant sips: consume ONE adjacent water cell (so puddles are a resource) */
	const drink = (i: number, x: number, y: number): boolean => {
		if (y < H - 1 && grid[i + W] === WATER) {
			set(i + W, EMPTY);
			return true;
		}
		if (x > 0 && grid[i - 1] === WATER) {
			set(i - 1, EMPTY);
			return true;
		}
		if (x < W - 1 && grid[i + 1] === WATER) {
			set(i + 1, EMPTY);
			return true;
		}
		if (y > 0 && grid[i - W] === WATER) {
			set(i - W, EMPTY);
			return true;
		}
		return false;
	};

	// -- per-material rules ---------------------------------------------------

	const stepSand = (i: number, x: number, y: number): void => {
		if (y >= H - 1) return;
		const b = i + W;
		const bm = grid[b];
		// falls; sinks through the liquids and steam
		if (bm === EMPTY || bm === WATER || bm === OIL || bm === STEAM) {
			swap(i, b);
			return;
		}
		const dx = rand() < 0.5 ? 1 : -1;
		if (x + dx >= 0 && x + dx < W && grid[b + dx] === EMPTY) swap(i, b + dx);
		else if (x - dx >= 0 && x - dx < W && grid[b - dx] === EMPTY) swap(i, b - dx);
	};

	const stepWater = (i: number, x: number, y: number): void => {
		// reactions with static neighbours (metal → rust, seed → plant)
		if (y > 0) wetTouch(i - W);
		if (y < H - 1) wetTouch(i + W);
		if (x > 0) wetTouch(i - 1);
		if (x < W - 1) wetTouch(i + 1);
		if (grid[i] !== WATER) return; // consumed by a reaction? (defensive)
		if (y < H - 1) {
			const b = i + W;
			const bm = grid[b];
			// falls; heavier than oil, so it sinks below it (oil floats)
			if (bm === EMPTY || bm === STEAM || bm === OIL) {
				swap(i, b);
				return;
			}
			const dx = rand() < 0.5 ? 1 : -1;
			if (x + dx >= 0 && x + dx < W && grid[b + dx] === EMPTY) {
				swap(i, b + dx);
				return;
			}
			if (x - dx >= 0 && x - dx < W && grid[b - dx] === EMPTY) {
				swap(i, b - dx);
				return;
			}
		}
		// pooled — flow sideways
		const dx = rand() < 0.5 ? 1 : -1;
		if (x + dx >= 0 && x + dx < W && grid[i + dx] === EMPTY) swap(i, i + dx);
		else if (x - dx >= 0 && x - dx < W && grid[i - dx] === EMPTY) swap(i, i - dx);
	};

	const stepFire = (i: number, x: number, y: number): void => {
		// reactions first — water quenches (early out), sand vitrifies, fuels catch
		if (y > 0 && fireTouch(i, i - W)) return;
		if (y < H - 1 && fireTouch(i, i + W)) return;
		if (x > 0 && fireTouch(i, i - 1)) return;
		if (x < W - 1 && fireTouch(i, i + 1)) return;
		const life = aux[i] - 1;
		if (life <= 0) {
			set(i, EMBER, 6 + ((rand() * 10) | 0));
			return;
		}
		aux[i] = life;
		// rises, with a little lateral lick
		if (y > 0) {
			const u = i - W;
			if (grid[u] === EMPTY && rand() < 0.6) {
				swap(i, u);
				return;
			}
			const dx = rand() < 0.5 ? 1 : -1;
			if (rand() < 0.3 && x + dx >= 0 && x + dx < W && grid[u + dx] === EMPTY)
				swap(i, u + dx);
		}
	};

	const stepEmber = (i: number, x: number, y: number): void => {
		const life = aux[i] - 1;
		if (life <= 0) {
			set(i, EMPTY);
			return;
		}
		aux[i] = life;
		if (rand() < 0.05) {
			if (y > 0) emberTouch(i - W);
			if (y < H - 1) emberTouch(i + W);
			if (x > 0) emberTouch(i - 1);
			if (x < W - 1) emberTouch(i + 1);
		}
	};

	const stepSeed = (i: number, x: number, y: number): void => {
		// inert until wet — then it sprouts (water's own pass also catches this)
		if (waterAdjacent(i, x, y)) {
			set(i, PLANT, 4 + ((rand() * 5) | 0));
			counts[P_PLANT]++;
			return;
		}
		if (y >= H - 1) return;
		const b = i + W;
		const bm = grid[b];
		if (bm === EMPTY) {
			swap(i, b);
			return;
		}
		if (bm === WATER && rand() < 0.25) {
			swap(i, b); // sinks slowly — buoyant little kernel
			return;
		}
		const dx = rand() < 0.5 ? 1 : -1;
		if (x + dx >= 0 && x + dx < W && grid[b + dx] === EMPTY) swap(i, b + dx);
		else if (x - dx >= 0 && x - dx < W && grid[b - dx] === EMPTY) swap(i, b - dx);
	};

	const stepOil = (i: number, x: number, y: number): void => {
		if (y < H - 1) {
			const b = i + W;
			const bm = grid[b];
			// lighter than water: falls through empty/steam only, floats on water
			if (bm === EMPTY || bm === STEAM) {
				swap(i, b);
				return;
			}
			const dx = rand() < 0.5 ? 1 : -1;
			if (x + dx >= 0 && x + dx < W && grid[b + dx] === EMPTY) {
				swap(i, b + dx);
				return;
			}
			if (x - dx >= 0 && x - dx < W && grid[b - dx] === EMPTY) {
				swap(i, b - dx);
				return;
			}
		}
		const dx = rand() < 0.5 ? 1 : -1;
		if (x + dx >= 0 && x + dx < W && grid[i + dx] === EMPTY) swap(i, i + dx);
		else if (x - dx >= 0 && x - dx < W && grid[i - dx] === EMPTY) swap(i, i - dx);
	};

	const stepSteam = (i: number, x: number, y: number): void => {
		const life = aux[i] - 1;
		if (life <= 0) {
			// condenses back to water (by now it has drifted to the top / a ceiling)
			set(i, WATER);
			return;
		}
		aux[i] = life;
		if (y > 0) {
			const u = i - W;
			const um = grid[u];
			// rises; bubbles up through the liquids
			if ((um === EMPTY || um === WATER || um === OIL) && rand() < 0.8) {
				swap(i, u);
				return;
			}
			const dx = rand() < 0.5 ? 1 : -1;
			if (rand() < 0.5 && x + dx >= 0 && x + dx < W && grid[u + dx] === EMPTY) {
				swap(i, u + dx);
				return;
			}
		}
		// lateral drift under a ceiling
		if (rand() < 0.4) {
			const dx = rand() < 0.5 ? 1 : -1;
			if (x + dx >= 0 && x + dx < W && grid[i + dx] === EMPTY) swap(i, i + dx);
		}
	};

	const stepPlant = (i: number, x: number, y: number): void => {
		let energy = aux[i];
		// while wet: sip an adjacent water cell to bank growth energy
		if (energy < 9 && rand() < 0.06 && drink(i, x, y)) {
			energy = Math.min(9, energy + 3);
			aux[i] = energy;
		}
		if (energy === 0 || y === 0) return;
		// grows upward/branching: up or up-diagonal, into air or through water
		if (rand() < 0.18) {
			const dx = ((rand() * 3) | 0) - 1; // -1 | 0 | 1
			const nx = x + dx;
			if (nx >= 0 && nx < W) {
				const j = i - W + dx;
				const m = grid[j];
				if (m === EMPTY || m === WATER) {
					set(j, PLANT, energy - 1);
					aux[i] = energy - 1;
					counts[P_PLANT]++;
				}
			}
		}
	};

	const stepRust = (i: number, x: number, y: number): void => {
		// corrosion creeps: once started, rust slowly eats adjacent metal — so a
		// wet bar keeps rusting past its surface (keeps the threshold reachable)
		if (rand() >= 0.01) return;
		if (y > 0 && grid[i - W] === METAL) set(i - W, RUST);
		else if (y < H - 1 && grid[i + W] === METAL) set(i + W, RUST);
		else if (x > 0 && grid[i - 1] === METAL) set(i - 1, RUST);
		else if (x < W - 1 && grid[i + 1] === METAL) set(i + 1, RUST);
		else return;
		counts[P_RUST]++;
	};

	// -- driver ---------------------------------------------------------------

	const checkProducts = (): void => {
		for (let p = 0; p < PRODUCTS.length; p++) {
			const def = PRODUCTS[p]!;
			const v = Math.min(1, counts[p]! / def.threshold);
			if (v > reported[p]!) {
				reported[p] = v;
				hooks.onProgress(def.key, v);
			}
			if (v >= 1 && !discovered.has(def.key)) {
				discovered.add(def.key);
				hooks.onDiscover(def.key);
			}
		}
	};

	const step = (): void => {
		moved.fill(0);
		const ltr = (frame & 1) === 0;
		for (let y = H - 1; y >= 0; y--) {
			const row = y * W;
			for (let k = 0; k < W; k++) {
				const x = ltr ? k : W - 1 - k;
				const i = row + x;
				if (moved[i]) continue;
				switch (grid[i]) {
					case SAND:
						stepSand(i, x, y);
						break;
					case WATER:
						stepWater(i, x, y);
						break;
					case FIRE:
						stepFire(i, x, y);
						break;
					case EMBER:
						stepEmber(i, x, y);
						break;
					case SEED:
						stepSeed(i, x, y);
						break;
					case OIL:
						stepOil(i, x, y);
						break;
					case STEAM:
						stepSteam(i, x, y);
						break;
					case PLANT:
						stepPlant(i, x, y);
						break;
					case RUST:
						stepRust(i, x, y);
						break;
					// stone / metal / glass are static; empty does nothing
				}
			}
		}
		frame++;
		checkProducts();
	};

	// Clears the CANVAS only — the cumulative product counts (and anything
	// already discovered) survive, per the "never un-discovers" contract.
	const clear = (): void => {
		grid.fill(EMPTY);
		aux.fill(0);
	};

	const paintAt = (cx: number, cy: number, mat: number): void => {
		const density = DENSITY[mat] ?? 1;
		for (let dy = -BRUSH_R; dy <= BRUSH_R; dy++) {
			const yy = cy + dy;
			if (yy < 0 || yy >= H) continue;
			for (let dx = -BRUSH_R; dx <= BRUSH_R; dx++) {
				if (dx * dx + dy * dy > BRUSH_R * BRUSH_R) continue;
				const xx = cx + dx;
				if (xx < 0 || xx >= W) continue;
				const i = yy * W + xx;
				if (mat === EMPTY) {
					// erase clears anything
					grid[i] = EMPTY;
					aux[i] = 0;
					continue;
				}
				// brushes fill the void; they never overwrite (protects built walls)
				if (grid[i] !== EMPTY) continue;
				if (density < 1 && rand() >= density) continue;
				grid[i] = mat;
				aux[i] = mat === FIRE ? fireLife() : 0;
			}
		}
	};

	const paintLine = (
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		mat: number,
	): void => {
		// stamp along the segment so fast drags leave no gaps
		const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
		for (let s = 0; s <= steps; s++) {
			const t = steps === 0 ? 0 : s / steps;
			paintAt(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), mat);
		}
	};

	return { grid, step, clear, paintLine };
}

// ---------------------------------------------------------------------------
// Rendering — one ImageData blit per frame via a Uint32 view. Two shades per
// material, chosen by a FIXED per-cell noise field (spatial dither: particles
// move through a stable screen-space texture — no temporal flicker).
// ---------------------------------------------------------------------------

/** parse a --px-* var (falling back to the design hex) into little-endian RGBA */
function cssColor(styles: CSSStyleDeclaration, name: string, fallback: string): number {
	const raw = styles.getPropertyValue(name).trim() || fallback;
	let hex = raw.startsWith('#') ? raw.slice(1) : fallback.slice(1);
	if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
	const n = parseInt(hex, 16);
	if (Number.isNaN(n) || hex.length !== 6) return 0xff000000 >>> 0;
	const r = (n >> 16) & 0xff;
	const g = (n >> 8) & 0xff;
	const b = n & 0xff;
	return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function buildPalette(styles: CSSStyleDeclaration): Uint32Array {
	const pal = new Uint32Array(MAT_VARS.length * 2);
	MAT_VARS.forEach(([v1, f1, v2, f2], mat) => {
		pal[mat * 2] = cssColor(styles, v1, f1);
		pal[mat * 2 + 1] = cssColor(styles, v2, f2);
	});
	return pal;
}

// ---------------------------------------------------------------------------
// Icons — 7×7 pixel art lifted from the designer's sprite
// (src/assets/alchemy-icons.svg), encoded as [x, y, w?, h?] rect runs per fill
// layer and emitted once as an in-document hidden <symbol> sprite so the
// CSS --px-* vars cascade into the fills. Buttons/links reference them with
// <use>; all icon SVG is decorative (aria-hidden).
// ---------------------------------------------------------------------------
type Run = readonly [number, number, number?, number?];
interface IconLayer {
	fill: string;
	px: readonly Run[];
}
const ICONS: Record<string, readonly IconLayer[]> = {
	// sand: a settled pile, checker-dithered
	'el-sand': [
		{
			fill: 'var(--px-sand-1, #dcae54)',
			px: [[3, 3], [2, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [2, 6], [4, 6], [6, 6]],
		},
		{
			fill: 'var(--px-sand-2, #b98e3e)',
			px: [[3, 4], [2, 5], [4, 5], [1, 6], [3, 6], [5, 6]],
		},
	],
	// water: a pool with a light wave crest
	'el-water': [
		{
			fill: 'var(--px-water-1, #2f7fd6)',
			px: [[0, 4, 2, 1], [3, 4, 2, 1], [6, 4], [0, 5, 7, 1], [0, 6, 7, 1]],
		},
		{
			fill: 'var(--px-water-2, #4a9be8)',
			px: [[1, 3], [4, 3], [2, 4], [5, 4]],
		},
	],
	// fire: flame body with a hot core
	'el-fire': [
		{
			fill: 'var(--px-fire-2, #ff7a33)',
			px: [[3, 0], [3, 1, 2, 1], [2, 2, 3, 1], [1, 3, 2, 1], [4, 3, 2, 1], [1, 4], [5, 4], [2, 5], [4, 5]],
		},
		{
			fill: 'var(--px-fire-1, #ffc23d)',
			px: [[3, 3], [2, 4, 3, 1], [3, 5]],
		},
	],
	// seed: a small kernel with a highlight
	'el-seed': [
		{ fill: 'var(--px-seed-1, #96a83c)', px: [[2, 3, 3, 1], [3, 4]] },
		{ fill: 'var(--px-seed-2, #6f7f2a)', px: [[3, 2]] },
	],
	// metal: a bar with a specular top edge
	'el-metal': [
		{ fill: 'var(--px-metal-1, #97a3b2)', px: [[0, 3, 7, 2]] },
		{ fill: 'var(--px-metal-2, #6d7987)', px: [[0, 2, 7, 1]] },
	],
	// oil: a heavy droplet with a dark sheen
	'el-oil': [
		{
			fill: 'var(--px-oil-1, #664733)',
			px: [[3, 1], [3, 2, 2, 1], [1, 3], [3, 3, 3, 1], [1, 4, 5, 1], [2, 5, 3, 1]],
		},
		{ fill: 'var(--px-oil-2, #4e3728)', px: [[2, 2], [2, 3]] },
	],
	// stone: a boulder with a lit shoulder
	'el-stone': [
		{
			fill: 'var(--px-stone-1, #49525f)',
			px: [[4, 2], [2, 3, 4, 1], [0, 4], [2, 4, 5, 1], [0, 5, 7, 1], [1, 6, 5, 1]],
		},
		{ fill: 'var(--px-stone-2, #333b46)', px: [[2, 2, 2, 1], [1, 3], [1, 4]] },
	],
	// erase: a pixel X, rides currentColor
	'el-erase': [
		{
			fill: 'currentColor',
			px: [[1, 1], [5, 1], [2, 2], [4, 2], [3, 3], [2, 4], [4, 4], [1, 5], [5, 5]],
		},
	],
	// glass: a diamond outline (a clear stone)
	'sig-glass': [
		{
			fill: 'currentColor',
			px: [[3, 0], [2, 1], [4, 1], [1, 2], [5, 2], [0, 3], [6, 3], [1, 4], [5, 4], [2, 5], [4, 5], [3, 6]],
		},
	],
	// steam: two rising waves (vapor)
	'sig-steam': [
		{
			fill: 'currentColor',
			px: [[1, 1], [3, 1], [5, 1], [0, 2], [2, 2], [4, 2], [6, 2], [1, 4], [3, 4], [5, 4], [0, 5], [2, 5], [4, 5], [6, 5]],
		},
	],
	// plant: a sprout — stem and two leaves
	'sig-plant': [
		{ fill: 'currentColor', px: [[1, 1], [5, 1], [2, 2, 3, 1], [3, 3, 1, 4]] },
	],
	// rust: a pitted, broken ring (corroded circle)
	'sig-rust': [
		{
			fill: 'currentColor',
			px: [[2, 0, 3, 1], [1, 1], [0, 2], [6, 2], [0, 3], [4, 3], [6, 3], [6, 4], [1, 5], [5, 5], [2, 6], [4, 6]],
		},
	],
};

/** the hidden in-document sprite (rendered once inside .alch) */
function Sprite(): JSX.Element {
	return (
		<svg style="display:none" aria-hidden="true" focusable="false">
			{Object.entries(ICONS).map(([id, layers]) => (
				<symbol key={id} id={id} viewBox="0 0 7 7">
					{layers.map((layer) => (
						<g fill={layer.fill}>
							{layer.px.map(([x, y, w = 1, h = 1]) => (
								<rect x={x} y={y} width={w} height={h} />
							))}
						</g>
					))}
				</symbol>
			))}
		</svg>
	);
}

function Icon({ id, class: cls }: { id: string; class?: string }): JSX.Element {
	return (
		<svg viewBox="0 0 7 7" class={cls} aria-hidden="true" focusable="false">
			<use href={`#${id}`} />
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Slot order IS the destinations table order (home, blog, projects, about).
const DESTS = getDestinations(MAZE_ID);
const SLOT_INDEX: Record<string, number> = Object.fromEntries(
	DESTS.map((d, i) => [d.key, i]),
);

export default function Alchemy(): JSX.Element {
	const [brush, setBrush] = useState<string>('sand');
	// product key -> decoded href, once discovered
	const [revealed, setRevealed] = useState<Record<string, string>>({});
	const [toast, setToast] = useState<string | null>(null);

	const rootRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const slotEls = useRef<(HTMLElement | null)[]>([]);
	// Last brew progress per product — mirrored here so a re-render (toast,
	// reveal) repaints the inline --brew instead of resetting it to 0.
	const brewRef = useRef<Record<string, number>>({});
	// Mirrors `brush` so the sim's pointer handlers (bound once at mount) read
	// the current selection without re-running the mount effect.
	const brushRef = useRef(brush);
	useEffect(() => {
		brushRef.current = brush;
	}, [brush]);
	// Mounted flag (the WordSearch/Backdoors idiom): discovery awaits an async
	// decode; if the maze is switched mid-await the resolved promise must not
	// touch state on an unmounted component.
	const aliveRef = useRef(true);
	const toastTimerRef = useRef<number | null>(null);
	// clear() lives inside the mount effect; the button reaches it through here.
	const clearRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		aliveRef.current = true;
		const root = rootRef.current;
		const canvas = canvasRef.current;
		if (!root || !canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// -- sim + hooks --------------------------------------------------------
		const onProgress = (key: string, v: number): void => {
			brewRef.current[key] = v;
			const el = slotEls.current[SLOT_INDEX[key] ?? -1];
			el?.style.setProperty('--brew', v.toFixed(3));
		};
		const onDiscover = (key: string): void => {
			const entry = findDestination(MAZE_ID, key);
			if (!entry) return;
			decodePath(entry.cipher, entry.key)
				.then((href) => {
					if (!aliveRef.current) return;
					setRevealed((prev) => ({ ...prev, [key]: href }));
					// toast speaks the PRODUCT name — the door label sits in the slot
					setToast(key);
					if (toastTimerRef.current !== null)
						window.clearTimeout(toastTimerRef.current);
					toastTimerRef.current = window.setTimeout(() => {
						if (aliveRef.current) setToast(null);
					}, TOAST_MS);
				})
				.catch(() => {
					/* bad cipher — leave the slot sealed */
				});
		};
		const sim = createSim({ onProgress, onDiscover });
		clearRef.current = () => {
			sim.clear();
			render();
		};

		// -- rendering ----------------------------------------------------------
		const img = ctx.createImageData(W, H);
		const px = new Uint32Array(img.data.buffer);
		const pal = buildPalette(getComputedStyle(root));
		// fixed noise field for the spatial two-tone dither
		const noise = new Uint8Array(N);
		for (let i = 0; i < N; i++) noise[i] = (rand() * 256) | 0;

		let cursor: { x: number; y: number } | null = null;

		const render = (): void => {
			const grid = sim.grid;
			for (let i = 0; i < N; i++) {
				const m = grid[i]!;
				// fire keeps a sparse hot core; everything else takes a ~37% accent
				const shade = m === FIRE ? (noise[i]! < 64 ? 1 : 0) : noise[i]! < 96 ? 1 : 0;
				px[i] = pal[m * 2 + shade]!;
			}
			ctx.putImageData(img, 0, 0);
			if (cursor) {
				// brush-radius outline at the pointer (sim-pixel scale)
				ctx.strokeStyle = 'rgba(199,208,220,0.35)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.arc(cursor.x + 0.5, cursor.y + 0.5, BRUSH_R + 0.5, 0, Math.PI * 2);
				ctx.stroke();
			}
		};

		// -- loop ---------------------------------------------------------------
		// Normal mode: fixed ~30fps steps, rendered every rAF, idling only when
		// the tab is hidden (rAF suspends; the acc clamp absorbs the gap).
		// Reduced motion: the loop runs only while painting plus a SETTLE_MS
		// window after the last stroke, then freezes on a final frame.
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let raf = 0;
		let running = false;
		let prevT = 0;
		let acc = 0;
		let painting = false;
		let settleUntil = 0;

		const tick = (t: number): void => {
			if (!aliveRef.current) return;
			if (reduced && !painting && t > settleUntil) {
				running = false;
				render(); // settle into the frozen frame
				return;
			}
			raf = requestAnimationFrame(tick);
			if (document.hidden) {
				prevT = t;
				return;
			}
			acc = Math.min(acc + (t - prevT), STEP_MS * 4);
			prevT = t;
			while (acc >= STEP_MS) {
				sim.step();
				acc -= STEP_MS;
			}
			render();
		};
		const start = (): void => {
			if (running) return;
			running = true;
			prevT = performance.now();
			acc = 0;
			raf = requestAnimationFrame(tick);
		};

		// -- painting -----------------------------------------------------------
		const matByBrush: Record<string, number> = Object.fromEntries(
			BRUSHES.map((b) => [b.id, b.mat]),
		);
		const toCell = (e: PointerEvent): readonly [number, number] => {
			const r = canvas.getBoundingClientRect();
			const x = Math.floor(((e.clientX - r.left) / r.width) * W);
			const y = Math.floor(((e.clientY - r.top) / r.height) * H);
			return [
				Math.max(0, Math.min(W - 1, x)),
				Math.max(0, Math.min(H - 1, y)),
			];
		};
		let last: readonly [number, number] | null = null;

		const onDown = (e: PointerEvent): void => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			canvas.setPointerCapture(e.pointerId);
			painting = true;
			const [x, y] = toCell(e);
			cursor = { x, y };
			last = [x, y];
			sim.paintLine(x, y, x, y, matByBrush[brushRef.current] ?? SAND);
			start(); // reduced mode wakes here; harmless when already running
		};
		const onMove = (e: PointerEvent): void => {
			const [x, y] = toCell(e);
			cursor = { x, y };
			if (painting && last) {
				sim.paintLine(last[0], last[1], x, y, matByBrush[brushRef.current] ?? SAND);
				last = [x, y];
			}
			if (!running) render(); // frozen (reduced) — still track the brush ring
		};
		const endStroke = (): void => {
			if (!painting) return;
			painting = false;
			last = null;
			settleUntil = performance.now() + SETTLE_MS;
			start();
		};
		const onLeave = (): void => {
			cursor = null;
			if (!running) render();
		};

		canvas.addEventListener('pointerdown', onDown);
		canvas.addEventListener('pointermove', onMove);
		canvas.addEventListener('pointerup', endStroke);
		canvas.addEventListener('pointercancel', endStroke);
		canvas.addEventListener('pointerleave', onLeave);

		if (reduced) render(); // draw the empty world once; wait for a stroke
		else start();

		return () => {
			aliveRef.current = false;
			cancelAnimationFrame(raf);
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerup', endStroke);
			canvas.removeEventListener('pointercancel', endStroke);
			canvas.removeEventListener('pointerleave', onLeave);
			if (toastTimerRef.current !== null)
				window.clearTimeout(toastTimerRef.current);
			clearRef.current = null;
		};
	}, []);

	return (
		<div class="alch" ref={rootRef}>
			<Sprite />
			<div class="alch__stage">
				<canvas
					ref={canvasRef}
					class="alch__canvas"
					width={W}
					height={H}
					aria-label="alchemy bench — paint elements and let them react"
				/>
			</div>

			<div class="alch__tray">
				{BRUSHES.map((b) => (
					<button
						key={b.id}
						type="button"
						class={`alch__el${b.id === 'erase' ? ' alch__el--erase' : ''}${
							brush === b.id ? ' alch__el--on' : ''
						}`}
						aria-label={`${b.id} brush`}
						aria-pressed={brush === b.id}
						onClick={() => setBrush(b.id)}
					>
						<span class="alch__el-icon">
							<Icon id={`el-${b.id}`} />
						</span>
						<span class="alch__el-name" aria-hidden="true">
							{b.id}
						</span>
					</button>
				))}
				<button
					type="button"
					class="alch__clear"
					onClick={() => clearRef.current?.()}
				>
					clear
				</button>
			</div>

			<div class="alch__slots">
				{DESTS.map((d, idx) => {
					const href = revealed[d.key];
					const cls = `alch__slot alch__slot--${d.key}${
						href ? ' alch__slot--revealed' : ''
					}`;
					// keep --brew across re-renders (the sim also writes it directly)
					const style = `--brew:${(brewRef.current[d.key] ?? 0).toFixed(3)}`;
					const setEl = (el: HTMLElement | null): void => {
						slotEls.current[idx] = el;
					};
					return href ? (
						<a key={d.key} class={cls} style={style} href={href} ref={setEl}>
							<Icon id={`sig-${d.key}`} class="alch__sigil" />
							{/* CSS lowercases the decoded label */}
							<span class="alch__slot-name">{d.label}</span>
						</a>
					) : (
						<div key={d.key} class={cls} style={style} ref={setEl}>
							<Icon id={`sig-${d.key}`} class="alch__sigil" />
							{/* reserved line — CSS paints "···" while sealed */}
							<span class="alch__slot-name" />
						</div>
					);
				})}
			</div>

			{toast && <p class="word-found">{toast}</p>}
			<p class="maze__hint">mix — some reactions open doors.</p>
		</div>
	);
}
