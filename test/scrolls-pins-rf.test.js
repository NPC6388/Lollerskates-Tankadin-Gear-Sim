// Three player-requested levers: consumable scrolls (flat stats that feed the gates), pin-an-item
// (force a slot then optimize around it), and Improved Righteous Fury's -6% damage folded into EHP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets } from '../src/runner.js';
import { SCROLLS, scrollStats } from '../src/scrolls.js';
import { aggregate, talentsFromRanks } from '../src/model.js';
import { evaluateSet } from '../src/character.js';
import { ARMOR_CONST } from '../src/constants.js';

const SAMPLE = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
const parsed = parseExport(SAMPLE);
const items = equippableItems(parsed);
const goals = [{ id: 'rt', name: 'Raid Threat', focus: '', ratio: { ehp: 1, threat: 4 }, gates: { raid: true, requireUncrushable: true }, lockEye: true }];
const base = { professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true, talentRanks: parsed.talentRanks, goals };

test('scrollStats: primary scrolls feed buffs, Protection rides flatArmor', () => {
  const s = scrollStats(['agility', 'protection', 'strength']);
  assert.equal(s.buffs.agility, SCROLLS.agility.value);
  assert.equal(s.buffs.strength, SCROLLS.strength.value);
  assert.equal(s.flatArmor, SCROLLS.protection.value);
  assert.equal(s.buffs.armor, undefined); // armor must NOT be a primary buff (would get Toughness mult)
  assert.deepEqual(scrollStats([]), { buffs: {}, flatArmor: 0 });
});

test('flatArmor bypasses the Toughness item-armor multiplier', () => {
  const t = talentsFromRanks({ Toughness: 5 }); // +10% item armor
  const a0 = aggregate([], { talents: t });
  const a1 = aggregate([], { talents: t, flatArmor: 301 });
  assert.equal(Math.round(a1.armor - a0.armor), 301); // exactly +301, not +331
});

test('Scroll of Protection raises a set\'s armor (and EHP)', () => {
  const r0 = optimizeSets(items, base)[0];
  const r1 = optimizeSets(items, { ...base, scrolls: ['protection'] })[0];
  assert.ok(r1.agg.armor > r0.agg.armor, 'protection scroll adds armor');
});

test('Improved Righteous Fury -6% folds into EHP (×1/0.94), gated on talent rank', () => {
  assert.equal(talentsFromRanks({ 'Improved Righteous Fury': 3 }).impRighteousFuryDR, 0.06);
  assert.equal(talentsFromRanks({ 'Improved Righteous Fury': 0 }).impRighteousFuryDR, 0);
  const withRF = aggregate([{ stats: { stamina: 500, armor: 10000 } }], { talents: talentsFromRanks({ 'Improved Righteous Fury': 3 }) });
  const noRF = aggregate([{ stats: { stamina: 500, armor: 10000 } }], { talents: talentsFromRanks({ 'Improved Righteous Fury': 0 }) });
  assert.equal(withRF.damageTakenMult, 0.94);
  const e = evaluateSet(withRF), e0 = evaluateSet(noRF);
  // EHP with RF should be the no-RF EHP divided by 0.94 (same health/armor otherwise).
  assert.ok(Math.abs(e.ehpPhysical - e0.ehpPhysical / 0.94) < 1, 'EHP scaled by 1/0.94');
});

test('pin forces an item into its slot for that goal, optimizing the rest around it', () => {
  // Find a slot with at least two owned candidates, pin the one NOT currently picked, assert it sticks.
  const r0 = optimizeSets(items, base)[0];
  let pinned = null;
  for (const [slot, it] of Object.entries(r0.selection)) {
    if (slot === 'trinket1' || slot === 'trinket2') continue; // trinkets are lock-forced already
    const other = items.find((i) => i.slot === (slot.replace(/[12]$/, '')) && i.itemId !== it.itemId);
    if (other) { pinned = { slot, itemId: other.itemId }; break; }
  }
  assert.ok(pinned, 'sample has a slot with an alternate to pin');
  const r1 = optimizeSets(items, { ...base, pins: { rt: { [pinned.slot]: pinned.itemId } } })[0];
  assert.equal(r1.selection[pinned.slot].itemId, pinned.itemId, 'pinned item is selected');
});
