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

// A uncrushable-REQUIRED goal must never surface a crushable set when a legal uncrushable one is
// reachable. The threat libram (Eternal Rest) scores higher than the block libram (Repentance), so the
// greedy+repair heuristic can keep it and land just short of the crush cap; the recovery in optimizeSets
// must instead return the legal block-libram set. AOE keeps its crush-gate-dropped freedom.
test('uncrushable-required goals stay legal & uncrushable; AOE may be crushable', () => {
  let raw = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
  raw += '\nI:item:32368::::::::70::::::::::|INVTYPE_RELIC|ilvl=110|||Libram of the Eternal Rest';
  const parsed = parseExport(raw);
  const items = equippableItems(parsed);
  const res = optimizeSets(items, {
    professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true,
    talentRanks: parsed.talentRanks,
  });
  for (const r of res) {
    // The encounter presets (Illy/SWP) gate on REDUCED avoidance (Shear ignores miss; Radiance cuts
    // miss+dodge), which can be genuinely unreachable with a given gear set — they're returned flagged
    // illegal rather than dropped. This invariant is about the standard-gate libram recovery, so skip them.
    if (r.goal.enc) continue;
    const requiresUncrush = (r.goal.gates || {}).requireUncrushable !== false;
    if (requiresUncrush) {
      assert.ok(r.evald.uncrushable, `${r.goal.id}: must be uncrushable (got ${r.evald.totalAvoidanceWithHS.toFixed(2)}%)`);
      assert.ok(r.legal, `${r.goal.id}: must be a legal set`);
    }
  }
  // AOE drops the crush gate, so it's allowed to be crushable (and still legal) — sanity that the
  // invariant above isn't trivially passing because every set happens to be uncrushable.
  const aoe = res.find((r) => r.goal.id === 'aoe');
  assert.equal((aoe.goal.gates || {}).requireUncrushable, false);
});
