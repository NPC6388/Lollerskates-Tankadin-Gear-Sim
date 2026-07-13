#!/usr/bin/env node
// Generate the addon's constant DATA tables from the JS source of truth.
//
// Imports src/constants.js (the single source of truth) and writes the numeric tables into
// addon/TankadinGearSim/engine/Constants.lua, so the in-game engine's DATA can never silently
// drift from the website's. Per the plan's "generate data, hand-port logic" split, the two tiny
// helper FORMULAS (ARMOR_CONST, RESIST_DENOM) are logic, not data — they're emitted from a fixed
// template here and backstopped by the Lua parity harness (test/lua/eval_parity.lua), not by this
// generator's imports.
//
// Regenerate: npm run gen-lua   (the pre-commit hook also re-runs this when constants change)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { RATING, BASE, CAPS, THREAT, CRIT_MULT, RESIST_MAX_MITIGATION } from '../src/constants.js';
import { SCALES, PARTS } from '../src/weights.js';
import { CHARACTER, TALENTS, BUFFS, STAT_KEYS } from '../src/model.js';
import { STAT_KEY_MAP, SLOT_MAP } from '../src/import.js';
import { GEMS, META_GEMS, FITS, CURRENT_PHASE } from '../src/gems.js';
import { ENCHANTS } from '../src/enchants.js';
import { PROFESSIONS, PROFESSION_NAMES } from '../src/professions.js';
import { LIBRAMS } from '../src/librams.js';
import { SCROLLS } from '../src/scrolls.js';
import { SET_DB, SET_BONUS_STATS } from '../src/sets.js';

const here = dirname(fileURLToPath(import.meta.url));
const engineDir = resolve(here, '../addon/TankadinGearSim/engine');
const outFile = resolve(engineDir, 'Constants.lua');
const weightsFile = resolve(engineDir, 'Weights.lua');
const charFile = resolve(engineDir, 'CharacterData.lua');
const itemsFile = resolve(engineDir, 'ItemsData.lua');
const gemsFile = resolve(engineDir, 'GemsData.lua');
const enchantsFile = resolve(engineDir, 'EnchantsData.lua');
const professionsFile = resolve(engineDir, 'ProfessionsData.lua');
const libramsFile = resolve(engineDir, 'LibramsData.lua');
const scrollsFile = resolve(engineDir, 'ScrollsData.lua');
const setsFile = resolve(engineDir, 'SetsData.lua');

// Guide-reference comments, keyed by "TABLE.field". Cosmetic only — the VALUES come from the import
// above, so a value edit in src/constants.js flows through regardless of what's written here.
const COMMENTS = {
  'RATING.defensePerSkill': 'defense rating per 1 defense skill',
  'RATING.meleeHitPer1': 'melee hit rating per 1%',
  'RATING.spellHitPer1': 'spell hit rating per 1%',
  'RATING.expertisePer1': 'expertise rating per 1 expertise',
  'RATING.dodgePer1': 'dodge rating per 1%',
  'RATING.parryPer1': 'parry rating per 1%',
  'RATING.blockPer1': 'block rating per 1%',
  'RATING.critPer1': 'crit rating per 1%',
  'RATING.hastePer1': 'haste rating per 1%',
  'RATING.resiliencePer1': 'resilience rating per 1% crit reduction',
  'BASE.playerLevel': '',
  'BASE.baseDefenseSkill': '5 x level',
  'BASE.baseMissChance': '% melee miss vs target (guide profile baseline)',
  'BASE.defenseBenefitPerSkill': '% per defense skill to dodge/parry/block/miss/crit-avoid',
  'BASE.raidBossLevel': '',
  'BASE.heroicBossLevel': '',
  'BASE.bossCritVsPlayer': '% crit a level 73 raid boss has on a level 70 (guide: 1531)',
  'BASE.heroicBossCritVsPlayer': '% crit a level 72 heroic boss has on a level 70',
  'CAPS.defenseSkillRaid': 'crit immunity vs level 73 (guide: 1527-1534)',
  'CAPS.defenseSkillHeroic': 'crit immunity vs level 72',
  'CAPS.uncrushableCombined': 'miss+dodge+parry+block >= this => no crushing (guide: 1566)',
  'CAPS.shearAvoidanceTarget': 'Illidan Shear (no miss): dodge+parry+block(+HS) >= this = avoided',
  'CAPS.spellHitCapPct': 'vs raid boss (guide table)',
  'CAPS.meleeHitCapPct': 'vs raid boss (6% with 3/3 Precision)',
  'CAPS.expertiseSoftCap': 'eliminates boss dodge',
  'THREAT.righteousFury': '3/3 Improved Righteous Fury (guide: 845)',
  'THREAT.holyShieldActive': '+30% block chance while Holy Shield is up (guide: 1552)',
  'THREAT.justicar2pcSeal': '+10% SoR/SoV/SoC seal damage (guide: 633)',
  'THREAT.justicar4pcHolyShield': '+15 flat per Holy Shield block (guide: 634)',
  'THREAT.crystalforge2pcRetAura': '+15 Retribution Aura damage per hit (T5 2pc)',
  'THREAT.crystalforge4pcBlockValue': '+100 block value for 6s after Holy Shield (T5 4pc)',
  'THREAT.improvedHolyShieldDmg': '2/2 Improved Holy Shield damage multiplier (guide: 878)',
  'CRIT_MULT.spell': '',
  'CRIT_MULT.melee': '',
};

// Full-precision Lua number literal (matches gen-fixtures.mjs — String() keeps JS precision).
const luaNum = (v) => String(v);

// Emit a `local C.NAME = { k = v, -- comment ... }` block, aligning the trailing comments.
function emitTable(name, obj, sectionComment) {
  const entries = Object.entries(obj);
  const cells = entries.map(([k, v]) => ({ code: `  ${k} = ${luaNum(v)},`, comment: COMMENTS[`${name}.${k}`] || '' }));
  const width = Math.max(...cells.map((c) => c.code.length));
  const lines = cells.map((c) => (c.comment ? `${c.code.padEnd(width)} -- ${c.comment}` : c.code));
  return `${sectionComment}\nC.${name} = {\n${lines.join('\n')}\n}\n`;
}

const banner = `-- GENERATED by bin/gen-lua-data.mjs from src/constants.js — do not edit by hand.
-- Single source of truth for the in-game engine's DATA; the website (src/constants.js) is authoritative.
-- Regenerate: npm run gen-lua   (the pre-commit hook re-runs it when constants change).
-- The two helper FORMULAS below (ARMOR_CONST/RESIST_DENOM) are hand-ported logic, guarded by the
-- Lua parity harness (test/lua/eval_parity.lua), not generated from data.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local C = {}
ns.engine.Constants = C
`;

const tables = [
  emitTable('RATING', RATING,
    '-- --- Rating conversions (guide: #stat-conversions table) ---\n' +
    '-- "Rating per 1%" except defense/expertise which are per skill point.'),
  emitTable('BASE', BASE,
    '-- --- Character / boss baselines (guide: #combat-table, #block-mechanics) ---'),
  emitTable('CAPS', CAPS,
    '-- --- Hard caps / thresholds (guide: #stat-conversions, #combat-table) ---'),
  emitTable('THREAT', THREAT,
    '-- --- Threat amplifiers (guide: #threat-system) ---'),
  emitTable('CRIT_MULT', CRIT_MULT,
    '-- Crit multipliers by school (guide: seal crit mechanics table, 1256-1262)'),
].join('\n');

// RESIST_MAX_MITIGATION is a plain data scalar; the two functions are hand-ported formula logic.
const tail = `
C.RESIST_MAX_MITIGATION = ${luaNum(RESIST_MAX_MITIGATION)}

-- --- Armor mitigation (standard TBC formula; attacker-level dependent) ---
-- DR = Armor / (Armor + (467.5 * attackerLevel - 22167.5)), capped at 75%. = 11960 at level 73.
function C.ARMOR_CONST(attackerLevel)
  attackerLevel = attackerLevel or C.BASE.raidBossLevel
  return 467.5 * attackerLevel - 22167.5
end

-- --- Resistance mitigation ---
-- Average mitigation vs a caster = Resistance / (5 * casterLevel) * 0.75, capped 75%.
-- At level 73: 5*73 = 365 => 365 res = 75% (cap); 244 res ~= 50%.
function C.RESIST_DENOM(casterLevel)
  casterLevel = casterLevel or C.BASE.raidBossLevel
  return 5 * casterLevel
end

return C
`;

writeFileSync(outFile, banner + '\n' + tables + tail);
console.log(`Wrote ${outFile}`);

// --- engine/Weights.lua ---------------------------------------------------------------------
// The stat-weight scales (src/weights.js) as pure data. The scoring/blend LOGIC is hand-ported in
// engine/Scoring.lua (and parity-checked); only the numbers are generated here.

// Every scale shares the same key set (the ZERO template in weights.js). Reconstruct it from a
// scale so Scoring.blendScale can seed a full-keyed result without weights.js exporting ZERO.
const ZERO = Object.fromEntries(Object.keys(SCALES.balanced).map((k) => [k, 0]));

// Serialize a plain object whose leaves are numbers (nested one level for SCALES/PARTS) to Lua.
function luaObj(obj, indent) {
  const pad = '  '.repeat(indent + 1);
  const close = '  '.repeat(indent);
  const body = Object.entries(obj)
    .map(([k, v]) => `${pad}${k} = ${v && typeof v === 'object' ? luaObj(v, indent + 1) : luaNum(v)},`)
    .join('\n');
  return `{\n${body}\n${close}}`;
}

const weightsBanner = `-- GENERATED by bin/gen-lua-data.mjs from src/weights.js — do not edit by hand.
-- The stat-weight scales, as pure data. Scoring/blend logic lives in engine/Scoring.lua (parity-checked).
-- Regenerate: npm run gen-lua   (the pre-commit hook re-runs it when weights change).

local ADDON, ns = ...
ns.engine = ns.engine or {}
local W = {}
ns.engine.Weights = W
`;

const weightsBody = [
  `-- All scales share this key set; Scoring.blendScale seeds from it so every key is present.\nW.ZERO = ${luaObj(ZERO, 0)}`,
  `-- Named SixtyUpgrades-style scales (goal presets).\nW.SCALES = ${luaObj(SCALES, 0)}`,
  `-- Component sub-weights blended by ratio into the four ratio-goal scales (see Scoring.blendScale).\nW.PARTS = ${luaObj(PARTS, 0)}`,
].join('\n\n');

writeFileSync(weightsFile, `${weightsBanner}\n${weightsBody}\n\nreturn W\n`);
console.log(`Wrote ${weightsFile}`);

// --- engine/CharacterData.lua ---------------------------------------------------------------
// The forward model's character/talent/buff intercepts (src/model.js) as pure data. The aggregate
// LOGIC is hand-ported in engine/Model.lua (and parity-checked); only the numbers are generated.

const luaArray = (arr) => `{ ${arr.map((s) => JSON.stringify(s)).join(', ')} }`;

const charBanner = `-- GENERATED by bin/gen-lua-data.mjs from src/model.js — do not edit by hand.
-- Character/talent/buff DATA for the forward model (engine/Model.lua). The aggregate logic is
-- hand-ported there (parity-checked). Regenerate: npm run gen-lua (pre-commit re-runs it on changes).

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = {}
ns.engine.CharacterData = D
`;

const charBody = [
  `-- L70 Blood Elf Paladin race/class base intercepts (no gear/talents/buffs).\nD.CHARACTER = ${luaObj(CHARACTER, 0)}`,
  `-- Default Avenger's Shield (0/43/18) talent modifiers; overridden live by talentsFromRanks.\nD.TALENTS = ${luaObj(TALENTS, 0)}`,
  `-- Party/raid buffs: Kings is a +10% primary multiplier (after flats); MotW is flat +14 each.\nD.BUFFS = ${luaObj(BUFFS, 0)}`,
  `-- The stat keys summed from gear.\nD.STAT_KEYS = ${luaArray(STAT_KEYS)}`,
].join('\n\n');

writeFileSync(charFile, `${charBanner}\n${charBody}\n\nreturn D\n`);
console.log(`Wrote ${charFile}`);

// --- engine/ItemsData.lua -------------------------------------------------------------------
// The import.js key/slot maps (GetItemStats key -> our stat name; WoW equipLoc -> our slot) as pure
// data, so the in-game item-object builder (engine/Items.lua) maps stats exactly like the website.

// A Lua table key: bare for identifiers, [<n>] for integer keys (so numeric lookups line up), else
// a bracketed string literal. (Integer handling matters for id-keyed maps like SHOULDER_FACTION.)
const luaKey = (k) =>
  /^[A-Za-z_]\w*$/.test(k) ? k : /^\d+$/.test(k) ? `[${k}]` : `[${JSON.stringify(k)}]`;
const luaStrMap = (obj) =>
  '{\n' + Object.entries(obj).map(([k, v]) => `  ${luaKey(k)} = ${JSON.stringify(v)},`).join('\n') + '\n}';

const itemsBanner = `-- GENERATED by bin/gen-lua-data.mjs from src/import.js — do not edit by hand.
-- Key/slot maps for the item-object builder (engine/Items.lua). Build LOGIC is hand-ported there
-- (parity-checked). Regenerate: npm run gen-lua (pre-commit re-runs it when import.js changes).

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = {}
ns.engine.ItemsData = D
`;

const itemsBody = [
  `-- GetItemStats keys (bare + _SHORT) / resistance / sockets -> our internal stat names.\nD.STAT_KEY_MAP = ${luaStrMap(STAT_KEY_MAP)}`,
  `-- WoW equip locations -> our slot keys (paired slots share a key).\nD.SLOT_MAP = ${luaStrMap(SLOT_MAP)}`,
].join('\n\n');

writeFileSync(itemsFile, `${itemsBanner}\n${itemsBody}\n\nreturn D\n`);
console.log(`Wrote ${itemsFile}`);

// --- gem/enchant SOLVER data (Phase D4) -----------------------------------------------------
// General Lua-literal serializer for the solver DBs (arrays of objects with mixed string/number/
// bool leaves), nested and indented. Array ORDER is preserved (bestGem/bestEnchant break ties by
// first-listed, so the sequence must match the JS arrays exactly). Empty tables render as {}.
function luaValue(x, indent = 0) {
  const pad = '  '.repeat(indent + 1);
  const close = '  '.repeat(indent);
  if (x === null || x === undefined) return 'nil';
  if (typeof x === 'number') return luaNum(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (typeof x === 'string') return JSON.stringify(x);
  if (Array.isArray(x)) {
    if (!x.length) return '{}';
    return `{\n${x.map((v) => `${pad}${luaValue(v, indent + 1)},`).join('\n')}\n${close}}`;
  }
  const entries = Object.entries(x);
  if (!entries.length) return '{}';
  const body = entries.map(([k, v]) => `${pad}${luaKey(k)} = ${luaValue(v, indent + 1)},`).join('\n');
  return `{\n${body}\n${close}}`;
}

const dataBanner = (src, note) =>
  `-- GENERATED by bin/gen-lua-data.mjs from ${src} — do not edit by hand.\n` +
  `-- ${note}\n` +
  `-- Regenerate: npm run gen-lua   (the pre-commit hook re-runs it when the source changes).\n`;

const nsHeader = (localName, engineName) =>
  `\nlocal ADDON, ns = ...\nns.engine = ns.engine or {}\nlocal ${localName} = {}\nns.engine.${engineName} = ${localName}\n`;

// engine/GemsData.lua — the curated gem + meta pool and color-fit table (src/gems.js).
const gemsBody = [
  `D.CURRENT_PHASE = ${luaNum(CURRENT_PHASE)}`,
  `-- Socket color -> the socket colors it satisfies for a bonus (hybrids fit two).\nD.FITS = ${luaValue(FITS)}`,
  `-- Non-meta gems (ARRAY ORDER matters: bestGem breaks score ties by first-listed).\nD.GEMS = ${luaValue(GEMS)}`,
  `-- Meta gems; the 'requires' field is the activation clause(s) metaActivated evaluates.\nD.META_GEMS = ${luaValue(META_GEMS)}`,
].join('\n\n');
writeFileSync(gemsFile,
  dataBanner('src/gems.js', 'Gem/meta DB for the solver (engine/Gems.lua); solver logic is hand-ported there.') +
  nsHeader('D', 'GemsData') + '\n' + gemsBody + '\n\nreturn D\n');
console.log(`Wrote ${gemsFile}`);

// engine/EnchantsData.lua — per-slot enchant options + derived shoulder-faction map (src/enchants.js).
const SHOULDER_FACTION = {};
for (const e of ENCHANTS.shoulder) if (e.faction && e.enchant) SHOULDER_FACTION[e.enchant] = e.faction;
const enchantsBody = [
  `-- slot -> list of enchant options (ARRAY ORDER matters for bestEnchant tie-breaks).\nD.ENCHANTS = ${luaValue(ENCHANTS)}`,
  `-- shoulder inscription enchant id -> faction (rep-locked, so it reveals the player's faction).\nD.SHOULDER_FACTION = ${luaValue(SHOULDER_FACTION)}`,
].join('\n\n');
writeFileSync(enchantsFile,
  dataBanner('src/enchants.js', 'Enchant DB for the solver (engine/Enchants.lua); solver logic is hand-ported there.') +
  nsHeader('D', 'EnchantsData') + '\n' + enchantsBody + '\n\nreturn D\n');
console.log(`Wrote ${enchantsFile}`);

// engine/ProfessionsData.lua — profession gear perks (src/professions.js).
const professionsBody = [
  `-- profession -> gear-relevant perks (extraSockets / jcGems / ringEnchant / ...).\nD.PROFESSIONS = ${luaValue(PROFESSIONS)}`,
  `-- All profession names (for UI / validation).\nD.PROFESSION_NAMES = ${luaValue(PROFESSION_NAMES)}`,
].join('\n\n');
writeFileSync(professionsFile,
  dataBanner('src/professions.js', 'Profession perks (engine/Professions.lua); professionPerks logic is hand-ported there.') +
  nsHeader('D', 'ProfessionsData') + '\n' + professionsBody + '\n\nreturn D\n');
console.log(`Wrote ${professionsFile}`);

// engine/LibramsData.lua — modeled libram effective stats (src/librams.js). Regex `match` is dropped;
// the port matches on ids + `nameMatch` literal substrings (kept in sync in librams.js).
const librams = LIBRAMS.map((L) => ({ ids: L.ids, nameMatch: L.nameMatch, stats: L.stats }));
writeFileSync(libramsFile,
  dataBanner('src/librams.js', 'Modeled libram stats (engine/Librams.lua); libramStats logic is hand-ported there.') +
  nsHeader('D', 'LibramsData') + '\n' +
  `-- Each: ids (canonical) + nameMatch (lowercase literal substrings) -> effective stat override.\nD.LIBRAMS = ${luaValue(librams)}\n\nreturn D\n`);
console.log(`Wrote ${libramsFile}`);

// engine/ScrollsData.lua — consumable scroll stats (src/scrolls.js).
writeFileSync(scrollsFile,
  dataBanner('src/scrolls.js', 'Consumable scroll stats (engine/Scrolls.lua); scrollStats logic is hand-ported there.') +
  nsHeader('D', 'ScrollsData') + '\n' +
  `-- key -> { name, stat, value, flat? }. flat armor bypasses Toughness; primaries ride the buff block.\nD.SCROLLS = ${luaValue(SCROLLS)}\n\nreturn D\n`);
console.log(`Wrote ${scrollsFile}`);

// engine/SetsData.lua — tier set membership + equivalent-stat bonus bundles (src/sets.js), for the
// optimizer's 'scale' objective (setBonusStats values completing a 2pc/4pc).
const setsBody = [
  `-- itemId -> tier set name (Justicar = T4, Crystalforge = T5).\nD.SET_DB = ${luaValue(SET_DB)}`,
  `-- Set bonus -> equivalent flat-stat bundle (scored by the goal weights like any stat).\nD.SET_BONUS_STATS = ${luaValue(SET_BONUS_STATS)}`,
].join('\n\n');
writeFileSync(setsFile,
  dataBanner('src/sets.js', 'Tier set data (engine/Sets.lua); setCounts/setBonusStats logic is hand-ported there.') +
  nsHeader('D', 'SetsData') + '\n' + setsBody + '\n\nreturn D\n');
console.log(`Wrote ${setsFile}`);
