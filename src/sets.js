// Tier set-bonus detection. The import parser doesn't tag set membership, so we resolve
// it by item ID. Covers the TBC Prot Paladin tier sets and the threat/TPS-affecting
// bonuses; survival-only bonuses are detected too so the UI can show them.

import { THREAT } from './constants.js';

// itemId -> set name. Justicar = T4 (Karazhan/Gruul/Mag), Crystalforge = T5 (SSC/TK).
export const SET_DB = {
  // Justicar Armor (T4)
  29068: 'Justicar', // Faceguard (head)
  29070: 'Justicar', // Shoulderguards
  29066: 'Justicar', // Chestguard
  29067: 'Justicar', // Handguards
  29069: 'Justicar', // Legguards
  // Crystalforge Armor (T5)
  30121: 'Crystalforge', // Faceguard (head)
  30125: 'Crystalforge', // Pauldrons (shoulder)
  30123: 'Crystalforge', // Chestguard
  30124: 'Crystalforge', // Handguards
  30126: 'Crystalforge', // Legguards
};

// Count equipped pieces per set (honors an explicit item.set tag, else the ID map).
export function setCounts(items) {
  const counts = {};
  for (const it of items) {
    const s = it.set || SET_DB[it.itemId];
    if (s) counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

// Each tier bonus modeled as an EQUIVALENT flat-stat bundle (same keys the weight scales use), so the
// optimizer can VALUE completing a set the same way it values stats — scored by the goal weights, so a
// threat set rewards these (threat) bonuses while a survival set rightly mostly shrugs. The threat
// bonuses are expressed as spell-power-equivalents from the threat model (src/threat.js) at ~800 SP:
//   Justicar 2pc  +10% seal damage          ≈ +19 TPS  → ~25-30 SP; modeled 20 (conservative)
//   Justicar 4pc  +15 dmg per Holy Shield block ≈ +13 TPS → ~21 SP; modeled 15
//   Crystalforge 2pc +15 Retribution Aura per hit taken (situational, tank-only) → modeled 12
//   Crystalforge 4pc +100 block value for 6s after Holy Shield → block value (survival, scored low)
// TUNABLE — these are rotation-dependent estimates; adjust as the threat model is refined.
export const SET_BONUS_STATS = {
  justicar2pc: { spellDamage: 20 },
  justicar4pc: { spellDamage: 15 },
  crystalforge2pc: { spellDamage: 12 },
  crystalforge4pc: { blockValue: 100 },
};

// Combined equivalent-stat bundle of every ACTIVE set bonus for a set of items (non-linear: 2pc/4pc
// thresholds). Add score(setBonusStats(items), weights) to a set's objective to value set completion.
export function setBonusStats(items) {
  const c = setCounts(items);
  const out = {};
  const add = (b) => { for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v; };
  if ((c.Justicar || 0) >= 2) add(SET_BONUS_STATS.justicar2pc);
  if ((c.Justicar || 0) >= 4) add(SET_BONUS_STATS.justicar4pc);
  if ((c.Crystalforge || 0) >= 2) add(SET_BONUS_STATS.crystalforge2pc);
  if ((c.Crystalforge || 0) >= 4) add(SET_BONUS_STATS.crystalforge4pc);
  return out;
}

// Active set bonuses + the combat modifiers they confer. Threat modifiers are returned
// so threat.js / a TPS objective can apply them; the per-set piece counts drive the UI.
export function setBonuses(items) {
  const counts = setCounts(items);
  const j = counts.Justicar || 0;
  const c = counts.Crystalforge || 0;
  return {
    counts,
    justicar: { pieces: j, twoPc: j >= 2, fourPc: j >= 4 },
    crystalforge: { pieces: c, twoPc: c >= 2, fourPc: c >= 4 },
    // --- combat modifiers (apply these where the relevant ability is computed) ---
    sealDamageMult: j >= 2 ? THREAT.justicar2pcSeal : 1.0,      // 2pc Justicar: +10% SoR/SoV/SoC
    holyShieldFlat: j >= 4 ? THREAT.justicar4pcHolyShield : 0,  // 4pc Justicar: +15/block
    retAuraBonus: c >= 2 ? THREAT.crystalforge2pcRetAura : 0,   // 2pc Crystalforge: +15/hit
    blockValueProc: c >= 4 ? THREAT.crystalforge4pcBlockValue : 0, // 4pc Crystalforge: +100 BV post-HS
  };
}
