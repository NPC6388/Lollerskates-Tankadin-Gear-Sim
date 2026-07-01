#!/usr/bin/env node
// Cache-busting stamper. GitHub Pages serves our assets with no version query, so a normal browser
// reload keeps serving cached copies after a deploy. This stamps content hashes so a file's URL changes
// exactly when its bytes change:
//   1. The entry assets loaded straight from index.html — web/app.js (<script src>) and web/style.css
//      (<link href>) — get a `?v=<hash>` rewritten on their URL.
//   2. Every ES MODULE that app.js pulls in (web/ + src/, transitively) is listed in an <importmap>
//      with a `?v=<hash>` URL. The browser resolves app.js's bare relative imports (e.g. '../src/
//      runner.js') through this map, so an engine change under src/ busts its cache deterministically —
//      WITHOUT rewriting the import statements in the source (index.html is the only file that changes).
// The import map lives between the `<!-- importmap:start -->` / `<!-- importmap:end -->` markers in
// index.html. Run via `npm run stamp`; the pre-commit hook (scripts/githooks/pre-commit) runs it and
// re-stages index.html.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, posix } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
const entryAssets = ['web/app.js', 'web/style.css']; // loaded directly by index.html (not via the map)
const moduleEntry = 'web/app.js'; // graph root for the import map crawl

const hash = (absPath) => createHash('sha256').update(readFileSync(absPath)).digest('hex').slice(0, 8);
// Repo-relative POSIX path (forward slashes) — matches how the browser normalizes import-map URLs.
const rel = (absPath) => relative(root, absPath).split(/[\\/]/).join('/');

// Every relative module specifier a file imports: `… from '…'` (static import / re-export),
// `import('…')` (dynamic), and `import '…'` (side-effect). Restricting to ./ ../ specifiers keeps
// stray strings out. Our source is single-line ES imports, so simple global patterns suffice.
const IMPORT_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
];
function importsOf(absPath) {
  const src = readFileSync(absPath, 'utf8');
  const specs = [];
  for (const re of IMPORT_RES) for (const m of src.matchAll(re)) {
    if (m[1].startsWith('./') || m[1].startsWith('../')) specs.push(m[1]);
  }
  return specs;
}

// Crawl the module graph from the entry, collecting every reachable module (absolute paths).
function crawl(entryAbs) {
  const seen = new Set();
  const stack = [entryAbs];
  while (stack.length) {
    const abs = stack.pop();
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!existsSync(abs)) throw new Error(`stamp: import target not found: ${rel(abs)}`);
    for (const spec of importsOf(abs)) stack.push(resolve(dirname(abs), spec));
  }
  return seen;
}

let html = readFileSync(htmlPath, 'utf8');
let changed = false;

// 1) Entry assets: rewrite `?v=` on their href/src in index.html.
for (const relPath of entryAssets) {
  const v = hash(join(root, relPath));
  const re = new RegExp(`(["'])${relPath.replace(/[.]/g, '\\$&')}(?:\\?v=[0-9a-f]+)?\\1`, 'g');
  const next = html.replace(re, `$1${relPath}?v=${v}$1`);
  if (next !== html) { html = next; changed = true; }
}

// 2) Import map: content-hash every module reachable from the entry (the entry itself is loaded via its
// <script src> above, so it's excluded — nothing imports it). Keys are document-relative URLs ("./src/
// runner.js") so they match the specifiers app.js resolves against the page.
const modules = [...crawl(join(root, moduleEntry))]
  .map((abs) => rel(abs))
  .filter((r) => r !== moduleEntry)
  .sort(); // stable ordering -> deterministic diffs
const imports = {};
for (const r of modules) imports[`./${r}`] = `./${r}?v=${hash(join(root, r))}`;
const nl = html.includes('\r\n') ? '\r\n' : '\n'; // match index.html's line endings (don't introduce mixed)
const mapJson = JSON.stringify({ imports }, null, 2).replace(/\n/g, `${nl}  `); // indent inside the <script>
const mapBlock = [
  '<!-- importmap:start -->',
  '  <script type="importmap">',
  `  ${mapJson}`,
  '  </script>',
  '  <!-- importmap:end -->',
].join(nl);
const mapRe = /<!-- importmap:start -->[\s\S]*?<!-- importmap:end -->/;
if (!mapRe.test(html)) throw new Error('stamp: importmap markers not found in index.html');
const nextHtml = html.replace(mapRe, mapBlock);
if (nextHtml !== html) { html = nextHtml; changed = true; }

if (changed) {
  writeFileSync(htmlPath, html);
  console.log(`stamped index.html (${modules.length} modules mapped + entry assets)`);
} else {
  console.log('index.html asset hashes already current');
}
