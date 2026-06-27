// Libram effect modeling: a libram's value is a special equip effect the tooltip parser misses, so
// it's modeled via src/librams.js. Key case: the Consecration libram (Eternal Rest) should win the
// AOE goal — Consecration hits every target — while the block libram (Repentance) wins single-target
// / survival, where Holy Shield stays up so its conditional block bonus is live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { libramStats } from '../src/librams.js';
import { score } from '../src/scoring.js';
import { SCALES } from '../src/weights.js';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets } from '../src/runner.js';

test('libramStats models known librams by id or name', () => {
  assert.deepEqual(libramStats({ itemId: 29388 }), { blockRating: 42 });            // Repentance by id
  assert.deepEqual(libramStats({ name: 'Libram of the Eternal Rest' }), { consecrationDamage: 47 });
  assert.deepEqual(libramStats({ name: 'Libram of Eternal Rest' }), { consecrationDamage: 47 }); // "the" optional
  assert.equal(libramStats({ itemId: 12345, name: 'Some Other Relic' }), null);
});

test('Consecration damage is valued far higher under AOE threat than single-target', () => {
  const consec = { consecrationDamage: 47 };
  assert.ok(score(consec, SCALES.threatAOE) > 3 * score(consec, SCALES.threatSingleBelowCap),
    'AOE scale should value Consecration damage several times more than the single-target scale');
});

test('AOE goal picks the Consecration libram; single-target/survival keep the block libram', () => {
  // The committed sample has Libram of Repentance equipped; inject a Libram of the Eternal Rest so
  // both are in the pool, then confirm the per-goal relic choice splits as expected.
  let raw = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
  raw += '\nI:item:32368::::::::70::::::::::|INVTYPE_RELIC|ilvl=110|||Libram of the Eternal Rest';
  const parsed = parseExport(raw);
  const items = equippableItems(parsed);
  const byGoal = Object.fromEntries(optimizeSets(items, {
    professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true,
    talentRanks: parsed.talentRanks,
  }).map((r) => [r.goal.id, r.selection.relic && r.selection.relic.name]));

  assert.equal(byGoal.aoe, 'Libram of the Eternal Rest');
  assert.equal(byGoal.raid, 'Libram of Repentance');
  assert.equal(byGoal.survival, 'Libram of Repentance');
});
