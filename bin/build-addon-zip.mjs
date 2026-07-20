#!/usr/bin/env node
// Build addon/TankadinGearSim-v<version>.zip DETERMINISTICALLY from addon/TankadinGearSim/, so the
// website's "Download the addon" link (which serves the COMMITTED zip via GitHub Pages) always ships
// the latest addon files. Determinism (fixed timestamps + sorted entries) lets CI run this and `git
// diff --exit-code` the zip to catch a stale commit — the same guard the generated Lua/fixtures use.
//
// The filename carries the ## Version from the .toc so a downloaded zip is self-identifying (users
// paste "which version are you on?" from the filename, and a stale browser cache is obvious). That
// makes the name move on every version bump, so this script also retires the previous versioned zip
// and rewrites the site's download links — see rewriteLinks() below.
//
// Pure Node, no deps (the repo stays dependency-free): a hand-written ZIP container + zlib deflate +
// a CRC32 table (zlib.crc32 isn't available on the Node 20 CI runner). Entries live under a
// "TankadinGearSim/" root so it unzips straight into Interface\AddOns\TankadinGearSim\.
import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, join, sep } from 'node:path';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(repo, 'addon/TankadinGearSim');
const addonDir = resolve(repo, 'addon');

// The .toc's ## Version is the single source of truth for the zip's name.
const toc = readFileSync(resolve(srcDir, 'TankadinGearSim.toc'), 'utf8');
const version = (toc.match(/^##\s*Version:\s*(.+)$/m) || [])[1]?.trim();
if (!version) {
  console.error('build-addon-zip: no "## Version:" line in addon/TankadinGearSim/TankadinGearSim.toc');
  process.exit(1);
}
const zipName = `TankadinGearSim-v${version}.zip`;
const outZip = resolve(addonDir, zipName);

// All files under the addon, sorted for a reproducible entry order.
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
const files = walk(srcDir);

// CRC32 (portable; Node 20's zlib has no crc32()).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Fixed DOS date/time (1980-01-01 00:00:00) so identical source -> identical bytes.
const DOS_TIME = 0, DOS_DATE = 0x0021;

const locals = [], centrals = [];
let offset = 0;
// Normalize text files to LF so the archive is byte-identical whether it's built on a Windows working
// tree (CRLF via autocrlf) or the Linux CI runner (LF) — otherwise the CI "diff the zip" guard would
// fail on line endings alone. WoW loads either; the addon is all text.
const TEXT_EXT = new Set(['.lua', '.toc', '.md', '.xml', '.txt']);
function readNormalized(full) {
  const buf = readFileSync(full);
  const ext = full.slice(full.lastIndexOf('.')).toLowerCase();
  if (!TEXT_EXT.has(ext) || !buf.includes(0x0d)) return buf;
  return Buffer.from(buf.toString('binary').replace(/\r\n/g, '\n'), 'binary');
}

for (const full of files) {
  const rel = 'TankadinGearSim/' + relative(srcDir, full).split(sep).join('/');
  const nameBuf = Buffer.from(rel, 'utf8');
  const data = readNormalized(full);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(8, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
  locals.push(lh, nameBuf, comp);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt16LE(DOS_TIME, 12); cd.writeUInt16LE(DOS_DATE, 14);
  cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
  centrals.push(cd, nameBuf);

  offset += lh.length + nameBuf.length + comp.length;
}

const localPart = Buffer.concat(locals);
const centralPart = Buffer.concat(centrals);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralPart.length, 12); eocd.writeUInt32LE(localPart.length, 16);

writeFileSync(outZip, Buffer.concat([localPart, centralPart, eocd]));

// Exactly one addon zip is ever committed: drop the previous version's (and the historical
// unversioned TankadinGearSim.zip) so the repo can't serve a stale download alongside the new one.
for (const name of readdirSync(addonDir)) {
  if (name !== zipName && /^TankadinGearSim(-v.+)?\.zip$/.test(name)) unlinkSync(join(addonDir, name));
}

// The site's download links are static HTML, so point them at the new filename here — otherwise a
// version bump would ship a 404 button. CI re-runs this script and diffs, which catches a miss.
function rewriteLinks(file) {
  const full = resolve(repo, file);
  const before = readFileSync(full, 'utf8');
  const after = before.replace(/addon\/TankadinGearSim(-v[^"']+)?\.zip/g, `addon/${zipName}`);
  if (after !== before) writeFileSync(full, after);
  return after !== before;
}
const relinked = ['index.html'].filter(rewriteLinks);

const kb = (localPart.length + centralPart.length + eocd.length) / 1024;
console.log(`Built addon/${zipName} — ${files.length} files, ${kb.toFixed(1)} KB (deterministic)`);
if (relinked.length) console.log(`Repointed download links in ${relinked.join(', ')}`);
