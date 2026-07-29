/* Bundle site/ into a single self-contained index.html at the repo root.
 *
 * The source lives split across site/css/*.css and site/js/**\/*.js so it stays
 * readable and editable. The published page has to be one file: GitHub Pages is
 * happy either way, but a Claude Artifact is served as a single document with a
 * strict CSP that will not resolve sibling files, so <link> and <script src>
 * would silently render an unstyled, dead page.
 *
 * Run: node build-site.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'site');
const OUT = join(here, 'index.html');

const read = (p) => readFileSync(p, 'utf8');

let html = read(join(SRC, 'index.html'));

// Inline <link rel="stylesheet" href="..."> in document order.
html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)"\s*\/?>\r?\n?/g, (m, href) => {
  const file = join(SRC, href);
  if (!existsSync(file)) throw new Error(`missing stylesheet: ${href}`);
  return `<style>\n/* ---- ${href} ---- */\n${read(file).trim()}\n</style>\n`;
});

// Inline <script src="...">
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\r?\n?/g, (m, src) => {
  const file = join(SRC, src);
  if (!existsSync(file)) throw new Error(`missing script: ${src}`);
  return `<script>\n/* ---- ${src} ---- */\n${read(file).trim()}\n</script>\n`;
});

if (/<link rel="stylesheet"|<script src=/.test(html)) {
  throw new Error('build left an external reference behind — the bundle would break under CSP');
}

const banner = `<!--\n  GENERATED FILE — do not edit.\n` +
  `  Source lives in site/ (site/index.html, site/css/*, site/js/*).\n` +
  `  Rebuild with:  node build-site.mjs\n-->\n`;

html = html.replace(/^<!doctype html>\r?\n/i, `<!doctype html>\n${banner}`);

writeFileSync(OUT, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`built ${resolve(OUT)}  (${kb} kB, single file)`);
