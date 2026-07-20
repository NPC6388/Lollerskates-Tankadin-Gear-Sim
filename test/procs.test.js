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
