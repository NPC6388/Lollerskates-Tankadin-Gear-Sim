// Curated community best-in-slot reference for TBC Protection Paladin tanking, by content
// phase (1-5) and slot. Source: Wowhead's per-phase "Protection Paladin Tank Best in Slot"
// guides, extracted 2026-06-30. Up to 3 picks per slot - the guide's primary recommendation
// first, then its top listed alternates (filtered to items whose real equip slot matches).
// REFERENCE ONLY: this is independent of your owned gear and the optimizer never selects from
// it - a "what to chase" list shown at the end of each slot's dropdown. Wowhead links and icons
// render from the id. Slot keys match the paper doll; ring1/ring2 share 'ring' and trinket1/
// trinket2 share 'trinket'.
// Manual curator additions (not from the Wowhead scrape) carry a `note` shown as an ⓘ tooltip:
//   - Tome of Fiery Redemption (30447): an on-use +spell-damage proc the model can't score, so it
//     never appears in the auto lists — but it's stronger single-target threat than Eye of
//     Magtheridon, so it's added to the early-phase trinket lists by hand.
export const BIS_PHASES = [1, 2, 3, 4, 5];
export const BIS = {
  1: {
    head: [{ id: 29068, name: 'Justicar Faceguard' }, { id: 32083, name: 'Faceguard of Determination' }, { id: 28593, name: 'Eternium Greathelm' }],
    neck: [{ id: 28516, name: 'Barbed Choker of Discipline' }, { id: 28245, name: 'Pendant of Dominance' }, { id: 28530, name: 'Brooch of Unquenchable Fury' }],
    shoulder: [{ id: 29070, name: 'Justicar Shoulderguards' }, { id: 27706, name: 'Gladiator\'s Lamellar Shoulders' }, { id: 28743, name: 'Mantle of Abrahmis' }],
    back: [{ id: 27804, name: 'Devilshark Cape' }, { id: 28766, name: 'Ruby Drape of the Mysticant' }, { id: 28660, name: 'Gilded Thorium Cloak' }],
    chest: [{ id: 29066, name: 'Justicar Chestguard' }, { id: 28597, name: 'Panzar\'Thar Breastplate' }, { id: 27702, name: 'Gladiator\'s Lamellar Chestpiece' }],
    wrist: [{ id: 29252, name: 'Bracers of Dignity' }, { id: 23538, name: 'Bracers of the Green Fortress' }, { id: 28643, name: 'General\'s Lamellar Bracers' }],
    hands: [{ id: 29067, name: 'Justicar Handguards' }, { id: 28518, name: 'Iron Gauntlets of the Maiden' }, { id: 30741, name: 'Topaz-Studded Battlegrips' }],
    waist: [{ id: 29253, name: 'Girdle of Valorous Deeds' }, { id: 28566, name: 'Crimson Girdle of the Indomitable' }, { id: 28641, name: 'General\'s Lamellar Belt' }],
    legs: [{ id: 28621, name: 'Wrynn Dynasty Greaves' }, { id: 29069, name: 'Justicar Legguards' }, { id: 27705, name: 'Gladiator\'s Lamellar Legguards' }],
    feet: [{ id: 29254, name: 'Boots of the Righteous Path' }, { id: 30641, name: 'Boots of Elusion' }, { id: 28642, name: 'General\'s Lamellar Greaves' }],
    ring: [{ id: 28407, name: 'Elementium Band of the Sentry' }, { id: 29172, name: 'Ashyen\'s Gift' }, { id: 29279, name: 'Violet Signet of the Great Protector' }],
    trinket: [{ id: 27529, name: 'Figurine of the Colossus' }, { id: 28528, name: 'Moroes\' Lucky Pocket Watch' }, { id: 23836, name: 'Goblin Rocket Launcher' }, { id: 30447, name: 'Tome of Fiery Redemption', note: 'Hard to model (on-use +spell-damage proc), so it\'s left out of the auto-generated list — but it\'s stronger single-target threat than Eye of Magtheridon.' }],
    weapon: [{ id: 32450, name: 'Gladiator\'s Gavel' }, { id: 28802, name: 'Bloodmaw Magus-Blade' }, { id: 30832, name: 'Gavel of Unearthed Secrets' }],
    offhand: [{ id: 28825, name: 'Aldori Legacy Defender' }, { id: 28358, name: 'Gladiator\'s Shield Wall' }, { id: 28606, name: 'Shield of Impenetrable Darkness' }],
    relic: [{ id: 29388, name: 'Libram of Repentance' }, { id: 27917, name: 'Libram of the Eternal Rest' }],
  },
  2: {
    head: [{ id: 30125, name: 'Crystalforge Faceguard' }, { id: 29068, name: 'Justicar Faceguard' }, { id: 32473, name: 'Tankatronic Goggles' }],
    neck: [{ id: 30007, name: 'The Darkener\'s Grasp' }, { id: 28530, name: 'Brooch of Unquenchable Fury' }, { id: 30008, name: 'Pendant of the Lost Ages' }],
    shoulder: [{ id: 29070, name: 'Justicar Shoulderguards' }, { id: 30127, name: 'Crystalforge Shoulderguards' }, { id: 28743, name: 'Mantle of Abrahmis' }],
    back: [{ id: 29925, name: 'Phoenix-Wing Cloak' }, { id: 28766, name: 'Ruby Drape of the Mysticant' }, { id: 27804, name: 'Devilshark Cape' }],
    chest: [{ id: 29066, name: 'Justicar Chestguard' }, { id: 30123, name: 'Crystalforge Chestguard' }, { id: 28597, name: 'Panzar\'Thar Breastplate' }],
    wrist: [{ id: 32515, name: 'Wristguards of Determination' }, { id: 29252, name: 'Bracers of Dignity' }, { id: 23538, name: 'Bracers of the Green Fortress' }],
    hands: [{ id: 29998, name: 'Royal Gauntlets of Silvermoon' }, { id: 30124, name: 'Crystalforge Handguards' }, { id: 29067, name: 'Justicar Handguards' }],
    waist: [{ id: 30034, name: 'Belt of the Guardian' }, { id: 30096, name: 'Girdle of the Invulnerable' }, { id: 29253, name: 'Girdle of Valorous Deeds' }],
    legs: [{ id: 30126, name: 'Crystalforge Legguards' }, { id: 28621, name: 'Wrynn Dynasty Greaves' }, { id: 29069, name: 'Justicar Legguards' }],
    feet: [{ id: 30033, name: 'Boots of the Protector' }, { id: 32267, name: 'Boots of the Resilient' }, { id: 29254, name: 'Boots of the Righteous Path' }],
    ring: [{ id: 33054, name: 'The Seal of Danzalar' }, { id: 30083, name: 'Ring of Sundered Souls' }, { id: 30028, name: 'Seventh Ring of the Tirisfalen' }],
    trinket: [{ id: 27529, name: 'Figurine of the Colossus' }, { id: 28528, name: 'Moroes\' Lucky Pocket Watch' }, { id: 27891, name: 'Adamantine Figurine' }, { id: 30447, name: 'Tome of Fiery Redemption', note: 'Hard to model (on-use +spell-damage proc), so it\'s left out of the auto-generated list — but it\'s stronger single-target threat than Eye of Magtheridon.' }],
    weapon: [{ id: 32963, name: 'Merciless Gladiator\'s Gavel' }, { id: 30095, name: 'Fang of the Leviathan' }, { id: 28802, name: 'Bloodmaw Magus-Blade' }],
    offhand: [{ id: 28825, name: 'Aldori Legacy Defender' }, { id: 32045, name: 'Merciless Gladiator\'s Shield Wall' }, { id: 33313, name: 'Merciless Gladiator\'s Barrier' }],
    relic: [{ id: 29388, name: 'Libram of Repentance' }, { id: 27917, name: 'Libram of the Eternal Rest' }],
  },
  3: {
    head: [{ id: 32521, name: 'Faceplate of the Impenetrable' }, { id: 30987, name: 'Lightbringer Faceguard' }, { id: 30125, name: 'Crystalforge Faceguard' }],
    neck: [{ id: 32362, name: 'Pendant of Titans' }, { id: 30007, name: 'The Darkener\'s Grasp' }, { id: 33921, name: 'Vindicator\'s Pendant of Dominance' }],
    shoulder: [{ id: 30998, name: 'Lightbringer Shoulderguards' }, { id: 29070, name: 'Justicar Shoulderguards' }, { id: 32250, name: 'Pauldrons of Abyssal Fury' }],
    back: [{ id: 34010, name: 'Pepe\'s Shroud of Pacification' }, { id: 29925, name: 'Phoenix-Wing Cloak' }, { id: 28766, name: 'Ruby Drape of the Mysticant' }],
    chest: [{ id: 30991, name: 'Lightbringer Chestguard' }, { id: 30896, name: 'Glory of the Defender' }, { id: 33695, name: 'Vengeful Gladiator\'s Lamellar Chestpiece' }],
    wrist: [{ id: 32279, name: 'The Seeker\'s Wristguards' }, { id: 32232, name: 'Eternium Shell Bracers' }, { id: 33889, name: 'Vindicator\'s Lamellar Bracers' }],
    hands: [{ id: 30985, name: 'Lightbringer Handguards' }, { id: 29998, name: 'Royal Gauntlets of Silvermoon' }, { id: 30124, name: 'Crystalforge Handguards' }],
    waist: [{ id: 32342, name: 'Girdle of Mighty Resolve' }, { id: 32333, name: 'Girdle of Stability' }, { id: 30096, name: 'Girdle of the Invulnerable' }],
    legs: [{ id: 30995, name: 'Lightbringer Legguards' }, { id: 32263, name: 'Praetorian\'s Legguards' }, { id: 33698, name: 'Vengeful Gladiator\'s Lamellar Legguards' }],
    feet: [{ id: 32245, name: 'Tide-stomper\'s Greaves' }, { id: 32267, name: 'Boots of the Resilient' }, { id: 30894, name: 'Blue Suede Shoes' }],
    ring: [{ id: 30083, name: 'Ring of Sundered Souls' }, { id: 32261, name: 'Band of the Abyssal Lord' }, { id: 29172, name: 'Ashyen\'s Gift' }],
    trinket: [{ id: 31858, name: 'Darkmoon Card: Vengeance' }, { id: 31859, name: 'Darkmoon Card: Madness' }, { id: 23836, name: 'Goblin Rocket Launcher' }],
    weapon: [{ id: 30910, name: 'Tempest of Chaos' }, { id: 33687, name: 'Vengeful Gladiator\'s Gavel' }, { id: 34009, name: 'Hammer of Judgement' }],
    offhand: [{ id: 32375, name: 'Bulwark of Azzinoth' }, { id: 30909, name: 'Antonidas\'s Aegis of Rapt Concentration' }, { id: 30889, name: 'Kaz\'rogal\'s Hardened Heart' }],
    relic: [{ id: 29388, name: 'Libram of Repentance' }, { id: 32368, name: 'Tome of the Lightbringer' }, { id: 27917, name: 'Libram of the Eternal Rest' }],
  },
  4: {
    head: [{ id: 32521, name: 'Faceplate of the Impenetrable' }, { id: 30987, name: 'Lightbringer Faceguard' }, { id: 33421, name: 'Battleworn Tuskguard' }],
    neck: [{ id: 32362, name: 'Pendant of Titans' }, { id: 30007, name: 'The Darkener\'s Grasp' }, { id: 33921, name: 'Vindicator\'s Pendant of Dominance' }],
    shoulder: [{ id: 30998, name: 'Lightbringer Shoulderguards' }, { id: 29070, name: 'Justicar Shoulderguards' }, { id: 33481, name: 'Pauldrons of Stone Resolve' }],
    back: [{ id: 34010, name: 'Pepe\'s Shroud of Pacification' }, { id: 33593, name: 'Slikk\'s Cloak of Placation' }, { id: 29925, name: 'Phoenix-Wing Cloak' }],
    chest: [{ id: 30991, name: 'Lightbringer Chestguard' }, { id: 30896, name: 'Glory of the Defender' }, { id: 33473, name: 'Chestguard of the Warlord' }],
    wrist: [{ id: 32279, name: 'The Seeker\'s Wristguards' }, { id: 32232, name: 'Eternium Shell Bracers' }, { id: 33889, name: 'Vindicator\'s Lamellar Bracers' }],
    hands: [{ id: 30985, name: 'Lightbringer Handguards' }, { id: 29998, name: 'Royal Gauntlets of Silvermoon' }, { id: 33517, name: 'Bonefist Gauntlets' }],
    waist: [{ id: 32342, name: 'Girdle of Mighty Resolve' }, { id: 33524, name: 'Girdle of the Protector' }, { id: 32333, name: 'Girdle of Stability' }],
    legs: [{ id: 30995, name: 'Lightbringer Legguards' }, { id: 32263, name: 'Praetorian\'s Legguards' }, { id: 33515, name: 'Unwavering Legguards' }],
    feet: [{ id: 32245, name: 'Tide-stomper\'s Greaves' }, { id: 33523, name: 'Sabatons of the Righteous Defender' }, { id: 32267, name: 'Boots of the Resilient' }],
    ring: [{ id: 30083, name: 'Ring of Sundered Souls' }, { id: 32261, name: 'Band of the Abyssal Lord' }, { id: 29172, name: 'Ashyen\'s Gift' }],
    trinket: [{ id: 31858, name: 'Darkmoon Card: Vengeance' }, { id: 31859, name: 'Darkmoon Card: Madness' }, { id: 23836, name: 'Goblin Rocket Launcher' }],
    weapon: [{ id: 30910, name: 'Tempest of Chaos' }, { id: 33687, name: 'Vengeful Gladiator\'s Gavel' }, { id: 34009, name: 'Hammer of Judgement' }],
    offhand: [{ id: 32375, name: 'Bulwark of Azzinoth' }, { id: 30909, name: 'Antonidas\'s Aegis of Rapt Concentration' }, { id: 30889, name: 'Kaz\'rogal\'s Hardened Heart' }],
    relic: [{ id: 29388, name: 'Libram of Repentance' }, { id: 32368, name: 'Tome of the Lightbringer' }, { id: 33504, name: 'Libram of Divine Purpose' }],
  },
  5: {
    head: [{ id: 34243, name: 'Helm of Burning Righteousness' }, { id: 34345, name: 'Crown of Anasterian' }, { id: 34401, name: 'Helm of Uther\'s Resolve' }],
    neck: [{ id: 34178, name: 'Collar of the Pit Lord' }, { id: 30007, name: 'The Darkener\'s Grasp' }, { id: 32362, name: 'Pendant of Titans' }],
    shoulder: [{ id: 34193, name: 'Spaulders of the Thalassian Savior' }, { id: 34389, name: 'Spaulders of the Thalassian Defender' }, { id: 34192, name: 'Pauldrons of Perseverance' }],
    back: [{ id: 34190, name: 'Crimson Paragon\'s Cover' }, { id: 33593, name: 'Slikk\'s Cloak of Placation' }, { id: 28766, name: 'Ruby Drape of the Mysticant' }],
    chest: [{ id: 34216, name: 'Heroic Judicator\'s Chestguard' }, { id: 30991, name: 'Lightbringer Chestguard' }, { id: 34945, name: 'Shattrath Protectorate\'s Breastplate' }],
    wrist: [{ id: 34433, name: 'Lightbringer Wristguards' }, { id: 32232, name: 'Eternium Shell Bracers' }, { id: 32279, name: 'The Seeker\'s Wristguards' }],
    hands: [{ id: 34352, name: 'Borderland Fortress Grips' }, { id: 30985, name: 'Lightbringer Handguards' }, { id: 29998, name: 'Royal Gauntlets of Silvermoon' }],
    waist: [{ id: 34488, name: 'Lightbringer Waistguard' }, { id: 32342, name: 'Girdle of Mighty Resolve' }, { id: 33524, name: 'Girdle of the Protector' }],
    legs: [{ id: 34167, name: 'Legplates of the Holy Juggernaut' }, { id: 34382, name: 'Judicator\'s Legguards' }, { id: 30995, name: 'Lightbringer Legguards' }],
    feet: [{ id: 34560, name: 'Lightbringer Stompers' }, { id: 32245, name: 'Tide-stomper\'s Greaves' }, { id: 34947, name: 'Blue\'s Greaves of the Righteous Guardian' }],
    ring: [{ id: 34213, name: 'Ring of Hardened Resolve' }, { id: 34888, name: 'Ring of the Stalwart Protector' }, { id: 30083, name: 'Ring of Sundered Souls' }],
    trinket: [{ id: 34473, name: 'Commendation of Kael\'thas' }, { id: 31858, name: 'Darkmoon Card: Vengeance' }, { id: 31859, name: 'Darkmoon Card: Madness' }],
    weapon: [{ id: 35014, name: 'Brutal Gladiator\'s Gavel' }, { id: 30910, name: 'Tempest of Chaos' }, { id: 34176, name: 'Reign of Misery' }],
    offhand: [{ id: 34185, name: 'Sword Breaker\'s Bulwark' }, { id: 35094, name: 'Brutal Gladiator\'s Shield Wall' }, { id: 34986, name: 'Brutal Gladiator\'s Barrier' }],
    relic: [{ id: 29388, name: 'Libram of Repentance' }, { id: 32368, name: 'Tome of the Lightbringer' }, { id: 33504, name: 'Libram of Divine Purpose' }],
  },
};
