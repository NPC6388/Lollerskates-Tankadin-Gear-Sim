#!/usr/bin/env node
// Full-collection optimizer runner for Lollerskate's Tankadin Gear Sim.
//
//   node bin/optimize.mjs [path-to-export.txt]   (default: scratchpad/export.txt)
//
// Reads a TGS addon export (the copy-box text, or the `export` string decoded out of the
// SavedVariables file) and prints the player's four tuned sets — raid threat, survival, AOE
// trash, balanced — each gemmed/enchanted, with crit/crush status and meta-activation warnings.
// Evaluated BUFFED with Blessing of Kings + base Mark of the Wild.
//
// Gemming is a LEVER for the caps, not fixed to the goal focus. Each socketed item enters the
// pool as TWO gem variants — `focus` (threat/EHP gems) and `cap` (avoidance/defense gems) — so
// the optimizer can KEEP a higher-threat item and gem IT for defense to stay uncrit/uncrush
// when that beats swapping to a tankier piece. The optimizer (buildPool + optimizeHeuristic)
// also handles distinct paired ring/trinket slots, 2H exclusion, and the locked proc trinkets
// (Icon of the Silver Crescent, Eye of Magtheridon) whose on-use value the passive model can't see.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExport, equippableItems } from '../src/import.js';
import { aggregate, BUFFS, TALENTS } from '../src/model.js';
import { evaluateSet } from '../src/character.js';
import { bestGem, bestMeta, gemColors } from '../src/gems.js';
import { bestEnchant } from '../src/enchants.js';
import { solveLoadout } from '../src/gemsolver.js';
import { SCALES, GOAL_SCALES } from '../src/weights.js';
import { professionPerks } from '../src/professions.js';
import { buildPool, optimizeHeuristic } from '../src/optimizer.js';
import { CAPS, RATING } from '../src/constants.js';

// ---- config -----------------------------------------------------------------
const PROFESSIONS = ['Enchanting'];   // gear-relevant professions (gem/enchant perks)
const BUFFED = true;                  // evaluate with Kings (+10%) + base MotW (+14)
const ICON = 29370, EYE = 28789;      // locked trinkets (proc/on-use value off-model)
const HS = 30;                        // Holy Shield +30% block in the uncrushable check
const CAP_SCALE = SCALES.survivalUncrushable; // gems that most cheaply buy avoidance/defense

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const exportPath = process.argv[2] || path.join(repoRoot, 'scratchpad', 'export.txt');
if (!fs.existsSync(exportPath)) {
  console.error(`No export found at ${exportPath}\nUsage: node bin/optimize.mjs [path-to-export.txt]`);
  process.exit(1);
}

const perks = professionPerks(PROFESSIONS);
const BUFF = BUFFED ? { kings: true, buffs: BUFFS.markOfTheWild } : {};
const parsed = parseExport(fs.readFileSync(exportPath, 'utf8'));
const allItems = equippableItems(parsed);

const baseOf = (it) => it.baseStats || it.stats || {};
const sumInto = (into, s, m = 1) => { for (const [k, v] of Object.entries(s || {})) into[k] = (into[k] || 0) + v * m; };
const spellHitPct = (a) => TALENTS.precisionSpellHitPct + (a._raw?.spellHitRating || 0) / RATING.spellHitPer1;
const hasSockets = (it) => { const s = it.sockets || {}; return !!(s.red || s.yellow || s.blue || s.meta); };

// Build one gem variant of an item: base stats + the best gems for `gemScale` in each socket
// (meta chosen among those its colors can ACTIVATE) + the slot's best enchant for `enchScale`.
function buildVariant(it, gemScale, enchScale) {
  const stats = {}; sumInto(stats, baseOf(it));
  const sock = it.sockets || {};
  const gems = []; const colored = [];
  for (const c of ['red', 'yellow', 'blue']) {
    const n = sock[c] || 0; if (!n) continue;
    const g = bestGem(gemScale, { jewelcrafting: !!perks.jcGems });
    if (g) { for (let i = 0; i < n; i++) { gems.push(g.gem.name); colored.push(g.gem); } sumInto(stats, g.gem.stats, n); }
  }
  let meta = null;
  if (sock.meta) {
    const counts = { red: 0, yellow: 0, blue: 0 };
    for (const g of colored) for (const col of gemColors(g)) if (counts[col] != null) counts[col]++;
    let m = bestMeta(gemScale, { counts }); let active = true;
    if (!m) { m = bestMeta(gemScale); active = false; }
    if (m) { for (let i = 0; i < sock.meta; i++) gems.push(m.gem.name); if (active) sumInto(stats, m.gem.stats, sock.meta); meta = { name: m.gem.name, active, requires: m.gem.requires }; }
  }
  const en = bestEnchant(it.slot, enchScale, perks);
  if (en) sumInto(stats, en.enchant.stats);
  return { stats, gems, meta, enchant: en && en.enchant.name };
}

// A socketed item yields a focus variant (goal gems) and a cap variant (defense gems); an
// item without sockets yields just the one. These approximate (raw) gem stats drive SELECTION;
// the final gems are recomputed socket-bonus-aware below. `_gem` records the chosen intent.
function itemVariants(it, objScale) {
  const mk = (tag, v) => ({ ...it, stats: v.stats, _gem: tag });
  const focus = mk('focus', buildVariant(it, objScale, objScale));
  if (!hasSockets(it)) return [focus];
  return [focus, mk('cap', buildVariant(it, CAP_SCALE, objScale))];
}

const GOALS = [
  { name: 'RAID THREAT', focus: 'threat:sta 2:1', objScale: GOAL_SCALES.raidThreat, gates: { raid: true, requireUncrushable: true }, lock: { trinket1: ICON, trinket2: EYE } },
  { name: 'SURVIVAL', focus: 'ehp:threat 2:1', objScale: GOAL_SCALES.survival, gates: { raid: true, requireUncrushable: true }, lock: { trinket1: ICON } },
  { name: 'AOE TRASH', focus: 'threat:sta 2:1, crush>=97.4%', objScale: GOAL_SCALES.aoeThreat, gates: { raid: true, requireUncrushable: true, uncrushableTarget: CAPS.uncrushableCombined - 5 }, lock: { trinket1: ICON, trinket2: EYE } },
  { name: 'BALANCED', focus: 'ehp:threat 1:1', objScale: GOAL_SCALES.balanced2, gates: { raid: true, requireUncrushable: true }, lock: { trinket1: ICON, trinket2: EYE } },
];

function runGoal(g) {
  const prepared = allItems.flatMap((it) => itemVariants(it, g.objScale));
  const { pool, distinct, locked } = buildPool(prepared, { lock: g.lock || {} });
  const goal = { objective: 'scale', scaleWeights: g.objScale, gates: g.gates, hsBlockBonus: HS, ...BUFF };
  const res = optimizeHeuristic(pool, goal, { distinct, locked });
  // Final gemming, socket-bonus-aware (solveLoadout): gem the focus-intent items by the goal
  // scale and the def-gemmed items by the cap scale, then combine. Built from baseStats, so no
  // double-count. (Selection above used approximate raw-gem stats just to choose items/intent.)
  const focusItems = res.items.filter((v) => v._gem !== 'cap');
  const capItems = res.items.filter((v) => v._gem === 'cap');
  const loadF = solveLoadout(focusItems, g.objScale, perks, {});
  const loadC = capItems.length ? solveLoadout(capItems, CAP_SCALE, perks, {}) : null;
  const added = {}; sumInto(added, loadF.addedStats); if (loadC) sumInto(added, loadC.addedStats);
  const agg = aggregate([...res.items.map((v) => ({ stats: baseOf(v) })), { stats: added }], { hsBlockBonus: HS, ...BUFF });
  const gemChoices = [...loadF.gems.choices, ...(loadC ? loadC.gems.choices : [])];
  const metas = [...(loadF.gems.metas || []), ...(loadC ? loadC.gems.metas : [])];
  return { g, res, evald: evaluateSet(agg), agg, gemChoices, metas };
}

function report(r) {
  const order = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'weapon', 'offhand', 'relic'];
  const e = r.evald, a = r.agg, sel = r.res.selection;
  const need = r.g.gates.uncrushableTarget ?? CAPS.uncrushableCombined;
  console.log(`\n========== ${r.g.name} (${r.g.focus}) ==========`);
  console.log(`legal:${r.res.legal}  uncrit:${e.raidCritImmune} (${e.critReduction.toFixed(2)}%)  uncrush:${e.uncrushable} (${e.totalAvoidanceWithHS.toFixed(1)}% / ${need}%)`);
  console.log(`EHP ${Math.round(e.ehpPhysical).toLocaleString()}   SP ${Math.round(a.spellPower)}   spellHit ${spellHitPct(a).toFixed(2)}%   stam ${Math.round(a.stamina)}   armor ${Math.round(a.armor).toLocaleString()}   def ${a.defenseSkill.toFixed(0)}   resil ${Math.round(a.resilienceRating)}`);
  for (const k of order) {
    const it = sel[k]; if (!it) continue;
    const tag = it._gem === 'cap' ? '  [def-gemmed]' : '';
    console.log(`  ${k.padEnd(9)} ${it.name || it.itemId}${it.itemLevel ? ' (i' + it.itemLevel + ')' : ''}${tag}`);
  }
  const gemCount = {};
  for (const gn of r.gemChoices) gemCount[gn.name] = (gemCount[gn.name] || 0) + 1;
  console.log('  gems:', Object.entries(gemCount).map(([n, c]) => `${c}x ${n}`).join(', ') || '(none)');
  for (const m of r.metas) if (!m.active) console.log(`  ⚠ meta ${m.name} INACTIVE — needs ${m.requires}; not enough of that color gemmed`);
}

const results = GOALS.map(runGoal);
console.log(`Tankadin Gear Sim — ${parsed.character.name || '?'} (${allItems.length} equippable items)  ${BUFFED ? 'BUFFED: Kings + MotW' : 'unbuffed'}`);
console.log('\n==== SUMMARY ====');
console.log('set'.padEnd(13), 'EHP'.padStart(8), 'SP'.padStart(5), 'sHit'.padStart(6), 'stam'.padStart(5), 'uncrush'.padStart(8), 'uncrit');
for (const r of results) {
  console.log(r.g.name.padEnd(13), Math.round(r.evald.ehpPhysical).toLocaleString().padStart(8), String(Math.round(r.agg.spellPower)).padStart(5),
    (spellHitPct(r.agg).toFixed(2) + '%').padStart(6), String(Math.round(r.agg.stamina)).padStart(5),
    (r.evald.totalAvoidanceWithHS.toFixed(1) + '%').padStart(8), r.evald.raidCritImmune ? 'yes' : 'NO');
}
results.forEach(report);
