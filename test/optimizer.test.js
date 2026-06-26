// Optimizer tests on the illustrative sample pool. Verify the search logic:
// produces a legal (crit-immune + uncrushable) set, the constraint actually binds,
// the fast heuristic matches the exhaustive optimum, and relaxing a gate can't lower
// the achievable objective.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SAMPLE_POOL } from '../src/sample-items.js';
import { optimizeExhaustive, optimizeHeuristic, buildPool } from '../src/optimizer.js';
import { aggregate } from '../src/model.js';
import { evaluateSet } from '../src/character.js';
import { GOAL_SCALES } from '../src/weights.js';

const threatGoal = { objective: 'spellPower', gates: { raid: true, requireUncrushable: true }, hsBlockBonus: 30 };
const survivalGoal = { objective: 'ehp', gates: { raid: true, requireUncrushable: true }, hsBlockBonus: 30 };

test('all-threat set fails the gates (the constraint binds)', () => {
  const allThreat = Object.values(SAMPLE_POOL).map((opts) => opts[0]);
  const e = evaluateSet(aggregate(allThreat, threatGoal));
  assert.equal(e.raidCritImmune, false);
  assert.equal(e.uncrushable, false);
});

test('exhaustive threat set is legal (crit-immune + uncrushable)', () => {
  const best = optimizeExhaustive(SAMPLE_POOL, threatGoal);
  assert.ok(best, 'a legal set should exist');
  assert.equal(best.legal, true);
  assert.equal(best.evald.raidCritImmune, true);
  assert.equal(best.evald.uncrushable, true);
});

test('heuristic matches the exhaustive optimum on the sample pool', () => {
  const ex = optimizeExhaustive(SAMPLE_POOL, threatGoal);
  const he = optimizeHeuristic(SAMPLE_POOL, threatGoal);
  assert.equal(he.legal, true);
  assert.equal(he.objectiveValue, ex.objectiveValue);
});

test('heuristic never beats exhaustive (sanity on optimality)', () => {
  const ex = optimizeExhaustive(SAMPLE_POOL, threatGoal);
  const he = optimizeHeuristic(SAMPLE_POOL, threatGoal);
  assert.ok(he.objectiveValue <= ex.objectiveValue + 1e-9);
});

test('relaxing the uncrushable gate cannot lower achievable threat', () => {
  const strict = optimizeExhaustive(SAMPLE_POOL, threatGoal).objectiveValue;
  const relaxed = optimizeExhaustive(SAMPLE_POOL, {
    ...threatGoal, gates: { raid: true, requireUncrushable: false },
  }).objectiveValue;
  assert.ok(relaxed >= strict - 1e-9);
});

test('survival goal yields more EHP than the threat set, still legal', () => {
  const surv = optimizeExhaustive(SAMPLE_POOL, survivalGoal);
  const threat = optimizeExhaustive(SAMPLE_POOL, threatGoal);
  assert.equal(surv.legal, true);
  assert.equal(surv.evald.uncrushable, true);
  assert.ok(surv.evald.ehpPhysical > threat.evald.ehpPhysical);
});

test('no legal set -> exhaustive returns null (under-defended pool)', () => {
  // A pool with only low-defense threat pieces can never reach 490 defense.
  const weakPool = Object.fromEntries(
    Object.entries(SAMPLE_POOL).map(([slot, opts]) => [slot, [opts[0]]])
  );
  assert.equal(optimizeExhaustive(weakPool, threatGoal), null);
});

// ---- structural rules: buildPool, paired slots, distinctness, locks, 2H ----
const ring = (id, sp) => ({ itemId: id, name: `ring${id}`, slot: 'ring', equipLoc: 'INVTYPE_FINGER', stats: { spellDamage: sp, stamina: 20 } });
const trink = (id, sp) => ({ itemId: id, name: `trk${id}`, slot: 'trinket', equipLoc: 'INVTYPE_TRINKET', stats: { spellDamage: sp } });

test('buildPool expands rings/trinkets into paired slots and flags distinct groups', () => {
  const { pool, distinct } = buildPool([ring(101, 30), ring(102, 20), trink(201, 40), trink(202, 25)]);
  assert.deepEqual(Object.keys(pool).sort(), ['ring1', 'ring2', 'trinket1', 'trinket2']);
  assert.equal(pool.ring1.length, 2);
  assert.deepEqual(distinct.sort(), [['ring1', 'ring2'], ['trinket1', 'trinket2']]);
});

test('buildPool excludes 2H weapons (tank keeps a shield)', () => {
  const oneH = { itemId: 1, slot: 'weapon', equipLoc: 'INVTYPE_WEAPONMAINHAND', stats: { spellDamage: 10 } };
  const twoH = { itemId: 2, slot: 'weapon', equipLoc: 'INVTYPE_2HWEAPON', stats: { spellDamage: 40 } };
  const { pool } = buildPool([oneH, twoH]);
  assert.deepEqual(pool.weapon.map((i) => i.itemId), [1]);
});

test('buildPool lock forces an item into its slot and singularizes the candidates', () => {
  const { pool, locked } = buildPool([trink(201, 40), trink(202, 25)], { lock: { trinket1: 202 } });
  assert.deepEqual(pool.trinket1.map((i) => i.itemId), [202]);
  assert.equal(locked.trinket1.itemId, 202);
});

test('heuristic respects paired-slot distinctness (no duplicate ring)', () => {
  const { pool, distinct } = buildPool([ring(101, 30), ring(102, 20)]);
  const res = optimizeHeuristic(pool, { objective: 'spellPower', gates: {} }, { distinct });
  assert.notEqual(res.selection.ring1.itemId, res.selection.ring2.itemId);
  // best (101) kept in one slot, second-best (102) in the other
  assert.deepEqual([res.selection.ring1.itemId, res.selection.ring2.itemId].sort(), [101, 102]);
});

test('exhaustive never returns a set with duplicated paired items', () => {
  // Exhaustive only returns LEGAL sets, so give the rings enough defense to clear the crit gate;
  // distinctness then forces the two ring slots to hold different items.
  const dRing = (id, sp) => ({ itemId: id, slot: 'ring', equipLoc: 'INVTYPE_FINGER', stats: { spellDamage: sp, defenseRating: 150 } });
  const { pool, distinct } = buildPool([dRing(101, 30), dRing(102, 20)]);
  const best = optimizeExhaustive(pool, { objective: 'spellPower', gates: { raid: true } }, { distinct });
  assert.ok(best && best.legal);
  assert.notEqual(best.selection.ring1.itemId, best.selection.ring2.itemId);
});

test('relaxed crush target cannot lower achievable threat (AOE-trash leniency)', () => {
  const strict = optimizeExhaustive(SAMPLE_POOL, threatGoal).objectiveValue;
  const relaxed = optimizeExhaustive(SAMPLE_POOL, {
    ...threatGoal, gates: { raid: true, requireUncrushable: true, uncrushableTarget: 100 },
  }).objectiveValue;
  assert.ok(relaxed >= strict - 1e-9);
});

test("scale objective ranks by the blended weight scale (survival picks the tank pieces)", () => {
  // The survival ratio scale values stamina/armor over a sliver of spell power, so on a slot
  // with a threat vs tank option the tank piece (more stamina/armor) wins on objective alone.
  const goal = { objective: 'scale', scaleWeights: GOAL_SCALES.survival, gates: {} };
  const pool = { chest: SAMPLE_POOL.chest };
  const res = optimizeHeuristic(pool, goal, {});
  assert.equal(res.selection.chest.name, 'chest (tank)');
});

test('min-HP gate is enforced like crit/crush (binds or marks illegal)', () => {
  // The max-EHP survival set is the highest HP the pool can reach; gate the threat set there.
  const maxH = optimizeHeuristic(SAMPLE_POOL, survivalGoal).agg.health;

  const gated = optimizeHeuristic(SAMPLE_POOL, { ...threatGoal, gates: { ...threatGoal.gates, minHealth: maxH } });
  // The gate is a hard constraint: a legal result NEVER sits below it.
  if (gated.legal) assert.ok(gated.agg.health + 1e-9 >= maxH);

  // An unreachable floor is reported illegal, not silently violated.
  const impossible = optimizeHeuristic(SAMPLE_POOL, { ...threatGoal, gates: { ...threatGoal.gates, minHealth: maxH + 100000 } });
  assert.equal(impossible.legal, false);
  assert.ok(impossible.agg.health < maxH + 100000);
});
