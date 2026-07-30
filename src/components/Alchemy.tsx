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
//
// v2 "wuxing": the palette is the five phases (wood / fire / earth / metal /
// water); everything else is DERIVED by reaction and unlocks as a brush when
// first created. The four doors are ARTIFACT detectors (house / scroll /
// automaton / mirror), not material counters.
// ---------------------------------------------------------------------------
const W = 128;
const H = 96;
const N = W * H;
const STEP_MS = 1000 / 30;
const BRUSH_R = 3;
/** reduced motion: keep stepping this long after the last stroke, then freeze */
const SETTLE_MS = 4000;
/** how long the discovery/unlock toast lingers */
const TOAST_MS = 2600;
/** how long the artifact-discovery popup stays over the canvas */
const POP_MS = 2800;

// Cell materials. Order is load-bearing for MAT_VARS below.
const EMPTY = 0;
const WOOD = 1;
const FIRE = 2;
const EMBER = 3;
const EARTH = 4;
const METAL = 5;
const WATER = 6;
const ASH = 7;
const PULP = 8;
const MUD = 9;
const BRICK = 10;
const GLASS = 11;
const MOLTEN = 12;
const FORGED = 13;
const STEAM = 14;
const INK = 15;
const PAPER = 16;
/** burning wood — wood's burn phase (stays put; the ash source) */
const BURN = 17;
/** ink-stained paper — the scroll's countable state */
const INKED = 18;

// Per-material [dominant var, fallback, accent var, fallback] — the CSS custom
// properties live on .alch (maze.css section 7c); the sim reads them once at
// mount via getComputedStyle so palette tweaks stay in CSS. Fire's dominant is
// the flame BODY and its accent the sparse hot core; molten metal likewise
// carries sparse white-hot glints (spatial dither — the design bans temporal
// flicker). BURN mixes flame body with heavy ember mottle; INKED is paper with
// ink flecks (the stain itself).
const MAT_VARS: ReadonlyArray<readonly [string, string, string, string]> = [
	['--alch-void', '#0b0e14', '--alch-void', '#0b0e14'], // EMPTY
	['--px-wood-1', '#96a83c', '--px-wood-2', '#6f7f2a'], // WOOD
	['--px-fire-2', '#ff7a33', '--px-fire-1', '#ffc23d'], // FIRE (body, core)
	['--px-ember', '#b8401f', '--px-ember', '#b8401f'], // EMBER
	['--px-earth-1', '#dcae54', '--px-earth-2', '#b98e3e'], // EARTH
	['--px-metal-1', '#97a3b2', '--px-metal-2', '#6d7987'], // METAL
	['--px-water-1', '#2f7fd6', '--px-water-2', '#4a9be8'], // WATER
	['--px-ash-1', '#98928a', '--px-ash-2', '#75706a'], // ASH
	['--px-pulp-1', '#b8ab7e', '--px-pulp-2', '#94885f'], // PULP
	['--px-mud-1', '#7a5c39', '--px-mud-2', '#5d4529'], // MUD
	['--px-brick-1', '#c96f45', '--px-brick-2', '#a1522f'], // BRICK
	['--px-glass-1', '#aee3ea', '--px-glass-2', '#7fc4cf'], // GLASS
	['--px-molten-1', '#f0603c', '--px-molten-2', '#ffcf6e'], // MOLTEN (body, glints)
	['--px-forged-1', '#5e6f8d', '--px-forged-2', '#93a9cc'], // FORGED
	['--px-steam-1', '#a7b8c9', '--px-steam-2', '#8397ab'], // STEAM
	['--px-ink-1', '#46549e', '--px-ink-2', '#2e3870'], // INK
	['--px-paper-1', '#ecdfbc', '--px-paper-2', '#cbbd93'], // PAPER
	['--px-fire-2', '#ff7a33', '--px-ember', '#b8401f'], // BURN (body, embers)
	['--px-paper-1', '#ecdfbc', '--px-ink-1', '#46549e'], // INKED (page, stain)
];
const NMAT = MAT_VARS.length;

// Per-material accent-dither threshold against the fixed 0..255 noise field
// (noise < t → accent shade). Fire/molten keep their accents SPARSE so the
// hot cores/glints read as highlights, not stripes.
const ACCENT_T: Uint8Array = (() => {
	const t = new Uint8Array(NMAT).fill(96);
	t[FIRE] = 64;
	t[MOLTEN] = 56;
	t[BURN] = 112;
	t[INKED] = 112;
	return t;
})();

// ---------------------------------------------------------------------------
// Sustained-reaction thresholds (aux counts sim steps; 30 steps ≈ 1s). Each
// "prolonged/sustained" transformation banks progress in the aux array, and
// rendering dithers the cell toward the TARGET material as it accumulates.
// ---------------------------------------------------------------------------
/** wood under water → pulp */
const SOAK_T = 130;
/** metal under heat → molten */
const MELT_T = 110;
/** mud under heat → brick */
const KILN_T = 90;
/** dry earth ("melted sand") under long heat → glass */
const VITRIFY_T = 150;
/** pulp heated dry → paper */
const DRY_T = 80;
/** molten metal cooling in air → forged */
const COOL_T = 130;

// Transition-state rendering (the designer's rule): a transitioning cell keeps
// its own dominant fill but draws dither pixels from the TARGET material's
// shade 1, fraction rising with aux/threshold. TRANS_SCALE maps aux → a 0..256
// noise cutoff; TRANS_COL is the palette index of the target fleck color.
// Heat-driven solids additionally get a sparse --px-ember fleck band.
const TRANS_SCALE = new Float64Array(NMAT);
const TRANS_COL = new Uint16Array(NMAT);
const HEAT_FLECK = new Uint8Array(NMAT);
TRANS_SCALE[WOOD] = 256 / SOAK_T;
TRANS_COL[WOOD] = PULP * 2;
TRANS_SCALE[METAL] = 256 / MELT_T;
TRANS_COL[METAL] = MOLTEN * 2;
TRANS_SCALE[EARTH] = 256 / VITRIFY_T;
TRANS_COL[EARTH] = GLASS * 2; // dry path: sand slowly fusing
TRANS_SCALE[MUD] = 256 / KILN_T;
TRANS_COL[MUD] = BRICK * 2;
TRANS_SCALE[PULP] = 256 / DRY_T;
TRANS_COL[PULP] = PAPER * 2;
TRANS_SCALE[MOLTEN] = 256 / COOL_T;
TRANS_COL[MOLTEN] = FORGED * 2;
HEAT_FLECK[EARTH] = 1;
HEAT_FLECK[METAL] = 1;
HEAT_FLECK[MUD] = 1;
HEAT_FLECK[PULP] = 1;

// ---------------------------------------------------------------------------
// Brushes. Grid order is FIXED (matches the CSS class-map contract): the five
// phases in wuxing recitation order (金木水火土 — metal, wood, water, fire,
// earth), then the ten derived seats sorted by goal-recipe sequence
// home→blog→projects→about so unlocks tend to march left-to-right, then
// erase. Derived materials start LOCKED and flip to live buttons in place the
// first time the sim creates them.
// ---------------------------------------------------------------------------
interface BrushDef {
	id: string;
	mat: number;
	/** usable from the start (the five phases + erase) */
	base: boolean;
}
const BRUSHES: readonly BrushDef[] = [
	{ id: 'metal', mat: METAL, base: true },
	{ id: 'wood', mat: WOOD, base: true },
	{ id: 'water', mat: WATER, base: true },
	{ id: 'fire', mat: FIRE, base: true },
	{ id: 'earth', mat: EARTH, base: true },
	// house
	{ id: 'mud', mat: MUD, base: false },
	{ id: 'brick', mat: BRICK, base: false },
	// scroll
	{ id: 'pulp', mat: PULP, base: false },
	{ id: 'paper', mat: PAPER, base: false },
	{ id: 'ash', mat: ASH, base: false },
	{ id: 'ink', mat: INK, base: false },
	// automaton
	{ id: 'molten', mat: MOLTEN, base: false },
	{ id: 'forged', mat: FORGED, base: false },
	{ id: 'steam', mat: STEAM, base: false },
	// mirror
	{ id: 'glass', mat: GLASS, base: false },
	{ id: 'erase', mat: EMPTY, base: true },
];

/** brush id → material, for the pointer handlers */
const MAT_BY_BRUSH: Record<string, number> = Object.fromEntries(
	BRUSHES.map((b) => [b.id, b.mat]),
);

/** material id → tile name, for the ten unlockable derived materials only */
const DERIVED_NAME: ReadonlyMap<number, string> = new Map(
	BRUSHES.filter((b) => !b.base).map((b) => [b.mat, b.id]),
);

// Brush stamp density — powders/liquids spray, solids build solid.
const DENSITY: readonly number[] = /* indexed by material */ (() => {
	const d = new Array<number>(NMAT).fill(1);
	d[EARTH] = 0.5;
	d[WATER] = 0.5;
	d[FIRE] = 0.35;
	d[ASH] = 0.5;
	d[PULP] = 0.7;
	d[MUD] = 0.6;
	d[MOLTEN] = 0.6;
	d[STEAM] = 0.35;
	d[INK] = 0.5;
	return d;
})();

const rand = Math.random;
const fireLife = (): number => 20 + ((rand() * 20) | 0);
const steamLife = (): number => 60 + ((rand() * 60) | 0);
/** burning wood outlives free flame — it IS the fuel (~4–6.5s per cell) */
const burnLife = (): number => 120 + ((rand() * 80) | 0);

// ---------------------------------------------------------------------------
// Artifact detectors — the four solution keys. Each is a FORGIVING pattern
// check over the grid (never an engineering sim) and requires SUSTAINED
// conditions via a hold counter; expensive scans run at reduced cadence.
// Discovery is monotonic and survives clear().
// ---------------------------------------------------------------------------
const A_HOUSE = 0;
const A_SCROLL = 1;
const A_AUTOMATON = 2;
const A_MIRROR = 3;
const ART_KEYS: readonly string[] = ['house', 'scroll', 'automaton', 'mirror'];

/** scroll: cumulative ink-stained paper cells */
const SCROLL_NEED = 30;
/** scroll brew hint: paper on canvas that counts as "the page exists" */
const SCROLL_PAPER = 12;
/** house/automaton/mirror: structural scans every 15 frames (~0.5s) */
const SLOW_EVERY = 15;
/** house: min enclosed hollow cells + min brick cells lining/joined to it */
const HOUSE_CAVITY = 6;
const HOUSE_BRICK = 10;
const HOUSE_NEED = 3; // ≈ 1.5s standing — rides out mid-collapse transients
/** automaton: connected forged-metal component size + held steam checks */
const AUTO_SIZE = 30;
const AUTO_NEED = 7; // ≈ 3.5s of steam at the machine
/** mirror: horizontal forged run with glass directly above + held checks */
const MIRROR_RUN = 8;
const MIRROR_NEED = 4; // ≈ 2s aligned

// ---------------------------------------------------------------------------
// Simulation. Typed arrays + a per-step `moved` mask (so a cell that already
// moved this step isn't re-processed when the scan reaches its new position —
// the classic double-move bug). Scan is bottom-up with alternating x order so
// piles and flows stay symmetric.
// ---------------------------------------------------------------------------
interface SimHooks {
	/** 0..1 progress of an artifact detector (brew feedback; may ebb) */
	onProgress(key: string, value: number): void;
	/** fired exactly once when an artifact detector completes */
	onDiscover(key: string): void;
	/** fired exactly once when a derived material is first created */
	onUnlock(id: string): void;
}

interface Sim {
	readonly grid: Uint8Array;
	/** per-cell counters — read by the renderer for transition-state dither */
	readonly aux: Uint8Array;
	/** live (non-empty) cell count — lets the driver idle an empty bench */
	population(): number;
	step(): void;
	clear(): void;
	paintLine(x0: number, y0: number, x1: number, y1: number, mat: number): void;
}

/**
 * Bounds-checked 4-neighbourhood: index of neighbour `d` of cell j at (jx,jy)
 * (0 = below, 1 = above, 2 = left, 3 = right), or -1 at a grid edge. The one
 * shape shared by every rule and scan that walks a cell's neighbours.
 */
const nbr4 = (j: number, jx: number, jy: number, d: number): number =>
	d === 0 ? (jy < H - 1 ? j + W : -1)
	: d === 1 ? (jy > 0 ? j - W : -1)
	: d === 2 ? (jx > 0 ? j - 1 : -1)
	: jx < W - 1 ? j + 1 : -1;

function createSim(hooks: SimHooks): Sim {
	const grid = new Uint8Array(N); // material per cell
	const aux = new Uint8Array(N); // per-cell counter: lifetimes, soak/heat/cool
	const moved = new Uint8Array(N);
	// detector state (all survive clear() except the transient hold counters)
	const discovered = new Uint8Array(ART_KEYS.length);
	const reported = new Float64Array(ART_KEYS.length);
	let stained = 0; // monotonic: paper cells ever inked
	let houseHold = 0;
	let autoHold = 0;
	let mirrorHold = 0;
	// unlock state (survives clear)
	const unlocked = new Uint8Array(NMAT);
	// automaton scratch (allocated once; no per-frame allocations)
	const visited = new Uint8Array(N);
	const stack = new Int32Array(N);
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
	// Live-cell tally, maintained at the mutation points: set()/spawn() and
	// paintAt() know the old and new material; swap() and stepWood's run-shift
	// only exchange cells (count-neutral); clear() zeroes it. Every other
	// grid write flows through those.
	let liveCells = 0;

	const set = (i: number, mat: number, a = 0): void => {
		liveCells += (mat === EMPTY ? 0 : 1) - (grid[i] === EMPTY ? 0 : 1);
		grid[i] = mat;
		aux[i] = a;
		moved[i] = 1;
	};
	/** set + first-creation unlock (derived materials become brushes) */
	const spawn = (i: number, mat: number, a = 0): void => {
		set(i, mat, a);
		if (!unlocked[mat]) {
			unlocked[mat] = 1;
			const name = DERIVED_NAME.get(mat);
			if (name) hooks.onUnlock(name);
		}
	};

	// -- neighbourhood helpers ------------------------------------------------

	/** index of an adjacent cell of material m (below→left→right→above), or -1 */
	const neighborOf = (i: number, x: number, y: number, m: number): number => {
		if (y < H - 1 && grid[i + W] === m) return i + W;
		if (x > 0 && grid[i - 1] === m) return i - 1;
		if (x < W - 1 && grid[i + 1] === m) return i + 1;
		if (y > 0 && grid[i - W] === m) return i - W;
		return -1;
	};

	/**
	 * Any live heat source (flame / burning wood / ember / melt) adjacent?
	 * Molten counts unless excluded — molten judging its OWN cooling must not
	 * be kept liquid by the rest of its pool.
	 */
	const heatAdjacent = (
		i: number,
		x: number,
		y: number,
		includeMolten = true,
	): boolean => {
		for (let d = 0; d < 4; d++) {
			const j = nbr4(i, x, y, d);
			if (j < 0) continue;
			const m = grid[j];
			if (m === FIRE || m === BURN || m === EMBER) return true;
			if (includeMolten && m === MOLTEN) return true;
		}
		return false;
	};

	// -- reactions ------------------------------------------------------------

	/** bank one step of sustained heat toward a transformation */
	const bump = (j: number, threshold: number, target: number): void => {
		const a = aux[j] + 1;
		if (a >= threshold) spawn(j, target);
		else aux[j] = a;
	};

	/**
	 * a heat source (fire / burning wood / molten metal) touching j: wood
	 * catches, and the heat-driven solids bank progress toward their next form.
	 */
	const heatTouch = (j: number): void => {
		switch (grid[j]) {
			case WOOD:
				if (rand() < 0.05) set(j, BURN, burnLife());
				break;
			case EARTH:
				bump(j, VITRIFY_T, GLASS); // dry path — slower than melting metal
				break;
			case METAL:
				bump(j, MELT_T, MOLTEN);
				break;
			case MUD:
				bump(j, KILN_T, BRICK);
				break;
			case PULP:
				bump(j, DRY_T, PAPER);
				break;
		}
	};

	/**
	 * fire touching j. Returns true if the fire was quenched (water wins: the
	 * water flashes to steam, the fire collapses to a dying ember).
	 */
	const fireTouch = (i: number, j: number): boolean => {
		if (grid[j] === WATER) {
			spawn(j, STEAM, steamLife());
			set(i, EMBER, 4 + ((rand() * 6) | 0));
			return true;
		}
		heatTouch(j);
		return false;
	};

	/** embers keep a weak spark: wood beside them can still catch */
	const emberTouch = (j: number): void => {
		if (grid[j] === WOOD) set(j, BURN, burnLife());
	};

	/** a heat source at i bathes its whole 4-neighbourhood */
	const heatAround = (i: number, x: number, y: number): void => {
		if (y > 0) heatTouch(i - W);
		if (y < H - 1) heatTouch(i + W);
		if (x > 0) heatTouch(i - 1);
		if (x < W - 1) heatTouch(i + 1);
	};

	/** slow anneal: heated solids lose banked heat when the flame is gone */
	const coolOff = (i: number, x: number, y: number): void => {
		if (aux[i] > 0 && rand() < 0.04 && !heatAdjacent(i, x, y)) aux[i]--;
	};

	// -- per-material rules ---------------------------------------------------

	const stepWood = (i: number, x: number, y: number): void => {
		// prolonged water contact softens wood into pulp (aux = soak timer)
		if (neighborOf(i, x, y, WATER) >= 0) {
			const a = aux[i] + 1;
			if (a >= SOAK_T) {
				spawn(i, PULP);
				return;
			}
			aux[i] = a;
		} else if (aux[i] > 0 && rand() < 0.1) {
			aux[i]--; // dries out slowly once out of the water
		}
		// Motion rides the GLOBAL clock, not per-cell dice, so a drawn log
		// moves as one rigid piece instead of shearing into flecks.
		// Buoyancy (every 3rd frame): the whole contiguous vertical wood run
		// lifts one cell through the water above it, as a unit. The bottom-up
		// scan meets the run's BOTTOM cell first; it shifts the column up and
		// hands its own cell to the displaced water (all cells marked moved —
		// a per-cell rise can't chain against the scan direction and would
		// shear the column).
		if (frame % 3 === 0 && (y >= H - 1 || grid[i + W] !== WOOD)) {
			let top = i;
			let ty = y;
			while (ty > 0 && grid[top - W] === WOOD) {
				top -= W;
				ty--;
			}
			if (ty > 0 && grid[top - W] === WATER) {
				// (count-neutral: wood shifts up, the water relocates below)
				const waterAux = aux[top - W];
				for (let j = top; j <= i; j += W) {
					grid[j - W] = WOOD;
					aux[j - W] = aux[j];
					moved[j - W] = 1;
				}
				grid[i] = WATER;
				aux[i] = waterAux;
				moved[i] = 1;
				return;
			}
		}
		// gravity (every 2nd frame — half metal's speed): falls into air only;
		// lockstep means stacked cells chain into cells vacated this same
		// frame exactly like metal's scan/mask handling, so the piece
		// descends whole and never compacts into itself
		if (frame % 2 === 0 && y < H - 1 && grid[i + W] === EMPTY) swap(i, i + W);
	};

	const stepFire = (i: number, x: number, y: number): void => {
		// reactions first — water quenches (early out), wood catches, solids heat
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

	const stepBurn = (i: number, x: number, y: number): void => {
		// water douses burning wood back to wood (the splash flashes off)
		const w = neighborOf(i, x, y, WATER);
		if (w >= 0) {
			spawn(w, STEAM, steamLife());
			set(i, WOOD);
			return;
		}
		// a stationary heat source: spreads through wood, heats the solids
		heatAround(i, x, y);
		// flames lick up from the burning face
		if (y > 0 && grid[i - W] === EMPTY && rand() < 0.12)
			set(i - W, FIRE, fireLife());
		const life = aux[i] - 1;
		if (life <= 0) {
			// burnt out — mostly ash, some of it simply gone
			if (rand() < 0.75) spawn(i, ASH);
			else set(i, EMPTY);
			return;
		}
		aux[i] = life;
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

	/**
	 * Diagonal slide into empty space below (b = i + W): granular topple AND
	 * a liquid's diagonal flow — same move, different callers. True if moved.
	 */
	const topple = (i: number, b: number, x: number): boolean => {
		const dx = rand() < 0.5 ? 1 : -1;
		if (x + dx >= 0 && x + dx < W && grid[b + dx] === EMPTY) swap(i, b + dx);
		else if (x - dx >= 0 && x - dx < W && grid[b - dx] === EMPTY) swap(i, b - dx);
		else return false;
		return true;
	};

	/** pooled liquid: flow one cell sideways into empty (water + ink share it) */
	const flowLateral = (i: number, x: number): void => {
		const dx = rand() < 0.5 ? 1 : -1;
		if (x + dx >= 0 && x + dx < W && grid[i + dx] === EMPTY) swap(i, i + dx);
		else if (x - dx >= 0 && x - dx < W && grid[i - dx] === EMPTY) swap(i, i - dx);
	};

	const stepEarth = (i: number, x: number, y: number): void => {
		coolOff(i, x, y); // aux = banked vitrify heat (dry path to glass)
		// absorbs an adjacent water cell → mud (the water is consumed). The WET
		// path always wins: spawn() writes aux = 0, dropping any banked heat.
		const w = neighborOf(i, x, y, WATER);
		if (w >= 0 && rand() < 0.06) {
			set(w, EMPTY);
			spawn(i, MUD);
			return;
		}
		if (y >= H - 1) return;
		const b = i + W;
		const bm = grid[b];
		// falls; sinks through the liquids and steam
		if (bm === EMPTY || bm === WATER || bm === INK || bm === STEAM) {
			swap(i, b);
			return;
		}
		topple(i, b, x);
	};

	const stepMetal = (i: number, x: number, y: number): void => {
		coolOff(i, x, y); // aux = banked melt heat
		if (y >= H - 1) return;
		const b = i + W;
		const bm = grid[b];
		// heavy solid: drops straight down, sinks through liquids — no toppling
		if (bm === EMPTY || bm === WATER || bm === INK || bm === STEAM) swap(i, b);
	};

	const stepWater = (i: number, x: number, y: number): void => {
		if (y < H - 1) {
			const b = i + W;
			const bm = grid[b];
			if (bm === EMPTY || bm === STEAM) {
				swap(i, b);
				return;
			}
			if (topple(i, b, x)) return; // diagonal flow
		}
		flowLateral(i, x); // pooled
	};

	const stepAsh = (i: number, x: number, y: number): void => {
		// ash dissolves into water → ink (the water darkens; the ash is spent)
		const w = neighborOf(i, x, y, WATER);
		if (w >= 0 && rand() < 0.3) {
			spawn(w, INK);
			set(i, EMPTY);
			return;
		}
		if (y >= H - 1) return;
		const b = i + W;
		const bm = grid[b];
		// light: drifts down a touch lazily
		if ((bm === EMPTY || bm === STEAM) && rand() < 0.7) {
			swap(i, b);
			return;
		}
		topple(i, b, x);
	};

	const stepPulp = (i: number, x: number, y: number): void => {
		// soggy while touching water — drying (aux, banked by heat) restarts
		if (neighborOf(i, x, y, WATER) >= 0) aux[i] = 0;
		if (y >= H - 1) return;
		const b = i + W;
		const bm = grid[b];
		if (bm === EMPTY) {
			swap(i, b);
			return;
		}
		if (bm === WATER && rand() < 0.3) {
			swap(i, b); // waterlogged clump sinks slowly
			return;
		}
		if (rand() < 0.12) topple(i, b, x); // clumps — barely spreads
	};

	const stepMud = (i: number, x: number, y: number): void => {
		coolOff(i, x, y); // aux = banked kiln heat
		if (y >= H - 1) return;
		const b = i + W;
		const bm = grid[b];
		if (bm === EMPTY || bm === WATER || bm === STEAM) {
			swap(i, b);
			return;
		}
		if (rand() < 0.35) topple(i, b, x); // wet and sluggish
	};

	const stepMolten = (i: number, x: number, y: number): void => {
		// quench: water flashes to steam and the melt skins to forged metal
		const w = neighborOf(i, x, y, WATER);
		if (w >= 0) {
			spawn(w, STEAM, steamLife());
			spawn(i, FORGED);
			return;
		}
		// itself a heat source: melts adjacent metal, fires mud, lights wood
		heatAround(i, x, y);
		// cooling (aux) — only live flame keeps the melt liquid, not the pool
		if (!heatAdjacent(i, x, y, false)) {
			const a = aux[i] + 1;
			if (a >= COOL_T) {
				spawn(i, FORGED);
				return;
			}
			aux[i] = a;
		} else if (aux[i] > 1) aux[i] -= 2;
		else aux[i] = 0;
		// pools like a heavy, viscous liquid
		if (y < H - 1) {
			const b = i + W;
			if (grid[b] === EMPTY) {
				swap(i, b);
				return;
			}
			const dx = rand() < 0.5 ? 1 : -1;
			if (x + dx >= 0 && x + dx < W && grid[b + dx] === EMPTY) {
				swap(i, b + dx);
				return;
			}
		}
		if (rand() < 0.25) {
			const dx = rand() < 0.5 ? 1 : -1;
			if (x + dx >= 0 && x + dx < W && grid[i + dx] === EMPTY) swap(i, i + dx);
		}
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
			if ((um === EMPTY || um === WATER || um === INK) && rand() < 0.8) {
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

	const stepInk = (i: number, x: number, y: number): void => {
		// stains paper on contact — the sheet drinks the drop
		const p = neighborOf(i, x, y, PAPER);
		if (p >= 0 && rand() < 0.4) {
			set(p, INKED);
			set(i, EMPTY);
			stained++;
			return;
		}
		if (y < H - 1) {
			const b = i + W;
			const bm = grid[b];
			if (bm === EMPTY || bm === STEAM) {
				swap(i, b);
				return;
			}
			if (bm === WATER && rand() < 0.4) {
				swap(i, b); // denser than water — sinks through it
				return;
			}
			if (topple(i, b, x)) return; // diagonal flow
		}
		flowLateral(i, x); // pooled
	};

	// -- artifact detectors ---------------------------------------------------

	const report = (idx: number, v: number): void => {
		if (discovered[idx]) return;
		const clamped = v > 1 ? 1 : v;
		if (Math.abs(clamped - reported[idx]) > 0.005) {
			reported[idx] = clamped;
			hooks.onProgress(ART_KEYS[idx]!, clamped);
		}
	};
	const discover = (idx: number): void => {
		if (discovered[idx]) return;
		discovered[idx] = 1;
		reported[idx] = 1;
		hooks.onProgress(ART_KEYS[idx]!, 1);
		hooks.onDiscover(ART_KEYS[idx]!);
	};

	/**
	 * HOUSE: a brick structure enclosing a hollow interior. Flood-fill finds
	 * "open air" — every non-brick region touching the TOP edge (only the sky
	 * leaks; the bench floor AND side walls count as enclosure — the more
	 * forgiving reading, so corner builds work). Any non-brick region
	 * left unvisited is an enclosed cavity: it may contain loose "furniture"
	 * (the flood runs through anything that isn't brick). A cavity is a house
	 * when it spans ≥ HOUSE_CAVITY cells and the brick joined to its lining
	 * (flooded through connected brick) totals ≥ HOUSE_BRICK cells. Returns
	 * the canvas brick count for partial brew feedback.
	 */
	const scanHouse = (): { bricks: number; cond: boolean } => {
		let bricks = 0;
		if (unlocked[BRICK])
			for (let i = 0; i < N; i++) if (grid[i] === BRICK) bricks++;
		// with fewer bricks than the lining minimum no cavity can qualify —
		// skip the two-pass flood entirely (brew reads from the count alone)
		if (bricks < HOUSE_BRICK) return { bricks, cond: false };
		// pass 1: open air (visited=1) — flood every non-brick cell reachable
		// from the top row
		visited.fill(0);
		let sp = 0;
		for (let x = 0; x < W; x++) {
			if (grid[x] !== BRICK) {
				visited[x] = 1;
				stack[sp++] = x;
			}
		}
		while (sp > 0) {
			const j = stack[--sp];
			const jx = j % W;
			const jy = (j / W) | 0;
			for (let d = 0; d < 4; d++) {
				const n = nbr4(j, jx, jy, d);
				if (n < 0 || visited[n] || grid[n] === BRICK) continue;
				visited[n] = 1;
				stack[sp++] = n;
			}
		}
		// pass 2: every unvisited non-brick region is an enclosed cavity
		let cond = false;
		for (let s = 0; s < N && !cond; s++) {
			if (grid[s] === BRICK || visited[s]) continue;
			// BFS keeps the cavity's cells parked in stack[0..tail) so the
			// lining pass below can walk them (no per-frame allocations)
			let head = 0;
			let tail = 0;
			visited[s] = 2;
			stack[tail++] = s;
			while (head < tail) {
				const j = stack[head++];
				const jx = j % W;
				const jy = (j / W) | 0;
				for (let d = 0; d < 4; d++) {
					const n = nbr4(j, jx, jy, d);
					if (n < 0 || visited[n] || grid[n] === BRICK) continue;
					visited[n] = 2;
					stack[tail++] = n;
				}
			}
			const size = tail;
			if (size < HOUSE_CAVITY) continue;
			// lining pass: flood the brick component(s) touching this cavity,
			// reusing the stack region past the parked cavity cells
			let lining = 0;
			let bHead = tail;
			let bTail = tail;
			for (let c = 0; c < size; c++) {
				const j = stack[c];
				const jx = j % W;
				const jy = (j / W) | 0;
				for (let d = 0; d < 4; d++) {
					const n = nbr4(j, jx, jy, d);
					if (n < 0 || visited[n] || grid[n] !== BRICK) continue;
					visited[n] = 3;
					stack[bTail++] = n;
				}
			}
			while (bHead < bTail) {
				const j = stack[bHead++];
				lining++;
				const jx = j % W;
				const jy = (j / W) | 0;
				for (let d = 0; d < 4; d++) {
					const n = nbr4(j, jx, jy, d);
					if (n < 0 || visited[n] || grid[n] !== BRICK) continue;
					visited[n] = 3;
					stack[bTail++] = n;
				}
			}
			if (lining >= HOUSE_BRICK) cond = true;
		}
		return { bricks, cond };
	};

	/**
	 * AUTOMATON: flood-fill connected forged-metal components (4-neighbour);
	 * condition = a component of ≥ AUTO_SIZE cells with steam touching it.
	 * Returns the largest component size for partial brew feedback.
	 */
	const scanAutomaton = (): { best: number; cond: boolean } => {
		// forged metal has never existed — nothing to scan
		if (!unlocked[FORGED]) return { best: 0, cond: false };
		visited.fill(0);
		let best = 0;
		let cond = false;
		for (let s = 0; s < N; s++) {
			if (grid[s] !== FORGED || visited[s]) continue;
			let sp = 0;
			stack[sp++] = s;
			visited[s] = 1;
			let size = 0;
			let steamNear = false;
			while (sp > 0) {
				const j = stack[--sp];
				size++;
				const jx = j % W;
				const jy = (j / W) | 0;
				for (let d = 0; d < 4; d++) {
					const n = nbr4(j, jx, jy, d);
					if (n < 0) continue;
					const m = grid[n];
					if (m === FORGED) {
						if (!visited[n]) {
							visited[n] = 1;
							stack[sp++] = n;
						}
					} else if (m === STEAM) steamNear = true;
				}
			}
			if (size > best) best = size;
			if (size >= AUTO_SIZE && steamNear) cond = true;
		}
		return { best, cond };
	};

	/**
	 * MIRROR: longest horizontal forged runs — `aligned` (glass directly above,
	 * the discovery condition) and `bare` (any forged, brew feedback only, so a
	 * plain forged bar already warms the slot before the glass goes on).
	 */
	const scanMirror = (): { bare: number; aligned: number } => {
		// forged metal has never existed — no runs to measure
		if (!unlocked[FORGED]) return { bare: 0, aligned: 0 };
		let bare = 0;
		let aligned = 0;
		for (let y = 0; y < H; y++) {
			const row = y * W;
			let bRun = 0;
			let aRun = 0;
			for (let x = 0; x < W; x++) {
				const i = row + x;
				if (grid[i] === FORGED) {
					bRun++;
					if (bRun > bare) bare = bRun;
					if (y > 0 && grid[i - W] === GLASS) {
						aRun++;
						if (aRun > aligned) aligned = aRun;
					} else aRun = 0;
				} else {
					bRun = 0;
					aRun = 0;
				}
			}
		}
		return { bare, aligned };
	};

	const checkArtifacts = (): void => {
		if (frame % SLOW_EVERY !== 0) return;
		if (!discovered[A_HOUSE]) {
			const { bricks, cond } = scanHouse();
			if (cond) houseHold++;
			else if (houseHold > 0) houseHold--;
			if (houseHold >= HOUSE_NEED) discover(A_HOUSE);
			else
				report(
					A_HOUSE,
					0.5 * Math.min(1, bricks / HOUSE_BRICK) + 0.5 * (houseHold / HOUSE_NEED),
				);
		}
		if (!discovered[A_SCROLL]) {
			if (stained >= SCROLL_NEED) discover(A_SCROLL);
			else if (!unlocked[PAPER]) {
				// paper has never existed — the count scan would find nothing
				report(A_SCROLL, 0.6 * (stained / SCROLL_NEED));
			} else {
				// ingredient credit: a drying/dried page warms the slot before
				// any ink lands (INKED counts as paper — staining must not dim it)
				let paper = 0;
				for (let i = 0; i < N; i++) {
					const m = grid[i];
					if (m === PAPER || m === INKED) paper++;
				}
				report(
					A_SCROLL,
					0.4 * Math.min(1, paper / SCROLL_PAPER) + 0.6 * (stained / SCROLL_NEED),
				);
			}
		}
		if (!discovered[A_AUTOMATON]) {
			const { best, cond } = scanAutomaton();
			if (cond) autoHold++;
			else if (autoHold > 0) autoHold--;
			if (autoHold >= AUTO_NEED) discover(A_AUTOMATON);
			else
				report(
					A_AUTOMATON,
					0.5 * Math.min(1, best / AUTO_SIZE) + 0.5 * (autoHold / AUTO_NEED),
				);
		}
		if (!discovered[A_MIRROR]) {
			const { bare, aligned } = scanMirror();
			if (aligned >= MIRROR_RUN) mirrorHold++;
			else if (mirrorHold > 0) mirrorHold--;
			if (mirrorHold >= MIRROR_NEED) discover(A_MIRROR);
			else
				report(
					A_MIRROR,
					// three stages: forge the bar, top it with glass, hold aligned
					0.4 * Math.min(1, bare / MIRROR_RUN) +
						0.3 * Math.min(1, aligned / MIRROR_RUN) +
						0.3 * (mirrorHold / MIRROR_NEED),
				);
		}
	};

	// -- driver ---------------------------------------------------------------

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
					case WOOD:
						stepWood(i, x, y);
						break;
					case FIRE:
						stepFire(i, x, y);
						break;
					case EMBER:
						stepEmber(i, x, y);
						break;
					case EARTH:
						stepEarth(i, x, y);
						break;
					case METAL:
						stepMetal(i, x, y);
						break;
					case WATER:
						stepWater(i, x, y);
						break;
					case ASH:
						stepAsh(i, x, y);
						break;
					case PULP:
						stepPulp(i, x, y);
						break;
					case MUD:
						stepMud(i, x, y);
						break;
					case MOLTEN:
						stepMolten(i, x, y);
						break;
					case STEAM:
						stepSteam(i, x, y);
						break;
					case INK:
						stepInk(i, x, y);
						break;
					case BURN:
						stepBurn(i, x, y);
						break;
					// brick / glass / forged / paper / inked are static; empty is empty
				}
			}
		}
		frame++;
		checkArtifacts();
	};

	// Clears the CANVAS only — unlocked brushes, the stained-paper count and
	// anything already discovered survive, per the "never un-discovers"
	// contract. Transient hold counters reset (their structures are gone).
	const clear = (): void => {
		grid.fill(EMPTY);
		aux.fill(0);
		liveCells = 0;
		houseHold = 0;
		autoHold = 0;
		mirrorHold = 0;
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
					if (grid[i] !== EMPTY) liveCells--;
					grid[i] = EMPTY;
					aux[i] = 0;
					continue;
				}
				// brushes fill the void; they never overwrite (protects built walls)
				if (grid[i] !== EMPTY) continue;
				if (density < 1 && rand() >= density) continue;
				liveCells++;
				grid[i] = mat;
				aux[i] = mat === FIRE ? fireLife() : mat === STEAM ? steamLife() : 0;
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

	return { grid, aux, population: () => liveCells, step, clear, paintLine };
}

// ---------------------------------------------------------------------------
// Rendering — one ImageData blit per frame via a Uint32 view. Two shades per
// material, chosen by a FIXED per-cell noise field (spatial dither: particles
// move through a stable screen-space texture — no temporal flicker). A
// transitioning cell (aux banked toward a transform) dithers toward the
// TARGET material's dominant shade, plus a sparse ember-fleck band on
// heat-driven solids (the design's "actively heated" tell).
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
	const pal = new Uint32Array(NMAT * 2);
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
// <use>; all icon SVG is decorative (aria-hidden). Derived-material brushes
// are two-tone material vars; erase + the artifact sigils ride currentColor.
// ---------------------------------------------------------------------------
type Run = readonly [number, number, number?, number?];
interface IconLayer {
	fill: string;
	px: readonly Run[];
}
const ICONS: Record<string, readonly IconLayer[]> = {
	// wood: a bare branch — trunk, two limbs, root flare
	'el-wood': [
		{ fill: 'var(--px-wood-1, #96a83c)', px: [[3, 0, 1, 7]] },
		{
			fill: 'var(--px-wood-2, #6f7f2a)',
			px: [[1, 1], [2, 2], [5, 2], [4, 3], [2, 6], [4, 6]],
		},
	],
	// fire: flame body with a hot core, seated on the tile floor
	'el-fire': [
		{
			fill: 'var(--px-fire-2, #ff7a33)',
			px: [[3, 1], [3, 2, 2, 1], [2, 3, 3, 1], [1, 4, 2, 1], [4, 4, 2, 1], [1, 5], [5, 5], [2, 6], [4, 6]],
		},
		{
			fill: 'var(--px-fire-1, #ffc23d)',
			px: [[3, 4], [2, 5, 3, 1], [3, 6]],
		},
	],
	// earth: a settled pile, checker-dithered
	'el-earth': [
		{
			fill: 'var(--px-earth-1, #dcae54)',
			px: [[3, 3], [2, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [2, 6], [4, 6], [6, 6]],
		},
		{
			fill: 'var(--px-earth-2, #b98e3e)',
			px: [[3, 4], [2, 5], [4, 5], [1, 6], [3, 6], [5, 6]],
		},
	],
	// metal: a raw bar with a specular top edge
	'el-metal': [
		{ fill: 'var(--px-metal-1, #97a3b2)', px: [[0, 3, 7, 2]] },
		{ fill: 'var(--px-metal-2, #6d7987)', px: [[0, 2, 7, 1]] },
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
	// ash: a sparse low drift with flecks still in the air
	'el-ash': [
		{
			fill: 'var(--px-ash-1, #98928a)',
			px: [[2, 5], [4, 5], [1, 6], [3, 6], [5, 6]],
		},
		{
			fill: 'var(--px-ash-2, #75706a)',
			px: [[2, 2], [4, 3], [3, 5], [2, 6], [4, 6]],
		},
	],
	// pulp: a soggy clump, dripping
	'el-pulp': [
		{
			fill: 'var(--px-pulp-1, #b8ab7e)',
			px: [[2, 3, 3, 1], [1, 4, 5, 1], [1, 5, 5, 1]],
		},
		{
			fill: 'var(--px-pulp-2, #94885f)',
			px: [[3, 2], [3, 4], [2, 6], [4, 6]],
		},
	],
	// mud: a wide wet mound (full-width base — heavier than the earth pile)
	'el-mud': [
		{
			fill: 'var(--px-mud-1, #7a5c39)',
			px: [[2, 4, 3, 1], [1, 5, 5, 1], [0, 6, 7, 1]],
		},
		{ fill: 'var(--px-mud-2, #5d4529)', px: [[3, 3], [2, 5], [4, 6]] },
	],
	// brick: running-bond masonry — terracotta courses, dark mortar seams
	'el-brick': [
		{ fill: 'var(--px-brick-1, #c96f45)', px: [[0, 2, 7, 5]] },
		{
			fill: 'var(--px-brick-2, #a1522f)',
			px: [[3, 2, 1, 2], [0, 4, 7, 1], [1, 5, 1, 2], [5, 5, 1, 2]],
		},
	],
	// glass: the diamond, two-tone with an inner glint
	'el-glass': [
		{
			fill: 'var(--px-glass-1, #aee3ea)',
			px: [[3, 0], [2, 1], [4, 1], [1, 2], [5, 2], [0, 3], [6, 3], [1, 4], [5, 4], [2, 5], [4, 5], [3, 6]],
		},
		{ fill: 'var(--px-glass-2, #7fc4cf)', px: [[3, 2], [2, 3]] },
	],
	// molten metal: a glowing pool with white-hot glints and a spark
	'el-molten': [
		{
			fill: 'var(--px-molten-1, #f0603c)',
			px: [[1, 4, 5, 1], [0, 5, 7, 1], [0, 6, 7, 1]],
		},
		{
			fill: 'var(--px-molten-2, #ffcf6e)',
			px: [[3, 2], [5, 3], [1, 5, 2, 1], [4, 6]],
		},
	],
	// forged metal: an ingot — bright top face, dark blued body
	'el-forged': [
		{
			fill: 'var(--px-forged-1, #5e6f8d)',
			px: [[1, 4, 5, 1], [0, 5, 7, 1], [0, 6, 7, 1]],
		},
		{ fill: 'var(--px-forged-2, #93a9cc)', px: [[2, 3, 3, 1], [1, 4]] },
	],
	// steam: two rising waves — brighter above (fading as it climbs)
	'el-steam': [
		{
			fill: 'var(--px-steam-1, #a7b8c9)',
			px: [[1, 1], [3, 1], [5, 1], [0, 2], [2, 2], [4, 2], [6, 2]],
		},
		{
			fill: 'var(--px-steam-2, #8397ab)',
			px: [[1, 4], [3, 4], [5, 4], [0, 5], [2, 5], [4, 5], [6, 5]],
		},
	],
	// ink: a falling drop over a spreading stain
	'el-ink': [
		{
			fill: 'var(--px-ink-1, #46549e)',
			px: [[3, 1], [2, 2, 3, 1], [2, 3, 3, 1], [3, 4], [1, 6, 5, 1]],
		},
		{ fill: 'var(--px-ink-2, #2e3870)', px: [[3, 2], [2, 6], [4, 6]] },
	],
	// paper: a sheet with a folded corner and two ruled lines
	'el-paper': [
		{
			fill: 'var(--px-paper-1, #ecdfbc)',
			px: [[1, 0, 3, 1], [1, 1, 4, 1], [1, 2, 5, 5]],
		},
		{
			fill: 'var(--px-paper-2, #cbbd93)',
			px: [[4, 1], [2, 3, 3, 1], [2, 5, 3, 1]],
		},
	],
	// erase: a pixel X, rides currentColor
	'el-erase': [
		{
			fill: 'currentColor',
			px: [[1, 1], [5, 1], [2, 2], [4, 2], [3, 3], [2, 4], [4, 4], [1, 5], [5, 5]],
		},
	],
	// house (home): peaked roof over hollow walls; the floor gap is the door
	'sig-house': [
		{
			fill: 'currentColor',
			px: [[3, 0], [2, 1], [4, 1], [1, 2], [5, 2], [0, 3, 1, 4], [6, 3, 1, 4], [1, 6, 2, 1], [4, 6, 2, 1]],
		},
	],
	// scroll (blog): rolled ends, marked twice with ink
	'sig-scroll': [
		{
			fill: 'currentColor',
			px: [[2, 0, 3, 1], [1, 1, 1, 5], [5, 1, 1, 5], [2, 6, 3, 1], [3, 2], [3, 4]],
		},
	],
	// automaton (projects): a steam piston — vapor above (steam's own dither
	// cadence), head seated flush in the bore, rod driving out the open end
	'sig-automaton': [
		{
			fill: 'currentColor',
			px: [[1, 0], [3, 0], [5, 0], [0, 1, 1, 4], [6, 1, 1, 4], [1, 3, 5, 1], [3, 4, 1, 3]],
		},
	],
	// mirror (about): an unbroken ring with a corner glint
	'sig-mirror': [
		{
			fill: 'currentColor',
			px: [[2, 0, 3, 1], [1, 1], [5, 1], [0, 2, 1, 3], [6, 2, 1, 3], [1, 5], [5, 5], [2, 6, 3, 1], [3, 2], [2, 3]],
		},
	],
	// unlock: an opened padlock — shackle swung left, its free end hanging
	// clear of the body; hollow 1×2 keyhole (the discovery popup's glyph)
	'ui-unlock': [
		{
			fill: 'currentColor',
			px: [[1, 0, 3, 1], [1, 1], [3, 1], [1, 2], [1, 3, 5, 1], [1, 4, 2, 2], [4, 4, 2, 2], [1, 6, 5, 1]],
		},
	],
};

/** the hidden in-document sprite (rendered once inside .alch) */
function Sprite(): JSX.Element {
	return (
		<svg style="display:none" aria-hidden="true" focusable="false">
			{Object.entries(ICONS).map(([id, layers]) => (
				<symbol key={id} id={id} viewBox="0 0 7 7">
					{layers.map((layer, li) => (
						<g key={li} fill={layer.fill}>
							{layer.px.map(([x, y, w = 1, h = 1], pi) => (
								<rect key={pi} x={x} y={y} width={w} height={h} />
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

// Slot order IS the destinations table order (home, blog, projects, about →
// house, scroll, automaton, mirror).
const DESTS = getDestinations(MAZE_ID);
const SLOT_INDEX: Record<string, number> = Object.fromEntries(
	DESTS.map((d, i) => [d.key, i]),
);

export default function Alchemy(): JSX.Element {
	const [brush, setBrush] = useState<string>('metal'); // the first tile
	// derived-material brush ids unlocked by the sim (monotonic)
	const [unlockedIds, setUnlockedIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	// unlocked but not yet selected — carries the --new bloom + dot
	const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
	// artifact key -> decoded href, once discovered
	const [revealed, setRevealed] = useState<Record<string, string>>({});
	const [toast, setToast] = useState<string | null>(null);
	// artifact currently celebrated by the over-canvas popup (visual only —
	// the .word-found toast is the announcement; the popup is aria-hidden).
	// label is the destination's table label (shown lowercased, e.g. "home") —
	// it is not secret (it ships in the JSON); only the PATH is cipher-hidden.
	const [pop, setPop] = useState<{ key: string; label: string } | null>(null);

	const rootRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const slotEls = useRef<(HTMLElement | null)[]>([]);
	// Last brew progress per artifact — mirrored here so a re-render (toast,
	// unlock, reveal) repaints the inline --brew instead of resetting it to 0.
	const brewRef = useRef<Record<string, number>>({});
	// Mirrors `brush` so the sim's pointer handlers (bound once at mount) read
	// the current selection without re-running the mount effect. Written
	// SYNCHRONOUSLY in pick() — an effect-based mirror lags a frame behind the
	// click, so a stroke started immediately after picking a tile would stamp
	// a few cells with the previous brush.
	const brushRef = useRef(brush);
	// Mounted flag (the WordSearch/Backdoors idiom): discovery awaits an async
	// decode; if the maze is switched mid-await the resolved promise must not
	// touch state on an unmounted component.
	const aliveRef = useRef(true);
	const toastTimerRef = useRef<number | null>(null);
	const popTimerRef = useRef<number | null>(null);
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
		const showToast = (text: string): void => {
			setToast(text);
			if (toastTimerRef.current !== null)
				window.clearTimeout(toastTimerRef.current);
			toastTimerRef.current = window.setTimeout(() => {
				if (aliveRef.current) setToast(null);
			}, TOAST_MS);
		};
		const onProgress = (key: string, v: number): void => {
			brewRef.current[key] = v;
			const el = slotEls.current[SLOT_INDEX[key] ?? -1];
			el?.style.setProperty('--brew', v.toFixed(3));
		};
		const onUnlock = (id: string): void => {
			if (!aliveRef.current) return;
			setUnlockedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
			setFreshIds((prev) => new Set(prev).add(id));
			// toast speaks the tile name ("> mud", "> molten")
			showToast(id);
		};
		const onDiscover = (key: string): void => {
			const entry = findDestination(MAZE_ID, key);
			if (!entry || !aliveRef.current) return;
			// Feedback FIRST — the decode can fail (e.g. a malformed cipher), and
			// feedback must not depend on it: the slot then reveals href-less,
			// mirroring useDecodedLinks.
			setRevealed((prev) => ({ ...prev, [key]: '' }));
			showToast(`${key} — a door opens`);
			// over-canvas popup; a fresh discovery replaces the current one
			setPop({ key, label: entry.label });
			if (popTimerRef.current !== null)
				window.clearTimeout(popTimerRef.current);
			popTimerRef.current = window.setTimeout(() => {
				if (aliveRef.current) setPop(null);
			}, POP_MS);
			// the real path arrives when/if the decode resolves
			decodePath(entry.cipher, entry.key)
				.then((href) => {
					if (!aliveRef.current) return;
					setRevealed((prev) => ({ ...prev, [key]: href }));
				})
				.catch(() => {
					/* decode failed — the slot stays revealed, just href-less */
				});
		};
		const sim = createSim({ onProgress, onDiscover, onUnlock });
		clearRef.current = () => {
			sim.clear();
			render();
		};

		// -- rendering ----------------------------------------------------------
		const img = ctx.createImageData(W, H);
		const px = new Uint32Array(img.data.buffer);
		const styles = getComputedStyle(root);
		const pal = buildPalette(styles);
		const emberPx = pal[EMBER * 2];
		// the brush ring is the one sim-drawn UI color — it rides --text like
		// everything else rides the palette vars (alpha applied at draw time)
		const ringColor = styles.getPropertyValue('--text').trim() || '#c7d0dc';
		// fixed noise field for the spatial two-tone dither
		const noise = new Uint8Array(N);
		for (let i = 0; i < N; i++) noise[i] = (rand() * 256) | 0;

		let cursor: { x: number; y: number } | null = null;
		/** the pointer moved since the last blit — the ring needs repainting */
		let cursorDirty = false;

		const render = (): void => {
			const grid = sim.grid;
			const aux = sim.aux;
			for (let i = 0; i < N; i++) {
				const m = grid[i];
				const n = noise[i];
				const ts = TRANS_SCALE[m];
				let c: number;
				if (ts !== 0 && aux[i] > 0) {
					// transitioning: dither toward the target material's shade 1
					if (n < aux[i] * ts) c = pal[TRANS_COL[m]];
					else if (HEAT_FLECK[m] === 1 && n >= 240 && n < 248) c = emberPx;
					else c = pal[m * 2 + (n < ACCENT_T[m] ? 1 : 0)];
				} else {
					c = pal[m * 2 + (n < ACCENT_T[m] ? 1 : 0)];
				}
				px[i] = c;
			}
			ctx.putImageData(img, 0, 0);
			if (cursor) {
				// brush-radius outline at the pointer (sim-pixel scale)
				ctx.globalAlpha = 0.35;
				ctx.strokeStyle = ringColor;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.arc(cursor.x + 0.5, cursor.y + 0.5, BRUSH_R + 0.5, 0, Math.PI * 2);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
			cursorDirty = false;
		};

		// -- loop ---------------------------------------------------------------
		// Normal mode: fixed ~30fps steps, rendered on the rAFs that actually
		// stepped (or moved the cursor), idling when the tab is hidden (rAF
		// suspends; the acc clamp absorbs the gap) — and STOPPING outright once
		// the bench is empty and the settle window has passed (an untouched
		// canvas costs nothing; onDown start()s it again). A non-empty but
		// static grid keeps stepping — the detectors' hold counters live there.
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
			if (
				!painting &&
				t > settleUntil &&
				(reduced || sim.population() === 0)
			) {
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
			let stepped = false;
			while (acc >= STEP_MS) {
				sim.step();
				acc -= STEP_MS;
				stepped = true;
			}
			if (stepped || cursorDirty) render(); // skip no-op blits
		};
		const start = (): void => {
			if (running) return;
			running = true;
			prevT = performance.now();
			acc = 0;
			raf = requestAnimationFrame(tick);
		};

		// -- painting -----------------------------------------------------------
		// The canvas rect is cached for a stroke's duration (pointer capture
		// pins the target and the layout can't shift mid-stroke); hover-only
		// moves read a fresh rect.
		let strokeRect: DOMRect | null = null;
		const toCell = (e: PointerEvent): readonly [number, number] => {
			const r = strokeRect ?? canvas.getBoundingClientRect();
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
			strokeRect = canvas.getBoundingClientRect();
			const [x, y] = toCell(e);
			cursor = { x, y };
			cursorDirty = true;
			last = [x, y];
			sim.paintLine(x, y, x, y, MAT_BY_BRUSH[brushRef.current] ?? WOOD);
			start(); // idle/reduced modes wake here; harmless when already running
		};
		const onMove = (e: PointerEvent): void => {
			const [x, y] = toCell(e);
			cursor = { x, y };
			cursorDirty = true;
			if (painting && last) {
				sim.paintLine(last[0], last[1], x, y, MAT_BY_BRUSH[brushRef.current] ?? WOOD);
				last = [x, y];
			}
			if (!running) render(); // frozen/idle — still track the brush ring
		};
		const endStroke = (): void => {
			if (!painting) return;
			painting = false;
			strokeRect = null;
			last = null;
			settleUntil = performance.now() + SETTLE_MS;
			start();
		};
		const onLeave = (): void => {
			cursor = null;
			cursorDirty = true;
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
			if (popTimerRef.current !== null)
				window.clearTimeout(popTimerRef.current);
			clearRef.current = null;
		};
	}, []);

	const pick = (id: string): void => {
		brushRef.current = id; // sync NOW — pointer handlers must not lag a frame
		setBrush(id);
		setFreshIds((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	};

	return (
		<div class="alch" ref={rootRef}>
			<Sprite />
			<div class="alch__stage">
				<canvas
					ref={canvasRef}
					class="alch__canvas"
					width={W}
					height={H}
					aria-label="alchemy bench — paint the five phases and let them react"
				/>
				{pop && (
					// keyed so a back-to-back discovery remounts and replays the entrance
					<div
						key={pop.key}
						class={`alch__pop alch__pop--${pop.key}`}
						aria-hidden="true"
					>
						<Icon id="ui-unlock" class="alch__pop-glyph" />
						<div class="alch__pop-row">
							<Icon id={`sig-${pop.key}`} class="alch__pop-sigil" />
							{/* CSS lowercases — the goal page name, e.g. "home" */}
							<span class="alch__pop-name">{pop.label}</span>
						</div>
					</div>
				)}
			</div>

			<div class="alch__tray">
				{BRUSHES.map((b) => {
					if (!b.base && !unlockedIds.has(b.id)) {
						// an undiscovered material's reserved seat — inert, unannounced
						return (
							<div key={b.id} class="alch__el alch__el--locked" aria-hidden="true">
								<span class="alch__el-icon" />
								<span class="alch__el-name" />
							</div>
						);
					}
					const cls = `alch__el${b.id === 'erase' ? ' alch__el--erase' : ''}${
						brush === b.id ? ' alch__el--on' : ''
					}${freshIds.has(b.id) ? ' alch__el--new' : ''}`;
					return (
						<button
							key={b.id}
							type="button"
							class={cls}
							aria-label={`${b.id} brush`}
							aria-pressed={brush === b.id}
							onClick={() => pick(b.id)}
						>
							<span class="alch__el-icon">
								<Icon id={`el-${b.id}`} />
							</span>
							<span class="alch__el-name" aria-hidden="true">
								{b.id}
							</span>
						</button>
					);
				})}
			</div>

			<div class="alch__actions">
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
					// undefined = sealed; '' = revealed, decode pending/failed
					// (the anchor is simply href-less then — feedback never
					// depends on the decode succeeding)
					const href = revealed[d.key];
					const isRevealed = href !== undefined;
					const cls = `alch__slot alch__slot--${d.key}${
						isRevealed ? ' alch__slot--revealed' : ''
					}`;
					// keep --brew across re-renders (the sim also writes it directly)
					const style = `--brew:${(brewRef.current[d.key] ?? 0).toFixed(3)}`;
					const setEl = (el: HTMLElement | null): void => {
						slotEls.current[idx] = el;
					};
					return isRevealed ? (
						<a
							key={d.key}
							class={cls}
							style={style}
							href={href || undefined}
							ref={setEl}
						>
							<Icon id={`sig-${d.key}`} class="alch__sigil" />
							{/* CSS lowercases the label */}
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

			{/* ALWAYS rendered: the maze column is flex-centered, so a mounting/
			    unmounting toast used to shift the whole bench (and the canvas,
			    mid-stroke) by a line. The line reserves its height permanently;
			    idle it hides via CSS visibility (which also hides the "> "
			    ::before prefix). aria-live announces content changes to AT. */}
			<p
				class={`word-found alch__toast${toast ? '' : ' alch__toast--idle'}`}
				aria-live="polite"
			>
				{toast ?? ''}
			</p>
		</div>
	);
}
