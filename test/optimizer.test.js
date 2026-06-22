// Optimizer tests on the illustrative sample pool. Verify the search logic:
// produces a legal (crit-immune + uncrushable) set, the constraint actually binds,
// the fast heuristic matches the exhaustive optimum, and relaxing a gate can't lower
// the achievable objective.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SAMPLE_POOL } from '../src/sample-items.js';
import { optimizeExhaustive, optimizeHeuristic } from '../src/optimizer.js';
import { aggregate } from '../src/model.js';
import { evaluateSet } from '../src/character.js';

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
