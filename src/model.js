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
  baseStamina: 115,         // (sheet 981 / 1.16 stam-talents) - 731 gear ≈ 115
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

// TBC stamina→health: the first 20 stamina give 1 HP each, the rest give 10 HP each.
function healthFromStamina(stam) {
  return stam <= 20 ? stam : 20 + (stam - 20) * CHARACTER.hpPerStamina;
}

// items -> evaluateSet() input shape, computed from scratch. opts.buffs (optional) is a
// flat stat block added on top of gear for the raid-buffed view (e.g. Mark of the Wild,
// Fortitude, Wizard Oil); omit it for the unbuffed sheet.
export function aggregate(items, opts = {}) {
  const { hsBlockBonus = 30, buffs = {} } = opts;
  const C = CHARACTER, T = TALENTS;
  const t = sumStats(items);
  const b = (k) => (t[k] || 0) + (buffs[k] || 0);

  const defenseSkill =
    BASE.baseDefenseSkill + b('defenseRating') / RATING.defensePerSkill + T.anticipationDefenseSkill;
  const defBonus = (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill;

  const agility = C.baseAgility + b('agility');
  const stamina = (C.baseStamina + b('stamina')) * T.staminaMult;

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
    spellPower: b('spellDamage'),
    // NOTE: a shield's base "N Block" line is not yet captured by the addon, nor is the
    // Strength→block-value contribution modeled, so this is gear-suffix block value only.
    blockValue: b('blockValue'),
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
