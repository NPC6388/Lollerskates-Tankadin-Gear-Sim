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

// Derive per-character calibration from the equipped set + the character-sheet finals
// (from the addon's C: line). base* fold in class base + agility + talents; the defense
// offset captures raw/enchant defense skill not from defense rating. Stable across a
// character's plate sets, so it transfers to new sets the optimizer builds.
export function calibrate(equippedItems, finals) {
  const t = sumStats(equippedItems);
  const defBonus = (finals.defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill;
  return {
    defenseSkillOffset: finals.defenseSkill - (BASE.baseDefenseSkill + t.defenseRating / RATING.defensePerSkill),
    baseDodge: finals.dodge - t.dodgeRating / RATING.dodgePer1 - defBonus,
    baseParry: finals.parry - t.parryRating / RATING.parryPer1 - defBonus,
    baseBlock: finals.block - t.blockRating / RATING.blockPer1 - defBonus,
    baseArmor: (finals.armor || 0) - t.armor,
    baseHealth: (finals.health || 0) - t.stamina * MODEL.hpPerStamina,
  };
}

// items -> evaluateSet() input shape. Pass opts.calibration (from calibrate()) for a
// character-accurate result; without it, the placeholder MODEL bases are used.
export function aggregate(items, opts = {}) {
  const { hsBlockBonus = 30, staminaMult = 1.0, calibration: cal } = opts;
  const t = sumStats(items);

  const defOffset = cal ? cal.defenseSkillOffset : 0;
  const defenseSkill = BASE.baseDefenseSkill + t.defenseRating / RATING.defensePerSkill + defOffset;
  const defBonus = (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill;

  const baseDodge = cal ? cal.baseDodge : MODEL.baseDodgePct;
  const baseParry = cal ? cal.baseParry : MODEL.baseParryPct;
  const baseBlock = cal ? cal.baseBlock : MODEL.baseBlockPct;
  // agility->dodge only when uncalibrated; calibrated baseDodge already folds agility in
  const agiDodge = cal ? 0 : t.agility / MODEL.agilityPerDodgePct;
  const baseArmor = cal ? cal.baseArmor : 0;
  const baseHealth = cal ? cal.baseHealth : MODEL.baseHealth;

  return {
    defenseSkill,
    resilienceRating: t.resilienceRating,
    missPct: BASE.baseMissChance + defBonus,
    dodgePct: baseDodge + agiDodge + t.dodgeRating / RATING.dodgePer1 + defBonus,
    parryPct: baseParry + t.parryRating / RATING.parryPer1 + defBonus,
    blockPct: baseBlock + t.blockRating / RATING.blockPer1 + defBonus,
    hsBlockBonus,
    armor: baseArmor + t.armor,
    health: (baseHealth + t.stamina * MODEL.hpPerStamina) * staminaMult,
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
