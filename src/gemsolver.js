// Gem/enchant solver — recommends the ideal gems and enchants for a goal, respecting the
// player's professions. This is the gem/enchant half of M3: a recommendation engine over
// the curated gem/enchant DBs. (Socket-bonus-worth-it matching is deferred until the addon
// exports per-item socket-bonus values; tank gemming is typically all-stamina anyway.)

import { bestGem, bestMeta } from './gems.js';
import { bestEnchant, ENCHANTS } from './enchants.js';
import { STAT_KEYS } from './model.js';

const SOCKET_COLORS = { socketRed: 'red', socketYellow: 'yellow', socketBlue: 'blue' };

function addStats(into, stats, mult = 1) {
  for (const [k, v] of Object.entries(stats)) into[k] = (into[k] || 0) + v * mult;
}

// Recommend gems for a socket-count block, e.g. { socketRed:1, socketYellow:1,
// socketBlue:1, socketMeta:1 }. Returns the chosen gems and the stats they add.
export function recommendGems(socketCounts = {}, weights, perks = {}) {
  const choices = [];
  const stats = {};
  for (const [key, color] of Object.entries(SOCKET_COLORS)) {
    const n = socketCounts[key] || 0;
    if (!n) continue;
    const pick = bestGem(weights, { socketColor: color, jewelcrafting: !!perks.jcGems });
    if (pick) {
      for (let i = 0; i < n; i++) choices.push({ socket: color, ...pick.gem });
      addStats(stats, pick.gem.stats, n);
    }
  }
  if (socketCounts.socketMeta) {
    const m = bestMeta(weights);
    if (m) { choices.push({ socket: 'meta', ...m.gem }); addStats(stats, m.gem.stats); }
  }
  return { choices, stats };
}

// Recommend an enchant per enchantable slot present in `slots` (an array of slot names).
// Ring enchants apply to BOTH rings, so a 'ring' slot contributes its enchant twice.
export function recommendEnchants(slots = [], weights, perks = { names: [] }) {
  const choices = {};
  const stats = {};
  for (const slot of slots) {
    if (!ENCHANTS[slot]) continue;
    const pick = bestEnchant(slot, weights, perks);
    if (!pick) continue;
    choices[slot] = pick.enchant;
    addStats(stats, pick.enchant.stats, slot === 'ring' ? 2 : 1);
  }
  return { choices, stats };
}

// Full loadout recommendation: gems for the set's sockets + enchants for its slots.
// `set` is the list of owned/equipped items (each with .slot and .stats incl. socket
// counts). Returns gem + enchant choices and the combined added stats.
export function solveLoadout(set, weights, perks = { names: [] }) {
  const socketCounts = {};
  for (const it of set) {
    for (const k of ['socketRed', 'socketYellow', 'socketBlue', 'socketMeta']) {
      socketCounts[k] = (socketCounts[k] || 0) + ((it.stats && it.stats[k]) || 0);
    }
  }
  const slots = [...new Set(set.map((i) => i.slot).filter(Boolean))];
  const gems = recommendGems(socketCounts, weights, perks);
  const enchants = recommendEnchants(slots, weights, perks);
  const added = {};
  for (const k of STAT_KEYS) {
    const v = (gems.stats[k] || 0) + (enchants.stats[k] || 0);
    if (v) added[k] = v;
  }
  return { gems, enchants, addedStats: added };
}
