// Libram (relic) effect DB. Librams provide their value through a special EQUIP effect that the
// tooltip parser doesn't capture as a plain stat (e.g. "+47 Consecration damage"), so we model each
// known Prot libram as an EFFECTIVE stat block scored by the weight scales. This OVERRIDES the
// item's parsed stats for matched librams (so there's no double-count and the value is consistent).
//
// Matched by item id (canonical) or a name regex (robust when the export lacks ids). Add entries as
// new tanking librams come up — keep the modeled stat honest to the tooltip.
//
// Conditionality note: Libram of Repentance's block bonus only applies while Holy Shield is ACTIVE.
// Single-target that's ~always up; in AOE the charges are consumed early so the bonus largely drops.
// We model it as flat blockRating (full uptime) — accurate for raid/survival — and let the AOE goal's
// AOE-threat weighting (where Consecration far outvalues block) make the Consecration libram win there.
export const LIBRAMS = [
  { ids: [29388], match: /libram of repentance/i, stats: { blockRating: 42 } },        // +42 block rating while Holy Shield up
  { ids: [32368], match: /libram of (the )?eternal rest/i, stats: { consecrationDamage: 47 } }, // +47 Consecration damage
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
