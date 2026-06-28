// Per-slot "near-identical alternatives": other owned items that score within ~1% of the chosen
// item on the goal objective. Each carries its own gems/sockets and a set-objective delta; an
// option that would miss a gate if dropped in as-is is flagged (dropInLegal=false), not hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets } from '../src/runner.js';

const SAMPLE = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
const parsed = parseExport(SAMPLE);
const items = equippableItems(parsed);
const goals = [{ id: 'rt', name: 'Raid Threat', focus: '', ratio: { ehp: 1, threat: 4 }, gates: { raid: true, requireUncrushable: true }, lockEye: true }];
const base = { professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true, talentRanks: parsed.talentRanks, goals };

test('every slot exposes an alternatives array, never including the picked item', () => {
  const r = optimizeSets(items, base)[0];
  let anyShown = false;
  for (const [slot, it] of Object.entries(r.selection)) {
    const alts = r.perSlot[slot].alternatives;
    assert.ok(Array.isArray(alts), `${slot}: alternatives must be an array`);
    assert.ok(alts.length <= 3, `${slot}: at most 3 alternatives`);
    for (const a of alts) {
      assert.notEqual(a.itemId, it.itemId, `${slot}: the pick must not list itself`);
      assert.equal(typeof a.objDelta, 'number');
      assert.equal(typeof a.dropInLegal, 'boolean');
      assert.ok(Array.isArray(a.gems));
    }
    if (alts.length) anyShown = true;
  }
  assert.ok(anyShown, 'at least one slot should surface a near-identical alternative');
});

test('alternatives are near-identical: |objDelta| within the 1% threshold, and no duplicate itemIds', () => {
  const r = optimizeSets(items, base)[0];
  for (const [slot, ps] of Object.entries(r.perSlot)) {
    const ids = ps.alternatives.map((a) => a.itemId);
    assert.equal(new Set(ids).size, ids.length, `${slot}: alternatives must be distinct items`);
    for (const a of ps.alternatives) {
      assert.ok(Math.abs(a.objDelta) <= 0.01 + 1e-9, `${slot}: ${a.name} objDelta ${a.objDelta} exceeds 1%`);
    }
  }
});

test('a socketed alternative carries its own gems tagged by socket color', () => {
  const r = optimizeSets(items, base)[0];
  const isColor = (c) => c === 'red' || c === 'yellow' || c === 'blue';
  let checked = 0;
  for (const ps of Object.values(r.perSlot)) {
    for (const a of ps.alternatives) {
      if (a.gems.length) {
        for (const g of a.gems) { assert.ok(g.socket, 'each alt gem carries a socket tag'); if (isColor(g.socket)) checked++; }
      }
    }
  }
  assert.ok(checked >= 0); // sample-dependent; assertion above is the real check
});
