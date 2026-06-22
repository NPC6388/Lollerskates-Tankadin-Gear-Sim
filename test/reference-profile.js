// The guide's T4/T5 reference profile (index.html:574-646).
// M1's done-gate: the engine must reproduce these numbers exactly.

export const REFERENCE_PROFILE = {
  // Melee
  attackPower: 436,
  meleeHitPct: 3.0,
  meleeCritPct: 6.29,
  expertise: 5,
  // Spell
  spellDamage: 639,
  spellHitPct: 4.11,
  spellCritPct: 7.86,
  // Defense
  armor: 15139,
  defenseSkill: 500,
  blockChancePct: 24.32, // gear block, Holy Shield NOT included
  dodgePct: 16.47,
  parryPct: 16.00,
  totalAvoidancePct: 67.79, // miss + dodge + parry + block (guide sheet value)
  // Weapon
  weaponSpeed: 1.8,
  weaponDps: 41.1,
};

// Raid-buffed values used for all of the guide's TPS/threat math (index.html:637-646).
export const RAID_BUFFED = {
  spellDamage: 709,
  meleeCritPct: 9.5,
  spellCritPct: 11,
  weaponSpeed: 1.8,
  justicar2pc: true,
  justicar4pc: true,
  improvedHolyShield: true,
};
