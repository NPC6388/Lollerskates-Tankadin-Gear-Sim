// Steady-state DPS rollup — the per-ability formulas in threat.js, summed and converted to damage.
//
// WHY THIS GOES THROUGH threat.js. The guide publishes its numbers as THREAT, and threat.js
// transcribes them ability by ability with test/reference.test.js pinning every one against the
// guide's table. For a Protection Paladin those two quantities are the same number in different
// units: every ability in this rotation is Holy damage under Righteous Fury, so each threat.js
// function is literally `damage * RF` with RF = 1.9 (3/3 Improved Righteous Fury). Damage is
// therefore threat / RF, exactly — no separate damage model, and the guide's validated formulas stay
// the single source of truth rather than being re-derived here.
//
// WHY IT EXISTS AT ALL. The optimizer doesn't need a rollup: it ranks sets on the spell-power weight
// scales (weights.js), and under a fixed rotation damage is monotonic in spell power, so the proxy
// picks the same sets far more cheaply. What the proxy can't do is ANSWER A PLAYER — "this ring is
// +14 objective points" means nothing; "+5 DPS" means something. So this is for the READOUT (the
// Compare tab and the set cards), not for selection.
//
// KNOWN OMISSION: white melee swings. The addon exports GetItemStats, which carries no weapon damage
// or speed, so swing damage isn't computable from an export at all. Every figure here is ABILITY
// damage — it will read a few percent under a damage meter, and the UI says so.
//
// FIXED ROTATION — the guide's worked example (index.html:975-979): Consecration + Holy Shield +
// Seal of Righteousness + Judgement of Righteousness + Blessing of Sanctuary + Retribution Aura.
// Seal of Vengeance/Corruption and Judgement of Blood/Corruption are implemented in threat.js and
// could be exposed as a selector later; that's a UI change, not a math one.

import { RATING, THREAT } from './constants.js';
import {
  consecrationTPS,
  holyShieldTPS,
  sealOfRighteousnessTPS,
  judgementOfRighteousnessTPS,
  blessingOfSanctuaryTPS,
  retributionAuraPerHit,
} from './threat.js';
import { setBonuses } from './sets.js';

// Righteous Fury is a pure threat multiplier on Holy damage — it changes no damage number. Dividing
// it back out of threat.js's output is what turns the guide's threat table into damage.
const RF = THREAT.righteousFury;

// Rotation/encounter assumptions. These are held FIXED (not derived from the set) on purpose: the
// guide's per-ability table is quoted at them, so a rollup built on them reconciles with the guide
// exactly. The UI surfaces this block verbatim so nobody reads the number as a fight-specific sim.
export const DPS_ASSUMPTIONS = {
  seal: 'Seal of Righteousness',
  judgement: 'Judgement of Righteousness',
  blocksPerSec: 3 / 8,   // ~3 Holy Shield blocks per 8s, single target (guide per-ability table)
  weaponSpeed: 1.8,      // s — the guide's reference weapon; drives the seal's per-swing rate
  judgementCd: 10,       // s — Judgement cooldown
  bossSwingSec: 2.0,     // s — boss swing timer, for the Retribution Aura hit rate
  impHolyShield: true,   // 2/2 Improved Holy Shield (a damage multiplier, so it counts here)
};

// Spell crit is the one quantity the forward model (model.js) never computed — nothing gated on it,
// since the scales price spellCritRating directly. The rotation needs it (Judgement of Righteousness
// is the only crit-carrying ability here), so derive it the same way model.js derives its other
// intercepts: from the guide's sheet capture.
//   base = 7.86% (reference-profile spell crit) − 289/80 (its intellect, per model.js's v6 capture,
//   with no spell-crit rating on that gear) = 4.2475% at 0 intellect.
// 80 intellect per 1% is the site's existing constant (web/app.js INT_PER_SPELLCRIT).
// LOW STAKES: only the judgement crits in this rotation, so a full 1%-point error here moves total
// DPS by well under 1.
export const SPELL_CRIT = {
  basePct: 4.2475,
  intPerPct: 80,
};

export function spellCritPct(agg = {}) {
  return SPELL_CRIT.basePct
    + (agg.intellect || 0) / SPELL_CRIT.intPerPct
    + (agg.spellCritRating || 0) / RATING.critPer1;
}

// Total steady-state ability DPS for an aggregated set.
//   agg    — from model.js aggregate(); supplies spellPower, intellect, spellCritRating.
//   opts.evald   — from character.js evaluateSet(); supplies actualAvoidance for the Ret Aura rate.
//   opts.items   — the set's items, for tier-bonus detection (Justicar 2/4pc, Crystalforge 2pc).
// Anything in DPS_ASSUMPTIONS can be overridden per call; spellCritPct can be passed directly (the
// guide's reference profile quotes it as a sheet value rather than deriving it from intellect).
//
// Spell power uses agg.spellPower — the FULL figure including spellPowerEquiv. A libram's
// +Consecration damage and a proc trinket's uptime-averaged buff are equivalent spell power by
// construction, so they belong in a damage number. (agg.spellPowerLiteral is the display-only split
// for reconciling against the character sheet — see runner.js.)
export function computeDPS(agg = {}, opts = {}) {
  const A = { ...DPS_ASSUMPTIONS, ...opts };
  const bonuses = opts.bonuses || (opts.items ? setBonuses(opts.items) : null);
  const twoPc = bonuses ? bonuses.justicar.twoPc : false;
  const fourPc = bonuses ? bonuses.justicar.fourPc : false;
  const crystalforge2pc = bonuses ? bonuses.crystalforge.twoPc : false;

  const sp = agg.spellPower || 0;
  const critPct = opts.spellCritPct != null ? opts.spellCritPct : spellCritPct(agg);

  // Retribution Aura fires on every boss swing that LANDS — blocked hits included, only miss/dodge/
  // parry remove it. So it is the one component that falls as you gear defensively. It's ~2% of the
  // total and the breakdown shows it, so we keep it honest rather than dropping it for a tidier story.
  const avoidPct = opts.actualAvoidancePct != null
    ? opts.actualAvoidancePct
    : (opts.evald && opts.evald.actualAvoidance) || 0;
  const hitsPerSec = Math.max(0, 1 - avoidPct / 100) / A.bossSwingSec;

  // Each threat.js helper returns THREAT; / RF converts it to the damage that produced it.
  const dmg = (threat) => threat / RF;

  const parts = [
    { key: 'consecration', name: 'Consecration', dps: dmg(consecrationTPS(sp)), note: 'Rank 6, over its 8s duration' },
    {
      key: 'holyShield', name: 'Holy Shield',
      dps: dmg(holyShieldTPS(sp, { blocksPerSec: A.blocksPerSec, fourPc, impHolyShield: A.impHolyShield })),
      note: `~${(A.blocksPerSec * 8).toFixed(0)} blocks / 8s${fourPc ? ' · Justicar 4pc' : ''}`,
    },
    {
      key: 'seal', name: A.seal,
      dps: dmg(sealOfRighteousnessTPS(sp, { speed: A.weaponSpeed, twoPc })),
      note: `${A.weaponSpeed.toFixed(1)}s weapon${twoPc ? ' · Justicar 2pc' : ''}`,
    },
    {
      key: 'judgement', name: A.judgement,
      dps: dmg(judgementOfRighteousnessTPS(sp, critPct, A.judgementCd)),
      note: `${A.judgementCd}s cooldown · ${critPct.toFixed(2)}% spell crit`,
    },
    { key: 'sanctuary', name: 'Blessing of Sanctuary', dps: dmg(blessingOfSanctuaryTPS({ blocksPerSec: A.blocksPerSec })), note: 'per block' },
    {
      key: 'retAura', name: 'Retribution Aura',
      dps: dmg(retributionAuraPerHit({ crystalforge2pc }) * hitsPerSec),
      note: `per hit taken · ${A.bossSwingSec.toFixed(1)}s boss swing${crystalforge2pc ? ' · Crystalforge 2pc' : ''}`,
    },
  ];

  return {
    total: parts.reduce((t, p) => t + p.dps, 0),
    parts,
    spellPower: sp,
    spellCritPct: critPct,
    bonuses,
    assumptions: A,
  };
}

// Convenience for a runner result (or anything carrying { agg, evald, items }) — the shape the
// Compare tab and the set cards both hand around.
export function dpsForResult(r, opts = {}) {
  if (!r || !r.agg) return null;
  return computeDPS(r.agg, { evald: r.evald, items: r.items, ...opts });
}
