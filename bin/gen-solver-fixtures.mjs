#!/usr/bin/env node
// Golden parity fixtures for the ported gem/enchant solver (engine/Gems, Enchants, Professions,
// Librams, Scrolls, GemSolver — Phase D4).
//
// Runs the JS solver functions (source of truth) over representative inputs and writes inputs + golden
// outputs to test/lua/solver_fixtures.lua. The Lua runner (solver_parity.lua) feeds the same inputs to
// the ported functions and asserts it reproduces the goldens — so the addon's solver can't drift.
//
// Regenerate: npm run gen-solver-fixtures

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SCALES, blendScale } from '../src/weights.js';
import { bestGem, bestMeta, metaActivated, metaConditionHolds } from '../src/gems.js';
import { bestEnchant, factionFromEnchant, detectFaction } from '../src/enchants.js';
import { professionPerks } from '../src/professions.js';
import { libramStats } from '../src/librams.js';
import { scrollStats } from '../src/scrolls.js';
import {
  reassignForBonus, bonusEarnedAsTagged, recommendGems, recommendEnchants, planItemGems, solveLoadout,
} from '../src/gemsolver.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../test/lua/solver_fixtures.lua');

// --- Lua serialization -----------------------------------------------------------------------
const luaKey = (k) =>
  /^[A-Za-z_]\w*$/.test(k) ? k : /^\d+$/.test(k) ? `[${k}]` : `[${JSON.stringify(k)}]`;
function luaVal(x) {
  if (x === null || x === undefined) return 'nil';
  if (typeof x === 'number') return String(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (typeof x === 'string') return JSON.stringify(x);
  if (Array.isArray(x)) return `{ ${x.map(luaVal).join(', ')} }`;
  return `{ ${Object.entries(x).map(([k, v]) => `${luaKey(k)} = ${luaVal(v)}`).join(', ')} }`;
}

// Named weight sources; serialized once and referenced by id (keeps the fixtures compact). The Lua
// runner reconstructs the same map from W.SCALES + Scoring.blendScale.
const WEIGHTS = {
  threatBelow: SCALES.threatSingleBelowCap,
  threatAt: SCALES.threatSingleAtCap,
  aoe: SCALES.threatAOE,
  uncrush: SCALES.survivalUncrushable,
  ehp: SCALES.survivalEHP,
  raidBlend: blendScale({ threat: 2, sta: 1 }),
  survBlend: blendScale({ ehp: 2, threat: 1 }),
};
const W = (id) => WEIGHTS[id];
const WIDS = Object.keys(WEIGHTS);

const pick = (p, key) => (p ? { name: p[key].name, score: p.score } : false);
const namesToChoices = (choices, key = 'gem') =>
  choices.map((c) => ({ socket: c.socket, name: c.name })); // gem/enchant name lives on the merged obj

// --- 1. bestGem ------------------------------------------------------------------------------
const GEM_OPTS = [
  {},
  { allowUnique: true },
  { jewelcrafting: true },
  { maxPhase: 1 },
  { socketColor: 'red', matchColor: true },
  { socketColor: 'yellow', matchColor: true },
  { socketColor: 'blue', matchColor: true },
  { socketColor: 'blue', matchColor: true, alsoFits: 'yellow' },
  { socketColor: 'red', matchColor: true, alsoFits: 'blue' },
];
const bestGemCases = [];
for (const wId of WIDS) for (const opts of GEM_OPTS) {
  bestGemCases.push({ w: wId, opts, result: pick(bestGem(W(wId), opts), 'gem') });
}

// --- 2. bestMeta -----------------------------------------------------------------------------
const META_OPTS = [
  {},
  { counts: { red: 3, yellow: 0, blue: 0 } },
  { counts: { red: 0, yellow: 0, blue: 3 } },
  { counts: { red: 2, yellow: 2, blue: 2 } },
  { counts: { red: 2, yellow: 1, blue: 2 } },
  { counts: { red: 0, yellow: 0, blue: 0 } },
  { exclude: ['Powerful Earthstorm Diamond'] },
  { maxPhase: 1 },
];
const bestMetaCases = [];
for (const wId of WIDS) for (const opts of META_OPTS) {
  bestMetaCases.push({ w: wId, opts, result: pick(bestMeta(W(wId), opts), 'gem') });
}

// --- 3. metaConditionHolds / metaActivated ---------------------------------------------------
const COND_COUNTS = [
  { red: 0, yellow: 0, blue: 0 }, { red: 3, yellow: 0, blue: 0 }, { red: 0, yellow: 0, blue: 3 },
  { red: 2, yellow: 2, blue: 2 }, { red: 2, yellow: 1, blue: 2 }, { red: 1, yellow: 0, blue: 3 },
];
const CONDS = ['3+ blue', '2+ yellow', '3+ red', 'more red than blue', 'more blue than red', 'weird clause'];
const metaCondCases = [];
for (const cond of CONDS) for (const counts of COND_COUNTS) {
  metaCondCases.push({ cond, counts, expect: metaConditionHolds(cond, counts) });
}
const REQUIRES = ['3+ blue', '2+ blue, 1+ yellow', '2+ red, 2+ yellow, 2+ blue', 'more red than blue', null];
const metaActivatedCases = [];
for (const requires of REQUIRES) for (const counts of COND_COUNTS) {
  metaActivatedCases.push({ requires, counts, expect: metaActivated({ requires }, counts) });
}

// --- 4. bestEnchant --------------------------------------------------------------------------
const SLOTS = ['head', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'legs', 'feet', 'weapon', 'offhand', 'ring', 'nope'];
const PERKS_SETS = [{ names: [] }, { names: ['Enchanting'] }];
const ENCH_OPTS = [{}, { faction: 'Aldor' }, { faction: 'Scryer' }, { maxPhase: 5 }];
const bestEnchantCases = [];
for (const slot of SLOTS) for (const wId of ['threatBelow', 'ehp', 'uncrush']) {
  for (const perks of PERKS_SETS) for (const opts of ENCH_OPTS) {
    bestEnchantCases.push({ slot, w: wId, perks, opts, result: pick(bestEnchant(slot, W(wId), perks, opts), 'enchant') });
  }
}

// --- 5. factionFromEnchant / detectFaction ---------------------------------------------------
const factionCases = [2978, 2991, 2982, 2995, 9999, 0].map((id) => ({ enchantId: id, expect: factionFromEnchant(id) ?? null }));
const DETECT_SETS = [
  [],
  [{ slot: 'shoulder', enchantId: 2978, equipped: true }],
  [{ slot: 'shoulder', enchantId: 2991, equipped: false }, { slot: 'shoulder', enchantId: 2978, equipped: true }],
  [{ slot: 'shoulder', enchantId: 9999, equipped: true }],
  [{ slot: 'head', enchantId: 2978, equipped: true }],
];
const detectCases = DETECT_SETS.map((items) => ({ items, expect: detectFaction(items) ?? null }));

// --- 6. professionPerks ----------------------------------------------------------------------
const PROF_CHOICES = [
  [], ['Blacksmithing'], ['Blacksmithing', 'Jewelcrafting'], ['Enchanting', 'Leatherworking'],
  ['Alchemy', 'Engineering'], ['Mining', 'Herbalism'], ['Blacksmithing', 'Blacksmithing'], ['Bogus'],
];
const professionCases = PROF_CHOICES.map((chosen) => ({ chosen, expect: professionPerks(chosen) }));

// --- 7. libramStats --------------------------------------------------------------------------
const LIBRAM_ITEMS = [
  { itemId: 29388, name: 'Something' },
  { itemId: 32368, name: 'Something' },
  { itemId: 0, name: 'Libram of Repentance' },
  { itemId: 0, name: 'LIBRAM OF THE ETERNAL REST' },
  { itemId: 0, name: 'Libram of Eternal Rest' },
  { itemId: 0, name: 'Libram of Something Else' },
  { itemId: 12345, name: '' },
];
const libramCases = LIBRAM_ITEMS.map((item) => ({ item, expect: libramStats(item) ?? false }));

// --- 8. scrollStats --------------------------------------------------------------------------
const SCROLL_KEYS = [
  [], ['agility'], ['agility', 'strength', 'intellect'], ['protection'],
  ['agility', 'protection'], ['agility', 'agility'], ['bogus'],
];
const scrollCases = SCROLL_KEYS.map((keys) => ({ keys, expect: scrollStats(keys) }));

// --- 9. reassignForBonus / bonusEarnedAsTagged -----------------------------------------------
// choices carry a color + an initial socket tag (as the greedy pick / meta recolor might leave them).
const REASSIGN = [
  { choices: [{ color: 'orange', socket: 'yellow' }, { color: 'blue', socket: 'red' }], sockets: { red: 1, blue: 1 } },
  { choices: [{ color: 'purple', socket: 'red' }, { color: 'orange', socket: 'red' }], sockets: { red: 1, yellow: 1 } },
  { choices: [{ color: 'red', socket: 'red' }, { color: 'red', socket: 'red' }], sockets: { red: 1, blue: 1 } },
  { choices: [{ color: 'green', socket: 'blue' }], sockets: { yellow: 1 } },
  { choices: [], sockets: { red: 1 } },
  { choices: [{ color: 'orange', socket: 'red' }], sockets: {} },
];
const reassignCases = REASSIGN.map(({ choices, sockets }) => {
  const clone = choices.map((c) => ({ ...c }));
  const ret = reassignForBonus(clone, sockets);
  return { choices, sockets, ret, resultSockets: clone.map((c) => c.socket), earned: bonusEarnedAsTagged(clone) };
});

// --- 10. recommendGems -----------------------------------------------------------------------
const SOCKET_COUNTS = [
  { socketRed: 1, socketYellow: 1, socketBlue: 1 },
  { socketRed: 2 },
  { socketBlue: 1, socketMeta: 1 },
  { socketMeta: 1 },
  {},
];
const recommendGemsCases = [];
for (const sc of SOCKET_COUNTS) for (const wId of ['threatBelow', 'ehp', 'uncrush']) {
  const r = recommendGems(sc, W(wId), {});
  recommendGemsCases.push({ socketCounts: sc, w: wId, choices: namesToChoices(r.choices), stats: r.stats });
}

// --- 11. recommendEnchants -------------------------------------------------------------------
const recommendEnchantsCases = [];
for (const slots of [['head', 'ring', 'legs'], ['ring'], ['nope', 'chest'], ['shoulder']]) {
  for (const wId of ['threatBelow', 'ehp']) for (const perks of PERKS_SETS) for (const opts of [{}, { faction: 'Aldor' }]) {
    const r = recommendEnchants(slots, W(wId), perks, opts);
    const choices = Object.fromEntries(Object.entries(r.choices).map(([s, e]) => [s, e.name]));
    recommendEnchantsCases.push({ slots, w: wId, perks, opts, choices, stats: r.stats });
  }
}

// --- 12. planItemGems ------------------------------------------------------------------------
const PLAN_ITEMS = [
  { slot: 'chest', sockets: { red: 1, yellow: 1 }, socketBonus: { stat: 'defenseRating', value: 4 } },
  { slot: 'hands', sockets: { blue: 1 }, socketBonus: { stat: 'stamina', value: 6 } },
  { slot: 'legs', sockets: { red: 1, blue: 1, meta: 1 }, socketBonus: { stat: 'spellDamage', value: 5 } },
  { slot: 'head', sockets: { meta: 1 } },
  { slot: 'waist', sockets: {} },
  { slot: 'wrist', sockets: { yellow: 2 }, socketBonus: { stat: 'strength', value: 4 } },
];
const planCases = [];
for (const item of PLAN_ITEMS) for (const wId of ['threatBelow', 'ehp', 'uncrush']) {
  for (const opts of [{}, { gateScale: SCALES.survivalUncrushable }]) {
    const r = planItemGems(item, W(wId), {}, undefined, opts);
    planCases.push({
      item, w: wId, gate: !!opts.gateScale,
      choices: namesToChoices(r.choices), stats: r.stats, metaCount: r.metaCount,
    });
  }
}

// --- 13. solveLoadout ------------------------------------------------------------------------
const baseItem = (slot, stats, sockets, socketBonus) => ({
  slot, stats: { ...stats }, baseStats: { ...stats }, sockets: sockets || {}, socketBonus,
});
const SET = [
  baseItem('chest', { stamina: 30, defenseRating: 20 }, { red: 1, yellow: 1 }, { stat: 'defenseRating', value: 4 }),
  baseItem('hands', { spellDamage: 20 }, { blue: 1 }, { stat: 'stamina', value: 6 }),
  baseItem('legs', { stamina: 40, dodgeRating: 25 }, { red: 1, blue: 1, meta: 1 }, { stat: 'spellDamage', value: 5 }),
  baseItem('ring', { spellDamage: 15 }, {}),
  baseItem('shoulder', { defenseRating: 15 }, {}),
];
// A set forced uncrushable (huge avoidance) so the atCapWeights switch takes its TRUE branch.
const UNCRUSH_SET = [
  baseItem('chest', { dodgeRating: 2000, parryRating: 2000, defenseRating: 2000, blockRating: 2000, stamina: 200 }, { red: 1 }, { stat: 'defenseRating', value: 4 }),
  baseItem('hands', { spellDamage: 20 }, { blue: 1 }, { stat: 'stamina', value: 6 }),
];
const solveConfigs = [
  { set: SET, w: 'raidBlend', perks: { names: [] }, opts: {} },
  { set: SET, w: 'raidBlend', perks: { names: ['Enchanting'] }, opts: {} },
  { set: SET, w: 'ehp', perks: { names: [] }, opts: { maxPhase: 1 } },
  { set: SET, w: 'survBlend', perks: { names: [] }, opts: { atCapWeights: SCALES.survivalEHP } },
  { set: UNCRUSH_SET, w: 'uncrush', perks: { names: [] }, opts: { atCapWeights: SCALES.survivalEHP } },
];
const solveCases = solveConfigs.map(({ set, w, perks, opts }) => {
  const r = solveLoadout(set, W(w), perks, opts);
  const enchants = Object.fromEntries(Object.entries(r.enchants.choices).map(([s, e]) => [s, e.name]));
  return {
    set, w, perks, opts: { maxPhase: opts.maxPhase ?? null, atCap: opts.atCapWeights ? 'survivalEHP' : null },
    gemChoices: namesToChoices(r.gems.choices), gemStats: r.gems.stats,
    metas: r.gems.metas.map((m) => ({ name: m.name, active: m.active })),
    enchants, addedStats: r.addedStats,
  };
});

// --- emit ------------------------------------------------------------------------------------
const banner =
  '-- GENERATED by bin/gen-solver-fixtures.mjs — do not edit by hand.\n' +
  '-- Golden gem/enchant SOLVER outputs from the JS source of truth (src/{gems,enchants,professions,\n' +
  '-- librams,scrolls,gemsolver}.js). Regenerate: npm run gen-solver-fixtures\n\n';

const sections = {
  weights: WEIGHTS,
  bestGem: bestGemCases,
  bestMeta: bestMetaCases,
  metaCond: metaCondCases,
  metaActivated: metaActivatedCases,
  bestEnchant: bestEnchantCases,
  faction: factionCases,
  detect: detectCases,
  professions: professionCases,
  librams: libramCases,
  scrolls: scrollCases,
  reassign: reassignCases,
  recommendGems: recommendGemsCases,
  recommendEnchants: recommendEnchantsCases,
  planItemGems: planCases,
  solveLoadout: solveCases,
};

const body = Object.entries(sections)
  .map(([k, v]) => `  ${k} = ${luaVal(v)},`)
  .join('\n');

writeFileSync(outFile, banner + `return {\n${body}\n}\n`);
const total = Object.values(sections).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
console.log(`Wrote ${outFile}  (${total} cases across ${Object.keys(sections).length - 1} sections)`);
