// Libram (relic) effect DB. Librams provide their value through a special EQUIP effect that the
// tooltip parser doesn't capture as a plain stat (e.g. "+47 Consecration damage"), so we model each
// known Prot libram as an EFFECTIVE stat block scored by the weight scales. This OVERRIDES the
// item's parsed stats for matched librams (so there's no double-count and the value is consistent).
//
// Matched by item id (canonical) or a name regex (robust when the export lacks ids). Add entries as
// new tanking librams come up — keep the modeled stat honest to the tooltip.
//
// We express each libram with stats the weight scales already use (the same stats Sixty Upgrades
// understands) — no invented pseudo-stats. A flat +damage effect is converted to its EQUIVALENT spell
// damage via the spell's coefficient, so the existing spellDamage weights (higher under AOE, where
// Consecration scales per target) value it. Modeled as full spell damage is a slight over-credit for
// pure single-target (the effect only feeds Consecration, not the whole rotation) — tune here if needed.
//
// Conditionality note: Libram of Repentance's block bonus needs Holy Shield ACTIVE — ~always up
// single-target, but consumed early in AOE, so it's weakest exactly where the Consecration libram shines.
export const LIBRAMS = [
  { ids: [29388], match: /libram of repentance/i, stats: { blockRating: 42 } },        // +42 block rating while Holy Shield up
  // +47 Consecration damage. Raw coefficient inversion (÷~0.95) ≈ 49 SP of Consecration OUTPUT, but
  // that over-credits: real spell damage feeds the whole rotation, this only feeds Consecration. Modeled
  // at ~35 effective spell damage — enough that it wins the threat-leaning sets (and especially AOE,
  // where the scale weights spell damage higher because Consecration hits every target) while the block
  // libram still wins survival. A single spell-damage number can't make it AOE-ONLY; tune here.
  { ids: [32368], match: /libram of (the )?eternal rest/i, stats: { spellDamage: 35 } },
];

// Modeled stats for an item if it's a known libram, else null.
export function libramStats(item = {}) {
  for (const L of LIBRAMS) {
    if ((L.ids && L.ids.includes(item.itemId)) || (L.match && L.match.test(item.name || ''))) {
      return { ...L.stats };
    }
  }
  return null;
}
