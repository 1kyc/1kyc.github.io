// date.ts — shared date presentation for content pages.
//
// One formatter, one style, so the blog index and post pages can't drift into
// showing the same date two different ways. Long US style (e.g. "June 28,
// 2026"); the machine-readable value belongs in <time datetime> separately.

const formatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
});

/** Format a Date for display, e.g. "June 28, 2026". */
export function formatDate(date: Date): string {
	return formatter.format(date);
}
