// A socket bonus is earned when the chosen gems can be assigned to the sockets — in ANY order, since
// the player physically places them — so every socket color-matches. The per-socket greedy pick and
// the meta recolor can leave a gem tagged to an off-color socket while a sibling hybrid that fits it
// sits elsewhere, forfeiting a bonus the SAME gems could earn for free. reassignForBonus finds the
// max-fit assignment and relabels; bonusEarnedAsTagged reports whether the CURRENT tags already fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reassignForBonus, bonusEarnedAsTagged } from '../src/gemsolver.js';
import { GEMS, FITS } from '../src/gems.js';

const byName = new Map(GEMS.map((g) => [g.name, g]));
// Build a gem CHOICE (what the solver carries): the gem's stats/color plus the socket it's tagged to.
const choice = (name, socket) => ({ ...byName.get(name), socket });
const RYB = { red: 1, yellow: 1, blue: 1 };

test('screenshot case: Nightseye + 2 Noble Topaz mis-tagged — the bonus is free, reassign earns it', () => {
  // As the meta-recolor left them: purple Nightseye in the RED socket, an orange Noble Topaz in the
  // BLUE socket (off-color) — bonus looks forfeited.
  const gems = [
    choice('Glowing Nightseye', 'red'),   // purple = red+blue
    choice('Veiled Noble Topaz', 'yellow'), // orange = red+yellow
    choice('Veiled Noble Topaz', 'blue'),   // orange — does NOT fit blue
  ];
  assert.equal(bonusEarnedAsTagged(gems), false, 'as tagged, the blue socket holds an off-color gem');
  assert.equal(reassignForBonus(gems, RYB), true, 'the same three gems CAN fill red/yellow/blue');
  // And they were relabeled so the readout tells the player the earning layout: Nightseye -> blue.
  const bySock = Object.fromEntries(gems.map((g) => [g.socket, g.name]));
  assert.equal(bySock.blue, 'Glowing Nightseye', 'the only blue-capable gem goes in the blue socket');
  assert.equal(bySock.red, 'Veiled Noble Topaz');
  assert.equal(bySock.yellow, 'Veiled Noble Topaz');
  for (const g of gems) assert.ok(FITS[g.color].includes(g.socket), `${g.name} fits its ${g.socket} socket`);
});

test('legitimate forfeit: three orange gems cannot fill a blue socket — stays skipped', () => {
  const gems = [
    choice('Veiled Noble Topaz', 'red'),
    choice('Veiled Noble Topaz', 'yellow'),
    choice('Veiled Noble Topaz', 'blue'),
  ];
  assert.equal(reassignForBonus(gems, RYB), false, 'no orange gem fits blue — bonus unreachable for free');
});

test('legitimate forfeit: three blue stamina gems cannot fill red/yellow — stays skipped', () => {
  const gems = ['red', 'yellow', 'blue'].map((s) => choice('Solid Star of Elune', s));
  assert.equal(reassignForBonus(gems, RYB), false);
});

test('already-earned arrangement is kept and left in place', () => {
  const gems = [
    choice('Veiled Noble Topaz', 'red'),
    choice('Veiled Noble Topaz', 'yellow'),
    choice('Glowing Nightseye', 'blue'),
  ];
  assert.equal(bonusEarnedAsTagged(gems), true);
  assert.equal(reassignForBonus(gems, RYB), true);
});

test('two-socket item: a purple gem + a stamina blue gem earn a red+blue bonus regardless of tag order', () => {
  const sockets = { red: 1, blue: 1 };
  const gems = [choice('Solid Star of Elune', 'red'), choice('Glowing Nightseye', 'blue')]; // blue gem tagged red
  assert.equal(bonusEarnedAsTagged(gems), false, 'Solid Star (blue) tagged to the red socket does not fit');
  assert.equal(reassignForBonus(gems, sockets), true, 'swap them: Nightseye->red, Solid Star->blue');
  const bySock = Object.fromEntries(gems.map((g) => [g.socket, g.name]));
  assert.equal(bySock.red, 'Glowing Nightseye');
  assert.equal(bySock.blue, 'Solid Star of Elune');
});

test('no sockets or no gems: not earned, no crash', () => {
  assert.equal(reassignForBonus([], RYB), false);
  assert.equal(reassignForBonus([choice('Solid Star of Elune', 'red')], {}), false);
});
