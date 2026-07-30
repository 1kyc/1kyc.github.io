/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX, TargetedEvent, TargetedInputEvent } from 'preact';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getDestinations } from '../lib/destinations';
import type { Destination } from '../lib/destinations';
import { decodeLabel, decodePath } from '../lib/crypto';
import { useDecodedLinks } from '../lib/useDecodedLinks';

const MAZE_ID = 'manipulator';

const DEG2RAD = Math.PI / 180;
const LIMIT_DEG = 270; // ±270° per joint (±4.71239 rad)

// ---------------------------------------------------------------------------
// Joint chain. Each node is rotated about its LOCAL axis; the sign lives in the
// axis vector. Order matters — it mirrors the URDF chain in canadarm2.glb.
// ---------------------------------------------------------------------------
interface JointDef {
	name: string;
	short: string;
	axis: readonly [number, number, number];
}
const JOINTS: readonly JointDef[] = [
	{ name: 'Base_Joint', short: 'base', axis: [0, 0, 1] },
	{ name: 'Shoulder_Roll', short: 'sh·roll', axis: [1, 0, 0] },
	{ name: 'Shoulder_Yaw', short: 'sh·yaw', axis: [0, 0, 1] },
	{ name: 'Elbow_Pitch', short: 'elbow', axis: [0, 0, 1] },
	{ name: 'Wrist_Pitch', short: 'wr·pitch', axis: [0, 0, -1] },
	{ name: 'Wrist_Yaw', short: 'wr·yaw', axis: [1, 0, 0] },
	{ name: 'Wrist_Roll', short: 'wr·roll', axis: [0, 0, 1] },
];

// Rest pose (per-joint degrees, in JOINTS order): a compact folded configuration
// the arm parks in, clear of the truss — the starting pose the player drives away
// from to reach the goal.
const REST_POSE_DEG: readonly number[] = [0, 90, -90, 60, 0, 60, 0];

// Placement of NASA's public-domain "ISS (B)" GLB so the arm berths on the
// station structure. The model is pure PBR geometry — no image textures — so it
// adds no software-GL context-loss risk. Scale sizes the ~45-unit station to the
// scene; position drops a structural face under the base LEE with the rest of the
// station sprawling out of frame behind it.
const ISS_SCALE = 2.5;
const ISS_ROT: readonly [number, number, number] = [0, 0, 0]; // radians, XYZ
const ISS_POS: readonly [number, number, number] = [0, 0, 24];
// The "ISS (B)" GLB bundles a stray truss/cylinder cluster (bendedtru1-3,
// bendedtrus, pCylinder1/2/8) sitting ~64 world-units above the berth — after
// ISS_SCALE/ISS_POS it lands at world-Y ≈ 102, while the coherent station body
// (polySurfa*) tops out near 64. Meant to be out of frame, it leaks into wide /
// top-down views where fog blurs it into hazy floating blobs, so we hide any
// sub-mesh whose whole bounding box clears this cutoff (safely in the gap).
const ISS_CLIP_Y = 80; // world-Y; between station top (~64) and cluster (~102)

// Fixed opening camera + orbit target: play opens on this framing and orbits
// around this target.
const CAM_POS: readonly [number, number, number] = [-0.65, 36.56, 35.6];
const CAM_TARGET: readonly [number, number, number] = [-8.17, 38.17, 38.95];
// World-space envelope of the visible content (arm reach + MBS + the whole
// station body). The orbit/pan target is confined to this box so the player can
// pan and zoom-to-cursor anywhere over the scene to inspect the MBS/ISS, while
// the target still can't drift off into the empty void beyond the models (the
// original reason for the clamp). Tunable — these are absolute world coords tied
// to ISS_SCALE/ISS_POS/ARM_BASE_POS below; re-check them if a model moves.
const TARGET_MIN: readonly [number, number, number] = [-22, -14, -37];
const TARGET_MAX: readonly [number, number, number] = [20, 68, 84];

// Portrait/narrow stages show a thinner horizontal slice at the fixed 42° FOV, so
// the opening frame feels too close on phones. Dolly the START position back along
// the view direction by this factor there (≈√2 → roughly 2× the visible area).
// Opening framing only — the player can orbit/zoom freely afterwards.
const PORTRAIT_DOLLY = 1.4;

// Seating of the arm root (the whole arm hangs off this): Euler XYZ degrees +
// position that berth the base LEE onto the MBS out on the truss.
const ARM_BASE_ROT_DEG: readonly [number, number, number] = [16, 129, -156];
const ARM_BASE_POS: readonly [number, number, number] = [-1, 31.3, 37.2];

// Mobile Base System — the platform the SSRMS base LEE actually latches to (it
// rides the Mobile Transporter along the truss). Sits just under the arm base so
// the arm no longer floats. Converted from STL (see scripts/build-mbs.mjs); at
// ~58 model-units, 0.12 scale gives roughly the real ~5.7 m platform.
const MBS_SCALE = 0.12;
const MBS_ROT: readonly [number, number, number] = [-Math.PI / 2, 0, Math.PI / 2];
const MBS_POS: readonly [number, number, number] = [-2.7, 27, 35];

// ---------------------------------------------------------------------------
// Goal — one capture target, paired positionally with getDestinations() (a
// single destination: HARMONY → its door). The goal is a GHOST END-EFFECTOR: a
// translucent clone of the real EE posed at `pos`, oriented so its boresight
// points along `facing`. "Dock to the shadow" — overlay the real EE onto the
// ghost (reach its tip position AND aim its boresight along `facing`) to capture.
//
// pos/facing are FK-DERIVED, not hand-placed: the joint pose
// (180, 15, −15, −100, 10, −95, 23)° was run through the runtime FK in the
// seated frame and the resulting tip position + boresight recorded here — so the
// goal is reachable by construction, with a basin inside the POS_TOL / ANG_TOL
// window.
// ---------------------------------------------------------------------------
interface GoalDef {
	pos: readonly [number, number, number];
	/** world direction the EE boresight should point when docked to the ghost */
	facing: readonly [number, number, number];
}
const GOALS: readonly GoalDef[] = [
	{ pos: [-1.86, 38.11, 27.64], facing: [0.82, -0.57, 0.02] }, // HARMONY
];

// Capture tolerances (forgiving) + the dwell that turns "in range" into a lock.
// A goal locks when the EE tip is within POS_TOL of the ghost AND the boresight
// is within ANG_TOL of the ghost's facing (roll is free).
const POS_TOL = 1.5; // metres
const ANG_TOL = 15 * DEG2RAD; // boresight/facing alignment cone
const LOCK_TIME = 0.5; // seconds of continuous in-range to capture
const UNLOCK_TIME = 0.35; // seconds to bleed the lock back off when out of range

const clamp = (v: number, lo: number, hi: number): number =>
	v < lo ? lo : v > hi ? hi : v;

function webglAvailable(): boolean {
	try {
		const c = document.createElement('canvas');
		return !!(
			window.WebGLRenderingContext &&
			(c.getContext('webgl') || c.getContext('experimental-webgl'))
		);
	} catch {
		return false;
	}
}

function reducedMotion(): boolean {
	return (
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

// ===========================================================================
// FALLBACK — no WebGL or prefers-reduced-motion. A static hero + the real
// destination labels as focusable rows that still decode + navigate on activate
// (reachable nav without the 3D scene). Uses the shared decode-links hook: labels
// only pre-decode, hrefs written after an in-effect decode.
// ===========================================================================
function ManipulatorFallback({
	dests,
}: {
	dests: readonly Destination[];
}): JSX.Element {
	const links = useDecodedLinks(dests);

	return (
		<div class="orbit orbit--fallback">
			<div class="orbit__hero" aria-hidden="true">
				<svg viewBox="0 0 200 120" width="200" height="120" fill="none">
					<path
						class="orbit__arm-stroke"
						d="M20 104 L52 104 L52 60 L108 44 L150 62 L176 44"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<circle class="orbit__arm-joint" cx="52" cy="104" r="4" />
					<circle class="orbit__arm-joint" cx="52" cy="60" r="4" />
					<circle class="orbit__arm-joint" cx="108" cy="44" r="4" />
					<circle class="orbit__arm-joint" cx="150" cy="62" r="4" />
					<text class="orbit__arm-mark" x="92" y="30">
						1KYC
					</text>
				</svg>
			</div>
			<p class="orbit__lead">manual dock — select a capture target</p>
			<nav class="orbit__doors" aria-label="orbit targets">
				<ul>
					{links.map((item, i) => (
						// positional key: labels start as identical placeholders
						<li key={i}>
							<a href={item.href || undefined}>{item.label}</a>
						</li>
					))}
				</ul>
			</nav>
		</div>
	);
}

// ===========================================================================
// SCENE — the live Three.js manipulator.
// ===========================================================================
interface RuntimeGoal {
	dest: Destination;
	pos: THREE.Vector3;
	facing: THREE.Vector3; // world direction the EE boresight should point
	ghost: THREE.Object3D | null; // ghost EE group — built once the GLB loads
	ghostMat: THREE.MeshStandardMaterial | null; // this ghost's own material
	baseScale: number; // ghost's resting world scale (pulse/pop multiply this)
	inRange: boolean;
	progress: number; // 0..1 lock dwell
	captured: boolean;
	labelEl: HTMLDivElement | null;
}

function ManipulatorScene({
	dests,
}: {
	dests: readonly Destination[];
}): JSX.Element {
	const [angles, setAngles] = useState<number[]>(() => [...REST_POSE_DEG]);
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
		'loading',
	);
	const [toast, setToast] = useState<string | null>(null);

	const mountRef = useRef<HTMLDivElement>(null);
	const labelRefs = useRef<(HTMLDivElement | null)[]>([]);

	// Goal-marker text: decoded from each destination's labelCipher at mount
	// (no goal name ships as plaintext); empty until the decode resolves.
	const [goalLabels, setGoalLabels] = useState<string[]>(() =>
		dests.map(() => ''),
	);
	useEffect(() => {
		let alive = true;
		Promise.all(
			dests.map((d) => decodeLabel(d.labelCipher, d.key).catch(() => d.key)),
		).then((labels) => {
			if (alive) setGoalLabels(labels);
		});
		return () => {
			alive = false;
		};
	}, []);


	// Live joint angles in RADIANS — the render loop reads this every frame so the
	// 3D stays smooth regardless of when Preact re-renders the sliders.
	const jointRadRef = useRef<Float32Array>(
		Float32Array.from(REST_POSE_DEG, (d) => d * DEG2RAD),
	);

	// Unmount-safety (mirrors WordSearch): bail an in-flight decode + clear the
	// post-capture nav timer if the maze is switched mid-await.
	const aliveRef = useRef(true);
	const navTimerRef = useRef<number | null>(null);
	const capturedRef = useRef(false);

	// Auto-repeat timers for the ±1° steppers (press-and-hold).
	const holdRef = useRef<{ timeout: number | null; interval: number | null }>({
		timeout: null,
		interval: null,
	});

	// Single write path for a joint: clamp to ±LIMIT_DEG, land on whole degrees,
	// and keep the live radian ref (read by the render loop) in lock-step with
	// the Preact `angles` state (drives the slider + numeric field). Every input
	// path — slider, steppers, numeric entry — funnels through here.
	const setJointDeg = (i: number, deg: number): void => {
		const d = clamp(Math.round(deg), -LIMIT_DEG, LIMIT_DEG);
		jointRadRef.current[i] = d * DEG2RAD;
		setAngles((prev) => {
			const next = [...prev];
			next[i] = d;
			return next;
		});
	};

	// Nudge a joint by an exact delta. Reads the live radian ref (not the async
	// `angles` state) so rapid auto-repeat ticks compose correctly.
	const nudge = (i: number, deltaDeg: number): void =>
		setJointDeg(i, jointRadRef.current[i]! / DEG2RAD + deltaDeg);

	const stopHold = (): void => {
		if (holdRef.current.timeout !== null) {
			window.clearTimeout(holdRef.current.timeout);
			holdRef.current.timeout = null;
		}
		if (holdRef.current.interval !== null) {
			window.clearInterval(holdRef.current.interval);
			holdRef.current.interval = null;
		}
	};

	// Press-and-hold on a stepper: after a 300ms dwell, repeat ~every 60ms. The
	// first single step is handled by the button's onClick (which also gives us
	// keyboard Enter/Space for free), so a quick tap yields exactly one step.
	const startHold = (i: number, deltaDeg: number): void => {
		stopHold();
		holdRef.current.timeout = window.setTimeout(() => {
			holdRef.current.interval = window.setInterval(
				() => nudge(i, deltaDeg),
				60,
			);
		}, 300);
	};

	// Clear any dangling hold timers if the maze is switched mid-press.
	useEffect(() => stopHold, []);

	const onJoint = (
		i: number,
		e: TargetedInputEvent<HTMLInputElement>,
	): void => {
		setJointDeg(i, Number(e.currentTarget.value));
	};

	// Numeric field: commit on change/blur/Enter. Reject non-numeric input by
	// restoring the current angle so the field never shows a stale/garbage value.
	const onField = (
		i: number,
		e: TargetedEvent<HTMLInputElement>,
	): void => {
		const raw = Number(e.currentTarget.value);
		if (!Number.isFinite(raw)) {
			e.currentTarget.value = String(Math.round(angles[i]!));
			return;
		}
		setJointDeg(i, raw);
	};

	const resetPose = (): void => {
		for (let i = 0; i < JOINTS.length; i++) {
			jointRadRef.current[i] = REST_POSE_DEG[i]! * DEG2RAD;
		}
		setAngles([...REST_POSE_DEG]);
	};

	useEffect(() => {
		aliveRef.current = true;
		const mount = mountRef.current;
		if (!mount) return;

		let localAlive = true;
		let frame = 0;
		// NB: every geometry/material below is parented under `scene`, so the
		// teardown's disposeObject(scene) already reclaims them — no separate
		// disposables list is needed. Track here only if you ever add something
		// that is NOT a child of `scene`.

		const BG = 0x0a0c10; // --bg

		// --- renderer -------------------------------------------------------
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(BG, 1);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		mount.appendChild(renderer.domElement);
		renderer.domElement.classList.add('orbit__canvas');

		// --- scene / camera -------------------------------------------------
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(BG);
		scene.fog = new THREE.FogExp2(BG, 0.01);

		// Seed straight from the fixed opening framing (re-applied once the GLB
		// resolves, but this keeps the loading frames on the same view).
		const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
		camera.position.set(CAM_POS[0], CAM_POS[1], CAM_POS[2]);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.target.set(CAM_TARGET[0], CAM_TARGET[1], CAM_TARGET[2]);
		controls.enableDamping = true;
		controls.dampingFactor = 0.12; // tighter tracking (less floaty glide)
		controls.rotateSpeed = 1.3; // more orbit per drag — snappier to spin
		// Full navigation: left-drag / one-finger orbits, right-drag / two-finger
		// pans, wheel / pinch zooms. On mobile the two-finger gesture covers both
		// pan and zoom (no right button needed).
		controls.enablePan = true;
		// Keep the orbit just shy of both poles: at the exact poles the azimuth
		// direction flips, which reads as the view "suddenly spinning the other
		// way". A small clamp preserves a generous range while dodging the
		// singularities.
		controls.minPolarAngle = 0.08 * Math.PI;
		controls.maxPolarAngle = Math.PI - 0.08 * Math.PI;
		controls.mouseButtons = {
			LEFT: THREE.MOUSE.ROTATE,
			MIDDLE: THREE.MOUSE.DOLLY,
			RIGHT: THREE.MOUSE.PAN,
		};
		controls.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN,
		};
		controls.minDistance = 0.1;
		controls.maxDistance = 120;
		// Dolly toward the pointer/pinch, not the fixed pivot, so the player can
		// zoom right into the arm/EE/goal even though the opening orbit target
		// sits off to the side in near-empty space.
		// Zoom is handled by a custom raycast dolly (`applyZoom` below), NOT the
		// stock OrbitControls wheel/pinch. OrbitControls only ever dollies toward
		// the orbit target, which here floats in empty space off the content — so
		// its zoom budget (== the camera→target radius) ran out long before the
		// camera reached the station/MBS, capping zoom-in. We drive zoom toward the
		// real geometry under the pointer instead.
		controls.enableZoom = false;

		// --- lighting (key + fill + rim) ------------------------------------
		const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
		key.position.set(8, 12, 6);
		const fill = new THREE.HemisphereLight(0x9fb6d4, BG, 1.0);
		const rim = new THREE.DirectionalLight(0x8fd0ff, 1.3);
		rim.position.set(-9, 4, -8);
		const amb = new THREE.AmbientLight(0x223044, 0.6);
		scene.add(key, fill, rim, amb);

		// --- starfield (harmonises with the moiré: cool greys + a cyan cast) -
		const STAR_N = 900;
		const starPos = new Float32Array(STAR_N * 3);
		for (let i = 0; i < STAR_N; i++) {
			// scatter on a shell well outside the reach envelope
			const r = 40 + Math.random() * 60;
			const t = Math.random() * Math.PI * 2;
			const p = Math.acos(2 * Math.random() - 1);
			starPos[i * 3] = r * Math.sin(p) * Math.cos(t);
			starPos[i * 3 + 1] = r * Math.cos(p);
			starPos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
		}
		const starGeo = new THREE.BufferGeometry();
		starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
		const starMat = new THREE.PointsMaterial({
			color: 0x9fb4cc,
			size: 0.35,
			sizeAttenuation: true,
			transparent: true,
			opacity: 0.8,
			depthWrite: false,
			fog: false,
		});
		const stars = new THREE.Points(starGeo, starMat);
		scene.add(stars);

		// --- goals ----------------------------------------------------------
		// The 3D ghost end-effectors need the loaded GLB (cloned geometry + the
		// derived boresight), so here we only build the lightweight goal records;
		// `buildGhosts` (run once the arm loads) clones + poses + tints each ghost.
		const runtime: RuntimeGoal[] = GOALS.map((def, i) => ({
			dest: dests[i]!,
			pos: new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]),
			facing: new THREE.Vector3(
				def.facing[0],
				def.facing[1],
				def.facing[2],
			).normalize(),
			ghost: null,
			ghostMat: null,
			baseScale: 1,
			inRange: false,
			progress: 0,
			captured: false,
			labelEl: labelRefs.current[i] ?? null,
		}));

		// --- load the arm ---------------------------------------------------
		const draco = new DRACOLoader();
		draco.setDecoderPath('/draco/'); // self-hosted decoder (CSP/offline-safe)
		const loader = new GLTFLoader();
		loader.setDRACOLoader(draco);

		const jointNodes: (THREE.Object3D | null)[] = JOINTS.map(() => null);
		const baseQuat: THREE.Quaternion[] = JOINTS.map(
			() => new THREE.Quaternion(),
		);
		// joint axes are constant — build the vectors once, not per frame
		const axisVecs = JOINTS.map(
			(j) => new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]),
		);
		let tip: THREE.Object3D | null = null;
		const tipDirLocal = new THREE.Vector3(0, 0, 1);

		// scratch objects reused every frame (no per-frame allocation)
		const _q = new THREE.Quaternion();
		const _tipPos = new THREE.Vector3();
		const _wristQ = new THREE.Quaternion();
		const _boresight = new THREE.Vector3();
		const _proj = new THREE.Vector3();
		const targetMinV = new THREE.Vector3(
			TARGET_MIN[0],
			TARGET_MIN[1],
			TARGET_MIN[2],
		);
		const targetMaxV = new THREE.Vector3(
			TARGET_MAX[0],
			TARGET_MAX[1],
			TARGET_MAX[2],
		);

		// --- custom raycast zoom -------------------------------------------------
		// `pickables` is the real, solid geometry the zoom aims at (arm, station,
		// platform) — pushed as each model loads. Stars, ghosts and labels are left
		// out so zoom never latches onto a decoration.
		//
		// How it works: the stock OrbitControls dolly can only crawl toward the
		// orbit target (which floats in empty space here), so its reach is capped
		// at the small camera→target radius. Instead we DOLLY TOWARD A FIXED WORLD
		// POINT under the pointer: raycast once when the gesture starts to lock the
		// focus point, then each step translate BOTH camera and target the same
		// fraction of the remaining gap toward it. Translating both keeps the view
		// direction fixed (no swing) and, because we always move a fraction of what
		// REMAINS, the camera approaches the focus asymptotically and never caps.
		// NB: `zoomToCursor` does NOT fix the cap (verified in-browser) — its dolly
		// down the ray still sums to the camera→target radius — so don't "simplify"
		// this back to the built-in dolly.
		const pickables: THREE.Object3D[] = [];
		const raycaster = new THREE.Raycaster();
		const _ndc = new THREE.Vector2();
		const _focus = new THREE.Vector3(); // locked world point we dolly toward
		const _zdir = new THREE.Vector3();
		const _off = new THREE.Vector3();
		let focusValid = false; // false → re-acquire the focus on the next step
		const MIN_GAP = 0.4; // closest the camera may sit to the aimed surface

		// Lock the focus world point under (cx,cy): the nearest solid hit, or — if
		// the pointer is over empty space — a point along the ray at the current
		// pivot depth (so empty-space zoom still dives that direction).
		const acquireFocus = (cx: number, cy: number): void => {
			const rect = renderer.domElement.getBoundingClientRect();
			if (!rect.width || !rect.height) return;
			_ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
			_ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
			raycaster.setFromCamera(_ndc, camera);
			// intersectObjects([]) is a no-op, so no length guard is needed — an
			// empty pickables list (zoom before models load) falls through to the
			// ray-depth fallback below.
			let hit: THREE.Vector3 | null = null;
			for (const h of raycaster.intersectObjects(pickables, true)) {
				if (h.object.visible) {
					hit = h.point;
					break;
				}
			}
			if (hit) {
				_focus.copy(hit);
			} else {
				_focus
					.copy(raycaster.ray.direction)
					.multiplyScalar(camera.position.distanceTo(controls.target))
					.add(camera.position);
			}
			focusValid = true;
		};

		// One dolly step toward (zoomIn) / away from the locked focus. `intensity`
		// is the fraction of the remaining gap to move, so steps converge on the
		// focus without ever capping. Camera and target translate together → the
		// look direction is preserved (no recentre swing).
		const applyZoom = (
			cx: number,
			cy: number,
			zoomIn: boolean,
			intensity: number,
		): void => {
			if (zoomIn) {
				if (!focusValid) acquireFocus(cx, cy);
				_zdir.copy(_focus).sub(camera.position);
				const gap = _zdir.length();
				if (gap < 1e-4) return;
				_zdir.divideScalar(gap);
				const step = Math.min(gap * intensity, gap - MIN_GAP);
				if (step <= 0) return; // already at the surface
				camera.position.addScaledVector(_zdir, step);
				controls.target.addScaledVector(_zdir, step);
				// Keep the orbit pivot from floating far PAST what we're inspecting:
				// cap the camera→target radius at the focus distance so that, zoomed
				// in, the pivot sits just ahead of the surface and rotate/pan stay
				// tight. Pulled straight back along the view direction → no swing.
				// (gap - step is the post-move camera→focus distance.)
				_off.copy(controls.target).sub(camera.position);
				const r = _off.length();
				const cap = gap - step + MIN_GAP;
				if (r > cap && r > 1e-4) {
					controls.target.copy(camera.position).addScaledVector(_off, cap / r);
				}
			} else {
				// Zoom out: pull straight back from the pivot along the view axis so
				// the framing stays centred (dollying away from an off-centre focus
				// would drift the camera sideways). Radius grows geometrically, capped.
				_off.copy(camera.position).sub(controls.target);
				const r = _off.length();
				if (r < 1e-4) return;
				const newR = Math.min(controls.maxDistance, r * (1 + intensity));
				camera.position.copy(controls.target).addScaledVector(_off, newR / r);
			}
			controls.update();
		};

		const onWheel = (e: WheelEvent): void => {
			e.preventDefault();
			applyZoom(e.clientX, e.clientY, e.deltaY < 0, 0.33);
		};
		renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

		// Pinch zoom: track active touch pointers; when two are down, dolly toward
		// their midpoint by the change in spread. The focus locks on the first
		// pinch move and holds for the gesture. OrbitControls still two-finger pans
		// (its dolly is disabled), so pinch + drag compose naturally.
		const activePointers = new Map<number, { x: number; y: number }>();
		let lastPinch = 0;
		const onPointerDown = (e: PointerEvent): void => {
			if (e.pointerType !== 'touch') return;
			activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (activePointers.size === 2) focusValid = false; // re-acquire at midpoint
		};
		const onPointerMove = (e: PointerEvent): void => {
			// A mouse move (incl. an OrbitControls rotate/pan drag) aims the next
			// wheel somewhere new — drop the locked focus so it re-acquires. Touch
			// with two fingers down drives the pinch dolly below.
			if (e.pointerType !== 'touch') {
				focusValid = false;
				return;
			}
			if (!activePointers.has(e.pointerId)) return;
			activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (activePointers.size !== 2) return;
			const [a, b] = [...activePointers.values()];
			const spread = Math.hypot(a.x - b.x, a.y - b.y);
			const midX = (a.x + b.x) / 2;
			const midY = (a.y + b.y) / 2;
			if (lastPinch > 0) {
				const d = spread - lastPinch;
				if (Math.abs(d) > 0.5) {
					applyZoom(midX, midY, d > 0, Math.min(0.5, Math.abs(d) / 200));
				}
			}
			lastPinch = spread;
		};
		const onPointerUp = (e: PointerEvent): void => {
			activePointers.delete(e.pointerId);
			// Reset the pinch baseline on ANY finger change (e.g. 3→2 fingers) so the
			// next two-finger move measures its spread from a fresh baseline instead
			// of jumping. Drop the focus lock only once the pinch fully ends.
			lastPinch = 0;
			if (activePointers.size < 2) focusValid = false;
		};
		renderer.domElement.addEventListener('pointerdown', onPointerDown);
		renderer.domElement.addEventListener('pointermove', onPointerMove);
		renderer.domElement.addEventListener('pointerup', onPointerUp);
		renderer.domElement.addEventListener('pointercancel', onPointerUp);

		loader.load(
			'/models/canadarm2.glb',
			(gltf: GLTF) => {
				if (!localAlive) {
					disposeObject(gltf.scene);
					return;
				}
				const root = gltf.scene;
				// Seat the arm on the station: armRoot carries the whole arm's world
				// pose (ARM_BASE_ROT_DEG / ARM_BASE_POS) so its base LEE berths on the
				// MBS out on the truss. Joint FK (below) runs on the child nodes and is
				// unaffected; the ghost goal lives in this same wrapped world frame.
				const armRoot = new THREE.Group();
				armRoot.rotation.set(
					ARM_BASE_ROT_DEG[0] * DEG2RAD,
					ARM_BASE_ROT_DEG[1] * DEG2RAD,
					ARM_BASE_ROT_DEG[2] * DEG2RAD,
				);
				armRoot.position.set(
					ARM_BASE_POS[0],
					ARM_BASE_POS[1],
					ARM_BASE_POS[2],
				);
				armRoot.add(root);
				scene.add(armRoot);
				pickables.push(armRoot);

				// Berth the arm on the ISS, not a Shuttle — Canadarm2 (SSRMS) lives on
				// the station (Canadarm1 was the Shuttle arm). NASA's public-domain
				// "ISS (B)" model, a Draco GLB loaded with the same decoder as the arm.
				// Pure PBR geometry (no image textures); native materials kept for a
				// realistic hull. Decorative — a load failure must not break play.
				loader.load(
					'/models/iss.glb',
					(ig: GLTF) => {
						if (!localAlive) {
							disposeObject(ig.scene);
							return;
						}
						const iss = ig.scene;
						iss.scale.setScalar(ISS_SCALE);
						iss.rotation.set(ISS_ROT[0], ISS_ROT[1], ISS_ROT[2]);
						iss.position.set(ISS_POS[0], ISS_POS[1], ISS_POS[2]);
						scene.add(iss);
						// Cull the stray high cluster (see ISS_CLIP_Y). World matrices
						// must be current for setFromObject; collect first, hide after,
						// so we never mutate the tree mid-traverse. visible = false is
						// low-risk — the teardown's disposeObject(scene) still traverses
						// and reclaims these on unmount.
						iss.updateWorldMatrix(true, true);
						const strays: THREE.Object3D[] = [];
						const box = new THREE.Box3();
						iss.traverse((o) => {
							if ((o as THREE.Mesh).isMesh) {
								box.setFromObject(o);
								if (box.min.y > ISS_CLIP_Y) strays.push(o);
							}
						});
						for (const s of strays) s.visible = false;
						pickables.push(iss);
					},
					undefined,
					() => {
						/* the station is decorative — a load failure must not break play */
					},
				);

				// The Mobile Base System the arm actually latches to (STL → Draco GLB;
				// see scripts/build-mbs.mjs). Seats just under the base LEE so the arm
				// isn't floating. Decorative — a load failure must not break play.
				loader.load(
					'/models/mbs.glb',
					(mg: GLTF) => {
						if (!localAlive) {
							disposeObject(mg.scene);
							return;
						}
						const mbs = mg.scene;
						mbs.scale.setScalar(MBS_SCALE);
						mbs.rotation.set(MBS_ROT[0], MBS_ROT[1], MBS_ROT[2]);
						mbs.position.set(MBS_POS[0], MBS_POS[1], MBS_POS[2]);
						scene.add(mbs);
						pickables.push(mbs);
					},
					undefined,
					() => {
						/* the platform is decorative — a load failure must not break play */
					},
				);

				JOINTS.forEach((j, i) => {
					const node = root.getObjectByName(j.name) ?? null;
					jointNodes[i] = node;
					if (node) baseQuat[i]!.copy(node.quaternion);
				});

				// EE boresight: the TRUE pointing axis of the Wrist_Roll subtree.
				// Measure the subtree's bounding box in the wrist's LOCAL frame, then
				// take its DOMINANT (longest) axis as the barrel centreline — signed
				// toward whichever end sits farther from the wrist origin. The old
				// code aimed the ray at the farthest bbox CORNER, a diagonal ~10° off
				// the barrel, so the boresight pointed where the arm visibly did not.
				const wrist = jointNodes[6];
				if (wrist) {
					wrist.updateWorldMatrix(true, false);
					const invWrist = new THREE.Matrix4()
						.copy(wrist.matrixWorld)
						.invert();
					const localBox = new THREE.Box3();
					const corner = new THREE.Vector3();
					let found = false;
					wrist.traverse((o) => {
						const mesh = o as THREE.Mesh;
						if (!mesh.isMesh || !mesh.geometry) return;
						found = true;
						mesh.updateWorldMatrix(true, false);
						const g = mesh.geometry;
						if (!g.boundingBox) g.computeBoundingBox();
						const bb = g.boundingBox!;
						for (const cx of [bb.min.x, bb.max.x])
							for (const cy of [bb.min.y, bb.max.y])
								for (const cz of [bb.min.z, bb.max.z]) {
									corner
										.set(cx, cy, cz)
										.applyMatrix4(mesh.matrixWorld)
										.applyMatrix4(invWrist);
									localBox.expandByPoint(corner);
								}
					});
					const tipLocal = new THREE.Vector3(0, 0, 1.5);
					if (found) {
						const mins = [localBox.min.x, localBox.min.y, localBox.min.z];
						const maxs = [localBox.max.x, localBox.max.y, localBox.max.z];
						// dominant axis = the longest local extent (the LEE barrel run)
						let k = 0;
						for (let a = 1; a < 3; a++) {
							if (maxs[a]! - mins[a]! > maxs[k]! - mins[k]!) k = a;
						}
						// signed toward the end farther from the wrist origin: that end
						// is the mouth of the end-effector, so the boresight exits down the arm
						const farVal =
							Math.abs(maxs[k]!) >= Math.abs(mins[k]!) ? maxs[k]! : mins[k]!;
						tipDirLocal.set(0, 0, 0).setComponent(k, Math.sign(farVal) || 1);
						// tip POSITION = box centre pushed out to that far end, so the
						// boresight originates at the LEE mouth and runs straight down the axis
						localBox.getCenter(tipLocal);
						tipLocal.setComponent(k, farVal);
					}
					tipDirLocal.normalize();

					// --- ghost end-effectors ------------------------------------
					// One translucent green clone of the EE (Wrist_Roll) subtree per
					// goal, posed at the goal. Cloned BEFORE the invisible `tip`
					// empty is parented, so the ghost carries only real geometry.
					// The clone SHARES geometry with the arm (disposed once, via the
					// arm) but gets a NEW material we track + dispose ourselves.
					//
					// Posing: reset the clone to identity, then shift it by −tipLocal
					// so the barrel-mouth point (the same point the capture test uses
					// for the real EE) lands at the wrapping group's origin. The group
					// is placed at the goal, rotated so tipDirLocal → facing, and given
					// the wrist's WORLD scale so the ghost matches the real EE's on-
					// screen size even if the rig bakes a scale into its ancestors.
					const wristScale = new THREE.Vector3();
					wrist.getWorldScale(wristScale);
					for (const goal of runtime) {
						const ghost = wrist.clone(true);
						ghost.position.copy(tipLocal).multiplyScalar(-1);
						ghost.quaternion.identity();
						ghost.scale.set(1, 1, 1);
						const gm = new THREE.MeshStandardMaterial({
							color: 0x4ade80, // --accent green
							emissive: 0x4ade80,
							emissiveIntensity: 0.32,
							transparent: true,
							opacity: 0.35,
							depthWrite: false,
							roughness: 0.5,
							metalness: 0.0,
						});
						ghost.traverse((o) => {
							const mesh = o as THREE.Mesh;
							if (mesh.isMesh) mesh.material = gm;
						});
						const grp = new THREE.Group();
						grp.position.copy(goal.pos);
						grp.quaternion.setFromUnitVectors(tipDirLocal, goal.facing);
						grp.scale.copy(wristScale);
						grp.add(ghost);
						scene.add(grp);
						goal.ghost = grp;
						goal.ghostMat = gm;
						goal.baseScale = wristScale.x || 1;
					}

					tip = new THREE.Object3D();
					tip.position.copy(tipLocal);
					wrist.add(tip);
				}

				// --- settle the camera on the captured initial framing ------------
				// Play opens on the hand-tuned CAM_POS looking at CAM_TARGET. Orbit is
				// bounded around that distance so the player stays near the arm.
				scene.updateMatrixWorld(true);
				const camPos = new THREE.Vector3(CAM_POS[0], CAM_POS[1], CAM_POS[2]);
				const camTgt = new THREE.Vector3(
					CAM_TARGET[0],
					CAM_TARGET[1],
					CAM_TARGET[2],
				);
				// On a portrait / narrow stage, pull the OPENING position back along the
				// view direction so the phone frames ~2× the area a landscape desktop
				// does. Desktop (wide stage) keeps the hand-tuned framing untouched.
				const mw = mount.clientWidth || 1;
				const mh = mount.clientHeight || 1;
				if (mw / mh < 1 || mw < 640) {
					camPos.sub(camTgt).multiplyScalar(PORTRAIT_DOLLY).add(camTgt);
				}
				const camDist = camPos.distanceTo(camTgt);
				controls.target.copy(camTgt);
				camera.position.copy(camPos);
				// generous play range: pull right in close to the EE, or back out far
				// enough to take in the whole station as context
				controls.minDistance = 0.1;
				controls.maxDistance = camDist * 14;
				controls.update();

				setStatus('ready');
			},
			undefined,
			() => {
				if (localAlive) setStatus('error');
			},
		);

		// --- capture --------------------------------------------------------
		const capture = (t: RuntimeGoal): void => {
			if (capturedRef.current) return;
			capturedRef.current = true;
			t.captured = true;
			t.labelEl?.classList.add('orbit__label--locked');
			// burst: flip the ghost from green to the cyan "done" cue, solidify it
			// and pop its scale (the per-frame loop leaves captured ghosts alone).
			if (t.ghostMat) {
				t.ghostMat.color.set(0x38bdf8);
				t.ghostMat.emissive.set(0x38bdf8);
				t.ghostMat.emissiveIntensity = 1.6;
				t.ghostMat.opacity = 0.7;
			}
			t.ghost?.scale.setScalar(t.baseScale * 1.4);

			void Promise.all([
				decodePath(t.dest.cipher, t.dest.key),
				decodeLabel(t.dest.labelCipher, t.dest.key).catch(() => t.dest.key),
			])
				.then(([dest, label]) => {
					if (!aliveRef.current) return; // maze switched mid-await
					setToast(label.toLowerCase());
					navTimerRef.current = window.setTimeout(() => {
						window.location.href = dest;
					}, 700);
				})
				.catch(() => {
					// A failed decode must not strand the lock: fully release it so the
					// target un-freezes and can be re-acquired rather than dead. Clearing
					// only the flags would leave progress at 1 and the cyan "locked"
					// visual, so if still in range capture() would re-fire every frame.
					capturedRef.current = false;
					t.captured = false;
					t.progress = 0;
					t.labelEl?.classList.remove('orbit__label--locked');
					// restore the ghost to its idle green (the per-frame loop only
					// drives opacity/scale/intensity, never color/emissive).
					if (t.ghostMat) {
						t.ghostMat.color.set(0x4ade80);
						t.ghostMat.emissive.set(0x4ade80);
						t.ghostMat.emissiveIntensity = 0.32;
						t.ghostMat.opacity = 0.35;
					}
					t.ghost?.scale.setScalar(t.baseScale);
				});
		};

		// --- resize ---------------------------------------------------------
		const resize = (): void => {
			const w = mount.clientWidth || 1;
			const h = mount.clientHeight || 1;
			// updateStyle=true (the default): keep the canvas CSS size equal to the
			// mount at every DPR while the drawing buffer stays crisp. Passing false
			// left the canvas laid out at its high-DPR attribute size on phones, so it
			// overflowed the mount (crop/zoom) and threw off both the screen-space
			// label projection and OrbitControls' pointer→rotation mapping.
			renderer.setSize(w, h);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(mount);

		// --- render loop ----------------------------------------------------
		const clock = new THREE.Clock();
		const tick = (): void => {
			frame = requestAnimationFrame(tick);
			const dt = Math.min(clock.getDelta(), 0.05);
			const t = clock.elapsedTime;

			// FK: rotate each joint about its LOCAL axis, layered on its base pose
			for (let i = 0; i < JOINTS.length; i++) {
				const node = jointNodes[i];
				if (!node) continue;
				_q.setFromAxisAngle(axisVecs[i]!, jointRadRef.current[i]!);
				node.quaternion.copy(baseQuat[i]!).multiply(_q);
			}

			stars.rotation.y += dt * 0.006;

			// end-effector world transform + boresight
			let haveTip = false;
			if (tip) {
				const wrist = jointNodes[6];
				tip.updateWorldMatrix(true, false);
				tip.getWorldPosition(_tipPos);
				if (wrist) {
					// tipDirLocal is unit and getWorldQuaternion returns a unit
					// quaternion, so the rotated boresight is already unit-length
					wrist.getWorldQuaternion(_wristQ);
					_boresight.copy(tipDirLocal).applyQuaternion(_wristQ);
					haveTip = true;
				}
			}

			// per-goal: in-range test (tip position AND boresight/facing), lock
			// dwell, capture, ghost feedback, label projection.
			for (const rt of runtime) {
				if (!rt.captured) {
					let inRange = false;
					if (haveTip) {
						const dist = _tipPos.distanceTo(rt.pos);
						const aimAng = _boresight.angleTo(rt.facing);
						inRange = dist < POS_TOL && aimAng < ANG_TOL;
					}
					rt.inRange = inRange;
					rt.progress = clamp(
						rt.progress +
							(inRange ? dt / LOCK_TIME : -dt / UNLOCK_TIME),
						0,
						1,
					);
					if (rt.progress >= 1) capture(rt);
				}

				// ghost feedback: idle = faint green; in range = brighter + a soft
				// opacity/scale pulse; captured = solid cyan (set once in capture()).
				const gm = rt.ghostMat;
				if (gm && !rt.captured) {
					if (rt.inRange) {
						const s = 0.5 + 0.5 * Math.sin(t * 10);
						gm.opacity = 0.5 + 0.15 * s;
						gm.emissiveIntensity = 0.7 + 0.4 * s;
					} else {
						gm.opacity = 0.35;
						gm.emissiveIntensity = 0.32;
					}
				}
				if (rt.ghost && !rt.captured) {
					rt.ghost.scale.setScalar(
						rt.baseScale * (rt.inRange ? 1 + 0.04 * Math.sin(t * 10) : 1),
					);
				}

				// project the label to screen space (imperative — no re-render)
				const el = rt.labelEl;
				if (el) {
					_proj.copy(rt.pos).project(camera);
					const behind = _proj.z > 1;
					if (behind) {
						el.style.opacity = '0';
					} else {
						const x = (_proj.x * 0.5 + 0.5) * mount.clientWidth;
						// lift the label clear of the marker glyph so text never
						// sits on top of the circle / the bright arm behind it
						const y = (-_proj.y * 0.5 + 0.5) * mount.clientHeight - 20;
						el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
						el.style.setProperty('--lock', rt.progress.toFixed(3));
						el.style.opacity = '1';
						el.classList.toggle('orbit__label--range', rt.inRange && !rt.captured);
					}
				}
			}

			// confine the orbit/pan target to the visible-scene envelope so it
			// can't strand in empty space, without capping zoom into the station.
			// Must run BEFORE controls.update() so update() recomputes the camera
			// from the clamped target (the camera−target offset is preserved
			// across pan, so clamping the target here limits the pan cleanly — no
			// rubber-band recoil or one-frame jitter).
			controls.target.clamp(targetMinV, targetMaxV);

			controls.update();
			renderer.render(scene, camera);
		};
		tick();

		// --- teardown -------------------------------------------------------
		return () => {
			localAlive = false;
			aliveRef.current = false;
			if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
			cancelAnimationFrame(frame);
			ro.disconnect();
			renderer.domElement.removeEventListener('wheel', onWheel);
			renderer.domElement.removeEventListener('pointerdown', onPointerDown);
			renderer.domElement.removeEventListener('pointermove', onPointerMove);
			renderer.domElement.removeEventListener('pointerup', onPointerUp);
			renderer.domElement.removeEventListener('pointercancel', onPointerUp);
			controls.dispose();
			// Ghost EEs share geometry with the arm, so pull them out of the scene
			// first (disposeObject would otherwise dispose that shared geometry a
			// second time) and dispose their own materials explicitly. The arm root
			// still in `scene` disposes the shared geometry exactly once.
			for (const rt of runtime) {
				if (rt.ghost) scene.remove(rt.ghost);
				rt.ghostMat?.dispose();
			}
			disposeObject(scene); // reclaims all scene-parented geo/materials/textures
			draco.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			if (renderer.domElement.parentNode) {
				renderer.domElement.parentNode.removeChild(renderer.domElement);
			}
		};
	}, []);

	return (
		<div class="orbit">
			<div class="orbit__stage">
				<div ref={mountRef} class="orbit__viewport" />
				{GOALS.map((_def, i) => (
					<div
						key={dests[i]?.key ?? i}
						class="orbit__label orbit__label--goal"
						ref={(el) => {
							labelRefs.current[i] = el;
						}}
					>
						<span class="orbit__label-ring" aria-hidden="true" />
						<span class="orbit__label-text">
							{(goalLabels[i] ?? '').toLowerCase()}
						</span>
					</div>
				))}
				{status !== 'ready' && (
					<p class="orbit__overlay">
						{status === 'error' ? 'telemetry lost — try another' : 'acquiring…'}
					</p>
				)}
				{toast && <p class="orbit__toast">{toast}</p>}
			</div>

			<div class="orbit__console" role="group" aria-label="arm joints">
				{JOINTS.map((j, i) => (
					<div key={j.name} class="orbit__knob">
						<span class="orbit__knob-name">{j.short}</span>
						<button
							type="button"
							class="orbit__step"
							aria-label={`${j.short} plus 1 degree`}
							onPointerDown={() => startHold(i, +1)}
							onPointerUp={stopHold}
							onPointerLeave={stopHold}
							onPointerCancel={stopHold}
							onClick={() => nudge(i, +1)}
						>
							+
						</button>
						<input
							class="orbit__knob-input"
							type="range"
							min={-LIMIT_DEG}
							max={LIMIT_DEG}
							step={1}
							value={angles[i]}
							aria-label={`${j.short} joint angle`}
							onInput={(e) => onJoint(i, e)}
						/>
						<button
							type="button"
							class="orbit__step"
							aria-label={`${j.short} minus 1 degree`}
							onPointerDown={() => startHold(i, -1)}
							onPointerUp={stopHold}
							onPointerLeave={stopHold}
							onPointerCancel={stopHold}
							onClick={() => nudge(i, -1)}
						>
							−
						</button>
						<input
							class="orbit__knob-field"
							type="number"
							min={-LIMIT_DEG}
							max={LIMIT_DEG}
							step={1}
							value={Math.round(angles[i]!)}
							aria-label={`${j.short} joint angle in degrees`}
							onChange={(e) => onField(i, e)}
						/>
					</div>
				))}
				<button type="button" class="orbit__reset" onClick={resetPose}>
					reset
				</button>
			</div>
		</div>
	);
}

/** Recursively dispose geometries, materials and their textures under a root. */
function disposeObject(root: THREE.Object3D): void {
	root.traverse((o) => {
		const mesh = o as THREE.Mesh & { isPoints?: boolean };
		const geo = (mesh as { geometry?: THREE.BufferGeometry }).geometry;
		if (geo && typeof geo.dispose === 'function') geo.dispose();
		const mat = (mesh as { material?: THREE.Material | THREE.Material[] })
			.material;
		if (!mat) return;
		const mats = Array.isArray(mat) ? mat : [mat];
		for (const m of mats) {
			for (const key in m) {
				const val = (m as unknown as Record<string, unknown>)[key];
				if (val && (val as { isTexture?: boolean }).isTexture) {
					(val as THREE.Texture).dispose();
				}
			}
			m.dispose();
		}
	});
}

// ===========================================================================
export default function Manipulator(): JSX.Element {
	const dests = getDestinations(MAZE_ID);
	// Decide once: no WebGL or reduced-motion routes to the reachable fallback.
	const [use3d] = useState<boolean>(() => webglAvailable() && !reducedMotion());
	return use3d ? (
		<ManipulatorScene dests={dests} />
	) : (
		<ManipulatorFallback dests={dests} />
	);
}
