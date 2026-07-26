// BlogSearch — the one interactive island on the content side (only on
// /blog/search). Everything else stays zero-JS.
//
// Hybrid search, split by post language:
//   • English posts → Pagefind. Its prebuilt word index gives stemming
//     (apples→apple) + prefix matching, and downloads in small chunks. Loaded
//     lazily from /pagefind/pagefind.js (a non-literal path + @vite-ignore, since
//     the bundle doesn't exist at build time).
//   • CN/JP posts → a true SUBSTRING scan over /blog/search-cjk.json, so a single
//     CJK character matches anywhere it appears (Pagefind's word/prefix model
//     hides mid-word characters, which matters when the character IS the unit).
//     Fine to scan client-side: this slice is small by design.
// Results from both are merged and de-duplicated by URL.
import { useCallback, useRef, useState } from 'preact/hooks';

type Result = { url: string; title?: string; date?: string; excerpt: string };
type CjkEntry = {
	url: string;
	title: string;
	date: string;
	tags: string[];
	body: string;
};
// The fetched entry plus a lowercased haystack (title + tags + body), computed
// once at load so each keystroke is a plain `.includes` rather than rebuilding
// and lowercasing every entry's text on every query.
type CjkIndexed = CjkEntry & { haystack: string };

const MAX_RESULTS = 20;
const DEBOUNCE_MS = 180;

// --- English: Pagefind ---
let pagefindPromise: Promise<any> | null = null;
function loadPagefind(): Promise<any> {
	if (!pagefindPromise) {
		const path = '/pagefind/pagefind.js';
		pagefindPromise = import(/* @vite-ignore */ path);
	}
	return pagefindPromise;
}

// --- CN/JP: substring index ---
let cjkPromise: Promise<CjkIndexed[]> | null = null;
function loadCjkIndex(): Promise<CjkIndexed[]> {
	if (!cjkPromise) {
		cjkPromise = fetch('/blog/search-cjk.json')
			.then((r) => (r.ok ? (r.json() as Promise<CjkEntry[]>) : []))
			.then((entries) =>
				entries.map((e) => ({
					...e,
					haystack: `${e.title} ${e.tags.join(' ')} ${e.body}`.toLowerCase(),
				})),
			)
			.catch(() => []);
	}
	return cjkPromise;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build a highlighted excerpt window around the first substring match. */
function makeExcerpt(body: string, query: string): string {
	const at = body.toLowerCase().indexOf(query.toLowerCase());
	if (at === -1) {
		return escapeHtml(body.slice(0, 100)) + (body.length > 100 ? '…' : '');
	}
	const start = Math.max(0, at - 20);
	const end = Math.min(body.length, at + query.length + 60);
	return (
		(start > 0 ? '…' : '') +
		escapeHtml(body.slice(start, at)) +
		'<mark>' +
		escapeHtml(body.slice(at, at + query.length)) +
		'</mark>' +
		escapeHtml(body.slice(at + query.length, end)) +
		(end < body.length ? '…' : '')
	);
}

export default function BlogSearch() {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<Result[]>([]);
	const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle');
	const timer = useRef<number | undefined>(undefined);
	// Ignore results from a stale query that resolves after a newer keystroke.
	const latest = useRef('');

	const run = useCallback(async (q: string) => {
		const trimmed = q.trim();
		if (!trimmed) {
			setResults([]);
			setStatus('idle');
			return;
		}
		setStatus('searching');
		const [pagefind, cjk] = await Promise.all([loadPagefind(), loadCjkIndex()]);

		// English via Pagefind (stemming + prefix).
		const search = await pagefind.search(trimmed);
		const enData = await Promise.all(
			search.results.slice(0, MAX_RESULTS).map((r: any) => r.data()),
		);
		const enResults: Result[] = enData.map((d: any) => ({
			url: d.url,
			title: d.meta?.title,
			date: d.meta?.date,
			excerpt: d.excerpt,
		}));

		// CN/JP via substring over the precomputed title+tags+body haystack.
		const ql = trimmed.toLowerCase();
		const cjkResults: Result[] = cjk
			.filter((e) => e.haystack.includes(ql))
			.map((e) => ({
				url: e.url,
				title: e.title,
				date: e.date,
				excerpt: makeExcerpt(e.body, trimmed),
			}));

		if (latest.current !== q) return; // a newer query superseded this one

		const seen = new Set<string>();
		const merged: Result[] = [];
		for (const r of [...enResults, ...cjkResults]) {
			if (!seen.has(r.url)) {
				seen.add(r.url);
				merged.push(r);
			}
		}
		setResults(merged.slice(0, MAX_RESULTS));
		setStatus('done');
	}, []);

	const onInput = useCallback(
		(e: Event) => {
			const q = (e.currentTarget as HTMLInputElement).value;
			setQuery(q);
			latest.current = q;
			clearTimeout(timer.current);
			timer.current = window.setTimeout(() => run(q), DEBOUNCE_MS);
		},
		[run],
	);

	return (
		<div class="blog-search">
			<input
				type="search"
				class="blog-search__input"
				placeholder="Search posts…"
				value={query}
				onInput={onInput}
				autocomplete="off"
				autofocus
				aria-label="Search posts"
			/>
			{status === 'searching' && (
				<p class="blog-search__status" aria-live="polite">Searching…</p>
			)}
			{status === 'done' && results.length === 0 && (
				<p class="blog-search__status" aria-live="polite">
					No matches for “{query.trim()}”.
				</p>
			)}
			{status === 'done' && results.length > 0 && (
				<p class="blog-search__status" aria-live="polite">
					{results.length} result{results.length === 1 ? '' : 's'}
				</p>
			)}
			{results.length > 0 && (
				<ul class="blog-search__results">
					{results.map((r) => (
						<li class="blog-search__result" key={r.url}>
							<a href={r.url}>
								<span class="blog-search__title">{r.title ?? r.url}</span>
								{/* excerpt HTML has <mark> around the match (Pagefind's, or
								    makeExcerpt's for CN/JP) */}
								<span
									class="blog-search__excerpt"
									dangerouslySetInnerHTML={{ __html: r.excerpt }}
								/>
								{r.date && <span class="blog-search__date">{r.date}</span>}
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
