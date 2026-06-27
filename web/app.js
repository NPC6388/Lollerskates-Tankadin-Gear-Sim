// Web UI for the Tankadin Gear Sim. Runs the same optimizer the CLI uses (src/runner.js),
// entirely client-side: parse the pasted/uploaded export -> optimizeSets -> render four sets.
import { parseExport, equippableItems } from '../src/import.js';
import { toExportText } from '../src/savedvars.js';
import { optimizeSets, spellHitPct, GOAL_PRESETS, DEFAULT_TRINKET_LOCKS } from '../src/runner.js';
import { PROFESSION_NAMES } from '../src/professions.js';
import { GEMS, META_GEMS } from '../src/gems.js';
import { SCALES } from '../src/weights.js';
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
  aoe: { left: 'ehp', right: 'aoeThreat' }, // AOE Trash uses AOE-threat weighting (Consecration-heavy)
  balanced: { left: 'ehp', right: 'threat' },
};
const AXIS_LABEL = { threat: 'Threat', aoeThreat: 'AOE Threat', ehp: 'EHP' };
// Per-set minimum-HP gate (raid-buffed health floor), enforced as a hard constraint like
// uncrit/uncrush. Applies to every goal incl. AOE Trash. 10k default = effectively off.
const MINHP = { min: 10000, max: 14000, step: 500, default: 10000 };
const fmtHp = (h) => (h / 1000).toFixed(1) + 'k';
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
          <input type="range" class="ratio-slider" min="-3" max="3" step="0.5" value="${v}" />
          <span class="end right">${AXIS_LABEL[right]}</span>
        </div>
        <div class="ratio">${ratioText(g.id, v)}</div>
      </div>
      <div class="minhp-cell">
        <span class="minhp-label">Min HP</span>
        <input type="range" class="minhp-slider" min="${MINHP.min}" max="${MINHP.max}" step="${MINHP.step}" value="${MINHP.default}" />
        <span class="minhp-val">${fmtHp(MINHP.default)}</span>
      </div>
    </div>`;
  }).join('');
  // The EHP↔threat slider updates the ratio text; the Min-HP slider updates its own kHP label.
  $('goalConfig').querySelectorAll('.ratio-slider').forEach((r) => {
    const id = r.closest('.goal-row').dataset.goal;
    r.addEventListener('input', (e) => { e.target.closest('.slider-cell').querySelector('.ratio').textContent = ratioText(id, +e.target.value); });
  });
  $('goalConfig').querySelectorAll('.minhp-slider').forEach((r) => {
    r.addEventListener('input', (e) => { e.target.closest('.minhp-cell').querySelector('.minhp-val').textContent = fmtHp(+e.target.value); });
  });

  $('exportText').addEventListener('input', () => tryParse($('exportText').value));
  $('exportFile').addEventListener('change', handleFile);
  $('loadSample').addEventListener('click', loadSample);
  $('talents').addEventListener('input', updateTalentSummary);
  $('optimizeBtn').addEventListener('click', runOptimize);
  renderWeights();
}

// ---- Sixty Upgrades stat weights --------------------------------------------
// The named scales the guide/sim use, shown so a player can paste them into Sixty Upgrades' custom
// stat weights. Sixty Upgrades' custom-weights format is a flat JSON of { ourKey: weight } using the
// SAME stat keys this sim uses (incl. the meta/red/yellow/blue socket weights), omitting zeros — so
// the Copy button just emits JSON.stringify of the scale's non-zero entries.
const WEIGHT_SCALES = [
  { key: 'threatSingleBelowCap', label: 'Single-Target Threat', note: 'below the spell-hit / expertise caps' },
  { key: 'threatSingleAtCap', label: 'Single-Target Threat (capped)', note: 'hit / expertise / spell-hit already capped' },
  { key: 'threatAOE', label: 'AOE Threat', note: 'multi-target — Consecration / Holy Shield scale per target' },
  { key: 'survivalUncrushable', label: 'Survival — reach Uncrushable', note: 'crush-removal premium on avoidance' },
  { key: 'survivalEHP', label: 'Survival — EHP / Farm', note: 'avoidance at face value' },
  { key: 'balanced', label: 'Balanced', note: 'caps as constraints; ~1 SP ≈ 1 stamina beyond them' },
];
const WSTAT_NAME = { // our stat key -> readable name (for the on-page table)
  stamina: 'Stamina', intellect: 'Intellect', strength: 'Strength', agility: 'Agility',
  dodgeRating: 'Dodge Rating', parryRating: 'Parry Rating', defenseRating: 'Defense Rating',
  blockRating: 'Block Rating', blockValue: 'Block Value', blockValueBonus: 'Block Value Bonus',
  hitRating: 'Hit Rating', expertiseRating: 'Expertise Rating', spellDamage: 'Spell Damage',
  spellHitRating: 'Spell Hit Rating', spellCritRating: 'Spell Crit Rating',
  resilienceRating: 'Resilience Rating', armor: 'Armor', health: 'Health',
  metaSockets: 'Meta socket', redSockets: 'Red socket', yellowSockets: 'Yellow socket', blueSockets: 'Blue socket',
};
// Keys that exist in our scales but are NOT Sixty Upgrades gear stats — internal pseudo-stats we must
// not emit into the SU JSON (blockValueBonus is a meta-gem block-value % multiplier, not a gear stat).
const SU_EXCLUDE = new Set(['blockValueBonus']);
const nonZeroEntries = (key) => Object.entries(SCALES[key]).filter(([k, v]) => v !== 0 && !SU_EXCLUDE.has(k));
const suWeightsJson = (key) => JSON.stringify(Object.fromEntries(nonZeroEntries(key)), null, 4);
function renderWeights() {
  const host = $('weights'); if (!host) return;
  host.innerHTML = WEIGHT_SCALES.map(({ key, label, note }) => {
    const rows = nonZeroEntries(key).map(([k, v]) => `<div class="srow"><span>${WSTAT_NAME[k] || k}</span><b>${fmtW(v)}</b></div>`).join('');
    return `<div class="wscale">
      <div class="wscale-head"><h4>${label}</h4><button class="ghost copy-weights" type="button" data-key="${key}">Copy weights (JSON)</button></div>
      <p class="muted wscale-note">${note}</p>
      <div class="wgrid">${rows}</div>
    </div>`;
  }).join('');
  host.querySelectorAll('.copy-weights').forEach((b) => b.addEventListener('click', () => {
    const str = suWeightsJson(b.dataset.key);
    const ok = () => { const t = b.textContent; b.textContent = '✓ Copied'; setTimeout(() => { b.textContent = t; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(str).then(ok, () => window.prompt('Copy this JSON for Sixty Upgrades:', str));
    else window.prompt('Copy this JSON for Sixty Upgrades:', str);
  }));
}

// Talent string -> points per tree (split on "-", sum the rank digits in each segment).
function updateTalentSummary() {
  const trees = $('talents').value.trim().split('-');
  const sums = trees.length >= 2 ? trees.map((t) => [...t].reduce((a, ch) => a + (+ch || 0), 0)) : null;
  $('talentSummary').textContent = sums ? `— ${sums[0] || 0} / ${sums[1] || 0} / ${sums[2] || 0}` : '';
}

function setStatus(msg, kind = '') { const el = $('inputStatus'); el.textContent = msg; el.className = 'status ' + kind; }

function tryParse(text) {
  const raw = (text || '').trim();
  if (!raw) { items = null; $('optimizeBtn').disabled = true; setStatus(''); return; }
  try {
    parsed = parseExport(toExportText(raw));
    items = equippableItems(parsed);
    populateTrinketLocks();
    if (parsed.talents) $('talents').value = parsed.talents; // v10 export carries the talent string
    updateTalentSummary();
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
    const row = $('goalConfig').querySelector(`.goal-row[data-goal="${g.id}"]`);
    const v = +row.querySelector('.ratio-slider').value;
    const minHealth = +row.querySelector('.minhp-slider').value;
    const r = ratioFor(g.id, v);
    // Merge the min-HP floor into the goal's hard gates (10k default is effectively non-binding).
    return { ...g, focus: ratioText(g.id, v), ratio: r.ratio, gates: { ...g.gates, minHealth } };
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
        professions, buff: $('statBuff').value, maxPhase: +$('phase').value,
        faction: $('faction').value, useImbuedMeta: $('imbuedMeta').checked,
        keepGemsEnchants: keepFromScope($('keepScope').value),
        talentRanks: parsed.talentRanks, trinketLocks, goals: currentGoals(),
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

// "Keep gems & enchants" scope preset -> optimizeSets.keepGemsEnchants option.
function keepFromScope(scope) {
  switch (scope) {
    case 'all': return true;                                          // every completed item
    case 'equipped': return { equippedOnly: true };                  // worn completed items
    case 'current': return { equippedOnly: true, ignoreCompleteness: true }; // worn items, even unfinished
    default: return false;                                            // 'off' — re-gem everything
  }
}

// ---- render -----------------------------------------------------------------
const fmt = (n) => Math.round(n).toLocaleString();
const yesno = (b) => `<span class="badge ${b ? 'yes' : 'no'}">${b ? 'yes' : 'no'}</span>`;
const wh = (id, text, cls) => `<a class="${cls}" href="https://www.wowhead.com/tbc/item=${id}" target="_blank" rel="noopener">${text}</a>`;
// Wowhead's power.js adds the icon + hover tooltip to any item link; fall back to plain text
// (color by gem color) when we have no id.
const gemLink = (g) => g.id ? wh(g.id, g.name, 'gem') : `<span class="gem g-${GEM_COLOR[g.name] || 'meta'}">${g.name}</span>`;
// Each recommended gem is shown in its own cell: the SOCKET COLOR on top, the gem beneath it — so the
// player sockets by color. The socket bonus only lights up when each gem sits in a socket of its color,
// and the export's socket ORDER is unreliable (Lua pairs()), so color is the only safe instruction.
const isColor = (c) => c === 'red' || c === 'yellow' || c === 'blue';
const SOCK_LABEL = { red: 'Red', yellow: 'Yellow', blue: 'Blue' };
const socketChip = (s) => isColor(s) ? `<span class="sock-chip sock-${s}">${SOCK_LABEL[s]} socket</span>`
  : (s === 'meta' ? `<span class="sock-chip sock-meta">Meta</span>` : '');
// Show the socket-COLOR chip only when the bonus is being earned (then placement by color matters).
// The meta chip always shows. When the bonus is forfeited, gems can go in any socket (labelled below).
const gemCell = (g, showColor) => {
  const chip = g.socket === 'meta' ? socketChip('meta') : (showColor && isColor(g.socket) ? socketChip(g.socket) : '');
  return `<div class="gem-cell">${chip}<div class="gem-name">${gemLink(g)}</div></div>`;
};
const STAT_LABEL = { stamina: 'Stamina', defenseRating: 'Defense', dodgeRating: 'Dodge', parryRating: 'Parry',
  blockRating: 'Block', blockValue: 'Block Value', resilienceRating: 'Resilience', agility: 'Agility',
  strength: 'Strength', intellect: 'Intellect', spellDamage: 'Spell Damage', spellHitRating: 'Spell Hit',
  spellCritRating: 'Spell Crit', hitRating: 'Hit' };
const fmtBonus = (b) => `+${b.value} ${STAT_LABEL[b.stat] || b.stat}`;
// Enchants link by scroll item when one exists, else by the enchanting spell (trainer-taught).
const whSpell = (id, text, cls) => `<a class="${cls}" href="https://www.wowhead.com/tbc/spell=${id}" target="_blank" rel="noopener">${text}</a>`;
const enchLink = (e) => e.id ? wh(e.id, e.name, 'ds-ench') : e.spell ? whSpell(e.spell, e.name, 'ds-ench') : `<span class="ds-ench">${e.name}</span>`;

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
  const talents = ($('talents') && $('talents').value.trim()) || '';
  // NOTE: the WowSimsExporter import format sixtyupgrades reads carries gear + talents only —
  // it has no buff channel (sixtyupgrades stores buffs as its own array, set in its buffs panel).
  // So Kings/MotW can't be carried here; toggle them in sixtyupgrades after importing.
  return JSON.stringify({ name: c.name || 'Tankadin', race: 'BloodElf', class: 'paladin', level: c.level || 70, talents, spec: 'protection', gear: { items } });
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
  const tag = ps.defGemmed ? '<span class="defgem">def-gemmed</span>' : (ps.locked ? '<span class="defgem">kept</span>' : '');
  const ench = ps.enchant ? `<div class="ds-ench-row">${enchLink(ps.enchant)}</div>` : '';
  let gems = '';
  if (ps.gems && ps.gems.length) {
    const kept = ps.bonusKept === true;
    // Always show the socket-color chip above each gem (recommended gems carry a socket tag; locked
    // items don't, so they just list the gems they're already wearing).
    const cells = `<div class="ds-gems">${ps.gems.map((g) => gemCell(g, true)).join('')}</div>`;
    let bonusLine = '';
    if (ps.socketBonus) {
      bonusLine = kept
        ? `<div class="bonus-on">✓ Socket bonus active: ${fmtBonus(ps.socketBonus)}</div>`
        : `<div class="bonus-off">✕ Socket bonus skipped: ${fmtBonus(ps.socketBonus)} — not worth an off-color gem</div>`;
    }
    gems = cells + bonusLine;
  }
  return `<div class="ds-slot ${side}">
    ${wh(it.itemId, it.name || it.itemId, 'ds-item')}${tag}
    ${ench}${gems}
  </div>`;
}

const panel = (title, rows) =>
  `<div class="spanel"><h4>${title}</h4>${rows.map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

// What the stat buff contributes to this set (already included in the numbers above; this just
// shows its share). It scales all 4 primaries — each with its own downstream effect.
function buffNote(b) {
  if (!b || !b.name) return '';
  return `<div class="buffnote"><b>${b.name}</b>'s share of the above:
    <b>+${Math.round(b.stamina)}</b> stamina (≈+${Math.round(b.health).toLocaleString()} health),
    <b>+${Math.round(b.agility)}</b> agility (+${b.crushAvoid.toFixed(2)}% dodge → uncrush, + melee crit),
    <b>+${Math.round(b.intellect)}</b> intellect (+ spell crit),
    <b>+${Math.round(b.strength)}</b> strength (+ block value),
    <b>+${Math.round(b.armor).toLocaleString()}</b> armor.
    <span class="muted">Crit reduction +${b.critReduction.toFixed(2)}% — buffs add no defense/resilience, so they don't help uncrittable. Set the buff in Sixty Upgrades after import.</span></div>`;
}

function setCard(r) {
  const e = r.evald, a = r.agg;
  const crushReq = r.goal.gates.requireUncrushable !== false; // AOE trash drops the crush gate
  const need = r.goal.gates.uncrushableTarget ?? CAPS.uncrushableCombined;
  const crushPass = e.totalAvoidanceWithHS + 1e-9 >= need;
  const minHp = r.goal.gates.minHealth || 0;
  const hpPass = !minHp || a.health + 1e-9 >= minHp;
  const metaWarn = r.metas.filter((m) => !m.active)
    .map((m) => `⚠ ${m.name} won't activate — needs ${m.requires}`).join('<br>');
  const noId = [...new Set(Object.values(r.perSlot).filter((ps) => ps.enchant && !ps.enchant.effectId).map((ps) => ps.enchant.name))];
  const exportNote = noId.length ? `<div class="metawarn">Export: no Sixty Upgrades ID for ${noId.join(', ')} — omitted from the string.</div>` : '';
  // The export carries the gems, but their socket placement isn't always right on import.
  const anyRecGems = Object.values(r.perSlot).some((ps) => !ps.locked && (ps.gems || []).length);
  const socketNote = anyRecGems
    ? '<div class="socketnote">💎 Verify gems are in the correct sockets on Sixty Upgrades — the export sometimes puts them in the wrong holes.</div>'
    : '';

  const doll = `<div class="doll">
    <div class="col left">${LEFT_SLOTS.map((k) => slotHTML(r, k, 'left')).join('')}</div>
    <div class="col right">${RIGHT_SLOTS.map((k) => slotHTML(r, k, 'right')).join('')}</div>
  </div>`;

  const panels = `<div class="panels">
    ${panel('Primary', [['Health', fmt(a.health)], ['Stamina', fmt(a.stamina)], ['Strength', fmt(a.strength)], ['Agility', fmt(a.agility)], ['Intellect', fmt(a.intellect)]])}
    ${panel('Spell', [['Spell Damage', fmt(a.spellPower)], ['Spell Hit', spellHitPct(a).toFixed(2) + '%'], ['Block Value', fmt(a.blockValue)]])}
    ${panel('Defense', [['Armor', fmt(a.armor)], ['Defense', a.defenseSkill.toFixed(0)], ['Resilience', fmt(a.resilienceRating)], ['Block', a.blockPct.toFixed(2) + '%'], ['Dodge', a.dodgePct.toFixed(2) + '%'], ['Parry', a.parryPct.toFixed(2) + '%'], ['Total Avoidance', e.totalAvoidanceNoHS.toFixed(2) + '%']])}
    ${panel('Survival', [['EHP (health pool)', fmt(e.ehpPhysical)], ['Uncrushable (w/ HS)', e.totalAvoidanceWithHS.toFixed(1) + '%'], ['Crit reduction', e.critReduction.toFixed(2) + '%']])}
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
          ${crushReq
            ? `<span class="gate ${crushPass ? 'pass' : 'fail'}">Uncrushable ${e.totalAvoidanceWithHS.toFixed(1)}% / ${need}%</span>`
            : `<span class="gate na">Uncrushable ${e.totalAvoidanceWithHS.toFixed(1)}% — not required (trash)</span>`}
          ${minHp ? `<span class="gate ${hpPass ? 'pass' : 'fail'}">Min HP ${fmt(a.health)} / ${fmt(minHp)}</span>` : ''}
        </div>
        <button class="export-btn" type="button">⬇ Export to Sixty Upgrades</button>
      </div>
    </div>
    ${buffNote(r.buffImpact)}
    ${doll}
    ${socketNote}
    ${metaWarn ? `<div class="metawarn">${metaWarn}</div>` : ''}
    ${exportNote}
    ${panels}
  </div>`;
}

init();
