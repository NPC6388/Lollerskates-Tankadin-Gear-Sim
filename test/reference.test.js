// M1 validation gate: the core engine must reproduce the guide's published numbers
// for the 709 SP raid-buffed reference profile. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REFERENCE_PROFILE as P, RAID_BUFFED as B } from './reference-profile.js';
import {
  consecrationPerCast, consecrationTPS,
  holyShieldPerBlock, holyShieldTPS,
  avengersShieldPerTarget,
  judgementOfBloodPerCast,
  judgementOfRighteousnessPerCast, judgementOfRighteousnessTPS,
  judgementOfCorruptionTPS,
  sealOfRighteousnessTPS, sealOfCorruptionTPS,
  blessingOfSanctuaryTPS,
} from '../src/threat.js';
import {
  missChance, critReduction, isUncrittable,
  combinedAvoidance, isUncrushable,
  resistanceMitigation, resistanceTargets, armorDR,
} from '../src/combat.js';
import { CAPS } from '../src/constants.js';
import { scoreByScale } from '../src/scoring.js';

const round = (x) => Math.round(x);

// ---- Threat: worked example, per cast/block at 709 SP (guide index.html:975-979) ----
test('Consecration per cast = 2320 threat @709 SP', () => {
  assert.equal(round(consecrationPerCast(B.spellDamage)), 2320);
});
test('Holy Shield per block = 468 threat @709 SP (+4pc, Imp HS)', () => {
  assert.equal(round(holyShieldPerBlock(B.spellDamage)), 468);
});
test("Avenger's Shield per target = 1291 threat @709 SP, 11% spell crit", () => {
  assert.equal(round(avengersShieldPerTarget(B.spellDamage, B.spellCritPct)), 1291);
});
test('Judgement of Blood = 1279 threat @709 SP, 9.5% melee crit', () => {
  assert.equal(round(judgementOfBloodPerCast(B.spellDamage, B.meleeCritPct)), 1279);
});
test('Judgement of Righteousness = 1452 threat @709 SP, 11% spell crit', () => {
  assert.equal(round(judgementOfRighteousnessPerCast(B.spellDamage, B.spellCritPct)), 1452);
});

// ---- Threat: steady-state TPS at 709 SP (guide per-ability table + seal charts) ----
test('Consecration TPS = 290 @709 SP', () => {
  assert.equal(round(consecrationTPS(B.spellDamage)), 290);
});
test('Holy Shield TPS = 176 @709 SP (~3 blocks/8s)', () => {
  assert.equal(round(holyShieldTPS(B.spellDamage)), 176);
});
test('Seal of Righteousness active TPS = 188 @709 SP / 1.8 speed', () => {
  assert.equal(round(sealOfRighteousnessTPS(B.spellDamage, { speed: B.weaponSpeed })), 188);
});
test('Seal of Corruption DoT TPS = 188 @709 SP (5 stacks)', () => {
  assert.equal(round(sealOfCorruptionTPS(B.spellDamage)), 188);
});
test('Judgement of Righteousness TPS = 145 @709 SP', () => {
  assert.equal(round(judgementOfRighteousnessTPS(B.spellDamage, B.spellCritPct)), 145);
});
test('Judgement of Corruption TPS = 182 @709 SP (5 stacks)', () => {
  assert.equal(round(judgementOfCorruptionTPS(B.spellDamage, B.spellCritPct)), 182);
});
test('Blessing of Sanctuary TPS = 33 (~3 blocks/8s)', () => {
  assert.equal(round(blessingOfSanctuaryTPS()), 33);
});

// ---- Threat: unbuffed (639 SP) endpoints from the per-ability table ranges ----
test('Consecration TPS = 273 @639 SP (unbuffed)', () => {
  assert.equal(round(consecrationTPS(P.spellDamage)), 273);
});
test('Holy Shield TPS = 173 @639 SP (unbuffed)', () => {
  assert.equal(round(holyShieldTPS(P.spellDamage)), 173);
});
test('Judgement of Righteousness TPS = 133 @639 SP, 7.86% crit (unbuffed)', () => {
  assert.equal(round(judgementOfRighteousnessTPS(P.spellDamage, P.spellCritPct)), 133);
});

// ---- Defensive model: reference profile combat-table values ----
test('Boss miss chance = 11.0% at 500 defense skill', () => {
  assert.equal(Number(missChance(P.defenseSkill).toFixed(2)), 11.0);
});
test('Total avoidance = 67.79% (miss + dodge + parry + block)', () => {
  const total = missChance(P.defenseSkill) + P.dodgePct + P.parryPct + P.blockChancePct;
  assert.equal(Number(total.toFixed(2)), P.totalAvoidancePct);
});

// ---- Crit immunity: the 490 defense gate (guide:1527-1534) ----
test('Crit reduction at 490 defense = 5.6% (exactly the boss crit)', () => {
  assert.equal(Number(critReduction(490).toFixed(2)), 5.6);
});
test('Uncrittable at 490 defense; crittable at 489', () => {
  assert.equal(isUncrittable(490), true);
  assert.equal(isUncrittable(489), false);
});
test('Reference profile (500 defense) is uncrittable', () => {
  assert.equal(isUncrittable(P.defenseSkill), true);
});

// ---- Uncrushable: 102.4% combined (guide:1566) ----
test('Uncrushable threshold constant is 102.4', () => {
  assert.equal(CAPS.uncrushableCombined, 102.4);
});
test('Reference profile is NOT uncrushable even with Holy Shield (97.79%)', () => {
  const combined = combinedAvoidance({
    miss: missChance(P.defenseSkill), dodge: P.dodgePct, parry: P.parryPct,
    block: P.blockChancePct, holyShieldActive: true,
  });
  assert.equal(Number(combined.toFixed(2)), 97.79);
  assert.equal(isUncrushable(combined), false);
});

// ---- Resistance: 244 ~= 50%, 365 = 75% cap vs level 73 ----
test('365 resistance = 75% mitigation (cap) vs level 73', () => {
  assert.equal(Number((resistanceMitigation(365) * 100).toFixed(1)), 75.0);
});
test('244 resistance ~= 50% mitigation vs level 73', () => {
  assert.equal(Number((resistanceMitigation(244) * 100).toFixed(1)), 50.1);
});
test('Resistance targets vs level 73 are 244 / 365', () => {
  assert.deepEqual(resistanceTargets(), { half: 244, cap: 365 });
});

// ---- Armor: reference profile DR sanity (~55.9% vs level 73) ----
test('Armor DR ~= 55.9% at 15139 armor vs level 73', () => {
  assert.equal(Number((armorDR(P.armor) * 100).toFixed(1)), 55.9);
});

// ---- Scoring: weight scales behave (spell power leads threat, stamina leads survival) ----
test('Threat scale ranks 1 spell power above 1 strength', () => {
  const sp = scoreByScale({ spellDamage: 1 }, 'threatSingleBelowCap');
  const str = scoreByScale({ strength: 1 }, 'threatSingleBelowCap');
  assert.ok(sp > str);
});
test('Survival scale values stamina but not pure threat spell power highly', () => {
  const sta = scoreByScale({ stamina: 1 }, 'survivalEHP');
  const sp = scoreByScale({ spellDamage: 1 }, 'survivalEHP');
  assert.ok(sta > sp);
});
