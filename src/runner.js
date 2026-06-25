// Four-set optimization orchestration, shared by the CLI (bin/optimize.mjs) and the web UI.
// Browser- and Node-safe: no fs, no DOM. Given a parsed item pool it returns the player's tuned
// sets (raid threat / survival / AOE trash / balanced), each gemmed/enchanted with crit/crush
// status. Gemming is a LEVER for the caps: each socketed item enters as a focus variant (goal
// gems) and a cap variant (avoidance/defense gems), so the optimizer can keep a higher-threat
// item and gem IT for defense when that beats a tankier swap. Final gems are recomputed
// socket-bonus-aware via solveLoadout.

import { aggregate, BUFFS, TALENTS, talentsFromRanks } from './model.js';
import { evaluateSet } from './character.js';
import { bestGem, bestMeta, gemColors } from './gems.js';
import { bestEnchant } from './enchants.js';
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

const baseOf = (it) => it.baseStats || it.stats || {};
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
  const en = bestEnchant(it.slot, enchScale, perks, { faction });
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

function runGoal(goal, items, ctx) {
  const { perks, buff, maxPhase, faction, locks, talents } = ctx;
  const aggOpts = { hsBlockBonus: HS, ...buff, ...(talents ? { talents } : {}) };
  const objScale = blendScale(goal.ratio);
  const prepared = items.flatMap((it) => itemVariants(it, objScale, ctx));
  const { pool, distinct, locked } = buildPool(prepared, { lock: lockFor(goal, locks) });
  const oGoal = { objective: 'scale', scaleWeights: objScale, gates: goal.gates, ...aggOpts };
  const res = optimizeHeuristic(pool, oGoal, { distinct, locked });

  // Final gemming, socket-bonus-aware, PER ITEM so we can report gems/enchant by slot. Focus
  // items gem by the goal scale, def-gemmed items by the cap scale. Meta activation is judged
  // set-wide (a meta on the helm counts blue gems from the legs, etc.). Built from baseStats so
  // there's no double-count.
  const metaOpts = metaOptsFor(ctx);
  const plans = res.items.map((v) => ({ v, scale: v._gem === 'cap' ? CAP_SCALE : objScale, plan: planItemGems(v, v._gem === 'cap' ? CAP_SCALE : objScale, perks, maxPhase) }));
  const counts = { red: 0, yellow: 0, blue: 0 };
  for (const p of plans) for (const c of p.plan.choices) for (const col of gemColors(c)) if (counts[col] != null) counts[col]++;

  const added = {};
  const gemChoices = [];
  const metas = [];
  for (const p of plans) {
    const pMetas = [];
    for (let i = 0; i < p.plan.metaCount; i++) {
      let m = bestMeta(p.scale, { counts, ...metaOpts }); let active = true;
      if (!m) { m = bestMeta(p.scale, metaOpts); active = false; }
      if (m) { p.plan.choices.push({ socket: 'meta', ...m.gem }); if (active) sumInto(p.plan.stats, m.gem.stats); pMetas.push({ name: m.gem.name, active, requires: m.gem.requires }); }
    }
    const en = bestEnchant(p.v.slot, p.scale, perks, { faction });
    if (en) sumInto(p.plan.stats, en.enchant.stats);
    sumInto(added, p.plan.stats);
    gemChoices.push(...p.plan.choices);
    metas.push(...pMetas);
    p.gems = p.plan.choices.map((c) => ({ name: c.name, id: c.id || null }));
    p.enchant = en ? { name: en.enchant.name, id: en.enchant.id || null, effectId: en.enchant.enchant || null } : null;
    p.metas = pMetas;
  }
  const agg = aggregate([...res.items.map((v) => ({ stats: baseOf(v) })), { stats: added }], aggOpts);
  const evald = evaluateSet(agg);

  // What Kings + MotW actually contribute to this set (buffed minus the same set unbuffed), so
  // the UI can annotate the gates: buffs add stamina/agi (EHP + a little dodge toward uncrush)
  // but no defense/resilience, so they don't move crit immunity.
  let buffImpact = null;
  if (buff && buff.kings) {
    const baseStats = [...res.items.map((v) => ({ stats: baseOf(v) })), { stats: added }];
    const aggU = aggregate(baseStats, { hsBlockBonus: HS, ...(talents ? { talents } : {}) });
    const eU = evaluateSet(aggU);
    buffImpact = {
      stamina: agg.stamina - aggU.stamina,
      agility: agg.agility - aggU.agility,
      armor: agg.armor - aggU.armor,
      health: agg.health - aggU.health,
      crushAvoid: evald.totalAvoidanceWithHS - eU.totalAvoidanceWithHS, // dodge gained, toward uncrush
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

// Main entry. items = equippableItems(parseExport(text)). options:
//   professions: string[]   buffed: bool   maxPhase?: number   trinketLocks?: {icon,eye}
//   goals?: GOAL_PRESETS-shaped[] (override, e.g. with UI-tweaked ratios)
export function optimizeSets(items, options = {}) {
  const ctx = {
    perks: professionPerks(options.professions || []),
    buff: options.buffed ? { kings: true, buffs: BUFFS.markOfTheWild } : {},
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
