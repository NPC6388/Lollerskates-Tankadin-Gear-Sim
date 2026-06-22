// Parity gate: the set evaluator must reproduce the user's original spreadsheet exactly.
// Fixtures are transcribed from real columns of the sheet (screenshot, sheet.png):
// Norms, Block, Heroies, Raid Threat — covering crit-immune/not and uncrushable/not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSet } from '../src/character.js';

const f2 = (x) => Number(x.toFixed(2));
const f3 = (x) => Number(x.toFixed(3));

// Each fixture: the sheet's input cells + the sheet's computed outputs to match.
const COLUMNS = {
  'Norms': {
    in: { defenseSkill: 451, resilienceRating: 69, missPct: 9.04, dodgePct: 10.73, parryPct: 14.04, blockPct: 20.07, hsBlockBonus: 30 },
    out: { critRed: 5.790, raidCritImmune: true, heroicCritImmune: true, avoidWithHS: 83.88, uncrushable: false, crushSurplus: -18.52 },
  },
  'Block': {
    in: { defenseSkill: 490, resilienceRating: 0, missPct: 10.6, dodgePct: 12.93, parryPct: 16.61, blockPct: 40.91, hsBlockBonus: 35.32 },
    out: { critRed: 5.600, raidCritImmune: true, heroicCritImmune: true, avoidWithHS: 116.37, uncrushable: true, crushSurplus: 13.97 },
  },
  'Heroies': {
    in: { defenseSkill: 501, resilienceRating: 0, missPct: 11.04, dodgePct: 16.59, parryPct: 16.04, blockPct: 27.15, hsBlockBonus: 30 },
    out: { critRed: 6.040, raidCritImmune: true, heroicCritImmune: true, avoidWithHS: 100.82, uncrushable: false, crushSurplus: -1.58 },
  },
  'Raid Threat': {
    in: { defenseSkill: 486, resilienceRating: 11, missPct: 10.44, dodgePct: 16.88, parryPct: 16.67, blockPct: 23.12, hsBlockBonus: 35.32 },
    out: { critRed: 5.719, raidCritImmune: true, heroicCritImmune: true, avoidWithHS: 102.43, uncrushable: true, crushSurplus: 0.03 },
  },
};

for (const [name, { in: input, out }] of Object.entries(COLUMNS)) {
  test(`sheet parity: ${name} — crit reduction = ${out.critRed}`, () => {
    assert.equal(f3(evaluateSet(input).critReduction), out.critRed);
  });
  test(`sheet parity: ${name} — raid crit immune = ${out.raidCritImmune}`, () => {
    assert.equal(evaluateSet(input).raidCritImmune, out.raidCritImmune);
  });
  test(`sheet parity: ${name} — total avoidance w/ Holy Shield = ${out.avoidWithHS}`, () => {
    assert.equal(f2(evaluateSet(input).totalAvoidanceWithHS), out.avoidWithHS);
  });
  test(`sheet parity: ${name} — uncrushable = ${out.uncrushable} (surplus ${out.crushSurplus})`, () => {
    const e = evaluateSet(input);
    assert.equal(e.uncrushable, out.uncrushable);
    assert.equal(f2(e.crushSurplus), out.crushSurplus);
  });
}

// A deliberately under-defended set must report NOT crit-immune (the sheet's RaidTest case).
test('sheet parity: under-defended set is not raid crit immune', () => {
  const e = evaluateSet({ defenseSkill: 400, resilienceRating: 0, missPct: 8, dodgePct: 10, parryPct: 12, blockPct: 18 });
  assert.equal(e.raidCritImmune, false); // (400-350)*0.04 = 2.0% < 5.6%
});
