// Web UI for the Tankadin Gear Sim. Runs the same optimizer the CLI uses (src/runner.js),
// entirely client-side: parse the pasted/uploaded export -> optimizeSets -> render four sets.
import { parseExport, equippableItems } from '../src/import.js';
import { toExportText } from '../src/savedvars.js';
import { optimizeSets, spellHitPct, GOAL_PRESETS } from '../src/runner.js';
import { PROFESSION_NAMES } from '../src/professions.js';
import { GEMS, META_GEMS } from '../src/gems.js';
import { detectFaction } from '../src/enchants.js';
import { missChance } from '../src/combat.js';
import { libramStats } from '../src/librams.js';
import { procStats } from '../src/procs.js';
import { SCROLLS } from '../src/scrolls.js';
import { SCALES, PARTS } from '../src/weights.js';
import { SET_BONUS_STATS } from '../src/sets.js';
import { CHARACTER, TALENTS, BUFFS } from '../src/model.js';
import { CAPS, BASE, RATING, THREAT, ARMOR_CONST, crushTargetFor, crushSafeTargetFor } from '../src/constants.js';
import { BIS, BIS_PHASES } from './bis.js';
import { BIS_ITEM_DB } from './bis-items.js';

const $ = (id) => document.getElementById(id);
// The companion guide every constant/scale is transcribed from.
const GUIDE_URL = 'https://npc6388.github.io/wow-tbc-prot-paladin-guide/';
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
// uncrit/uncrush. 10k = effectively off.
const MINHP = { min: 10000, max: 20000, step: 500 };
// Per-goal UI defaults: starting slider value (v) and Min-HP floor (minHP: null = no Min-HP gate /
// no slider for that goal). The Balanced slider is special — it slides between the SURVIVAL set
// (left) and the RAID THREAT set (right), so it has no fixed ratio of its own and no Min-HP floor.
const UI_DEFAULTS = {
  raid:     { v: 3,    minHP: 11500 }, // EHP 1 : 4 Threat
  survival: { v: -0.5, minHP: 14000 }, // EHP 1.5 : 1 Threat
  aoe:      { v: 3,    minHP: 10500 }, // EHP 1 : 4 AOE Threat
  balanced: { v: 0,    minHP: null  }, // midpoint of Survival ↔ Raid Threat; no Min-HP
};
const isBalanced = (id) => id === 'balanced';
const fmtHp = (h) => (h / 1000).toFixed(1) + 'k';
const fmtMinHp = (h) => (h <= MINHP.min ? 'off' : fmtHp(h)); // the 10k floor means "no Min-HP gate" — say so
const fmtW = (w) => (Number.isInteger(w) ? String(w) : w.toFixed(1));
function ratioFor(id, v) {
  const { left, right } = GOAL_SIDES[id];
  const Lw = v < 0 ? 1 - v : 1, Rw = v > 0 ? 1 + v : 1;
  return { left, right, Lw, Rw, ratio: { [left]: Lw, [right]: Rw } };
}
const ratioText = (id, v) => { const r = ratioFor(id, v); return `${AXIS_LABEL[r.left]} ${fmtW(r.Lw)} : ${fmtW(r.Rw)} ${AXIS_LABEL[r.right]}`; };
// Balanced slider value v in [-3,3] -> blend fraction t in [0,1] (0 = full Survival, 1 = full Raid Threat).
const balanceT = (v) => (v + 3) / 6;
const balancedText = (v) => {
  const thr = Math.round(balanceT(v) * 100);
  return thr === 50 ? 'midpoint · 50% Survival / 50% Threat' : `${100 - thr}% Survival / ${thr}% Threat`;
};
const defaultVOf = (id) => (UI_DEFAULTS[id] ? UI_DEFAULTS[id].v : 0);
// Balanced's derived Min-HP readout = its floor blended from the Survival & Raid Min-HP sliders.
function updateBalMinHP() {
  const row = $('goalConfig') && $('goalConfig').querySelector('.goal-row[data-goal="balanced"]');
  const el = row && row.querySelector('.bal-minhp'); if (!el) return;
  const t = balanceT(+row.querySelector('.ratio-slider').value);
  const hp = (id) => { const s = $('goalConfig').querySelector(`.goal-row[data-goal="${id}"] .minhp-slider`); return s ? +s.value : 0; };
  el.textContent = fmtMinHp(Math.round(hp('survival') + (hp('raid') - hp('survival')) * t));
}

let items = null;        // equippable items from the export
let parsed = null;       // full parse (character + items)
let exportRaw = '';      // raw TGS export text (from the uploaded .lua) — kept here, not in a DOM field
let activeTab = 0;
let lastResults = null;  // last optimize results (for the per-set lock button)
let loadedSample = false; // true while the displayed results are the demo character (drives the "use your own gear" CTA)
let faction = null;      // Aldor/Scryer, auto-detected from the equipped shoulder inscription
const lockedItemIds = new Set(); // item-ids whose gems/enchants are kept across every set
const pinnedSlots = {};  // goalId -> { slotKey: itemId } — items forced into a slot for that set
const excludedItemIds = new Set(); // item-ids dropped from EVERY set (inverse of pin)
// BiS items the player DOESN'T own but added to the sim for planning ("pretend I own this"). Built
// from BIS_ITEM_DB and folded into the optimizer pool exactly like owned gear; removable via banner.
const virtualItems = new Map(); // itemId -> synthetic item

// Build a synthetic owned-style item from the BiS stat DB so a not-owned BiS pick can be optimized.
function buildSyntheticItem(id) {
  const d = BIS_ITEM_DB[id];
  if (!d || !d.slot) return null;
  const item = {
    itemId: id, name: d.name, slot: d.slot,
    stats: { ...d.stats }, baseStats: { ...d.stats },
    sockets: d.sockets ? { ...d.sockets } : {},
    socketBonus: null, equipped: false, _virtual: true,
  };
  const lib = libramStats(item); // model a libram's threat effect, like import.js does for owned gear
  if (lib) { item.stats = lib; item.baseStats = { ...lib }; }
  // ...and a proc trinket's uptime-averaged buff, also like import.js (ADDITIVE, not an override).
  const proc = procStats(item);
  if (proc) {
    item.procStats = proc;
    for (const [k, v] of Object.entries(proc)) {
      item.stats[k] = (item.stats[k] || 0) + v;
      item.baseStats[k] = (item.baseStats[k] || 0) + v;
    }
  }
  return item;
}
// The optimizer pool = owned gear + any planning items. Owned `items` stays owned-only (drives the
// "you own this" tags); virtual items only join at optimize time.
const optimizerPool = () => (items || []).concat([...virtualItems.values()]);
const isPlanned = (id) => virtualItems.has(id);
// Remove a planning item and drop any pin pointing at it.
function removeVirtual(id) {
  virtualItems.delete(id);
  for (const g of Object.values(pinnedSlots)) for (const s of Object.keys(g)) if (g[s] === id) delete g[s];
}

// ---- setup ------------------------------------------------------------------
function init() {
  for (const sel of [$('prof1'), $('prof2')]) {
    sel.innerHTML = '<option value="">— none —</option>' + PROFESSION_NAMES.map((p) => `<option>${p}</option>`).join('');
  }
  $('prof1').value = 'Enchanting';

  // The encounter presets (Illy/SWP) are fixed threat-max sets, not user-tunable — they always compute
  // and appear in the results, but have no ratio/Min-HP knob here.
  $('goalConfig').innerHTML = GOAL_PRESETS.filter((g) => !g.enc).map((g) => {
    const bal = isBalanced(g.id);
    const { left, right } = GOAL_SIDES[g.id];
    const v = defaultVOf(g.id);
    const leftLbl = bal ? 'Survival' : AXIS_LABEL[left];
    const rightLbl = bal ? 'Threat' : AXIS_LABEL[right];
    const step = bal ? 0.25 : 0.5; // Balanced blend dial: 24 increments over [-3,3] (halved from 48)
    const readout = bal ? balancedText(v) : ratioText(g.id, v);
    const minHP = UI_DEFAULTS[g.id] ? UI_DEFAULTS[g.id].minHP : 10000;
    // Balanced has no Min-HP knob — its floor is DERIVED (blended from your Survival & Raid floors),
    // shown read-only so the survival end is as tanky as the survival set.
    const minhpCell = minHP == null
      ? `<div class="minhp-cell"><span class="minhp-label muted">Min HP (derived)</span><span class="minhp-val bal-minhp">—</span></div>`
      : `<div class="minhp-cell">
        <button class="minhp-label mh-btn" type="button" data-dir="-1" title="Lower Min HP">Min HP</button>
        <input type="range" class="minhp-slider" min="${MINHP.min}" max="${MINHP.max}" step="${MINHP.step}" value="${minHP}" />
        <button class="minhp-val mh-btn" type="button" data-dir="1" title="Raise Min HP">${fmtMinHp(minHP)}</button>
      </div>`;
    // Balanced isn't a fourth independent goal — it's a meta-dial OVER the Survival and Raid sets. Set
    // it apart (full-width row, divider, caption) so the different mental model reads clearly.
    const caption = bal ? `<div class="bal-caption">A blend dial over your Survival &amp; Raid sets — the ends reproduce them, the middle splits the difference.</div>` : '';
    return `<div class="goal-row${bal ? ' bal' : ''}" data-goal="${g.id}">
      <span class="name">${g.name}</span>
      <div class="slider-cell">
        <div class="slider-wrap">
          <button class="end left" type="button" title="Nudge toward ${leftLbl}">◂ ${leftLbl}</button>
          <input type="range" class="ratio-slider" min="-3" max="3" step="${step}" value="${v}" />
          <button class="end right" type="button" title="Nudge toward ${rightLbl}">${rightLbl} ▸</button>
        </div>
        <div class="ratio">${readout}</div>
        ${caption}
      </div>
      ${minhpCell}
    </div>`;
  }).join('');
  // The slider updates its readout (Balanced shows the Survival↔Threat blend); Min-HP updates its kHP.
  $('goalConfig').querySelectorAll('.ratio-slider').forEach((r) => {
    const id = r.closest('.goal-row').dataset.goal;
    r.addEventListener('input', (e) => {
      const txt = isBalanced(id) ? balancedText(+e.target.value) : ratioText(id, +e.target.value);
      e.target.closest('.slider-cell').querySelector('.ratio').textContent = txt;
      if (isBalanced(id)) updateBalMinHP(); // Balanced's derived floor shifts as its blend moves
      scheduleLiveUpdate(); // re-optimize live so the numbers track the slider
    });
  });
  $('goalConfig').querySelectorAll('.minhp-slider').forEach((r) => {
    r.addEventListener('input', (e) => {
      e.target.closest('.minhp-cell').querySelector('.minhp-val').textContent = fmtMinHp(+e.target.value);
      updateBalMinHP(); // Survival/Raid floors feed Balanced's derived floor
      scheduleLiveUpdate();
    });
  });
  // The EHP/Threat end labels are buttons: clicking nudges the slider one step that way.
  $('goalConfig').querySelectorAll('button.end').forEach((b) => b.addEventListener('click', () => {
    const slider = b.closest('.slider-wrap').querySelector('.ratio-slider');
    const dir = b.classList.contains('right') ? 1 : -1;
    slider.value = (+slider.value + dir * (+slider.step)).toFixed(2); // range input clamps to min/max
    slider.dispatchEvent(new Event('input'));
  }));
  // The "Min HP" label and its kHP value are also nudge buttons (down / up by one step).
  $('goalConfig').querySelectorAll('.mh-btn').forEach((b) => b.addEventListener('click', () => {
    const slider = b.closest('.minhp-cell').querySelector('.minhp-slider');
    if (!slider) return;
    slider.value = String(+slider.value + (+b.dataset.dir) * (+slider.step)); // range input clamps
    slider.dispatchEvent(new Event('input'));
  }));
  updateBalMinHP();

  $('scrolls').innerHTML = Object.entries(SCROLLS).map(([key, s]) => {
    const amt = s.flat ? `+${s.value} armor` : `+${s.value} ${s.stat}`;
    return `<label class="check"><input type="checkbox" class="scroll-cb" value="${key}" /> ${s.name} <span class="muted">(${amt})</span></label>`;
  }).join('');

  $('exportFile').addEventListener('change', handleFile);
  $('loadSample').addEventListener('click', loadSample);
  // CTA under the results: open the "use your own gear" section and jump to it.
  $('useOwnBtn').addEventListener('click', () => {
    const og = $('ownGear');
    og.open = true;
    og.classList.add('nudge'); // walk the guided arrow to the "use your own gear" dropdown
    og.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  // The "About the ecosystem" hub screenshots are placeholders until a human captures them (docs/assets).
  // Hide any that fail to load so the live page never shows broken-image icons.
  document.querySelectorAll('#about-panel img').forEach((img) => {
    const hide = () => { const fig = img.closest('figure'); (fig || img).style.display = 'none'; };
    if (img.complete && img.naturalWidth === 0) hide();
    img.addEventListener('error', hide);
  });
  $('talents').addEventListener('input', updateTalentSummary);
  // Phase drives gem availability AND the per-slot BiS reference list, so re-optimize on change
  // (re-renders with the new phase's gems + BiS list) rather than waiting for the next Optimize.
  $('phase').addEventListener('change', scheduleLiveUpdate);
  $('optimizeBtn').addEventListener('click', runOptimize);
  $('shareBtn').addEventListener('click', copyShareLink);
  document.querySelectorAll('.guide-link').forEach((a) => { a.href = GUIDE_URL; }); // header/footer guide links
  // Clicking any glossary term opens the full "How the sim works" panel and jumps to it.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.term')) return;
    const d = document.querySelector('#logic-panel details'); if (d) d.open = true;
    $('logic-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  renderWeights();
  renderLogic();
  setStep(1); // guide arrow starts on "1 · Your gear"
  restoreFromHash(); // if opened via a share link, rebuild the gear + settings and optimize
}

// Guide the eye through the flow: a left-side arrow marks the panel to act on next — gear (1) → setup
// (2, after you load a file) → results (3, after Optimize). Purely a cue; every panel stays usable.
function setStep(n) {
  for (const [id, s] of [['input-panel', 1], ['config-panel', 2], ['results-panel', 3]]) {
    const el = $(id); if (el) el.classList.toggle('step-active', s === n);
  }
}

// ---- shareable link ---------------------------------------------------------
// The whole optimization (gear + every setting + goal sliders + pins/locks) is serialized, gzipped and
// base64url-encoded into the URL hash — entirely client-side, so a player can drop a link in Discord and
// the recipient reopens the exact sets. Nothing is uploaded; the gear lives in the link itself.
const b64urlEnc = (bytes) => {
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDec = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
async function deflateToHash(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return 'u' + b64urlEnc(bytes); // older browser: store uncompressed
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return 'g' + b64urlEnc(new Uint8Array(ab));
}
async function inflateFromHash(h) {
  const bytes = b64urlDec(h.slice(1));
  if (h[0] === 'u') return JSON.parse(new TextDecoder().decode(bytes));
  const txt = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(txt);
}

// Slim the export down to GEAR before sharing: a full bag/bank dump is mostly food, ore, coins and
// quest items the optimizer ignores anyway, and they bloat the link. Keep the header + every equipped
// piece + inventory items that occupy a real gear slot; drop the non-equippable noise.
const SHARE_DROP = /\|INVTYPE_(NON_EQUIP_IGNORE|BAG|QUIVER|AMMO|TABARD|BODY)\b/;
function slimExport(raw) {
  return toExportText(raw).split('\n').filter((line) => !(line.startsWith('I:') && SHARE_DROP.test(line))).join('\n');
}

// Gather everything needed to reproduce the current optimization.
function captureState() {
  const goalState = {};
  for (const g of GOAL_PRESETS) {
    const row = $('goalConfig').querySelector(`.goal-row[data-goal="${g.id}"]`);
    if (!row) continue;
    const rs = row.querySelector('.ratio-slider'), ms = row.querySelector('.minhp-slider');
    goalState[g.id] = { v: rs ? +rs.value : 0, ...(ms ? { hp: +ms.value } : {}) };
  }
  return {
    v: 1, x: slimExport(exportRaw),
    p: [$('prof1').value, $('prof2').value], b: $('statBuff').value, ph: $('phase').value,
    k: $('keepScope').value, im: $('imbuedMeta').checked ? 1 : 0,
    sc: [...document.querySelectorAll('.scroll-cb:checked')].map((c) => c.value),
    li: $('lockIcon').value, le: $('lockEye').value, t: $('talents').value,
    g: goalState, pin: pinnedSlots, ex: [...excludedItemIds], lk: [...lockedItemIds], tab: activeTab,
    vi: [...virtualItems.keys()], // BiS planning items (rebuilt from BIS_ITEM_DB by id)
  };
}

// Rebuild the UI from a captured state and re-optimize.
function applyState(s) {
  if (!s || !s.x) return;
  exportRaw = s.x;
  loadedSample = false;
  tryParse(s.x); // parses gear, populates trinket options + faction, auto-fills talents
  if (!items) return;
  const set = (id, val) => { if (val != null) $(id).value = val; };
  set('prof1', s.p && s.p[0]); set('prof2', s.p && s.p[1]);
  set('statBuff', s.b); set('phase', s.ph); set('keepScope', s.k);
  $('imbuedMeta').checked = !!s.im;
  document.querySelectorAll('.scroll-cb').forEach((c) => { c.checked = (s.sc || []).includes(c.value); });
  set('lockIcon', s.li); set('lockEye', s.le);
  if (s.t != null) { $('talents').value = s.t; updateTalentSummary(); }
  for (const g of GOAL_PRESETS) {
    const gs = (s.g || {})[g.id]; if (!gs) continue;
    const row = $('goalConfig').querySelector(`.goal-row[data-goal="${g.id}"]`); if (!row) continue;
    const rs = row.querySelector('.ratio-slider'), ms = row.querySelector('.minhp-slider');
    if (rs && gs.v != null) { rs.value = gs.v; row.querySelector('.ratio').textContent = isBalanced(g.id) ? balancedText(+rs.value) : ratioText(g.id, +rs.value); }
    if (ms && gs.hp != null) { ms.value = gs.hp; row.querySelector('.minhp-val').textContent = fmtMinHp(+ms.value); }
  }
  updateBalMinHP();
  for (const k of Object.keys(pinnedSlots)) delete pinnedSlots[k];
  Object.assign(pinnedSlots, s.pin || {});
  excludedItemIds.clear(); (s.ex || []).forEach((id) => excludedItemIds.add(id));
  lockedItemIds.clear(); (s.lk || []).forEach((id) => lockedItemIds.add(id));
  virtualItems.clear(); (s.vi || []).forEach((id) => { const it = buildSyntheticItem(id); if (it) virtualItems.set(id, it); });
  activeTab = s.tab || 0;
  runOptimize(true); // optimize + scroll to results
}

async function copyShareLink() {
  const btn = $('shareBtn');
  try {
    const hash = await deflateToHash(captureState());
    history.replaceState(null, '', '#s=' + hash); // bookmarkable too
    const url = location.href;
    const done = () => { const t = btn.textContent; btn.textContent = '✓ Link copied'; setTimeout(() => { btn.textContent = t; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this share link:', url));
    else window.prompt('Copy this share link:', url);
  } catch { window.prompt('Copy this share link:', location.href); }
}

function restoreFromHash() {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  if (!m) return;
  inflateFromHash(m[1]).then(applyState).catch(() => setStatus('This share link could not be read.', 'err'));
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
  { key: 'survivalEHP', label: 'Survival — EHP / Farm', note: 'beyond the cap — stamina-led, avoidance below it' },
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
// Sixty Upgrades accepts the full key set this sim uses (a player's working survival scale even
// includes blockValueBonus), so the JSON is simply the scale's non-zero entries.
const nonZeroEntries = (key) => Object.entries(SCALES[key]).filter(([, v]) => v !== 0);
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

// "How the sim works" explainer — rendered from the LIVE constants/scales so it can never drift from
// the engine. Every number below is interpolated from the same modules the optimizer uses; tune a
// constant and this box updates with it.
function renderLogic() {
  const host = $('logicBody'); if (!host) return;
  const R = RATING, P = PARTS.ehp;
  const kings = BUFFS.kingsMult.toFixed(2);
  const motw = BUFFS.markOfTheWild.stamina;
  const impRfPct = Math.round((TALENTS.impRighteousFuryDR || 0) * 100);
  const toughPct = Math.round((TALENTS.toughnessItemArmorMult - 1) * 100);
  const staPct = Math.round((TALENTS.staminaMult - 1) * 100);
  const avoidVsBlock = (P.dodgeRating / P.blockRating).toFixed(1);
  const defBenefitPct = BASE.defenseBenefitPerSkill; // already a %
  const j2 = SET_BONUS_STATS.justicar2pc.spellDamage;
  const j4 = SET_BONUS_STATS.justicar4pc.spellDamage;
  const c2 = SET_BONUS_STATS.crystalforge2pc.spellDamage;
  host.innerHTML = `
    <p class="muted">Everything runs in your browser as a <strong>first-principles forward model</strong>:
      <code>final = race/class base + talents + gear + buffs</code>, using real TBC constants — no
      back-fitting to a sheet. <em>The numbers below are read live from the engine, so they always match
      what the optimizer actually uses.</em></p>

    <h4>1 · The character model</h4>
    <ul>
      <li><strong>Stats:</strong> base (level-70 Blood Elf Paladin) + gear (summed item stats, gems &amp; enchants baked in) + flat buffs, then <strong>Blessing of Kings ×${kings}</strong> on the four primaries (applied <em>after</em> flat buffs like Mark of the Wild's +${motw}). Kings and MotW stack (percentage + flat).</li>
      <li><strong>Talents</strong> (read from your export) at the guide's max ranks: Anticipation +${TALENTS.anticipationDefenseSkill} defense, Deflection +${TALENTS.deflectionParryPct}% parry, Toughness +${toughPct}% item armor, +${staPct}% stamina (Sacred Duty + Combat Expertise), Precision +${TALENTS.precisionSpellHitPct}% hit, Improved Righteous Fury −${impRfPct}% damage taken.</li>
      <li><strong>Rating → %:</strong> defense ${R.defensePerSkill}/skill, dodge ${R.dodgePer1}/1%, parry ${R.parryPer1}/1%, block ${R.blockPer1}/1%, spell hit ${R.spellHitPer1}/1%, resilience ${R.resiliencePer1} per 1% crit reduction. Defense skill above ${BASE.baseDefenseSkill} gives <strong>+${defBenefitPct}%</strong> each to miss/dodge/parry/block and crit-avoidance.</li>
      <li><strong>Health:</strong> first 20 stamina = 1 HP each, the rest ×${CHARACTER.hpPerStamina}. Armor from items (×Toughness) + 2/agility.</li>
    </ul>

    <h4>2 · The hard gates (constraints, not weights)</h4>
    <p class="muted">Every set must satisfy these <em>before</em> any stat is maximized — pass/fail, not scored:</p>
    <ul>
      <li><strong>Uncrittable</strong> — a level-${BASE.raidBossLevel} raid boss has +${BASE.bossCritVsPlayer}% crit on you; defense (over ${BASE.baseDefenseSkill}, ×${defBenefitPct}%) + resilience must cover it (≈${CAPS.defenseSkillRaid} defense, or any defense+resilience mix reaching ${BASE.bossCritVsPlayer}%).</li>
      <li><strong>Uncrushable</strong> — miss + dodge + parry + block must total <strong>≥ ${CAPS.uncrushableCombined}%</strong> with Holy Shield up (+${THREAT.holyShieldActive}% block, more with the block libram). AOE Trash drops this gate (level ≤72 mobs can't deal crushing blows). The encounter sets adjust it — <strong>Illidan</strong> needs dodge+parry+block ≥ ${CAPS.shearAvoidanceTarget}% (Shear can't miss, so miss doesn't count), while the <strong>Sunwell</strong> &amp; <strong>Brutallus</strong> sets relax it (only Lady Sacrolash lands crushing blows in Sunwell). See §5.</li>
      <li><strong>Min HP</strong> — a raid-buffed health floor you set per goal (10k = effectively off).</li>
    </ul>

    <h4>3 · Survival / EHP</h4>
    <ul>
      <li><strong>Physical EHP</strong> = health ÷ (1 − armor DR) ÷ (1 − Imp RF). Armor DR is the standard TBC formula (Armor / (Armor + ${ARMOR_CONST()}) vs a level-${BASE.raidBossLevel} boss, capped 75%); the ${impRfPct}% Improved Righteous Fury reduction folds in as a flat multiplier.</li>
      <li><strong>Avoidance is NOT multiplied into EHP.</strong> Dodge/parry/miss have diminishing returns — they smooth the <em>average</em> but not the consecutive-hit spikes that kill a tank — so EHP is the raw pool behind armor, and avoidance is valued in the weight scales instead.</li>
      <li><strong>Beyond the uncrush cap, full avoidance beats block (~${avoidVsBlock}× here).</strong> A dodge/parry/miss negates a whole ~5k hit; a block only shaves block-value (~275) off a hit that lands. (Reaching the cap is different — there block <em>chance</em> is prized because it fills the attack table toward ${CAPS.uncrushableCombined}%.)</li>
    </ul>

    <h4>4 · Threat</h4>
    <ul>
      <li>Threat is anchored to <strong>spell power</strong>. Per-ability threat (Consecration, Holy Shield, Avenger's Shield, Judgements, Seals, Retribution/Sanctuary) is modeled from the guide's formulas, all amplified by <strong>Righteous Fury ×${THREAT.righteousFury}</strong> and Improved Holy Shield ×${THREAT.improvedHolyShieldDmg.toFixed(2)}.</li>
      <li>Below the spell-hit cap (${CAPS.spellHitCapPct}% vs a raid boss) and expertise soft-cap (${CAPS.expertiseSoftCap}), hit/expertise are valued for the missed threat they recover; at cap they're zeroed.</li>
      <li><strong>Tier set bonuses are scored</strong> as spell-power-equivalents (Justicar 2pc +10% seal ≈ ${j2} SP, 4pc ≈ ${j4}, Crystalforge 2pc ≈ ${c2}), so the optimizer values completing a 2pc/4pc — weighed by the goal, so it matters on threat sets and barely registers on survival.</li>
    </ul>

    <h4>5 · The sets &amp; the sliders</h4>
    <p class="muted">Caps are gates; the sliders tune how the leftover budget is spent <em>beyond</em> them. The four <strong>core</strong> sets are tunable: Raid Threat, Survival and AOE Trash each blend an EHP component and a threat component in the ratio you set (e.g. EHP 1 : Threat 4), with their own Min-HP floor (AOE also uses AOE-threat weighting and drops the crush gate). <strong>Balanced is a blend dial:</strong> its slider slides between your Survival set (left) and your Raid Threat set (right), interpolating their ratios AND their Min-HP floors (and taking the nearer side's 2nd-trinket lock) — so the ends reproduce those two sets and the middle splits the difference. It has no Min-HP knob of its own; the floor shown is derived from your two sets.</p>
    <p class="muted">Three <strong>encounter sets</strong> are always on (fixed ratios, no sliders); each gates on the avoidance <em>that fight</em> actually leaves you, so a set that's uncrushable on a normal boss can still fall short there:</p>
    <ul>
      <li><strong>Illidan</strong> (P3) — Shear can't miss, so it's avoided at <strong>dodge + parry + block ≥ ${CAPS.shearAvoidanceTarget}%</strong> with Holy Shield (miss excluded, so it needs <em>more</em> raw avoidance than a normal boss). Leans threat with the surplus over the gate.</li>
      <li><strong>Sunwell</strong> (P5, general) — in Sunwell only <strong>Lady Sacrolash</strong> lands crushing blows, and a core Survival set covers her, so the crush gate is <strong>relaxed</strong> for the tier. The focus is effective health, but the EHP scale still weights dodge/parry/defense heavily, so it keeps high avoidance too. It displays the <strong>Sunwell Radiance</strong>-reduced avoidance (−${CAPS.sunwellDodgeReduction} dodge, boss +${CAPS.sunwellHitReduction}% hit), ungated, as a reference.</li>
      <li><strong>Brutallus</strong> (P5) — a high effective-health <em>goal</em> (aim &gt;20k HP raid-buffed): the crush gate is off and the ratio is pushed to pure survival (EHP + extra stamina, no threat), so it takes all the EHP it can get while still keeping the avoidance the EHP scale values.</li>
    </ul>

    <h4>6 · Gems, enchants &amp; metas</h4>
    <ul>
      <li><strong>Per-item socket-bonus worth-it:</strong> for each socketed piece the sim compares filling every socket with the globally best gem (forfeit the bonus) vs colour-matching to earn the socket bonus, and keeps whichever scores higher. Gems are tagged by the <em>socket colour</em> to place them in, since the export's socket order is unreliable.</li>
      <li><strong>Gemming is a lever for the caps:</strong> each socketed item enters as a focus variant (goal gems) and a cap variant (avoidance/defense gems), so the optimizer can keep a higher-threat item and def-gem it when that beats a tankier swap. Once uncrushable it stops over-gemming capped avoidance.</li>
      <li><strong>Meta activation</strong> is checked against the whole set's gem colours; a colour-gated meta is enabled by recolouring the cheapest focus sockets, and a final pass verifies every meta still activates after item swaps — an inactive kept meta is flagged and not credited its stats.</li>
      <li><strong>Enchants</strong> are profession- and faction-aware (faction auto-detected from your shoulder inscription); <strong>scrolls</strong> add flat stats that help meet the gates with less gear.</li>
    </ul>

    <h4>7 · What you can override</h4>
    <ul>
      <li><strong>Equip</strong> any item (the pick, an "≈ also viable" alternate, or an owned item from the BiS list) to force it into a slot and re-optimize the rest around it.</li>
      <li><strong>Keep gems/enchants</strong> to preserve committed pieces across sets; <strong>lock trinkets</strong> the model can't score (procs/on-use).</li>
      <li>Each slot's dropdown also lists a <strong>community BiS</strong> reference (Wowhead's per-phase tank lists) for the selected Content phase — a "what to chase" pointer, independent of your gear and never auto-selected. Owned BiS items can be equipped; the rest just link out. (Hand-curated exceptions the auto-scrape misses, like Tome of Fiery Redemption — whose threat proc <em>is</em> scored, at its measured raid uptime — are flagged with a note.)</li>
      <li>The stat-weight scales above are the same valuations, exported for Sixty Upgrades — but the sim enforces the caps as gates, which a flat weight list can't.</li>
    </ul>

    <p class="muted">All values are transcribed from the <a href="${GUIDE_URL}" target="_blank" rel="noopener">TBC Prot Paladin guide</a> and live in <code>constants.js</code>, <code>weights.js</code>, <code>threat.js</code>, <code>sets.js</code>. Caveat: the model can't score proc/on-use trinket effects or unusual fight mechanics — those stay your call.</p>`;
}

// Talent string -> points per tree (split on "-", sum the rank digits in each segment).
function updateTalentSummary() {
  const trees = $('talents').value.trim().split('-');
  const sums = trees.length >= 2 ? trees.map((t) => [...t].reduce((a, ch) => a + (+ch || 0), 0)) : null;
  $('talentSummary').textContent = sums ? `— ${sums[0] || 0} / ${sums[1] || 0} / ${sums[2] || 0}` : '';
}

function setStatus(msg, kind = '') { const el = $('inputStatus'); el.textContent = msg; el.className = 'status ' + kind; }

// Default the two profession dropdowns from the export's `P:` line (v12+). These gate real
// recommendations — JC-only gems, the Enchanting ring enchants, the LW bracer, BS sockets — so
// guessing "Enchanting" for everyone quietly hands some players enchants they cannot apply, and
// denies others perks they have. They stay ordinary dropdowns: this sets the default, the player
// overrides it whenever they like (and a shared/restored state re-applies their choice afterwards).
//   null  = export predates v12 -> leave whatever is selected (the old Enchanting default)
//   []    = the addon looked and found none we model -> clear both, which is the honest answer
function applyDetectedProfessions(profs) {
  const readout = $('profReadout');
  if (!Array.isArray(profs)) {
    if (readout) {
      readout.textContent = 'Not in this export — update the addon to detect them';
      readout.classList.add('muted');
    }
    return;
  }
  const known = profs.filter((p) => PROFESSION_NAMES.includes(p)).slice(0, 2);
  $('prof1').value = known[0] || '';
  $('prof2').value = known[1] || '';
  if (readout) {
    readout.textContent = known.length ? `${known.join(' + ')} (from your character)` : 'None detected';
    readout.classList.toggle('muted', !known.length);
  }
}

function tryParse(text) {
  const raw = (text || '').trim();
  if (!raw) { items = null; $('optimizeBtn').disabled = true; setStatus(''); return; }
  try {
    parsed = parseExport(toExportText(raw));
    items = equippableItems(parsed);
    faction = detectFaction(items);
    $('factionReadout').classList.remove('muted');
    $('factionReadout').textContent = faction ? `${faction} (from shoulder inscription)` : 'Unknown — considering both';
    populateTrinketLocks();
    applyDetectedProfessions(parsed.professions);
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
  $('ownGear').classList.remove('nudge'); // they're uploading — retire the guided arrow
  const text = await file.text();
  exportRaw = text;
  $('ownGear').open = true; // keep the upload section in view
  loadedSample = false; // user's own gear — hide the sample CTA
  tryParse(text);
  // Don't auto-optimize: the player picks their locked (proc/on-use) trinkets first, THEN hits Optimize.
  if (items && items.length) { setStep(2); promptTrinketChoice(); } // move the guide arrow to Setup
}

async function loadSample() {
  try {
    const res = await fetch('web/sample-export.txt');
    if (!res.ok) throw new Error('sample not found');
    const text = await res.text();
    exportRaw = text;
    tryParse(text);
    loadedSample = true; // showing the demo character — surface the "use your own gear" CTA under the results
    if (items && items.length) {
      populateTrinketLocks(); // defaults to the demo's currently-equipped trinkets, like any loaded character
      runOptimize(true); // land on results immediately — the whole point of the demo
    }
  } catch { setStatus('Could not load the example file.', 'err'); }
}

// Fill the two trinket-lock dropdowns from the loaded gear, defaulting each to the player's CURRENTLY
// EQUIPPED trinkets — the model can't score proc/on-use trinkets, so it keeps whatever you're wearing
// unless you change these. "— none —" frees the slot for the optimizer to pick a scoreable trinket.
function populateTrinketLocks() {
  const trinkets = items.filter((it) => it.slot === 'trinket');
  const equipped = trinkets.filter((t) => t.equipped); // the two you're wearing (from the export's E: lines)
  const opts = '<option value="">— none —</option>' +
    trinkets.map((t) => `<option value="${t.itemId}">${t.name || t.itemId}</option>`).join('');
  const set = (sel, defId) => {
    const el = $(sel); el.innerHTML = opts; el.disabled = false; // enable now that real trinkets exist
    el.value = defId ? String(defId) : '';
  };
  set('lockIcon', equipped[0] && equipped[0].itemId);
  set('lockEye', equipped[1] && equipped[1].itemId);
}

// After a player loads THEIR OWN gear, draw attention to the locked trinkets as the next step:
// scroll to the top of the Setup box and flash the Locked-trinkets field. (Defaults to your equipped
// trinkets; the model can't score proc/on-use ones, so confirm or change them here.)
function promptTrinketChoice() {
  $('config-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const wrap = $('lockIcon').closest('.field');
  if (wrap) { wrap.classList.remove('flash'); void wrap.offsetWidth; wrap.classList.add('flash'); }
  $('lockIcon').focus({ preventScroll: true });
}

// ---- run --------------------------------------------------------------------
function currentGoals() {
  const vOf = (id) => +$('goalConfig').querySelector(`.goal-row[data-goal="${id}"] .ratio-slider`).value;
  const minhpOf = (id) => { const el = $('goalConfig').querySelector(`.goal-row[data-goal="${id}"] .minhp-slider`); return el ? +el.value : 0; };
  const ratioOf = (id) => ratioFor(id, vOf(id)).ratio; // {ehp, threat} for raid/survival
  const raidRatio = ratioOf('raid'), survRatio = ratioOf('survival');
  const raidHP = minhpOf('raid'), survHP = minhpOf('survival');
  const preset = (id) => GOAL_PRESETS.find((g) => g.id === id);
  return GOAL_PRESETS.map((g) => {
    // Encounter presets aren't tunable (no slider row) — pass the preset straight through with its
    // fixed threat-max ratio and encounter gate.
    if (g.enc) return { ...g };
    const v = vOf(g.id);
    if (isBalanced(g.id)) {
      // Balanced slides between the Survival set (t=0) and the Raid Threat set (t=1). To make the
      // ENDS actually reproduce those sets it inherits the whole config that differs between them —
      // ratio AND Min-HP floor (both blended) AND the Eye-of-Magtheridon trinket lock (Survival
      // leaves it free, Raid forces it; take the nearer side). Balanced has no Min-HP knob of its
      // own — the floor is derived from your two sets, so it's why the survival end is now as tanky.
      const t = balanceT(v);
      const lerp = (a, b) => (a || 0) + ((b || 0) - (a || 0)) * t;
      const ratio = { ehp: lerp(survRatio.ehp, raidRatio.ehp), threat: lerp(survRatio.threat, raidRatio.threat) };
      const minHealth = Math.round(lerp(survHP, raidHP));
      const lockEye = t >= 0.5 ? preset('raid').lockEye : preset('survival').lockEye;
      return { ...g, lockEye, focus: `Survival ↔ Threat · ${balancedText(v)}`, ratio, gates: { ...g.gates, minHealth } };
    }
    const r = ratioFor(g.id, v);
    return { ...g, focus: ratioText(g.id, v), ratio: r.ratio, gates: { ...g.gates, minHealth: minhpOf(g.id) } };
  });
}

// Core optimize + render. `live` skips the button "Optimizing…" toggle and runs synchronously
// (used by the debounced slider-drag updates so the numbers track the sliders without flicker).
function optimizeNow(live) {
  try {
    const professions = [$('prof1').value, $('prof2').value].filter(Boolean);
    const trinketLocks = { icon: num($('lockIcon').value), eye: num($('lockEye').value) };
    const scrolls = [...document.querySelectorAll('.scroll-cb:checked')].map((c) => c.value);
    // On live slider drags, seed each goal from its previous result so incremental nudges climb from
    // the adjacent set (smooth, monotonic) rather than re-optimizing cold. Fresh runs seed from scratch.
    const seeds = (live && lastResults) ? Object.fromEntries(lastResults.map((r) =>
      [r.goal.id, Object.fromEntries(Object.entries(r.selection).filter(([, it]) => it).map(([s, it]) => [s, it.itemId]))])) : undefined;
    const results = optimizeSets(optimizerPool(), {
      professions, buff: $('statBuff').value, maxPhase: +$('phase').value,
      faction, useImbuedMeta: $('imbuedMeta').checked,
      keepGemsEnchants: buildKeepSpec(), scrolls, pins: pinnedSlots, exclude: [...excludedItemIds], seeds,
      talentRanks: parsed.talentRanks, trinketLocks, goals: currentGoals(),
    });
    lastResults = results;
    render(results);
    if (scrollAfterOptimize) { // sample/upload path: bring the results into view (the "aha" moment)
      scrollAfterOptimize = false;
      $('results-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    $('summary').innerHTML = `<p class="status err">${err.message || err}</p>`;
    $('results-panel').hidden = false;
  } finally {
    if (!live) { $('optimizeBtn').disabled = false; $('optimizeBtn').textContent = 'Optimize'; }
  }
}

let scrollAfterOptimize = false; // one-shot: scroll to results after the next non-live render
function runOptimize(scroll = false) {
  if (!items) return;
  scrollAfterOptimize = scroll;
  $('optimizeBtn').disabled = true; $('optimizeBtn').textContent = 'Optimizing…';
  setTimeout(() => optimizeNow(false), 20);
}

// Live re-optimize as the goal sliders move — debounced so dragging stays smooth (only fires after a
// short pause). Runs as soon as gear is loaded: dragging a slider before any explicit Optimize used to
// do nothing (felt broken), so now the first drag optimizes too (seeding only kicks in once there's a
// prior result to climb from).
let liveTimer = null;
function scheduleLiveUpdate() {
  if (!items) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => optimizeNow(true), 150);
}
const num = (v) => (v ? +v : null);

// Build optimizeSets.keepGemsEnchants from the scope dropdown PLUS the per-set "lock these items"
// list. The scope (equipped/all/current) and the explicit item-ids are OR-combined by keepConfig.
function buildKeepSpec() {
  const scope = $('keepScope').value;
  if (scope === 'all') return true;                       // every completed item — ids are redundant
  const spec = {};
  if (scope === 'equipped') spec.equippedOnly = true;     // worn completed items
  else if (scope === 'current') { spec.equippedOnly = true; spec.ignoreCompleteness = true; } // worn, even unfinished
  if (lockedItemIds.size) spec.itemIds = [...lockedItemIds];
  return Object.keys(spec).length ? spec : false;         // 'off' + no locks -> re-gem everything
}

// ---- render -----------------------------------------------------------------
// Point-of-use glossary: the sim's vocabulary (EHP, the gates, def-gemmed…) is second nature to a
// theorycrafter but opaque to most raiders. term() wraps a label in a hover definition (dotted
// underline) that also jumps to the full "How the sim works" panel on click — so the jargon stays
// precise (a credibility signal) while newcomers can decode it in place.
const GLOSSARY = {
  ehp: 'EHP (Effective HP) — your health divided by physical damage reduction (armor + Improved Righteous Fury). The raw pool behind your mitigation; bigger means more burst survived. Avoidance is NOT folded in — it smooths averages, not the spike damage that kills tanks.',
  uncrit: 'Uncrittable — a raid boss can’t land a critical hit on you. Needs ~490 defense skill, or any defense+resilience mix covering the boss’s +5.6% crit. A hard gate every set must pass.',
  uncrush: 'Uncrushable — crushing blows (an extra ~50% hit) can’t land. Needs miss + dodge + parry + block ≥ 102.4% with Holy Shield up. A hard gate, dropped on AOE Trash (≤72 mobs can’t crush). The Illidan set gates on 101.8% WITHOUT miss (Shear can’t miss); the Sunwell set on the Radiance-reduced avoidance.',
  minhp: 'Min HP — a raid-buffed health floor you set per goal; the optimizer won’t go below it. 10k = effectively off.',
  defgem: 'Def-gemmed — gemmed for avoidance/defense (not threat) to help reach the uncrittable/uncrushable caps.',
  kept: 'Kept — this item’s existing gems/enchants were preserved (locked), not re-optimized.',
};
const term = (label, key, cls = '') => `<abbr class="term ${cls}" title="${GLOSSARY[key]}">${label}</abbr>`;
const fmt = (n) => Math.round(n).toLocaleString();
// Displayed spell damage = LITERAL gear spell power (what your character sheet and Sixty Upgrades
// read). A modeled libram's Consecration effect and a proc trinket's uptime-averaged buff are valued
// as equivalent spell damage for THREAT scoring, but neither is real +spell-power on the tooltip, so
// they're shown separately (see agg.spellPowerEquiv), not folded into this number.
const litSP = (a) => (a.spellPowerLiteral != null ? a.spellPowerLiteral : a.spellPower);
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
// Each gem cell shows its SOCKET-COLOR chip (the meta chip always shows). Callers pass showColor=true
// so every recommended gem is labelled with the socket it goes in; locked items carry no socket tag.
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

// Wowhead's power.js iconizes + quality-colors item links (iconizeLinks/colorLinks in the config), but
// it only scans the page on load — our results render dynamically afterward, so we ask it to re-scan
// after each render. Retries briefly in case the deferred script hasn't loaded yet (then it self-scans).
let whTimer = null;
function whRefresh() {
  clearTimeout(whTimer);
  const tryRefresh = (n) => {
    try { if (window.$WowheadPower && $WowheadPower.refreshLinks) { $WowheadPower.refreshLinks(); return; } } catch { /* ignore */ }
    if (n > 0) whTimer = setTimeout(() => tryRefresh(n - 1), 400);
  };
  tryRefresh(8);
}

function render(results) {
  $('results-panel').hidden = false;
  setStep(3); // guide arrow moves to the results
  $('useOwnCta').hidden = !loadedSample; // only nudge the addon when they're looking at the demo
  const sh = (r) => spellHitPct(r.agg);
  // Each set's Uncrush column shows the avoidance ITS OWN gate uses: the Illy/SWP encounter sets are
  // gated on the reduced avoidance those fights leave you (Shear ignores miss; Radiance cuts miss+dodge);
  // every other set on the normal 102.4% combined avoidance.
  const encName = '';
  const crushVal = (r) => r.goal.enc === 'sunwell' ? r.evald.swpAvoidance
    : r.goal.enc === 'illidan' ? r.evald.illyAvoidance : r.evald.totalAvoidanceWithHS;

  $('summary').innerHTML = `<table><thead><tr>
      <th>Set</th><th>${term('EHP', 'ehp')}</th><th>Spell&nbsp;dmg</th><th><abbr class="tip" title="Spell-hit cap vs a level-${BASE.raidBossLevel} raid boss is ${CAPS.spellHitCapPct}%. Below it, spell hit recovers missed spell threat; at it, more gives nothing. Hover a set's Spell panel for how far that set is below.">Spell&nbsp;hit</abbr></th><th>Stam</th><th>${term('Uncrush', 'uncrush')}${encName}</th><th>${term('Uncrit', 'uncrit')}</th>
    </tr></thead><tbody>${results.map((r, i) => `<tr class="${i === activeTab ? 'sel' : ''}">
      <td>${r.goal.name}</td><td>${fmt(r.evald.ehpPhysical)}</td><td>${fmt(litSP(r.agg))}${r.agg.spellPowerEquiv ? `<abbr class="equiv" title="+${fmt(r.agg.spellPowerEquiv)} threat-equivalent spell damage from ${r.agg.spellPowerEquivSource || 'a relic effect'} (a libram's +Consecration damage, or a proc trinket's buff averaged over its uptime). Not literal spell power — your character sheet and Sixty Upgrades won't show it.">+${fmt(r.agg.spellPowerEquiv)}</abbr>` : ''}</td>
      <td>${sh(r).toFixed(2)}%</td><td>${fmt(r.agg.stamina)}</td>
      <td>${crushVal(r).toFixed(1)}%</td><td>${yesno(r.evald.raidCritImmune)}</td>
    </tr>`).join('')}</tbody></table>`;

  $('tabs').innerHTML = results.map((r, i) =>
    `<button class="${i === activeTab ? 'active' : ''}" data-i="${i}">${r.goal.name}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { activeTab = +b.dataset.i; render(results); }));

  $('sets').innerHTML = lockedBanner() + excludedBanner() + plannedBanner() + setCard(results[activeTab]);
  const eb = $('sets').querySelector('.export-btn');
  if (eb) eb.addEventListener('click', () => exportSet(results[activeTab], eb));
  // Footer nudge: open the (collapsed-by-default) Advanced settings and scroll up to them, so people
  // who don't like a result can find the knobs (phase / keep-gems / scrolls / talents).
  const av = $('sets').querySelector('.adv-link');
  if (av) av.addEventListener('click', (e) => {
    e.preventDefault();
    const adv = document.querySelector('details.advanced');
    if (adv) adv.open = true;   // expand the options...
    $('config-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); // ...but land at the top of the whole Setup box
  });
  // Lock this set's items: add every selected item-id to the kept list, then re-optimize so the
  // other sets keep those gems/enchants too (don't undo a set you've committed to).
  const lb = $('sets').querySelector('.lock-set-btn');
  if (lb) lb.addEventListener('click', () => {
    for (const it of Object.values(results[activeTab].selection)) if (it) lockedItemIds.add(it.itemId);
    runOptimize();
  });
  $('sets').querySelectorAll('.lockx').forEach((x) => x.addEventListener('click', () => { lockedItemIds.delete(+x.dataset.id); runOptimize(); }));
  const cl = $('sets').querySelector('.clearlocks');
  if (cl) cl.addEventListener('click', () => { lockedItemIds.clear(); runOptimize(); });
  // Pin / unpin an item to a slot for THIS set, then re-optimize the rest around it.
  $('sets').querySelectorAll('.pin-btn').forEach((b) => b.addEventListener('click', () => {
    (pinnedSlots[b.dataset.goal] ||= {})[b.dataset.slot] = +b.dataset.id;
    runOptimize();
  }));
  // "+ add to sim": a BiS item you don't own — fold it into the pool as a planning item, then pin it
  // to the slot so it shows there. (Removed again from the "Added for planning" banner.)
  $('sets').querySelectorAll('.plan-btn').forEach((b) => b.addEventListener('click', () => {
    const id = +b.dataset.bisid;
    if (!virtualItems.has(id)) { const it = buildSyntheticItem(id); if (!it) return; virtualItems.set(id, it); }
    (pinnedSlots[b.dataset.goal] ||= {})[b.dataset.slot] = id;
    runOptimize();
  }));
  $('sets').querySelectorAll('.planx-btn').forEach((x) => x.addEventListener('click', () => { removeVirtual(+x.dataset.id); runOptimize(); }));
  const cpl = $('sets').querySelector('.clearplan');
  if (cpl) cpl.addEventListener('click', () => { for (const id of [...virtualItems.keys()]) removeVirtual(id); runOptimize(); });
  $('sets').querySelectorAll('.unpin-btn').forEach((b) => b.addEventListener('click', () => {
    const g = pinnedSlots[b.dataset.goal];
    if (g) { delete g[b.dataset.slot]; if (!Object.keys(g).length) delete pinnedSlots[b.dataset.goal]; }
    runOptimize();
  }));
  const ua = $('sets').querySelector('.unpin-all-btn');
  if (ua) ua.addEventListener('click', () => { delete pinnedSlots[ua.dataset.goal]; runOptimize(); });
  // Exclude an item from every set (drops it from the pool); also clear any pin pointing at it.
  $('sets').querySelectorAll('.excl-btn').forEach((b) => b.addEventListener('click', () => {
    const id = +b.dataset.id;
    excludedItemIds.add(id);
    for (const g of Object.values(pinnedSlots)) for (const s of Object.keys(g)) if (g[s] === id) delete g[s];
    runOptimize();
  }));
  $('sets').querySelectorAll('.exclx').forEach((x) => x.addEventListener('click', () => { excludedItemIds.delete(+x.dataset.id); runOptimize(); }));
  const ce = $('sets').querySelector('.clearexcl');
  if (ce) ce.addEventListener('click', () => { excludedItemIds.clear(); runOptimize(); });
  // Accordion: opening one slot's dropdown (owned alternates + BiS) closes any other that's open, so
  // the paper doll never stacks several expanded lists at once.
  const slotDetails = [...$('sets').querySelectorAll('details.ds-alts')];
  slotDetails.forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) slotDetails.forEach((o) => { if (o !== d && o.open) o.open = false; });
  }));
  whRefresh(); // iconize + quality-color the freshly-rendered item links via Wowhead
}

// Banner listing items excluded from every set (chips with a re-include ×). Names come from the
// pre-exclusion item list so an already-dropped item still shows its name.
function excludedBanner() {
  if (!excludedItemIds.size) return '';
  const chips = [...excludedItemIds].map((id) => {
    const it = (items || []).find((i) => i.itemId === id);
    return `<span class="lockchip">${it ? (it.name || id) : id}<button class="exclx" data-id="${id}" title="re-include">×</button></span>`;
  }).join('');
  return `<div class="lockedbar excl">🚫 <b>Excluded</b> (never used in any set): ${chips}
    <button class="ghost clearexcl" type="button">Clear all</button></div>`;
}

// Banner listing BiS items added for planning (not owned). Each chip removes the planning item (and
// any pin pointing at it). These are folded into the optimizer pool like owned gear while present.
function plannedBanner() {
  if (!virtualItems.size) return '';
  const chips = [...virtualItems.values()].map((it) =>
    `<span class="lockchip">${it.name || it.itemId}<button class="planx-btn" data-id="${it.itemId}" title="remove from plan">×</button></span>`).join('');
  return `<div class="lockedbar planned">🧪 <b>Added for planning</b> (not in your bags — treated as owned): ${chips}
    <button class="ghost clearplan" type="button">Clear all</button></div>`;
}

// Banner listing the items whose gems/enchants are locked across all sets (chips with an unlock ×).
function lockedBanner() {
  if (!lockedItemIds.size) return '';
  const chips = [...lockedItemIds].map((id) => {
    const it = (items || []).find((i) => i.itemId === id);
    return `<span class="lockchip">${it ? (it.name || id) : id}<button class="lockx" data-id="${id}" title="unlock">×</button></span>`;
  }).join('');
  return `<div class="lockedbar">🔒 <b>Locked</b> (gems/enchants kept across every set): ${chips}
    <button class="ghost clearlocks" type="button">Clear all</button></div>`;
}

function slotHTML(r, slotKey, side) {
  const it = r.selection[slotKey];
  const goalId = r.goal.id;
  const pinnedId = (pinnedSlots[goalId] || {})[slotKey];
  // Empty slot (nothing in your gear fills it): still show the BiS "what to chase" list for the slot.
  if (!it) {
    const bisOnly = slotDropdown([], goalId, slotKey, null);
    return `<div class="ds-slot ${side} empty"><span class="ds-label">${SLOT_LABEL[slotKey]}</span>${bisOnly}</div>`;
  }
  const ps = r.perSlot[slotKey] || {};
  const tag = ps.defGemmed ? `<span class="defgem">${term('def-gemmed', 'defgem')}</span>` : (ps.locked ? `<span class="defgem">${term('kept', 'kept')}</span>` : '');
  // Show at a glance whether this pick is gear you're ALREADY wearing in-game (no change) or a SWAP
  // the optimizer pulled from your bags/bank. it.equipped comes from the export's E: (equipped) vs
  // I: (inventory) line and survives share links, so this is accurate for any loaded character.
  const wornTag = it._virtual
    ? `<span class="swap-badge planned" title="A planning item you added (not in your bags) — treated as owned in the sim. Remove it from the 'Added for planning' banner above.">★ planned</span>`
    : it.equipped
      ? `<span class="worn-badge" title="You're already wearing this in-game — no change needed for this slot.">● worn</span>`
      : `<span class="swap-badge" title="Swapped in from your bags/bank — you don't have this equipped in-game right now.">swap in</span>`;
  // Equip control: when the slot is equipped (forced), the picked item IS the forced one — offer to
  // unequip; otherwise offer to force ("equip") the current pick so re-optimizing other slots won't
  // swap it out for this set.
  const pinCtl = pinnedId
    ? `<button class="unpin-btn" data-goal="${goalId}" data-slot="${slotKey}" title="Stop forcing this item into the slot; let the optimizer choose it again">📌 equipped · unequip</button>`
    : `<button class="pin-btn" data-goal="${goalId}" data-slot="${slotKey}" data-id="${it.itemId}" title="Force this item into the slot and re-optimize the rest around it">equip</button>`
      + `<button class="excl-btn" data-id="${it.itemId}" title="Exclude this item from all sets">exclude</button>`;
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
  // Don't offer owned ALTERNATIVES for a pinned slot (you've fixed the choice), but still show the
  // BiS reference list — it's a "what to chase" pointer, not a swap suggestion. So the dropdown
  // renders whenever there are alternatives OR a BiS list for the slot.
  const alts = slotDropdown(pinnedId ? [] : ps.alternatives, goalId, slotKey, it.itemId);
  return `<div class="ds-slot ${side}${pinnedId ? ' pinned' : ''}${it.equipped ? '' : ' swapped'}">
    ${wh(it.itemId, it.name || it.itemId, 'ds-item')}${wornTag}${tag}<span class="pin-ctl">${pinCtl}</span>
    ${ench}${gems}${alts}
  </div>`;
}

// Near-identical alternatives for a slot: other owned items that score within ~1% of the picked one
// on this goal's objective. Each shows its own gems/sockets, the set delta, and an "equip" button to
// force it into the slot; "needs re-gem" marks an option that, dropped in as-is, would miss a gate.
const altDelta = (d) => Math.abs(d) < 5e-4 ? '≈ same' : (d > 0 ? '+' : '−') + (Math.abs(d) * 100).toFixed(2) + '%';
// The content phase selected drives both gem availability and which BiS reference list shows; clamp
// to the phases we actually carry BiS for.
const currentPhase = () => { const p = +($('phase') ? $('phase').value : 0) || 1; return BIS_PHASES.includes(p) ? p : Math.max(...BIS_PHASES.filter((x) => x <= p), BIS_PHASES[0]); };
// ring1/ring2 -> 'ring', trinket1/trinket2 -> 'trinket'; everything else is its own key.
const bisSlotKey = (slotKey) => slotKey.replace(/[12]$/, '');
const ownsItem = (id) => (items || []).some((it) => it.itemId === id);

// Curated community BiS for the slot at the selected phase — a "what to chase" list, independent of
// what you own. Appended to the end of the slot dropdown. Items you already own (or have selected in
// this set) are tagged so you can see how close your collection is to the list.
function bisHTML(goalId, slotKey, chosenId) {
  const list = (BIS[currentPhase()] || {})[bisSlotKey(slotKey)];
  if (!list || !list.length) return '';
  const rows = list.map((b, i) => {
    const note = b.note ? ` <abbr class="bis-note" title="${b.note}">ⓘ</abbr>` : '';
    let tag, ctl = '';
    if (b.id === chosenId) {
      tag = `<span class="bis-have in-set" title="This is the item picked for this slot.">✓ in this set</span>`;
      // Already the pick; if it's a planning item, still offer to drop it from the plan.
      if (isPlanned(b.id)) ctl = `<button class="planx-btn" data-id="${b.id}" title="Remove this planning item from the sim">remove</button>`;
    } else if (isPlanned(b.id)) {
      // Added for planning (not owned) — in the pool now; equip forces it into this slot.
      tag = `<span class="bis-have planned" title="Added for planning — treated as owned in the sim.">★ planned</span>`;
      ctl = `<button class="pin-btn" data-goal="${goalId}" data-slot="${slotKey}" data-id="${b.id}" title="Force this item into the slot and re-optimize the rest around it">equip</button>`
        + `<button class="planx-btn" data-id="${b.id}" title="Remove this planning item from the sim">remove</button>`;
    } else if (ownsItem(b.id)) {
      // Owned BiS items can be forced into the slot just like an owned alternate.
      tag = `<span class="bis-have" title="You already own this item.">✓ you own this</span>`;
      ctl = `<button class="pin-btn" data-goal="${goalId}" data-slot="${slotKey}" data-id="${b.id}" title="Force this item into the slot and re-optimize the rest around it">equip</button>`;
    } else if (BIS_ITEM_DB[b.id] && BIS_ITEM_DB[b.id].slot) {
      // Not in your bags — add it to the sim as a planning item ("pretend I own this"), pinned here.
      tag = `<span class="bis-miss" title="Not in your loaded gear.">not in your bags</span>`;
      ctl = `<button class="plan-btn" data-goal="${goalId}" data-slot="${slotKey}" data-bisid="${b.id}" title="Add this item to the sim as a planning piece (pretend you own it) and force it into the slot">+ add to sim</button>`;
    } else {
      // No stat data for this id (shouldn't happen for real gear) — link only.
      tag = `<span class="bis-miss" title="Not in your loaded gear.">not in your bags</span>`;
    }
    return `<div class="bis-row"><span class="bis-rank">${i + 1}</span>${wh(b.id, b.name, 'bis-item')}${note}${tag}${ctl}</div>`;
  }).join('');
  return `<div class="bis-block">
    <div class="bis-h"><abbr class="tip" title="Best-in-slot reference for this slot at Phase ${currentPhase()}, from the community (Wowhead) tank BiS lists. It's a 'what to chase' pointer — independent of your gear, and the optimizer never picks from it. Items you own can be equipped; the rest just link to Wowhead.">Phase ${currentPhase()} BiS</abbr> <span class="bis-src">· community list</span></div>
    ${rows}
  </div>`;
}

// Per-slot dropdown: owned near-ties first (each with its gems, set delta, equip/exclude), then the
// curated BiS reference list. Collapsed by default; renders whenever there are alternatives OR a BiS
// list, so a slot always exposes "what to chase" even when nothing you own is a near-tie.
function slotDropdown(alts, goalId, slotKey, chosenId) {
  alts = alts || [];
  const bis = bisHTML(goalId, slotKey, chosenId);
  if (!alts.length && !bis) return '';
  const rows = alts.map((a) => {
    const gc = (a.gems && a.gems.length) ? `<div class="ds-gems alt">${a.gems.map((g) => gemCell(g, true)).join('')}</div>` : '';
    const regem = a.dropInLegal === false ? `<abbr class="alt-regem" title="Dropping this in as-is would miss a gate (uncrittable / uncrushable / Min HP) — to use it you'd re-gem another slot for the avoidance, defense or resilience this item gives up.">needs re-gem</abbr>` : '';
    const equip = `<button class="pin-btn" data-goal="${goalId}" data-slot="${slotKey}" data-id="${a.itemId}" title="Force this item into the slot and re-optimize the rest around it">equip</button>`
      + `<button class="excl-btn" data-id="${a.itemId}" title="Exclude this item from all sets">exclude</button>`;
    return `<div class="ds-alt">
      <span class="alt-line">${wh(a.itemId, a.name || a.itemId, 'ds-alt-item')}<span class="alt-delta" title="Change to this goal's overall set score">${altDelta(a.objDelta)}</span>${regem}${equip}</span>
      ${gc}
    </div>`;
  }).join('');
  // One consistent label for the slot's dropdown (owned near-ties + the BiS reference list), regardless
  // of which halves are present — so it never flips between "also viable" and "BiS list".
  const summary = 'also viable - BiS list';
  return `<details class="ds-alts"><summary class="ds-alts-h">${summary}</summary><div class="ds-alts-body">${rows}${bis}</div></details>`;
}

const panel = (title, rows) =>
  `<div class="spanel"><h4>${title}</h4>${rows.map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

// What the stat buff contributes to THIS set, computed live (Kings is +10% of base stats, so the
// amount depends on the set). Each stat is shown as amount (downstream effect). buffImpact already
// holds the per-set deltas; we convert intellect→spell crit and armor→damage reduction here.
const INT_PER_SPELLCRIT = 80;             // ≈ TBC level-70 caster: ~1% spell crit per 80 intellect
const armorDR = (armor) => armor / (armor + ARMOR_CONST()); // vs a raid boss (standard TBC formula)
// Armor stat label with a hover showing what that armor actually mitigates: the % physical damage
// reduction vs a raid boss (the same Armor ÷ (Armor + K) the EHP model uses, capped at 75%).
function armorLabel(armor) {
  const dr = Math.min(armorDR(armor) * 100, 75);
  return `<abbr class="tip" title="Reduces physical damage from a level-${BASE.raidBossLevel} boss by ${dr.toFixed(1)}% — Armor ÷ (Armor + ${fmt(ARMOR_CONST())}), capped at 75%. This is the mitigation folded into EHP.">Armor</abbr>`;
}
// Boss-misses-you chance: base + the defense-skill bonus. Part of avoidance (miss + dodge + parry),
// so it sits between Block and Dodge in the panel.
const missLabel = () => `<abbr class="tip" title="Chance a level-${BASE.raidBossLevel} boss melee swing simply misses you: ${BASE.baseMissChance}% base + ${BASE.defenseBenefitPerSkill}% per defense skill above ${BASE.baseDefenseSkill}. Counts toward avoidance and the uncrushable total.">Miss</abbr>`;
// Spell hit with its cap and how far this set is below it (uncapped spell hit recovers missed threat).
function spellHitLabel(a) {
  const cur = spellHitPct(a), cap = CAPS.spellHitCapPct, below = cap - cur;
  const note = below > 0.005
    ? `This set is ${below.toFixed(2)}% below it — each point of spell hit still recovers missed spell threat.`
    : `This set is at/above the cap — extra spell hit adds no more threat.`;
  return `<abbr class="tip" title="Spell-hit cap vs a level-${BASE.raidBossLevel} raid boss is ${cap}%. ${note}">Spell Hit</abbr>`;
}
function buffNote(b, agg) {
  if (!b || !b.name) return '';
  const drDelta = agg && b.armor ? (armorDR(agg.armor) - armorDR(agg.armor - b.armor)) * 100 : 0;
  const part = (amt, unit, down) => `<b>+${amt}</b> ${unit} <span class="muted">(${down})</span>`;
  return `<div class="buffnote"><b>${b.name}</b>'s live share of this set (Kings adds 10% of base stats):<br>
    ${part(b.stamina.toFixed(1), 'stamina', `≈+${Math.round(b.health).toLocaleString()} health`)},
    ${part(b.agility.toFixed(1), 'agility', `≈+${b.crushAvoid.toFixed(2)}% dodge`)},
    ${part(b.intellect.toFixed(1), 'intellect', `≈+${(b.intellect / INT_PER_SPELLCRIT).toFixed(2)}% spell crit`)},
    ${part(Math.round(b.armor), 'armor', `≈+${drDelta.toFixed(2)}% damage reduction`)}.
    <span class="muted">Buffs add no defense/resilience, so they don't help uncrittable. Set the buff in Sixty Upgrades after import.</span></div>`;
}

function setCard(r) {
  const e = r.evald, a = r.agg;
  const crushReq = r.goal.gates.requireUncrushable !== false; // AOE trash drops the crush gate
  // Safety-margined target (crushSafeTargetFor): the card certifies "uncrushable in-game", so a set the
  // solver landed just over the raw 102.4 cap but inside the ratings-vs-sheet gap shows ✗ (matches `legal`).
  const need = crushSafeTargetFor(r.goal.enc, r.goal.gates.uncrushableTarget);
  // The gate measures the avoidance ITS OWN fight leaves you: Illidan drops miss (Shear), Sunwell cuts
  // miss+dodge (Radiance); every other set uses the normal combined figure. Matches the summary column.
  const crushShown = r.goal.enc === 'sunwell' ? e.swpAvoidance
    : r.goal.enc === 'illidan' ? e.illyAvoidance : e.totalAvoidanceWithHS;
  const crushPass = crushShown + 1e-9 >= need;
  const minHp = r.goal.gates.minHealth || 0;
  const hpPass = !minHp || a.health + 1e-9 >= minHp;
  const metaWarn = r.metas.filter((m) => !m.active)
    .map((m) => `⚠ ${m.name} won't activate — needs ${m.requires}`).join('<br>');
  const hpNote = r.hpBestEffort
    ? `<div class="metawarn">⚠ Min HP ${fmt(minHp)} isn't reachable with this gear/settings (keep-mode keeps your worn gems) — showing the tankiest set achievable (best effort).</div>`
    : '';
  // Nothing you own beats what you're wearing for this goal. Say it outright — otherwise the card
  // looks like a recommendation and the player re-equips gear they already had on.
  const wornNote = r.equippedIsBest
    ? `<div class="socketnote">✓ <strong>You're already wearing the best set your collection allows for this goal.</strong> Nothing here to change — every alternative scored lower.</div>`
    : '';
  const noId = [...new Set(Object.values(r.perSlot).filter((ps) => ps.enchant && !ps.enchant.effectId).map((ps) => ps.enchant.name))];
  const exportNote = noId.length ? `<div class="metawarn">Export: no Sixty Upgrades ID for ${noId.join(', ')} — omitted from the string.</div>` : '';
  // The export carries the gems, but their socket placement isn't always right on import.
  const anyRecGems = Object.values(r.perSlot).some((ps) => !ps.locked && (ps.gems || []).length);
  const socketNote = anyRecGems
    ? '<div class="socketnote">💎 Verify gems are in the correct sockets on Sixty Upgrades — the export sometimes puts them in the wrong holes.</div>'
    : '';
  // Surplus avoidance hint: when an uncrushable set sits well OVER the crush cap AND it has kept (frozen)
  // gems, that surplus is locked in — re-gemming would trim it to the cap and convert it to threat. Only
  // show it when there's something locked to unfreeze (re-gem mode already trims to the cap on its own).
  const crushSurplus = crushShown - need;
  const anyLocked = Object.values(r.perSlot).some((ps) => ps.locked);
  const surplusNote = (crushReq && crushPass && anyLocked && crushSurplus >= 1.5)
    ? `<div class="tipnote">💡 This set is <b>${crushSurplus.toFixed(1)}%</b> over the ${need}% uncrushable cap, but your <b>kept gems</b> are frozen, so that surplus avoidance can't be re-gemmed into threat. Switch <b>Gems &amp; enchants</b> to <b>“Re-gem everything”</b> (or unlock pieces) to convert it to more spell damage.</div>`
    : '';

  const doll = `<div class="doll">
    <div class="col left">${LEFT_SLOTS.map((k) => slotHTML(r, k, 'left')).join('')}</div>
    <div class="col right">${RIGHT_SLOTS.map((k) => slotHTML(r, k, 'right')).join('')}</div>
  </div>`;

  const panels = `<div class="panels">
    ${panel('Primary', [['Health', fmt(a.health)], ['Stamina', fmt(a.stamina)], ['Strength', fmt(a.strength)], ['Agility', fmt(a.agility)], ['Intellect', fmt(a.intellect)]])}
    ${panel('Spell', [['Spell Damage', fmt(litSP(a))],
      ...(a.spellPowerEquiv ? [[`<abbr class="term" title="${a.spellPowerEquivSource ? a.spellPowerEquivSource + ': its' : 'A libram\'s +Consecration damage or a proc trinket\'s buff'} effect converted to threat-equivalent spell power so the threat scales value it. Not literal +spell-power on the tooltip — your character sheet and Sixty Upgrades won't show it, so it's listed separately here.">Effect (≈SP)</abbr>`, '+' + fmt(a.spellPowerEquiv)]] : []),
      [spellHitLabel(a), spellHitPct(a).toFixed(2) + '%'], ['Block Value', fmt(a.blockValue)]])}
    ${panel('Defense', [[armorLabel(a.armor), fmt(a.armor)], ['Defense', a.defenseSkill.toFixed(0)], ['Resilience', fmt(a.resilienceRating)], ['Block', a.blockPct.toFixed(2) + '%'], [missLabel(), missChance(a.defenseSkill).toFixed(2) + '%'], ['Dodge', a.dodgePct.toFixed(2) + '%'], ['Parry', a.parryPct.toFixed(2) + '%'], ['Total Avoidance', e.totalAvoidanceNoHS.toFixed(2) + '%']])}
    ${panel('Survival', [[term('EHP', 'ehp') + ' (health pool)', fmt(e.ehpPhysical)], [term('Uncrushable', 'uncrush') + ' (w/ HS)', e.totalAvoidanceWithHS.toFixed(1) + '%'], ['Crit reduction', e.critReduction.toFixed(2) + '%']])}
  </div>`;

  return `<div class="set">
    <div class="set-head">
      <div>
        <h3>${r.goal.name}</h3>
        <p class="focus">Focus: ${r.goal.focus} · ${r.legal ? 'all gates met' : 'gates NOT fully met with this collection'}</p>
      </div>
      <div class="head-right">
        <div class="gates">
          <span class="gate ${e.raidCritImmune ? 'pass' : 'fail'}">${term('Uncrittable', 'uncrit')} ${e.critReduction.toFixed(2)}%</span>
          ${crushReq
            ? `<span class="gate ${crushPass ? 'pass' : 'fail'}">${term('Uncrushable', 'uncrush')} ${crushShown.toFixed(1)}% / ${need}%</span>`
            : `<span class="gate na">${term('Uncrushable', 'uncrush')} ${crushShown.toFixed(1)}% — not required (${r.goal.id === 'aoe' ? 'trash' : 'no crushing blows'})</span>`}
          ${minHp ? `<span class="gate ${hpPass ? 'pass' : 'fail'}">${term('Min HP', 'minhp')} ${fmt(a.health)} / ${fmt(minHp)}</span>` : ''}
        </div>
        <div class="set-actions">
          ${Object.keys(pinnedSlots[r.goal.id] || {}).length ? `<button class="unpin-all-btn ghost" type="button" data-goal="${r.goal.id}">📌 Unequip all (${Object.keys(pinnedSlots[r.goal.id]).length})</button>` : ''}
          <button class="lock-set-btn ghost" type="button">🔒 Lock this set's gems/enchants</button>
          <button class="export-btn" type="button">⬇ Export to Sixty Upgrades</button>
          <a class="su-link ghost" href="https://sixtyupgrades.com/tbc" target="_blank" rel="noopener" title="Open Sixty Upgrades in a new tab — copy the export above, then paste it into Set → Import.">Open Sixty&nbsp;Upgrades ↗</a>
        </div>
      </div>
    </div>
    ${buffNote(r.buffImpact, r.agg)}
    ${wornNote}
    ${doll}
    ${socketNote}
    ${surplusNote}
    ${hpNote}
    ${metaWarn ? `<div class="metawarn">${metaWarn}</div>` : ''}
    ${exportNote}
    ${panels}
    <div class="set-foot">
      <span class="set-foot-text">Not what you expected?</span>
      <a href="#" class="adv-link">⚙ Change the options ↑</a>
      <span class="set-foot-sub">content phase · keep gems/enchants · scrolls · talents &amp; more under <em>Advanced settings</em></span>
    </div>
  </div>`;
}

init();
