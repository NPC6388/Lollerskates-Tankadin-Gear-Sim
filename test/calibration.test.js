// Calibration must let the model reproduce the player's character sheet from item stats.
// Fixture: the real equipped AS-build set (v4-style E: lines) + the C: finals from a
// live /tgs export. After calibrate(), aggregate() must return the sheet values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExport, equippableItems } from '../src/import.js';
import { calibrate, aggregate } from '../src/model.js';
import { evaluateSet } from '../src/character.js';

const EXPORT = [
  'TGS4',
  'C:name=Lollerskate;level=70;dodge=16.5920;parry=16.0400;block=27.1473;defenseSkill=501.00;defenseRating=310;agility=85;stamina=981;health=13007;armor=15683;spellPower=676;blockValue=258',
  'E:item:29068:3002:24062:25896:::::70::::::::::|INVTYPE_HEAD|ilvl=120;ITEM_MOD_DODGE_RATING=28;ITEM_MOD_SPELL_POWER=27;RESISTANCE0_NAME=1227;ITEM_MOD_HIT_SPELL_RATING=14;ITEM_MOD_STAMINA_SHORT=43;ITEM_MOD_DEFENSE_SKILL_RATING=33;ITEM_MOD_INTELLECT_SHORT=24',
  'E:item:28516::::::::70::::::::::|INVTYPE_NECK|ilvl=115;ITEM_MOD_DEFENSE_SKILL_RATING=16;ITEM_MOD_DODGE_RATING=21;ITEM_MOD_STAMINA_SHORT=39',
  'E:item:29070:2991:24033:24033:::::70::::::::::|INVTYPE_SHOULDER|ilvl=120;ITEM_MOD_INTELLECT_SHORT=14;ITEM_MOD_BLOCK_VALUE=27;ITEM_MOD_SPELL_POWER=26;RESISTANCE0_NAME=1133;ITEM_MOD_STAMINA_SHORT=37;ITEM_MOD_DEFENSE_SKILL_RATING=30;ITEM_MOD_BLOCK_RATING=17',
  'E:item:29066:2661:24033:24033:24033::::70::::::::::|INVTYPE_CHEST|ilvl=120;ITEM_MOD_INTELLECT_SHORT=30;ITEM_MOD_SPELL_POWER=27;RESISTANCE0_NAME=1510;ITEM_MOD_STAMINA_SHORT=48;ITEM_MOD_DEFENSE_SKILL_RATING=27;ITEM_MOD_BLOCK_RATING=23',
  'E:item:29253::::::::70::::::::::|INVTYPE_WAIST|ilvl=110;ITEM_MOD_INTELLECT_SHORT=22;ITEM_MOD_STAMINA_SHORT=37;ITEM_MOD_DEFENSE_SKILL_RATING=24;ITEM_MOD_SPELL_POWER=20;ITEM_MOD_BLOCK_RATING=16;RESISTANCE0_NAME=782',
  'E:item:30126:2748:24033::::::70::::::::::|INVTYPE_LEGS|ilvl=133;ITEM_MOD_INTELLECT_SHORT=27;ITEM_MOD_BLOCK_VALUE=35;ITEM_MOD_STAMINA_SHORT=54;ITEM_MOD_DEFENSE_SKILL_RATING=35;ITEM_MOD_SPELL_POWER=41;ITEM_MOD_BLOCK_RATING=25;RESISTANCE0_NAME=1459',
  'E:item:29254:2649:::::::70::::::::::|INVTYPE_FEET|ilvl=110;ITEM_MOD_INTELLECT_SHORT=26;ITEM_MOD_STAMINA_SHORT=46;ITEM_MOD_DEFENSE_SKILL_RATING=23;ITEM_MOD_SPELL_POWER=28;RESISTANCE0_NAME=955',
  'E:item:29252:2649:::::::70::::::::::|INVTYPE_WRIST|ilvl=110;ITEM_MOD_INTELLECT_SHORT=12;ITEM_MOD_STAMINA_SHORT=42;ITEM_MOD_DEFENSE_SKILL_RATING=21;ITEM_MOD_SPELL_POWER=19;RESISTANCE0_NAME=608',
  'E:item:30124:2937:::::::70::::::::::|INVTYPE_HAND|ilvl=133;ITEM_MOD_INTELLECT_SHORT=21;ITEM_MOD_BLOCK_VALUE=30;ITEM_MOD_STAMINA_SHORT=40;ITEM_MOD_DEFENSE_SKILL_RATING=27;ITEM_MOD_SPELL_POWER=29;ITEM_MOD_BLOCK_RATING=22;RESISTANCE0_NAME=1042',
  'E:item:30028:2928:::::::70::::::::::|INVTYPE_FINGER|ilvl=128;ITEM_MOD_DEFENSE_SKILL_RATING=17;ITEM_MOD_BLOCK_VALUE=24;ITEM_MOD_BLOCK_RATING=24;ITEM_MOD_STAMINA_SHORT=37',
  'E:item:30083:2928:::::::70::::::::::|INVTYPE_FINGER|ilvl=128;ITEM_MOD_DEFENSE_SKILL_RATING=18;ITEM_MOD_DODGE_RATING=25;ITEM_MOD_STAMINA_SHORT=45',
  'E:item:28789::::::::70::::::::::|INVTYPE_TRINKET|ilvl=125;ITEM_MOD_SPELL_POWER=54',
  'E:item:29925:2622:::::::70::::::::::|INVTYPE_CLOAK|ilvl=128;ITEM_MOD_DODGE_RATING=39;ITEM_MOD_DEFENSE_SKILL_RATING=22;ITEM_MOD_STAMINA_SHORT=37;RESISTANCE0_NAME=108',
  'E:item:30095:2669:::::::70::::::::::|INVTYPE_WEAPONMAINHAND|ilvl=134;ITEM_MOD_INTELLECT_SHORT=20;ITEM_MOD_CRIT_SPELL_RATING=21;ITEM_MOD_SPELL_POWER=221;ITEM_MOD_STAMINA_SHORT=28',
  'E:item:28825:1071:24033::::::70::::::::::|INVTYPE_SHIELD|ilvl=125;ITEM_MOD_STAMINA_SHORT=57;ITEM_MOD_DEFENSE_SKILL_RATING=21;ITEM_MOD_HIT_RATING=15;RESISTANCE0_NAME=5279',
].join('\n');

const parsed = parseExport(EXPORT);
const equipped = equippableItems(parsed).filter((i) => i.equipped);
const cal = calibrate(equipped, parsed.character);
const f2 = (x) => Number(x.toFixed(2));

test('E: lines are flagged equipped', () => {
  assert.equal(equipped.length, 15);
  assert.ok(equipped.every((i) => i.equipped === true));
});

test('calibrated model reproduces the character sheet', () => {
  const agg = aggregate(equipped, { calibration: cal, hsBlockBonus: 30 });
  assert.equal(f2(agg.defenseSkill), 501.0);
  assert.equal(f2(agg.dodgePct), 16.59);
  assert.equal(f2(agg.parryPct), 16.04);
  assert.equal(f2(agg.blockPct), 27.15);
  assert.equal(f2(agg.armor), parsed.character.armor); // baseArmor + item armor
});

test('equipped set is raid crit-immune at 501 defense', () => {
  const e = evaluateSet(aggregate(equipped, { calibration: cal, hsBlockBonus: 30 }));
  assert.equal(e.raidCritImmune, true);
});

test('equipped set: uncrushable only with the block libram (matches the sheet)', () => {
  const hs30 = evaluateSet(aggregate(equipped, { calibration: cal, hsBlockBonus: 30 }));
  const hs3532 = evaluateSet(aggregate(equipped, { calibration: cal, hsBlockBonus: 35.32 }));
  assert.equal(hs30.uncrushable, false);   // ~100.8% combined
  assert.equal(hs3532.uncrushable, true);  // ~106% combined
});
