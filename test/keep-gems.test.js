// "Keep existing gems/enchants" — the budget / shared-item build mode. Locked items are used
// as-is (current gems + enchant from the export), never re-gemmed/-enchanted by the solver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets, lockEligible } from '../src/runner.js';
import { professionPerks } from '../src/professions.js';

// The committed TGS9 sample carries baseStats + current gems/enchant, so locking is meaningful.
const SAMPLE = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
const parsed = parseExport(SAMPLE);
const items = equippableItems(parsed);
const goals = [{ id: 'rt', name: 'Raid Threat', focus: '', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true }, lockEye: true }];
const base = { professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true, talentRanks: parsed.talentRanks, goals };

test('keep-all: socketed pieces are locked and report their CURRENT gems, not re-gemmed ones', () => {
  const opt = optimizeSets(items, base)[0];
  const kept = optimizeSets(items, { ...base, keepGemsEnchants: true })[0];

  const chest = kept.selection.chest;
  const ks = kept.perSlot.chest;
  assert.equal(ks.locked, true, 'chest is locked');
  assert.equal(ks.defGemmed, false);
  // The sample chest is socketed with 3x Solid Star of Elune (24033); keep-mode must report those,
  // and must NOT introduce the threat re-gem (Veiled Noble Topaz) the optimizer picks unlocked.
  assert.deepEqual(ks.gems.map((g) => g.id).sort(), [...chest.gems].sort());
  assert.ok(ks.gems.every((g) => g.name && !/^Gem /.test(g.name)), 'current gems resolved to names');
  assert.ok(!ks.gems.some((g) => g.name === 'Veiled Noble Topaz'), 'no threat re-gem when locked');
  assert.ok(opt.perSlot.chest.gems.some((g) => g.name === 'Veiled Noble Topaz'), 'unlocked DOES re-gem (control)');
  // Keeping current (stamina) gems instead of threat re-gems trades spell power for stamina.
  assert.ok(kept.agg.spellPower < opt.agg.spellPower, 'keep-mode forgoes the threat re-gem');
  assert.ok(kept.agg.stamina > opt.agg.stamina, 'keep-mode keeps the stamina gems');
});

test('keep-all: no double-count — set spell power equals a plain aggregate of resolved item stats', () => {
  const kept = optimizeSets(items, { ...base, keepGemsEnchants: true })[0];
  // Spell power is pure gear sum (no buff multiplier), so the locked delta + base must reconstruct
  // each item's resolved stats exactly: the set total equals summing the picked items' own stats.
  const sumResolved = Object.values(kept.selection).reduce((t, it) => t + (it.stats.spellDamage || 0), 0);
  assert.equal(Math.round(kept.agg.spellPower), sumResolved);
});

test('lock eligibility: empty sockets or a missing enchant make an item NOT lockable', () => {
  const perks = professionPerks(['Enchanting']);
  // fully gemmed (3/3) + enchanted chest -> eligible
  assert.equal(lockEligible({ slot: 'chest', sockets: { red: 1, yellow: 1, blue: 1 }, gems: [1, 2, 3], enchantId: 2661 }, { perks }), true);
  // one empty socket -> not eligible (let the solver gem it)
  assert.equal(lockEligible({ slot: 'chest', sockets: { red: 1, yellow: 1, blue: 1 }, gems: [1, 2], enchantId: 2661 }, { perks }), false);
  // socketed but un-enchanted, and chest IS enchantable -> not eligible
  assert.equal(lockEligible({ slot: 'chest', sockets: { red: 1 }, gems: [1], enchantId: 0 }, { perks }), false);
  // no sockets and a slot that takes no enchant (relic) -> eligible even with no enchant
  assert.equal(lockEligible({ slot: 'relic', sockets: {}, gems: [], enchantId: 0 }, { perks }), true);
});

test('keep-all skips an item with empty sockets (it gets optimized, not kept)', () => {
  // Find an equipped, socketed item the optimizer is likely to pick, and blank one of its gems so
  // it reads as having an empty socket; under keep-all it must NOT be locked.
  const local = equippableItems(parseExport(SAMPLE));
  const chest = local.find((i) => i.slot === 'chest' && i.equipped && (i.gems || []).length);
  chest.gems = chest.gems.slice(0, -1); // drop one gem -> an empty socket remains
  const r = optimizeSets(local, { ...base, keepGemsEnchants: true })[0];
  if (r.selection.chest === chest) assert.equal(r.perSlot.chest.locked, false);
  assert.equal(lockEligible(chest, { perks: professionPerks(['Enchanting']) }), false);
});

test('per-item lock: only the named item is kept; the rest still optimize', () => {
  const chestId = parsed.items.find((i) => i.slot === 'chest' && i.equipped).itemId;
  const r = optimizeSets(items, { ...base, keepGemsEnchants: [chestId] })[0];
  assert.equal(r.perSlot.chest.locked, true, 'named chest is locked');
  // A different socketed slot (head) is free to be re-gemmed, so it is not flagged locked.
  if (r.selection.head) assert.equal(r.perSlot.head.locked, false, 'head still optimizes');
});

test('scope equippedOnly: a completed BAG item is not locked (only worn items lock)', () => {
  const local = equippableItems(parseExport(SAMPLE));
  const bagDone = local.find((i) => !i.equipped && (i.gems || []).length
    && lockEligible(i, { perks: professionPerks(['Enchanting']) }));
  if (!bagDone) return; // no completed bag item in the sample -> nothing to assert
  // Force its slot to contain only this item so the optimizer must select it, then lock equipped-only.
  const pool = [bagDone, ...local.filter((i) => i.slot !== bagDone.slot)];
  const r = optimizeSets(pool, { ...base, keepGemsEnchants: { equippedOnly: true } })[0];
  assert.equal(r.perSlot[bagDone.slot].locked, false, 'bag item not locked under equippedOnly');
});

test('scope ignoreCompleteness: "current set as-is" locks an equipped item with an empty socket', () => {
  const local = equippableItems(parseExport(SAMPLE));
  const chest = local.find((i) => i.slot === 'chest' && i.equipped && (i.gems || []).length);
  chest.gems = chest.gems.slice(0, -1); // make it incomplete (empty socket)
  // Completed-only equipped scope: incomplete chest is NOT locked.
  const completed = optimizeSets(local, { ...base, keepGemsEnchants: { equippedOnly: true } })[0];
  if (completed.selection.chest === chest) assert.equal(completed.perSlot.chest.locked, false);
  // As-is equipped scope: the same incomplete chest IS locked (frozen as worn).
  const asis = optimizeSets(local, { ...base, keepGemsEnchants: { equippedOnly: true, ignoreCompleteness: true } })[0];
  if (asis.selection.chest === chest) assert.equal(asis.perSlot.chest.locked, true);
});
