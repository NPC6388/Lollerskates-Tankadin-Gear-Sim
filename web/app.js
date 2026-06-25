// Web UI for the Tankadin Gear Sim. Runs the same optimizer the CLI uses (src/runner.js),
// entirely client-side: parse the pasted/uploaded export -> optimizeSets -> render four sets.
import { parseExport, equippableItems } from '../src/import.js';
import { toExportText } from '../src/savedvars.js';
import { optimizeSets, spellHitPct, GOAL_PRESETS, DEFAULT_TRINKET_LOCKS } from '../src/runner.js';
import { PROFESSION_NAMES } from '../src/professions.js';
import { GEMS, META_GEMS } from '../src/gems.js';
import { CAPS } from '../src/constants.js';

const $ = (id) => document.getElementById(id);
// Paper-doll columns, like the in-game character sheet.
const LEFT_SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'weapon', 'offhand'];
const RIGHT_SLOTS = ['hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'relic'];
const SLOT_LABEL = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest', wrist: 'Wrist', weapon: 'Main Hand', offhand: 'Off Hand', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', ring1: 'Ring', ring2: 'Ring', trinket1: 'Trinket', trinket2: 'Trinket', relic: 'Relic' };
const GEM_COLOR = {};
for (const g of GEMS) GEM_COLOR[g.name] = g.color;
for (const g of META_GEMS) GEM_COLOR[g.name] = 'meta';
// Each goal exposes one trade-off slider between a defensive stat (left) and a threat stat
// (right). Slider value v in [-3,3]: v>0 favors the right stat (weight 1+v), v<0 favors the
// left (weight 1-v), 0 = even 1:1. blendScale turns the resulting ratio into the objective.
// Every goal trades the same EHP ↔ threat axis (AOE differs only by a looser crush gate).
const GOAL_SIDES = {
  raid: { left: 'ehp', right: 'threat' },
  survival: { left: 'ehp', right: 'threat' },
  aoe: { left: 'ehp', right: 'threat' },
  balanced: { left: 'ehp', right: 'threat' },
};
const AXIS_LABEL = { threat: 'Threat', ehp: 'EHP' };
const fmtW = (w) => (Number.isInteger(w) ? String(w) : w.toFixed(1));
function ratioFor(id, v) {
  const { left, right } = GOAL_SIDES[id];
  const Lw = v < 0 ? 1 - v : 1, Rw = v > 0 ? 1 + v : 1;
  return { left, right, Lw, Rw, ratio: { [left]: Lw, [right]: Rw } };
}
const ratioText = (id, v) => { const r = ratioFor(id, v); return `${AXIS_LABEL[r.left]} ${fmtW(r.Lw)} : ${fmtW(r.Rw)} ${AXIS_LABEL[r.right]}`; };
// Default slider position from a preset's ratio (one side is always 1).
const defaultV = (g) => { const { left, right } = GOAL_SIDES[g.id]; return (g.ratio[right] || 1) - (g.ratio[left] || 1); };

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
    const { left, right } = GOAL_SIDES[g.id];
    const v = defaultV(g);
    return `<div class="goal-row" data-goal="${g.id}">
      <span class="name">${g.name}</span>
      <div class="slider-cell">
        <div class="slider-wrap">
          <span class="end left">${AXIS_LABEL[left]}</span>
          <input type="range" min="-3" max="3" step="0.5" value="${v}" />
          <span class="end right">${AXIS_LABEL[right]}</span>
        </div>
        <div class="ratio">${ratioText(g.id, v)}</div>
      </div>
    </div>`;
  }).join('');
  $('goalConfig').querySelectorAll('.goal-row input').forEach((r) => {
    const id = r.closest('.goal-row').dataset.goal;
    r.addEventListener('input', (e) => { e.target.closest('.slider-cell').querySelector('.ratio').textContent = ratioText(id, +e.target.value); });
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
    const v = +$('goalConfig').querySelector(`.goal-row[data-goal="${g.id}"] input`).value;
    const r = ratioFor(g.id, v);
    return { ...g, focus: ratioText(g.id, v), ratio: r.ratio };
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
        professions, buffed: $('buffed').checked, maxPhase: +$('phase').value,
        faction: $('faction').value, useImbuedMeta: $('imbuedMeta').checked,
        trinketLocks, goals: currentGoals(),
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
const yesno = (b) => `<span class="badge ${b ? 'yes' : 'no'}">${b ? 'yes' : 'no'}</span>`;
const wh = (id, text, cls) => `<a class="${cls}" href="https://www.wowhead.com/tbc/item=${id}" target="_blank" rel="noopener">${text}</a>`;
// Wowhead's power.js adds the icon + hover tooltip to any item link; fall back to plain text
// (color by gem color) when we have no id.
const gemLink = (g) => g.id ? wh(g.id, g.name, 'gem') : `<span class="gem g-${GEM_COLOR[g.name] || 'meta'}">${g.name}</span>`;
const enchLink = (e) => e.id ? wh(e.id, e.name, 'ds-ench') : `<span class="ds-ench">${e.name}</span>`;

// WowSims/Sixty Upgrades slot order (Head…Ranged); ammo omitted.
const WSE_SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'weapon', 'offhand', 'relic'];
function buildExport(r) {
  const items = WSE_SLOTS.map((k) => {
    const it = r.selection[k]; if (!it) return null;
    const ps = r.perSlot[k] || {};
    const o = { id: it.itemId };
    if (ps.enchant && ps.enchant.effectId) o.enchant = ps.enchant.effectId;
    const gems = (ps.gems || []).map((g) => g.id).filter(Boolean);
    if (gems.length) o.gems = gems;
    return o;
  });
  const c = parsed && parsed.character || {};
  return JSON.stringify({ name: c.name || 'Tankadin', race: 'BloodElf', class: 'paladin', level: c.level || 70, talents: '', spec: 'protection', gear: { items } });
}
function exportSet(r, btn) {
  const json = buildExport(r);
  const ok = () => { const t = btn.textContent; btn.textContent = '✓ Copied — paste into Sixty Upgrades import'; setTimeout(() => { btn.textContent = t; }, 2200); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(ok, () => window.prompt('Copy, then import at sixtyupgrades.com:', json));
  else window.prompt('Copy, then import at sixtyupgrades.com:', json);
}

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
  const eb = $('sets').querySelector('.export-btn');
  if (eb) eb.addEventListener('click', () => exportSet(results[activeTab], eb));
}

function slotHTML(r, slotKey, side) {
  const it = r.selection[slotKey];
  if (!it) return `<div class="ds-slot ${side} empty"><span class="ds-label">${SLOT_LABEL[slotKey]}</span></div>`;
  const ps = r.perSlot[slotKey] || {};
  const tag = ps.defGemmed ? '<span class="defgem">def-gemmed</span>' : '';
  const ench = ps.enchant ? `<div class="ds-ench-row">${enchLink(ps.enchant)}</div>` : '';
  const gems = (ps.gems && ps.gems.length) ? `<div class="ds-gems">${ps.gems.map(gemLink).join('')}</div>` : '';
  return `<div class="ds-slot ${side}">
    ${wh(it.itemId, it.name || it.itemId, 'ds-item')}${tag}
    ${ench}${gems}
  </div>`;
}

const panel = (title, rows) =>
  `<div class="spanel"><h4>${title}</h4>${rows.map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

function setCard(r) {
  const e = r.evald, a = r.agg;
  const need = r.goal.gates.uncrushableTarget ?? CAPS.uncrushableCombined;
  const crushPass = e.totalAvoidanceWithHS + 1e-9 >= need;
  const metaWarn = r.metas.filter((m) => !m.active)
    .map((m) => `⚠ ${m.name} won't activate — needs ${m.requires}`).join('<br>');
  const noId = [...new Set(Object.values(r.perSlot).filter((ps) => ps.enchant && !ps.enchant.effectId).map((ps) => ps.enchant.name))];
  const exportNote = noId.length ? `<div class="metawarn">Export: no Sixty Upgrades ID for ${noId.join(', ')} — omitted from the string.</div>` : '';

  const doll = `<div class="doll">
    <div class="col left">${LEFT_SLOTS.map((k) => slotHTML(r, k, 'left')).join('')}</div>
    <div class="col right">${RIGHT_SLOTS.map((k) => slotHTML(r, k, 'right')).join('')}</div>
  </div>`;

  const panels = `<div class="panels">
    ${panel('Primary', [['Health', fmt(a.health)], ['Stamina', fmt(a.stamina)], ['Strength', fmt(a.strength)], ['Agility', fmt(a.agility)], ['Intellect', fmt(a.intellect)]])}
    ${panel('Spell', [['Spell Damage', fmt(a.spellPower)], ['Spell Hit', spellHitPct(a).toFixed(2) + '%'], ['Block Value', fmt(a.blockValue)]])}
    ${panel('Defense', [['Armor', fmt(a.armor)], ['Defense', a.defenseSkill.toFixed(0)], ['Resilience', fmt(a.resilienceRating)], ['Block', a.blockPct.toFixed(2) + '%'], ['Dodge', a.dodgePct.toFixed(2) + '%'], ['Parry', a.parryPct.toFixed(2) + '%'], ['Total Avoidance', e.totalAvoidanceNoHS.toFixed(2) + '%']])}
    ${panel('Survival', [['EHP (physical)', fmt(e.ehpPhysical)], ['Uncrushable (w/ HS)', e.totalAvoidanceWithHS.toFixed(1) + '%'], ['Crit reduction', e.critReduction.toFixed(2) + '%']])}
  </div>`;

  return `<div class="set">
    <div class="set-head">
      <div>
        <h3>${r.goal.name}</h3>
        <p class="focus">Focus: ${r.goal.focus} · ${r.legal ? 'all gates met' : 'gates NOT fully met with this collection'}</p>
      </div>
      <div class="head-right">
        <div class="gates">
          <span class="gate ${e.raidCritImmune ? 'pass' : 'fail'}">Uncrittable ${e.critReduction.toFixed(2)}%</span>
          <span class="gate ${crushPass ? 'pass' : 'fail'}">Uncrushable ${e.totalAvoidanceWithHS.toFixed(1)}% / ${need}%</span>
        </div>
        <button class="export-btn" type="button">⬇ Export to Sixty Upgrades</button>
      </div>
    </div>
    ${doll}
    ${metaWarn ? `<div class="metawarn">${metaWarn}</div>` : ''}
    ${exportNote}
    ${panels}
  </div>`;
}

init();
