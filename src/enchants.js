// Enchant database — a CURATED SEED of the slot enchants a Prot Paladin uses in TBC,
// keyed by the import's slot names. Stats use the weight-scale keys so each is scorable.
// Validated against GEM_ENCHANT_REVIEW.md. `profession` marks an enchant only available
// with that profession (e.g. ring enchants need Enchanting). Faction/source notes are in
// trailing comments. As with gems, stats outside the weight scales (spell crit, etc.) are
// omitted and noted, not scored.

// slot -> [ { name, stats, profession? } ]  (threat-leaning + survival-leaning options)
export const ENCHANTS = {
  head: [
    { name: 'Glyph of Power', id: 29191, enchant: 3002, stats: { spellDamage: 22, spellHitRating: 14 } },
    { name: 'Glyph of the Defender', id: 29186, enchant: 2999, stats: { defenseRating: 16, dodgeRating: 17 } },
  ],
  shoulder: [
    { name: 'Greater Inscription of the Knight', id: 28911, enchant: 2991, faction: 'Scryer', stats: { defenseRating: 15, dodgeRating: 10 } },
    { name: 'Greater Inscription of Warding', id: 28889, enchant: 2978, faction: 'Aldor', stats: { dodgeRating: 15, defenseRating: 10 } },
    { name: 'Greater Inscription of Discipline', id: 28886, enchant: 2982, faction: 'Aldor', stats: { spellDamage: 18, spellCritRating: 10 } },
    { name: 'Greater Inscription of the Orb', id: 28909, enchant: 2995, faction: 'Scryer', stats: { spellDamage: 12, spellCritRating: 15 } },
  ],
  back: [
    { name: 'Enchant Cloak - Steelweave', id: 35756, enchant: 2648, phase: 5, stats: { defenseRating: 12 } },
    { name: 'Enchant Cloak - Greater Agility', spell: 34004, enchant: 368, stats: { agility: 12 } }, // trainer-taught: link by spell, not item
    { name: 'Enchant Cloak - Dodge', id: 33148, enchant: 2622, stats: { dodgeRating: 12 } },
  ],
  chest: [
    { name: 'Enchant Chest - Exceptional Stats', id: 24003, enchant: 2661, stats: { stamina: 6, strength: 6, agility: 6, intellect: 6 } },
    { name: 'Enchant Chest - Major Resilience', id: 28270, enchant: 2933, stats: { resilienceRating: 15 } },
  ],
  wrist: [
    { name: 'Enchant Bracer - Fortitude', id: 22533, enchant: 2649, stats: { stamina: 12 } },
    { name: 'Enchant Bracer - Major Defense', id: 22530, enchant: 2648, stats: { defenseRating: 12 } },
    { name: 'Enchant Bracer - Spellpower', id: 22534, enchant: 2650, stats: { spellDamage: 15 } },
  ],
  hands: [
    { name: 'Enchant Gloves - Major Strength', spell: 33995, enchant: 684, stats: { strength: 15 } }, // trainer-taught: link by spell
    { name: 'Enchant Gloves - Spell Strike', id: 28271, enchant: 2935, stats: { spellHitRating: 15 } },
    { name: 'Enchant Gloves - Major Spellpower', id: 28272, enchant: 2937, stats: { spellDamage: 20 } },
  ],
  legs: [
    { name: 'Runic Spellthread', id: 24274, enchant: 2748, stats: { spellDamage: 35, stamina: 20 } },
    { name: 'Nethercleft Leg Armor', id: 29536, enchant: 3013, stats: { stamina: 40, agility: 12 } },
  ],
  feet: [
    { name: 'Enchant Boots - Dexterity', id: 22544, enchant: 2657, stats: { agility: 12 } },
    { name: 'Enchant Boots - Fortitude', id: 22543, enchant: 2649, stats: { stamina: 12 } },
  ],
  weapon: [
    { name: 'Enchant Weapon - Major Spellpower', id: 22555, enchant: 2669, stats: { spellDamage: 40 } },
  ],
  offhand: [
    { name: 'Enchant Shield - Major Stamina', id: 28282, enchant: 1071, stats: { stamina: 18 } },
    { name: 'Enchant Shield - Resilience', spell: 44383, enchant: 3229, stats: { resilienceRating: 12 } }, // link by spell (no scroll item)
    // Formula 22540 / spell 27946 (+15 block rating). EffectID 2655 = "+15 Shield Block Rating"
    // (wago.tools DB2, verified against known enchants). wowsims doesn't model it; Sixty Upgrades does.
    { name: 'Enchant Shield - Shield Block', id: 22540, enchant: 2655, stats: { blockRating: 15 } },
  ],
  // Ring enchants apply to BOTH rings but require Enchanting.
  ring: [
    { name: 'Enchant Ring - Spellpower', id: 22536, enchant: 2928, stats: { spellDamage: 12 }, profession: 'Enchanting' },
    { name: 'Enchant Ring - Stats', id: 22538, enchant: 2931, stats: { stamina: 4, strength: 4, agility: 4, intellect: 4 }, profession: 'Enchanting' },
  ],
};

import { score } from './scoring.js';
import { CURRENT_PHASE } from './gems.js';

// Shoulder inscriptions are Aldor/Scryer rep-locked, so the one a player is wearing reveals their
// faction — no need to ask. Map a shoulder enchant id -> faction; null for anything else.
const SHOULDER_FACTION = {};
for (const e of ENCHANTS.shoulder) if (e.faction && e.enchant) SHOULDER_FACTION[e.enchant] = e.faction;
export function factionFromEnchant(enchantId) {
  return SHOULDER_FACTION[enchantId] || null;
}
// Detect faction from the equipped shoulder's inscription; null if none recognized (consider both).
export function detectFaction(items = []) {
  const sh = items.find((it) => it.slot === 'shoulder' && it.equipped) || items.find((it) => it.slot === 'shoulder');
  return sh ? factionFromEnchant(sh.enchantId) : null;
}

// Best enchant for a slot under a goal. Enchants gated by a profession are excluded unless the
// player has it (perks.names). Faction-locked enchants (Aldor/Scryer shoulder inscriptions) are
// excluded unless they match opts.faction; with no faction given, all are considered. Enchants are
// phase-gated like gems: an enchant above `opts.maxPhase` (default CURRENT_PHASE) is skipped, so a
// later-content enchant (e.g. Cloak - Steelweave, phase 5) isn't recommended before it exists.
export function bestEnchant(slot, weights, perks = { names: [] }, opts = {}) {
  const list = ENCHANTS[slot];
  if (!list) return null;
  const maxPhase = opts.maxPhase ?? CURRENT_PHASE;
  let best = null;
  for (const e of list) {
    if ((e.phase || 1) > maxPhase) continue;
    if (e.profession && !perks.names.includes(e.profession)) continue;
    if (e.faction && opts.faction && e.faction !== opts.faction) continue;
    const s = score(e.stats, weights);
    if (!best || s > best.score) best = { enchant: e, score: s };
  }
  return best;
}
