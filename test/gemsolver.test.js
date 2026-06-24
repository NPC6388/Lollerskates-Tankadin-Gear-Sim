// Gem/enchant solver: weight-driven gem & enchant recommendations, gated by professions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES } from '../src/weights.js';
import { bestGem, bestMeta } from '../src/gems.js';
import { bestEnchant } from '../src/enchants.js';
import { professionPerks } from '../src/professions.js';
import { recommendEnchants, solveLoadout } from '../src/gemsolver.js';
import { parseExport, equippableItems } from '../src/import.js';
import { UNBUFFED_EXPORT } from './fixtures/lollerskate-unbuffed.js';

test('best gem follows the goal: spell damage for threat, stamina/defense for survival', () => {
  assert.equal(bestGem(SCALES.threatAOE).gem.name, 'Runed Living Ruby');          // spell damage
  assert.equal(bestGem(SCALES.survivalEHP).gem.name, 'Solid Star of Elune');       // stamina
  assert.equal(bestGem(SCALES.survivalUncrushable).gem.name, 'Stalwart Fire Opal'); // defense + dodge
});

test('best head enchant follows the goal', () => {
  assert.equal(bestEnchant('head', SCALES.threatAOE).enchant.name, 'Glyph of Power');
  assert.equal(bestEnchant('head', SCALES.survivalEHP).enchant.name, 'Glyph of the Defender');
});

test('ring enchants require Enchanting', () => {
  assert.equal(bestEnchant('ring', SCALES.threatAOE, { names: [] }), null);
  const ench = professionPerks(['Enchanting']);
  assert.equal(bestEnchant('ring', SCALES.threatAOE, ench).enchant.name, 'Enchant Ring - Spellpower');
});

test('professionPerks resolves a chosen pair', () => {
  const p = professionPerks(['Blacksmithing', 'Enchanting']);
  assert.equal(p.ringEnchant, true);
  assert.deepEqual(p.extraSockets, { hands: 1, wrist: 1 });
  assert.ok(p.names.includes('Blacksmithing') && p.names.includes('Enchanting'));
});

test('meta gem follows the goal', () => {
  assert.equal(bestMeta(SCALES.survivalEHP).gem.name, 'Powerful Earthstorm Diamond'); // +18 stam
  assert.equal(bestMeta(SCALES.survivalUncrushable).gem.name, 'Eternal Earthstorm Diamond'); // +12 def
});

test('ring enchant is applied to both rings (counts twice)', () => {
  const ench = professionPerks(['Enchanting']);
  const r = recommendEnchants(['ring'], SCALES.threatAOE, ench);
  assert.equal(r.stats.spellDamage, 24); // 12 per ring x2
});

test('solveLoadout produces gem + enchant recommendations for the real set', () => {
  const set = equippableItems(parseExport(UNBUFFED_EXPORT)).filter((i) => i.equipped);
  const out = solveLoadout(set, SCALES.threatAOE, professionPerks(['Jewelcrafting', 'Enchanting']));
  assert.ok(Object.keys(out.enchants.choices).length > 0, 'recommends enchants');
  assert.equal(out.enchants.choices.head.name, 'Glyph of Power');
  assert.ok(out.addedStats.spellDamage > 0, 'threat loadout adds spell damage');
});
