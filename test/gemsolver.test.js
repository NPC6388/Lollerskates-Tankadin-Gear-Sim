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

test('socket bonus: matches the color when the bonus beats raw gems', () => {
  // A lone yellow socket with a +5 spell-damage bonus. The globally best threat gem is a red
  // gem; matching yellow gives up a little raw value but earns the bonus, which wins here.
  const item = { slot: 'hands', stats: {}, sockets: { yellow: 1 },
    socketBonus: { stat: 'spellDamage', value: 5 } };
  const out = solveLoadout([item], SCALES.threatAOE, { names: [] });
  const match = bestGem(SCALES.threatAOE, { socketColor: 'yellow', matchColor: true });
  assert.notEqual(match.gem.name, bestGem(SCALES.threatAOE).gem.name); // sanity: differs from raw
  assert.equal(out.gems.choices[0].socket, 'yellow');
  assert.equal(out.gems.choices[0].name, match.gem.name);            // chose the matching gem
  assert.equal(out.gems.stats.spellDamage, (match.gem.stats.spellDamage || 0) + 5); // bonus applied
});

test('socket bonus: keeps the raw gem when the bonus is not worth it', () => {
  // Threat goal, a BLUE socket, and only a +4 defense bonus (near-worthless for threat). The
  // raw +9 spell-damage gem in an off-color socket beats any blue-fitting gem + the bonus.
  const raw = bestGem(SCALES.threatAOE); // Runed Living Ruby (red, +9 spell damage)
  const item = { slot: 'hands', stats: {}, sockets: { blue: 1 },
    socketBonus: { stat: 'defenseRating', value: 4 } };
  const out = solveLoadout([item], SCALES.threatAOE, { names: [] });
  assert.equal(out.gems.choices[0].name, raw.gem.name);              // kept the raw best gem
  assert.equal(out.gems.stats.spellDamage, raw.gem.stats.spellDamage); // its +9
  assert.equal(out.gems.stats.defenseRating, undefined);             // bonus forfeited
});

test('solveLoadout produces gem + enchant recommendations for the real set', () => {
  const set = equippableItems(parseExport(UNBUFFED_EXPORT)).filter((i) => i.equipped);
  const out = solveLoadout(set, SCALES.threatAOE, professionPerks(['Jewelcrafting', 'Enchanting']));
  assert.ok(Object.keys(out.enchants.choices).length > 0, 'recommends enchants');
  assert.equal(out.enchants.choices.head.name, 'Glyph of Power');
  assert.ok(out.addedStats.spellDamage > 0, 'threat loadout adds spell damage');
});
