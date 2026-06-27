// Recommended gems must be tagged with the SOCKET COLOR they belong in. The socket bonus only
// activates when each gem sits in a socket of a color it fits; the export's socket order is
// unreliable (Lua pairs()), so the per-gem socket-color tag is how the player places them correctly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets } from '../src/runner.js';
import { GEMS, FITS } from '../src/gems.js';

const SAMPLE = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
const parsed = parseExport(SAMPLE);
const items = equippableItems(parsed);
const goals = [{ id: 'rt', name: 'Raid Threat', focus: '', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true }, lockEye: true }];
const base = { professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true, talentRanks: parsed.talentRanks, goals };
const gemByName = new Map(GEMS.map((g) => [g.name, g]));
const isColor = (c) => c === 'red' || c === 'yellow' || c === 'blue'; // meta sockets carry socket:'meta'

test('recommended gems are tagged to REAL sockets of their item (no invented sockets)', () => {
  // The socket tag tells the player which physical socket to use. It must map onto sockets the item
  // actually has — never more gems of a color than the item has sockets of that color. (When a bonus
  // is forfeited, a gem may sit in an off-color socket; that's fine — it's still a real socket.)
  const r = optimizeSets(items, base)[0];
  let checked = 0;
  for (const [slot, it] of Object.entries(r.selection)) {
    const have = it.sockets || {};
    const cnt = {};
    for (const g of r.perSlot[slot].gems) if (isColor(g.socket)) { cnt[g.socket] = (cnt[g.socket] || 0) + 1; checked++; }
    for (const [c, n] of Object.entries(cnt)) assert.ok(n <= (have[c] || 0), `${slot}: tagged ${n} ${c}-socket gems but item has ${have[c] || 0}`);
  }
  assert.ok(checked > 0, 'at least one socketed recommendation was checked');
});

test('Justicar Shoulderguards: the two gems map to the yellow and blue sockets (bonus can activate)', () => {
  const r = optimizeSets(items, base)[0];
  const sh = r.selection.shoulder;
  if (!sh || !/Justicar Shoulder/.test(sh.name || '')) return; // sample may pick a different shoulder
  const tagged = r.perSlot.shoulder.gems.filter((g) => isColor(g.socket));
  const colors = tagged.map((g) => g.socket).sort();
  assert.deepEqual(colors, ['blue', 'yellow'], 'one gem per socket color');
  for (const g of tagged) assert.ok(FITS[gemByName.get(g.name).color].includes(g.socket));
});
