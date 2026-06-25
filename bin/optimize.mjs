#!/usr/bin/env node
// CLI for the four-set optimizer. Thin wrapper over src/runner.js (the same module the web UI
// uses), adding file IO + console rendering.
//
//   node bin/optimize.mjs [path-to-export.txt]   (default: scratchpad/export.txt)
//
// Input may be a raw TGS export (copy-box text) OR a TankadinGearSim SavedVariables .lua dump.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { toExportText } from '../src/savedvars.js';
import { optimizeSets, spellHitPct } from '../src/runner.js';
import { CAPS } from '../src/constants.js';

// ---- config -----------------------------------------------------------------
const PROFESSIONS = ['Enchanting']; // gear-relevant professions
const BUFFED = true;                // Kings (+10%) + base MotW (+14)
const PHASE = 2;                    // cap gems to this content phase
const FACTION = 'Aldor';            // Aldor | Scryer (shoulder inscriptions)
const USE_IMBUED = true;            // include the Imbued Unstable Diamond meta

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportPath = process.argv[2] || path.join(__dirname, '..', 'scratchpad', 'export.txt');
if (!fs.existsSync(exportPath)) {
  console.error(`No export found at ${exportPath}\nUsage: node bin/optimize.mjs [path-to-export.txt]`);
  process.exit(1);
}

const parsed = parseExport(toExportText(fs.readFileSync(exportPath, 'utf8')));
const items = equippableItems(parsed);
const results = optimizeSets(items, { professions: PROFESSIONS, buffed: BUFFED, maxPhase: PHASE, faction: FACTION, useImbuedMeta: USE_IMBUED });

const ORDER = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'weapon', 'offhand', 'relic'];

console.log(`Tankadin Gear Sim — ${parsed.character.name || '?'} (${items.length} equippable items)  ${BUFFED ? 'BUFFED: Kings + MotW' : 'unbuffed'}`);
console.log('\n==== SUMMARY ====');
console.log('set'.padEnd(13), 'EHP'.padStart(8), 'SP'.padStart(5), 'sHit'.padStart(6), 'stam'.padStart(5), 'uncrush'.padStart(8), 'uncrit');
for (const r of results) {
  console.log(r.goal.name.padEnd(13), Math.round(r.evald.ehpPhysical).toLocaleString().padStart(8), String(Math.round(r.agg.spellPower)).padStart(5),
    (spellHitPct(r.agg).toFixed(2) + '%').padStart(6), String(Math.round(r.agg.stamina)).padStart(5),
    (r.evald.totalAvoidanceWithHS.toFixed(1) + '%').padStart(8), r.evald.raidCritImmune ? 'yes' : 'NO');
}

for (const r of results) {
  const e = r.evald, a = r.agg;
  const need = r.goal.gates.uncrushableTarget ?? CAPS.uncrushableCombined;
  console.log(`\n========== ${r.goal.name} (${r.goal.focus}) ==========`);
  console.log(`legal:${r.legal}  uncrit:${e.raidCritImmune} (${e.critReduction.toFixed(2)}%)  uncrush:${e.uncrushable} (${e.totalAvoidanceWithHS.toFixed(1)}% / ${need}%)`);
  console.log(`EHP ${Math.round(e.ehpPhysical).toLocaleString()}   SP ${Math.round(a.spellPower)}   spellHit ${spellHitPct(a).toFixed(2)}%   stam ${Math.round(a.stamina)}   armor ${Math.round(a.armor).toLocaleString()}   def ${a.defenseSkill.toFixed(0)}   resil ${Math.round(a.resilienceRating)}`);
  for (const k of ORDER) { const it = r.selection[k]; if (it) console.log(`  ${k.padEnd(9)} ${it.name || it.itemId}${it.itemLevel ? ' (i' + it.itemLevel + ')' : ''}${it._gem === 'cap' ? '  [def-gemmed]' : ''}`); }
  const gc = {}; for (const g of r.gemChoices) gc[g.name] = (gc[g.name] || 0) + 1;
  console.log('  gems:', Object.entries(gc).map(([n, c]) => `${c}x ${n}`).join(', ') || '(none)');
  for (const m of r.metas) if (!m.active) console.log(`  ⚠ meta ${m.name} INACTIVE — needs ${m.requires}`);
}
