// Reconciliation gate: the FIRST-PRINCIPLES forward calc (race/class base + Avenger's
// Shield talents + gear, no back-fit) must reproduce the player's real UNBUFFED sheet.
// Any drift here is a real signal — a wrong constant or a stat the addon isn't capturing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExport, equippableItems } from '../src/import.js';
import { aggregate, BUFFS, talentsFromRanks, TALENTS } from '../src/model.js';
import { evaluateSet } from '../src/character.js';
import { UNBUFFED_EXPORT } from './fixtures/lollerskate-unbuffed.js';

const parsed = parseExport(UNBUFFED_EXPORT);
const items = equippableItems(parsed).filter((i) => i.equipped);
const c = parsed.character;
const a = aggregate(items);
const near = (got, want, tol) => Math.abs(got - want) <= tol;

test('spell power is reproduced exactly (gear sum, no base)', () => {
  assert.equal(a.spellPower, c.spellPower); // 676
});

test('agility/strength/intellect reproduced exactly (race base + gear)', () => {
  assert.equal(a.agility, c.agility);     // 85
  assert.equal(a.strength, c.strength);   // 129
  assert.equal(a.intellect, c.intellect); // 289
});

test('avoidance & defense reproduce the sheet within rounding', () => {
  // With addon v7 (inactive socket bonuses excluded) item defense sums to 310 = sheet,
  // so defenseSkill and the avoidance it drives are now exact to rounding.
  assert.ok(near(a.defenseSkill, c.defenseSkill, 0.1), `defenseSkill ${a.defenseSkill} vs ${c.defenseSkill}`);
  assert.ok(near(a.dodgePct, c.dodge, 0.02), `dodge ${a.dodgePct} vs ${c.dodge}`);
  assert.ok(near(a.parryPct, c.parry, 0.02), `parry ${a.parryPct} vs ${c.parry}`);
  assert.ok(near(a.blockPct, c.block, 0.02), `block ${a.blockPct} vs ${c.block}`);
});

test('armor, stamina, and health reproduce the sheet within rounding', () => {
  assert.ok(near(a.armor, c.armor, 1), `armor ${a.armor} vs ${c.armor}`);
  assert.ok(near(a.stamina, c.stamina, 1), `stamina ${a.stamina} vs ${c.stamina}`);
  assert.ok(near(a.health, c.health, 5), `health ${a.health} vs ${c.health}`);
});

test('the equipped set is raid crit-immune (defense >= 490)', () => {
  assert.equal(evaluateSet(a).raidCritImmune, true);
});

test('Kings (+10%) and MotW (+14) raise the primaries; spell power untouched', () => {
  const buffed = aggregate(items, { kings: true, buffs: BUFFS.markOfTheWild });
  // stamina: (baseStam + gearStam + 14) * staminaMult * 1.10 — strictly above the unbuffed value
  assert.ok(buffed.stamina > a.stamina, `buffed stamina ${buffed.stamina} > ${a.stamina}`);
  // agility: (unbuffedAgility + 14) * 1.10 — flat MotW added before the Kings multiplier
  assert.ok(near(buffed.agility, (a.agility + 14) * 1.10, 0.01), `agi ${buffed.agility}`);
  // Kings/MotW do not touch spell power
  assert.equal(buffed.spellPower, a.spellPower);
});

test('talentsFromRanks: empty -> default 0/43/18 build; Sanctity -> lower stam/armor mult', () => {
  assert.deepEqual(talentsFromRanks({}), { ...TALENTS }); // no scan -> the guide's build
  // Sanctity 0/38/23: Sacred Duty 2/2, Combat Expertise 2/5, Toughness 3/5.
  const sanctity = talentsFromRanks({ 'Sacred Duty': 2, 'Combat Expertise': 2, Toughness: 3, Anticipation: 5, Deflection: 5, Precision: 3 });
  assert.ok(Math.abs(sanctity.staminaMult - 1.10) < 1e-9, `stamMult ${sanctity.staminaMult}`); // 1 + .06 + .04
  assert.ok(Math.abs(sanctity.toughnessItemArmorMult - 1.06) < 1e-9); // 3/5
  // Fewer stamina/armor talents -> strictly less health and armor than the default build.
  const a43 = aggregate(items);
  const a38 = aggregate(items, { talents: sanctity });
  assert.ok(a38.health < a43.health, `${a38.health} < ${a43.health}`);
  assert.ok(a38.armor < a43.armor, `${a38.armor} < ${a43.armor}`);
});

test('block value reproduces the sheet (shield base block + suffixes + Str/20)', () => {
  // addon v6 reads the shield's "137 Block" line; model adds floor(Str/20).
  // 137 (shield) + 116 (suffixes) + floor(106/20)=5 = 258.
  assert.ok(near(a.blockValue, c.blockValue, 1), `blockValue ${a.blockValue} vs ${c.blockValue}`);
});
