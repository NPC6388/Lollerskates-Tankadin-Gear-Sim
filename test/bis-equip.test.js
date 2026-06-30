// "Equip a BiS item you don't own" (planning aid): the web UI builds a synthetic owned-style item from
// BIS_ITEM_DB, folds it into the optimizer pool, and pins it. These tests exercise that synthetic item
// through the REAL optimizer (the part that can't be eyeballed in a browser): the shape is accepted,
// a pinned virtual item is actually placed, and every BIS_ITEM_DB entry is optimizer-ready.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets } from '../src/runner.js';
import { libramStats } from '../src/librams.js';
import { BIS_ITEM_DB } from '../web/bis-items.js';
import { BIS } from '../web/bis.js';

const SAMPLE = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
const parsed = parseExport(SAMPLE);
const items = equippableItems(parsed);
const ownedIds = new Set(items.map((it) => it.itemId));
const goals = [{ id: 'rt', name: 'Raid Threat', focus: '', ratio: { ehp: 1, threat: 4 }, gates: { raid: true, requireUncrushable: true }, lockEye: true }];
const base = { professions: ['Enchanting'], buff: 'raid', maxPhase: 5, faction: 'Aldor', useImbuedMeta: true, talentRanks: parsed.talentRanks, goals };

// Mirror of app.js buildSyntheticItem (kept in sync by hand — it's tiny).
function synth(id) {
  const d = BIS_ITEM_DB[id];
  const item = { itemId: id, name: d.name, slot: d.slot, stats: { ...d.stats }, baseStats: { ...d.stats }, sockets: d.sockets ? { ...d.sockets } : {}, socketBonus: null, equipped: false, _virtual: true };
  const lib = libramStats(item);
  if (lib) { item.stats = lib; item.baseStats = { ...lib }; }
  return item;
}

test('a pinned, not-owned BiS head item is folded into the pool and placed', () => {
  const id = 30987; // Lightbringer Faceguard (head, sockets) — not in the sample
  assert.equal(ownedIds.has(id), false, 'fixture item should NOT be owned by the sample');
  const it = synth(id);
  assert.equal(it.slot, 'head');
  const pool = items.concat([it]);
  const r = optimizeSets(pool, { ...base, pins: { rt: { head: id } } })[0];
  assert.equal(r.selection.head.itemId, id, 'pinned virtual head item is placed in the head slot');
  assert.ok(r.evald && Number.isFinite(r.evald.ehpPhysical), 'set still evaluates with the virtual item');
});

test('every BIS_ITEM_DB entry builds an optimizer-ready synthetic item (no throw, valid slot/stats)', () => {
  const VALID = new Set(['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring', 'trinket', 'weapon', 'offhand', 'relic']);
  for (const id of Object.keys(BIS_ITEM_DB).map(Number)) {
    const it = synth(id);
    assert.ok(VALID.has(it.slot), `id ${id}: valid slot (${it.slot})`);
    assert.equal(typeof it.stats, 'object');
    for (const [k, v] of Object.entries(it.stats)) assert.ok(Number.isFinite(v), `id ${id}: stat ${k} numeric`);
  }
});

test('BIS_ITEM_DB covers every id referenced in the display lists (web/bis.js)', () => {
  for (const ph of Object.keys(BIS)) {
    for (const list of Object.values(BIS[ph])) {
      for (const e of list) assert.ok(BIS_ITEM_DB[e.id], `phase ${ph}: BIS_ITEM_DB missing id ${e.id} (${e.name})`);
    }
  }
});
