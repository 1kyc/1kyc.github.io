// BlogSearch — the site's one and only interactive blog surface (a Preact island
// mounted only on /blog/search). Everything else stays zero-JS.
//
// It talks to Pagefind's runtime bundle, which the astro-pagefind integration
// builds into /pagefind/ from the static HTML at `astro build` (and serves in
// dev/preview). The bundle isn't present at build time, so it's imported lazily
// through a non-literal path with @vite-ignore — otherwise Vite would try to
// resolve /pagefind/pagefind.js during the build and fail.
//
// Multilingual: Pagefind builds ONE index per page language (`<html lang>`), and
// its runtime loads only the index matching the page it inits on — with no option
// to pick another. This page is `en`, so a naive init would never find zh-Hans/ja
// posts. Instead we spin up one Pagefind instance per language that actually has
// posts (the `langs` prop, derived at build time) and merge their results, so one
// box searches every language. See loadInstance for the per-language init.
import { useCallback, useRef, useState } from 'preact/hooks';

type PagefindResultData = {
	url: string;
	excerpt: string;
	meta: { title?: string; date?: string };
};

type PagefindResult = { data: () => Promise<PagefindResultData> };
type Pagefind = {
	init: () => Promise<void>;
	search: (q: string) => Promise<{ results: PagefindResult[] }>;
};

interface Props {
	/** Languages that have posts (from frontmatter `lang`); one Pagefind index each. */
	langs: string[];
}

const MAX_RESULTS = 20;
const DEBOUNCE_MS = 180;

/**
 * Load one Pagefind instance bound to a specific language index. Pagefind reads
 * `<html lang>` at init and exposes no option to override it, so we set lang for
 * the duration of the init (which captures it) and restore it immediately after.
 * A distinct `?lang=` query gives each language its own ES-module instance, so
 * their captured languages don't clobber each other.
 */
async function loadInstance(lang: string): Promise<Pagefind> {
	const html = document.documentElement;
	const prev = html.lang;
	html.lang = lang;
	try {
		const path = `/pagefind/pagefind.js?lang=${encodeURIComponent(lang)}`;
		const mod = (await import(/* @vite-ignore */ path)) as Pagefind;
		await mod.init();
		return mod;
	} finally {
		html.lang = prev;
	}
}

let instancesPromise: Promise<Pagefind[]> | null = null;
function loadInstances(langs: string[]): Promise<Pagefind[]> {
	if (!instancesPromise) {
		// Sequential: each load transiently mutates <html lang>, so they must not
		// overlap. A handful of languages, once, on first search — negligible.
		instancesPromise = (async () => {
			const out: Pagefind[] = [];
			for (const lang of langs) {
				try {
					out.push(await loadInstance(lang));
				} catch {
					// A language with no built index (e.g. all its posts are drafts in a
					// production build) — skip it rather than fail the whole search.
				}
			}
			return out;
		})();
	}
	return instancesPromise;
}

export default function BlogSearch({ langs }: Props) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<PagefindResultData[]>([]);
	const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle');
	const timer = useRef<number | undefined>(undefined);
	// Ignore results from a stale query that resolves after a newer keystroke.
	const latest = useRef('');

	const run = useCallback(
		async (q: string) => {
			const trimmed = q.trim();
			if (!trimmed) {
				setResults([]);
				setStatus('idle');
				return;
			}
			setStatus('searching');
			const instances = await loadInstances(langs);
			const searches = await Promise.all(instances.map((pf) => pf.search(trimmed)));
			// Merge every language's hits, then dedupe by URL (a post lives in exactly
			// one language index, so this is just belt-and-suspenders).
			const merged = searches.flatMap((s) => s.results).slice(0, MAX_RESULTS * 2);
			const data = await Promise.all(merged.map((r) => r.data()));
			if (latest.current !== q) return; // a newer query superseded this one
			const seen = new Set<string>();
			const unique: PagefindResultData[] = [];
			for (const d of data) {
				if (!seen.has(d.url)) {
					seen.add(d.url);
					unique.push(d);
				}
			}
			setResults(unique.slice(0, MAX_RESULTS));
			setStatus('done');
		},
		[langs],
	);

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
