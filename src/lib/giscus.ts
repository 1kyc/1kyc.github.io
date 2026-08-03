// Giscus (GitHub Discussions–backed comments) configuration — the single source
// of truth for the widget's identity. Rendered by src/components/Comments.astro.
//
// These values are PUBLIC by design (they ship in the client HTML of every
// giscus-powered site) — not secrets. `repoId` is the repository's GraphQL node
// id, fetched once with:
//   gh api graphql -f query='{ repository(owner:"1kyc", name:"1kyc.github.io"){ id } }'
//
// SETUP (one-time, done by the repo owner — Claude's token can't do these):
//   1. Enable Discussions:  repo → Settings → General → Features → Discussions.
//   2. Install the giscus app on the repo:  https://github.com/apps/giscus
//   3. REQUIRED — pin `categoryId` below. giscus can *find* existing discussions
//      by category NAME, but CREATING a post's discussion (what happens on the
//      first comment) needs the category's node id — and on a fresh blog every
//      post's first comment is a create. So name-only mode leaves the first
//      comment on each post unable to open its discussion. With Discussions
//      enabled (step 1), fetch the id and paste it into `categoryId`:
//        gh api graphql -f query='{ repository(owner:"1kyc", name:"1kyc.github.io"){
//          discussionCategories(first:20){ nodes{ id name } } } }'
//      Pick the "Announcements" node's DIC_… id. Until it's set, the widget still
//      renders and reads existing discussions, but new-discussion creation is
//      unreliable — treat pinning the id as part of first-run setup, not later
//      hardening. (It also makes a category rename non-breaking.)
//
import { REPO_SLUG } from './site';

// Why "Announcements": giscus's recommended category type. Only maintainers (and
// the giscus app, on a commenter's behalf) can open top-level discussions there,
// so readers can't spawn stray discussions — one discussion per post, created on
// the first comment. Mapping is by `pathname`, stable across post edits.

export const GISCUS = {
	// The repo the giscus app is installed on — the same one the footer's "Source"
	// link and the privacy page point at, so it comes from lib/site (one string,
	// one place) rather than being spelled out a third time here.
	repo: REPO_SLUG,
	repoId: 'R_kgDOS9HQaA',
	category: 'Announcements',
	/** REQUIRED for reliable comment creation — the DIC_… id (see SETUP §3).
	 *  Empty falls back to name-only resolution, which can't create new discussions. */
	categoryId: 'DIC_kwDOS9HQaM4DB_wD',
	mapping: 'pathname',
} as const;

// Per-language facts for the comments UI, one row each: the giscus UI locale
// (widget chrome) and the localized section heading. Add a language = add a row.
const COMMENTS_I18N = {
	'zh-Hans': { locale: 'zh-CN', heading: '评论' },
	ja: { locale: 'ja', heading: 'コメント' },
	en: { locale: 'en', heading: 'Comments' },
} as const;

/** Resolve a post's language to its comments UI locale + heading (falls back to en). */
export function commentsI18n(lang: string | undefined) {
	return COMMENTS_I18N[lang as keyof typeof COMMENTS_I18N] ?? COMMENTS_I18N.en;
}
