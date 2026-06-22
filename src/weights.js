// Stat-weight scales — the scoring functions for each goal.
// Transcribed from the guide's companion file `tankadin sixtyupgrades weights.md`.
// Threat scales are anchored to spellDamage; survival scales to stamina.

// Shared zero template so every scale lists the same keys.
const ZERO = {
  stamina: 0, intellect: 0, strength: 0, agility: 0,
  dodgeRating: 0, parryRating: 0, defenseRating: 0,
  blockRating: 0, blockValue: 0, blockValueBonus: 0,
  hitRating: 0, expertiseRating: 0,
  spellDamage: 0, spellHitRating: 0,
  health: 0, resilienceRating: 0, armor: 0,
  metaSockets: 0, redSockets: 0, yellowSockets: 0, blueSockets: 0,
};

const scale = (overrides) => ({ ...ZERO, ...overrides });

export const SCALES = {
  // 1. Threat — single target, below hit/exp caps
  threatSingleBelowCap: scale({
    intellect: 0.1, strength: 0.55, agility: 0.05, defenseRating: 0.04,
    blockRating: 0.3, hitRating: 0.85, expertiseRating: 1.1,
    spellDamage: 1.5, spellHitRating: 1.65,
    metaSockets: 18, redSockets: 13.5, yellowSockets: 9, blueSockets: 7,
  }),

  // 2. Threat — single target, at hit/exp/spell-hit caps (those zeroed)
  threatSingleAtCap: scale({
    intellect: 0.1, strength: 0.55, agility: 0.05, defenseRating: 0.04,
    blockRating: 0.3, spellDamage: 1.5,
    metaSockets: 18, redSockets: 13.5, yellowSockets: 9, blueSockets: 7,
  }),

  // 3. Threat — AOE (spell power rescaled up; Consecration scales per target)
  threatAOE: scale({
    intellect: 0.15, strength: 0.4, agility: 0.05, defenseRating: 0.06,
    blockRating: 0.6, hitRating: 0.5, expertiseRating: 0.7,
    spellDamage: 2.5, spellHitRating: 2.2,
    metaSockets: 18, redSockets: 22.5, yellowSockets: 14, blueSockets: 11,
  }),

  // 4. Survival — reaching/maintaining uncrushable (crush-removal premium on avoidance)
  survivalUncrushable: scale({
    stamina: 1, intellect: 0.1, strength: 0.02, agility: 1.45,
    dodgeRating: 1.76, parryRating: 1.41, defenseRating: 2.0,
    blockRating: 2.54, blockValue: 0.05, blockValueBonus: 0.05,
    hitRating: 0.1, expertiseRating: 0.2, spellDamage: 0.3, spellHitRating: 0.1,
    health: 0.08, resilienceRating: 0.05, armor: 0.06,
    metaSockets: 18, redSockets: 9, yellowSockets: 9, blueSockets: 12,
  }),

  // 5. Survival — uncrushable / EHP (farm; avoidance at face value)
  survivalEHP: scale({
    stamina: 1, intellect: 0.1, strength: 0.02, agility: 0.92,
    dodgeRating: 1.06, parryRating: 0.85, defenseRating: 1.2,
    blockRating: 1.02, blockValue: 0.05, blockValueBonus: 0.05,
    hitRating: 0.1, expertiseRating: 0.2, spellDamage: 0.3, spellHitRating: 0.1,
    health: 0.08, resilienceRating: 0.05, armor: 0.06,
    metaSockets: 18, redSockets: 9, yellowSockets: 9, blueSockets: 12,
  }),
};

// Goal -> scale mapping used by the goal picker ("the agent"). Resistance goals reuse
// the EHP scale for the tiebreak once the resistance target is met (see PLAN.md §4).
export const GOALS = {
  'raid-aoe-threat': { scale: 'threatAOE', uncrushable: 'optional' },
  'raid-st-threat': { scale: 'threatSingleBelowCap', atCapScale: 'threatSingleAtCap', uncrushable: 'optional' },
  'st-survival': { scale: 'survivalEHP', uncrushable: 'required' },
  'progression-spike': { scale: 'survivalUncrushable', uncrushable: 'required', staminaLean: true },
  'resistance-set': { scale: 'survivalEHP', uncrushable: 'optional', resistanceConstraint: true },
};
