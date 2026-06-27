// Gem/enchant solver: weight-driven gem & enchant recommendations, gated by professions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES } from '../src/weights.js';
import { bestGem, bestMeta, metaActivated, gemColors } from '../src/gems.js';
import { bestEnchant } from '../src/enchants.js';
import { professionPerks } from '../src/professions.js';
import { recommendEnchants, solveLoadout, gemWeights, planItemGems } from '../src/gemsolver.js';
import { parseExport, equippableItems } from '../src/import.js';
import { UNBUFFED_EXPORT } from './fixtures/lollerskate-unbuffed.js';

test('best gem follows the goal: spell damage for threat, stamina/defense for survival', () => {
  assert.equal(bestGem(SCALES.threatAOE).gem.name, 'Runed Living Ruby');          // spell damage (Ornate +12 is unique, excluded from bulk)
  assert.equal(bestGem(SCALES.survivalEHP).gem.name, 'Solid Star of Elune');       // stamina
  assert.equal(bestGem(SCALES.survivalUncrushable).gem.name, 'Thick Dawnstone'); // defense (epic Fire Opals are unique → excluded from bulk; best rare is the def gem)
});

test('epic gems are unique on this realm: excluded from bulk, allowed when asked', () => {
  // Every epic cut is unique here, so the bulk pick is always a rare; the epic only appears if a
  // caller explicitly opts in (allowUnique) — the hook for future single-placement.
  assert.equal(bestGem(SCALES.survivalUncrushable).gem.epic, undefined);          // a rare, not epic
  assert.equal(bestGem(SCALES.survivalUncrushable, { allowUnique: true }).gem.name, 'Stalwart Fire Opal');
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

test('meta activation: requirements parse; hybrids count for both colors', () => {
  const powerful = { requires: '3+ blue' };       // Powerful Earthstorm Diamond
  const imbued = { requires: 'more red than blue' }; // Imbued Unstable Diamond
  assert.equal(metaActivated(powerful, { blue: 3 }), true);
  assert.equal(metaActivated(powerful, { blue: 2 }), false);
  assert.equal(metaActivated(imbued, { red: 5, blue: 2 }), true);
  assert.equal(metaActivated(imbued, { red: 2, blue: 2 }), false);
  // compound requirements: ALL clauses must hold (comma = AND)
  const eternal = { requires: '2+ blue, 1+ yellow' };        // Eternal Earthstorm Diamond
  const relentless = { requires: '2+ red, 2+ yellow, 2+ blue' }; // Relentless Earthstorm Diamond
  assert.equal(metaActivated(eternal, { blue: 2, yellow: 1 }), true);
  assert.equal(metaActivated(eternal, { blue: 2, yellow: 0 }), false); // missing the yellow
  assert.equal(metaActivated(relentless, { red: 2, yellow: 2, blue: 2 }), true);
  assert.equal(metaActivated(relentless, { red: 2, yellow: 2, blue: 1 }), false);
  // a purple (red+blue) gem contributes to BOTH counts
  assert.deepEqual(gemColors({ color: 'purple' }).sort(), ['blue', 'red']);
  assert.deepEqual(gemColors({ color: 'blue' }), ['blue']);
});

test('bestMeta with counts skips a meta the set cannot activate', () => {
  // No counts: best by score (Powerful, +18 stam). With only 2 blue + 1 yellow, Powerful
  // (3+ blue) is unreachable, so the survival pick falls to the best meta that DOES activate
  // (Eternal, 2+ blue & 1+ yellow). With 3 blue, Powerful is reachable again.
  assert.equal(bestMeta(SCALES.survivalEHP).gem.name, 'Powerful Earthstorm Diamond'); // no counts
  assert.equal(bestMeta(SCALES.survivalEHP, { counts: { blue: 2, yellow: 1 } }).gem.name, 'Eternal Earthstorm Diamond');
  assert.equal(bestMeta(SCALES.survivalEHP, { counts: { blue: 3 } }).gem.name, 'Powerful Earthstorm Diamond');
});

test('solveLoadout only counts meta stats when the colored gems activate it', () => {
  // 3 red sockets get the stamina gem (Solid Star, blue) for survival -> 3 blue gems, so the
  // meta socket gets Powerful (3+ blue). Reported active.
  const item = { slot: 'hands', stats: {}, sockets: { meta: 1, red: 3 } };
  const out = solveLoadout([item], SCALES.survivalEHP, { names: [] });
  const meta = out.gems.choices.find((c) => c.socket === 'meta');
  assert.equal(meta.name, 'Powerful Earthstorm Diamond');
  assert.equal(out.gems.metas[0].active, true);
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
  assert.equal(out.gems.stats.spellDamage, raw.gem.stats.spellDamage); // its spell damage
  assert.equal(out.gems.stats.defenseRating, undefined);             // bonus forfeited
});

test('gate-aware: keeps a defense socket bonus a threat set would forfeit while below the cap', () => {
  // Threat objective alone forfeits a +4 defense bonus on a BLUE socket (matching is a threat
  // downgrade worth more than the bonus) — same call the chest makes on a 1:4 set.
  const item = { slot: 'chest', stats: {}, sockets: { blue: 1 }, socketBonus: { stat: 'defenseRating', value: 4 } };
  const off = planItemGems(item, SCALES.threatAOE, { names: [] });
  assert.equal(off.stats.defenseRating, undefined); // forfeited on the pure threat objective
  // Below the cap (gateScale given), the defense bonus is load-bearing for legality: priced on the
  // cap scale, matching wins, so the bonus is banked (gem defense + the +4 bonus).
  const on = planItemGems(item, SCALES.threatAOE, { names: [] }, undefined, { gateScale: SCALES.survivalUncrushable });
  assert.ok((on.stats.defenseRating || 0) >= 4, 'defense bonus kept when gate-aware');
});

test('free bonus: banks a socket bonus when the globally best gem already fits the socket', () => {
  // A scale that only values spell damage: the best gem is a RED spell-damage gem, and the socket
  // is red, so matching costs nothing. Even though the bonus stat (parry) is worth 0 here, it is
  // free to keep — the >= tie-break banks it rather than forfeiting.
  const w = { spellDamage: 1 };
  const item = { slot: 'hands', stats: {}, sockets: { red: 1 }, socketBonus: { stat: 'parryRating', value: 4 } };
  const out = planItemGems(item, w, { names: [] });
  assert.equal(out.stats.parryRating, 4); // free bonus banked
});

test('cap-aware: drops the crush-removal premium once already uncrushable', () => {
  // Below the cap, the uncrushable scale's avoidance premium picks a defense/avoidance gem.
  assert.notEqual(bestGem(SCALES.survivalUncrushable).gem.name, 'Solid Star of Elune');
  // Once uncrushable, gemWeights switches to the face-value (EHP) scale -> stamina wins,
  // so the solver stops stacking now-worthless avoidance/defense.
  const w = gemWeights(SCALES.survivalUncrushable, { atCapWeights: SCALES.survivalEHP, uncrushable: true });
  assert.equal(w, SCALES.survivalEHP);
  assert.equal(bestGem(w).gem.name, 'Solid Star of Elune');
  // Still below the cap -> premium scale unchanged.
  assert.equal(
    gemWeights(SCALES.survivalUncrushable, { atCapWeights: SCALES.survivalEHP, uncrushable: false }),
    SCALES.survivalUncrushable,
  );
});

test('solveLoadout produces gem + enchant recommendations for the real set', () => {
  const set = equippableItems(parseExport(UNBUFFED_EXPORT)).filter((i) => i.equipped);
  const out = solveLoadout(set, SCALES.threatAOE, professionPerks(['Jewelcrafting', 'Enchanting']));
  assert.ok(Object.keys(out.enchants.choices).length > 0, 'recommends enchants');
  assert.equal(out.enchants.choices.head.name, 'Glyph of Power');
  assert.ok(out.addedStats.spellDamage > 0, 'threat loadout adds spell damage');
});
