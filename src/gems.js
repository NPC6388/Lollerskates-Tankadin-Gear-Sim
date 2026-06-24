// Gem database — a LEAN, Pareto-curated pool of the gems a Prot Paladin actually slots in
// TBC, with stats validated against the in-game tooltips (see GEM_ENCHANT_REVIEW.md). It's
// not exhaustive: it keeps the best gem per relevant stat plus the key stamina hybrids, so
// the solver can recommend optimally without carrying dominated entries.
//
// Stats use the same keys as the weight scales / model so a gem can be scored directly.
// `color` is the gem's socket color; `fits` lists the socket colors it satisfies (hybrids
// fit two). Meta gems are separate.
//
// Stats not in the weight scales are intentionally OMITTED (per the guide's math): attack
// power, spell crit, and the meta crit-damage proc carry no weight, so gems that differ
// only by those reduce to their scored stats. Such secondary stats are recorded in `// note`
// comments for auditing, not scored.
//
// `phase` gates availability to the player's current content (CURRENT_PHASE). Gems from
// later content (Seaspray Emerald = p3, Charmed Amani Jewel = Zul'Aman) are kept in the data
// but excluded from recommendations until that phase.
//
// NOTE: the addon already folds CURRENTLY-socketed gem stats into item stats, so the current
// set is evaluated exactly without this DB. This DB is for the gem SOLVER — proposing better
// gems for empty/owned sockets.

// The phase the player is currently in; the solver won't recommend gems above this.
export const CURRENT_PHASE = 2;

// color -> which socket colors it satisfies for a socket bonus
const FITS = {
  red: ['red'], yellow: ['yellow'], blue: ['blue'],
  orange: ['red', 'yellow'], green: ['yellow', 'blue'], purple: ['red', 'blue'],
};

// { name, color, phase, stats, epic?, jcOnly? }
export const GEMS = [
  // --- Red (pure) — phase 1 rares ---
  { name: 'Bold Living Ruby', color: 'red', phase: 1, stats: { strength: 8 } },
  { name: 'Delicate Living Ruby', color: 'red', phase: 1, stats: { agility: 8 } },
  { name: 'Subtle Living Ruby', color: 'red', phase: 1, stats: { dodgeRating: 8 } },
  { name: 'Flashing Living Ruby', color: 'red', phase: 1, stats: { parryRating: 8 } },
  { name: 'Runed Living Ruby', color: 'red', phase: 1, stats: { spellDamage: 9 } },

  // --- Yellow (pure) — phase 1 rares (rare value is +8, not +10) ---
  { name: 'Thick Dawnstone', color: 'yellow', phase: 1, stats: { defenseRating: 8 } },
  { name: 'Rigid Dawnstone', color: 'yellow', phase: 1, stats: { hitRating: 8 } },
  { name: 'Great Dawnstone', color: 'yellow', phase: 1, stats: { spellHitRating: 8 } },
  { name: 'Brilliant Dawnstone', color: 'yellow', phase: 1, stats: { intellect: 8 } },
  { name: 'Mystic Dawnstone', color: 'yellow', phase: 1, stats: { resilienceRating: 8 } },

  // --- Blue (stamina) — phase 1 rare workhorse ---
  { name: 'Solid Star of Elune', color: 'blue', phase: 1, stats: { stamina: 12 } },

  // --- Orange (red+yellow hybrids) ---
  { name: 'Inscribed Noble Topaz', color: 'orange', phase: 1, stats: { strength: 4 } }, // note: +4 spell crit (unscored)
  { name: 'Glinting Noble Topaz', color: 'orange', phase: 1, stats: { agility: 4, hitRating: 4 } },
  { name: 'Potent Noble Topaz', color: 'orange', phase: 1, stats: { spellDamage: 5 } }, // note: +4 spell crit (unscored)
  { name: 'Etched Fire Opal', color: 'orange', phase: 2, epic: true, stats: { strength: 5, hitRating: 4 } },
  { name: 'Potent Fire Opal', color: 'orange', phase: 2, epic: true, stats: { spellDamage: 6 } }, // note: +4 spell crit (unscored)
  { name: 'Glistening Fire Opal', color: 'orange', phase: 2, epic: true, stats: { defenseRating: 5, agility: 4 } },
  { name: 'Stalwart Fire Opal', color: 'orange', phase: 2, epic: true, stats: { defenseRating: 5, dodgeRating: 4 } },
  { name: 'Glimmering Fire Opal', color: 'orange', phase: 2, epic: true, stats: { defenseRating: 4, parryRating: 5 } },

  // --- Purple (red+blue) — stamina + red-stat hybrids ---
  { name: 'Sovereign Nightseye', color: 'purple', phase: 1, stats: { stamina: 6, strength: 4 } },
  { name: 'Glowing Nightseye', color: 'purple', phase: 1, stats: { stamina: 6, spellDamage: 5 } },
  { name: 'Regal Nightseye', color: 'purple', phase: 1, stats: { stamina: 6, dodgeRating: 4 } },
  { name: 'Shifting Nightseye', color: 'purple', phase: 1, stats: { stamina: 6, agility: 4 } },
  { name: 'Sovereign Tanzanite', color: 'purple', phase: 2, epic: true, stats: { stamina: 6, strength: 5 } },
  { name: 'Glowing Tanzanite', color: 'purple', phase: 2, epic: true, stats: { stamina: 6, spellDamage: 6 } },
  { name: 'Regal Tanzanite', color: 'purple', phase: 2, epic: true, stats: { stamina: 6, dodgeRating: 5 } },
  { name: 'Shifting Tanzanite', color: 'purple', phase: 2, epic: true, stats: { stamina: 6, agility: 5 } },
  { name: "Defender's Tanzanite", color: 'purple', phase: 2, epic: true, stats: { stamina: 6, parryRating: 5 } },

  // --- Green (yellow+blue) — stamina + yellow-stat hybrids ---
  { name: 'Enduring Talasite', color: 'green', phase: 1, stats: { stamina: 6, defenseRating: 4 } },
  { name: 'Steady Talasite', color: 'green', phase: 1, stats: { stamina: 6, resilienceRating: 4 } },
  { name: 'Unstable Peridot', color: 'green', phase: 1, stats: { stamina: 6, intellect: 4 } },
  { name: 'Enduring Chrysoprase', color: 'green', phase: 2, epic: true, stats: { stamina: 6, defenseRating: 5 } },
  { name: 'Steady Chrysoprase', color: 'green', phase: 2, epic: true, stats: { stamina: 6, resilienceRating: 5 } },
  { name: 'Timeless Chrysoprase', color: 'green', phase: 2, epic: true, stats: { stamina: 6, intellect: 5 } },
  { name: 'Vivid Chrysoprase', color: 'green', phase: 2, epic: true, stats: { stamina: 6, spellHitRating: 5 } },

  // --- Future content (recorded, gated out until that phase) ---
  { name: 'Steady Seaspray Emerald', color: 'green', phase: 3, epic: true, stats: { stamina: 7, resilienceRating: 5 } },
  { name: 'Charmed Amani Jewel', color: 'blue', phase: 3, epic: true, stats: { stamina: 15 } }, // Zul'Aman
];

// Meta gems (single meta socket). `requires` is the activation condition; the solver
// assumes a typical stamina-heavy tank build meets it and flags if not.
export const META_GEMS = [
  { name: 'Powerful Earthstorm Diamond', meta: true, phase: 1, stats: { stamina: 18 }, requires: '3+ blue' },
  { name: 'Eternal Earthstorm Diamond', meta: true, phase: 1, stats: { defenseRating: 12, blockValueBonus: 5 }, requires: '2+ blue' },
  { name: 'Relentless Earthstorm Diamond', meta: true, phase: 1, stats: { agility: 12 }, requires: '2+ red' }, // note: +3% crit damage (unscored)
  { name: 'Imbued Unstable Diamond', meta: true, phase: 1, stats: { spellDamage: 14 }, requires: 'more red than blue' },
];

import { score } from './scoring.js';

// Best non-meta gem for a goal. If `socketColor` is given and `matchColor` is true, only
// gems that fit that color are considered (to keep a socket bonus); otherwise the highest-
// scoring gem regardless of color (the usual tank choice of all-stamina). jcOnly gems are
// excluded unless `jewelcrafting`. Gems above `maxPhase` (default CURRENT_PHASE) are skipped.
export function bestGem(weights, { socketColor = null, matchColor = false, jewelcrafting = false, maxPhase = CURRENT_PHASE } = {}) {
  let best = null;
  for (const g of GEMS) {
    if (g.phase > maxPhase) continue;
    if (g.jcOnly && !jewelcrafting) continue;
    if (matchColor && socketColor && !FITS[g.color].includes(socketColor)) continue;
    const s = score(g.stats, weights);
    if (!best || s > best.score) best = { gem: g, score: s };
  }
  return best;
}

export function bestMeta(weights, { maxPhase = CURRENT_PHASE } = {}) {
  let best = null;
  for (const g of META_GEMS) {
    if (g.phase > maxPhase) continue;
    const s = score(g.stats, weights);
    if (!best || s > best.score) best = { gem: g, score: s };
  }
  return best;
}

export { FITS };
