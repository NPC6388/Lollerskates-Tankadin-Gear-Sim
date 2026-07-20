#!/usr/bin/env node
// Golden parity fixtures for the ported four-set orchestration (engine/Runner.lua — Phase D5b).
//
// Runs the JS optimizeSets (source of truth) over a synthetic item pool × option sets and writes the
// inputs + a golden SUMMARY of each goal result (selection / agg / evald / gems / metas / per-slot detail
// incl. alternatives / buffImpact) to test/lua/runner_fixtures.lua. The Lua runner (runner_parity.lua)
// feeds the same items/options to Runner.optimizeSets and asserts it reproduces the summary.
//
// Regenerate: npm run gen-runner-fixtures

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { optimizeSets, GOAL_PRESETS } from '../src/runner.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../test/lua/runner_fixtures.lua');

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

// --- synthetic item pool (owned/equippable shape: slot, itemId, equipLoc, name, stats, baseStats,
// sockets, socketBonus, gems, enchantId). Includes socketed pieces + a meta socket, a Justicar 2pc, a
// libram (spellPowerEquiv), the trinket-lock ids, and a keep-lockable neck. ---------------------------
const it = (o) => ({ equipped: false, gems: [], enchantId: 0, sockets: {}, baseStats: o.baseStats || o.stats, ...o });
const ITEMS = [
  // head — Justicar (29068) for a possible 2pc, + a threat head with a meta socket
  it({ equipped: true, itemId: 29068, slot: 'head', equipLoc: 'INVTYPE_HEAD', name: 'Justicar Faceguard', stats: { stamina: 55, defenseRating: 40, dodgeRating: 25, spellDamage: 18, armor: 1300 } }),
  it({ itemId: 60002, slot: 'head', equipLoc: 'INVTYPE_HEAD', name: 'Threat Helm', stats: { stamina: 24, spellDamage: 46, spellHitRating: 14, armor: 900 }, sockets: { meta: 1 }, socketBonus: { stat: 'spellDamage', value: 5 } }),
  // shoulder (with an Aldor inscription enchant already applied on one)
  it({ equipped: true, itemId: 60010, slot: 'shoulder', equipLoc: 'INVTYPE_SHOULDER', name: 'Pauldrons', stats: { stamina: 30, defenseRating: 24, spellDamage: 16, armor: 800 }, enchantId: 2978 }),
  // chest — Justicar (29066) socketed with a def bonus, + a threat chest
  it({ equipped: true, gems: [30555, 30590], itemId: 29066, slot: 'chest', equipLoc: 'INVTYPE_CHEST', name: 'Justicar Chestguard', stats: { stamina: 60, defenseRating: 45, parryRating: 30, armor: 1500 }, sockets: { red: 1, yellow: 1 }, socketBonus: { stat: 'defenseRating', value: 4 } }),
  it({ itemId: 60021, slot: 'chest', equipLoc: 'INVTYPE_CHEST', name: 'Threat Chest', stats: { stamina: 28, spellDamage: 52, spellHitRating: 12, armor: 1000 } }),
  // legs — socketed with a meta socket (exercises resolveMetas + recolor)
  it({ equipped: true, gems: [30555, 30590], itemId: 60030, slot: 'legs', equipLoc: 'INVTYPE_LEGS', name: 'Legguards', stats: { stamina: 70, defenseRating: 40, dodgeRating: 30, armor: 1400 }, sockets: { red: 1, blue: 1, meta: 1 }, socketBonus: { stat: 'stamina', value: 6 } }),
  it({ itemId: 60031, slot: 'legs', equipLoc: 'INVTYPE_LEGS', name: 'Threat Legs', stats: { stamina: 30, spellDamage: 50, spellHitRating: 10, armor: 1000 } }),
  // hands (socketed, blue)
  it({ equipped: true, gems: [30590], itemId: 60040, slot: 'hands', equipLoc: 'INVTYPE_HAND', name: 'Handguards', stats: { stamina: 35, defenseRating: 28, armor: 800 }, sockets: { blue: 1 }, socketBonus: { stat: 'stamina', value: 4 } }),
  // wrist / feet / back / waist
  it({ equipped: true, itemId: 60050, slot: 'wrist', equipLoc: 'INVTYPE_WRIST', name: 'Bracers', stats: { stamina: 24, defenseRating: 20, spellDamage: 12, armor: 500 } }),
  it({ equipped: true, itemId: 60060, slot: 'feet', equipLoc: 'INVTYPE_FEET', name: 'Boots', stats: { stamina: 30, dodgeRating: 20, spellDamage: 14, armor: 700 } }),
  it({ equipped: true, itemId: 60070, slot: 'back', equipLoc: 'INVTYPE_CLOAK', name: 'Cloak', stats: { stamina: 20, dodgeRating: 16, spellDamage: 12, armor: 250 } }),
  it({ equipped: true, itemId: 60080, slot: 'waist', equipLoc: 'INVTYPE_WAIST', name: 'Belt', stats: { stamina: 34, defenseRating: 24, blockRating: 18, armor: 800 } }),
  // neck — keep-lockable (filled yellow socket, no enchant slot)
  it({ equipped: true, itemId: 60090, slot: 'neck', equipLoc: 'INVTYPE_NECK', name: 'Pendant', stats: { stamina: 18, defenseRating: 16, hitRating: 8 }, sockets: { yellow: 1 }, gems: [24051] }),
  it({ itemId: 60091, slot: 'neck', equipLoc: 'INVTYPE_NECK', name: 'Threat Pendant', stats: { stamina: 12, spellDamage: 24, spellHitRating: 10 } }),
  // rings (3)
  it({ equipped: true, itemId: 60100, slot: 'ring', equipLoc: 'INVTYPE_FINGER', name: 'Ring A', stats: { stamina: 22, defenseRating: 20, dodgeRating: 14 } }),
  it({ equipped: true, itemId: 60101, slot: 'ring', equipLoc: 'INVTYPE_FINGER', name: 'Ring B', stats: { stamina: 14, spellDamage: 22, resilienceRating: 10 } }),
  it({ itemId: 60102, slot: 'ring', equipLoc: 'INVTYPE_FINGER', name: 'Ring C', stats: { stamina: 18, parryRating: 18, blockRating: 12 } }),
  // trinkets (3) — include the trinket-lock ids (Icon 29370 / Eye 28789)
  it({ equipped: true, itemId: 29370, slot: 'trinket', equipLoc: 'INVTYPE_TRINKET', name: 'Icon of the Silver Crescent', stats: { spellDamage: 43, spellHitRating: 10 } }),
  it({ equipped: true, itemId: 28789, slot: 'trinket', equipLoc: 'INVTYPE_TRINKET', name: 'Eye of Magtheridon', stats: { spellDamage: 40, spellCritRating: 22 } }),
  it({ itemId: 60112, slot: 'trinket', equipLoc: 'INVTYPE_TRINKET', name: 'Defensive Trinket', stats: { defenseRating: 40, resilienceRating: 30, stamina: 40 } }),
  // weapons: 1H (kept) + 2H (excluded)
  it({ equipped: true, itemId: 60120, slot: 'weapon', equipLoc: 'INVTYPE_WEAPONMAINHAND', name: 'Mace', stats: { spellDamage: 55, hitRating: 12, stamina: 20 } }),
  it({ itemId: 60121, slot: 'weapon', equipLoc: 'INVTYPE_2HWEAPON', name: 'Big Mace', stats: { spellDamage: 95, stamina: 30 } }),
  // shields (2)
  it({ equipped: true, itemId: 60130, slot: 'offhand', equipLoc: 'INVTYPE_SHIELD', name: 'Shield A', stats: { stamina: 50, blockValue: 120, blockRating: 60, defenseRating: 30, armor: 3200 } }),
  it({ itemId: 60131, slot: 'offhand', equipLoc: 'INVTYPE_SHIELD', name: 'Shield B', stats: { stamina: 30, blockValue: 95, spellDamage: 20, armor: 2900 } }),
  // relic — libram (spellPowerEquiv split); Librams overrides its stats by id 32368
  it({ equipped: true, itemId: 32368, slot: 'relic', equipLoc: 'INVTYPE_RELIC', name: 'Libram of the Eternal Rest', stats: { spellDamage: 35 } }),
];

// --- option sets (exercise buffs, professions/faction, meta exclude, keep-mode, phase, custom goals) ---
const OPTIONS = [
  { professions: [], buff: 'raid', maxPhase: 2, faction: 'Aldor' },
  { professions: ['Blacksmithing', 'Jewelcrafting'], buff: 'raid', useImbuedMeta: false, faction: 'Aldor' },
  { professions: ['Enchanting'], buff: 'kings', keepGemsEnchants: true },
  // Custom goals with a Min-HP floor to exercise solveGoal's floor recovery + Balanced.
  {
    professions: [], buff: 'raid',
    goals: [
      { id: 'raid', name: 'Raid', ratio: { ehp: 1, threat: 2 }, gates: { raid: true, requireUncrushable: true, minHealth: 12500 }, lockEye: true },
      { id: 'survival', name: 'Survival', ratio: { ehp: 2, threat: 1 }, gates: { raid: true, requireUncrushable: true, minHealth: 13500 }, lockEye: false },
      { id: 'balanced', name: 'Balanced', ratio: { ehp: 1, threat: 1 }, gates: { raid: true, requireUncrushable: true, minHealth: 13000 }, lockEye: true },
    ],
  },
  // Phase-1 cap while the WORN pieces carry epic phase-2 cuts the solver may not buy, with locks
  // matching the worn trinkets — exercises the equipped BASELINE path (seed + the worn set being
  // built and scored) against a pool where re-gemming is constrained.
  { professions: [], buff: 'raid', maxPhase: 1, trinketLocks: { icon: 29370, eye: 28789 } },
];

// --- summary extraction (identical shape must be reproduced Lua-side) ----------------------------
const pair = (c) => ({ name: c.name ?? null, socket: c.socket ?? null });
function summarize(r) {
  const s = { id: r.goal.id, legal: r.legal };
  if (r.hpBestEffort) s.hpBestEffort = true;
  if (r.equippedIsBest) s.equippedIsBest = true; // the equipped floor fired — must match Lua-side
  s.selection = {};
  for (const [slot, i] of Object.entries(r.selection)) if (i) s.selection[slot] = i.itemId;
  const A = r.agg, E = r.evald;
  s.agg = {
    spellPower: A.spellPower, spellPowerLiteral: A.spellPowerLiteral, spellPowerEquiv: A.spellPowerEquiv,
    health: A.health, armor: A.armor, stamina: A.stamina, agility: A.agility, strength: A.strength,
    intellect: A.intellect, blockValue: A.blockValue, spellCritRating: A.spellCritRating,
  };
  s.evald = {
    totalAvoidanceWithHS: E.totalAvoidanceWithHS, critReduction: E.critReduction, ehpPhysical: E.ehpPhysical,
    uncrushable: E.uncrushable, raidCritImmune: E.raidCritImmune,
  };
  s.gemChoices = r.gemChoices.map(pair);
  s.metas = r.metas.map((m) => ({ name: m.name, active: m.active }));
  s.perSlot = {};
  for (const [slot, p] of Object.entries(r.perSlot)) {
    s.perSlot[slot] = {
      gems: (p.gems || []).map(pair),
      enchant: p.enchant ? p.enchant.name : null,
      defGemmed: p.defGemmed, locked: p.locked, bonusKept: p.bonusKept ?? null,
      socketBonus: p.socketBonus ? { stat: p.socketBonus.stat, value: p.socketBonus.value } : null,
      alternatives: (p.alternatives || []).map((a) => ({ itemId: a.itemId, objDelta: a.objDelta, dropInLegal: a.dropInLegal, bonusKept: a.bonusKept })),
    };
  }
  s.buffImpact = r.buffImpact ? {
    stamina: r.buffImpact.stamina, agility: r.buffImpact.agility, intellect: r.buffImpact.intellect,
    strength: r.buffImpact.strength, armor: r.buffImpact.armor, health: r.buffImpact.health,
    crushAvoid: r.buffImpact.crushAvoid, critReduction: r.buffImpact.critReduction,
  } : null;
  return s;
}

const cases = OPTIONS.map((opts) => ({ options: opts, results: optimizeSets(ITEMS, opts).map(summarize) }));
if (process.env.DEBUG_BAND) {
  cases.forEach((c, i) => c.results.forEach((r) => {
    if (['aoe', 'sunwell', 'brutallus'].includes(r.id)) return; // not uncrushable-required
    const av = r.evald.totalAvoidanceWithHS;
    const band = av >= 102.4 && av < 102.7 ? '  <-- MARGINAL [102.4,102.7)' : '';
    console.error(`case${i + 1} ${r.id.padEnd(9)} avoid=${av.toFixed(4)} legal=${r.legal}${band}`);
  }));
}

const banner =
  '-- GENERATED by bin/gen-runner-fixtures.mjs — do not edit by hand.\n' +
  '-- Golden four-set orchestration output from the JS source of truth (src/runner.js).\n' +
  '-- Regenerate: npm run gen-runner-fixtures\n\n';

writeFileSync(outFile, banner + `return {\n  items = ${luaVal(ITEMS)},\n  cases = ${luaVal(cases)},\n}\n`);
const nGoals = cases.reduce((n, c) => n + c.results.length, 0);
console.log(`Wrote ${outFile}  (${ITEMS.length} items, ${cases.length} option sets, ${nGoals} goal results)`);
