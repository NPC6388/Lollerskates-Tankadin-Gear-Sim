// Core constants for the Tankadin Gear Sim.
// Single source of truth, transcribed from the WoW TBC Prot Paladin Tanking Guide
// (index.html). Every value here is traceable to a guide section; see comments.
// Works unchanged in the browser (ES modules) and in Node for the test suite.

// --- Rating conversions (guide: #stat-conversions table) ---
// "Rating per 1%" except defense/expertise which are per skill point.
export const RATING = {
  defensePerSkill: 2.3654, // defense rating per 1 defense skill
  meleeHitPer1: 15.77,     // melee hit rating per 1%
  spellHitPer1: 12.62,     // spell hit rating per 1%
  expertisePer1: 3.9423,   // expertise rating per 1 expertise
  dodgePer1: 18.92,        // dodge rating per 1%
  parryPer1: 23.65,        // parry rating per 1%
  blockPer1: 7.88,         // block rating per 1%
  critPer1: 22.08,         // crit rating per 1%
  hastePer1: 15.77,        // haste rating per 1%
  resiliencePer1: 39.42,   // resilience rating per 1% crit reduction
};

// --- Character / boss baselines (guide: #combat-table, #block-mechanics) ---
export const BASE = {
  playerLevel: 70,
  baseDefenseSkill: 350,        // 5 x level
  baseMissChance: 5,            // % melee miss vs target (guide profile baseline)
  defenseBenefitPerSkill: 0.04, // % per defense skill to dodge/parry/block/miss/crit-avoid
  raidBossLevel: 73,
  heroicBossLevel: 72,
  bossCritVsPlayer: 5.6,        // % crit a level 73 raid boss has on a level 70 (guide: 1531)
  heroicBossCritVsPlayer: 5.4,  // % crit a level 72 heroic boss has on a level 70
};

// --- Hard caps / thresholds (guide: #stat-conversions, #combat-table) ---
export const CAPS = {
  defenseSkillRaid: 490,    // crit immunity vs level 73 (guide: 1527-1534)
  defenseSkillHeroic: 485,  // crit immunity vs level 72
  uncrushableCombined: 102.4, // miss+dodge+parry+block >= this => no crushing (guide: 1566)
  // Illidan's Shear is a single special that CANNOT miss — it's fully avoided when dodge+parry+block
  // (with Holy Shield) reaches 101.8%, slightly under the 102.4% crush table. So the Illidan gate uses
  // this lower target on illyAvoidance (miss excluded), not the crush constant. (community/Shear calc)
  shearAvoidanceTarget: 101.8,
  // Safety margin CERTIFICATION requires over the crush cap (see crushSafeTargetFor). The optimizer computes
  // avoidance from summed RATINGS (dodge rating / 18.92, etc.), while the in-game character sheet — the source
  // the Live readout reads (GetDodgeChance/GetParryChance/GetBlockChance) — computes the same %s with the
  // game's exact combat-rating math. The two disagree by ~0.1%, so a set scored at 102.47% can read 102.36%
  // (crushable) once equipped. So the reported `legal` flag and the Optimize card's ✓ require avoidance ≥ cap
  // + this margin; a set that clears the raw cap but not the margin is reported illegal (best-effort). The
  // SOLVER still selects toward the raw cap (crushTargetFor), and the Live readout / evaluateSet's own
  // `uncrushable`+`crushSurplus` flags stay on the raw 102.4 cap — the true in-game boundary.
  uncrushableSafetyMargin: 0.3,
  // Encounter avoidance modifiers (see character.js evaluateSet): Illidan's Shear cannot miss, and
  // Sunwell Radiance gives the boss +5% hit (your miss -5) and -20% to your dodge.
  sunwellHitReduction: 5,   // Sunwell Radiance: chance to be missed reduced by 5
  sunwellDodgeReduction: 20, // Sunwell Radiance: dodge reduced by 20
  spellHitCapPct: 17,       // vs raid boss (guide table)
  meleeHitCapPct: 9,        // vs raid boss (6% with 3/3 Precision)
  expertiseSoftCap: 26,     // eliminates boss dodge
};

// Uncrushable target for the crush gate, given the encounter. Illidan's Shear (miss excluded) is avoided
// at 101.8%; every other case uses the 102.4% crush table. An explicit gates.uncrushableTarget override
// (e.g. AOE trash relax) always wins. Single source of truth for JS + the addon mirror. This is the SOLVER's
// target (what the optimizer selects/reclaims toward). CERTIFICATION (the reported `legal` flag and the
// Optimize card's ✓) instead uses crushSafeTargetFor — see below.
export const crushTargetFor = (enc, override) =>
  override ?? (enc === 'illidan' ? CAPS.shearAvoidanceTarget : CAPS.uncrushableCombined);

// Certification target = the crush target PLUS a safety margin. The optimizer computes avoidance from
// summed RATINGS (dodge rating / 18.92, etc.); the in-game character sheet — the source the Live readout
// reads (GetDodgeChance/GetParryChance/GetBlockChance) — computes the same %s with the game's exact
// combat-rating math, and the two disagree by ~0.1%. So a set the solver lands at 102.47% can read 102.36%
// (crushable) once equipped. The Optimize card's ✓ and the reported `legal` flag require clearing this
// margined target, so we never certify as uncrushable a set that would crush in-game. The SOLVER still
// aims at the raw cap (crushTargetFor) — a set that clears the raw cap but not the margin is returned
// flagged illegal (best-effort), the same as any other unreachable gate. The Live readout's own
// `uncrushable`/`crushSurplus` flags (character.js) stay on the raw cap — they read the true game boundary.
export const crushSafeTargetFor = (enc, override) => crushTargetFor(enc, override) + CAPS.uncrushableSafetyMargin;

// --- Threat amplifiers (guide: #threat-system) ---
export const THREAT = {
  righteousFury: 1.9,     // 3/3 Improved Righteous Fury (guide: 845)
  holyShieldActive: 30,   // +30% block chance while Holy Shield is up (guide: 1552)
  justicar2pcSeal: 1.10,  // +10% SoR/SoV/SoC seal damage (guide: 633)
  justicar4pcHolyShield: 15, // +15 flat per Holy Shield block (guide: 634)
  crystalforge2pcRetAura: 15, // +15 Retribution Aura damage per hit (T5 2pc)
  crystalforge4pcBlockValue: 100, // +100 block value for 6s after Holy Shield (T5 4pc)
  improvedHolyShieldDmg: 1.20, // 2/2 Improved Holy Shield damage multiplier (guide: 878)
};

// Crit multipliers by school (guide: seal crit mechanics table, 1256-1262)
export const CRIT_MULT = {
  spell: 1.5, // average contribution per crit = +0.5
  melee: 2.0, // average contribution per crit = +1.0
};

// --- Armor mitigation (standard TBC formula; attacker-level dependent) ---
// DR = Armor / (Armor + (467.5 * attackerLevel - 22167.5)), capped at 75%.
export const ARMOR_CONST = (attackerLevel = BASE.raidBossLevel) =>
  467.5 * attackerLevel - 22167.5; // = 11960 at level 73

// --- Resistance mitigation (guide: resistance-set design, PLAN.md §4) ---
// Average mitigation vs a caster = Resistance / (5 * casterLevel) * 0.75, capped 75%.
// At level 73: 5*73 = 365 => 365 res = 75% (cap); 244 res ~= 50%.
export const RESIST_DENOM = (casterLevel = BASE.raidBossLevel) => 5 * casterLevel;
export const RESIST_MAX_MITIGATION = 0.75;
