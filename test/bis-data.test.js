// Integrity guard for the curated BiS reference data (web/bis.js). It's hand-maintained / scraped, so
// these checks catch a malformed entry (bad id, empty name, dup within a slot, stray slot key) before
// it reaches the dropdown. Pure data module — imports fine in node with no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIS, BIS_PHASES } from '../web/bis.js';

// Slot keys the paper doll / bisSlotKey() can ask for (ring1/ring2 -> 'ring', trinket1/2 -> 'trinket').
const VALID_SLOTS = new Set(['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist',
  'legs', 'feet', 'ring', 'trinket', 'weapon', 'offhand', 'relic']);

test('BIS_PHASES are the five TBC content phases', () => {
  assert.deepEqual(BIS_PHASES, [1, 2, 3, 4, 5]);
});

test('every declared phase has a slot map with only valid slot keys', () => {
  for (const ph of BIS_PHASES) {
    assert.ok(BIS[ph], `phase ${ph} present in BIS`);
    for (const slot of Object.keys(BIS[ph])) {
      assert.ok(VALID_SLOTS.has(slot), `phase ${ph}: unknown slot key "${slot}"`);
    }
  }
});

test('every BiS entry has a positive integer id and a non-empty name; no dup ids within a slot', () => {
  for (const ph of BIS_PHASES) {
    for (const [slot, list] of Object.entries(BIS[ph])) {
      assert.ok(Array.isArray(list) && list.length, `phase ${ph} ${slot}: non-empty list`);
      const seen = new Set();
      for (const e of list) {
        assert.ok(Number.isInteger(e.id) && e.id > 0, `phase ${ph} ${slot}: bad id ${JSON.stringify(e)}`);
        assert.ok(typeof e.name === 'string' && e.name.trim().length, `phase ${ph} ${slot}: empty name for id ${e.id}`);
        assert.ok(!seen.has(e.id), `phase ${ph} ${slot}: duplicate id ${e.id}`);
        seen.add(e.id);
        if (e.note !== undefined) assert.ok(typeof e.note === 'string' && e.note.length, `phase ${ph} ${slot}: bad note for id ${e.id}`);
      }
    }
  }
});

test('manual addition: Tome of Fiery Redemption is in the P1-P2 trinket lists with a note', () => {
  for (const ph of [1, 2]) {
    const tome = BIS[ph].trinket.find((e) => e.id === 30447);
    assert.ok(tome, `phase ${ph} trinket includes Tome of Fiery Redemption (30447)`);
    assert.ok(tome.note && tome.note.length, `phase ${ph}: Tome carries a curator note`);
  }
});
