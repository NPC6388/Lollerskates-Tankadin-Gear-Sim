#!/usr/bin/env node
// Golden parity fixtures for the ported item-object builder (engine/Items.lua + ItemsData.lua).
//
// Builds synthetic addon-export lines from raw stat tables, runs them through the JS import.js
// parseExport() (source of truth) for the golden item objects, and emits BOTH the raw inputs and the
// goldens to test/lua/items_fixtures.lua. The Lua runner (items_parity.lua) feeds the same raw tables
// to Items.build() and asserts it reproduces the goldens — so the addon's item mapping can't drift.
//
// Coverage: one item per STAT_KEY_MAP key (kitchen sink), one per SLOT_MAP slot, plus the shield
// armor-backfill, the base>resolved lift, and an unmapped slot. Regenerate: npm run gen-items-fixtures

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseExport, STAT_KEY_MAP, SLOT_MAP } from '../src/import.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../test/lua/items_fixtures.lua');

let nextId = 30000;
const items = [];

// One minimal item per equip location, to cover every SLOT_MAP entry (+ an unmapped location).
for (const equipLoc of [...Object.keys(SLOT_MAP), 'INVTYPE_TABARD']) {
  items.push({
    itemString: `item:${nextId++}:0:0:0:0:0:0`, equipLoc, name: `Item ${equipLoc}`, equipped: false,
    itemLevel: 100, resolved: { ITEM_MOD_STAMINA_SHORT: 10 }, base: { ITEM_MOD_STAMINA_SHORT: 10 }, socketBonus: '',
  });
}

// Kitchen sink: every STAT_KEY_MAP key (distinct values) + an unmapped key; base carries a socket
// layout and an innate stat; a real itemString with an enchant + gems; a socket bonus.
const sink = {}; let v = 1;
for (const k of Object.keys(STAT_KEY_MAP)) sink[k] = v++;
sink.ITEM_MOD_UNKNOWN_XYZ = 99; // unmapped -> must be dropped
items.push({
  itemString: 'item:31000:2983:35297:32409:0:0:0', equipLoc: 'INVTYPE_HEAD', name: 'Kitchen Sink',
  equipped: true, itemLevel: 141, resolved: sink,
  base: { EMPTY_SOCKET_RED: 1, EMPTY_SOCKET_META: 1, ITEM_MOD_SPELL_POWER: 5 }, socketBonus: 'ITEM_MOD_STAMINA_SHORT:6',
});

// Shield: base omits armor (GetItemStats quirk) -> must backfill from resolved; has a socket + bonus.
items.push({
  itemString: 'item:32000:0:0:0:0:0:0', equipLoc: 'INVTYPE_SHIELD', name: 'Aegis', equipped: true,
  itemLevel: 120, resolved: { RESISTANCE0_NAME: 2500, ITEM_MOD_BLOCK_VALUE: 120, ITEM_MOD_BLOCK_RATING: 10 },
  base: { ITEM_MOD_BLOCK_VALUE: 120, EMPTY_SOCKET_BLUE: 1 }, socketBonus: 'ITEM_MOD_DODGE_RATING:3',
});

// Lift: base stamina (15) exceeds resolved (10) -> resolved stamina must be lifted to 15.
items.push({
  itemString: 'item:33000:0:0:0:0:0:0', equipLoc: 'INVTYPE_CHEST', name: 'Platemail', equipped: false,
  itemLevel: 110, resolved: { ITEM_MOD_STAMINA_SHORT: 10 }, base: { ITEM_MOD_STAMINA_SHORT: 15, EMPTY_SOCKET_YELLOW: 2 }, socketBonus: '',
});

// Libram by ID (Repentance, 29388): its parsed stats are OVERRIDDEN with the modeled effective stat
// block (blockRating 42) — stats AND baseStats. Exercises the libramStats wiring in Items.build.
items.push({
  itemString: 'item:29388:0:0:0:0:0:0', equipLoc: 'INVTYPE_RELIC', name: 'Some Relic', equipped: true,
  itemLevel: 100, resolved: { ITEM_MOD_SPELL_POWER: 22 }, base: { ITEM_MOD_SPELL_POWER: 22 }, socketBonus: '',
});

// Libram by NAME (Eternal Rest) — id doesn't match, so the name substring drives the override
// (spellDamage 35).
items.push({
  itemString: 'item:40000:0:0:0:0:0:0', equipLoc: 'INVTYPE_RELIC', name: 'Libram of the Eternal Rest', equipped: false,
  itemLevel: 100, resolved: { ITEM_MOD_BLOCK_VALUE: 12 }, base: { ITEM_MOD_BLOCK_VALUE: 12 }, socketBonus: '',
});

// Build the synthetic export and get the golden item objects.
const seg = (t) => Object.entries(t).map(([k, val]) => `${k}=${val}`).join(';');
const lines = ['TGS11', 'C:'];
for (const it of items) {
  const resolvedSeg = `ilvl=${it.itemLevel}` + (Object.keys(it.resolved).length ? ';' + seg(it.resolved) : '');
  lines.push(`${it.equipped ? 'E' : 'I'}:${it.itemString}|${it.equipLoc}|${resolvedSeg}|${seg(it.base)}|${it.socketBonus}|${it.name}`);
}
const golden = parseExport(lines.join('\n')).items;

// The fields Items.build() is responsible for (compared bidirectionally, incl. nested tables).
const FIELDS = ['itemId', 'enchantId', 'gems', 'suffixId', 'equipped', 'name', 'equipLoc', 'slot', 'itemLevel', 'stats', 'baseStats', 'sockets', 'socketBonus'];

function luaKey(k) { return /^[A-Za-z_]\w*$/.test(k) ? k : `[${JSON.stringify(k)}]`; }
function luaVal(x) {
  if (x === null || x === undefined) return 'nil';
  if (typeof x === 'number') return String(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (typeof x === 'string') return JSON.stringify(x);
  if (Array.isArray(x)) return `{ ${x.map(luaVal).join(', ')} }`;
  return `{ ${Object.entries(x).map(([k, val]) => `${luaKey(k)} = ${luaVal(val)}`).join(', ')} }`;
}

const cases = items.map((it, i) => {
  const g = golden[i];
  const exp = {};
  for (const f of FIELDS) if (g[f] !== undefined) exp[f] = g[f];
  const raw = { itemString: it.itemString, equipLoc: it.equipLoc, name: it.name, equipped: it.equipped, itemLevel: it.itemLevel, resolved: it.resolved, base: it.base, socketBonus: it.socketBonus };
  return `  { raw = ${luaVal(raw)},\n    expected = ${luaVal(exp)} },`;
}).join('\n');

const banner =
  '-- GENERATED by bin/gen-items-fixtures.mjs — do not edit by hand.\n' +
  '-- Golden import.js item objects (source of truth) vs raw reads fed to engine/Items.build.\n' +
  '-- Regenerate: npm run gen-items-fixtures\n\n';

writeFileSync(outFile, banner + `return {\n${cases}\n}\n`);
console.log(`Wrote ${outFile}  (${items.length} items)`);
