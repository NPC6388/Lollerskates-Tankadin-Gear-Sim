// Libram effect modeling (src/librams.js): a libram's value is a special equip effect the tooltip
// parser misses, modeled with stats the scales already use (no pseudo-stat). Eternal Rest's
// +47 Consecration damage is converted to equivalent SPELL DAMAGE; the AOE scale weights spell damage
// higher (Consecration scales per target), so the AOE set takes the Consecration libram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { libramStats } from '../src/librams.js';
import { score } from '../src/scoring.js';
import { SCALES } from '../src/weights.js';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets } from '../src/runner.js';

test('libramStats models known librams by id or name, using only real (SU) stats', () => {
  assert.deepEqual(libramStats({ itemId: 29388 }), { blockRating: 42 });             // Repentance by id
  assert.deepEqual(libramStats({ name: 'Libram of the Eternal Rest' }), { spellDamage: 35 });
  assert.deepEqual(libramStats({ name: 'Libram of Eternal Rest' }), { spellDamage: 35 }); // "the" optional
  assert.equal(libramStats({ itemId: 12345, name: 'Some Other Relic' }), null);
});

test('spell damage is valued higher under AOE threat than single-target', () => {
  const sp = { spellDamage: 49 };
  assert.ok(score(sp, SCALES.threatAOE) > score(sp, SCALES.threatSingleBelowCap),
    'AOE scale weights spell damage above the single-target scale');
});

test('AOE goal picks the Consecration libram over the block libram', () => {
  // The committed sample has Libram of Repentance equipped; inject a Libram of the Eternal Rest so
  // both are in the pool, then confirm the AOE set takes the (spell-damage) Consecration libram.
  let raw = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
  raw += '\nI:item:32368::::::::70::::::::::|INVTYPE_RELIC|ilvl=110|||Libram of the Eternal Rest';
  const parsed = parseExport(raw);
  const items = equippableItems(parsed);
  const byGoal = Object.fromEntries(optimizeSets(items, {
    professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true,
    talentRanks: parsed.talentRanks,
  }).map((r) => [r.goal.id, r.selection.relic && r.selection.relic.name]));

  assert.equal(byGoal.aoe, 'Libram of the Eternal Rest');           // Consecration libram for AOE
  assert.equal(byGoal.survival, 'Libram of Repentance');            // block libram for survival
});
