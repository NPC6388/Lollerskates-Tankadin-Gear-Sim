// Proc / on-use trinket DB. Some trinkets carry most (or all) of their value in a temporary buff
// that `GetItemStats` reports as NOTHING — Tome of Fiery Redemption exports with an empty stat
// block, so the optimizer scored it as a dead slot and every set that locked it lost ~55 spell
// power it was actually getting in game.
//
// Each entry models the buff as its UPTIME-AVERAGED equivalent in stats the weight scales already
// use (no invented pseudo-stats), exactly like src/librams.js does for libram equip effects. The
// difference: libram stats REPLACE the parsed stats, these are ADDED on top — a proc trinket can
// also carry real passive stats (Icon of the Silver Crescent is +43 spell damage AND an on-use).
//
// Uptime is the honest lever here and it is gear//rotation/fight-length dependent, so every entry
// records where its number came from. Prefer a measured raid log over a theoretical proc rate.
//
// Matched by item id (canonical) or a name regex (robust when the export lacks ids). `nameMatch`
// carries the SAME literal lowercase substrings the regex tests for — it's the regex-free form the
// generated Lua port (engine/ProcsData.lua) uses, since Lua has no JS regex. Keep the two in sync.
export const PROCS = [
  // Blessing of Righteousness: +290 spell damage while up. Measured at 22.69% uptime across a 4h
  // raid (single-target tanking, player's own logs) -> 290 * 0.2269 = 65.8 effective spell damage.
  // That puts it comfortably ahead of Eye of Magtheridon (+41 passive) for single-target threat,
  // which matches how it plays. Re-measure and update this if the rotation or fight length shifts.
  {
    ids: [30447],
    match: /tome of fiery redemption/i,
    nameMatch: ['tome of fiery redemption'],
    stats: { spellDamage: 66 },
    note: '+290 spell damage proc at 22.69% measured uptime (~66 SP average)',
  },
];

// Modeled ADDITIVE stats for an item if it's a known proc/on-use trinket, else null.
export function procStats(item = {}) {
  for (const P of PROCS) {
    if ((P.ids && P.ids.includes(item.itemId)) || (P.match && P.match.test(item.name || ''))) {
      return { ...P.stats };
    }
  }
  return null;
}

// The human-readable reason a proc item scores above its tooltip stats (for UI notes); null if none.
export function procNote(item = {}) {
  for (const P of PROCS) {
    if ((P.ids && P.ids.includes(item.itemId)) || (P.match && P.match.test(item.name || ''))) {
      return P.note || null;
    }
  }
  return null;
}
