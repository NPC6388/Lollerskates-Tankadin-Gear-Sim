#!/usr/bin/env node
// Cache-busting stamper. GitHub Pages serves web/app.js and web/style.css with no version query, so a
// normal browser reload keeps serving the cached copy after a deploy. This rewrites the `?v=<hash>` on
// those asset URLs in index.html to an 8-char hash of each file's bytes — so the URL changes exactly when
// the file's content changes (and ONLY that file's URL changes). Run via `npm run stamp`; the pre-commit
// hook (scripts/githooks/pre-commit) runs it automatically and re-stages index.html.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
const assets = ['web/app.js', 'web/style.css'];

const hash = (rel) => createHash('sha256').update(readFileSync(join(root, rel))).digest('hex').slice(0, 8);

let html = readFileSync(htmlPath, 'utf8');
let changed = false;
for (const rel of assets) {
  const v = hash(rel);
  // Match the asset path optionally already carrying a ?v=… query, in an href/src attribute.
  const re = new RegExp(`(["'])${rel.replace(/[.]/g, '\\$&')}(?:\\?v=[0-9a-f]+)?\\1`, 'g');
  const next = html.replace(re, `$1${rel}?v=${v}$1`);
  if (next !== html) { html = next; changed = true; }
}

if (changed) {
  writeFileSync(htmlPath, html);
  console.log('stamped index.html with current asset hashes');
} else {
  console.log('index.html asset hashes already current');
}
