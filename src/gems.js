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
  { name: 'Bold Living Ruby', id: 24027, color: 'red', phase: 1, stats: { strength: 8 } },
  { name: 'Delicate Living Ruby', id: 24028, color: 'red', phase: 1, stats: { agility: 8 } },
  { name: 'Subtle Living Ruby', id: 24032, color: 'red', phase: 1, stats: { dodgeRating: 8 } },
  { name: 'Flashing Living Ruby', id: 24036, color: 'red', phase: 1, stats: { parryRating: 8 } },
  { name: 'Runed Living Ruby', id: 24030, color: 'red', phase: 1, stats: { spellDamage: 9 } },
  { name: 'Runed Ornate Ruby', id: 28118, color: 'red', phase: 1, unique: true, stats: { spellDamage: 12 } }, // +12 spell dmg, UNIQUE (max 1) — only +3 over the workhorse, so not used for bulk fill

  // --- Yellow (pure) — phase 1 rares (rare value is +8, not +10) ---
  { name: 'Thick Dawnstone', id: 24052, color: 'yellow', phase: 1, stats: { defenseRating: 8 } },
  { name: 'Rigid Dawnstone', id: 24051, color: 'yellow', phase: 1, stats: { hitRating: 8 } },
  { name: 'Great Dawnstone', id: 31861, color: 'yellow', phase: 1, stats: { spellHitRating: 8 } },
  { name: 'Brilliant Dawnstone', id: 24047, color: 'yellow', phase: 1, stats: { intellect: 8 } },
  { name: 'Mystic Dawnstone', id: 24053, color: 'yellow', phase: 1, stats: { resilienceRating: 8 } },

  // --- Blue (stamina) — phase 1 rare workhorse ---
  { name: 'Solid Star of Elune', id: 24033, color: 'blue', phase: 1, stats: { stamina: 12 } },

  // --- Orange (red+yellow hybrids) ---
  { name: 'Inscribed Noble Topaz', id: 24058, color: 'orange', phase: 1, stats: { strength: 4, spellCritRating: 4 } },
  { name: 'Glinting Noble Topaz', id: 24061, color: 'orange', phase: 1, stats: { agility: 4, hitRating: 4 } },
  { name: 'Veiled Noble Topaz', id: 31867, color: 'orange', phase: 1, stats: { spellDamage: 5, spellHitRating: 4 } },
  { name: 'Potent Noble Topaz', id: 24059, color: 'orange', phase: 1, stats: { spellDamage: 5, spellCritRating: 4 } },
  { name: 'Etched Fire Opal', id: 30559, color: 'orange', phase: 2, epic: true, stats: { strength: 5, hitRating: 4 } },
  { name: 'Potent Fire Opal', id: 30588, color: 'orange', phase: 2, epic: true, stats: { spellDamage: 6, spellCritRating: 4 } },
  { name: 'Glistening Fire Opal', id: 30585, color: 'orange', phase: 2, epic: true, stats: { defenseRating: 5, agility: 4 } },
  { name: 'Stalwart Fire Opal', id: 30554, color: 'orange', phase: 2, epic: true, stats: { defenseRating: 5, dodgeRating: 4 } },
  { name: 'Glimmering Fire Opal', id: 30558, color: 'orange', phase: 2, epic: true, stats: { defenseRating: 4, parryRating: 5 } },

  // --- Purple (red+blue) — stamina + red-stat hybrids ---
  { name: 'Sovereign Nightseye', id: 24054, color: 'purple', phase: 1, stats: { stamina: 6, strength: 4 } },
  { name: 'Glowing Nightseye', id: 24056, color: 'purple', phase: 1, stats: { stamina: 6, spellDamage: 5 } },
  { name: 'Regal Nightseye', id: 35707, color: 'purple', phase: 1, stats: { stamina: 6, dodgeRating: 4 } },
  { name: 'Shifting Nightseye', id: 24055, color: 'purple', phase: 1, stats: { stamina: 6, agility: 4 } },
  { name: 'Sovereign Tanzanite', id: 30546, color: 'purple', phase: 2, epic: true, stats: { stamina: 6, strength: 5 } },
  { name: 'Glowing Tanzanite', id: 30555, color: 'purple', phase: 2, epic: true, stats: { stamina: 6, spellDamage: 6 } },
  { name: 'Regal Tanzanite', id: 30563, color: 'purple', phase: 2, epic: true, stats: { stamina: 6, dodgeRating: 5 } },
  { name: 'Shifting Tanzanite', id: 30549, color: 'purple', phase: 2, epic: true, stats: { stamina: 6, agility: 5 } },
  { name: "Defender's Tanzanite", id: 30566, color: 'purple', phase: 2, epic: true, stats: { stamina: 6, parryRating: 5 } },

  // --- Green (yellow+blue) — stamina + yellow-stat hybrids ---
  { name: 'Enduring Talasite', id: 24062, color: 'green', phase: 1, stats: { stamina: 6, defenseRating: 4 } },
  { name: 'Steady Talasite', id: 33782, color: 'green', phase: 1, stats: { stamina: 6, resilienceRating: 4 } },
  { name: 'Unstable Peridot', id: 32635, color: 'green', phase: 1, stats: { stamina: 6, intellect: 4 } },
  { name: 'Enduring Chrysoprase', id: 30590, color: 'green', phase: 2, epic: true, stats: { stamina: 6, defenseRating: 5 } },
  { name: 'Steady Chrysoprase', id: 30592, color: 'green', phase: 2, epic: true, stats: { stamina: 6, resilienceRating: 5 } },
  { name: 'Timeless Chrysoprase', id: 30583, color: 'green', phase: 2, epic: true, stats: { stamina: 6, intellect: 5 } },
  { name: 'Vivid Chrysoprase', id: 30605, color: 'green', phase: 2, epic: true, stats: { stamina: 6, spellHitRating: 5 } },

  // --- Future content (recorded, gated out until that phase) ---
  { name: 'Steady Seaspray Emerald', id: 35758, color: 'green', phase: 3, epic: true, stats: { stamina: 7, resilienceRating: 5 } },
  { name: 'Charmed Amani Jewel', id: 34256, color: 'blue', phase: 3, epic: true, stats: { stamina: 15 } }, // Zul'Aman
];

// Meta gems (single meta socket). `requires` is the activation condition; the solver
// assumes a typical stamina-heavy tank build meets it and flags if not.
export const META_GEMS = [
  { name: 'Powerful Earthstorm Diamond', id: 25896, meta: true, phase: 1, stats: { stamina: 18 }, requires: '3+ blue' },
  { name: 'Eternal Earthstorm Diamond', id: 35501, meta: true, phase: 1, stats: { defenseRating: 12, blockValueBonus: 5 }, requires: '2+ blue' },
  { name: 'Relentless Earthstorm Diamond', id: 32409, meta: true, phase: 1, stats: { agility: 12 }, requires: '2+ red' }, // note: +3% crit damage (unscored)
  { name: 'Imbued Unstable Diamond', id: 32641, meta: true, phase: 1, stats: { spellDamage: 14 }, requires: 'more red than blue' },
];

import { score } from './scoring.js';

// Best non-meta gem for a goal. If `socketColor` is given and `matchColor` is true, only
// gems that fit that color are considered (to keep a socket bonus); otherwise the highest-
// scoring gem regardless of color (the usual tank choice of all-stamina). jcOnly gems are
// excluded unless `jewelcrafting`. Gems above `maxPhase` (default CURRENT_PHASE) are skipped.
// UNIQUE gems (max 1 owned, e.g. Runed Ornate Ruby) are skipped for this bulk-fill pick unless
// `allowUnique` — the workhorse must be a gem you can slot in every socket. (Placing the single
// unique gem in the best socket for its small marginal gain is a TODO, tracked in SESSION_LOG.)
export function bestGem(weights, { socketColor = null, matchColor = false, jewelcrafting = false, allowUnique = false, maxPhase = CURRENT_PHASE } = {}) {
  let best = null;
  for (const g of GEMS) {
    if (g.phase > maxPhase) continue;
    if (g.jcOnly && !jewelcrafting) continue;
    if (g.unique && !allowUnique) continue;
    if (matchColor && socketColor && !FITS[g.color].includes(socketColor)) continue;
    const s = score(g.stats, weights);
    if (!best || s > best.score) best = { gem: g, score: s };
  }
  return best;
}

// Colors a gem contributes toward META activation. A hybrid counts for BOTH of its colors
// (TBC: a purple red+blue gem is 1 red AND 1 blue for a "3 blue" / "more red than blue" meta).
export function gemColors(gem) { return FITS[gem.color] || (gem.color ? [gem.color] : []); }

// Does a meta's `requires` hold for the set's gem color counts {red,yellow,blue}? Meta gems
// only grant their stats once activated, so the solver must respect this. Unknown requirement
// strings are treated as met (don't silently drop a real meta).
export function metaActivated(meta, counts = {}) {
  const red = counts.red || 0, blue = counts.blue || 0, yellow = counts.yellow || 0;
  const r = meta.requires;
  if (!r) return true;
  let m;
  if ((m = r.match(/(\d+)\+\s*blue/))) return blue >= +m[1];
  if ((m = r.match(/(\d+)\+\s*red/))) return red >= +m[1];
  if ((m = r.match(/(\d+)\+\s*yellow/))) return yellow >= +m[1];
  if (/more red than blue/.test(r)) return red > blue;
  if (/more blue than red/.test(r)) return blue > red;
  return true;
}

// Best meta for a goal. When `counts` (the set's gem colors) is given, only metas whose
// activation requirement those colors satisfy are considered, so we never recommend a meta
// that would sit dark. Returns null if no meta can activate.
export function bestMeta(weights, { maxPhase = CURRENT_PHASE, counts = null, exclude = null } = {}) {
  let best = null;
  for (const g of META_GEMS) {
    if (g.phase > maxPhase) continue;
    if (exclude && exclude.includes(g.name)) continue;
    if (counts && !metaActivated(g, counts)) continue;
    const s = score(g.stats, weights);
    if (!best || s > best.score) best = { gem: g, score: s };
  }
  return best;
}

export { FITS };
