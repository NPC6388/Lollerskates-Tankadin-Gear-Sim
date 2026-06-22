// Character model: turns a set of items (raw ratings + stats) into the final
// character-sheet values evaluateSet() expects. This is the rating->% conversion
// layer the spreadsheet doesn't need (you read finals off the game) but the
// optimizer must compute per candidate set.
//
// NOTE: the base avoidance values below are PLACEHOLDERS for a level-70 Prot
// Paladin with no gear. They must be CALIBRATED against your real unbuffed
// character sheet (the addon can export your finals so we back out the bases:
// base = sheet_value - sum(item contributions)). The conversions/ratings are exact.

import { RATING, BASE } from './constants.js';

export const MODEL = {
  baseDodgePct: 5.0,        // CALIBRATE
  baseParryPct: 5.0,        // CALIBRATE
  baseBlockPct: 5.0,        // CALIBRATE
  agilityPerDodgePct: 25,   // agility for +1% dodge (CALIBRATE)
  baseHealth: 3500,         // L70 base before stamina (CALIBRATE)
  hpPerStamina: 10,
};

export const STAT_KEYS = [
  'stamina', 'strength', 'agility', 'intellect',
  'defenseRating', 'dodgeRating', 'parryRating', 'blockRating',
  'blockValue', 'spellDamage', 'hitRating', 'expertiseRating',
  'spellHitRating', 'resilienceRating', 'armor',
];

export function sumStats(items) {
  const t = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  for (const it of items) {
    const s = it.stats || {};
    for (const k of STAT_KEYS) t[k] += s[k] || 0;
  }
  return t;
}

// items -> evaluateSet() input shape
export function aggregate(items, opts = {}) {
  const { hsBlockBonus = 30, staminaMult = 1.0 } = opts;
  const t = sumStats(items);

  const defenseSkill = BASE.baseDefenseSkill + t.defenseRating / RATING.defensePerSkill;
  const defBonus = (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill;

  return {
    defenseSkill,
    resilienceRating: t.resilienceRating,
    missPct: BASE.baseMissChance + defBonus,
    dodgePct: MODEL.baseDodgePct + t.agility / MODEL.agilityPerDodgePct + t.dodgeRating / RATING.dodgePer1 + defBonus,
    parryPct: MODEL.baseParryPct + t.parryRating / RATING.parryPer1 + defBonus,
    blockPct: MODEL.baseBlockPct + t.blockRating / RATING.blockPer1 + defBonus,
    hsBlockBonus,
    armor: t.armor,
    health: (MODEL.baseHealth + t.stamina * MODEL.hpPerStamina) * staminaMult,
    spellPower: t.spellDamage,
    blockValue: t.blockValue,
    _raw: t,
  };
}

// Justicar (T4) set-bonus detection. Under the spell-power threat objective these
// don't change the ranking (they add flat threat); they matter for a computed-TPS
// objective, and we surface them in the readout regardless.
export function justicarBonuses(items) {
  const pieces = items.filter((i) => i.set === 'Justicar').length;
  return { pieces, twoPc: pieces >= 2, fourPc: pieces >= 4 };
}
