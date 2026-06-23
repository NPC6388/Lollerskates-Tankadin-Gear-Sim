// Professions model. The sim asks the user for their TWO professions; the perks here
// gate the gem/enchant solver (extra sockets, profession-locked gems/enchants) and add
// any flat stats. TBC-accurate: the gathering passives (Toughness/Master of Anatomy/
// Lifeblood) are WotLK, so Mining/Skinning/Herbalism grant no combat gear stat here.

// Each profession lists only its GEAR-RELEVANT perks. `extraSockets` are prismatic
// (accept any color). Flags are consumed by gems.js / enchants.js / gemsolver.js.
export const PROFESSIONS = {
  Blacksmithing: { extraSockets: { hands: 1, wrist: 1 } }, // socket gloves + bracers
  Jewelcrafting: { jcGems: true },        // unlocks JC-only gems (stronger, unique-equipped)
  Enchanting:    { ringEnchant: true },   // Enchant Ring – applies to BOTH rings
  Leatherworking:{ bracerFurLining: true },// Fur Lining (stamina / resistance on bracers)
  Engineering:   { tinkers: true },        // cloak/gloves tinkers (mostly utility in TBC)
  Tailoring:     {},                       // spellthreads are available to all in TBC
  Alchemy:       { mixology: true },       // stronger/longer flasks & elixirs
  Mining:        {},                       // no TBC combat passive
  Skinning:      {},                       // no TBC combat passive
  Herbalism:     {},                       // no TBC combat passive
};

export const PROFESSION_NAMES = Object.keys(PROFESSIONS);

// Resolve a chosen pair (e.g. ['Blacksmithing','Jewelcrafting']) into a flat capability
// set the solver can query. Unknown names are ignored.
export function professionPerks(chosen = []) {
  const perks = {
    jcGems: false, ringEnchant: false, bracerFurLining: false, tinkers: false,
    mixology: false, extraSockets: {}, names: [],
  };
  for (const name of chosen) {
    const p = PROFESSIONS[name];
    if (!p) continue;
    perks.names.push(name);
    if (p.jcGems) perks.jcGems = true;
    if (p.ringEnchant) perks.ringEnchant = true;
    if (p.bracerFurLining) perks.bracerFurLining = true;
    if (p.tinkers) perks.tinkers = true;
    if (p.mixology) perks.mixology = true;
    for (const [slot, n] of Object.entries(p.extraSockets || {})) {
      perks.extraSockets[slot] = (perks.extraSockets[slot] || 0) + n;
    }
  }
  return perks;
}
