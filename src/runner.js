// Four-set optimization orchestration, shared by the CLI (bin/optimize.mjs) and the web UI.
// Browser- and Node-safe: no fs, no DOM. Given a parsed item pool it returns the player's tuned
// sets (raid threat / survival / AOE trash / balanced), each gemmed/enchanted with crit/crush
// status. Gemming is a LEVER for the caps: each socketed item enters as a focus variant (goal
// gems) and a cap variant (avoidance/defense gems), so the optimizer can keep a higher-threat
// item and gem IT for defense when that beats a tankier swap. Final gems are recomputed
// socket-bonus-aware via solveLoadout.

import { aggregate, BUFFS, TALENTS, talentsFromRanks } from './model.js';
import { evaluateSet } from './character.js';
import { bestGem, bestMeta, gemColors, metaActivated, META_GEMS, CURRENT_PHASE } from './gems.js';
import { bestEnchant } from './enchants.js';
import { score } from './scoring.js';
import { SCALES, blendScale } from './weights.js';
import { planItemGems } from './gemsolver.js';
import { buildPool, optimizeHeuristic } from './optimizer.js';
import { professionPerks } from './professions.js';
import { CAPS, RATING } from './constants.js';

const HS = 30;                               // Holy Shield +30% block in the uncrushable check
const CAP_SCALE = SCALES.survivalUncrushable; // gems that most cheaply buy avoidance/defense
export const DEFAULT_TRINKET_LOCKS = { icon: 29370, eye: 28789 }; // Icon of the Silver Crescent / Eye of Magtheridon

// Preset goals as TUNABLE EHP:threat ratios (blendScale builds the objective). Every goal uses
// the same EHP↔threat axis; AOE Trash differs only by a relaxed crush gate (trash can't crush).
// `lockEye` adds Eye of Magtheridon to the locked trinkets.
export const GOAL_PRESETS = [
  { id: 'raid', name: 'Raid Threat', focus: 'EHP : threat 1:2', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true }, lockEye: true },
  { id: 'survival', name: 'Survival', focus: 'EHP : threat 2:1', ratio: { ehp: 2, threat: 1 }, gates: { raid: true, requireUncrushable: true }, lockEye: false },
  { id: 'aoe', name: 'AOE Trash', focus: 'EHP : threat 1:2, crush ≥97.4%', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true, uncrushableTarget: CAPS.uncrushableCombined - 5 }, lockEye: true },
  { id: 'balanced', name: 'Balanced', focus: 'EHP : threat 1:1', ratio: { ehp: 1, threat: 1 }, gates: { raid: true, requireUncrushable: true }, lockEye: true },
];

export const spellHitPct = (a) => TALENTS.precisionSpellHitPct + ((a._raw && a._raw.spellHitRating) || 0) / RATING.spellHitPer1;

// Use baseStats (gem/enchant-free) for re-gemming, but fall back to resolved stats when base is
// EMPTY — GetItemStats returns nothing for librams/relics, so their base field is {} and would
// otherwise drop real stats like a libram's block rating. Such items have no sockets/enchants,
// so resolved == base (no double-count).
const baseOf = (it) => (it.baseStats && Object.keys(it.baseStats).length) ? it.baseStats : (it.stats || {});
const sumInto = (into, s, m = 1) => { for (const [k, v] of Object.entries(s || {})) into[k] = (into[k] || 0) + v * m; };
const hasSockets = (it) => { const s = it.sockets || {}; return !!(s.red || s.yellow || s.blue || s.meta); };

// Approximate (raw-gem) stats for one gem intent — drives SELECTION; final gems recomputed below.
// meta-selection options: phase cap + any excluded metas (e.g. Imbued Unstable when toggled off).
const metaOptsFor = (ctx) => ({ ...(ctx.maxPhase ? { maxPhase: ctx.maxPhase } : {}), ...(ctx.metaExclude && ctx.metaExclude.length ? { exclude: ctx.metaExclude } : {}) });

function buildVariant(it, gemScale, enchScale, ctx) {
  const { perks, maxPhase, faction } = ctx;
  const gOpts = { jewelcrafting: !!perks.jcGems, ...(maxPhase ? { maxPhase } : {}) };
  const metaOpts = metaOptsFor(ctx);
  const stats = {}; sumInto(stats, baseOf(it));
  const sock = it.sockets || {};
  const colored = [];
  for (const c of ['red', 'yellow', 'blue']) {
    const n = sock[c] || 0; if (!n) continue;
    const g = bestGem(gemScale, gOpts);
    if (g) { for (let i = 0; i < n; i++) colored.push(g.gem); sumInto(stats, g.gem.stats, n); }
  }
  if (sock.meta) {
    const counts = { red: 0, yellow: 0, blue: 0 };
    for (const g of colored) for (const col of gemColors(g)) if (counts[col] != null) counts[col]++;
    const m = bestMeta(gemScale, { counts, ...metaOpts }) || bestMeta(gemScale, metaOpts);
    if (m) sumInto(stats, m.gem.stats, sock.meta);
  }
  const en = bestEnchant(it.slot, enchScale, perks, { faction, maxPhase });
  if (en) sumInto(stats, en.enchant.stats);
  return stats;
}

function itemVariants(it, objScale, ctx) {
  const mk = (tag, stats) => ({ ...it, stats, _gem: tag });
  const focus = mk('focus', buildVariant(it, objScale, objScale, ctx));
  if (!hasSockets(it)) return [focus];
  return [focus, mk('cap', buildVariant(it, CAP_SCALE, objScale, ctx))];
}

function lockFor(goal, locks) {
  const lock = {};
  if (locks.icon) lock.trinket1 = locks.icon;
  if (goal.lockEye && locks.eye) lock.trinket2 = locks.eye;
  return lock;
}

// Parse a meta's activation requirement into a color target.
function metaReq(requires) {
  if (!requires) return null;
  let m;
  if ((m = requires.match(/(\d+)\+\s*(red|yellow|blue)/))) return { color: m[2], count: +m[1] };
  if (/more red than blue/.test(requires)) return { gt: ['red', 'blue'] };
  if (/more blue than red/.test(requires)) return { gt: ['blue', 'red'] };
  return null;
}

// META-AWARE gemming: choose the set's meta jointly with the colored gems, scored on the GOAL
// objective (a threat set's meta should be Imbued spell-damage, a survival set's Powerful stamina
// — not whatever the def gems happen to enable). A color-gated meta that isn't yet active can be
// ENABLED by recoloring the cheapest FOCUS sockets to its required color (cap/def sockets are
// load-bearing for the gates, so they're never disturbed); the recolor's objective cost is netted
// against the meta's value. Mutates plan.choices and sets p.metas; returns the flat meta list.
function resolveMetas(plans, objScale, ctx) {
  const { perks, maxPhase, metaExclude = [] } = ctx;
  const phase = maxPhase || CURRENT_PHASE;
  const pool = META_GEMS.filter((g) => g.phase <= phase && !metaExclude.includes(g.name));
  const gemOpt = (color) => bestGem(objScale, { socketColor: color, matchColor: true, jewelcrafting: !!perks.jcGems, ...(maxPhase ? { maxPhase } : {}) });
  // Best gem providing the meta's needed color while ALSO fitting a socket's own color (to keep its
  // socket bonus) — e.g. recolor a yellow socket to blue with a GREEN gem, not a purple one.
  const gemOptDual = (metaColor, socketColor) => bestGem(objScale, { socketColor: metaColor, matchColor: true, alsoFits: socketColor, jewelcrafting: !!perks.jcGems, ...(maxPhase ? { maxPhase } : {}) });
  const all = [];
  for (const p of plans) for (const c of p.plan.choices) if (c.color) all.push({ p, c });
  const recolorable = all.filter((s) => s.p.v._gem !== 'cap'); // only focus sockets may be recolored
  const tally = () => { const cc = { red: 0, yellow: 0, blue: 0 }; for (const s of all) for (const col of gemColors(s.c)) if (cc[col] != null) cc[col]++; return cc; };

  const metas = [];
  for (const p of plans) {
    const pMetas = [];
    for (let i = 0; i < p.plan.metaCount; i++) {
      const counts = tally();
      let best = null;
      for (const M of pool) {
        const en = enableMeta(M, counts, recolorable, gemOpt, gemOptDual, objScale);
        if (!en) continue;
        const net = score(M.stats, objScale) - en.cost;
        if (!best || net > best.net) best = { M, en, net };
      }
      if (!best) continue;
      for (const r of best.en.recolors) {
        sumInto(r.s.p.plan.stats, r.s.c.stats, -1); // remove the old gem's stats from its item
        const keepSocket = r.s.c.socket;
        for (const k of Object.keys(r.s.c)) if (k !== 'socket') delete r.s.c[k];
        Object.assign(r.s.c, r.tg.gem, { socket: keepSocket });
        sumInto(r.s.p.plan.stats, r.s.c.stats, +1); // add the recolored gem's stats
      }
      p.plan.choices.push({ socket: 'meta', ...best.M });
      sumInto(p.plan.stats, best.M.stats); // meta stats (always active — only enabled metas chosen)
      const info = { name: best.M.name, active: true, requires: best.M.requires };
      pMetas.push(info); metas.push(info);
    }
    p.metas = pMetas;
  }
  return metas;
}

// Cheapest way (in objective points) to satisfy meta M's color requirement. Returns {cost,recolors}
// (cost 0 / no recolors if already met) or null if it can't be enabled with the focus sockets.
function enableMeta(M, counts, recolorable, gemOpt, gemOptDual, objScale) {
  if (metaActivated(M, counts)) return { cost: 0, recolors: [] }; // the set's colors already satisfy it
  // Compound (multi-color) requirements aren't auto-enabled by recoloring — they're niche survival
  // metas; only use them when already active. Single-condition metas recolor to enable (below).
  if (M.requires && M.requires.includes(',')) return null;
  const req = metaReq(M.requires);
  if (!req) return { cost: 0, recolors: [] };
  let color, deficit;
  if (req.color) { color = req.color; deficit = req.count - counts[color]; }
  else { color = req.gt[0]; deficit = (counts[req.gt[1]] - counts[req.gt[0]]) + 1; } // make color strictly exceed the other
  if (deficit <= 0) return { cost: 0, recolors: [] };
  const plain = gemOpt(color); if (!plain) return null;
  const cands = [];
  for (const s of recolorable) {
    if (gemColors(s.c).includes(color)) continue; // already supplies the needed color
    // If this socket earns a bonus (matched by its own color), prefer a gem that supplies the meta
    // color AND still fits the socket color, so the bonus survives the recolor; else the plain gem.
    let tg = plain;
    const sockCol = s.c.socket;
    if (s.p.v.socketBonus && sockCol && sockCol !== color) tg = gemOptDual(color, sockCol) || plain;
    cands.push({ s, tg, cost: score(s.c.stats, objScale) - tg.score }); // objective value lost
  }
  if (cands.length < deficit) return null;
  cands.sort((a, b) => a.cost - b.cost);
  const recolors = cands.slice(0, deficit);
  return { cost: recolors.reduce((a, r) => a + r.cost, 0), recolors };
}

function runGoal(goal, items, ctx) {
  const { perks, buff, maxPhase, faction, locks, talents } = ctx;
  const aggOpts = { hsBlockBonus: HS, ...buff, ...(talents ? { talents } : {}) };
  const objScale = blendScale(goal.ratio);
  const prepared = items.flatMap((it) => itemVariants(it, objScale, ctx));
  const { pool, distinct, locked } = buildPool(prepared, { lock: lockFor(goal, locks) });
  const oGoal = { objective: 'scale', scaleWeights: objScale, gates: goal.gates, ...aggOpts };
  const res = optimizeHeuristic(pool, oGoal, { distinct, locked });

  // Final gemming, socket-bonus-aware, PER ITEM so we can report gems/enchant by slot. Focus
  // items gem by the goal scale, def-gemmed items by the cap scale. Built from baseStats so
  // there's no double-count.
  const baseStatsList = res.items.map((v) => ({ stats: baseOf(v) }));

  // Gem the whole set under a per-item scale (objScale = goal/threat gems, CAP_SCALE = def gems);
  // returns the plans (with .gems/.enchant filled), the meta list, the summed added stats, and the
  // evaluated set. Meta-aware: resolveMetas picks metas on the goal objective (mutates the fresh
  // plans it's handed). Re-callable with a different scale map for the reclaim pass below.
  const gemSet = (scaleOf) => {
    const plans = res.items.map((v) => { const sc = scaleOf(v); return { v, scale: sc, plan: planItemGems(v, sc, perks, maxPhase) }; });
    const metas = resolveMetas(plans, objScale, ctx);
    const added = {};
    const gemChoices = [];
    for (const p of plans) {
      sumInto(added, p.plan.stats);
      const en = bestEnchant(p.v.slot, p.scale, perks, { faction, maxPhase });
      if (en) sumInto(added, en.enchant.stats);
      gemChoices.push(...p.plan.choices);
      p.gems = p.plan.choices.map((c) => ({ name: c.name, id: c.id || null }));
      p.enchant = en ? { name: en.enchant.name, id: en.enchant.id || null, spell: en.enchant.spell || null, effectId: en.enchant.enchant || null } : null;
    }
    const agg = aggregate([...baseStatsList, { stats: added }], aggOpts);
    return { plans, metas, added, gemChoices, agg, evald: evaluateSet(agg) };
  };

  // Does the FINAL (socket-bonus-aware) set still clear the goal's hard gates?
  const finalLegal = (e) => {
    const gt = goal.gates || {};
    const critOk = gt.raid === false ? e.heroicCritImmune : e.raidCritImmune;
    const need = gt.uncrushableTarget ?? CAPS.uncrushableCombined;
    const crushOk = !gt.requireUncrushable || e.totalAvoidanceWithHS + 1e-9 >= need;
    const hpOk = !gt.minHealth || (e.health ?? 0) + 1e-9 >= gt.minHealth;
    return critOk && crushOk && hpOk;
  };

  // Start from the optimizer's variant choice (its cap variants -> def gems).
  const scaleOf = new Map(res.items.map((v) => [v, v._gem === 'cap' ? CAP_SCALE : objScale]));
  let g = gemSet((v) => scaleOf.get(v));

  // RECLAIM the gate overshoot. The optimizer picks cap (def-gem) variants from APPROXIMATE raw-gem
  // stats during the search, but the socket-bonus-aware final set often clears the gates without
  // them and sits several % over the cap — wasted def gems (e.g. a def-gemmed neck on a max-threat
  // set). Flip def-gemmed pieces back to threat gems greedily, keeping any flip that leaves the set
  // legal. Operates on the true final stats, so it only flips when genuinely safe; recovers the SP.
  if (finalLegal(g.evald)) {
    for (let guard = 0; guard < res.items.length; guard++) {
      let best = null;
      for (const v of res.items) {
        if (scaleOf.get(v) !== CAP_SCALE) continue; // only un-def-gem
        const trial = gemSet((x) => (x === v ? objScale : scaleOf.get(x)));
        if (!finalLegal(trial.evald)) continue;
        const gain = trial.agg.spellPower - g.agg.spellPower; // recovered threat (SP proxy)
        if (!best || gain > best.gain) best = { v, trial, gain };
      }
      if (!best) break;
      scaleOf.set(best.v, objScale);
      g = best.trial;
    }
  }

  const { plans, metas, added, gemChoices, agg, evald } = g;

  // What Kings + MotW actually contribute to this set (buffed minus the same set unbuffed), so
  // the UI can annotate the gates: buffs add stamina/agi (EHP + a little dodge toward uncrush)
  // but no defense/resilience, so they don't move crit immunity.
  let buffImpact = null;
  if (buff && (buff.kings || buff.buffs)) {
    const baseStats = [...res.items.map((v) => ({ stats: baseOf(v) })), { stats: added }];
    const aggU = aggregate(baseStats, { hsBlockBonus: HS, ...(talents ? { talents } : {}) });
    const eU = evaluateSet(aggU);
    buffImpact = {
      name: ctx.buffName,
      stamina: agg.stamina - aggU.stamina,         // -> health
      agility: agg.agility - aggU.agility,         // -> dodge + melee crit
      intellect: agg.intellect - aggU.intellect,   // -> spell crit (+ mana)
      strength: agg.strength - aggU.strength,      // -> block value
      armor: agg.armor - aggU.armor,
      health: agg.health - aggU.health,
      crushAvoid: evald.totalAvoidanceWithHS - eU.totalAvoidanceWithHS, // the dodge gain, toward uncrush
      critReduction: evald.critReduction - eU.critReduction,            // ~0 (no def/resil from buffs)
    };
  }

  // Per-slot gem/enchant detail for the UI's paper-doll display.
  const perSlot = {};
  for (const [slotKey, it] of Object.entries(res.selection)) {
    const p = plans.find((x) => x.v === it);
    perSlot[slotKey] = p ? { gems: p.gems, enchant: p.enchant, metas: p.metas, defGemmed: it._gem === 'cap' } : { gems: [], enchant: null, metas: [], defGemmed: false };
  }
  return { goal, selection: res.selection, items: res.items, legal: res.legal, evald, agg, gemChoices, metas, perSlot, buffImpact };
}

// Stat-buff modes. Kings (+10% to primaries) and MotW (+14 flat) DO stack in-game — different
// sources (paladin blessing vs druid buff), different types (percentage vs flat). The realistic
// raid-buffed view applies BOTH (MotW flat first, then Kings ×1.10 — see aggregate). The
// single-buff modes remain for comparison/partial-raid scenarios.
const BUFF_MODE = {
  raid: { opts: { kings: true, buffs: BUFFS.markOfTheWild }, name: 'Kings + Mark of the Wild' },
  kings: { opts: { kings: true }, name: 'Blessing of Kings' },
  motw: { opts: { buffs: BUFFS.markOfTheWild }, name: 'Mark of the Wild' },
  none: { opts: {}, name: '' },
};

// Main entry. items = equippableItems(parseExport(text)). options:
//   professions: string[]   buff: 'kings'|'motw'|'none'   maxPhase?: number   trinketLocks?: {icon,eye}
//   goals?: GOAL_PRESETS-shaped[] (override, e.g. with UI-tweaked ratios)
export function optimizeSets(items, options = {}) {
  // back-compat: legacy `buffed: true` -> full raid buffs (Kings + MotW, which stack).
  const mode = BUFF_MODE[options.buff] || (options.buffed ? BUFF_MODE.raid : BUFF_MODE.none);
  const ctx = {
    perks: professionPerks(options.professions || []),
    buff: mode.opts,
    buffName: mode.name,
    maxPhase: options.maxPhase,
    // Aldor/Scryer for faction-locked shoulder inscriptions; null = consider both.
    faction: options.faction || null,
    // Imbued Unstable Diamond is opt-in (like buffs); excluded from meta choices when off.
    metaExclude: options.useImbuedMeta === false ? ['Imbued Unstable Diamond'] : [],
    // Talent-driven stat modifiers from the scanned build (TR: line); null = default 0/43/18.
    talents: options.talentRanks && Object.keys(options.talentRanks).length ? talentsFromRanks(options.talentRanks) : null,
    locks: options.trinketLocks || DEFAULT_TRINKET_LOCKS,
  };
  const goals = options.goals || GOAL_PRESETS;
  return goals.map((g) => runGoal(g, items, ctx));
}
