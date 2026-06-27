// Character model: turns a set of items (raw ratings + stats) into the final
// character-sheet values evaluateSet() expects.
//
// This is a FIRST-PRINCIPLES forward calculation: final = race/class base + talents +
// gear, using real game constants. It deliberately does NOT back-fit to the player's
// sheet (the old `calibrate()` is gone) — so if a computed final differs from the game,
// that difference is a real signal (a missing stat source or a wrong constant), not
// something papered over.
//
// Constants below are for a level-70 Blood Elf Protection Paladin running the guide's
// Avenger's Shield build (0/43/18). Each is traceable to a game source; the few
// race/class base intercepts were derived once from the unbuffed sheet + correct gear
// (e.g. base dodge from the unbuffed↔buffed agility pair) and are documented as such.

import { RATING, BASE } from './constants.js';
import { setCounts } from './sets.js';

// Race/class base intercepts (L70 Blood Elf Paladin, no gear, no talents, no buffs).
export const CHARACTER = {
  baseAgility: 79,          // sheet agility 85 - 6 (chest gem) = 79 base
  baseStrength: 123,        // sheet strength 129 - 6 (chest gem) = 123 base (v6 capture)
  baseIntellect: 87,        // sheet intellect 289 - 202 gear = 87 base (v6 capture)
  baseStamina: 122,         // (sheet 981 / 1.16 stam-talents) - 724 clean gear ≈ 122
  baseDodgePct: 0.649,      // dodge at 0 agility; from the unbuffed↔buffed sheet pair
  baseParryPct: 5.0,        // class base parry
  baseBlockPct: 5.0,        // class base block
  agilityPerDodgePct: 25.0, // agility per +1% dodge (derived: Δ18 agi → Δ0.72% dodge)
  armorPerAgility: 2,       // base armor = agility × 2 (Toughness does NOT touch this)
  baseHealth: 3377,         // health at 0 stamina (first-20-stamina rule applied below)
  hpPerStamina: 10,
};

// Avenger's Shield build (0/43/18) talent modifiers that affect the defensive sheet.
export const TALENTS = {
  anticipationDefenseSkill: 20, // Anticipation 5/5: +20 defense skill (flat)
  deflectionParryPct: 5,        // Deflection 5/5: +5% parry
  toughnessItemArmorMult: 1.10, // Toughness 5/5: +10% armor FROM ITEMS
  staminaMult: 1.16,            // Sacred Duty 2/2 (+6%) + Combat Expertise 5/5 (+10%)
  combatExpertise: 5,           // Combat Expertise 5/5: +5 expertise (flat)
  precisionSpellHitPct: 3,      // Precision 3/3: +3% spell hit
  precisionMeleeHitPct: 3,      // Precision 3/3: +3% melee hit
};

// Party/raid buffs the player runs with. Blessing of Kings is a +10% MULTIPLIER on the four
// primary stats (applied after flat buffs); Mark of the Wild / Gift of the Wild is a FLAT
// +14 to each (rank-3 raid value). MotW armor/resistances are omitted (small, and MotW armor
// bypasses Toughness — not worth the complication). Adjust if the player's druid differs.
export const BUFFS = {
  kingsMult: 1.10,
  markOfTheWild: { stamina: 14, strength: 14, agility: 14, intellect: 14 },
};

// Compute the stat-affecting talent modifiers from a scanned rank map (talent name -> points,
// from the addon's TR: line). Absent ranks fall back to the guide's Avenger's Shield (0/43/18)
// build, so an export without talents reproduces the existing model exactly. Per-rank values are
// the guide's talent sheet: Anticipation +4 def, Deflection +1% parry, Toughness +2% item armor,
// Sacred Duty +3% stam, Combat Expertise +2% stam +1 expertise, Precision +1% melee/spell hit.
export function talentsFromRanks(ranks) {
  if (!ranks || !Object.keys(ranks).length) return { ...TALENTS };
  const r = (name, def) => (ranks[name] != null ? ranks[name] : def);
  const sacredDuty = r('Sacred Duty', 2), combatExpertise = r('Combat Expertise', 5);
  const toughness = r('Toughness', 5), anticipation = r('Anticipation', 5);
  const deflection = r('Deflection', 5), precision = r('Precision', 3);
  return {
    anticipationDefenseSkill: anticipation * 4,
    deflectionParryPct: deflection * 1,
    toughnessItemArmorMult: 1 + toughness * 0.02,
    staminaMult: 1 + sacredDuty * 0.03 + combatExpertise * 0.02,
    combatExpertise: combatExpertise * 1,
    precisionSpellHitPct: precision * 1,
    precisionMeleeHitPct: precision * 1,
  };
}

export const STAT_KEYS = [
  'stamina', 'strength', 'agility', 'intellect',
  'defenseRating', 'dodgeRating', 'parryRating', 'blockRating',
  'blockValue', 'spellDamage', 'hitRating', 'expertiseRating',
  'spellHitRating', 'spellCritRating', 'resilienceRating', 'armor',
  // Modeled threat-only effect (NOT spell power): flat +damage to Consecration, from a libram.
  // Scored by the threat scales (high for AOE — Consecration hits every target), never counted as
  // spell power, so it doesn't perturb the spell-power reconciliation.
  'consecrationDamage',
];

export function sumStats(items) {
  const t = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  for (const it of items) {
    const s = it.stats || {};
    for (const k of STAT_KEYS) t[k] += s[k] || 0;
  }
  return t;
}

// TBC stamina→health: the first 20 stamina give 1 HP each, the rest give 10 HP each.
function healthFromStamina(stam) {
  return stam <= 20 ? stam : 20 + (stam - 20) * CHARACTER.hpPerStamina;
}

// items -> evaluateSet() input shape, computed from scratch. opts.buffs (optional) is a
// flat stat block added on top of gear for the raid-buffed view (e.g. Mark of the Wild,
// Fortitude, Wizard Oil); omit it for the unbuffed sheet.
export function aggregate(items, opts = {}) {
  const { hsBlockBonus = 30, buffs = {} } = opts;
  // Blessing of Kings: +10% to the four primaries, applied AFTER flat buffs (base+gear+MotW).
  const kMult = opts.kings ? BUFFS.kingsMult : 1.0;
  // opts.talents (from talentsFromRanks) overrides the default build's talent modifiers.
  const C = CHARACTER, T = opts.talents ? { ...TALENTS, ...opts.talents } : TALENTS;
  const t = sumStats(items);
  const b = (k) => (t[k] || 0) + (buffs[k] || 0);

  const defenseSkill =
    BASE.baseDefenseSkill + b('defenseRating') / RATING.defensePerSkill + T.anticipationDefenseSkill;
  const defBonus = (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill;

  const agility = (C.baseAgility + b('agility')) * kMult;
  const strength = (C.baseStrength + b('strength')) * kMult;
  const intellect = (C.baseIntellect + b('intellect')) * kMult;
  const stamina = (C.baseStamina + b('stamina')) * T.staminaMult * kMult;

  return {
    defenseSkill,
    resilienceRating: b('resilienceRating'),
    missPct: BASE.baseMissChance + defBonus,
    dodgePct: C.baseDodgePct + agility / C.agilityPerDodgePct + b('dodgeRating') / RATING.dodgePer1 + defBonus,
    parryPct: C.baseParryPct + T.deflectionParryPct + b('parryRating') / RATING.parryPer1 + defBonus,
    blockPct: C.baseBlockPct + b('blockRating') / RATING.blockPer1 + defBonus,
    hsBlockBonus,
    armor: agility * C.armorPerAgility + b('armor') * T.toughnessItemArmorMult,
    health: C.baseHealth + healthFromStamina(stamina),
    stamina,
    agility,
    strength,
    intellect,
    spellPower: b('spellDamage'),
    spellCritRating: b('spellCritRating'),
    // Block value = shield base block + item block-value suffixes (both in b('blockValue')
    // once addon v6 reads the shield's "N Block" line) + Strength/20 (TBC: 1 BV per 20 Str).
    blockValue: b('blockValue') + Math.floor(strength / 20),
    _raw: t,
  };
}

// Justicar (T4) set-bonus detection (by item ID via the set DB). Under the spell-power
// threat objective these don't change the ranking (they add flat threat); they matter
// for a computed-TPS objective, and we surface them in the readout regardless. For the
// full per-set breakdown (incl. Crystalforge T5) use setBonuses() from ./sets.js.
export function justicarBonuses(items) {
  const pieces = setCounts(items).Justicar || 0;
  return { pieces, twoPc: pieces >= 2, fourPc: pieces >= 4 };
}
