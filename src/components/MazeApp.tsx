/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { FunctionComponent, JSX } from 'preact';
import { REAL_MAZES, resolveInitialMaze, MAZE_LOADERS } from '../lib/mazes';
import MazeMenu from './MazeMenu';

/** How long the dashed-ring toggle must be held to deliberately reveal backdoors. */
const LONG_PRESS_MS = 600;

/** Reflect the active maze id into the URL (?m=<id>) without reloading. */
function syncUrl(id: string): void {
	const url = new URL(window.location.href);
	url.searchParams.set('m', id);
	history.replaceState(null, '', url.toString());
}

export default function MazeApp(): JSX.Element {
	// client:only — window is available during the first render.
	const [activeId, setActiveId] = useState<string>(
		() => resolveInitialMaze(window.location.search).id,
	);
	const [open, setOpen] = useState(false);
	const [backdoorsRevealed, setBackdoorsRevealed] = useState<boolean>(
		() => activeId === 'backdoors',
	);

	// The active maze component, code-split and loaded on demand from the
	// registry. Null while a chunk is in flight (shows a placeholder).
	const [Active, setActive] = useState<FunctionComponent | null>(null);
	// Set when a chunk fails to load (or no loader exists) so we surface a
	// non-blocking hint instead of hanging on "loading…" forever.
	const [loadError, setLoadError] = useState(false);

	const select = (id: string): void => {
		setActiveId(id);
		syncUrl(id);
	};

	const revealBackdoors = (): void => setBackdoorsRevealed(true);

	// Long-press on the dashed-ring toggle is the deliberate gesture that reveals the
	// backdoors detent. A press that crosses LONG_PRESS_MS reveals + opens the
	// menu and swallows the click that pointerup would otherwise fire (so the
	// long-press doesn't ALSO toggle open/closed). Short taps fall through to the
	// normal click = open/close.
	const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const suppressClick = useRef(false);

	// Wraps the menu + the dashed-ring toggle. Used to tell an "inside" pointer (which
	// should NOT close the menu) from an "outside" one (which should).
	const selectorRef = useRef<HTMLDivElement>(null);

	const cancelLongPress = (): void => {
		if (longPressTimer.current !== null) {
			clearTimeout(longPressTimer.current);
			longPressTimer.current = null;
		}
	};
	const startLongPress = (): void => {
		suppressClick.current = false;
		cancelLongPress();
		longPressTimer.current = setTimeout(() => {
			longPressTimer.current = null;
			suppressClick.current = true; // swallow the upcoming click
			setBackdoorsRevealed(true);
			setOpen(true); // surface the menu so the new detent is visible
		}, LONG_PRESS_MS);
	};
	// Close the menu. The CSS reveals it on `.selector:focus-within` too, so focus
	// (on the listbox or toggle) must be dropped or the menu would stay visible —
	// this covers every close path, including selecting a row. Every other close
	// path (toggle, outside-click, Escape) routes through here so the blur-then-
	// close contract lives in exactly one place.
	const closeMenu = (): void => {
		const sel = selectorRef.current;
		const active = document.activeElement;
		if (sel && active instanceof HTMLElement && sel.contains(active)) {
			active.blur();
		}
		setOpen(false);
	};

	const onToggleClick = (): void => {
		if (suppressClick.current) {
			suppressClick.current = false;
			return; // this click was the tail of a long-press — ignore it
		}
		// Closing must blur focus inside the selector (the CSS keeps the menu
		// visible on `:focus-within`), which is exactly what closeMenu() does.
		if (open) closeMenu();
		else setOpen(true);
	};

	// Drop a pending long-press timer if we unmount mid-hold.
	useEffect(() => cancelLongPress, []);

	// While open, dismiss on a pointer down OUTSIDE the selector or on Escape —
	// focus-loss/hover dismissal doesn't exist on touch. The toggle lives inside
	// `.selector`, so the tap that OPENS the menu counts as "inside" and won't
	// immediately re-close it (the toggle's onClick handles that). We only attach
	// these listeners while open, so they can't leak or fire when closed.
	useEffect(() => {
		if (!open) return;
		const onDocPointerDown = (e: PointerEvent): void => {
			const sel = selectorRef.current;
			if (!sel || sel.contains(e.target as Node)) return;
			// Outside tap: closeMenu() drops focus inside the selector first (the CSS
			// keeps the menu visible on `:focus-within`, and a touch tap on a
			// non-focusable area doesn't blur the listbox on its own).
			closeMenu();
		};
		// Note: MazeMenu ALSO handles Escape (to close from within the listbox); this
		// document-level listener covers the "menu open but focus left the listbox"
		// case, so both Escape paths are intentional — don't delete one as redundant.
		const onKeyDown = (e: KeyboardEvent): void => {
			if (e.key !== 'Escape') return;
			closeMenu();
		};
		document.addEventListener('pointerdown', onDocPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onDocPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	// Lazy-load whichever maze is active. Each loader is its own dynamic import,
	// so a maze's code only ships once it's actually shown — the island bundle
	// doesn't grow as mazes are added.
	useEffect(() => {
		let ok = true;
		setActive(null);
		setLoadError(false);
		const loader = MAZE_LOADERS[activeId];
		if (!loader) {
			// Unknown id with no registered chunk — don't hang forever.
			setLoadError(true);
			return;
		}
		loader()
			.then((m) => {
				if (ok) setActive(() => m.default);
			})
			.catch(() => {
				if (ok) setLoadError(true);
			});
		return () => {
			ok = false;
		};
	}, [activeId]);

	return (
		<div class="maze">
			{Active ? (
				<Active />
			) : loadError ? (
				<p class="maze__hint">couldn't load — try another</p>
			) : (
				<p class="maze__hint">loading…</p>
			)}

			<div
				ref={selectorRef}
				class={`selector${open ? ' selector--open' : ''}`}
			>
				<MazeMenu
					mazes={REAL_MAZES}
					activeId={activeId}
					backdoorsRevealed={backdoorsRevealed}
					open={open}
					onSelect={select}
					onClose={closeMenu}
					onRevealBackdoors={revealBackdoors}
				/>
				<button
					type="button"
					class="selector__toggle"
					aria-label={open ? 'close maze selector' : 'open maze selector'}
					aria-expanded={open}
					onClick={onToggleClick}
					onPointerDown={startLongPress}
					onPointerUp={cancelLongPress}
					onPointerLeave={cancelLongPress}
					onPointerCancel={cancelLongPress}
				>
					<svg
						class="selector__ring"
						viewBox="0 0 16 16"
						width="12"
						height="12"
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						aria-hidden="true"
						focusable="false"
					>
						<circle cx="8" cy="8" r="6" pathLength="100" stroke-dasharray="5 5" />
					</svg>
				</button>
			</div>
		</div>
	);
}
