// DPS rollup parity. The guide publishes its numbers as THREAT, and reference.test.js already pins
// every per-ability threat figure against that table. For a Prot Paladin the two are the same number
// in different units — every ability here is Holy damage under Righteous Fury — so the assertions
// below multiply each damage component BACK by RF and check it lands on the guide's published threat
// value. That keeps the guide as the source of truth: this file adds no new math, it only proves the
// rollup wires the validated formulas together and converts them by exactly one constant.

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDPS, spellCritPct, SPELL_CRIT, DPS_ASSUMPTIONS } from '../src/dps.js';
import { THREAT } from '../src/constants.js';
import { REFERENCE_PROFILE as P, RAID_BUFFED as B } from './reference-profile.js';

const RF = THREAT.righteousFury;
const round = (n) => Math.round(n);
const part = (r, key) => r.parts.find((p) => p.key === key).dps;
const asThreat = (r, key) => part(r, key) * RF;

// The guide's raid-buffed profile: 709 SP, 11% spell crit, 1.8s weapon, Justicar 2pc + 4pc, Imp HS.
// actualAvoidance is passed as 100 (nothing lands) so the Ret Aura term drops to zero and the other
// five components can be checked against the guide's table one for one. It's asserted on its own below.
const refBuffed = (opts = {}) => computeDPS(
  { spellPower: B.spellDamage },
  {
    spellCritPct: B.spellCritPct,
    weaponSpeed: B.weaponSpeed,
    actualAvoidancePct: 100,
    bonuses: { justicar: { twoPc: B.justicar2pc, fourPc: B.justicar4pc }, crystalforge: { twoPc: false, fourPc: false } },
    ...opts,
  },
);

// ---- each component, re-multiplied by RF, is the guide's threat table --------------------------
test('components x Righteous Fury reproduce the guide threat table @709 SP / 11% spell crit', () => {
  const r = refBuffed();
  assert.equal(round(asThreat(r, 'consecration')), 290);
  assert.equal(round(asThreat(r, 'holyShield')), 176);
  assert.equal(round(asThreat(r, 'seal')), 188);
  assert.equal(round(asThreat(r, 'judgement')), 145);
  assert.equal(round(asThreat(r, 'sanctuary')), 33);
});

test('Righteous Fury is a pure threat multiplier — damage is threat / 1.9 exactly', () => {
  assert.equal(RF, 1.9);
  const r = refBuffed();
  // 290 + 176 + 188 + 145 + 33 = 832 threat  ->  438 damage
  const exRetAura = r.total - part(r, 'retAura');
  assert.equal(round(exRetAura * RF), 832);
  assert.equal(round(exRetAura), 438);
  assert.equal(round(part(r, 'retAura')), 0); // nothing lands at 100% avoidance, so the term is out
});

// ---- Retribution Aura is the one component that falls as avoidance rises ----
test('Retribution Aura scales with hits taken, so avoidance lowers it', () => {
  // 26 Holy damage per landed hit. At the reference profile's miss+dodge+parry and a 2.0s boss
  // swing: (1 - 0.4347) / 2 = 0.2827 hits/s -> ~7 DPS (~14 TPS before the RF conversion).
  const avoid = 11.0 + P.dodgePct + P.parryPct; // miss at 500 defense + dodge + parry
  const r = refBuffed({ actualAvoidancePct: avoid });
  assert.equal(round(asThreat(r, 'retAura')), 14);
  assert.equal(round(part(r, 'retAura')), 7);
  const tankier = refBuffed({ actualAvoidancePct: avoid + 10 });
  assert.ok(part(tankier, 'retAura') < part(r, 'retAura'));
});

// ---- tier bonuses feed the formulas (the SP proxy could only approximate these) ----
test('Justicar 2pc/4pc raise total DPS; no tier is the floor', () => {
  const none = refBuffed({ bonuses: { justicar: { twoPc: false, fourPc: false }, crystalforge: { twoPc: false, fourPc: false } } });
  const two = refBuffed({ bonuses: { justicar: { twoPc: true, fourPc: false }, crystalforge: { twoPc: false, fourPc: false } } });
  const four = refBuffed();
  assert.ok(two.total > none.total, 'Justicar 2pc (+10% seal damage) must add DPS');
  assert.ok(four.total > two.total, 'Justicar 4pc (+15 per block) must add more');
  assert.equal(round(asThreat(none, 'seal')), 171); // the seal without the 2pc's +10%
});

test('Crystalforge 2pc raises Retribution Aura only', () => {
  const cf = { justicar: { twoPc: true, fourPc: true }, crystalforge: { twoPc: true, fourPc: false } };
  const withCf = refBuffed({ bonuses: cf, actualAvoidancePct: 40 });
  const without = refBuffed({ actualAvoidancePct: 40 });
  assert.ok(part(withCf, 'retAura') > part(without, 'retAura'));
  assert.equal(round(part(withCf, 'seal')), round(part(without, 'seal')));
});

// ---- spell crit: the one derived intercept in this module ----
test('spellCritPct reproduces the reference profile 7.86% at 289 intellect', () => {
  // The intercept is derived FROM this pair (see src/dps.js SPELL_CRIT), so this test is the record
  // of that derivation — it fails loudly if either half is ever changed without the other.
  assert.equal(spellCritPct({ intellect: 289, spellCritRating: 0 }).toFixed(2), P.spellCritPct.toFixed(2));
});

test('spellCritPct adds intellect at 80/1% and rating at 22.08/1%', () => {
  const base = spellCritPct({});
  assert.equal(base, SPELL_CRIT.basePct);
  assert.ok(Math.abs(spellCritPct({ intellect: 160 }) - (base + 2)) < 1e-9);
  assert.ok(Math.abs(spellCritPct({ spellCritRating: 22.08 }) - (base + 1)) < 1e-9);
});

// ---- the readout is monotonic in spell power (why the SP proxy picks the same sets) ----
test('total DPS rises with spell power', () => {
  const lo = computeDPS({ spellPower: 600, intellect: 300 }, { actualAvoidancePct: 40 });
  const hi = computeDPS({ spellPower: 800, intellect: 300 }, { actualAvoidancePct: 40 });
  assert.ok(hi.total > lo.total);
});

test('assumptions ride along on the result for the UI footnote', () => {
  const r = computeDPS({ spellPower: 700 }, { actualAvoidancePct: 40 });
  assert.equal(r.assumptions.seal, DPS_ASSUMPTIONS.seal);
  assert.equal(r.assumptions.blocksPerSec, 3 / 8);
  assert.equal(r.assumptions.bossSwingSec, 2.0);
});
