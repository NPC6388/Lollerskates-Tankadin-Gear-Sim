// Faction auto-detect from the shoulder inscription, and the final meta-activation invariant: every
// meta the optimizer reports as active must actually satisfy its color requirement on the FINAL gems
// (the meta-repair / honest-accounting pass must not ship a set claiming a dead meta is live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { optimizeSets } from '../src/runner.js';
import { detectFaction, factionFromEnchant } from '../src/enchants.js';
import { gemColors, metaActivated, GEMS, META_GEMS } from '../src/gems.js';

const SAMPLE = fs.readFileSync(fileURLToPath(new URL('../web/sample-export.txt', import.meta.url)), 'utf8');
const parsed = parseExport(SAMPLE);
const items = equippableItems(parsed);
const BYNAME = new Map([...GEMS, ...META_GEMS].map((g) => [g.name, g]));

test('factionFromEnchant maps the rep-locked shoulder inscriptions', () => {
  assert.equal(factionFromEnchant(2978), 'Aldor');   // Greater Inscription of Warding
  assert.equal(factionFromEnchant(2995), 'Scryer');  // Greater Inscription of the Orb
  assert.equal(factionFromEnchant(99999), null);     // not an inscription
});

test('detectFaction reads the equipped shoulder', () => {
  const f = detectFaction(items);
  const sh = items.find((i) => i.slot === 'shoulder' && i.equipped);
  assert.equal(f, sh ? factionFromEnchant(sh.enchantId) : null);
});

test('every meta reported active actually meets its color requirement on the final gems', () => {
  // Run a config that triggers a kept meta + a scroll-loosened gate (the case that used to ship a
  // dead meta as "active"): keep-equipped, agility scroll, no imbued, 1:4.
  const goals = [{ id: 'rt', name: 'Raid Threat', focus: '', ratio: { ehp: 1, threat: 4 }, gates: { raid: true, requireUncrushable: true, minHealth: 11500 }, lockEye: true }];
  const variants = [
    { useImbuedMeta: true, scrolls: [], keepGemsEnchants: false },
    { useImbuedMeta: false, scrolls: ['agility'], keepGemsEnchants: { equippedOnly: true } },
  ];
  for (const v of variants) {
    const r = optimizeSets(items, { professions: ['Enchanting'], buff: 'raid', maxPhase: 2, faction: detectFaction(items), talentRanks: parsed.talentRanks, goals, ...v })[0];
    const counts = { red: 0, yellow: 0, blue: 0 };
    for (const ps of Object.values(r.perSlot)) for (const g of (ps.gems || [])) {
      const def = BYNAME.get(g.name);
      if (def && !def.meta) for (const c of gemColors(def)) if (counts[c] != null) counts[c]++;
    }
    for (const m of r.metas) {
      const def = BYNAME.get(m.name);
      if (!def) continue;
      assert.equal(m.active, metaActivated(def, counts), `${m.name} active=${m.active} but colors ${JSON.stringify(counts)} say otherwise`);
    }
  }
});
