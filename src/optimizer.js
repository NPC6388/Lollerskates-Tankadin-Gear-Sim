// The optimizer: pick the best LEGAL set from a pool of owned items.
// - Objective: a builtin ('spellPower' threat / 'ehp' survival), a weight-SCALE blend
//   ('scale' + goal.scale, for the ratio goals like EHP:threat 2:1), or a custom function.
// - Gates (hard constraints): crit immunity always; uncrushable when required (with an
//   optional relaxed crush target, e.g. AOE trash where the boss can't crush).
// Structural rules the pool builder handles: paired ring/trinket slots that must hold DISTINCT
// items, locked slots (force a specific item), and 2H exclusion (a tank keeps a shield).
// Provides an exhaustive solver (optimal, small pools) and a fast greedy+repair heuristic.

import { aggregate, justicarBonuses, sumStats } from './model.js';
import { evaluateSet } from './character.js';
import { score } from './scoring.js';
import { SCALES } from './weights.js';
import { BASE, CAPS } from './constants.js';

const BUILTIN_OBJECTIVES = {
  spellPower: (e) => e.spellPower,
  ehp: (e) => e.ehpPhysical ?? 0,
};

// Resolve a goal's objective into a fn(evald, agg, items) -> number.
//   goal.objective: 'spellPower' | 'ehp' | 'scale' | function
//   for 'scale', goal.scale names a SCALES entry (or goal.scaleWeights gives the weights);
//   the set is scored on its summed raw item stats (gems/enchants must be baked into stats).
function objectiveFn(goal) {
  if (typeof goal.objective === 'function') return goal.objective;
  if (goal.objective === 'scale') {
    const w = goal.scaleWeights || SCALES[goal.scale];
    if (!w) throw new Error('scale objective needs goal.scale or goal.scaleWeights');
    return (_e, _a, items) => score(sumStats(items), w);
  }
  const f = BUILTIN_OBJECTIVES[goal.objective];
  if (!f) throw new Error(`Unknown objective: ${goal.objective}`);
  return (e) => f(e);
}

// Build a slot pool from a flat item list: group by slot, expand paired ring/trinket slots
// (returning the distinct-groups that must hold different items), exclude 2H weapons, and
// apply locks. `lock` maps a slot key to an itemId (or item) to force into that slot.
const PAIRS = { ring: ['ring1', 'ring2'], trinket: ['trinket1', 'trinket2'] };
export function buildPool(items, { lock = {}, exclude2H = true } = {}) {
  const grouped = {};
  for (const it of items) {
    if (!it.slot) continue;
    if (exclude2H && it.equipLoc === 'INVTYPE_2HWEAPON') continue;
    (grouped[it.slot] ||= []).push(it);
  }
  const pool = {};
  const distinct = [];
  for (const [slot, list] of Object.entries(grouped)) {
    if (PAIRS[slot]) {
      const [a, b] = PAIRS[slot];
      pool[a] = list; pool[b] = list.slice();
      distinct.push([a, b]);
    } else pool[slot] = list;
  }
  const locked = {};
  for (const [slotKey, ref] of Object.entries(lock)) {
    const id = typeof ref === 'object' ? ref.itemId : ref;
    const found = (pool[slotKey] || items).find((it) => it.itemId === id);
    if (found) { pool[slotKey] = [found]; locked[slotKey] = found; }
  }
  return { pool, distinct, locked };
}

// Every distinct-group must hold unique itemIds.
function distinctOk(sel, distinct) {
  for (const group of distinct) {
    const ids = group.map((s) => sel[s] && sel[s].itemId).filter((x) => x != null);
    if (new Set(ids).size !== ids.length) return false;
  }
  return true;
}

const crushTarget = (gates = {}) => gates.uncrushableTarget ?? CAPS.uncrushableCombined;

function gatesPass(evald, gates = {}) {
  const critOk = gates.raid === false ? evald.heroicCritImmune : evald.raidCritImmune;
  const crushOk = !gates.requireUncrushable || evald.totalAvoidanceWithHS + 1e-9 >= crushTarget(gates);
  return { critOk, crushOk, all: critOk && crushOk };
}

// How far a set is from satisfying the required gates, in % units (0 = legal).
function gateDeficit(evald, gates = {}) {
  const critTarget = gates.raid === false ? BASE.heroicBossCritVsPlayer : BASE.bossCritVsPlayer;
  const critDef = Math.max(0, critTarget - evald.critReduction);
  const crushDef = gates.requireUncrushable
    ? Math.max(0, crushTarget(gates) - evald.totalAvoidanceWithHS)
    : 0;
  return critDef + crushDef;
}

function build(selection, goal) {
  const items = Object.values(selection).filter(Boolean);
  const agg = aggregate(items, goal);
  const evald = evaluateSet(agg);
  return { selection, items, agg, evald, setBonuses: justicarBonuses(items) };
}

// Exhaustive: cartesian product over slots. Guarded against blow-up. Honors distinctness
// (and locks, via single-candidate slots from buildPool).
export function optimizeExhaustive(pool, goal, { distinct = [] } = {}) {
  const slots = Object.keys(pool);
  const space = slots.reduce((p, s) => p * pool[s].length, 1);
  if (space > 500000) throw new Error(`Exhaustive space too large (${space}); use the heuristic.`);
  const objFn = objectiveFn(goal);
  let best = null;

  const rec = (i, sel) => {
    if (i === slots.length) {
      if (!distinctOk(sel, distinct)) return;
      const b = build(sel, goal);
      if (gatesPass(b.evald, goal.gates).all) {
        const v = objFn(b.evald, b.agg, b.items);
        if (!best || v > best.objectiveValue) best = { ...b, objectiveValue: v, legal: true };
      }
      return;
    }
    for (const it of pool[slots[i]]) rec(i + 1, { ...sel, [slots[i]]: it });
  };
  rec(0, {});
  return best; // null if no legal set exists
}

// Heuristic: start from the best-objective item per slot, repair toward the gates with the
// single swap that removes the most deficit per unit of objective sacrificed, until legal.
// Honors paired-slot distinctness and locked slots throughout.
export function optimizeHeuristic(pool, goal, { distinct = [], locked = {} } = {}) {
  const slots = Object.keys(pool);
  const objFn = objectiveFn(goal);
  const singleObj = (it) => { const a = aggregate([it], goal); return objFn(evaluateSet(a), a, [it]); };

  const sel = {};
  for (const s of slots) {
    sel[s] = locked[s] || pool[s].slice().sort((a, b) => singleObj(b) - singleObj(a))[0];
  }
  // Resolve paired duplicates: keep the first, bump the rest to their next distinct candidate.
  const fixDistinct = () => {
    for (const group of distinct) {
      const used = new Set();
      for (const s of group) {
        if (locked[s]) { if (sel[s]) used.add(sel[s].itemId); continue; }
        if (sel[s] && !used.has(sel[s].itemId)) { used.add(sel[s].itemId); continue; }
        const repl = pool[s].find((it) => !used.has(it.itemId));
        if (repl) { sel[s] = repl; used.add(repl.itemId); }
      }
    }
  };
  fixDistinct();
  let cur = build(sel, goal);

  for (let guard = 0; guard < 300; guard++) {
    const curDef = gateDeficit(cur.evald, goal.gates);
    if (curDef <= 1e-9) break; // legal
    const curObj = objFn(cur.evald, cur.agg, cur.items);
    let bestSwap = null;
    for (const s of slots) {
      if (locked[s]) continue;
      for (const cand of pool[s]) {
        if (cand === sel[s]) continue;
        const trialSel = { ...sel, [s]: cand };
        if (!distinctOk(trialSel, distinct)) continue;
        const trial = build(trialSel, goal);
        const def = gateDeficit(trial.evald, goal.gates);
        const dRed = curDef - def;
        if (dRed <= 1e-9) continue; // no progress
        const objLoss = curObj - objFn(trial.evald, trial.agg, trial.items);
        const efficiency = objLoss <= 0 ? Infinity : dRed / objLoss;
        if (!bestSwap || efficiency > bestSwap.efficiency) bestSwap = { s, cand, efficiency, trial };
      }
    }
    if (!bestSwap) break; // no progress possible
    sel[bestSwap.s] = bestSwap.cand;
    cur = bestSwap.trial;
  }

  // Climb: once legal, convert any SURPLUS (e.g. avoidance overshooting the uncrush cap) into
  // objective. Repeatedly apply the single swap that most increases the objective while keeping
  // every gate satisfied — i.e. trade excess avoidance back for threat/EHP, staying >= cap. This
  // is what fixes a set that the repair left several % over the cap.
  if (gatesPass(cur.evald, goal.gates).all) {
    for (let guard = 0; guard < 300; guard++) {
      const curObj = objFn(cur.evald, cur.agg, cur.items);
      let bestSwap = null;
      for (const s of slots) {
        if (locked[s]) continue;
        for (const cand of pool[s]) {
          if (cand === sel[s]) continue;
          const trialSel = { ...sel, [s]: cand };
          if (!distinctOk(trialSel, distinct)) continue;
          const trial = build(trialSel, goal);
          if (!gatesPass(trial.evald, goal.gates).all) continue; // must stay legal
          const gain = objFn(trial.evald, trial.agg, trial.items) - curObj;
          if (gain <= 1e-9) continue;
          if (!bestSwap || gain > bestSwap.gain) bestSwap = { s, cand, gain, trial };
        }
      }
      if (!bestSwap) break;
      sel[bestSwap.s] = bestSwap.cand;
      cur = bestSwap.trial;
    }
  }

  const legal = gatesPass(cur.evald, goal.gates).all && distinctOk(sel, distinct);
  return { ...cur, objectiveValue: objFn(cur.evald, cur.agg, cur.items), legal };
}

// Convenience wrapper: heuristic by default, exhaustive when asked (and feasible).
export function optimize(pool, goal, { exhaustive = false, distinct = [], locked = {} } = {}) {
  return exhaustive
    ? optimizeExhaustive(pool, goal, { distinct })
    : optimizeHeuristic(pool, goal, { distinct, locked });
}
