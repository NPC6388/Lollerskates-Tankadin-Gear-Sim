// Four-set optimization orchestration, shared by the CLI (bin/optimize.mjs) and the web UI.
// Browser- and Node-safe: no fs, no DOM. Given a parsed item pool it returns the player's tuned
// sets (raid threat / survival / AOE trash / balanced), each gemmed/enchanted with crit/crush
// status. Gemming is a LEVER for the caps: each socketed item enters as a focus variant (goal
// gems) and a cap variant (avoidance/defense gems), so the optimizer can keep a higher-threat
// item and gem IT for defense when that beats a tankier swap. Final gems are recomputed
// socket-bonus-aware via solveLoadout.

import { aggregate, BUFFS, TALENTS, talentsFromRanks, STAT_KEYS } from './model.js';
import { evaluateSet } from './character.js';
import { bestGem, bestMeta, gemColors, metaActivated, GEMS, META_GEMS, CURRENT_PHASE, FITS } from './gems.js';
import { bestEnchant, ENCHANTS } from './enchants.js';
import { score } from './scoring.js';
import { SCALES, blendScale } from './weights.js';
import { planItemGems } from './gemsolver.js';
import { buildPool, optimizeHeuristic, distinctOk } from './optimizer.js';
import { professionPerks } from './professions.js';
import { scrollStats } from './scrolls.js';
import { CAPS, RATING } from './constants.js';

const HS = 30;                               // Holy Shield +30% block in the uncrushable check
const CAP_SCALE = SCALES.survivalUncrushable; // gems that most cheaply buy avoidance/defense
const ALT_EPS = 0.01;                        // a slot alternative is "near-identical" within 1% of the WHOLE-SET objective
const ALT_MAX = 3;                           // at most this many alternatives shown per slot
export const DEFAULT_TRINKET_LOCKS = { icon: 29370, eye: 28789 }; // Icon of the Silver Crescent / Eye of Magtheridon

// Preset goals as TUNABLE EHP:threat ratios (blendScale builds the objective). Every goal uses
// the same EHP↔threat axis; AOE Trash differs only by a relaxed crush gate (trash can't crush).
// `lockEye` adds Eye of Magtheridon to the locked trinkets.
export const GOAL_PRESETS = [
  { id: 'raid', name: 'Raid Threat', focus: 'EHP : threat 1:2', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true }, lockEye: true },
  { id: 'survival', name: 'Survival', focus: 'EHP : threat 2:1', ratio: { ehp: 2, threat: 1 }, gates: { raid: true, requireUncrushable: true }, lockEye: false },
  // AOE Trash targets level ≤72 mobs, which can't deal crushing blows (only 73+ bosses do), so the
  // uncrushable gate is dropped — the set spends that itemization on threat. Crit immunity is kept
  // (trash can still crit). Spell hit is also weighted low in the aoeThreat scale (only ~5% needed).
  { id: 'aoe', name: 'AOE Trash', focus: 'AOE threat (trash ≤72 — no crushing blows)', ratio: { ehp: 1, aoeThreat: 2 }, gates: { raid: true, requireUncrushable: false }, lockEye: true },
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

// --- "Keep existing gems/enchants" support -------------------------------------------------
// For LOCKED items the solver leaves the currently-socketed gems + applied enchant in place. The
// resolved item.stats already fold those in (plus any active socket bonus), so a locked item just
// contributes resolved-minus-base (the gem/enchant delta) on top of baseStats — no re-gemming.
const lockedDelta = (it) => {
  const base = baseOf(it), res = it.stats || {};
  const out = {};
  for (const k of STAT_KEYS) { const d = (res[k] || 0) - (base[k] || 0); if (d) out[k] = d; }
  return out;
};

// id -> name lookups so a locked item can REPORT its current gems/enchant (the addon export carries
// gem item-ids + the enchant effect-id, not names). Falls back to a generic label for anything not
// in the curated DBs (e.g. a gem the solver doesn't stock).
const GEM_BY_ID = new Map();
for (const g of [...GEMS, ...META_GEMS]) if (g.id) GEM_BY_ID.set(g.id, g);
const META_BY_NAME = new Map(META_GEMS.map((g) => [g.name, g]));
const ENCHANT_BY_EFFECT = new Map();
for (const list of Object.values(ENCHANTS)) for (const e of list) if (e.enchant) ENCHANT_BY_EFFECT.set(e.enchant, e);
const currentGems = (it) => (it.gems || []).map((id) => {
  const g = GEM_BY_ID.get(id);
  return g ? { name: g.name, id: g.id } : { name: `Gem ${id}`, id };
});
const currentEnchant = (it) => {
  const id = it.enchantId;
  if (!id) return null;
  const e = ENCHANT_BY_EFFECT.get(id);
  return e ? { name: e.name, id: e.id || null, spell: e.spell || null, effectId: e.enchant || id }
           : { name: `Enchant ${id}`, id: null, spell: null, effectId: id };
};

// Is an item COMPLETE enough to lock? An item with EMPTY sockets or a MISSING enchant (one the
// optimizer would otherwise apply) is never locked — there's nothing finished to preserve there, so
// we let the solver gem/enchant it even in keep-mode. "Complete" = every socket filled AND (the slot
// takes no enchant given the player's perks/phase, OR it already has one).
export function lockEligible(item, { perks = { names: [] }, faction = null, maxPhase, objScale } = {}) {
  const s = item.sockets || {};
  const socketCount = (s.red || 0) + (s.yellow || 0) + (s.blue || 0) + (s.meta || 0);
  if ((item.gems || []).length < socketCount) return false; // an empty socket -> let the solver gem it
  const en = bestEnchant(item.slot, objScale || SCALES.balanced, perks, { faction, maxPhase });
  if (en && !item.enchantId) return false; // an applicable enchant is missing -> let the solver add it
  return true;
}

// Normalize the keepGemsEnchants option into { pred, ignoreCompleteness }. Accepts:
//   true                      lock every (completed) item — budget "keep all completed"
//   itemId[]                  lock specific shared pieces (by item-id)
//   { itemIds?, slots?, equippedOnly?, ignoreCompleteness? }
//     equippedOnly: lock currently-equipped items (the "keep equipped" / "current set" scopes)
//     itemIds/slots: lock specific pieces (e.g. the per-set "lock this set's items" button)
//     ignoreCompleteness: lock even items with empty sockets / no enchant (the "as-is" scope)
// Filters are OR-combined: an item locks if it's equipped (when equippedOnly) OR named by id/slot — so
// a scope and an explicit item-id list can be supplied together (lock equipped AND these shared pieces).
// Returns null when nothing would lock.
function keepConfig(spec) {
  if (!spec) return null;
  if (spec === true) return { pred: () => true, ignoreCompleteness: false };
  if (Array.isArray(spec)) {
    const s = new Set(spec);
    return s.size ? { pred: (it) => s.has(it.itemId), ignoreCompleteness: false } : null;
  }
  const ids = new Set(spec.itemIds || []);
  const slots = new Set(spec.slots || []);
  const equippedOnly = !!spec.equippedOnly;
  if (!ids.size && !slots.size && !equippedOnly) return null;
  const pred = (it) => (equippedOnly && !!it.equipped) || ids.has(it.itemId) || slots.has(it.slot);
  return { pred, ignoreCompleteness: !!spec.ignoreCompleteness };
}

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
  // Locked items can't be re-gemmed/-enchanted, so there's a single variant scored on the item's
  // current (resolved) stats — no focus/cap split (the cap variant only exists to re-gem for defense).
  // Only items the player WANTS kept AND that are actually complete (no empty socket / missing
  // enchant) lock; an incomplete item falls through to the normal focus/cap re-gem path.
  if (ctx.keep && ctx.keep(it)
      && (ctx.keepIgnoreCompleteness || lockEligible(it, { perks: ctx.perks, faction: ctx.faction, maxPhase: ctx.maxPhase, objScale }))) {
    return [mk('locked', { ...(it.stats || {}) })];
  }
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
  // LOCKED items keep their current gems (not in plan.choices) — but their colors still count toward
  // meta activation. Tally them from the item's gem ids so a kept blue-gemmed piece helps a "3+ blue"
  // meta (and the recolor logic doesn't over-recolor to re-supply colors that are already there).
  const lockedCount = { red: 0, yellow: 0, blue: 0 };
  for (const p of plans) if (p.locked) for (const id of (p.v.gems || [])) {
    const g = GEM_BY_ID.get(id);
    if (g) for (const col of gemColors(g)) if (lockedCount[col] != null) lockedCount[col]++;
  }
  const tally = () => { const cc = { ...lockedCount }; for (const s of all) for (const col of gemColors(s.c)) if (cc[col] != null) cc[col]++; return cc; };

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
  // A meta socket on a LOCKED item is kept as-is — we can't re-pick it, but we MUST report whether the
  // player's current meta is active given the whole set's gem colors, so a dark meta gets flagged.
  const finalCounts = tally();
  for (const p of plans) {
    if (!p.locked) continue;
    for (const id of (p.v.gems || [])) {
      const g = GEM_BY_ID.get(id);
      if (!g || !g.meta) continue;
      const info = { name: g.name, active: metaActivated(g, finalCounts), requires: g.requires, kept: true };
      p.metas = (p.metas || []).concat(info);
      metas.push(info);
    }
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

function runGoal(goal, items, ctx, seed = {}) {
  const { perks, buff, maxPhase, faction, locks, talents } = ctx;
  const aggOpts = { hsBlockBonus: HS, ...buff, ...(talents ? { talents } : {}) };
  const objScale = blendScale(goal.ratio);
  const prepared = items.flatMap((it) => itemVariants(it, objScale, ctx));
  const { pool, distinct, locked } = buildPool(prepared, { lock: lockFor(goal, locks) });
  // UI "pin to slot": force a chosen/alternate item into its slot for THIS goal, then optimize the
  // rest around it. Restrict the slot's pool to the pinned item's variants (keep its focus/cap
  // variants so it can still be gemmed for threat or defense). Unknown/unowned pins are ignored.
  for (const [slot, itemId] of Object.entries(ctx.pins[goal.id] || {})) {
    if (!pool[slot]) continue;
    const kept = pool[slot].filter((v) => v.itemId === Number(itemId));
    if (kept.length) pool[slot] = kept;
  }
  const oGoal = { objective: 'scale', scaleWeights: objScale, gates: goal.gates, ...aggOpts };
  const res = optimizeHeuristic(pool, oGoal, { distinct, locked, seed });

  // Gem a SELECTION (slot -> item) under a per-item scale (objScale = goal/threat gems, CAP_SCALE =
  // def gems); returns the plans (with .gems/.enchant filled), the meta list, the summed added stats,
  // and the evaluated set. Defaults to res.selection but takes a trial selection for the meta-repair
  // item-swap search below. Meta-aware: resolveMetas picks metas on the goal objective (mutates the
  // fresh plans it's handed). gateAware (set below): once the set comes up crushable, re-gem with the
  // socket-bonus worth-it test priced on the cap scale, so focus pieces KEEP gate-stat bonuses they'd
  // otherwise forfeit for a sliver of threat — the cheapest avoidance back toward the cap.
  let gateAware = false;
  const gemSet = (scaleOf, sel = res.selection) => {
    const itemList = Object.values(sel).filter(Boolean);
    const baseStatsList = itemList.map((v) => ({ stats: baseOf(v) }));
    const gemOpts = gateAware ? { gateScale: CAP_SCALE } : {};
    // Locked items keep their current gems/enchant: no re-gem, just the resolved-minus-base delta.
    const plans = itemList.map((v) => v._gem === 'locked'
      ? { v, scale: null, locked: true, plan: { choices: [], stats: lockedDelta(v), metaCount: 0 } }
      : { v, scale: scaleOf(v), plan: planItemGems(v, scaleOf(v), perks, maxPhase, gemOpts) });
    const metas = resolveMetas(plans, objScale, ctx);
    const added = {};
    const gemChoices = [];
    for (const p of plans) {
      sumInto(added, p.plan.stats); // for locked items this delta already includes the kept enchant
      if (p.locked) {
        p.gems = currentGems(p.v);
        p.enchant = currentEnchant(p.v);
        p.socketBonus = null; p.bonusKept = null; // locked: kept as worn, don't re-assert the bonus
        gemChoices.push(...p.gems);
        continue;
      }
      const en = bestEnchant(p.v.slot, p.scale, perks, { faction, maxPhase });
      if (en) sumInto(added, en.enchant.stats);
      gemChoices.push(...p.plan.choices);
      // Carry the SOCKET COLOR per gem: the export's socket order is unreliable (Lua pairs()), so
      // the bonus only activates if the user places each gem by COLOR — surface that mapping.
      p.gems = p.plan.choices.map((c) => ({ name: c.name, id: c.id || null, socket: c.socket || null }));
      // Bonus is ACTIVE only if every colored gem fits the socket it's tagged to (computed on the
      // FINAL choices, so it reflects any meta recolor). If forfeited, the UI says so explicitly.
      p.socketBonus = p.v.socketBonus || null;
      const coloredCh = p.plan.choices.filter((c) => c.color && FITS[c.color]);
      p.bonusKept = !!p.v.socketBonus && coloredCh.length > 0 && coloredCh.every((c) => FITS[c.color].includes(c.socket));
      p.enchant = en ? { name: en.enchant.name, id: en.enchant.id || null, spell: en.enchant.spell || null, effectId: en.enchant.enchant || null } : null;
    }
    // An INACTIVE kept meta gives NO stats in-game, but a locked item's resolved stats include the
    // socketed meta gem — subtract it so the set isn't credited a dead meta (and a threat swap that
    // kills the meta is correctly seen as a loss, not free spell power).
    for (const p of plans) {
      if (!p.locked || !p.metas) continue;
      for (const m of p.metas) {
        if (m.active) continue;
        const mg = META_BY_NAME.get(m.name);
        if (mg) sumInto(added, mg.stats, -1);
      }
    }
    const agg = aggregate([...baseStatsList, { stats: added }], aggOpts);
    return { plans, metas, added, gemChoices, agg, evald: evaluateSet(agg), items: itemList, selection: sel };
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

  // GATE RECOVERY. If the socket-bonus-aware set misses a hard gate (crush/crit/min-HP), the
  // cheapest stats back toward it are usually the gate-stat socket bonuses the threat objective just
  // forfeited (e.g. a chest's +4 defense — avoidance AND defense toward crit immunity). Re-gem
  // gate-aware so focus pieces reclaim those bonuses; keep it if it gets the set legal or at least
  // moves a failing gate the right way. (Stays on for the reclaim pass below so it can't be undone.)
  if (!finalLegal(g.evald)) {
    gateAware = true;
    const gg = gemSet((v) => scaleOf.get(v));
    const improved = finalLegal(gg.evald)
      || gg.evald.totalAvoidanceWithHS > g.evald.totalAvoidanceWithHS
      || gg.evald.critReduction > g.evald.critReduction;
    if (improved) g = gg; else gateAware = false;
  }

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

  // FINAL META PASS — verify every meta's color requirement actually holds, and repair when a
  // threat-driven item swap dropped a color a meta needs (selection isn't meta-color-aware, and a
  // kept meta's own sockets can't be recolored). If a meta is inactive, search non-locked slots for
  // an owned item that restores it: take the single swap that turns every meta back on, stays legal,
  // and scores best (the dead meta's stats are now honestly counted, so the trade is fair — if the
  // threat truly outweighs the meta, no swap beats the current set and it's left as-is, still flagged).
  if (g.metas.some((m) => !m.active)) {
    const scFn = (v) => scaleOf.get(v) || objScale; // a swapped-in item gems on the goal (focus) scale
    const objOf = (gs) => { const t = {}; for (const it of gs.items) sumInto(t, baseOf(it)); sumInto(t, gs.added); return score(t, objScale); };
    let best = null;
    const curObj = objOf(g);
    for (const slotKey of Object.keys(res.selection)) {
      const cur = res.selection[slotKey];
      if (!cur || cur._gem === 'locked' || locked[slotKey]) continue; // don't disturb kept/locked picks
      const seen = new Set([cur.itemId]);
      for (const cand of pool[slotKey]) {
        if (seen.has(cand.itemId)) continue;
        seen.add(cand.itemId);
        const trialSel = { ...res.selection, [slotKey]: cand };
        if (!distinctOk(trialSel, distinct)) continue;
        const trial = gemSet(scFn, trialSel);
        if (trial.metas.some((m) => !m.active)) continue; // the swap must turn EVERY meta back on
        if (!finalLegal(trial.evald)) continue;
        const o = objOf(trial);
        if (o > (best ? best.o : curObj)) best = { trial, o, slotKey, cand };
      }
    }
    if (best) {
      res.selection[best.slotKey] = best.cand;
      res.items = Object.values(res.selection).filter(Boolean);
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
    perSlot[slotKey] = p ? { gems: p.gems, enchant: p.enchant, metas: p.metas, defGemmed: it._gem === 'cap', locked: it._gem === 'locked', socketBonus: p.socketBonus || null, bonusKept: p.bonusKept } : { gems: [], enchant: null, metas: [], defGemmed: false, locked: false, socketBonus: null, bonusKept: null };
    perSlot[slotKey].alternatives = nearAlternatives(slotKey, it);
  }
  return { goal, selection: res.selection, items: res.items, legal: finalLegal(evald), evald, agg, gemChoices, metas, perSlot, buffImpact };

  // Near-identical alternatives for a slot: OTHER owned items whose objective contribution is within
  // ALT_EPS of the chosen item AND that keep the set legal when swapped in. The objective is LINEAR
  // in the summed item stats (score(sumStats, objScale)), so a slot's marginal value is just
  // score(item.stats, objScale) — the chosen-vs-candidate delta IS the whole-set objective delta.
  // We normalize that delta by the WHOLE-SET objective (res.objectiveValue), so "near-identical"
  // means swapping this one piece barely moves the overall set (the player's "basically the same"),
  // not that it's close as a fraction of this one slot. Legality (non-linear) is re-checked per swap
  // on the same approximate variant stats the selection used. Each alternative carries its OWN
  // gems/sockets so the player can compare in place.
  function nearAlternatives(slotKey, chosen) {
    if (!chosen) return [];
    const chosenScore = score(chosen.stats, objScale);
    const denom = Math.max(Math.abs(res.objectiveValue || 0), 1); // whole-set objective (avoid div0)
    const slotScale = scaleOf.get(chosen) || objScale; // gem alternatives like the slot is treated
    // One entry per itemId (an item enters the pool as a focus AND a cap variant) — keep its best.
    const byId = new Map();
    for (const v of pool[slotKey] || []) {
      if (v.itemId === chosen.itemId) continue;
      const sc = score(v.stats, objScale);
      const cur = byId.get(v.itemId);
      if (!cur || sc > cur.sc) byId.set(v.itemId, { v, sc });
    }
    const alts = [];
    for (const { v, sc } of byId.values()) {
      if (Math.abs(sc - chosenScore) / denom > ALT_EPS) continue;
      const trialSel = { ...res.selection, [slotKey]: v };
      if (!distinctOk(trialSel, distinct)) continue; // don't dup the paired ring/trinket
      const trialItems = Object.values(trialSel).filter(Boolean);
      // Does the set stay legal if you just DROP this in (no other changes)? If not, it's still a
      // near-identical option — it just needs the gates recovered elsewhere (e.g. re-gemming a slot
      // for the resilience it gives up). We flag that rather than hide it, so the player sees it.
      const dropInLegal = finalLegal(evaluateSet(aggregate(trialItems, aggOpts)));
      const plan = planItemGems(v, slotScale, perks, maxPhase, {});
      const coloredCh = plan.choices.filter((c) => c.color && FITS[c.color]);
      alts.push({
        itemId: v.itemId, name: v.name || null, objDelta: (sc - chosenScore) / denom, dropInLegal,
        gems: plan.choices.map((c) => ({ name: c.name, id: c.id || null, socket: c.socket || null })),
        socketBonus: v.socketBonus || null,
        bonusKept: !!v.socketBonus && coloredCh.length > 0 && coloredCh.every((c) => FITS[c.color].includes(c.socket)),
      });
    }
    alts.sort((a, b) => b.objDelta - a.objDelta);
    return alts.slice(0, ALT_MAX);
  }
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
//   keepGemsEnchants?: true | itemId[] | { itemIds?, slots?, equippedOnly?, ignoreCompleteness? }
//     keep current gems/enchants (no re-gem/-enchant). true = all completed items; equippedOnly =
//     only worn items; ignoreCompleteness = lock even incomplete items ("current set as-is")
export function optimizeSets(items, options = {}) {
  // back-compat: legacy `buffed: true` -> full raid buffs (Kings + MotW, which stack).
  const mode = BUFF_MODE[options.buff] || (options.buffed ? BUFF_MODE.raid : BUFF_MODE.none);
  // Consumable scrolls (opt-in) stack on top of the buff: primary-stat scrolls merge into the flat
  // buff block (so Kings' +10% applies), Scroll of Protection's armor rides a separate flat channel.
  const scr = scrollStats(options.scrolls || []);
  const mergedBuffs = { ...(mode.opts.buffs || {}) };
  for (const [k, v] of Object.entries(scr.buffs)) mergedBuffs[k] = (mergedBuffs[k] || 0) + v;
  const buff = {
    ...mode.opts,
    ...(Object.keys(mergedBuffs).length ? { buffs: mergedBuffs } : {}),
    ...(scr.flatArmor ? { flatArmor: scr.flatArmor } : {}),
  };
  const ctx = {
    perks: professionPerks(options.professions || []),
    buff,
    buffName: mode.name,
    // Per-goal forced item picks (UI "pin to slot"): { [goalId]: { [slotKey]: itemId } }.
    pins: options.pins || {},
    maxPhase: options.maxPhase,
    // Aldor/Scryer for faction-locked shoulder inscriptions; null = consider both.
    faction: options.faction || null,
    // Imbued Unstable Diamond is opt-in (like buffs); excluded from meta choices when off.
    metaExclude: options.useImbuedMeta === false ? ['Imbued Unstable Diamond'] : [],
    // Talent-driven stat modifiers from the scanned build (TR: line); null = default 0/43/18.
    talents: options.talentRanks && Object.keys(options.talentRanks).length ? talentsFromRanks(options.talentRanks) : null,
    locks: options.trinketLocks || DEFAULT_TRINKET_LOCKS,
    // "Keep existing gems/enchants" — see keepConfig for accepted shapes. Locked items use their
    // current gems/enchant, never re-gemmed; only COMPLETE items lock unless ignoreCompleteness.
    ...(() => { const k = keepConfig(options.keepGemsEnchants); return { keep: k && k.pred, keepIgnoreCompleteness: k ? k.ignoreCompleteness : false }; })(),
  };
  // Excluded items (UI "exclude" — the inverse of pin): drop them from the pool for EVERY set.
  if (options.exclude && options.exclude.length) {
    const ex = new Set(options.exclude);
    items = items.filter((it) => !ex.has(it.itemId));
  }
  const goals = options.goals || GOAL_PRESETS;
  // The web UI builds the Balanced goal's ratio by blending the Survival and Raid ratios (its slider
  // slides between the two sets), so the engine stays generic — every goal is just a ratio + gates.
  return goals.map((g) => {
    const r = runGoal(g, items, ctx);
    const floor = (g.gates && g.gates.minHealth) || 0;
    if (!floor || r.agg.health + 1e-9 >= floor) return r; // no floor, or it's already met
    // Min-HP is a HARD gate (like uncrit/uncrush) — the ratio search came up short. First find the
    // tankiest set: maximize pure STAMINA (keep uncrit/uncrush, drop the floor from the objective so
    // the search isn't pinned below the reachable max).
    const maxHp = runGoal({ ...g, ratio: { sta: 1 }, gates: { ...g.gates, minHealth: 0 } }, items, ctx);
    if (maxHp.agg.health + 1e-9 < floor) {
      // Floor is genuinely unreachable with this gear/keep-settings → best-effort tankiest set, flagged.
      return maxHp.agg.health > r.agg.health ? { ...maxHp, goal: g, legal: false, hpBestEffort: true } : r;
    }
    // Floor IS reachable — the ratio search just got stuck below it. Re-run the goal's OWN ratio
    // objective (so EHP-emphasis and the threat slider still govern the spend), but SEED it from the
    // max-HP set so it starts above the floor; the climb then trades the excess stamina for threat per
    // the ratio while the Min-HP gate keeps it from dropping back under. Result: floor met, then the
    // slider maximizes threat on top — the mirror of the threat set.
    const seed = {};
    for (const [slot, it] of Object.entries(maxHp.selection)) if (it) seed[slot] = it.itemId;
    const recovered = runGoal(g, items, ctx, seed);
    // Keep whichever legal set best honors the goal (the recovered ratio set if it held the floor,
    // else the max-HP set as a floor-meeting fallback).
    if (recovered.agg.health + 1e-9 >= floor && recovered.legal) return recovered;
    return { ...maxHp, goal: g, legal: maxHp.legal };
  });
}
