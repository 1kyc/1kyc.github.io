/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX, TargetedKeyboardEvent } from 'preact';
import type { MazeDef } from '../lib/mazes';

const BACKDOORS_ID = 'backdoors';
const OPT_PREFIX = 'menu-opt-';

interface MazeMenuProps {
	/** The real, user-facing mazes (the backdoors row is appended internally). */
	mazes: readonly MazeDef[];
	/** Id of the maze currently shown — marked --active and highlighted on open. */
	activeId: string;
	/** Once true, the backdoors escape-hatch row is appended to the list. */
	backdoorsRevealed: boolean;
	/** Open state of the parent selector — focus enters the menu when it opens. */
	open: boolean;
	onSelect: (id: string) => void;
	onClose: () => void;
	onRevealBackdoors: () => void;
}

/**
 * The maze menu: a plain, robust dropdown. No physics, no scroll-snap, no
 * centering, no drag. Selection is an explicit tap/click or Enter/Space on the
 * highlighted row; arrow keys only MOVE the highlight (they never switch the
 * maze, so we don't lazy-load mazes while arrowing). Selecting closes the menu.
 */
export default function MazeMenu({
	mazes,
	activeId,
	backdoorsRevealed,
	open,
	onSelect,
	onClose,
	onRevealBackdoors,
}: MazeMenuProps): JSX.Element {
	// Rows: the real mazes, plus backdoors once it's been deliberately revealed.
	const items: MazeDef[] = backdoorsRevealed
		? [...mazes, { id: BACKDOORS_ID, label: 'backdoors', kind: 'fallback' }]
		: [...mazes];

	const menuRef = useRef<HTMLDivElement>(null);

	// The keyboard/hover target. Reset to activeId every time the menu opens.
	const [highlightedId, setHighlightedId] = useState<string>(activeId);

	// Guaranteed to be a row that currently exists (items can change underneath).
	const safeHighlightedId = items.some((m) => m.id === highlightedId)
		? highlightedId
		: (items[0]?.id ?? activeId);

	// Set when a deliberate `b` reveal wants the highlight to land on backdoors
	// once the row has actually been appended (next render after the flag flips).
	const pendingExitHighlight = useRef(false);

	// Bring a row into view without precise centering — block:'nearest' won't
	// jump if the row is already visible.
	const scrollIntoView = (id: string): void => {
		const el = menuRef.current?.querySelector<HTMLElement>(
			`#${CSS.escape(OPT_PREFIX + id)}`,
		);
		el?.scrollIntoView({ block: 'nearest' });
	};

	// Move the highlight and make sure the new row is visible.
	const moveHighlight = (id: string): void => {
		setHighlightedId(id);
		scrollIntoView(id);
	};

	// Commit the highlighted (or given) row: switch the maze, then close.
	const commit = (id: string): void => {
		onSelect(id);
		onClose();
	};

	// --- opening: highlight the active row, focus the listbox, reveal it -----
	// The menu is an absolute overlay that's always full-size in the DOM (shown
	// via opacity/visibility, not height), so geometry is stable the instant it
	// appears. One rAF lets the show paint before we scroll the row into view.
	useEffect(() => {
		if (!open) return;
		setHighlightedId(activeId);
		const menu = menuRef.current;
		const raf = requestAnimationFrame(() => {
			menu?.focus({ preventScroll: true });
			scrollIntoView(activeId);
		});
		return () => cancelAnimationFrame(raf);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// --- deliberate backdoors reveal: highlight it once the row exists -------
	// (does NOT auto-commit — the user still taps/Enters to go there).
	useEffect(() => {
		if (!backdoorsRevealed || !pendingExitHighlight.current) return;
		pendingExitHighlight.current = false;
		moveHighlight(BACKDOORS_ID);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [backdoorsRevealed]);

	const onKeyDown = (e: TargetedKeyboardEvent<HTMLDivElement>): void => {
		const cur = Math.max(0, items.findIndex((m) => m.id === safeHighlightedId));
		switch (e.key) {
			case 'ArrowDown':
				// Clamped to the last existing row — never reveals backdoors.
				e.preventDefault();
				moveHighlight(items[Math.min(cur + 1, items.length - 1)]!.id);
				break;
			case 'ArrowUp':
				e.preventDefault();
				moveHighlight(items[Math.max(cur - 1, 0)]!.id);
				break;
			case 'Home':
				e.preventDefault();
				moveHighlight(items[0]!.id);
				break;
			case 'End':
				// Last existing row only — does NOT reveal backdoors.
				e.preventDefault();
				moveHighlight(items[items.length - 1]!.id);
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				commit(safeHighlightedId);
				break;
			case 'Escape':
				e.preventDefault();
				onClose();
				break;
			case 'b':
			case 'B':
				// Deliberate escape-hatch reveal; highlight lands on it once appended.
				e.preventDefault();
				if (!backdoorsRevealed) {
					pendingExitHighlight.current = true;
					onRevealBackdoors();
				} else {
					moveHighlight(BACKDOORS_ID);
				}
				break;
			default:
				break;
		}
	};

	return (
		<div
			ref={menuRef}
			class="menu"
			role="listbox"
			aria-label="maze selector"
			tabIndex={0}
			aria-activedescendant={`${OPT_PREFIX}${safeHighlightedId}`}
			onKeyDown={onKeyDown}
		>
			<ul class="menu__list" role="presentation">
				{items.map((m) => {
					const isActive = m.id === activeId;
					const isHighlighted = m.id === safeHighlightedId;
					const isExit = m.id === BACKDOORS_ID;
					return (
						<li
							key={m.id}
							id={`${OPT_PREFIX}${m.id}`}
							role="option"
							aria-selected={isActive}
							class={
								'menu__item' +
								(isActive ? ' menu__item--active' : '') +
								(isHighlighted ? ' menu__item--highlighted' : '') +
								(isExit ? ' menu__item--exit' : '')
							}
							onMouseEnter={() => setHighlightedId(m.id)}
							onClick={() => commit(m.id)}
						>
							{m.label}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
