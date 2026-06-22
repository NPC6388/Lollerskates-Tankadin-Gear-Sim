// Defensive combat model + the hard-cap constraint engine.
// Turns a final stat block into the survival quantities the optimizer gates on:
// crit immunity, uncrushable status, avoidance, armor/resistance mitigation, EHP.
// All math traces to the guide's #combat-table and #block-mechanics sections.

import { BASE, CAPS, THREAT, ARMOR_CONST, RESIST_DENOM, RESIST_MAX_MITIGATION } from './constants.js';

// Defense skill from defense rating (above the level-350 base is added separately).
export function defenseSkillFromRating(defenseRating) {
  return defenseRating / 2.3654;
}

// % chance a boss melee swing misses you. Guide model: 5% base + 0.04%/defense-skill
// over the level-350 base. (def 500 -> 5 + 150*0.04 = 11%.)
export function missChance(defenseSkill) {
  return BASE.baseMissChance + (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill;
}

// Crit chance removed from the attack table by defense skill + resilience.
// Defense above base gives 0.04%/skill; resilience gives 1%/39.42 rating.
export function critReduction(defenseSkill, resilienceRating = 0) {
  const fromDefense = (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill;
  const fromResilience = resilienceRating / 39.42;
  return fromDefense + fromResilience;
}

// Uncrittable when the removed crit >= the boss's crit chance (5.6% vs level 73).
export function isUncrittable(defenseSkill, resilienceRating = 0, bossCrit = BASE.bossCritVsPlayer) {
  // small epsilon so exactly-490 (=> 5.6) counts as immune
  return critReduction(defenseSkill, resilienceRating) + 1e-9 >= bossCrit;
}

// Combined avoidance for the crush table. Holy Shield adds +30% block while active.
export function combinedAvoidance({ miss, dodge, parry, block, holyShieldActive = true }) {
  const effBlock = block + (holyShieldActive ? THREAT.holyShieldActive : 0);
  return miss + dodge + parry + effBlock;
}

// Uncrushable when combined avoidance >= 102.4%.
export function isUncrushable(avoid) {
  const combined = typeof avoid === 'number' ? avoid : combinedAvoidance(avoid);
  return combined + 1e-9 >= CAPS.uncrushableCombined;
}

// Physical damage reduction from armor vs an attacker level (default raid boss 73).
export function armorDR(armor, attackerLevel = BASE.raidBossLevel) {
  const dr = armor / (armor + ARMOR_CONST(attackerLevel));
  return Math.min(dr, 0.75);
}

// Average spell mitigation from resistance vs a caster level (default 73).
// res/(5*level)*0.75, capped at 75%. 365 -> 75%, 244 -> ~50%.
export function resistanceMitigation(resistance, casterLevel = BASE.raidBossLevel) {
  const raw = (resistance / RESIST_DENOM(casterLevel)) * RESIST_MAX_MITIGATION;
  return Math.min(raw, RESIST_MAX_MITIGATION);
}

// Effective health vs physical: raw health scaled up by armor mitigation and by the
// portion of swings that land (1 - full-avoidance). Block value is handled elsewhere.
export function effectiveHealthPhysical(health, armor, fullAvoidancePct, attackerLevel = BASE.raidBossLevel) {
  const armorMult = 1 / (1 - armorDR(armor, attackerLevel));
  const avoidMult = 1 / (1 - fullAvoidancePct / 100);
  return health * armorMult * avoidMult;
}

// Resistance totals needed for the lighter (~50%) and capped (75%) targets vs a level.
// At level 73 these are the canonical 244 / 365 breakpoints (244/365 ~= 50.1% mitigation);
// they scale with the cap for other caster levels.
export function resistanceTargets(casterLevel = BASE.raidBossLevel) {
  const cap = RESIST_DENOM(casterLevel);                 // 365 at level 73
  const half = Math.round(244 * (cap / RESIST_DENOM())); // 244 at level 73
  return { half, cap };
}
