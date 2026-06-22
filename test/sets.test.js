// Set-bonus detection: by item ID (the import parser doesn't tag sets), plus the
// threat modifiers the active bonuses confer. Validated on Lollerskate's real set,
// which is 3pc Justicar (T4) + 2pc Crystalforge (T5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExport, equippableItems } from '../src/import.js';
import { setBonuses } from '../src/sets.js';
import { justicarBonuses } from '../src/model.js';
import { retributionAuraPerHit } from '../src/threat.js';
import { UNBUFFED_EXPORT } from './fixtures/lollerskate-unbuffed.js';

const items = equippableItems(parseExport(UNBUFFED_EXPORT)).filter((i) => i.equipped);
const b = setBonuses(items);

test('detects 3pc Justicar + 2pc Crystalforge from the equipped set', () => {
  assert.equal(b.justicar.pieces, 3);
  assert.equal(b.justicar.twoPc, true);
  assert.equal(b.justicar.fourPc, false);
  assert.equal(b.crystalforge.pieces, 2);
  assert.equal(b.crystalforge.twoPc, true);
});

test('active modifiers: +10% seal (2pc J), +15 Ret Aura (2pc C), no 4pc', () => {
  assert.equal(b.sealDamageMult, 1.10);
  assert.equal(b.retAuraBonus, 15);
  assert.equal(b.holyShieldFlat, 0);    // no 4pc Justicar
  assert.equal(b.blockValueProc, 0);    // no 4pc Crystalforge
});

test('Crystalforge 2pc raises Retribution Aura threat per hit', () => {
  const base = retributionAuraPerHit();                          // 26 * 1.9
  const withSet = retributionAuraPerHit({ crystalforge2pc: b.crystalforge.twoPc }); // 41 * 1.9
  assert.equal(Number(base.toFixed(2)), 49.4);
  assert.equal(Number(withSet.toFixed(2)), 77.9);
});

test('justicarBonuses resolves set pieces by item ID', () => {
  assert.equal(justicarBonuses(items).pieces, 3);
  assert.equal(justicarBonuses(items).twoPc, true);
});
