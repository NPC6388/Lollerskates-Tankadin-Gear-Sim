// Per-slot comparison: drop-in swaps against a solved baseline set.
//
// The load-bearing test here is the ROUND TRIP — swapping a slot's own item back in must reproduce
// the baseline's aggregate to the last decimal. That is what proves perSlot.addedStats accounts for
// every gem, enchant, socket bonus and dead meta the solver credited. If it drifts, every delta in
// the Compare tab is quietly wrong, and no other assertion in this file would notice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeSets, GOAL_PRESETS } from '../src/runner.js';
import { compareSlot, candidatesForSlot, evaluateSwap, gatesFor, rebuildAggregate, sortRows, SORT_KEYS, applySwaps } from '../src/compare.js';
import { computeDPS } from '../src/dps.js';

const it_ = (o) => ({ equipped: false, gems: [], enchantId: 0, sockets: {}, baseStats: o.baseStats || o.stats, ...o });

// A pool with a real choice in three slots: a tanky vs a threat trinket, a socketed vs a plain chest,
// and three rings (so the paired-slot distinctness rule has something to exclude).
const ITEMS = [
  it_({ equipped: true, itemId: 29068, slot: 'head', equipLoc: 'INVTYPE_HEAD', name: 'Justicar Faceguard', stats: { stamina: 55, defenseRating: 40, dodgeRating: 25, spellDamage: 18, armor: 1300 } }),
  it_({ equipped: true, itemId: 70010, slot: 'shoulder', equipLoc: 'INVTYPE_SHOULDER', name: 'Pauldrons', stats: { stamina: 30, defenseRating: 24, spellDamage: 16, armor: 800 } }),
  it_({ equipped: true, gems: [30555, 30590], itemId: 29066, slot: 'chest', equipLoc: 'INVTYPE_CHEST', name: 'Justicar Chestguard', stats: { stamina: 60, defenseRating: 45, parryRating: 30, armor: 1500 }, sockets: { red: 1, yellow: 1 }, socketBonus: { stat: 'defenseRating', value: 4 } }),
  it_({ itemId: 70021, slot: 'chest', equipLoc: 'INVTYPE_CHEST', name: 'Threat Chest', stats: { stamina: 28, spellDamage: 52, spellHitRating: 12, armor: 1000 } }),
  it_({ equipped: true, itemId: 70030, slot: 'legs', equipLoc: 'INVTYPE_LEGS', name: 'Legguards', stats: { stamina: 70, defenseRating: 40, dodgeRating: 30, armor: 1400 } }),
  it_({ equipped: true, itemId: 70040, slot: 'hands', equipLoc: 'INVTYPE_HAND', name: 'Handguards', stats: { stamina: 35, defenseRating: 28, armor: 800 } }),
  it_({ equipped: true, itemId: 70050, slot: 'wrist', equipLoc: 'INVTYPE_WRIST', name: 'Bracers', stats: { stamina: 24, defenseRating: 20, spellDamage: 12, armor: 500 } }),
  it_({ equipped: true, itemId: 70060, slot: 'feet', equipLoc: 'INVTYPE_FEET', name: 'Boots', stats: { stamina: 30, dodgeRating: 20, spellDamage: 14, armor: 700 } }),
  it_({ equipped: true, itemId: 70070, slot: 'back', equipLoc: 'INVTYPE_CLOAK', name: 'Cloak', stats: { stamina: 20, dodgeRating: 16, spellDamage: 12, armor: 250 } }),
  it_({ equipped: true, itemId: 70080, slot: 'waist', equipLoc: 'INVTYPE_WAIST', name: 'Belt', stats: { stamina: 34, defenseRating: 24, blockRating: 18, armor: 800 } }),
  it_({ equipped: true, itemId: 70090, slot: 'neck', equipLoc: 'INVTYPE_NECK', name: 'Pendant', stats: { stamina: 18, defenseRating: 16, hitRating: 8 } }),
  it_({ equipped: true, itemId: 70100, slot: 'ring', equipLoc: 'INVTYPE_FINGER', name: 'Ring A', stats: { stamina: 22, defenseRating: 20, dodgeRating: 14 } }),
  it_({ equipped: true, itemId: 70101, slot: 'ring', equipLoc: 'INVTYPE_FINGER', name: 'Ring B', stats: { stamina: 14, spellDamage: 22, resilienceRating: 10 } }),
  it_({ itemId: 70102, slot: 'ring', equipLoc: 'INVTYPE_FINGER', name: 'Ring C', stats: { stamina: 18, parryRating: 18, blockRating: 12 } }),
  it_({ equipped: true, itemId: 29370, slot: 'trinket', equipLoc: 'INVTYPE_TRINKET', name: 'Icon of the Silver Crescent', stats: { spellDamage: 43, spellHitRating: 10 } }),
  it_({ equipped: true, itemId: 70111, slot: 'trinket', equipLoc: 'INVTYPE_TRINKET', name: 'Threat Trinket', stats: { spellDamage: 40, spellCritRating: 22 } }),
  it_({ itemId: 70112, slot: 'trinket', equipLoc: 'INVTYPE_TRINKET', name: 'Defensive Trinket', stats: { defenseRating: 40, resilienceRating: 30, stamina: 40 } }),
  it_({ equipped: true, itemId: 70120, slot: 'weapon', equipLoc: 'INVTYPE_WEAPONMAINHAND', name: 'Mace', stats: { spellDamage: 55, hitRating: 12, stamina: 20 } }),
  it_({ equipped: true, itemId: 70130, slot: 'offhand', equipLoc: 'INVTYPE_SHIELD', name: 'Shield A', stats: { stamina: 50, blockValue: 120, blockRating: 60, defenseRating: 30, armor: 3200 } }),
  it_({ itemId: 70131, slot: 'offhand', equipLoc: 'INVTYPE_SHIELD', name: 'Shield B', stats: { stamina: 30, blockValue: 95, spellDamage: 20, armor: 2900 } }),
  it_({ equipped: true, itemId: 70140, slot: 'relic', equipLoc: 'INVTYPE_RELIC', name: 'Relic', stats: { spellDamage: 35 } }),
];

const OPTS = { professions: [], buff: 'raid', maxPhase: 2, trinketLocks: { icon: 29370, eye: 70111 } };
const solve = () => optimizeSets(ITEMS, OPTS);
const results = solve();
const byId = Object.fromEntries(results.map((r) => [r.goal.id, r]));

// ---- the round trip: the swap accounting must be exact ----------------------------------------
test('per-slot baseStats + addedStats rebuilds the solved aggregate exactly', () => {
  // THE invariant. Every swap is this sum with one slot's two blocks exchanged, so if addedStats
  // misses anything the solver credited — a socket bonus, an enchant, a darkened meta — every delta
  // in the Compare tab is silently wrong and nothing else here would catch it.
  const KEYS = ['health', 'stamina', 'armor', 'spellPower', 'agility', 'strength', 'intellect',
    'blockValue', 'defenseSkill', 'dodgePct', 'parryPct', 'blockPct', 'spellCritRating'];
  for (const r of results) {
    const rebuilt = rebuildAggregate(r);
    for (const k of KEYS) {
      assert.ok(Math.abs(rebuilt[k] - r.agg[k]) < 1e-9,
        `${r.goal.id}: ${k} rebuilt as ${rebuilt[k]}, solver had ${r.agg[k]}`);
    }
  }
});

test('dropping a slot removes exactly that slot, and re-adding it restores the set', () => {
  const r = byId.raid;
  for (const [slot, worn] of Object.entries(r.selection)) {
    if (!worn) continue;
    const without = evaluateSwap(r, slot, null, {});
    assert.ok(without.agg.health <= r.agg.health + 1e-9, `${slot}: dropping a slot must not raise health`);
    assert.equal(without.items.length, r.items.length - 1, `${slot}: exactly one item leaves the set`);
  }
});

test('the baseline row in compareSlot reads exactly 0.00 EHP / 0.00 DPS', () => {
  const r = byId.raid;
  for (const slot of ['chest', 'offhand', 'ring1', 'trinket2']) {
    const cands = candidatesForSlot(ITEMS, slot, r);
    const table = compareSlot(r, slot, cands);
    const self = table.rows.find((row) => row.isBaseline);
    assert.ok(self, `${slot}: the worn item must appear in its own comparison table`);
    assert.equal(self.dEHP, 0, `${slot}: baseline ΔEHP must be exactly zero`);
    assert.equal(self.dDPS, 0, `${slot}: baseline ΔDPS must be exactly zero`);
    assert.equal(self.dHealth, 0);
    assert.equal(self.dCrushAvoid, 0);
  }
});

// ---- deltas point the right way ----------------------------------------------------------------
test('a defensive trinket raises EHP and lowers DPS; a spell-damage trinket does the reverse', () => {
  const r = byId.survival;
  const table = compareSlot(r, 'trinket2', candidatesForSlot(ITEMS, 'trinket2', r));
  const def = table.rows.find((x) => x.itemId === 70112);
  const thr = table.rows.find((x) => x.itemId === 70111 || x.itemId === 29370);
  assert.ok(def, 'the defensive trinket must be offered');
  if (def.isBaseline) return; // already worn on this goal — nothing to prove
  assert.ok(def.dEHP > 0, 'stamina + defense must raise EHP');
  assert.ok(def.dDPS < 0, 'a trinket with no spell damage must lower DPS');
  if (thr && !thr.isBaseline) assert.ok(thr.dSpellPower > def.dSpellPower);
});

test('the spell-damage shield trades EHP for DPS against the block shield', () => {
  const r = byId.raid;
  const table = compareSlot(r, 'offhand', candidatesForSlot(ITEMS, 'offhand', r));
  const a = table.rows.find((x) => x.itemId === 70130);
  const b = table.rows.find((x) => x.itemId === 70131);
  assert.ok(a && b, 'both shields must be offered');
  assert.ok(b.ehp < a.ehp, 'Shield B has less stamina and armor, so less EHP');
  assert.ok(b.dps.total > a.dps.total, 'Shield B carries spell damage, so more DPS');
});

// ---- gates are flagged, not hidden --------------------------------------------------------------
test('a candidate that breaks a gate is still listed, flagged illegal', () => {
  const r = byId.raid;
  const table = compareSlot(r, 'offhand', candidatesForSlot(ITEMS, 'offhand', r));
  assert.equal(table.rows.length, 2, 'both shields listed regardless of legality');
  for (const row of table.rows) {
    assert.equal(typeof row.legal, 'boolean');
    assert.equal(typeof row.gates.uncrit, 'boolean');
    // legal is the AND of the gates this goal actually enforces
    assert.equal(row.legal, row.gates.uncrit && row.gates.uncrush !== false && row.gates.minHp !== false);
  }
});

test('the uncrushable bar is the safety-margined certification target, matching the set card', () => {
  const r = byId.raid;
  const g = gatesFor(r.evald, r.agg, r.goal);
  assert.equal(g.crushNeed, 102.7); // 102.4 cap + the 0.3 ratings-vs-sheet margin
  assert.equal(g.uncrush, g.crushShown + 1e-9 >= g.crushNeed);
});

test('the AOE goal reports no crush gate (trash cannot crush)', () => {
  const g = gatesFor(byId.aoe.evald, byId.aoe.agg, byId.aoe.goal);
  assert.equal(g.uncrush, null);
});

// ---- pool construction --------------------------------------------------------------------------
test('a paired slot never offers the item worn in its partner', () => {
  const r = byId.raid;
  const wornRing2 = r.selection.ring2;
  const cands = candidatesForSlot(ITEMS, 'ring1', r);
  assert.ok(wornRing2, 'the fixture wears two rings');
  assert.ok(!cands.some((c) => c.itemId === wornRing2.itemId), 'ring1 must not offer ring2\'s item');
  assert.ok(cands.length >= 2, 'the other two rings remain available');
});

test('two-handers are excluded — a tank keeps a shield', () => {
  const pool = [...ITEMS, it_({ itemId: 70121, slot: 'weapon', equipLoc: 'INVTYPE_2HWEAPON', name: 'Big Mace', stats: { spellDamage: 95, stamina: 30 } })];
  const cands = candidatesForSlot(pool, 'weapon', byId.raid);
  assert.ok(!cands.some((c) => c.itemId === 70121));
});

// ---- gem mode ------------------------------------------------------------------------------------
test('as-it-sits scores an ungemmed socketed piece below its best-gemmed potential', () => {
  const r = byId.raid;
  const bare = it_({ itemId: 70022, slot: 'chest', equipLoc: 'INVTYPE_CHEST', name: 'Ungemmed Chest', stats: { stamina: 40, defenseRating: 30, spellDamage: 20, armor: 1200 }, sockets: { red: 1, yellow: 1 }, socketBonus: { stat: 'stamina', value: 6 } });
  const best = evaluateSwap(r, 'chest', bare, { gemMode: 'best' });
  const asis = evaluateSwap(r, 'chest', bare, { gemMode: 'asis' });
  assert.ok(best.outfit.gems.length === 2, 'best-gemmed fills both sockets');
  assert.equal(asis.outfit.gems.length, 0, 'as-it-sits leaves the empty sockets empty');
  assert.ok(best.agg.spellPower + best.agg.stamina > asis.agg.spellPower + asis.agg.stamina);
});

// ---- consistency with the rest of the product ---------------------------------------------------
test('the table\'s baseline DPS equals the set card\'s DPS for the same set', () => {
  const r = byId.balanced;
  const table = compareSlot(r, 'head', candidatesForSlot(ITEMS, 'head', r));
  const card = computeDPS(r.agg, { evald: r.evald, items: r.items });
  assert.equal(table.baseDPS, card.total);
});

test('every preset goal can be used as a baseline', () => {
  for (const g of GOAL_PRESETS) {
    const r = byId[g.id];
    assert.ok(r && r.env, `${g.id}: solved sets must carry their solve environment`);
    const table = compareSlot(r, 'neck', candidatesForSlot(ITEMS, 'neck', r));
    assert.ok(table.rows.length >= 1, `${g.id}: neck comparison must produce rows`);
  }
});

// ---- column sorting (the Compare table's clickable headers) --------------------------------------
test('every sortable column orders correctly in both directions, dropping no rows', () => {
  // Synthetic rows rather than a real slot: the fixture pool only yields two candidates per slot
  // (three rings, minus whatever the paired finger holds), which is too thin to prove an ordering.
  const mk = (name, ehp, dps, hp, av, legal) =>
    ({ name, itemId: ehp + dps, dEHP: ehp, dDPS: dps, dHealth: hp, dCrushAvoid: av, legal });
  const rows = [
    mk('Alpha', 500, -12.5, 300, 1.20, true),
    mk('Bravo', -900, 8.25, -400, -0.75, false),
    mk('Delta', 0, 0, 0, 0, true),
    mk('Echo', 1400, 3.5, 800, 0.40, false),
    mk('Foxtrot', -120, 21.0, -50, 2.10, true),
  ];
  const ordered = (list, get) => list.every((_, i) => {
    if (!i) return true;
    const a = get(list[i - 1]), b = get(list[i]);
    return (typeof a === 'string' ? a.localeCompare(b) : a - b) >= 0;
  });
  for (const key of Object.keys(SORT_KEYS)) {
    const get = SORT_KEYS[key];
    const desc = sortRows(rows, key, -1);
    const asc = sortRows(rows, key, 1);
    assert.equal(desc.length, rows.length, `${key}: descending must keep every row`);
    assert.deepEqual(new Set(desc.map((x) => x.name)), new Set(rows.map((x) => x.name)), `${key}: same rows`);
    assert.ok(ordered(desc, get), `${key}: descending order broken`);
    assert.ok(ordered([...asc].reverse(), get), `${key}: ascending order broken`);
  }
  // Spot-check the two that matter most in the UI, so a sign flip can't pass the generic check above.
  assert.deepEqual(sortRows(rows, 'ehp', -1).map((x) => x.name), ['Echo', 'Alpha', 'Delta', 'Foxtrot', 'Bravo']);
  assert.deepEqual(sortRows(rows, 'dps', -1).map((x) => x.name), ['Foxtrot', 'Bravo', 'Echo', 'Delta', 'Alpha']);
});

test('an unknown sort key falls back to DPS rather than throwing', () => {
  const r = byId.raid;
  const rows = compareSlot(r, 'trinket2', candidatesForSlot(ITEMS, 'trinket2', r)).rows;
  assert.deepEqual(sortRows(rows, 'nope', -1).map((x) => x.itemId), sortRows(rows, 'dps', -1).map((x) => x.itemId));
});

test('sortRows never mutates the rows it was handed', () => {
  const r = byId.raid;
  const rows = compareSlot(r, 'trinket2', candidatesForSlot(ITEMS, 'trinket2', r)).rows;
  const before = rows.map((x) => x.itemId);
  sortRows(rows, 'ehp', 1);
  assert.deepEqual(rows.map((x) => x.itemId), before);
});

test('ties break on name ascending in BOTH directions, so equal rows do not reshuffle', () => {
  // Two rows with identical deltas: whichever way the column points, the tie-break stays A-Z, so
  // clicking a header repeatedly can't jitter rows that are genuinely equal.
  const mk = (name, d) => ({ name, itemId: name.length, dEHP: d, dDPS: 0, dHealth: 0, dCrushAvoid: 0, legal: true });
  const rows = [mk('Zed', 5), mk('Abe', 5), mk('Mid', 9)];
  assert.deepEqual(sortRows(rows, 'ehp', -1).map((x) => x.name), ['Mid', 'Abe', 'Zed']);
  assert.deepEqual(sortRows(rows, 'ehp', 1).map((x) => x.name), ['Abe', 'Zed', 'Mid']);
});

test('the gates column sorts passing candidates first', () => {
  const r = byId.raid;
  const rows = compareSlot(r, 'offhand', candidatesForSlot(ITEMS, 'offhand', r)).rows;
  const sorted = sortRows(rows, 'gates', -1);
  const firstFail = sorted.findIndex((x) => !x.legal);
  if (firstFail >= 0) assert.ok(sorted.slice(firstFail).every((x) => !x.legal), 'legal rows must all precede illegal ones');
});

// ---- the working set: many swaps stacked on a baseline -------------------------------------------
test('a working set rebuilds exactly, so it can be handed back in as the next baseline', () => {
  // THE invariant for the fitting room. Each swap is applied to the result of the last, so if
  // addedStats drifted by even one gem the error would compound silently across a session.
  const r = byId.raid;
  const chest = ITEMS.find((i) => i.itemId === 70021);
  const ring = ITEMS.find((i) => i.itemId === 70102);
  const trinket = ITEMS.find((i) => i.itemId === 70112);
  let w = applySwaps(r, { chest }, {});
  w = applySwaps(w, { ring1: ring }, {});
  w = applySwaps(w, { trinket2: trinket }, {});
  const KEYS = ['health', 'stamina', 'armor', 'spellPower', 'agility', 'strength', 'blockValue', 'defenseSkill'];
  const rebuilt = rebuildAggregate(w);
  for (const k of KEYS) {
    assert.ok(Math.abs(rebuilt[k] - w.agg[k]) < 1e-9, `${k}: rebuilt ${rebuilt[k]} vs working ${w.agg[k]}`);
  }
  assert.equal(w.selection.chest.itemId, 70021);
  assert.equal(w.selection.ring1.itemId, 70102);
  assert.equal(w.selection.trinket2.itemId, 70112);
});

test('applying three swaps at once equals applying them one at a time', () => {
  const r = byId.raid;
  const chest = ITEMS.find((i) => i.itemId === 70021);
  const ring = ITEMS.find((i) => i.itemId === 70102);
  const shield = ITEMS.find((i) => i.itemId === 70131);
  const together = applySwaps(r, { chest, ring1: ring, offhand: shield }, {});
  let apart = applySwaps(r, { chest }, {});
  apart = applySwaps(apart, { ring1: ring }, {});
  apart = applySwaps(apart, { offhand: shield }, {});
  for (const k of ['health', 'armor', 'spellPower', 'stamina', 'blockValue']) {
    assert.ok(Math.abs(together.agg[k] - apart.agg[k]) < 1e-9, `${k}: ${together.agg[k]} vs ${apart.agg[k]}`);
  }
  assert.ok(Math.abs(together.dps.total - apart.dps.total) < 1e-9);
});

test('applySwaps with nothing to do returns the baseline unchanged', () => {
  const r = byId.raid;
  const same = applySwaps(r, {}, {});
  assert.equal(same.agg.health, r.agg.health);
  assert.deepEqual(same.swappedSlots, []);
  assert.ok(same.dps.total > 0, 'it still carries a DPS figure for the readout');
});

test('swapping a slot back to its original item restores the original aggregate', () => {
  const r = byId.raid;
  const original = r.selection.offhand;
  const other = ITEMS.find((i) => i.slot === 'offhand' && i.itemId !== original.itemId);
  const away = applySwaps(r, { offhand: other }, { gemMode: 'asis' });
  assert.notEqual(away.agg.armor, r.agg.armor);
  const back = applySwaps(away, { offhand: original }, { gemMode: 'asis' });
  // 'asis' re-adds exactly what the piece carries, so the round trip lands back on the same armor.
  assert.ok(Math.abs(back.agg.armor - r.agg.armor) < 1e-9, `${back.agg.armor} vs ${r.agg.armor}`);
});

test('a working set can be compared against, and its own pieces read as the current ones', () => {
  const r = byId.raid;
  const shield = ITEMS.find((i) => i.itemId === 70131);
  const w = applySwaps(r, { offhand: shield }, {});
  const table = compareSlot(w, 'offhand', candidatesForSlot(ITEMS, 'offhand', w));
  const current = table.rows.find((x) => x.isBaseline);
  assert.ok(current, 'the swapped-in piece is now the current one for that slot');
  assert.equal(current.itemId, 70131);
  assert.equal(current.dEHP, 0, 'and it is what the other rows are measured against');
});

test('emptying a slot removes it from the working set', () => {
  const r = byId.raid;
  const w = applySwaps(r, { trinket2: null }, {});
  assert.ok(!w.selection.trinket2);
  assert.equal(w.items.length, r.items.length - 1);
  assert.ok(w.agg.health <= r.agg.health);
});
