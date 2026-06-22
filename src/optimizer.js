// The optimizer: pick the best LEGAL set from a pool of owned items.
// - Objective: 'spellPower' (threat, matches the sheet) or 'ehp' (survival).
// - Gates (hard constraints): crit immunity always; uncrushable when required.
// Provides an exhaustive solver (guaranteed optimal, small pools) and a fast
// greedy+repair heuristic, which should agree on tractable pools.

import { aggregate, justicarBonuses } from './model.js';
import { evaluateSet } from './character.js';

const OBJECTIVES = {
  spellPower: (e) => e.spellPower,
  ehp: (e) => e.ehpPhysical ?? 0,
};

import { BASE, CAPS } from './constants.js';

function gatesPass(evald, gates = {}) {
  const critOk = gates.raid === false ? evald.heroicCritImmune : evald.raidCritImmune;
  const crushOk = !gates.requireUncrushable || evald.uncrushable;
  return { critOk, crushOk, all: critOk && crushOk };
}

// How far a set is from satisfying the required gates, in % units (0 = legal).
// Lets the repair step reward partial progress instead of only full gate passes.
function gateDeficit(evald, gates = {}) {
  const critTarget = gates.raid === false ? BASE.heroicBossCritVsPlayer : BASE.bossCritVsPlayer;
  const critDef = Math.max(0, critTarget - evald.critReduction);
  const crushDef = gates.requireUncrushable
    ? Math.max(0, CAPS.uncrushableCombined - evald.totalAvoidanceWithHS)
    : 0;
  return critDef + crushDef;
}

function build(selection, goal) {
  const items = Object.values(selection);
  const agg = aggregate(items, goal);
  const evald = evaluateSet(agg);
  return { selection, items, agg, evald, setBonuses: justicarBonuses(items) };
}

// Exhaustive: cartesian product over slots. Guarded against blow-up.
export function optimizeExhaustive(pool, goal) {
  const slots = Object.keys(pool);
  const space = slots.reduce((p, s) => p * pool[s].length, 1);
  if (space > 500000) throw new Error(`Exhaustive space too large (${space}); use the heuristic.`);
  const objFn = OBJECTIVES[goal.objective];
  let best = null;

  const rec = (i, sel) => {
    if (i === slots.length) {
      const b = build(sel, goal);
      if (gatesPass(b.evald, goal.gates).all) {
        const v = objFn(b.evald);
        if (!best || v > best.objectiveValue) best = { ...b, objectiveValue: v, legal: true };
      }
      return;
    }
    for (const it of pool[slots[i]]) rec(i + 1, { ...sel, [slots[i]]: it });
  };
  rec(0, {});
  return best; // null if no legal set exists
}

// Heuristic: start from the best-objective item per slot, then repair toward the
// gates by applying the single swap that satisfies the most gates with the least
// objective loss, until legal (or no improving swap remains).
export function optimizeHeuristic(pool, goal) {
  const slots = Object.keys(pool);
  const objFn = OBJECTIVES[goal.objective];

  const sel = {};
  for (const s of slots) {
    sel[s] = pool[s].slice().sort(
      (a, b) => objFn(evaluateSet(aggregate([b], goal))) - objFn(evaluateSet(aggregate([a], goal)))
    )[0];
  }
  let cur = build(sel, goal);

  for (let guard = 0; guard < 200; guard++) {
    const curDef = gateDeficit(cur.evald, goal.gates);
    if (curDef <= 1e-9) break; // legal
    // Among swaps that make progress, pick the most efficient: most deficit removed
    // per unit of objective sacrificed (so high-objective slots are kept longest).
    let bestSwap = null;
    for (const s of slots) {
      for (const cand of pool[s]) {
        if (cand === sel[s]) continue;
        const trial = build({ ...sel, [s]: cand }, goal);
        const def = gateDeficit(trial.evald, goal.gates);
        const dRed = curDef - def;
        if (dRed <= 1e-9) continue; // no progress
        const objLoss = objFn(cur.evald) - objFn(trial.evald);
        // free/beneficial swaps (no objective loss) are strictly best
        const efficiency = objLoss <= 0 ? Infinity : dRed / objLoss;
        const swap = { s, cand, def, efficiency, trial };
        if (!bestSwap || swap.efficiency > bestSwap.efficiency) bestSwap = swap;
      }
    }
    if (!bestSwap) break; // no progress possible
    sel[bestSwap.s] = bestSwap.cand;
    cur = bestSwap.trial;
  }

  const legal = gatesPass(cur.evald, goal.gates).all;
  return { ...cur, objectiveValue: objFn(cur.evald), legal };
}

// Convenience wrapper: heuristic by default, exhaustive when asked (and feasible).
export function optimize(pool, goal, { exhaustive = false } = {}) {
  return exhaustive ? optimizeExhaustive(pool, goal) : optimizeHeuristic(pool, goal);
}
