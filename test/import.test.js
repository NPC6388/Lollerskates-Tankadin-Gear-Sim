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

const V2 = [
  'TGS2',
  'C:name=Lollerskate;level=70;dodge=16.5920;defenseSkill=481.06;spellPower=690',
  'I:item:29068:3002:24062:25896:::::70|INVTYPE_HEAD|ilvl=120;ITEM_MOD_STAMINA_SHORT=33;ITEM_MOD_DEFENSE_SKILL_RATING_SHORT=25;ITEM_MOD_DODGE_RATING_SHORT=20;ITEM_MOD_SPELL_DAMAGE_DONE_SHORT=21;RESISTANCE0_NAME=950',
  'I:item:28825:1071:24033:::::70|INVTYPE_CHEST|ilvl=125;ITEM_MOD_BLOCK_RATING_SHORT=24;ITEM_MOD_BLOCK_VALUE_SHORT=35;ITEM_MOD_STAMINA_SHORT=30',
  'I:item:12344::::::::70|INVTYPE_TRINKET|ilvl=1', // junk-ish, no mapped stats
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

test('v2: per-item stats map to internal names', () => {
  const p = parseExport(V2);
  assert.equal(p.version, 2);
  const head = p.items[0];
  assert.equal(head.slot, 'head');
  assert.equal(head.itemLevel, 120);
  assert.equal(head.stats.stamina, 33);
  assert.equal(head.stats.defenseRating, 25);
  assert.equal(head.stats.dodgeRating, 20);
  assert.equal(head.stats.spellDamage, 21);
  assert.equal(head.stats.armor, 950);
});

test('v2: equip locations map to slots', () => {
  assert.equal(equipLocToSlot('INVTYPE_HEAD'), 'head');
  assert.equal(equipLocToSlot('INVTYPE_FINGER'), 'ring');
  assert.equal(equipLocToSlot('INVTYPE_SHIELD'), 'offhand');
  assert.equal(equipLocToSlot('INVTYPE_2HWEAPON'), 'weapon');
  assert.equal(equipLocToSlot('INVTYPE_BAG'), null);
});

test('v2: equippableItems keeps gear, drops unmapped/stat-less', () => {
  const eq = equippableItems(parseExport(V2));
  // head + chest have stats+slot; the trinket line has a slot but no mapped stats
  const slots = eq.map((i) => i.slot).sort();
  assert.deepEqual(slots, ['chest', 'head']);
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
