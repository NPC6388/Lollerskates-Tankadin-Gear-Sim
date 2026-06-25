// Web UI for the Tankadin Gear Sim. Runs the same optimizer the CLI uses (src/runner.js),
// entirely client-side: parse the pasted/uploaded export -> optimizeSets -> render four sets.
import { parseExport, equippableItems } from '../src/import.js';
import { toExportText } from '../src/savedvars.js';
import { optimizeSets, spellHitPct, GOAL_PRESETS, DEFAULT_TRINKET_LOCKS } from '../src/runner.js';
import { PROFESSION_NAMES } from '../src/professions.js';
import { CAPS } from '../src/constants.js';

const $ = (id) => document.getElementById(id);
const SLOT_ORDER = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'weapon', 'offhand', 'relic'];
// Each goal exposes one slider: the primary component's weight vs a secondary fixed at 1.
const GOAL_AXES = { raid: ['threat', 'sta'], survival: ['ehp', 'threat'], aoe: ['aoeThreat', 'sta'], balanced: ['ehp', 'threat'] };
const AXIS_LABEL = { threat: 'threat', ehp: 'EHP', sta: 'stamina', aoeThreat: 'AOE threat' };

let items = null;        // equippable items from the export
let parsed = null;       // full parse (character + items)
let activeTab = 0;

// ---- setup ------------------------------------------------------------------
function init() {
  for (const sel of [$('prof1'), $('prof2')]) {
    sel.innerHTML = '<option value="">— none —</option>' + PROFESSION_NAMES.map((p) => `<option>${p}</option>`).join('');
  }
  $('prof1').value = 'Enchanting';

  $('goalConfig').innerHTML = GOAL_PRESETS.map((g) => {
    const [primary] = GOAL_AXES[g.id];
    const v = g.ratio[primary];
    return `<div class="goal-row" data-goal="${g.id}">
      <span class="name">${g.name}</span>
      <input type="range" min="1" max="4" step="0.5" value="${v}" />
      <span class="ratio">${v.toFixed(1)}:1</span>
    </div>`;
  }).join('');
  $('goalConfig').querySelectorAll('.goal-row input').forEach((r) => {
    r.addEventListener('input', (e) => { e.target.nextElementSibling.textContent = (+e.target.value).toFixed(1) + ':1'; });
  });

  $('exportText').addEventListener('input', () => tryParse($('exportText').value));
  $('exportFile').addEventListener('change', handleFile);
  $('loadSample').addEventListener('click', loadSample);
  $('optimizeBtn').addEventListener('click', runOptimize);
}

function setStatus(msg, kind = '') { const el = $('inputStatus'); el.textContent = msg; el.className = 'status ' + kind; }

function tryParse(text) {
  const raw = (text || '').trim();
  if (!raw) { items = null; $('optimizeBtn').disabled = true; setStatus(''); return; }
  try {
    parsed = parseExport(toExportText(raw));
    items = equippableItems(parsed);
    populateTrinketLocks();
    $('optimizeBtn').disabled = items.length === 0;
    setStatus(`Loaded ${parsed.character.name || 'character'} — ${items.length} equippable items (TGS${parsed.version}).`, 'ok');
  } catch (err) {
    items = null; $('optimizeBtn').disabled = true;
    setStatus(err.message || String(err), 'err');
  }
}

async function handleFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  $('exportText').value = text;
  tryParse(text);
}

async function loadSample() {
  try {
    const res = await fetch('web/sample-export.txt');
    if (!res.ok) throw new Error('sample not found');
    const text = await res.text();
    $('exportText').value = text;
    tryParse(text);
  } catch { setStatus('Could not load the example file.', 'err'); }
}

function populateTrinketLocks() {
  const trinkets = items.filter((it) => it.slot === 'trinket');
  const opts = '<option value="">— none —</option>' +
    trinkets.map((t) => `<option value="${t.itemId}">${t.name || t.itemId}</option>`).join('');
  const set = (sel, defId) => {
    const el = $(sel); el.innerHTML = opts;
    if (trinkets.some((t) => t.itemId === defId)) el.value = String(defId);
  };
  set('lockIcon', DEFAULT_TRINKET_LOCKS.icon);
  set('lockEye', DEFAULT_TRINKET_LOCKS.eye);
}

// ---- run --------------------------------------------------------------------
function currentGoals() {
  return GOAL_PRESETS.map((g) => {
    const [primary, secondary] = GOAL_AXES[g.id];
    const row = $('goalConfig').querySelector(`.goal-row[data-goal="${g.id}"] input`);
    const v = +row.value;
    return { ...g, focus: `${AXIS_LABEL[primary]} : ${AXIS_LABEL[secondary]} ${v}:1`, ratio: { [primary]: v, [secondary]: 1 } };
  });
}

function runOptimize() {
  if (!items) return;
  $('optimizeBtn').disabled = true; $('optimizeBtn').textContent = 'Optimizing…';
  setTimeout(() => {
    try {
      const professions = [$('prof1').value, $('prof2').value].filter(Boolean);
      const trinketLocks = { icon: num($('lockIcon').value), eye: num($('lockEye').value) };
      const results = optimizeSets(items, {
        professions, buffed: $('buffed').checked, maxPhase: +$('phase').value, trinketLocks, goals: currentGoals(),
      });
      render(results);
    } catch (err) {
      $('summary').innerHTML = `<p class="status err">${err.message || err}</p>`;
      $('results-panel').hidden = false;
    } finally {
      $('optimizeBtn').disabled = false; $('optimizeBtn').textContent = 'Optimize';
    }
  }, 20);
}
const num = (v) => (v ? +v : null);

// ---- render -----------------------------------------------------------------
const fmt = (n) => Math.round(n).toLocaleString();
const itemLink = (it) => it ? `<a href="https://www.wowhead.com/tbc/item=${it.itemId}" target="_blank" rel="noopener">${it.name || it.itemId}</a>` : '';
const yesno = (b) => `<span class="badge ${b ? 'yes' : 'no'}">${b ? 'yes' : 'no'}</span>`;

function render(results) {
  $('results-panel').hidden = false;
  const sh = (r) => spellHitPct(r.agg);

  $('summary').innerHTML = `<table><thead><tr>
      <th>Set</th><th>EHP</th><th>Spell&nbsp;dmg</th><th>Spell&nbsp;hit</th><th>Stam</th><th>Uncrush</th><th>Uncrit</th>
    </tr></thead><tbody>${results.map((r, i) => `<tr class="${i === activeTab ? 'sel' : ''}">
      <td>${r.goal.name}</td><td>${fmt(r.evald.ehpPhysical)}</td><td>${fmt(r.agg.spellPower)}</td>
      <td>${sh(r).toFixed(2)}%</td><td>${fmt(r.agg.stamina)}</td>
      <td>${r.evald.totalAvoidanceWithHS.toFixed(1)}%</td><td>${yesno(r.evald.raidCritImmune)}</td>
    </tr>`).join('')}</tbody></table>`;

  $('tabs').innerHTML = results.map((r, i) =>
    `<button class="${i === activeTab ? 'active' : ''}" data-i="${i}">${r.goal.name}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { activeTab = +b.dataset.i; render(results); }));

  $('sets').innerHTML = setCard(results[activeTab]);
}

function setCard(r) {
  const e = r.evald, a = r.agg;
  const need = r.goal.gates.uncrushableTarget ?? CAPS.uncrushableCombined;
  const crushPass = e.totalAvoidanceWithHS + 1e-9 >= need;
  const stats = [
    ['EHP (physical)', fmt(e.ehpPhysical)], ['Spell damage', fmt(a.spellPower)],
    ['Spell hit', spellHitPct(a).toFixed(2) + '%'], ['Stamina', fmt(a.stamina)],
    ['Armor', fmt(a.armor)], ['Defense', a.defenseSkill.toFixed(0)],
    ['Resilience', fmt(a.resilienceRating)], ['Block value', fmt(a.blockValue)],
  ];
  const gemCount = {}; for (const g of r.gemChoices) gemCount[g.name] = (gemCount[g.name] || 0) + 1;
  const gems = Object.entries(gemCount).map(([n, c]) => `${c}× ${n}`).join(', ') || 'none';
  const ench = Object.entries(r.enchants).map(([slot, en]) => `${slot}: ${en.name}`).join(' · ') || 'none';
  const metaWarn = r.metas.filter((m) => !m.active)
    .map((m) => `⚠ ${m.name} won't activate — needs ${m.requires}`).join('<br>');

  return `<div class="set">
    <h3>${r.goal.name}</h3>
    <p class="focus">Focus: ${r.goal.focus} · ${r.legal ? 'all gates met' : 'gates NOT fully met with this collection'}</p>
    <div class="gates">
      <span class="gate ${e.raidCritImmune ? 'pass' : 'fail'}">Uncrittable — ${e.critReduction.toFixed(2)}% / ${5.6}%</span>
      <span class="gate ${crushPass ? 'pass' : 'fail'}">Uncrushable — ${e.totalAvoidanceWithHS.toFixed(1)}% / ${need}%</span>
    </div>
    <div class="statline">${stats.map(([k, v]) => `<span class="stat">${k} <b>${v}</b></span>`).join('')}</div>
    <ul class="slots">${SLOT_ORDER.map((k) => {
      const it = r.selection[k]; if (!it) return '';
      const tag = it._gem === 'cap' ? '<span class="defgem">def-gemmed</span>' : '';
      return `<li><span class="slot">${k}</span> ${itemLink(it)}${tag}</li>`;
    }).join('')}</ul>
    <div class="gemline"><b>Gems:</b> ${gems}</div>
    <div class="enchline"><b>Enchants:</b> ${ench}</div>
    ${metaWarn ? `<div class="metawarn">${metaWarn}</div>` : ''}
  </div>`;
}

init();
