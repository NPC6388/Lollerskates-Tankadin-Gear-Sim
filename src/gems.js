// Gem database — a CURATED SEED of the gems a Prot Paladin actually uses in TBC, not an
// exhaustive list. Stats use the same keys as the weight scales / model so a gem can be
// scored directly. `socket` is the gem's color slot (for future socket-bonus matching);
// `fits` lists the socket colors it satisfies (hybrids fit two). Meta gems are separate.
//
// NOTE: the addon already folds CURRENTLY-socketed gem stats into item stats, so the
// current set is evaluated exactly without this DB. This DB is for the gem SOLVER —
// proposing better gems for empty/owned sockets. Expand with verified values as needed.

// color -> which socket colors it satisfies for a socket bonus
const FITS = {
  red: ['red'], yellow: ['yellow'], blue: ['blue'],
  orange: ['red', 'yellow'], green: ['yellow', 'blue'], purple: ['red', 'blue'],
};

// { name, color, stats, epic?, jcOnly? }
export const GEMS = [
  // Stamina (blue)
  { name: 'Solid Star of Elune', color: 'blue', stats: { stamina: 12 } },
  { name: 'Solid Empyrean Sapphire', color: 'blue', epic: true, stats: { stamina: 15 } },
  // Defense (yellow)
  { name: 'Thick Dawnstone', color: 'yellow', stats: { defenseRating: 10 } },
  { name: 'Thick Lionseye', color: 'yellow', epic: true, stats: { defenseRating: 12 } },
  // Spell damage (red)
  { name: 'Runed Living Ruby', color: 'red', stats: { spellDamage: 9 } },
  { name: 'Runed Crimson Spinel', color: 'red', epic: true, stats: { spellDamage: 12 } },
  // Hybrids (cover socket colors while keeping stamina)
  { name: 'Enduring Talasite', color: 'green', stats: { defenseRating: 4, stamina: 6 } },
  { name: 'Sovereign Nightseye', color: 'purple', stats: { spellDamage: 4, stamina: 6 } },
  { name: 'Sovereign Shadowsong Amethyst', color: 'purple', epic: true, stats: { spellDamage: 5, stamina: 7 } },
];

// Meta gems (single meta socket). `requires` is the activation condition; the solver
// assumes a typical stamina-heavy tank build meets it and flags if not.
export const META_GEMS = [
  { name: 'Powerful Earthstorm Diamond', meta: true, stats: { stamina: 18 }, requires: '3+ blue' },
  { name: 'Eternal Earthstorm Diamond', meta: true, stats: { defenseRating: 12, blockValueBonus: 5 }, requires: '2+ blue' },
];

import { score } from './scoring.js';

// Best non-meta gem for a goal. If `socketColor` is given and `matchColor` is true, only
// gems that fit that color are considered (to keep a socket bonus); otherwise the highest-
// scoring gem regardless of color (the usual tank choice of all-stamina). jcOnly gems are
// excluded unless `jewelcrafting`.
export function bestGem(weights, { socketColor = null, matchColor = false, jewelcrafting = false } = {}) {
  let best = null;
  for (const g of GEMS) {
    if (g.jcOnly && !jewelcrafting) continue;
    if (matchColor && socketColor && !FITS[g.color].includes(socketColor)) continue;
    const s = score(g.stats, weights);
    if (!best || s > best.score) best = { gem: g, score: s };
  }
  return best;
}

export function bestMeta(weights) {
  let best = null;
  for (const g of META_GEMS) {
    const s = score(g.stats, weights);
    if (!best || s > best.score) best = { gem: g, score: s };
  }
  return best;
}

export { FITS };
