// Validates the addon export format (v1 id-only and v2 with per-item stats),
// no game needed. Sample strings match what TankadinGearSim.lua produces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExport, parseItemString, equipLocToSlot, equippableItems } from '../src/import.js';

const V1 = [
  'TGS1',
  'C:name=Lollerskate;level=70;dodge=16.5920;parry=16.0400;block=27.1473;defenseSkill=481.06;defenseRating=310;agility=85;stamina=1100;health=14197;armor=15683;spellPower=690;blockValue=258',
  'I:item:29068:3002:24062:25896:::::70::::::::::',
  'I:item:28516::::::::70::::::::::',
].join('\n');

// Real lines from a live TGS2 export (this client omits _SHORT on ratings/spell power).
const V2 = [
  'TGS2',
  'C:name=Lollerskate;level=70;dodge=16.5920;defenseSkill=501.00;spellPower=690',
  'I:item:29068:3002:24062:25896:::::70::::::::::|INVTYPE_HEAD|ilvl=120;ITEM_MOD_INTELLECT_SHORT=24;EMPTY_SOCKET_YELLOW=1;EMPTY_SOCKET_META=1;ITEM_MOD_STAMINA_SHORT=43;ITEM_MOD_DEFENSE_SKILL_RATING=29;ITEM_MOD_DODGE_RATING=24;ITEM_MOD_SPELL_POWER=26;RESISTANCE0_NAME=1227',
  'I:item:28825:1071:24033::::::70::::::::::|INVTYPE_SHIELD|ilvl=125;ITEM_MOD_DEFENSE_SKILL_RATING=19;ITEM_MOD_HIT_RATING=15;EMPTY_SOCKET_BLUE=1;ITEM_MOD_STAMINA_SHORT=39',
  'I:item:12344::::::::70::::::::::|INVTYPE_FINGER|ilvl=61', // no mapped stats
].join('\n');

test('v1: header, character, and items parse', () => {
  const p = parseExport(V1);
  assert.equal(p.version, 1);
  assert.equal(p.character.defenseSkill, 481.06);
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].itemId, 29068);
  assert.equal(p.items[0].enchantId, 3002);
  assert.deepEqual(p.items[0].gems, [24062, 25896]);
});

test('v2: ratings without _SHORT map correctly (real-client keys)', () => {
  const p = parseExport(V2);
  assert.equal(p.version, 2);
  const head = p.items[0];
  assert.equal(head.slot, 'head');
  assert.equal(head.itemLevel, 120);
  assert.equal(head.stats.stamina, 43);
  assert.equal(head.stats.intellect, 24);
  assert.equal(head.stats.defenseRating, 29); // ITEM_MOD_DEFENSE_SKILL_RATING (no _SHORT)
  assert.equal(head.stats.dodgeRating, 24);   // ITEM_MOD_DODGE_RATING
  assert.equal(head.stats.spellDamage, 26);   // ITEM_MOD_SPELL_POWER
  assert.equal(head.stats.armor, 1227);
  assert.equal(head.stats.socketYellow, 1);
  assert.equal(head.stats.socketMeta, 1);
});

// v8 adds two |-fields after the resolved stats: base stats (gem/enchant-free, with the
// FULL socket-color layout) and the socket bonus "ITEM_MOD_xxx:val".
const V8 = [
  'TGS8',
  'C:name=Lollerskate;level=70',
  // currently gemmed gloves: resolved has the gems baked in (no empty sockets); base carries
  // both sockets as EMPTY_SOCKET_* and the bonus is +4 stamina.
  'E:item:30124:2937:24033:24058::::70::::::::::|INVTYPE_HAND|ilvl=133;ITEM_MOD_STAMINA_SHORT=52;ITEM_MOD_DEFENSE_SKILL_RATING=27|ITEM_MOD_STAMINA_SHORT=28;ITEM_MOD_DEFENSE_SKILL_RATING=27;EMPTY_SOCKET_RED=1;EMPTY_SOCKET_YELLOW=1|ITEM_MOD_STAMINA_SHORT:4',
  // no-bonus, no-socket item still parses (empty trailing fields)
  'E:item:28789::::::::70::::::::::|INVTYPE_TRINKET|ilvl=125;ITEM_MOD_SPELL_POWER=54||',
].join('\n');

test('v8: base stats, full socket layout, and socket bonus parse', () => {
  const p = parseExport(V8);
  assert.equal(p.version, 8);
  const gloves = p.items[0];
  assert.equal(gloves.stats.stamina, 52);           // resolved (gems baked in)
  assert.equal(gloves.baseStats.stamina, 28);       // base (gem-free)
  assert.deepEqual(gloves.sockets, { red: 1, yellow: 1 }); // both, even though filled
  assert.deepEqual(gloves.socketBonus, { stat: 'stamina', value: 4 });
  const trinket = p.items[1];
  assert.equal(trinket.stats.spellDamage, 54);
  assert.deepEqual(trinket.sockets, {});            // no sockets
  assert.equal(trinket.socketBonus, null);          // empty bonus field -> null
});

test('shield base armor is backfilled from resolved (GetItemStats omits it)', () => {
  // A shield: resolved field carries the real armor (5727); the base field has 0 armor
  // (GetItemStats omits shield armor) but the block-value/defense it does report. The parser
  // must copy resolved armor into baseStats so re-gemming from base keeps the armor.
  const sv = [
    'TGS9',
    'C:name=Lollerskate;level=70',
    'E:item:34185::::::::70::::::::::|INVTYPE_SHIELD|ilvl=136;ITEM_MOD_STAMINA_SHORT=51;ITEM_MOD_DEFENSE_SKILL_RATING=24;RESISTANCE0_NAME=5727|ITEM_MOD_STAMINA_SHORT=51;ITEM_MOD_DEFENSE_SKILL_RATING=24||Merciless Gladiator\'s Barrier',
  ].join('\n');
  const shield = parseExport(sv).items[0];
  assert.equal(shield.stats.armor, 5727);     // resolved had it
  assert.equal(shield.baseStats.armor, 5727); // backfilled into base (was absent)
});

test('non-shield base armor is NOT overwritten (no double-count with armor enchants)', () => {
  // Head with a cloak-style armor bump baked into resolved (1347) over a base 1227: base armor
  // is present, so the backfill must leave it alone (else re-applying an armor enchant double-counts).
  const hd = [
    'TGS9',
    'C:name=Lollerskate;level=70',
    'E:item:29068::::::::70::::::::::|INVTYPE_HEAD|ilvl=120;RESISTANCE0_NAME=1347|RESISTANCE0_NAME=1227|Faceguard',
  ].join('\n');
  const head = parseExport(hd).items[0];
  assert.equal(head.baseStats.armor, 1227); // untouched (base already had armor)
});

test('v9: trailing name field is captured', () => {
  const v9 = [
    'TGS9',
    'C:name=Lollerskate;level=70',
    'E:item:29068:3002:24062:25896:::::70::::::::::|INVTYPE_HEAD|ilvl=120;ITEM_MOD_STAMINA_SHORT=67|ITEM_MOD_STAMINA_SHORT=43;EMPTY_SOCKET_YELLOW=1|ITEM_MOD_DODGE_RATING:4|Crown of the Forgotten King',
  ].join('\n');
  const p = parseExport(v9);
  assert.equal(p.version, 9);
  assert.equal(p.items[0].name, 'Crown of the Forgotten King');
  assert.equal(p.items[0].socketBonus.stat, 'dodgeRating'); // earlier fields still parse
});

test('v10: talent string line is captured', () => {
  const v10 = [
    'TGS10',
    'C:name=Lollerskate;level=70',
    'T:00000000000000000-05032030500000000000-0500000000000',
    'E:item:29068::::::::70::::::::::|INVTYPE_HEAD|ilvl=120;ITEM_MOD_STAMINA_SHORT=43|ITEM_MOD_STAMINA_SHORT=43|',
  ].join('\n');
  const p = parseExport(v10);
  assert.equal(p.version, 10);
  assert.equal(p.talents, '00000000000000000-05032030500000000000-0500000000000');
  assert.equal(p.items.length, 1); // the T: line is not an item
});

test('older exports have an empty talents string (defensive)', () => {
  assert.equal(parseExport(V2).talents, '');
});

test('v11: talent ranks by name (TR:) parse into a map', () => {
  const v11 = [
    'TGS11',
    'C:name=Lollerskate;level=70',
    'TR:Anticipation=5;Toughness=3;Sacred Duty=2;Combat Expertise=2;Deflection=5',
    'E:item:29068::::::::70::::::::::|INVTYPE_HEAD|ilvl=120;ITEM_MOD_STAMINA_SHORT=43|ITEM_MOD_STAMINA_SHORT=43|',
  ].join('\n');
  const p = parseExport(v11);
  assert.equal(p.talentRanks.Toughness, 3);
  assert.equal(p.talentRanks['Combat Expertise'], 2);
  assert.equal(p.items.length, 1);
  assert.deepEqual(parseExport(V2).talentRanks, {}); // older exports -> empty map
});

test('v2: equip locations map to slots', () => {
  assert.equal(equipLocToSlot('INVTYPE_HEAD'), 'head');
  assert.equal(equipLocToSlot('INVTYPE_FINGER'), 'ring');
  assert.equal(equipLocToSlot('INVTYPE_SHIELD'), 'offhand');
  assert.equal(equipLocToSlot('INVTYPE_2HWEAPON'), 'weapon');
  assert.equal(equipLocToSlot('INVTYPE_BAG'), null);
});

test('v2: equippableItems keeps every equip-slot item, including stat-less ones', () => {
  // Stat-less equip-slot gear (e.g. a special-effect libram, a pure on-use trinket) is KEPT so it's
  // still selectable — the ring 12344 has no mapped stats but a real slot, so it stays in the pool.
  const eq = equippableItems(parseExport(V2));
  const slots = eq.map((i) => i.slot).sort();
  assert.deepEqual(slots, ['head', 'offhand', 'ring']);
  const ring = eq.find((i) => i.slot === 'ring');
  assert.deepEqual(ring.stats, {}); // kept despite no mapped stats
});

test('equippableItems still excludes non-gear (no recognized equip slot)', () => {
  // A relic/libram with only a non-stat effect is kept (slot = relic), but a shirt/tabard is not.
  const text = [
    'TGS11', 'C:name=x',
    'I:item:32368::::::::70::::::::::|INVTYPE_RELIC|ilvl=110|||Libram of the Eternal Rest',
    'I:item:45::::::::70::::::::::|INVTYPE_BODY|ilvl=1||Squire\'s Shirt',
  ].join('\n');
  const eq = equippableItems(parseExport(text));
  assert.deepEqual(eq.map((i) => i.slot), ['relic']); // libram kept, shirt excluded
  assert.equal(eq[0].name, 'Libram of the Eternal Rest');
});

test('parseItemString pulls id / enchant / gems / suffix', () => {
  const p = parseItemString('item:12345:678:111:222:0:0:99:0:70');
  assert.equal(p.itemId, 12345);
  assert.equal(p.enchantId, 678);
  assert.deepEqual(p.gems, [111, 222]);
  assert.equal(p.suffixId, 99);
});

test('rejects non-export text; handles CRLF', () => {
  assert.throws(() => parseExport('hello'), /Tankadin Gear Sim export/);
  assert.equal(parseExport(V2.replace(/\n/g, '\r\n')).items.length, 3);
});
