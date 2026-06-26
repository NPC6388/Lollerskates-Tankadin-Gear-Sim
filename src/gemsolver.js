// Gem/enchant solver — recommends the ideal gems and enchants for a goal, respecting the
// player's professions. This is the gem/enchant half of M3: a recommendation engine over
// the curated gem/enchant DBs.
//
// Socket-bonus-worth-it matching is per item: for each socketed piece we compare filling
// every socket with the globally best gem (ignore color, forfeit the bonus) against matching
// each socket's color to activate the bonus and adding it, then keep whichever scores higher
// by the goal's weights. This needs the v8 addon export (item.sockets = full color layout,
// item.socketBonus = the prize); v7 imports fall back to currently-empty sockets only.

import { bestGem, bestMeta, gemColors } from './gems.js';
import { bestEnchant, ENCHANTS } from './enchants.js';
import { score } from './scoring.js';
import { aggregate, STAT_KEYS } from './model.js';
import { evaluateSet } from './character.js';

// Cap-aware weight selection. The survival "uncrushable" scale loads a crush-removal PREMIUM
// onto avoidance/defense (block 2.54, defense 2.0, dodge 1.76) that only pays off while you're
// BELOW the crush cap. Once the set is already uncrushable, that premium is wasted — gemming
// more avoidance does nothing — so switch to the face-value (EHP) scale. Mirrors the threat
// below-cap/at-cap switch. With no atCapWeights given, weights pass through unchanged.
export function gemWeights(weights, { atCapWeights, uncrushable } = {}) {
  return atCapWeights && uncrushable ? atCapWeights : weights;
}

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
    const counts = colorCounts(choices); // meta requirement is judged on the colored gems above
    const m = bestMeta(weights, { counts });
    if (m) { choices.push({ socket: 'meta', ...m.gem }); addStats(stats, m.gem.stats); }
  }
  return { choices, stats };
}

// Tally the colors of the chosen (non-meta) gems for meta-activation checks.
function colorCounts(choices) {
  const counts = { red: 0, yellow: 0, blue: 0 };
  for (const c of choices) for (const col of gemColors(c)) if (counts[col] != null) counts[col]++;
  return counts;
}

// Recommend an enchant per enchantable slot present in `slots` (an array of slot names).
// Ring enchants apply to BOTH rings, so a 'ring' slot contributes its enchant twice.
export function recommendEnchants(slots = [], weights, perks = { names: [] }, opts = {}) {
  const choices = {};
  const stats = {};
  for (const slot of slots) {
    if (!ENCHANTS[slot]) continue;
    const pick = bestEnchant(slot, weights, perks, opts);
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
export function planItemGems(item, weights, perks = {}, maxPhase) {
  const gemOpts = (extra) => ({ jewelcrafting: !!perks.jcGems, ...(maxPhase ? { maxPhase } : {}), ...extra });
  const sockets = itemSockets(item);
  const colored = [];
  for (const color of ['red', 'yellow', 'blue']) {
    for (let i = 0; i < (sockets[color] || 0); i++) colored.push(color);
  }
  const choices = [];
  const stats = {};

  if (colored.length) {
    // Option A — ignore the bonus: globally best gem in every socket.
    const raw = bestGem(weights, gemOpts());
    const scoreA = raw ? raw.score * colored.length : 0;

    // Option B — chase the bonus: best color-fitting gem per socket, then add the bonus.
    let optB = null;
    if (item.socketBonus) {
      let sB = 0, feasible = true;
      const bChoices = [], bStats = {};
      for (const color of colored) {
        const pick = bestGem(weights, gemOpts({ socketColor: color, matchColor: true }));
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

  // Meta is chosen later (in solveLoadout), once ALL items' colored gems are known, so the
  // meta's activation requirement can be judged against the whole set's gem colors.
  return { choices, stats, metaCount: sockets.meta || 0 };
}

// Full loadout recommendation: gems for each item's sockets (with per-item socket-bonus
// worth-it) + enchants for its slots. `set` is the list of owned/equipped items. Returns gem
// + enchant choices and the combined added stats (relative to base — see planItemGems).
// `opts.atCapWeights` (the face-value/EHP scale) is used in place of `weights` once the set
// is ALREADY uncrushable, so the solver stops over-gemming capped avoidance/defense.
export function solveLoadout(set, weights, perks = { names: [] }, opts = {}) {
  let w = weights;
  if (opts.atCapWeights) {
    const { uncrushable } = evaluateSet(aggregate(set));
    w = gemWeights(weights, { atCapWeights: opts.atCapWeights, uncrushable });
  }
  const maxPhase = opts.maxPhase; // cap gem choices to a content phase (default: gems.js CURRENT_PHASE)
  const metaOpts = maxPhase ? { maxPhase } : {};
  const gemChoices = [];
  const gemStats = {};
  let metaSlots = 0;
  for (const it of set) {
    const plan = planItemGems(it, w, perks, maxPhase);
    gemChoices.push(...plan.choices);
    addStats(gemStats, plan.stats);
    metaSlots += plan.metaCount;
  }
  // Meta gems last: pick the best meta the set's colored gems can ACTIVATE (a meta grants its
  // stats only when its color requirement is met). If none can activate, still socket the best
  // meta but flag it inactive and DON'T count its stats. `metas` lets the readout warn.
  const counts = colorCounts(gemChoices);
  const metas = [];
  for (let i = 0; i < metaSlots; i++) {
    let m = bestMeta(w, { counts, ...metaOpts }); let active = true;
    if (!m) { m = bestMeta(w, metaOpts); active = false; }
    if (m) {
      gemChoices.push({ socket: 'meta', ...m.gem });
      if (active) addStats(gemStats, m.gem.stats);
      metas.push({ name: m.gem.name, requires: m.gem.requires, active });
    }
  }
  const slots = [...new Set(set.map((i) => i.slot).filter(Boolean))];
  const enchants = recommendEnchants(slots, w, perks, maxPhase ? { maxPhase } : {});
  const added = {};
  for (const k of STAT_KEYS) {
    const v = (gemStats[k] || 0) + (enchants.stats[k] || 0);
    if (v) added[k] = v;
  }
  return { gems: { choices: gemChoices, stats: gemStats, metas }, enchants, addedStats: added };
}
