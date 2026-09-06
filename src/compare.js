// Per-slot gear comparison: "if I put this piece in, what happens to my EHP and my DPS?"
//
// DROP-IN SEMANTICS. Every other slot is held exactly as the baseline set has it and only the chosen
// slot changes. That is the literal question a raider asks when loot drops, it is instant (no search),
// and it is the same evaluation runGoal's nearAlternatives already uses for its `dropInLegal` flag.
// The other question — "now re-optimize the whole set around this piece" — is already a shipped
// feature (the UI's pin-to-slot + re-solve), so the Compare tab hands off to that rather than
// duplicating the optimizer here.
//
// EXACTNESS. The baseline's per-slot `addedStats` (runner.js) is what each slot contributes on top of
// its baseStats — gems, enchant, socket bonus, less a dead meta. So a swap is: drop the old slot's
// (base + added), add the new slot's (base + added), re-aggregate. Nothing about the untouched 16
// slots is recomputed or re-derived, so a compared set and the set card can never disagree.

import { aggregate } from './model.js';
import { evaluateSet } from './character.js';
import { baseOf, lockedDelta, encAvoid, encUncrush } from './runner.js';
import { planItemGems, reassignForBonus, bonusEarnedAsTagged } from './gemsolver.js';
import { bestEnchant } from './enchants.js';
import { GEMS, META_GEMS, FITS, gemColors, metaActivated, bestMeta, CURRENT_PHASE } from './gems.js';
import { PAIRS } from './optimizer.js';
import { computeDPS } from './dps.js';
import { crushSafeTargetFor } from './constants.js';

const GEM_BY_ID = new Map();
const GEM_BY_NAME = new Map();
for (const g of [...GEMS, ...META_GEMS]) { if (g.id) GEM_BY_ID.set(g.id, g); GEM_BY_NAME.set(g.name, g); }

// The paired slots must hold DISTINCT items, so ring1's candidate list can't offer what ring2 wears.
const PARTNER = {};
for (const [a, b] of Object.values(PAIRS)) { PARTNER[a] = b; PARTNER[b] = a; }

const sumInto = (into, s, m = 1) => { for (const [k, v] of Object.entries(s || {})) into[k] = (into[k] || 0) + v * m; };
// The export carries gem ITEM IDS; a planned gem carries a name. Resolve either to the DB record so
// we can read its color(s) for meta activation.
const gemRecord = (g) => (g && (GEM_BY_ID.get(g.id) || GEM_BY_NAME.get(g.name))) || null;

// Which items can go in this slot, given the baseline set. Excludes 2H (a tank keeps a shield) and
// whatever the paired slot already holds.
export function candidatesForSlot(items, slotKey, baseline) {
  const base = slotKey.replace(/[12]$/, '');            // ring1 -> ring, trinket2 -> trinket
  const partner = PARTNER[slotKey];
  const partnerId = partner && baseline.selection[partner] ? baseline.selection[partner].itemId : null;
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (it.slot !== base) continue;
    if (it.equipLoc === 'INVTYPE_2HWEAPON') continue;
    if (it.itemId === partnerId) continue;
    if (seen.has(it.itemId)) continue;                  // an item can appear once per variant
    seen.add(it.itemId);
    out.push(it);
  }
  return out;
}

// Gem + enchant an item for this comparison.
//   'best'  — gem/enchant it optimally for the baseline goal's own scale (the item's potential).
//   'asis'  — use whatever is socketed in it right now (the honest "if I equip this tonight").
// Returns { added, gems, enchant, bonusKept, metaCount }.
function outfitItem(item, mode, env) {
  const { objScale, perks, maxPhase, faction } = env;
  if (mode === 'asis') {
    const gems = (item.gems || []).map((id) => {
      const g = GEM_BY_ID.get(id);
      return { name: g ? g.name : `Gem #${id}`, id, socket: g && g.meta ? 'meta' : (g ? g.color : null) };
    });
    // resolved-minus-base is the gem/enchant delta already folded into the item's stats — the same
    // accounting the optimizer's keep-mode uses for a locked piece.
    return { added: lockedDelta(item), gems, enchant: null, bonusKept: null, metaCount: gems.filter((g) => g.socket === 'meta').length, asIs: true };
  }
  const plan = planItemGems(item, objScale, perks, maxPhase, {});
  const added = { ...plan.stats };
  const en = bestEnchant(item.slot, objScale, perks, { faction, maxPhase });
  if (en) sumInto(added, en.enchant.stats);
  const colored = plan.choices.filter((c) => c.color && FITS[c.color]);
  const earnedBefore = bonusEarnedAsTagged(plan.choices);
  const bonusKept = !!item.socketBonus && reassignForBonus(colored, item.sockets);
  if (bonusKept && !earnedBefore) sumInto(added, { [item.socketBonus.stat]: item.socketBonus.value });
  return {
    added,
    gems: plan.choices.map((c) => ({ name: c.name, id: c.id || null, socket: c.socket || null })),
    enchant: en ? { name: en.enchant.name, id: en.enchant.id || null, spell: en.enchant.spell || null, effectId: en.enchant.enchant || null } : null,
    bonusKept,
    metaCount: plan.metaCount || 0,
  };
}

// ---- the working set: a baseline with N slots swapped -------------------------------------------
// The Compare tab is a FITTING ROOM, not a one-shot calculator: you keep clicking pieces in and the
// readout tracks where you've got to against where you started. So the core operation is "apply these
// swaps", and pricing a single candidate is just the one-entry case of it. A working set comes back
// in the same shape as the baseline it was built from, which is what lets it be handed straight back
// in as the next comparison's baseline.
//
// Meta corrections are folded into the OWNING SLOT's addedStats rather than carried as a loose extra
// block. That keeps the (baseStats + addedStats) rebuild exact, which is the invariant everything
// here rests on — and it is the reason a working set can be re-baselined without drifting.

const blocksFor = (selection, perSlot) => {
  const blocks = [];
  for (const [k, it] of Object.entries(selection)) {
    if (!it) continue;
    blocks.push({ stats: baseOf(it) });
    blocks.push({ stats: (perSlot[k] && perSlot[k].addedStats) || {} });
  }
  return blocks;
};

// Gem colours across a whole selection. Meta activation ("2+ blue", "more red than blue") is a
// WHOLE-SET property, so it can only be judged once every swap is in place — which is exactly why
// this is done after the loop that outfits the incoming pieces, not inside it.
function tallyColors(gemsBySlot) {
  const counts = { red: 0, yellow: 0, blue: 0 };
  for (const gems of Object.values(gemsBySlot)) {
    for (const g of gems || []) {
      if (g.socket === 'meta') continue;
      const rec = gemRecord(g);
      if (!rec) continue;
      for (const col of gemColors(rec)) if (counts[col] != null) counts[col]++;
    }
  }
  return counts;
}

// Apply `swaps` (slotKey -> item, or null to empty the slot) on top of `baseline`.
export function applySwaps(baseline, swaps = {}, { gemMode = 'best' } = {}) {
  const env = baseline.env;
  const selection = { ...baseline.selection };
  const perSlot = { ...baseline.perSlot };
  const warnings = [];
  const changed = [];
  const withDps = (r) => (r.dps ? r : { ...r, dps: computeDPS(r.agg, { evald: r.evald, items: r.items }) });

  // 1. Outfit each incoming piece (gems + enchant + socket bonus) — but NOT its meta yet, since that
  //    depends on the colours of the finished set, which isn't known until every swap is in.
  const outfits = {};
  for (const [slot, item] of Object.entries(swaps)) {
    changed.push(slot);
    if (!item) { delete selection[slot]; delete perSlot[slot]; continue; }
    outfits[slot] = outfitItem(item, gemMode, env);
    selection[slot] = item;
  }
  if (!changed.length) return withDps({ ...baseline, swappedSlots: [], warnings: [], outfits: {} });

  // 2. Now the finished set's colours can be tallied.
  const gemsBySlot = {};
  for (const slot of Object.keys(selection)) {
    gemsBySlot[slot] = outfits[slot] ? outfits[slot].gems : ((perSlot[slot] && perSlot[slot].gems) || []);
  }
  const counts = tallyColors(gemsBySlot);

  // 3. Metas on the pieces coming IN.
  for (const [slot, o] of Object.entries(outfits)) {
    if (o.asIs) {
      // A meta the piece already carries gives nothing in-game if this set's colours don't light it.
      for (const g of o.gems) {
        if (g.socket !== 'meta') continue;
        const rec = gemRecord(g);
        if (rec && !metaActivated(rec, counts)) {
          sumInto(o.added, rec.stats, -1);
          warnings.push(`${rec.name} won't activate in this set — it needs ${rec.requires}.`);
        }
      }
      continue;
    }
    if (!o.metaCount) continue;
    const pick = bestMeta(env.objScale, { maxPhase: env.maxPhase || CURRENT_PHASE, counts, exclude: env.metaExclude || null });
    if (pick) {
      sumInto(o.added, pick.gem.stats);
      o.gems = [...o.gems, { name: pick.gem.name, id: pick.gem.id || null, socket: 'meta' }];
    } else {
      warnings.push(`No meta gem would activate with this set's gem colours, so the ${slot} meta socket is left empty.`);
    }
  }

  // 4. Metas on the pieces STAYING: did these swaps darken one that was lit?
  for (const [slot, ps] of Object.entries(baseline.perSlot)) {
    if (outfits[slot] || !selection[slot]) continue;
    for (const m of ps.metas || []) {
      if (!m.active) continue;
      const rec = GEM_BY_NAME.get(m.name);
      if (!rec || metaActivated(rec, counts)) continue;
      perSlot[slot] = { ...ps, addedStats: { ...(ps.addedStats || {}) } };
      sumInto(perSlot[slot].addedStats, rec.stats, -1);
      warnings.push(`This darkens ${rec.name} in your ${slot} — it needs ${rec.requires}.`);
    }
  }

  // 5. Fold the incoming pieces into perSlot, then rebuild the whole set from it.
  for (const [slot, o] of Object.entries(outfits)) {
    perSlot[slot] = {
      gems: o.gems, enchant: o.enchant, metas: [], defGemmed: false, locked: !!o.asIs,
      socketBonus: selection[slot].socketBonus || null, bonusKept: o.bonusKept,
      addedStats: o.added, alternatives: [],
    };
  }
  const items = Object.values(selection).filter(Boolean);
  const agg = aggregate(blocksFor(selection, perSlot), env.aggOpts);
  const evald = evaluateSet(agg);
  return {
    ...baseline, selection, perSlot, items, agg, evald,
    dps: computeDPS(agg, { evald, items }),
    swappedSlots: changed, warnings, outfits,
  };
}

// Rebuild a set's OWN aggregate from per-slot (baseStats + addedStats). This must reproduce its
// `agg` exactly — the invariant the whole comparison rests on, since every swap is this sum with a
// slot's pair of blocks exchanged. Exported so the tests can assert it directly rather than
// inferring it from a delta.
export function rebuildAggregate(baseline) {
  return aggregate(blocksFor(baseline.selection, baseline.perSlot), baseline.env.aggOpts);
}

// Price ONE candidate in one slot — the single-entry case of applySwaps, kept as its own name
// because that is what the candidate table asks for on every row.
export function evaluateSwap(baseline, slotKey, cand, opts = {}) {
  const r = applySwaps(baseline, { [slotKey]: cand }, opts);
  return {
    agg: r.agg, evald: r.evald, dps: r.dps, items: r.items,
    outfit: (r.outfits || {})[slotKey] || null, warnings: r.warnings,
  };
}

// Do the hard gates still hold for a swapped set, measured the way THIS goal measures them?
// Uncrushable uses the goal's own encounter metric (Illidan drops miss, Sunwell cuts miss+dodge) and
// the safety-margined certification target — the same bar the set card's ✓ uses, so a row that says
// "still uncrushable" here means uncrushable in-game, not just past the raw 102.4 cap.
export function gatesFor(evald, agg, goal) {
  const enc = goal.enc || null;
  const gates = goal.gates || {};
  const crushRequired = gates.requireUncrushable !== false;
  const need = crushSafeTargetFor(enc, gates.uncrushableTarget);
  const minHp = gates.minHealth || 0;
  return {
    uncrit: evald.raidCritImmune,
    uncrush: crushRequired ? (encAvoid(evald, enc) + 1e-9 >= need) : null,
    uncrushRaw: encUncrush(evald, enc),
    crushShown: encAvoid(evald, enc),
    crushNeed: need,
    minHp: minHp ? (agg.health + 1e-9 >= minHp) : null,
    minHpNeed: minHp,
  };
}

// The comparison table for one slot: every candidate scored as a drop-in against the baseline.
// Rows carry both the absolute figures and the deltas; the baseline's own item is included (and
// flagged) so it sits in the ranking rather than beside it — its deltas are exactly zero, which is
// also the round-trip proof that the swap accounting is right.
export function compareSlot(baseline, slotKey, candidates, { gemMode = 'best' } = {}) {
  if (!baseline || !baseline.env) throw new Error('compareSlot needs a solved set (with .env) as the baseline');
  const worn = baseline.selection[slotKey] || null;
  const baseEHP = baseline.evald.ehpPhysical || 0;
  const baseDPS = computeDPS(baseline.agg, { evald: baseline.evald, items: baseline.items }).total;

  const rows = candidates.map((cand) => {
    const isBaseline = !!worn && cand.itemId === worn.itemId;
    // The worn piece is scored with the gems the SET actually gave it, not a fresh plan — that's what
    // makes its row read 0.00 / 0.00 and anchors every other row to the card you're looking at.
    const s = isBaseline
      ? { agg: baseline.agg, evald: baseline.evald, dps: computeDPS(baseline.agg, { evald: baseline.evald, items: baseline.items }), items: baseline.items, outfit: null, warnings: [] }
      : evaluateSwap(baseline, slotKey, cand, { gemMode });
    const g = gatesFor(s.evald, s.agg, baseline.goal);
    const ps = isBaseline ? (baseline.perSlot[slotKey] || {}) : {};
    return {
      itemId: cand.itemId,
      name: cand.name || `Item #${cand.itemId}`,
      item: cand,
      isBaseline,
      owned: !cand._planned,
      gems: isBaseline ? (ps.gems || []) : (s.outfit ? s.outfit.gems : []),
      enchant: isBaseline ? (ps.enchant || null) : (s.outfit ? s.outfit.enchant : null),
      bonusKept: isBaseline ? (ps.bonusKept ?? null) : (s.outfit ? s.outfit.bonusKept : null),
      agg: s.agg,
      evald: s.evald,
      dps: s.dps,
      ehp: s.evald.ehpPhysical || 0,
      dEHP: (s.evald.ehpPhysical || 0) - baseEHP,
      dDPS: s.dps.total - baseDPS,
      dHealth: s.agg.health - baseline.agg.health,
      dArmor: s.agg.armor - baseline.agg.armor,
      dSpellPower: s.agg.spellPower - baseline.agg.spellPower,
      dCrushAvoid: g.crushShown - (gatesFor(baseline.evald, baseline.agg, baseline.goal).crushShown),
      dCritReduction: s.evald.critReduction - baseline.evald.critReduction,
      gates: g,
      legal: g.uncrit && g.uncrush !== false && g.minHp !== false,
      warnings: s.warnings,
    };
  });

  return { slotKey, worn, baseEHP, baseDPS, gemMode, rows };
}

// Sortable columns for the comparison table. Kept here rather than in the UI so the comparator is
// unit-testable, and so a column can't be rendered in the header without a matching sort behind it.
export const SORT_KEYS = {
  name: (r) => r.name,
  ehp: (r) => r.dEHP,
  dps: (r) => r.dDPS,
  health: (r) => r.dHealth,
  avoid: (r) => r.dCrushAvoid,
  gates: (r) => (r.legal ? 1 : 0),
};

// dir: -1 descending (the default for every numeric column — biggest gain first), 1 ascending.
// Ties always break on item name ASCENDING, whichever way the column is pointing: the tie-break is
// there to make the order deterministic across re-renders, and flipping it with the column would
// reshuffle equal rows on every click for no reason. Returns a new array; never sorts in place,
// since compareSlot's rows are re-read on each render.
export function sortRows(rows, key = 'dps', dir = -1) {
  const get = SORT_KEYS[key] || SORT_KEYS.dps;
  return [...rows].sort((a, b) => {
    const av = get(a), bv = get(b);
    const d = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return d ? d * dir : a.name.localeCompare(b.name);
  });
}
