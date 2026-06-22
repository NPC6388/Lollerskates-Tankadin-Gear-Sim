// Per-ability threat & TPS formulas.
// Transcribed verbatim from the guide's worked example (index.html:975-979),
// per-ability table (864-968), and seal crit mechanics (1256-1262).
// All "perCast"/"perBlock"/"perSwing" return raw threat; TPS helpers amortize them.

import { THREAT, CRIT_MULT } from './constants.js';

const RF = THREAT.righteousFury;

// Average damage multiplier from crit, given a crit chance (%) and school.
// spell crit = 1.5x (+0.5 avg), melee crit = 2x (+1.0 avg).
export function avgCritMult(critPct, school = 'spell') {
  const bonus = CRIT_MULT[school] - 1; // 0.5 spell, 1.0 melee
  return 1 + (critPct / 100) * bonus;
}

// ---- Direct-damage abilities (per cast / per block) ----

// Consecration Rank 6: (512 + SP) * 1.9 over its 8s duration. Cannot crit.
export function consecrationPerCast(sp) {
  return (512 + sp * 1.0) * RF;
}
export function consecrationTPS(sp) {
  return consecrationPerCast(sp) / 8;
}

// Holy Shield Rank 4 per block: (155 + SP*0.05 + 15[4pc]) * 1.9 * 1.20[Imp HS]. Cannot crit.
export function holyShieldPerBlock(sp, { fourPc = true, impHolyShield = true } = {}) {
  const flat = fourPc ? THREAT.justicar4pcHolyShield : 0;
  const impMult = impHolyShield ? THREAT.improvedHolyShieldDmg : 1.0;
  return (155 + sp * 0.05 + flat) * RF * impMult;
}
// Single-target assumption: ~3 blocks per 8s (guide per-ability table).
export function holyShieldTPS(sp, { blocksPerSec = 3 / 8, ...opts } = {}) {
  return holyShieldPerBlock(sp, opts) * blocksPerSec;
}

// Avenger's Shield Rank 3 per target: (548 + SP*0.1357) * 1.9 * critMult(spell).
export function avengersShieldPerTarget(sp, spellCritPct) {
  return (548 + sp * 0.1357) * RF * avgCritMult(spellCritPct, 'spell');
}

// ---- Judgements (per cast, 10s cooldown) ----

// Judgement of Blood: (310 + SP*0.43) * 1.9 * critMult(melee 2x). Not 2pc-boosted.
export function judgementOfBloodPerCast(sp, meleeCritPct) {
  return (310 + sp * 0.43) * RF * avgCritMult(meleeCritPct, 'melee');
}

// Judgement of Righteousness: (208 + SP*0.728) * 1.9 * critMult(spell). Not 2pc-boosted.
export function judgementOfRighteousnessPerCast(sp, spellCritPct) {
  return (208 + sp * 0.728) * RF * avgCritMult(spellCritPct, 'spell');
}
export function judgementOfRighteousnessTPS(sp, spellCritPct, cd = 10) {
  return judgementOfRighteousnessPerCast(sp, spellCritPct) / cd;
}

// Judgement of Corruption/Vengeance at 5 Blood Corruption stacks:
// (605 + SP*0.429) * 1.9 * critMult(spell). Not 2pc-boosted.
export function judgementOfCorruptionPerCast(sp, spellCritPct) {
  return (605 + sp * 0.429) * RF * avgCritMult(spellCritPct, 'spell');
}
export function judgementOfCorruptionTPS(sp, spellCritPct, cd = 10) {
  return judgementOfCorruptionPerCast(sp, spellCritPct) / cd;
}

// ---- Seals (per swing / per tick) ----

// Seal of Righteousness proc per swing: (base + SP*0.092*speed) * 1.9 * 1.10[2pc]. Cannot crit.
// base is calibrated to the guide's published 188 TPS at 709 SP / 1.80 speed
// (the hardcoded seal-chart value, index.html:1008). It reproduces 174-188 across the
// 639->709 SP range used by the guide.
const SOR_BASE = 44.5;
export function sealOfRighteousnessPerSwing(sp, { speed = 1.8, twoPc = true } = {}) {
  const seal2 = twoPc ? THREAT.justicar2pcSeal : 1.0;
  return (SOR_BASE + sp * 0.092 * speed) * RF * seal2;
}
export function sealOfRighteousnessTPS(sp, { speed = 1.8, ...opts } = {}) {
  return sealOfRighteousnessPerSwing(sp, { speed, ...opts }) / speed;
}

// Seal of Corruption/Vengeance DoT per tick at 5 stacks:
// (150 + SP*0.17) * 1.9 * 1.10[2pc], ticks every 3s. Cannot crit.
export function sealOfCorruptionPerTick(sp, { twoPc = true } = {}) {
  const seal2 = twoPc ? THREAT.justicar2pcSeal : 1.0;
  return (150 + sp * 0.17) * RF * seal2;
}
export function sealOfCorruptionTPS(sp, opts = {}) {
  return sealOfCorruptionPerTick(sp, opts) / 3;
}

// ---- Flat per-event threat ----

// Blessing of Sanctuary: 46 Holy per block * 1.9.
export function blessingOfSanctuaryPerBlock() {
  return 46 * RF;
}
export function blessingOfSanctuaryTPS({ blocksPerSec = 3 / 8 } = {}) {
  return blessingOfSanctuaryPerBlock() * blocksPerSec;
}

// Retribution Aura Rank 6: 26 Holy * 1.9 per hit taken (not avoided/blocked-out).
// 2pc Crystalforge (T5) adds +15 damage per hit before RF.
export function retributionAuraPerHit({ crystalforge2pc = false } = {}) {
  const flat = crystalforge2pc ? THREAT.crystalforge2pcRetAura : 0;
  return (26 + flat) * RF;
}
