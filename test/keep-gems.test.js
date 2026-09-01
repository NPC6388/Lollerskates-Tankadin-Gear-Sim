// "Keep existing gems/enchants" — the budget / shared-item build mode. Locked items are used
// as-is (current gems + enchant from the export), never re-gemmed/-enchanted by the solver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets, lockEligible } from '../src/runner.js';
import { professionPerks } from '../src/professions.js';
import { score } from '../src/scoring.js';
import { blendScale } from '../src/weights.js';

// The committed TGS9 sample carries baseStats + current gems/enchant, so locking is meaningful.
const SAMPLE = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
// The real 17-piece, fully-gemmed threat set (same fixture procs.test.js uses): the re-gem-vs-kept
// invariant only has teeth on gear whose existing gems are actually good.
const REAL_EXPORT = fs.readFileSync(fileURLToPath(new URL('./fixtures/threat-set-export.txt', import.meta.url)), 'utf8');
const parsed = parseExport(SAMPLE);
const items = equippableItems(parsed);
const goals = [{ id: 'rt', name: 'Raid Threat', focus: '', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true }, lockEye: true }];
const base = { professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: 'Aldor', useImbuedMeta: true, talentRanks: parsed.talentRanks, goals };

test('keep-all: socketed pieces are locked and report their CURRENT gems, not re-gemmed ones', () => {
  const opt = optimizeSets(items, base)[0];
  const kept = optimizeSets(items, { ...base, keepGemsEnchants: true })[0];

  // Every kept (locked) socketed slot must report the item's CURRENT gems verbatim (resolved to
  // names), never a re-gem — sample-agnostic: don't assume which gems the worn pieces happen to use.
  let checked = 0;
  for (const [slot, it] of Object.entries(kept.selection)) {
    const ks = kept.perSlot[slot];
    if (!it || !ks.locked || !(it.gems || []).length) continue;
    assert.equal(ks.defGemmed, false, `${slot}: a locked item isn't def-gemmed`);
    assert.deepEqual(ks.gems.map((g) => g.id).sort(), [...it.gems].sort(), `${slot}: reports the worn gem ids`);
    assert.ok(ks.gems.every((g) => g.name && !/^Gem /.test(g.name)), `${slot}: gems resolved to names`);
    checked++;
  }
  assert.ok(checked > 0, 'at least one kept socketed slot was verified');

  // Control: with everything re-gemmable, the unlocked run DOES introduce the threat re-gem somewhere
  // (Veiled Noble Topaz), proving keep-mode actually suppresses re-gemming rather than no-op-ing.
  const reGems = Object.values(opt.perSlot).some((ps) => (ps.gems || []).some((g) => g.name === 'Veiled Noble Topaz'));
  assert.ok(reGems, 'unlocked run re-gems with the threat gem (control)');
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

test('lock conditions count leg armor (spellthread) as the leg enchant', () => {
  const perks = professionPerks(['Enchanting']);
  // Leg armor is applied via the item's enchant slot (Runic Spellthread = 2748, Nethercleft = 3013),
  // so it's checked like any other slot enchant: a leg with it + its socket filled is complete...
  assert.equal(lockEligible({ slot: 'legs', sockets: { yellow: 1 }, gems: [1], enchantId: 2748 }, { perks }), true);
  assert.equal(lockEligible({ slot: 'legs', sockets: {}, gems: [], enchantId: 3013 }, { perks }), true);
  // ...and a leg WITHOUT leg armor is incomplete, so the solver adds it rather than locking the piece.
  assert.equal(lockEligible({ slot: 'legs', sockets: { yellow: 1 }, gems: [1], enchantId: 0 }, { perks }), false);
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

test('scope + explicit item-ids OR-combine (lock equipped AND a named bag item)', () => {
  const local = equippableItems(parseExport(SAMPLE));
  const bag = local.find((i) => !i.equipped && (i.gems || []).length
    && lockEligible(i, { perks: professionPerks(['Enchanting']) }));
  if (!bag) return;
  const pool = [bag, ...local.filter((i) => i.slot !== bag.slot)]; // force the bag item into its slot
  const r = optimizeSets(pool, { ...base, keepGemsEnchants: { equippedOnly: true, itemIds: [bag.itemId] } })[0];
  assert.equal(r.perSlot[bag.slot].locked, true, 'named bag item locks via OR even though not equipped');
});

test('a kept (locked) meta is flagged active/inactive in the readout', () => {
  const r = optimizeSets(items, { ...base, keepGemsEnchants: { equippedOnly: true } })[0];
  // The equipped head carries the meta socket; locked, its meta is kept — it must report an explicit
  // active flag so a dark meta surfaces (instead of being silently ignored).
  const headMeta = (r.perSlot.head && r.perSlot.head.metas || []).find((m) => m.kept);
  if (r.perSlot.head && r.perSlot.head.locked && headMeta) assert.equal(typeof headMeta.active, 'boolean');
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

// --- re-gem mode must never be worse than keeping your gems ---------------------------------------
// Found by explaining a site-vs-addon disagreement: the addon never re-gems, the site defaults to
// "re-gem everything", and on one goal the re-gem answer scored BELOW the same solve with the gems
// kept. Keeping what is already socketed is attainable by definition — you are wearing it — so any
// set reachable with gems kept is also reachable when re-gemming is merely ALLOWED. "Re-gem
// everything" therefore has to be an improvement operator over "keep them", never a coin flip.
test('re-gemming never returns a set below the same solve with gems kept, on any goal', () => {
  const parsed = parseExport(REAL_EXPORT);
  const items = equippableItems(parsed);
  const opts = { buff: 'raid', professions: ['Enchanting'], talentRanks: parsed.talentRanks,
    maxPhase: 2, useImbuedMeta: true, trinketLocks: { icon: 29370, eye: 30447 } };
  const kept = optimizeSets(items, {
    ...opts, keepGemsEnchants: { itemIds: items.map((i) => i.itemId), ignoreCompleteness: true },
  });
  const regem = optimizeSets(items, opts);
  const keptById = Object.fromEntries(kept.map((r) => [r.goal.id, r]));

  for (const r of regem) {
    const k = keptById[r.goal.id];
    // Only comparable when BOTH clear the gates: between two flagged best-effort sets (a gate the
    // gear cannot reach at all) the objective ranking carries no meaning.
    if (!r.legal || !k.legal) continue;
    const objScale = blendScale(r.goal.ratio);
    const a = score(r.agg._raw, objScale), b = score(k.agg._raw, objScale);
    assert.ok(a + 1e-9 >= b,
      `${r.goal.name}: re-gem scored ${a.toFixed(2)} vs ${b.toFixed(2)} with gems kept`);
  }
});

test('re-gem mode may keep an individual piece\'s gems when they beat re-gemming it', () => {
  // The as-worn configuration is a per-ITEM option, not just an all-or-nothing fallback: a set that
  // re-gems some slots and leaves others alone is legitimate, and is what a well-gemmed character
  // should get. Such pieces come back tagged like any other kept item, so the UI says "Kept".
  const parsed = parseExport(REAL_EXPORT);
  const items = equippableItems(parsed);
  const r = optimizeSets(items, { buff: 'raid', professions: ['Enchanting'],
    talentRanks: parsed.talentRanks, maxPhase: 2, useImbuedMeta: true,
    trinketLocks: { icon: 29370, eye: 30447 } }).find((x) => x.goal.id === 'raid');
  const keptPieces = Object.values(r.selection).filter((it) => it && it._gem === 'locked');
  assert.ok(keptPieces.length > 0, 'a fully-gemmed threat set should keep at least one piece as worn');
});

// --- ...and it must not collapse INTO "keep them" either --------------------------------------------
// The mirror of the invariant above, and the bug it caused. The as-is floor substitutes the fully-kept
// set for ANY illegal answer, and the greedy solve routinely lands in the crush-certification dead zone
// (past the raw 102.4 cap, short of cap+margin) — a stall the dead-zone recovery repairs. With the
// recovery running AFTER the floor it never saw those answers: the floor had already swapped in the
// as-is set, so "re-gem everything" handed back all 17 pieces exactly as worn and looked like it was
// ignoring the setting. Order matters, so pin it: on this fixture a strictly better legal set exists,
// and re-gem mode must find it rather than fall back to the gems already in the gear.
test('a dead-zone stall is repaired, not silently answered with the as-is set', () => {
  const parsed = parseExport(REAL_EXPORT);
  const items = equippableItems(parsed);
  const opts = { buff: 'raid', professions: ['Enchanting'], talentRanks: parsed.talentRanks,
    maxPhase: 2, useImbuedMeta: true, trinketLocks: { icon: 29370, eye: 30447 } };
  const asIs = optimizeSets(items, {
    ...opts, keepGemsEnchants: { itemIds: items.map((i) => i.itemId), ignoreCompleteness: true },
  }).find((x) => x.goal.id === 'raid');
  const r = optimizeSets(items, opts).find((x) => x.goal.id === 'raid');
  const objScale = blendScale(r.goal.ratio);

  assert.ok(r.legal, 'the raid answer should be legal, not a flagged dead-zone near-miss');
  assert.ok(score(r.agg._raw, objScale) > score(asIs.agg._raw, objScale) + 1e-9,
    `re-gem scored ${score(r.agg._raw, objScale).toFixed(2)} vs ${score(asIs.agg._raw, objScale).toFixed(2)} as-is`);
  const picks = Object.values(r.selection).filter(Boolean);
  const kept = picks.filter((it) => it._gem === 'locked');
  assert.ok(kept.length < picks.length,
    'every single piece came back as-worn — re-gem mode fell back to the kept set');
});
