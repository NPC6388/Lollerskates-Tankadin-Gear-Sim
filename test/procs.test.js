// Proc-trinket modeling (src/procs.js) + the re-gem monotonicity guard (src/runner.js).
//
// Both come from the same real-gear investigation: the optimizer was handing back a Raid Threat set
// with LESS spell power than the player already had equipped. Two independent causes —
//   1. Tome of Fiery Redemption exports an EMPTY stat block (its value is a proc), so a set that
//      locked it carried a slot the model scored as zero.
//   2. "Re-gem everything" could score BELOW the gems already in the gear (greedy per-socket picker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { procStats, procNote } from '../src/procs.js';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets, GOAL_PRESETS } from '../src/runner.js';
import { score } from '../src/scoring.js';
import { blendScale } from '../src/weights.js';

test('procStats models known proc trinkets by id or name', () => {
  assert.deepEqual(procStats({ itemId: 30447 }), { spellDamage: 66 });                       // by id
  assert.deepEqual(procStats({ name: 'Tome of Fiery Redemption' }), { spellDamage: 66 });    // by name
  assert.equal(procStats({ itemId: 12345, name: 'Some Other Trinket' }), null);
  assert.match(procNote({ itemId: 30447 }), /uptime/i);
});

// A trinket line with NO stat segment at all — exactly how Tome of Fiery Redemption exports.
const TOME_LINE = 'E:item:30447::::::::70::::::::::|INVTYPE_TRINKET|ilvl=128|||Tome of Fiery Redemption';

test('a statless proc trinket is imported with its modeled value, in stats AND baseStats', () => {
  const [it] = parseExport(['TGS11', 'C:', TOME_LINE].join('\n')).items;
  assert.equal(it.stats.spellDamage, 66, 'resolved stats carry the proc value');
  assert.equal(it.baseStats.spellDamage, 66, 'base carries it too, so re-gemming cannot drop it');
  assert.deepEqual(it.procStats, { spellDamage: 66 });
});

test('the proc value is ADDITIVE — it does not replace real passive stats', () => {
  // Same trinket carrying a real +43 spell damage: the model must report 43 + 66, not 66.
  const line = 'I:item:30447::::::::70::::::::::|INVTYPE_TRINKET|ilvl=128;ITEM_MOD_SPELL_POWER=43'
    + '|ITEM_MOD_SPELL_POWER=43||Tome of Fiery Redemption';
  const [it] = parseExport(['TGS11', 'C:', line].join('\n')).items;
  assert.equal(it.stats.spellDamage, 109);
  assert.equal(it.baseStats.spellDamage, 109);
});

test('a modeled proc trinket is selectable — it outranks a purely passive one for threat', () => {
  // Eye of Magtheridon is +41 passive spell damage; the Tome models at 66. Given a free trinket
  // slot and nothing else to choose, the threat goal must take the Tome.
  const lines = ['TGS11', 'C:', TOME_LINE,
    'I:item:28789::::::::70::::::::::|INVTYPE_TRINKET|ilvl=125;ITEM_MOD_SPELL_POWER=41'
      + '|ITEM_MOD_SPELL_POWER=41||Eye of Magtheridon'];
  const items = equippableItems(parseExport(lines.join('\n')));
  const raid = GOAL_PRESETS.find((g) => g.id === 'raid');
  const r = optimizeSets(items, {
    buff: 'none', trinketLocks: {},
    goals: [{ ...raid, gates: { ...raid.gates, requireUncrushable: false } }],
  })[0];
  const picked = [r.selection.trinket1, r.selection.trinket2].filter(Boolean).map((t) => t.name);
  assert.ok(picked.includes('Tome of Fiery Redemption'),
    `threat set should take the modeled proc trinket, picked: ${picked.join(', ')}`);
});

// The real 17-piece threat set this bug was found on (test/fixtures/threat-set-export.txt), kept as a
// fixture because the regression only shows up under genuine gate pressure: the set sits just over the
// crush cap, so gem choice is load-bearing and the greedy picker overshoots avoidance (103.96% vs a
// 102.7% requirement) while giving up stamina. Synthetic gear with the gate relaxed does NOT reproduce
// it — verified by disabling the guard. Numbers when the guard is off: 5944.6 kept vs 5908.4 re-gemmed.
const REAL_EXPORT = fs.readFileSync(
  new URL('./fixtures/threat-set-export.txt', import.meta.url), 'utf8');

test('re-gemming never returns a set weaker than the gems already in the gear', () => {
  const parsed = parseExport(REAL_EXPORT);
  const items = equippableItems(parsed);
  const raid = GOAL_PRESETS.find((g) => g.id === 'raid');
  // The site/addon default Raid Threat goal: EHP 1 : 4 Threat with an 11.5k raid-buffed HP floor.
  const goal = { ...raid, ratio: { ehp: 1, threat: 4 }, gates: { ...raid.gates, minHealth: 11500 } };
  const objScale = blendScale(goal.ratio);
  const opts = {
    buff: 'raid', professions: ['Enchanting'], talentRanks: parsed.talentRanks,
    goals: [goal], trinketLocks: { icon: 29370, eye: 30447 },
  };

  const kept = optimizeSets(items, {
    ...opts, keepGemsEnchants: { itemIds: items.map((i) => i.itemId), ignoreCompleteness: true },
  })[0];
  const keptScore = score(kept.agg._raw, objScale);

  // Every re-gem configuration must land at or above the as-worn gemming.
  for (const variant of [{ maxPhase: 2, useImbuedMeta: true }, { maxPhase: 2, useImbuedMeta: false }, { useImbuedMeta: true }]) {
    const regem = optimizeSets(items, { ...opts, ...variant })[0];
    const s = score(regem.agg._raw, objScale);
    assert.ok(s >= keptScore - 1e-6,
      `re-gem ${JSON.stringify(variant)} scored ${s.toFixed(2)}, below keeping the current gems (${keptScore.toFixed(2)})`);
  }
});

// --- the equipped set as baseline and floor ------------------------------------------------------
// Same real 17-piece set. With the site/addon default locks (the trinkets it is wearing), the
// optimizer used to return 5906.5 while the worn set — fully feasible under those locks — scored
// 5944.6. A recommendation below the gear you already have is not a recommendation.
test('a solved set never scores below the equipped set it could have kept', () => {
  const parsed = parseExport(REAL_EXPORT);
  const items = equippableItems(parsed);
  const raid = GOAL_PRESETS.find((g) => g.id === 'raid');
  const goal = { ...raid, ratio: { ehp: 1, threat: 4 }, gates: { ...raid.gates, minHealth: 11500 } };
  const objScale = blendScale(goal.ratio);
  const opts = {
    buff: 'raid', professions: ['Enchanting'], talentRanks: parsed.talentRanks,
    maxPhase: 2, useImbuedMeta: true, goals: [goal],
  };
  // The worn set, kept exactly as equipped, is the number to beat.
  const wornIds = new Set(items.filter((i) => i.equipped).map((i) => i.itemId));
  const worn = optimizeSets(items.filter((i) => wornIds.has(i.itemId)), {
    ...opts, trinketLocks: {}, keepGemsEnchants: { itemIds: [...wornIds], ignoreCompleteness: true },
  })[0];
  const wornScore = score(worn.agg._raw, objScale);

  // Locks defaulted to the equipped trinkets — the case that shipped the downgrade (5906.5 vs 5944.6).
  // The guarantee is the SCORE invariant; whether it's met by seeding from the worn set or by the
  // floor swapping it in is an implementation detail, so don't assert which one did it here.
  const locked = optimizeSets(items, { ...opts, trinketLocks: { icon: 29370, eye: 30447 } })[0];
  assert.ok(score(locked.agg._raw, objScale) >= wornScore - 1e-6,
    `locked solve scored ${score(locked.agg._raw, objScale).toFixed(1)} vs equipped ${wornScore.toFixed(1)}`);

  // With the locks freed there IS a genuinely better set, so the floor must NOT fire.
  const freed = optimizeSets(items, { ...opts, trinketLocks: {} })[0];
  assert.ok(score(freed.agg._raw, objScale) > wornScore, 'freed locks should beat the worn set');
  assert.ok(!freed.equippedIsBest, 'a real improvement must not be reported as "already best"');
});

test('when nothing beats the worn set, the result IS the worn set and says so', () => {
  const parsed = parseExport(REAL_EXPORT);
  const items = equippableItems(parsed);
  // Stock Raid Threat preset with the locks defaulting to the trinkets actually being worn.
  const r = optimizeSets(items, {
    buff: 'raid', professions: ['Enchanting'], talentRanks: parsed.talentRanks, maxPhase: 2,
    useImbuedMeta: true, trinketLocks: { icon: 29370, eye: 30447 },
  }).find((x) => x.goal.id === 'raid');
  assert.equal(r.equippedIsBest, true, 'raid goal should report the equipped set as already best');
  const wornIds = new Set(items.filter((i) => i.equipped).map((i) => i.itemId));
  for (const it of Object.values(r.selection)) {
    if (it) assert.ok(wornIds.has(it.itemId), `${it.name} is not part of the equipped set`);
  }
});

test('the equipped floor respects a pin for gear the player is not wearing', () => {
  // Pinning is an explicit choice. Returning the worn set (which lacks the pinned item) would
  // silently discard it — the same class of mistake as the trinket lock that started this.
  // The fixture is equipped-only, so add one unworn cloak to pin (an `I:` line = in bags, not worn).
  const spare = 'I:item:24259::::::::70::::::::::|INVTYPE_CLOAK|ilvl=115;ITEM_MOD_STAMINA_SHORT=25;'
    + 'ITEM_MOD_SPELL_POWER=28|ITEM_MOD_STAMINA_SHORT=25;ITEM_MOD_SPELL_POWER=28||Spare Threat Cloak';
  const parsed = parseExport(REAL_EXPORT.trimEnd() + '\n' + spare + '\n');
  const items = equippableItems(parsed);
  const raid = GOAL_PRESETS.find((g) => g.id === 'raid');
  const goal = { ...raid, ratio: { ehp: 1, threat: 4 }, gates: { ...raid.gates, minHealth: 11500 } };
  const notWorn = items.find((i) => !i.equipped && i.slot === 'back');
  assert.ok(notWorn, 'fixture needs an unworn back piece');
  const r = optimizeSets(items, {
    buff: 'raid', professions: ['Enchanting'], talentRanks: parsed.talentRanks, maxPhase: 2,
    useImbuedMeta: true, goals: [goal], trinketLocks: { icon: 29370, eye: 30447 },
    pins: { raid: { back: notWorn.itemId } },
  })[0];
  assert.ok(!r.equippedIsBest, 'floor must stand down when it would drop a pinned item');
  assert.equal(r.selection.back.itemId, notWorn.itemId, 'the pinned item must survive');
});

// --- the modeled proc must not inflate the DISPLAYED spell power ---------------------------------
// The proc's value is a buff averaged over uptime, not a stat: it is scored for threat but never
// appears on the character sheet. The same fixture player, wearing this exact set, reads 752 SP in
// game (the export's own `C:` line says so) while the addon card claimed 818 — the 66 the model adds
// for the Tome. A card the player cannot reconcile against their own paper doll reads as the sim
// inflating its numbers, so the equivalent is split out exactly the way a libram's already is.
test('the displayed spell power of the worn set matches the in-game character sheet', () => {
  const parsed = parseExport(REAL_EXPORT);
  const items = equippableItems(parsed);
  const sheetSP = Number(REAL_EXPORT.match(/spellPower=(\d+)/)[1]); // what the game reports: 752
  const worn = items.filter((i) => i.equipped);
  assert.ok(worn.some((i) => i.itemId === 30447), 'fixture must have the proc trinket equipped');

  // Solve over the worn set alone, kept exactly as equipped — so the answer IS what they're wearing.
  const r = optimizeSets(worn, {
    buff: 'raid', professions: ['Enchanting'], talentRanks: parsed.talentRanks, trinketLocks: {},
    keepGemsEnchants: { itemIds: worn.map((i) => i.itemId), ignoreCompleteness: true },
  }).find((x) => x.goal.id === 'raid');

  assert.equal(r.agg.spellPowerLiteral, sheetSP, 'displayed SP = the character sheet');
  assert.equal(r.agg.spellPowerEquiv, 66, 'the proc is surfaced separately, not folded in');
  assert.match(r.agg.spellPowerEquivSource, /Tome of Fiery Redemption/, 'and names its source');
  assert.equal(r.agg.spellPower, sheetSP + 66, 'the objective still scores the full value');
});
