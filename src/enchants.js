// Enchant database — a CURATED SEED of the slot enchants a Prot Paladin uses in TBC,
// keyed by the import's slot names. Stats use the weight-scale keys so each is scorable.
// Validated against GEM_ENCHANT_REVIEW.md. `profession` marks an enchant only available
// with that profession (e.g. ring enchants need Enchanting). Faction/source notes are in
// trailing comments. As with gems, stats outside the weight scales (spell crit, etc.) are
// omitted and noted, not scored.

// slot -> [ { name, stats, profession? } ]  (threat-leaning + survival-leaning options)
export const ENCHANTS = {
  head: [
    { name: 'Glyph of Power', stats: { spellDamage: 22, spellHitRating: 14 } },
    { name: 'Glyph of the Defender', stats: { defenseRating: 16, dodgeRating: 17 } },
  ],
  shoulder: [
    { name: 'Greater Inscription of the Knight', stats: { defenseRating: 15, dodgeRating: 10 } },      // Scryer exalted
    { name: 'Greater Inscription of Warding', stats: { dodgeRating: 15, defenseRating: 10 } },          // Aldor exalted
    { name: 'Greater Inscription of Discipline', stats: { spellDamage: 18 } },                          // Aldor exalted; note: +10 spell crit (unscored)
    { name: 'Greater Inscription of the Orb', stats: { spellDamage: 12 } },                             // Scryer exalted; note: +15 spell crit (unscored)
  ],
  back: [
    { name: 'Enchant Cloak - Steelweave', stats: { defenseRating: 12 } },
    { name: 'Enchant Cloak - Greater Agility', stats: { agility: 12 } },
    { name: 'Enchant Cloak - Dodge', stats: { dodgeRating: 12 } },
  ],
  chest: [
    { name: 'Enchant Chest - Exceptional Stats', stats: { stamina: 6, strength: 6, agility: 6, intellect: 6 } },
    { name: 'Enchant Chest - Major Resilience', stats: { resilienceRating: 15 } },
  ],
  wrist: [
    { name: 'Enchant Bracer - Fortitude', stats: { stamina: 12 } },
    { name: 'Enchant Bracer - Major Defense', stats: { defenseRating: 12 } },
    { name: 'Enchant Bracer - Spellpower', stats: { spellDamage: 15 } },
  ],
  hands: [
    { name: 'Enchant Gloves - Major Strength', stats: { strength: 15 } },
    { name: 'Enchant Gloves - Spell Strike', stats: { spellHitRating: 15 } },
    { name: 'Enchant Gloves - Major Spellpower', stats: { spellDamage: 20 } },
  ],
  legs: [
    { name: 'Runic Spellthread', stats: { spellDamage: 35, stamina: 20 } },
    { name: 'Nethercleft Leg Armor', stats: { stamina: 40, agility: 12 } },
  ],
  feet: [
    { name: 'Enchant Boots - Dexterity', stats: { agility: 12 } },
    { name: 'Enchant Boots - Fortitude', stats: { stamina: 12 } },
  ],
  weapon: [
    { name: 'Enchant Weapon - Major Spellpower', stats: { spellDamage: 40 } },
  ],
  offhand: [
    { name: 'Enchant Shield - Major Stamina', stats: { stamina: 18 } },
    { name: 'Enchant Shield - Resilience', stats: { resilienceRating: 12 } },
    { name: 'Enchant Shield - Shield Block', stats: { blockRating: 15 } },
  ],
  // Ring enchants apply to BOTH rings but require Enchanting.
  ring: [
    { name: 'Enchant Ring - Spellpower', stats: { spellDamage: 12 }, profession: 'Enchanting' },
    { name: 'Enchant Ring - Stats', stats: { stamina: 4, strength: 4, agility: 4, intellect: 4 }, profession: 'Enchanting' },
  ],
};

import { score } from './scoring.js';

// Best enchant for a slot under a goal. Enchants gated by a profession are excluded
// unless the player has it (perks.names includes the profession).
export function bestEnchant(slot, weights, perks = { names: [] }) {
  const list = ENCHANTS[slot];
  if (!list) return null;
  let best = null;
  for (const e of list) {
    if (e.profession && !perks.names.includes(e.profession)) continue;
    const s = score(e.stats, weights);
    if (!best || s > best.score) best = { enchant: e, score: s };
  }
  return best;
}
