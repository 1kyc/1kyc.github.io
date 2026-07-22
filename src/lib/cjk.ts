/**
 * True when `text` contains any CJK character — hiragana, katakana, CJK
 * Extension A, CJK Unified Ideographs, compatibility ideographs, and
 * half-width katakana. Used at build time to decide whether a page needs the
 * heavy Noto Serif SC/JP @font-face CSS.
 */
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/;

export function hasCjk(text: string): boolean {
	return CJK.test(text);
}
