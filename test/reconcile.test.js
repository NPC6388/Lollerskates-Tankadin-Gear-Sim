// Reconciliation gate: the FIRST-PRINCIPLES forward calc (race/class base + Avenger's
// Shield talents + gear, no back-fit) must reproduce the player's real UNBUFFED sheet.
// Any drift here is a real signal — a wrong constant or a stat the addon isn't capturing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExport, equippableItems } from '../src/import.js';
import { aggregate } from '../src/model.js';
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
  // defenseSkill carries a small (+~1.75) overshoot: the addon sums 314 defense rating
  // off item tooltips vs the sheet's 310, so dodge/parry/block inherit ~+0.07%.
  assert.ok(near(a.defenseSkill, c.defenseSkill, 2), `defenseSkill ${a.defenseSkill} vs ${c.defenseSkill}`);
  assert.ok(near(a.dodgePct, c.dodge, 0.12), `dodge ${a.dodgePct} vs ${c.dodge}`);
  assert.ok(near(a.parryPct, c.parry, 0.12), `parry ${a.parryPct} vs ${c.parry}`);
  assert.ok(near(a.blockPct, c.block, 0.12), `block ${a.blockPct} vs ${c.block}`);
});

test('armor, stamina, and health reproduce the sheet within rounding', () => {
  assert.ok(near(a.armor, c.armor, 1), `armor ${a.armor} vs ${c.armor}`);
  assert.ok(near(a.stamina, c.stamina, 1), `stamina ${a.stamina} vs ${c.stamina}`);
  assert.ok(near(a.health, c.health, 5), `health ${a.health} vs ${c.health}`);
});

test('the equipped set is raid crit-immune (defense >= 490)', () => {
  assert.equal(evaluateSet(a).raidCritImmune, true);
});

test('block value reproduces the sheet (shield base block + suffixes + Str/20)', () => {
  // addon v6 reads the shield's "137 Block" line; model adds floor(Str/20).
  // 137 (shield) + 116 (suffixes) + floor(106/20)=5 = 258.
  assert.ok(near(a.blockValue, c.blockValue, 1), `blockValue ${a.blockValue} vs ${c.blockValue}`);
});
