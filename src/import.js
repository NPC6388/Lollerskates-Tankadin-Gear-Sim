// Parser for the TankadinGearSim addon export.
//   TGS<version>
//   C:key=val;...                                   (character finals, for calibration)
//   v1 item line: I:item:<id>:<enchant>:<g1..4>:<suffix>:...
//   v2 item line: I:<itemString>|<equipLoc>|ilvl=N;<GetItemStats key>=val;...

// GetItemStats keys -> our internal stat names. Unknown keys are ignored.
const STAT_KEY_MAP = {
  ITEM_MOD_STAMINA_SHORT: 'stamina',
  ITEM_MOD_STRENGTH_SHORT: 'strength',
  ITEM_MOD_AGILITY_SHORT: 'agility',
  ITEM_MOD_INTELLECT_SHORT: 'intellect',
  ITEM_MOD_DEFENSE_SKILL_RATING_SHORT: 'defenseRating',
  ITEM_MOD_DODGE_RATING_SHORT: 'dodgeRating',
  ITEM_MOD_PARRY_RATING_SHORT: 'parryRating',
  ITEM_MOD_BLOCK_RATING_SHORT: 'blockRating',
  ITEM_MOD_BLOCK_VALUE_SHORT: 'blockValue',
  ITEM_MOD_SPELL_DAMAGE_DONE_SHORT: 'spellDamage',
  ITEM_MOD_SPELL_POWER_SHORT: 'spellDamage',
  ITEM_MOD_HIT_RATING_SHORT: 'hitRating',
  ITEM_MOD_HIT_MELEE_RATING_SHORT: 'hitRating',
  ITEM_MOD_HIT_SPELL_RATING_SHORT: 'spellHitRating',
  ITEM_MOD_EXPERTISE_RATING_SHORT: 'expertiseRating',
  ITEM_MOD_RESILIENCE_RATING_SHORT: 'resilienceRating',
  ITEM_MOD_CRIT_RATING_SHORT: 'critRating',
  ITEM_MOD_CRIT_MELEE_RATING_SHORT: 'critRating',
  ITEM_MOD_CRIT_SPELL_RATING_SHORT: 'spellCritRating',
  ITEM_MOD_HASTE_RATING_SHORT: 'hasteRating',
  ITEM_MOD_ATTACK_POWER_SHORT: 'attackPower',
  RESISTANCE0_NAME: 'armor',
  ARMOR: 'armor',
};

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
  const out = { version: Number(lines[0].slice(3)), character: {}, items: [] };

  for (const line of lines.slice(1)) {
    if (line.startsWith('C:')) {
      for (const kv of line.slice(2).split(';')) {
        if (!kv) continue;
        const eq = kv.indexOf('=');
        const k = kv.slice(0, eq);
        const v = kv.slice(eq + 1);
        if (!k) continue;
        out.character[k] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
      }
    } else if (line.startsWith('I:')) {
      const body = line.slice(2);
      const [itemStr, equipLoc = '', statSeg = ''] = body.split('|');
      const item = parseItemString(itemStr);
      if (equipLoc || statSeg) {
        const { stats, itemLevel } = parseStatSegment(statSeg);
        item.equipLoc = equipLoc;
        item.slot = equipLocToSlot(equipLoc);
        item.itemLevel = itemLevel;
        item.stats = stats;
      }
      out.items.push(item);
    }
  }
  return out;
}

// Keep only items the optimizer can place: a recognized equip slot and at least
// one mapped stat (stat-less items can't be scored).
export function equippableItems(parsed) {
  return parsed.items.filter((it) => it.slot && it.stats && Object.keys(it.stats).length > 0);
}
