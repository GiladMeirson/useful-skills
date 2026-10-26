import brand from '../public/brand.json';
import {HEBREW_FONTS, useBundledFont} from './fonts';

// Brand of the video. Colors come from public/brand.json (scripts/brand.py extracts them from a site or repo).
// No scene writes a loose hex: use C.*. The lint warns on colors outside this file.
// Fonts are bundled from @fontsource (see src/fonts.ts), so renders never depend on the network.
// To change fonts set brand.json "fonts.display" / "fonts.mono" to a family listed in src/fonts.ts.
// Hebrew videos: set brand.json "lang": "he" — DIR becomes "rtl" and the display font must support Hebrew.

type Brand = typeof brand & {lang?: string};
const b = brand as Brand;

export const LANG: 'he' | 'en' = b.lang === 'he' ? 'he' : 'en';
export const DIR: 'rtl' | 'ltr' = LANG === 'he' ? 'rtl' : 'ltr';
export const IS_RTL = DIR === 'rtl';

const wantDisplay = b.fonts?.display ?? (IS_RTL ? 'Heebo' : 'Inter');
const display = useBundledFont(IS_RTL && !HEBREW_FONTS.includes(wantDisplay) ? 'Heebo' : wantDisplay);
const mono = useBundledFont(b.fonts?.mono ?? 'JetBrains Mono');
// Hebrew fallback is always registered so mixed Hebrew/English text never drops to a system font.
const hebrewFallback = useBundledFont('Heebo');

export const C = b.colors;
export const BRAND = b;
export const FONT = `"${display}", "${hebrewFallback}", "Helvetica Neue", Arial, sans-serif`;
export const MONO = `"${mono}", "${hebrewFallback}", Menlo, monospace`;

/** Type scale in px for a 1080 short side; multiply by `u` from useFormat(). Hebrew glyphs read smaller: +6%. */
const k = IS_RTL ? 1.06 : 1;
export const type = {hero: 148 * k, title: 96 * k, lead: 64 * k, body: 44 * k, label: 30 * k};

/** Hebrew has no capitals and condensed tracking hurts it: neutralize uppercase + negative letter-spacing. */
export const textCase = (upper: boolean) => (upper && !IS_RTL ? 'uppercase' : 'none') as 'uppercase' | 'none';
export const tracking = (em: number) => `${IS_RTL ? Math.max(em, 0) : em}em`;

/** Number formatting locale for charts and counters. */
export const LOCALE = LANG === 'he' ? 'he-IL' : 'en-US';
