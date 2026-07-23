// BlogSearch — the site's one and only interactive blog surface (a Preact island
// mounted only on /blog/search). Everything else stays zero-JS.
//
// It talks to Pagefind's runtime bundle, which the astro-pagefind integration
// builds into /pagefind/ from the static HTML at `astro build` (and serves in
// dev/preview). The bundle isn't present at build time, so it's imported lazily
// through a non-literal path with @vite-ignore — otherwise Vite would try to
// resolve /pagefind/pagefind.js during the build and fail.
import { useCallback, useRef, useState } from 'preact/hooks';

type PagefindResultData = {
	url: string;
	excerpt: string;
	meta: { title?: string; date?: string };
};

type PagefindResult = { data: () => Promise<PagefindResultData> };
type Pagefind = {
	search: (q: string) => Promise<{ results: PagefindResult[] }>;
};

const MAX_RESULTS = 20;
const DEBOUNCE_MS = 180;

let pagefindPromise: Promise<Pagefind> | null = null;
function loadPagefind(): Promise<Pagefind> {
	if (!pagefindPromise) {
		// Non-literal path + @vite-ignore keeps the bundler from resolving this at
		// build time; it's fetched from the built /pagefind/ dir in the browser.
		const path = '/pagefind/pagefind.js';
		pagefindPromise = import(/* @vite-ignore */ path) as Promise<Pagefind>;
	}
	return pagefindPromise;
}

export default function BlogSearch() {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<PagefindResultData[]>([]);
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
		const pagefind = await loadPagefind();
		const search = await pagefind.search(trimmed);
		const data = await Promise.all(
			search.results.slice(0, MAX_RESULTS).map((r) => r.data()),
		);
		if (latest.current !== q) return; // a newer query superseded this one
		setResults(data);
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
								<span class="blog-search__title">
									{r.meta.title ?? r.url}
								</span>
								{/* Pagefind returns excerpt HTML with <mark> around hits. */}
								<span
									class="blog-search__excerpt"
									dangerouslySetInnerHTML={{ __html: r.excerpt }}
								/>
								{r.meta.date && (
									<span class="blog-search__date">{r.meta.date}</span>
								)}
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
