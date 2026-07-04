#!/usr/bin/env node
// Golden parity fixtures for the ported optimizer core (engine/Optimizer.lua + Sets.lua — Phase D5a).
//
// Runs the JS buildPool / distinctOk / optimizeHeuristic / optimizeExhaustive (source of truth) over
// synthetic item pools + goals and writes inputs + golden outputs to test/lua/optimizer_fixtures.lua.
// The Lua runner (optimizer_parity.lua) feeds the same items/goals to the ports and asserts it picks the
// same selection / objective value / legality — so the in-game search can't drift from the website's.
//
// Regenerate: npm run gen-optimizer-fixtures

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildPool, optimizeHeuristic, optimizeExhaustive, distinctOk } from '../src/optimizer.js';
import { blendScale } from '../src/weights.js';
import { BUFFS } from '../src/model.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../test/lua/optimizer_fixtures.lua');

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

// --- synthetic item pool (varied threat/survival itemization so the gates actually bite) ---------
let nextId = 50000;
const mk = (slot, equipLoc, stats) => ({ itemId: nextId++, slot, equipLoc, stats });
// Defensive variants are deliberately strong (high defense/avoidance/resilience) so a fully-defensive
// selection clears the crit-immunity + uncrushable gates — that makes some sets LEGAL, exercising the
// heuristic's climb branch and a non-nil exhaustive result. Threat variants are weak on defense, so the
// max-objective seed fails the gates and the repair loop has to swap toward the defensive pieces.
const ITEMS = [
  // head (3)
  mk('head', 'INVTYPE_HEAD', { stamina: 80, defenseRating: 140, dodgeRating: 120, resilienceRating: 40, armor: 1500 }),
  mk('head', 'INVTYPE_HEAD', { stamina: 20, spellDamage: 40, hitRating: 10, armor: 600 }),
  mk('head', 'INVTYPE_HEAD', { stamina: 30, defenseRating: 60, spellDamage: 20, armor: 900 }),
  // chest (3)
  mk('chest', 'INVTYPE_CHEST', { stamina: 90, defenseRating: 160, parryRating: 120, resilienceRating: 40, armor: 1800 }),
  mk('chest', 'INVTYPE_CHEST', { stamina: 25, spellDamage: 46, spellHitRating: 12, armor: 800 }),
  mk('chest', 'INVTYPE_CHEST', { stamina: 60, defenseRating: 70, blockRating: 60, armor: 1200 }),
  // rings (paired -> distinct) (3)
  mk('ring', 'INVTYPE_FINGER', { stamina: 30, defenseRating: 40, dodgeRating: 30, resilienceRating: 20 }),
  mk('ring', 'INVTYPE_FINGER', { stamina: 12, spellDamage: 20, resilienceRating: 10 }),
  mk('ring', 'INVTYPE_FINGER', { stamina: 25, parryRating: 30, blockRating: 20 }),
  // trinkets (paired -> distinct) (3)
  mk('trinket', 'INVTYPE_TRINKET', { defenseRating: 120, resilienceRating: 80, dodgeRating: 40 }),
  mk('trinket', 'INVTYPE_TRINKET', { spellDamage: 44, spellCritRating: 20 }),
  mk('trinket', 'INVTYPE_TRINKET', { stamina: 90, dodgeRating: 40, defenseRating: 30 }),
  // weapons: a 1H (kept) + a 2H (must be excluded)
  mk('weapon', 'INVTYPE_WEAPONMAINHAND', { spellDamage: 50, hitRating: 14 }),
  mk('weapon', 'INVTYPE_2HWEAPON', { spellDamage: 90, stamina: 20 }),
  // offhand (shield) (2)
  mk('offhand', 'INVTYPE_SHIELD', { stamina: 60, blockValue: 120, blockRating: 80, defenseRating: 40, armor: 3000 }),
  mk('offhand', 'INVTYPE_SHIELD', { stamina: 20, blockValue: 80, defenseRating: 18, armor: 2400 }),
];

// --- goals (objective 'scale' + gates + aggregate opts, mirroring runGoal's oGoal) --------------
const goal = (ratio, gates) => ({
  objective: 'scale', scaleWeights: blendScale(ratio), gates,
  hsBlockBonus: 30, kings: true, buffs: BUFFS.markOfTheWild,
});
const GOALS = {
  raid: goal({ ehp: 1, threat: 2 }, { raid: true, requireUncrushable: true }),
  survival: goal({ ehp: 2, threat: 1 }, { raid: true, requireUncrushable: true }),
  aoe: goal({ ehp: 1, aoeThreat: 2 }, { raid: true, requireUncrushable: false }),
  balanced: goal({ ehp: 1, threat: 1 }, { raid: true, requireUncrushable: true }),
  raidFloor: goal({ ehp: 1, threat: 2 }, { raid: true, requireUncrushable: true, minHealth: 13000 }),
};

// --- 1. buildPool (structure) -------------------------------------------------------------------
const idFor = (slotList) => (it) => it && it.itemId;
const buildPoolCases = [
  { lock: {}, exclude2H: true },
  { lock: {}, exclude2H: false },
  { lock: { trinket1: ITEMS[9].itemId, trinket2: ITEMS[11].itemId }, exclude2H: true },
].map(({ lock, exclude2H }) => {
  const bp = buildPool(ITEMS, { lock, exclude2H });
  const sizes = {};
  for (const [s, list] of Object.entries(bp.pool)) sizes[s] = list.length;
  const locked = {};
  for (const [s, it] of Object.entries(bp.locked)) locked[s] = it.itemId;
  return { lock, exclude2H, order: Object.keys(bp.pool), distinct: bp.distinct, locked, sizes };
});

// --- 2. distinctOk ------------------------------------------------------------------------------
const distinctOkCases = [
  { sel: { ring1: ITEMS[6].itemId, ring2: ITEMS[7].itemId }, distinct: [['ring1', 'ring2']] },
  { sel: { ring1: ITEMS[6].itemId, ring2: ITEMS[6].itemId }, distinct: [['ring1', 'ring2']] },
  { sel: { ring1: ITEMS[6].itemId }, distinct: [['ring1', 'ring2']] },
  { sel: { trinket1: ITEMS[9].itemId, trinket2: ITEMS[9].itemId }, distinct: [['trinket1', 'trinket2']] },
].map(({ sel, distinct }) => {
  const byId = new Map(ITEMS.map((it) => [it.itemId, it]));
  const s = {};
  for (const [slot, id] of Object.entries(sel)) s[slot] = byId.get(id);
  return { sel, distinct, expect: distinctOk(s, distinct) };
});

// --- 3. optimizeHeuristic -----------------------------------------------------------------------
const selIds = (r) => {
  if (!r) return false;
  const out = {};
  for (const [slot, it] of Object.entries(r.selection)) if (it) out[slot] = it.itemId;
  return out;
};
const heuristicConfigs = [
  { goal: 'raid', lock: {}, seed: {} },
  { goal: 'survival', lock: {}, seed: {} },
  { goal: 'aoe', lock: {}, seed: {} },
  { goal: 'balanced', lock: {}, seed: {} },
  { goal: 'raidFloor', lock: {}, seed: {} },
  { goal: 'raid', lock: { trinket1: ITEMS[9].itemId }, seed: {} },
  { goal: 'survival', lock: { offhand: ITEMS[14].itemId }, seed: {} },
  { goal: 'raid', lock: {}, seed: { head: ITEMS[1].itemId, chest: ITEMS[4].itemId } },
];
const heuristicCases = heuristicConfigs.map(({ goal: gid, lock, seed }) => {
  const bp = buildPool(ITEMS, { lock });
  const r = optimizeHeuristic(bp.pool, GOALS[gid], { distinct: bp.distinct, locked: bp.locked, seed });
  return { goal: gid, lock, seed, selIds: selIds(r), objectiveValue: r.objectiveValue, legal: r.legal };
});

// --- 4. optimizeExhaustive ----------------------------------------------------------------------
const exhaustiveConfigs = [
  { goal: 'raid', lock: {} },
  { goal: 'survival', lock: {} },
  { goal: 'aoe', lock: {} },
  { goal: 'raid', lock: { trinket1: ITEMS[9].itemId, trinket2: ITEMS[11].itemId } },
];
const exhaustiveCases = exhaustiveConfigs.map(({ goal: gid, lock }) => {
  const bp = buildPool(ITEMS, { lock });
  const r = optimizeExhaustive(bp.pool, GOALS[gid], { distinct: bp.distinct });
  return { goal: gid, lock, selIds: selIds(r), objectiveValue: r ? r.objectiveValue : null, legal: r ? r.legal : false };
});

// --- emit ---------------------------------------------------------------------------------------
const banner =
  '-- GENERATED by bin/gen-optimizer-fixtures.mjs — do not edit by hand.\n' +
  '-- Golden optimizer selections from the JS source of truth (src/optimizer.js + sets.js).\n' +
  '-- Regenerate: npm run gen-optimizer-fixtures\n\n';

const sections = {
  items: ITEMS,
  goals: GOALS,
  buildPool: buildPoolCases,
  distinctOk: distinctOkCases,
  heuristic: heuristicCases,
  exhaustive: exhaustiveCases,
};
const body = Object.entries(sections).map(([k, v]) => `  ${k} = ${luaVal(v)},`).join('\n');
writeFileSync(outFile, banner + `return {\n${body}\n}\n`);
const total = buildPoolCases.length + distinctOkCases.length + heuristicCases.length + exhaustiveCases.length;
console.log(`Wrote ${outFile}  (${ITEMS.length} items, ${total} cases)`);
