// Set evaluator — reproduces the readout from the user's original tank spreadsheet
// (which predates, and seeded, the guide). Given a set's aggregate stats, it returns
// the same checks the sheet computes per column: crit immunity (heroic & raid),
// uncrushable status with the crush surplus/deficit, avoidance totals, and EHP.
// This is the objective/constraint oracle the M2 optimizer scores candidate sets against.

import { BASE, CAPS } from './constants.js';
import { critReduction, armorDR } from './combat.js';

// input shape (all final character-sheet values, like the spreadsheet columns):
//   defenseSkill, resilienceRating, missPct, dodgePct, parryPct, blockPct,
//   hsBlockBonus (30 base, or 35.32 with a block libram), armor, health,
//   spellPower, blockValue
export function evaluateSet(s) {
  const hsBonus = s.hsBlockBonus ?? 30; // Holy Shield +30%, or 35.32 w/ block libram
  const critRed = critReduction(s.defenseSkill, s.resilienceRating ?? 0);

  const missP = s.missPct ?? 0, dodgeP = s.dodgePct ?? 0, parryP = s.parryPct ?? 0, blockP = s.blockPct ?? 0;
  const actualAvoidance = missP + dodgeP + parryP;
  const totalAvoidanceNoHS = actualAvoidance + blockP;
  const totalAvoidanceWithHS = totalAvoidanceNoHS + hsBonus;

  // Encounter-adjusted crush avoidance (Holy Shield included). Some fights strip part of your avoidance,
  // so staying uncrushable there needs MORE gear avoidance:
  //  • Illidan — Shear cannot MISS, so miss doesn't count: dodge + parry + block + HS.
  //  • Sunwell — Sunwell Radiance = boss +5% hit (miss -5) and -20% to your dodge:
  //    max(0, miss-5) + max(0, dodge-20) + parry + block + HS.
  const illyAvoidance = dodgeP + parryP + blockP + hsBonus;
  const swpAvoidance =
    Math.max(0, missP - CAPS.sunwellHitReduction) +
    Math.max(0, dodgeP - CAPS.sunwellDodgeReduction) +
    parryP + blockP + hsBonus;

  // Physical EHP = the health pool behind armor mitigation. Avoidance (dodge/parry/miss) is NOT
  // multiplied in here: the guide notes it has DIMINISHING returns (it smooths the average but not
  // the consecutive-hit spikes that kill you), so 1/(1-avoid) would overstate it. Avoidance is
  // valued in the weight scales instead (where its magnitude can be tuned), and shown separately.
  // Flat damage reduction (Improved Righteous Fury's -6% while RF is up) DOES fold in: it scales
  // every incoming hit, so it multiplies effective HP directly. It's a constant factor, so it lifts
  // every set equally and doesn't change gear rankings — it just makes the EHP number honest.
  const dmgTakenMult = s.damageTakenMult ?? 1;
  const ehpPhysical =
    s.armor != null && s.health != null
      ? s.health / (1 - armorDR(s.armor)) / dmgTakenMult
      : null;

  return {
    // Crit immunity (defense + resilience vs the boss's bonus crit)
    critReduction: critRed,
    heroicCritImmune: critRed + 1e-9 >= BASE.heroicBossCritVsPlayer,
    raidCritImmune: critRed + 1e-9 >= BASE.bossCritVsPlayer,
    heroicCritSurplus: critRed - BASE.heroicBossCritVsPlayer,
    raidCritSurplus: critRed - BASE.bossCritVsPlayer,

    // Crush immunity (single-roll table must fill 102.4% with Holy Shield up)
    actualAvoidance,
    totalAvoidanceNoHS,
    totalAvoidanceWithHS,
    crushSurplus: totalAvoidanceWithHS - CAPS.uncrushableCombined,
    uncrushable: totalAvoidanceWithHS + 1e-9 >= CAPS.uncrushableCombined,

    // Encounter-specific uncrushable. Illidan's Shear can't miss and is avoided at the LOWER 101.8%
    // target (dodge+parry+block+HS); Sunwell keeps the 102.4% crush table on its reduced avoidance.
    illyAvoidance,
    illyUncrushable: illyAvoidance + 1e-9 >= CAPS.shearAvoidanceTarget,
    illyCrushSurplus: illyAvoidance - CAPS.shearAvoidanceTarget,
    swpAvoidance,
    swpUncrushable: swpAvoidance + 1e-9 >= CAPS.uncrushableCombined,
    swpCrushSurplus: swpAvoidance - CAPS.uncrushableCombined,

    // Throughput / survival objectives
    spellPower: s.spellPower ?? 0, // threat objective (matches the sheet's SP proxy)
    blockValue: s.blockValue ?? 0,
    health: s.health ?? 0,         // raw HP pool (for the min-HP gate)
    ehpPhysical,                   // survival objective: HP / (1 - armor DR)
  };
}

// Does a set satisfy a goal's hard gates? (uncrittable always; uncrushable per goal). `encounter`
// ('illidan' | 'sunwell' | null) picks which uncrushable the crush gate uses (see evaluateSet).
export function passesGates(evald, { raid = true, requireUncrushable = false, encounter = null } = {}) {
  const critOk = raid ? evald.raidCritImmune : evald.heroicCritImmune;
  if (!requireUncrushable) return critOk;
  const uncrush = encounter === 'sunwell' ? evald.swpUncrushable
    : encounter === 'illidan' ? evald.illyUncrushable
    : evald.uncrushable;
  return critOk && uncrush;
}
