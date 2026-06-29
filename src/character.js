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

  const actualAvoidance = (s.missPct ?? 0) + (s.dodgePct ?? 0) + (s.parryPct ?? 0);
  const totalAvoidanceNoHS = actualAvoidance + (s.blockPct ?? 0);
  const totalAvoidanceWithHS = totalAvoidanceNoHS + hsBonus;

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

    // Throughput / survival objectives
    spellPower: s.spellPower ?? 0, // threat objective (matches the sheet's SP proxy)
    blockValue: s.blockValue ?? 0,
    health: s.health ?? 0,         // raw HP pool (for the min-HP gate)
    ehpPhysical,                   // survival objective: HP / (1 - armor DR)
  };
}

// Does a set satisfy a goal's hard gates? (uncrittable always; uncrushable per goal)
export function passesGates(evald, { raid = true, requireUncrushable = false } = {}) {
  const critOk = raid ? evald.raidCritImmune : evald.heroicCritImmune;
  return critOk && (!requireUncrushable || evald.uncrushable);
}
