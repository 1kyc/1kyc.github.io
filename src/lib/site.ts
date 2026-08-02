// Site identity — facts about WHERE this site lives, for anything that links to
// it or names it. Feature config stays with its feature (lib/giscus.ts owns the
// comment widget's settings), but the repo slug itself lives here: /about's
// "Source" link, the privacy page's contact links, and the giscus widget must
// all name the SAME repository, and three copies of that string is three
// chances to drift.
//
// The canonical ORIGIN (https://1kyc.github.io) is deliberately NOT here — it's
// `site` in astro.config.mjs, reachable as Astro.site / context.site.

/** owner/name, exactly as GitHub spells it. */
export const REPO = '1kyc.github.io';
export const OWNER = '1kyc';
export const REPO_SLUG = `${OWNER}/${REPO}`;

export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const DISCUSSIONS_URL = `${REPO_URL}/discussions`;

// The repo is dual-licensed — MIT for the code that builds the site, CC BY 4.0
// for the posts, since MIT's "the Software" grants don't map onto prose. Both
// files live at the repo root; /about links each so a reader can tell which one
// covers the thing they're looking at (see README's License table).
export const CODE_LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const CONTENT_LICENSE_URL = `${REPO_URL}/blob/main/LICENSE-CONTENT`;
