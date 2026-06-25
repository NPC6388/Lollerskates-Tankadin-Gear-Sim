// Gem/enchant solver — recommends the ideal gems and enchants for a goal, respecting the
// player's professions. This is the gem/enchant half of M3: a recommendation engine over
// the curated gem/enchant DBs.
//
// Socket-bonus-worth-it matching is per item: for each socketed piece we compare filling
// every socket with the globally best gem (ignore color, forfeit the bonus) against matching
// each socket's color to activate the bonus and adding it, then keep whichever scores higher
// by the goal's weights. This needs the v8 addon export (item.sockets = full color layout,
// item.socketBonus = the prize); v7 imports fall back to currently-empty sockets only.

import { bestGem, bestMeta } from './gems.js';
import { bestEnchant, ENCHANTS } from './enchants.js';
import { score } from './scoring.js';
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

// An item's socket-color layout: prefer the parsed `sockets` (v8: every socket), else
// derive from socket-count stat keys (v7: currently-empty sockets only).
function itemSockets(item) {
  if (item.sockets) return item.sockets;
  const s = item.stats || {};
  const out = {};
  if (s.socketRed) out.red = s.socketRed;
  if (s.socketYellow) out.yellow = s.socketYellow;
  if (s.socketBlue) out.blue = s.socketBlue;
  if (s.socketMeta) out.meta = s.socketMeta;
  return out;
}

// Plan one item's gems: decide per item whether matching its socket colors to earn the
// socket bonus beats slotting the globally best gem in every socket. Returns the chosen
// gems and the stats they add (relative to empty sockets — combine with item.baseStats, not
// the resolved item.stats, to avoid double-counting the gems already worn).
function planItemGems(item, weights, perks = {}) {
  const sockets = itemSockets(item);
  const colored = [];
  for (const color of ['red', 'yellow', 'blue']) {
    for (let i = 0; i < (sockets[color] || 0); i++) colored.push(color);
  }
  const choices = [];
  const stats = {};

  if (colored.length) {
    // Option A — ignore the bonus: globally best gem in every socket.
    const raw = bestGem(weights, { jewelcrafting: !!perks.jcGems });
    const scoreA = raw ? raw.score * colored.length : 0;

    // Option B — chase the bonus: best color-fitting gem per socket, then add the bonus.
    let optB = null;
    if (item.socketBonus) {
      let sB = 0, feasible = true;
      const bChoices = [], bStats = {};
      for (const color of colored) {
        const pick = bestGem(weights, { socketColor: color, matchColor: true, jewelcrafting: !!perks.jcGems });
        if (!pick) { feasible = false; break; }
        sB += pick.score;
        bChoices.push({ socket: color, ...pick.gem });
        addStats(bStats, pick.gem.stats);
      }
      if (feasible) {
        const bonusStats = { [item.socketBonus.stat]: item.socketBonus.value };
        sB += score(bonusStats, weights);
        addStats(bStats, bonusStats);
        optB = { score: sB, choices: bChoices, stats: bStats };
      }
    }

    if (optB && optB.score > scoreA) {
      choices.push(...optB.choices);
      addStats(stats, optB.stats);
    } else if (raw) {
      for (const color of colored) choices.push({ socket: color, ...raw.gem });
      addStats(stats, raw.gem.stats, colored.length);
    }
  }

  // Meta socket: always the best meta for the goal (separate from the color-bonus decision).
  const metaN = sockets.meta || 0;
  if (metaN) {
    const m = bestMeta(weights);
    if (m) {
      for (let i = 0; i < metaN; i++) choices.push({ socket: 'meta', ...m.gem });
      addStats(stats, m.gem.stats, metaN);
    }
  }
  return { choices, stats };
}

// Full loadout recommendation: gems for each item's sockets (with per-item socket-bonus
// worth-it) + enchants for its slots. `set` is the list of owned/equipped items. Returns gem
// + enchant choices and the combined added stats (relative to base — see planItemGems).
export function solveLoadout(set, weights, perks = { names: [] }) {
  const gemChoices = [];
  const gemStats = {};
  for (const it of set) {
    const plan = planItemGems(it, weights, perks);
    gemChoices.push(...plan.choices);
    addStats(gemStats, plan.stats);
  }
  const slots = [...new Set(set.map((i) => i.slot).filter(Boolean))];
  const enchants = recommendEnchants(slots, weights, perks);
  const added = {};
  for (const k of STAT_KEYS) {
    const v = (gemStats[k] || 0) + (enchants.stats[k] || 0);
    if (v) added[k] = v;
  }
  return { gems: { choices: gemChoices, stats: gemStats }, enchants, addedStats: added };
}
