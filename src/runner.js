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
import { planItemGems, reassignForBonus, bonusEarnedAsTagged } from './gemsolver.js';
import { buildPool, optimizeHeuristic, distinctOk, PAIRS } from './optimizer.js';
import { professionPerks } from './professions.js';
import { scrollStats } from './scrolls.js';
import { libramStats } from './librams.js';
import { procStats } from './procs.js';
import { RATING, crushTargetFor, crushSafeTargetFor } from './constants.js';

const HS = 30;                               // Holy Shield +30% block in the uncrushable check
const CAP_SCALE = SCALES.survivalUncrushable; // gems that most cheaply buy avoidance/defense
const ALT_EPS = 0.01;                        // a slot alternative is "near-identical" within 1% of the WHOLE-SET objective
const ALT_MAX = 3;                           // at most this many alternatives shown per slot
export const DEFAULT_TRINKET_LOCKS = { icon: 29370, eye: 28789 }; // Icon of the Silver Crescent / Eye of Magtheridon

// Encounter-adjusted crush avoidance / uncrushable (see character.js evaluateSet). `enc` is
// 'illidan' | 'sunwell' | null (normal boss). Used so the uncrushable gate can demand the extra
// avoidance those fights need (Illidan's Shear can't miss; Sunwell Radiance cuts miss+dodge).
const encAvoid = (e, enc) => enc === 'sunwell' ? e.swpAvoidance : enc === 'illidan' ? e.illyAvoidance : e.totalAvoidanceWithHS;
const encUncrush = (e, enc) => enc === 'sunwell' ? e.swpUncrushable : enc === 'illidan' ? e.illyUncrushable : e.uncrushable;

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
  // Encounter sets: the uncrushable gate is measured on the avoidance THAT FIGHT leaves you — Illidan's
  // Shear can't miss (miss ignored, 101.8% target); Sunwell Radiance = boss +5% hit / −20% tank dodge
  // (see encAvoid/encUncrush + character.js). `enc` swaps the gate metric per goal. If the gear can't
  // reach the reduced-avoidance cap the set is still returned, flagged illegal, rather than dropped.
  //  • Illidan — Shear gate REQUIRED, threat-lean (surplus over the gate goes to threat).
  //  • Sunwell — the GENERAL SWP set. Only Lady Sacrolash lands crushing blows, and a core set (Survival)
  //    covers HER, so every SWP fight here RELAXES the crush gate. Focus is EFFECTIVE HEALTH, but the ehp
  //    scale still weights dodge/parry/defense heavily, so it keeps HIGH AVOIDANCE too — stamina/armor-led.
  //    It still SHOWS the Radiance-reduced avoidance (enc:'sunwell'), ungated, as a reference for Sacrolash.
  //    lockEye:false frees the threat trinket for a defensive pick.
  //  • Brutallus — a high effective-health GOAL (aim >20k HP raid-buffed): crush gate relaxed
  //    AND the ratio pushed to pure survival (ehp + extra stamina, NO threat), so it takes all the EHP
  //    it can get. It keeps some avoidance via the ehp scale but leans harder to stamina than Sunwell.
  { id: 'illidan', name: 'Illidan', focus: 'Illidan gate · lean threat', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true }, lockEye: true, enc: 'illidan' },
  { id: 'sunwell', name: 'Sunwell', focus: 'no crush · EHP + avoidance', ratio: { ehp: 3, threat: 1 }, gates: { raid: true, requireUncrushable: false }, lockEye: false, enc: 'sunwell' },
  { id: 'brutallus', name: 'Brutallus', focus: 'all the EHP you can get', ratio: { ehp: 2, sta: 1 }, gates: { raid: true, requireUncrushable: false }, lockEye: false, enc: 'sunwell' },
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
// `worn` forces the AS-SOCKETED stats (`_wornStats`) rather than a variant's simulated gemming —
// used by the monotonicity guard, which prices the gems literally sitting in the gear today.
const lockedDelta = (it, worn = false) => {
  const base = baseOf(it), res = (worn ? it._wornStats : it.stats) || {};
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
  // `_wornStats` preserves the item's REAL resolved stats (gems + enchant as actually socketed).
  // A focus/cap variant overwrites `stats` with its SIMULATED gemming, so anything that wants the
  // as-worn configuration — the monotonicity guard's keep-all baseline — must read this instead.
  const mk = (tag, stats) => ({ ...it, stats, _gem: tag, _wornStats: it.stats || {} });
  // Locked items can't be re-gemmed/-enchanted, so there's a single variant scored on the item's
  // current (resolved) stats — no focus/cap split (the cap variant only exists to re-gem for defense).
  // Only items the player WANTS kept AND that are actually complete (no empty socket / missing
  // enchant) lock; an incomplete item falls through to the normal focus/cap re-gem path.
  if (ctx.keep && ctx.keep(it)
      && (ctx.keepIgnoreCompleteness || lockEligible(it, { perks: ctx.perks, faction: ctx.faction, maxPhase: ctx.maxPhase, objScale }))) {
    return [mk('locked', { ...(it.stats || {}) })];
  }
  const out = [mk('focus', buildVariant(it, objScale, objScale, ctx))];
  if (hasSockets(it)) out.push(mk('cap', buildVariant(it, CAP_SCALE, objScale, ctx)));
  // AS-WORN VARIANT. Re-gem mode offers the solver only two SIMULATED gemmings per item (focus and
  // cap), so the configuration already sitting in the gear — which is attainable by definition, you
  // are wearing it — was not in the search space at all. That made "re-gem everything" able to return
  // a set scoring BELOW the same solve with gems kept (measured: -0.40% on the Illidan goal), because
  // it had to re-gem every piece even where the current gems were better. The gem-level monotonicity
  // guard below can't fix that: it only re-prices the gems of an ALREADY-CHOSEN selection, and by then
  // the wrong items are chosen. Offering the as-worn config as a third variant puts it back in the
  // space, so re-gemming becomes a true improvement operator over keeping your gems, not a coin flip.
  // Only for COMPLETE items: with an empty socket or a missing enchant, the focus variant fills it and
  // therefore strictly dominates the as-worn config (added stats can't cost legality — every gate is a
  // floor). Tagged 'locked' precisely because that is what it means downstream — keep this piece's
  // gems/enchant as they are — and every consumer (plans, meta colors, socket bonus, the UI's "Kept"
  // badge) already handles that tag.
  // Also skipped when there is nothing applied to keep (no gems, no enchant): the as-worn config is
  // then just the bare item, which the focus variant already covers or beats — a variant that can
  // never win is pure search cost, and this pass runs over every item in the pool.
  if (!ctx.keep && ((it.gems || []).length > 0 || it.enchantId)
      && lockEligible(it, { perks: ctx.perks, faction: ctx.faction, maxPhase: ctx.maxPhase, objScale })) {
    out.push(mk('locked', { ...(it.stats || {}) }));
  }
  return out;
}

function lockFor(goal, locks) {
  // Encounter sets must reach a HARDER avoidance gate, and trinkets are a big avoidance lever (and the
  // model can't score proc/on-use trinkets anyway) — so they free BOTH trinket slots, letting the
  // optimizer slot the best scoreable avoidance trinket to hit the gate. (Locking a threat trinket makes
  // the gate unreachable — e.g. Illidan can't clear 102.4% with Icon+Eye locked but can with them free.)
  if (goal.enc) return {};
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

// --- The equipped set as the baseline every goal is measured against ----------------------------
// The set you are WEARING is always feasible — you are wearing it. So it is both the natural place to
// start the search and a floor on the answer: a recommendation that scores below your current gear is
// not a recommendation. (Same argument as the gem monotonicity guard, one level up: there it was
// "these gems are already in the item", here it is "these items are already on the character".)

// Equipped items -> a seed the heuristic understands ({ poolSlot: itemId }). Paired slots fill in
// scan order (ring1 then ring2), which is how buildPool lays them out.
function equippedSeed(items) {
  const seed = {}, used = {};
  for (const it of items) {
    if (!it.equipped || !it.slot) continue;
    const pair = PAIRS[it.slot];
    if (!pair) { seed[it.slot] = it.itemId; continue; }
    const n = used[it.slot] || 0;
    if (n < pair.length) { seed[pair[n]] = it.itemId; used[it.slot] = n + 1; }
  }
  return seed;
}

// Does the equipped gear satisfy the constraints the PLAYER set for this goal — trinket locks and
// pinned slots? If they locked or pinned an item they aren't wearing, the worn set violates a choice
// they made explicitly, so it must NOT become the floor: honoring their pin matters more than the
// objective. (Getting this wrong would repeat the trinket-lock bug that started all this.)
function equippedMeetsConstraints(items, goal, locks, pins = {}) {
  const wornIds = new Set(items.filter((it) => it.equipped).map((it) => it.itemId));
  const lock = lockFor(goal, locks);
  const lockOk = Object.values(lock).every((ref) => wornIds.has(typeof ref === 'object' ? ref.itemId : ref));
  if (!lockOk) return false;
  return Object.values(pins[goal.id] || {}).every((id) => wornIds.has(Number(id)));
}

function runGoal(goal, items, ctx, seed = {}) {
  const { perks, buff, maxPhase, faction, locks, talents } = ctx;
  const enc = goal.enc || ctx.encounter || null; // per-goal encounter gate (Illy/SWP presets); ctx fallback for back-compat
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
  // Encounter goals push the gate onto their reduced avoidance during SELECTION too (not just the final
  // legality check), so the optimizer actually reaches for dodge/parry/block instead of settling for
  // normal uncrushable and picking threat trinkets.
  const oGates = enc ? { ...goal.gates, enc } : goal.gates;
  const oGoal = { objective: 'scale', scaleWeights: objScale, gates: oGates, ...aggOpts };
  const res = optimizeHeuristic(pool, oGoal, { distinct, locked, seed });

  // Gem a SELECTION (slot -> item) under a per-item scale (objScale = goal/threat gems, CAP_SCALE =
  // def gems); returns the plans (with .gems/.enchant filled), the meta list, the summed added stats,
  // and the evaluated set. Defaults to res.selection but takes a trial selection for the meta-repair
  // item-swap search below. Meta-aware: resolveMetas picks metas on the goal objective (mutates the
  // fresh plans it's handed). gateAware (set below): once the set comes up crushable, re-gem with the
  // socket-bonus worth-it test priced on the cap scale, so focus pieces KEEP gate-stat bonuses they'd
  // otherwise forfeit for a sliver of threat — the cheapest avoidance back toward the cap.
  let gateAware = false;
  const gemSet = (scaleOf, sel = res.selection, uniqueOverrides = null, keepAll = false) => {
    const itemList = Object.values(sel).filter(Boolean);
    const baseStatsList = itemList.map((v) => ({ stats: baseOf(v) }));
    const gemOpts = gateAware ? { gateScale: CAP_SCALE } : {};
    // Locked items keep their current gems/enchant: no re-gem, just the resolved-minus-base delta.
    // `keepAll` treats EVERY item that way — the as-worn baseline the monotonicity guard scores.
    const plans = itemList.map((v) => (keepAll || v._gem === 'locked')
      ? { v, scale: null, locked: true, plan: { choices: [], stats: lockedDelta(v, keepAll), metaCount: 0 } }
      : { v, scale: scaleOf(v), plan: planItemGems(v, scaleOf(v), perks, maxPhase, gemOpts) });
    // UNIQUE-GEM overrides (from the placement pass below): swap specific focus sockets to a
    // one-per-character unique/epic gem, then recompute that item's gem stats from scratch (all gems +
    // its socket bonus IF the new colors still earn it). Applied before resolveMetas so meta activation
    // and the socket-bonus reassignment downstream both recompute around the swap.
    if (uniqueOverrides) {
      for (const p of plans) {
        const ov = p.locked ? null : uniqueOverrides.get(p.v.itemId);
        if (!ov) continue;
        for (const [idx, U] of ov) {
          const c = p.plan.choices[idx];
          if (c) p.plan.choices[idx] = { socket: c.socket, name: U.name, id: U.id || null, color: U.color, stats: U.stats };
        }
        const s = {};
        for (const c of p.plan.choices) sumInto(s, c.stats || {});
        if (p.v.socketBonus && bonusEarnedAsTagged(p.plan.choices)) sumInto(s, { [p.v.socketBonus.stat]: p.v.socketBonus.value });
        p.plan.stats = s;
      }
    }
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
      p.socketBonus = p.v.socketBonus || null;
      // Bonus is ACTIVE if the item's chosen gems can be assigned (in ANY order — the player controls
      // placement) so every socket color-matches. The greedy per-socket pick and the meta recolor can
      // leave a gem tagged off-color while a sibling that fits it sits elsewhere; reassignForBonus finds
      // the max-fit permutation and RELABELS each gem's socket so the readout shows the earning layout.
      const coloredCh = p.plan.choices.filter((c) => c.color && FITS[c.color]);
      const earnedBefore = bonusEarnedAsTagged(p.plan.choices); // faithful "was the bonus in plan.stats?"
      p.bonusKept = !!p.v.socketBonus && reassignForBonus(coloredCh, p.v.sockets);
      // A bonus the relabel newly earns wasn't banked by planItemGems (it forfeited), so credit it now —
      // it's free mitigation the same gems provide once slotted by color. (Reassignment never LOSES a
      // bonus that was tagged-earned, so we only ever add.)
      if (p.bonusKept && !earnedBefore) sumInto(added, { [p.v.socketBonus.stat]: p.v.socketBonus.value });
      // Carry the SOCKET COLOR per gem: the export's socket order is unreliable (Lua pairs()), so the
      // bonus only activates if the user places each gem by COLOR — surface that (relabeled) mapping.
      p.gems = p.plan.choices.map((c) => ({ name: c.name, id: c.id || null, socket: c.socket || null }));
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

  // Does the FINAL (socket-bonus-aware) set still clear the goal's hard gates? This is the SOLVER's check —
  // it selects/reclaims toward the raw crush cap (crushTargetFor). The reported `legal` flag uses certLegal
  // below, which requires the safety-margined target.
  const finalLegal = (e) => {
    const gt = goal.gates || {};
    const critOk = gt.raid === false ? e.heroicCritImmune : e.raidCritImmune;
    const need = crushTargetFor(enc, gt.uncrushableTarget);
    const crushOk = !gt.requireUncrushable || encAvoid(e, enc) + 1e-9 >= need;
    const hpOk = !gt.minHealth || (e.health ?? 0) + 1e-9 >= gt.minHealth;
    return critOk && crushOk && hpOk;
  };

  // CERTIFICATION. Same gates, but the crush check uses the safety-margined target (crushSafeTargetFor) so
  // we never REPORT a set uncrushable that the in-game sheet would read as crushable (the ~0.1% ratings-vs-
  // sheet gap). Used for the returned `legal` flag + the Optimize card only — never the solver loops above,
  // so the gem search is unchanged (a set that clears the raw cap but not the margin comes back flagged
  // illegal, best-effort, like any unreachable gate).
  const certLegal = (e) => {
    const gt = goal.gates || {};
    const critOk = gt.raid === false ? e.heroicCritImmune : e.raidCritImmune;
    const crushOk = !gt.requireUncrushable || encAvoid(e, enc) + 1e-9 >= crushSafeTargetFor(enc, gt.uncrushableTarget);
    const hpOk = !gt.minHealth || (e.health ?? 0) + 1e-9 >= gt.minHealth;
    return critOk && crushOk && hpOk;
  };

  // Start from the optimizer's variant choice (its cap variants -> def gems).
  const scaleOf = new Map(res.items.map((v) => [v, v._gem === 'cap' ? CAP_SCALE : objScale]));
  const scFn = (v) => scaleOf.get(v) || objScale; // gems a swapped-in item on the goal (focus) scale
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
      || encAvoid(gg.evald, enc) > encAvoid(g.evald, enc)
      || gg.evald.critReduction > g.evald.critReduction;
    if (improved) g = gg; else gateAware = false;
  }

  // Goal-objective score of a gemmed set, used to judge trades where one slot gains threat and another
  // loses it (the SP proxy alone can't — it ignores the cost). Scores the BUFFED aggregate's raw stats
  // (`agg._raw`), the exact metric the candidate ranking uses below — so a relocation that the raw
  // base+delta scale thinks is even can't quietly trade away Kings-multiplied stamina for a net loss.
  const objScoreOf = (gs) => score(gs.agg._raw, objScale);

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

  // PAIRWISE RELOCATION. A single flip above can be blocked because a def piece is load-bearing for a
  // thin gate margin — e.g. a leg's +8 defense gem holding crit immunity at 5.70% vs the 5.6% floor —
  // so a high-threat slot (legs, where the threat enchant is worth ~3x a def one) stays def-gemmed even
  // while the set sits >1% over the crush cap. Try 2-opt moves: flip a def piece TO threat AND a threat
  // piece TO def, relocating the gate stat to a slot where threat is worth less. Keep the pair only if
  // it stays legal AND raises the goal objective; repeat until none improves. (Runs after the greedy
  // single-flip pass so it only handles the genuinely stuck pieces.)
  if (finalLegal(g.evald)) {
    for (let guard = 0; guard < res.items.length; guard++) {
      const curObj = objScoreOf(g);
      let best = null;
      for (const d of res.items) {
        if (scaleOf.get(d) !== CAP_SCALE) continue; // d: currently def-gemmed
        for (const t of res.items) {
          if (t === d || t._gem === 'locked' || scaleOf.get(t) === CAP_SCALE) continue; // t: a non-locked threat piece
          const trial = gemSet((x) => (x === d ? objScale : x === t ? CAP_SCALE : scaleOf.get(x)));
          if (!finalLegal(trial.evald)) continue;
          const o = objScoreOf(trial);
          if (o > curObj + 1e-6 && (!best || o > best.o)) best = { d, t, trial, o };
        }
      }
      if (!best) break;
      scaleOf.set(best.d, objScale);
      scaleOf.set(best.t, CAP_SCALE);
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

  // UNIQUE-GEM PLACEMENT. The per-socket bulk picker only uses repeatable (rare) cuts — a unique/epic
  // gem (one per character) can't fill every socket, so it's excluded there (gems.js). But the player
  // can slot ONE of each, and the best (e.g. Runed Ornate Ruby, +12 SP vs the +9 workhorse) is a real
  // upgrade. Greedily place each unique in the focus socket that most raises the objective, re-gemming
  // the whole set per trial (so socket bonuses + meta activation recompute), keeping it only if the set
  // stays legal AND the objective strictly rises. Each unique used once, each socket upgraded once —
  // monotonic. A cheap gem-level gain pre-check keeps it to the few (unique, socket) pairs worth trying.
  {
    const phase = maxPhase || CURRENT_PHASE;
    const uniques = GEMS
      .filter((u) => (u.unique || u.epic) && u.phase <= phase && (!u.jcOnly || perks.jcGems))
      .map((u, i) => ({ u, s: score(u.stats, objScale), i }))
      .sort((a, b) => b.s - a.s || a.i - b.i); // explicit tiebreak by pool order (parity with Lua)
    const overrides = new Map(); // itemId -> Map(choiceIndex -> gem)
    const usedSocket = new Set(); // "itemId:idx"
    const withOverride = (itemId, idx, U) => {
      const out = new Map(); for (const [k, v] of overrides) out.set(k, new Map(v));
      out.set(itemId, (out.get(itemId) || new Map()).set(idx, U));
      return out;
    };
    for (const { u: U, s: us } of uniques) {
      let best = null;
      const curObj = objScoreOf(g);
      for (const p of g.plans) {
        if (p.locked || p.v._gem === 'cap') continue; // upgrade only non-locked THREAT (focus) sockets
        for (let i = 0; i < p.plan.choices.length; i++) {
          const c = p.plan.choices[i];
          if (!c.color || usedSocket.has(p.v.itemId + ':' + i)) continue;
          if (us <= score(c.stats || {}, objScale)) continue; // no gem-level gain possible → skip the trial
          const trial = gemSet(scFn, res.selection, withOverride(p.v.itemId, i, U));
          if (!finalLegal(trial.evald)) continue;
          const o = objScoreOf(trial);
          if (o > curObj + 1e-6 && (!best || o > best.o)) best = { itemId: p.v.itemId, idx: i, trial, o };
        }
      }
      if (!best) continue;
      overrides.set(best.itemId, (overrides.get(best.itemId) || new Map()).set(best.idx, U));
      usedSocket.add(best.itemId + ':' + best.idx);
      g = best.trial;
    }
  }

  // MONOTONICITY GUARD. Re-gemming must never hand back a set WEAKER than the gems already sitting
  // in the gear. The per-socket picker is greedy and its socket-bonus / meta-color interactions are
  // only locally optimal, so on a well-gemmed character it can land below the as-worn configuration
  // (measured: a real 17-piece set scored 5680 kept vs 5644 re-gemmed on the same objective). Every
  // currently-socketed gem is by definition attainable — it's already in the item — so keeping them
  // is always a legal candidate. Score it and take it when it wins, making "re-gem everything" a
  // true improvement operator rather than a coin flip. Skipped in keep mode (g already IS this set).
  if (!ctx.keep) {
    const keepG = gemSet(scFn, res.selection, null, true);
    if (finalLegal(keepG.evald) && objScoreOf(keepG) > objScoreOf(g)) g = keepG;
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
  // Some effects are valued as EQUIVALENT spell damage so the threat scales score them, but they are
  // not literal +spell-power on the tooltip and never appear on the character sheet:
  //   - a modeled libram (e.g. Libram of the Eternal Rest) — its +Consecration damage, converted;
  //   - a proc/on-use trinket (Tome of Fiery Redemption) — its buff averaged over measured uptime.
  // Neither should show in the displayed Spell Damage: Sixty Upgrades (scoring off real item stats)
  // won't see it, and the player comparing the card against their own paper doll would read the
  // difference as the sim inflating its numbers. Split it out: spellPowerLiteral is what the sheet and
  // SU reconcile against; the equivalent is surfaced separately. The OBJECTIVE keeps using the full agg
  // (agg._raw), so set selection is unchanged — the libram and the Tome still win the threat sets.
  let spellPowerEquiv = 0; const equivSources = [];
  for (const v of res.items) {
    const lib = libramStats(v);
    if (lib && lib.spellDamage) { spellPowerEquiv += lib.spellDamage; equivSources.push(v.name || 'relic effect'); }
    const proc = procStats(v);
    if (proc && proc.spellDamage) { spellPowerEquiv += proc.spellDamage; equivSources.push(v.name || 'trinket proc'); }
  }
  agg.spellPowerEquiv = spellPowerEquiv;
  agg.spellPowerEquivSource = equivSources.length ? equivSources.join(' + ') : null;
  agg.spellPowerLiteral = Math.max(0, (agg.spellPower || 0) - spellPowerEquiv);
  return { goal, selection: res.selection, items: res.items, legal: certLegal(evald), evald, agg, gemChoices, metas, perSlot, buffImpact };

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
      const bonusKept = !!v.socketBonus && reassignForBonus(coloredCh, v.sockets); // relabels for display
      alts.push({
        itemId: v.itemId, name: v.name || null, objDelta: (sc - chosenScore) / denom, dropInLegal,
        gems: plan.choices.map((c) => ({ name: c.name, id: c.id || null, socket: c.socket || null })),
        socketBonus: v.socketBonus || null,
        bonusKept,
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
    // Encounter avoidance mode: 'illidan' | 'sunwell' | null. Forces the uncrushable gate onto the
    // reduced avoidance those fights leave you (see encAvoid/encUncrush).
    encounter: options.encounter || null,
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
  // The as-worn set, solved as its own (single-candidate) pool so it runs the SAME evaluation path as
  // any other answer — kept exactly as equipped, no re-gemming. Computed once per goal and memoized;
  // null when nothing is flagged equipped (a hand-built export, or the demo profile).
  const wornItems = items.filter((it) => it.equipped);
  const wornSeed = equippedSeed(items);
  const wornCache = new Map();
  const wornSet = (g) => {
    if (!wornItems.length) return null;
    if (wornCache.has(g)) return wornCache.get(g);
    let out = null;
    try {
      out = runGoal(g, wornItems, { ...ctx, keep: () => true, keepIgnoreCompleteness: true }, {});
    } catch { out = null; } // a partial/odd worn set must never break the solve
    wornCache.set(g, out);
    return out;
  };
  // The same pool solved with EVERY item's gems/enchants kept exactly as worn — the floor "re-gem
  // everything" has to clear (see solveGoal). Memoized per goal. Null in keep mode, where the main
  // solve already is this set.
  const asIsCache = new Map();
  const asIsSet = (g) => {
    if (ctx.keep) return null;
    if (asIsCache.has(g)) return asIsCache.get(g);
    let out = null;
    try {
      out = solveGoalRaw(g, {}, { ...ctx, keep: () => true, keepIgnoreCompleteness: true });
    } catch { out = null; } // the floor is an optimization, never a reason to fail the solve
    asIsCache.set(g, out);
    return out;
  };
  // The as-is answer's per-slot picks, as a seed map. Null when there is no as-is set (keep mode, or
  // the solve threw) so the caller falls back to the equipped seed.
  const asIsSeed = (g) => {
    const a = asIsSet(g);
    if (!a) return null;
    const s = {};
    for (const [slot, it] of Object.entries(a.selection)) if (it) s[slot] = it.itemId;
    return Object.keys(s).length ? s : null;
  };

  // Solve one goal at a given seed (incl. the Min-HP floor-recovery fallback). Factored out so the
  // Balanced goal can be solved from more than one seed and keep the best (see below).
  // `useCtx` lets the as-is floor reuse this whole path (recovery sweep included) under a keep-mode
  // ctx — an encounter goal's as-worn answer often needs that sweep to clear its harder avoidance gate,
  // and a floor computed by the plain solve would come back illegal and be silently skipped.
  const solveGoalRaw = (g, gseed, useCtx = ctx) => {
    // Live slider drags pass the PREVIOUS result's per-slot selection as a seed, so each nudge climbs
    // from the adjacent (good) set instead of restarting cold — this kills the heuristic's small
    // non-monotonic wiggles (an SP dip when the slider should only rise) as you sweep the dial.
    // Seed from the EQUIPPED set when the caller gave no seed of its own, so the search starts from a
    // set that is known-good rather than from the per-slot greedy pick. Better still in re-gem mode:
    // seed from the AS-IS answer for this goal — the best set reachable without touching a gem, which
    // dominates the worn set and is already computed for the floor below. The heuristic is greedy, so
    // where it starts decides where it lands: seeding cold cost ~0.2% on the Survival goal once the
    // as-worn variants widened the pool. `useCtx.keep` is set exactly when THIS call is the as-is solve
    // itself, which is also what stops the two from recursing into each other.
    const seedBase = useCtx.keep ? wornSeed : (asIsSeed(g) || wornSeed);
    const r = runGoal(g, items, useCtx, Object.keys(gseed).length ? gseed : seedBase);
    const floor = (g.gates && g.gates.minHealth) || 0;
    const crushReq = !g.gates || g.gates.requireUncrushable !== false;
    const floorMet = !floor || r.agg.health + 1e-9 >= floor;
    const crushMet = !crushReq || encUncrush(r.evald, g.enc || useCtx.encounter || null);
    if (floorMet && crushMet) return r; // the gates this recovery repairs (Min-HP floor + uncrushable) are met
    // Uncrushable and Min-HP are HARD gates, but the greedy+repair heuristic can return an ILLEGAL set
    // even when a legal one exists — e.g. it keeps a higher-threat libram and lands ~0.1% short of the
    // crush cap instead of swapping to the block libram. So when either repairable gate is unmet, run a
    // defensive recovery: sweep a range of EHP-leans (seeded from the tankiest set), keep only FULLY-LEGAL
    // sets, and pick the one the goal's OWN ratio scores highest — so a threat goal still maximizes threat
    // AMONG the sets that clear the gates, never surfacing a higher-threat crushable (or sub-floor) set.
    // Tankiest reference: maximize pure STAMINA (keep uncrit/uncrush, drop the floor so the search isn't
    // pinned below the reachable max); it anchors the floor and seeds the leans from a defensive start.
    const maxHp = runGoal({ ...g, ratio: { sta: 1 }, gates: { ...g.gates, minHealth: 0 } }, items, useCtx);
    if (floor && maxHp.agg.health + 1e-9 < floor) {
      // The Min-HP floor itself is unreachable with this gear/keep-settings → best-effort tankiest set, flagged.
      return maxHp.agg.health > r.agg.health ? { ...maxHp, goal: g, legal: false, hpBestEffort: true } : r;
    }
    const seed = {};
    for (const [slot, it] of Object.entries(maxHp.selection)) if (it) seed[slot] = it.itemId;
    // On live slider drags the previous (legal) set is passed as gseed — climb the recovery leans from THAT
    // adjacent set so consecutive nudges move continuously (no cold-restart SP dip). Cold runs (no gseed)
    // seed from max-HP, so behavior outside live dragging is unchanged.
    const recSeed = Object.keys(gseed).length ? gseed : seed;
    const objScale = blendScale(g.ratio);
    const leans = [g.ratio, { ehp: 1, threat: 1 }, { ehp: 1.5, threat: 1 }, { ehp: 2, threat: 1 }, { ehp: 3, threat: 1 }];
    // Keep only candidates that pass EVERY gate — c.legal covers uncrit + uncrush + Min-HP; the explicit
    // floor check also catches maxHp (run with the floor dropped).
    const cands = [maxHp, ...leans.map((rt) => runGoal({ ...g, ratio: rt }, items, useCtx, recSeed))]
      .filter((c) => c.legal && (!floor || c.agg.health + 1e-9 >= floor));
    if (!cands.length) return r; // no legal set reachable with this gear/keep-settings — keep the best-effort (flagged illegal)
    const best = cands.reduce((a, b) => (score(b.agg._raw, objScale) > score(a.agg._raw, objScale) ? b : a));
    return { ...best, goal: g, legal: best.legal && (!floor || best.agg.health + 1e-9 >= floor) };
  };

  // EQUIPPED FLOOR. A recommendation that scores below the gear you already have is not a
  // recommendation. The worn set is always attainable, so if it beats the solved one on THIS goal's
  // own objective, return it and say so (`equippedIsBest`) rather than surfacing a sidegrade the
  // player would read as an upgrade. Skipped when the worn set can't legally stand in for the answer:
  //   - it fails the goal's gates (uncrit / uncrush / Min-HP) — a threat set can't answer Survival;
  //   - it violates a lock or pin the player set (they asked for gear they aren't wearing);
  //   - the solved answer is itself illegal/best-effort, where a flagged near-miss is the honest
  //     output and silently swapping in the worn set would hide that the gates are unreachable.
  const solveGoal = (g, gseed) => {
    let r = solveGoalRaw(g, gseed);
    // AS-IS FLOOR (re-gem mode only). Keeping the gems already in your gear is always attainable, so
    // "re-gem everything" must never return LESS than the same solve with them kept — otherwise the
    // site contradicts the addon, which is exactly how this was found. The as-worn variant added in
    // itemVariants puts that configuration in the search space and closed most of the gap (Illidan
    // -0.40% -> -0.09%), but the heuristic is greedy and still may not FIND it, so the guarantee has to
    // be a floor, not a hope. Cheap enough to be unconditional: keep-mode solving is ~4x faster than
    // re-gem (one variant per item, no gem planning), so this adds ~20%, not 2x.
    // It needs no equippedMeetsConstraints-style guard the way the equipped floor does — this runs the
    // SAME runGoal with the SAME ctx, so the goal's locks and the player's pins are already honored.
    const asIs = asIsSet(g);
    if (asIs && asIs.legal) {
      // A legal set always beats a flagged best-effort one; otherwise compare on the goal's objective.
      if (!r.legal) r = { ...asIs, goal: g };
      else if (score(asIs.agg._raw, blendScale(g.ratio)) > score(r.agg._raw, blendScale(g.ratio)) + 1e-9) r = { ...asIs, goal: g };
    }
    const worn = wornSet(g);
    if (!worn || !worn.legal || !r.legal) return r;
    if (!equippedMeetsConstraints(items, g, ctx.locks, ctx.pins)) return r;
    const objScale = blendScale(g.ratio);
    // TIES GO TO THE GEAR YOU ARE WEARING. The solved answer has to be STRICTLY better to displace it:
    // an equal-scoring set is not an upgrade, and telling someone to swap pieces for zero gain — or
    // worse, handing back their own set without the "already equipped" label because a different
    // object won the tie — is noise. (This surfaced once the as-is floor started returning the worn
    // set verbatim on a well-gemmed character: same 17 pieces, identical score, flag silently lost.)
    if (score(worn.agg._raw, objScale) + 1e-9 < score(r.agg._raw, objScale)) return r;
    return { ...worn, goal: g, equippedIsBest: true };
  };
  // The web UI builds the Balanced goal's ratio by blending the Survival and Raid ratios (its slider
  // slides between the two sets), so the engine stays generic — every goal is just a ratio + gates.
  const selSeed = (res) => { const s = {}; for (const [slot, it] of Object.entries(res.selection)) if (it) s[slot] = it.itemId; return s; };
  // Balanced is a blend DIAL between the Survival set (t=0) and the Raid set (t=1). Its ratio + Min-HP
  // floor are interpolated from those two goals, so AT EITHER END it is mathematically identical to that
  // end goal — does its ratio and floor exactly equal Raid's or Survival's? (Raid & Survival are solved
  // earlier in the goals order, so their results are ready by the time Balanced is reached.)
  const sameGoal = (g, id) => {
    const e = goals.find((x) => x.id === id); if (!e || !byId[id]) return false;
    const a = g.ratio || {}, b = e.ratio || {};
    const eq = (x, y) => Math.abs((x || 0) - (y || 0)) < 1e-9;
    return eq(a.ehp, b.ehp) && eq(a.threat, b.threat) && eq(a.aoeThreat, b.aoeThreat)
      && ((g.gates && g.gates.minHealth) || 0) === ((e.gates && e.gates.minHealth) || 0);
  };
  const byId = {};
  return goals.map((g) => {
    const gseed = (options.seeds && options.seeds[g.id]) || {};
    let res;
    // At an end, COPY the end goal's result (re-tagged as Balanced) instead of re-optimizing — the
    // Min-HP floor-recovery heuristic is seed/path-dependent, so a fresh solve from a different seed can
    // land on a different floor-holder (e.g. tankier / lower-threat than the Survival set). Copying makes
    // 100%/0% reproduce Survival/Raid bit-for-bit, path-independently.
    const endId = g.id === 'balanced' ? (sameGoal(g, 'raid') ? 'raid' : sameGoal(g, 'survival') ? 'survival' : null) : null;
    if (endId) {
      res = { ...byId[endId], goal: g };
    } else {
      res = solveGoal(g, gseed);
      // Between the ends, live seeding can leave Balanced stuck near its own previous blend. Also solve it
      // climbing from the nearer end's set (Raid past the threat midpoint, else Survival) and keep whichever
      // the goal's ratio scores higher — so the middle of the dial stays smooth and high-quality.
      if (g.id === 'balanced' && Object.keys(gseed).length) {
        const endThr = (id) => { const e = goals.find((x) => x.id === id); return (e && e.ratio && e.ratio.threat) || 0; };
        const nearer = byId[(g.ratio.threat || 0) >= (endThr('raid') + endThr('survival')) / 2 ? 'raid' : 'survival'];
        if (nearer) {
          const alt = solveGoal(g, selSeed(nearer));
          const sc = blendScale(g.ratio);
          if (score(alt.agg._raw, sc) > score(res.agg._raw, sc)) res = alt;
        }
      }
    }
    byId[g.id] = res;
    return res;
  });
}
