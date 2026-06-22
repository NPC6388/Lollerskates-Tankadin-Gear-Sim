// Validates the addon export format end-to-end (no game needed), using a sample
// string in exactly the shape TankadinGearSim.lua produces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExport, parseItemString } from '../src/import.js';

const SAMPLE = [
  'TGS1',
  'C:name=Lollerskates;level=70;dodge=16.4700;parry=16.0000;block=24.3200;defenseSkill=500.00;defenseRating=355;resilience=0;agility=80;stamina=600;health=12107;armor=15139;spellPower=639;blockValue=160',
  'I:item:28749:2983:0:0:0:0:0:0:70:0:0:0',     // ring w/ an enchant
  'I:item:29434:0:0:0:0:0:0:0:70:0:0:0',         // plain item
  'I:item:30627:2657:35489:0:0:0:0:0:70:0:0:0',  // weapon w/ enchant + 1 gem
].join('\n');

test('parses header + version', () => {
  assert.equal(parseExport(SAMPLE).version, 1);
});

test('parses character finals with correct types', () => {
  const c = parseExport(SAMPLE).character;
  assert.equal(c.name, 'Lollerskates');
  assert.equal(c.dodge, 16.47);
  assert.equal(c.defenseSkill, 500);
  assert.equal(c.spellPower, 639);
  assert.equal(c.blockValue, 160);
});

test('parses all items', () => {
  const items = parseExport(SAMPLE).items;
  assert.equal(items.length, 3);
  assert.equal(items[0].itemId, 28749);
  assert.equal(items[0].enchantId, 2983);
  assert.equal(items[2].itemId, 30627);
  assert.deepEqual(items[2].gems, [35489]);
});

test('parseItemString pulls id / enchant / gems / suffix', () => {
  const p = parseItemString('item:12345:678:111:222:0:0:99:0:70');
  assert.equal(p.itemId, 12345);
  assert.equal(p.enchantId, 678);
  assert.deepEqual(p.gems, [111, 222]);
  assert.equal(p.suffixId, 99);
});

test('rejects non-export text', () => {
  assert.throws(() => parseExport('hello world'), /Tankadin Gear Sim export/);
});

test('CRLF line endings are handled', () => {
  const crlf = SAMPLE.replace(/\n/g, '\r\n');
  assert.equal(parseExport(crlf).items.length, 3);
});
