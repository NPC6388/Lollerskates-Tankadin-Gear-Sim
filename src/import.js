// Parser for the TankadinGearSim addon export.
//   TGS<version>
//   C:key=val;...                                   (character finals, for calibration)
//   v1 item line: I:item:<id>:<enchant>:<g1..4>:<suffix>:...
//   v2 item line: I:<itemString>|<equipLoc>|ilvl=N;<GetItemStats key>=val;...
//   v8 adds: ...|<baseStats>|<socketBonus>   v9 adds a trailing: |<name>

// GetItemStats keys -> our internal stat names. This client emits ratings/spell-power
// WITHOUT the _SHORT suffix (e.g. ITEM_MOD_DODGE_RATING) but primary stats WITH it
// (ITEM_MOD_STAMINA_SHORT), so both forms are mapped. Unknown keys are ignored.
const STAT_BASE_MAP = {
  ITEM_MOD_STAMINA: 'stamina',
  ITEM_MOD_STRENGTH: 'strength',
  ITEM_MOD_AGILITY: 'agility',
  ITEM_MOD_INTELLECT: 'intellect',
  ITEM_MOD_DEFENSE_SKILL_RATING: 'defenseRating',
  ITEM_MOD_DODGE_RATING: 'dodgeRating',
  ITEM_MOD_PARRY_RATING: 'parryRating',
  ITEM_MOD_BLOCK_RATING: 'blockRating',
  ITEM_MOD_BLOCK_VALUE: 'blockValue',
  ITEM_MOD_SPELL_POWER: 'spellDamage',
  ITEM_MOD_SPELL_DAMAGE_DONE: 'spellDamage',
  ITEM_MOD_HIT_RATING: 'hitRating',
  ITEM_MOD_HIT_MELEE_RATING: 'hitRating',
  ITEM_MOD_HIT_SPELL_RATING: 'spellHitRating',
  ITEM_MOD_EXPERTISE_RATING: 'expertiseRating',
  ITEM_MOD_RESILIENCE_RATING: 'resilienceRating',
  ITEM_MOD_CRIT_RATING: 'critRating',
  ITEM_MOD_CRIT_MELEE_RATING: 'critRating',
  ITEM_MOD_CRIT_SPELL_RATING: 'spellCritRating',
  ITEM_MOD_HASTE_RATING: 'hasteRating',
  ITEM_MOD_ATTACK_POWER: 'attackPower',
};

const STAT_KEY_MAP = {
  // armor, per-school resistance, and sockets (fixed key names)
  RESISTANCE0_NAME: 'armor',
  ARMOR: 'armor',
  RESISTANCE1_NAME: 'holyResist',
  RESISTANCE2_NAME: 'fireResist',
  RESISTANCE3_NAME: 'natureResist',
  RESISTANCE4_NAME: 'frostResist',
  RESISTANCE5_NAME: 'shadowResist',
  RESISTANCE6_NAME: 'arcaneResist',
  EMPTY_SOCKET_RED: 'socketRed',
  EMPTY_SOCKET_YELLOW: 'socketYellow',
  EMPTY_SOCKET_BLUE: 'socketBlue',
  EMPTY_SOCKET_META: 'socketMeta',
  EMPTY_SOCKET_PRISMATIC: 'socketPrismatic',
};
// Register each ITEM_MOD_* in both its bare and _SHORT form.
for (const [k, v] of Object.entries(STAT_BASE_MAP)) {
  STAT_KEY_MAP[k] = v;
  STAT_KEY_MAP[k + '_SHORT'] = v;
}

// WoW equip locations -> our slot keys (paired slots share a key).
const SLOT_MAP = {
  INVTYPE_HEAD: 'head', INVTYPE_NECK: 'neck', INVTYPE_SHOULDER: 'shoulder',
  INVTYPE_CLOAK: 'back', INVTYPE_CHEST: 'chest', INVTYPE_ROBE: 'chest',
  INVTYPE_WRIST: 'wrist', INVTYPE_HAND: 'hands', INVTYPE_WAIST: 'waist',
  INVTYPE_LEGS: 'legs', INVTYPE_FEET: 'feet', INVTYPE_FINGER: 'ring',
  INVTYPE_TRINKET: 'trinket', INVTYPE_WEAPON: 'weapon',
  INVTYPE_WEAPONMAINHAND: 'weapon', INVTYPE_2HWEAPON: 'weapon',
  INVTYPE_SHIELD: 'offhand', INVTYPE_WEAPONOFFHAND: 'offhand', INVTYPE_HOLDABLE: 'offhand',
  INVTYPE_RANGED: 'relic', INVTYPE_RANGEDRIGHT: 'relic', INVTYPE_RELIC: 'relic',
};

export function equipLocToSlot(loc) {
  return SLOT_MAP[loc] || null;
}

// item string -> { itemId, enchantId, gems[], suffixId }
export function parseItemString(s) {
  const parts = s.split(':');
  const n = (i) => Number(parts[i]) || 0;
  return {
    itemString: s,
    itemId: n(1),
    enchantId: n(2),
    gems: [n(3), n(4), n(5), n(6)].filter((g) => g !== 0),
    suffixId: n(7),
  };
}

import { libramStats } from './librams.js';
import { STAT_KEYS } from './model.js';

// socket-count stat keys -> color, for exposing a per-item socket layout
const SOCKET_STAT_KEYS = { socketRed: 'red', socketYellow: 'yellow', socketBlue: 'blue', socketMeta: 'meta' };
function socketsFromStats(stats = {}) {
  const out = {};
  for (const [k, color] of Object.entries(SOCKET_STAT_KEYS)) {
    if (stats[k]) out[color] = stats[k];
  }
  return out;
}

// v8 socket-bonus field "ITEM_MOD_STAMINA_SHORT:4" -> { stat:'stamina', value:4 }.
// Empty / unmapped -> null.
function parseSocketBonus(seg) {
  if (!seg) return null;
  const i = seg.indexOf(':');
  if (i < 0) return null;
  const stat = STAT_KEY_MAP[seg.slice(0, i)];
  const value = Number(seg.slice(i + 1)) || 0;
  return stat && value ? { stat, value } : null;
}

// "ilvl=86;ITEM_MOD_STAMINA_SHORT=30;..." -> { stats:{stamina:30,...}, itemLevel:86 }
function parseStatSegment(seg) {
  const stats = {};
  let itemLevel = 0;
  for (const kv of seg.split(';')) {
    if (!kv) continue;
    const eq = kv.indexOf('=');
    const k = kv.slice(0, eq);
    const v = Number(kv.slice(eq + 1)) || 0;
    if (k === 'ilvl') { itemLevel = v; continue; }
    const mapped = STAT_KEY_MAP[k];
    if (mapped) stats[mapped] = (stats[mapped] || 0) + v;
  }
  return { stats, itemLevel };
}

export function parseExport(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !/^TGS\d+$/.test(lines[0])) {
    throw new Error('Not a Tankadin Gear Sim export (missing TGS header)');
  }
  const out = { version: Number(lines[0].slice(3)), character: {}, items: [], talents: '', talentRanks: {} };

  for (const line of lines.slice(1)) {
    if (line.startsWith('TR:')) {
      for (const kv of line.slice(3).split(';')) { // v11 talent ranks by name
        if (!kv) continue;
        const eq = kv.lastIndexOf('=');
        if (eq < 0) continue;
        out.talentRanks[kv.slice(0, eq)] = Number(kv.slice(eq + 1)) || 0;
      }
    } else if (line.startsWith('T:')) {
      out.talents = line.slice(2); // v10 talent string (per-talent ranks, "-" between trees)
    } else if (line.startsWith('C:')) {
      for (const kv of line.slice(2).split(';')) {
        if (!kv) continue;
        const eq = kv.indexOf('=');
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        if (!k) continue;
        out.character[k] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
      }
    } else if (line.startsWith('I:') || line.startsWith('E:')) {
      const equipped = line.startsWith('E:');
      const body = line.slice(2);
      // Fields: itemStr | equipLoc | statSeg | baseSeg | [socketBonus] | [name]. The socketBonus
      // field is OPTIONAL — some addon builds omit it entirely (…|base|name) rather than leaving
      // it empty (…|base||name), which would otherwise shove the name into the bonus slot and drop
      // it (every trinket, having no socket bonus, hit this). Resolve the trailing fields by SHAPE:
      // a socket-bonus token looks like "ITEM_MOD_*:<num>"; anything else is the name.
      const fields = body.split('|');
      const [itemStr, equipLoc = '', statSeg = '', baseSeg] = fields;
      let bonusSeg, nameSeg;
      const trailing = fields.slice(4); // [], [name], [bonus], or [bonus, name]
      if (trailing.length >= 2) { [bonusSeg, nameSeg] = trailing; }
      else if (trailing.length === 1) {
        if (/^[A-Z0-9_]+:-?\d/.test(trailing[0])) bonusSeg = trailing[0]; else nameSeg = trailing[0];
      }
      const item = parseItemString(itemStr);
      item.equipped = equipped;
      if (nameSeg) item.name = nameSeg; // v9: human-readable item name
      if (equipLoc || statSeg) {
        const { stats, itemLevel } = parseStatSegment(statSeg);
        item.equipLoc = equipLoc;
        item.slot = equipLocToSlot(equipLoc);
        item.itemLevel = itemLevel;
        item.stats = stats;
        // v8: gem/enchant-free base stats carry the full socket-color layout
        if (baseSeg !== undefined) {
          item.baseStats = parseStatSegment(baseSeg).stats;
          // GetItemStats (the base field) omits SHIELD armor — it reports 0 even though the
          // shield's armor is real. Backfill it from the resolved (tooltip) field so anything
          // re-gemming from baseStats doesn't undercount armor. Armor is never added by gems
          // (and shields take no armor enchant in TBC), so copying resolved -> base is exact,
          // not a double-count. Only fill when base is missing it (i.e. the shield case).
          if (!item.baseStats.armor && stats.armor) item.baseStats.armor = stats.armor;
          // The tooltip scan (resolved) can MISS an innate equip line — e.g. "Increases damage and
          // healing done by magical spells and effects by up to N" (the +spell-damage plate) — that
          // GetItemStats (base) captures. resolved should always be >= base for innate stats (it's
          // base + gems + enchants), so lift any stat the scan came up short on. Keeps keep-mode
          // deltas and the as-worn evaluation from undercounting. (Optimizer already scores off base.)
          for (const k of STAT_KEYS) {
            if ((item.baseStats[k] || 0) > (item.stats[k] || 0)) item.stats[k] = item.baseStats[k];
          }
        }
        // sockets: prefer the base layout (every socket); v1–v7 fall back to the resolved
        // field, which only lists currently-EMPTY sockets.
        item.sockets = socketsFromStats(item.baseStats || stats);
        item.socketBonus = parseSocketBonus(bonusSeg);
        // Librams score through a special equip effect the tooltip parser misses (e.g. +Consecration
        // damage). Override with the modeled effective stats so the libram is valued correctly.
        const lib = libramStats(item);
        if (lib) { item.stats = lib; item.baseStats = { ...lib }; }
      }
      out.items.push(item);
    }
  }
  return out;
}

// Keep every item the optimizer can PLACE: anything with a recognized equip slot. We deliberately
// DON'T require a parsed stat anymore — some real gear scores its value through an effect the tooltip
// parser doesn't capture as a stat (a Consecration/threat libram, a pure on-use trinket). Dropping
// those silently hid owned gear from the optimizer; now they stay in the pool (scored on whatever
// stats they do have, 0 if none) so the slot is at least fillable and the piece is selectable.
// Non-gear (shirts, tabards, quest items) has no mapped equip slot, so it's still excluded.
export function equippableItems(parsed) {
  return parsed.items.filter((it) => it.slot && it.stats);
}
