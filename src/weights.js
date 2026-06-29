// Stat-weight scales — the scoring functions for each goal.
// Transcribed from the guide's companion file `tankadin sixtyupgrades weights.md`.
// Threat scales are anchored to spellDamage; survival scales to stamina.

// Shared zero template so every scale lists the same keys.
const ZERO = {
  stamina: 0, intellect: 0, strength: 0, agility: 0,
  dodgeRating: 0, parryRating: 0, defenseRating: 0,
  blockRating: 0, blockValue: 0, blockValueBonus: 0,
  hitRating: 0, expertiseRating: 0,
  spellDamage: 0, spellHitRating: 0, spellCritRating: 0,
  health: 0, resilienceRating: 0, armor: 0,
  metaSockets: 0, redSockets: 0, yellowSockets: 0, blueSockets: 0,
};

const scale = (overrides) => ({ ...ZERO, ...overrides });

export const SCALES = {
  // 1. Threat — single target, below hit/exp caps
  threatSingleBelowCap: scale({
    intellect: 0.1, strength: 0.55, agility: 0.05, defenseRating: 0.04,
    blockRating: 0.3, hitRating: 0.85, expertiseRating: 1.1,
    spellDamage: 1.5, spellHitRating: 1.65, spellCritRating: 0.45,
    metaSockets: 18, redSockets: 13.5, yellowSockets: 9, blueSockets: 7,
  }),

  // 2. Threat — single target, at hit/exp/spell-hit caps (those zeroed)
  threatSingleAtCap: scale({
    intellect: 0.1, strength: 0.55, agility: 0.05, defenseRating: 0.04,
    blockRating: 0.3, spellDamage: 1.5, spellCritRating: 0.45,
    metaSockets: 18, redSockets: 13.5, yellowSockets: 9, blueSockets: 7,
  }),

  // 3. Threat — AOE (spell power rescaled up; Consecration scales per target)
  threatAOE: scale({
    intellect: 0.15, strength: 0.4, agility: 0.05, defenseRating: 0.06,
    blockRating: 0.6, hitRating: 0.5, expertiseRating: 0.7,
    // AOE trash is level ≤72 — only ~5% spell hit is needed (vs ~16% for a level-73 boss), and it's
    // reached easily, so spell hit is worth far less here than in a raid threat set.
    spellDamage: 2.5, spellHitRating: 0.5, spellCritRating: 0.7,
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
    stamina: 1, intellect: 0.1, strength: 0.02, agility: 1.10,
    dodgeRating: 1.06, parryRating: 0.85, defenseRating: 1.2,
    blockRating: 1.02, blockValue: 0.05, blockValueBonus: 0.05,
    hitRating: 0.1, expertiseRating: 0.2, spellDamage: 0.3, spellHitRating: 0.1,
    health: 0.08, resilienceRating: 0.05, armor: 0.06,
    metaSockets: 18, redSockets: 9, yellowSockets: 9, blueSockets: 12,
  }),

  // 6. Balanced — caps enforced as constraints; beyond them, 1 SP ~= 1 stamina with
  // survival mitigation (block/defense/dodge) edging ahead. For GearForge-style optimizers.
  balanced: scale({
    stamina: 1.0, intellect: 0.15, strength: 0.4, agility: 1.10,
    dodgeRating: 1.06, parryRating: 0.85, defenseRating: 1.2,
    blockRating: 1.2, blockValue: 0.05, blockValueBonus: 0.05,
    hitRating: 0.6, expertiseRating: 0.9, spellDamage: 1.0, spellHitRating: 1.1, spellCritRating: 0.3,
    health: 0.08, resilienceRating: 0.05, armor: 0.06,
    metaSockets: 18, redSockets: 9, yellowSockets: 9, blueSockets: 12,
  }),
};

// --- Ratio goal scales (the player's four sets) -------------------------------------------
// These score the itemization spent BEYOND the hard caps (uncrit/uncrush are gates, not scored).
// Each goal blends an EHP component, a threat component, and/or a stamina component in the
// ratio the player asked for. Sub-weights below are the RELATIVE value of stats within one
// component (1 stamina-point of EHP, 1 spell-power-point of threat); the blend weights set the
// cross-component ratio (e.g. 2:1). Avoidance/defense are intentionally ~absent — once the
// uncrush/crit gates are met they add nothing, and the gates already pull the set to the cap.
// Component sub-weights, exported so a UI can rebuild scales from tunable ratios (see blendScale).
export const PARTS = {
  // EHP values FULL avoidance over BLOCK once past the uncrush cap (reaching the cap is priced by
  // CAP_SCALE, block chance 2.5×). Beyond it a dodge/parry/miss negates a whole ~5k spike hit, while
  // a block only shaves block-value (~275) off a hit that still LANDS — so dodge/parry/miss are worth
  // far more here. dodge 1.1 / parry 0.9 sit a touch ABOVE stamina (1) to reflect that edge; block is
  // pulled down to 0.25 (≈ dodge/4.4). Block isn't taken lower because a SURVIVAL piece should still
  // beat a pure-THREAT one — drop it much further and the set abandons a block item for spell power
  // (the librams.test guardrail). defense 1.1 gives all of miss/dodge/parry (+block), so it stays
  // strong. agility edges dodge: less dodge/point but also armor (2/agi), melee crit, and Kings ×1.1.
  // TUNABLE — widen the dodge/parry vs block gap toward burst progression, narrow it toward farm.
  ehp: { stamina: 1, health: 0.08, armor: 0.06, agility: 1.15, dodgeRating: 1.1, parryRating: 0.9, defenseRating: 1.1, blockRating: 0.25, intellect: 0.05 },
  // spellCritRating: a spell crit adds +0.5x damage (CRIT_MULT.spell); ~0.3 per rating point
  // relative to spellDamage 1.0 — small, so it breaks near-ties toward crit rather than chasing it.
  threat: { spellDamage: 1, spellHitRating: 1.1, spellCritRating: 0.3, hitRating: 0.6, expertiseRating: 0.9, strength: 0.4, blockRating: 0.4, intellect: 0.1 },
  // aoeThreat is for level ≤72 trash: only ~5% spell hit is needed (vs ~16% for a raid boss) and it's
  // easily reached, so spellHitRating is weighted low here (don't chase hit you don't need).
  aoeThreat: { spellDamage: 1.4, spellHitRating: 0.3, spellCritRating: 0.4, hitRating: 0.5, expertiseRating: 0.7, strength: 0.35, blockRating: 0.6, intellect: 0.12 },
  sta: { stamina: 1 },
};

// Blend components into a scale. `ratio` maps PARTS keys -> weight, e.g. { threat: 2, sta: 1 }.
export function blendScale(ratio = {}) {
  const out = { ...ZERO };
  for (const [part, w] of Object.entries(ratio)) {
    const m = PARTS[part]; if (!m || !w) continue;
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + w * v;
  }
  return out;
}

// Beyond-cap objective scales for the optimizer's 'scale' objective.
export const GOAL_SCALES = {
  raidThreat: blendScale({ threat: 2, sta: 1 }),     // threat : stamina = 2 : 1
  survival:   blendScale({ ehp: 2, threat: 1 }),     // EHP : threat = 2 : 1
  aoeThreat:  blendScale({ aoeThreat: 2, sta: 1 }),  // threat : stamina = 2 : 1 (AOE threat)
  balanced2:  blendScale({ ehp: 1, threat: 1 }),     // EHP : threat = 1 : 1
};

// Goal -> scale mapping used by the goal picker ("the agent"). Resistance goals reuse
// the EHP scale for the tiebreak once the resistance target is met (see PLAN.md §4).
export const GOALS = {
  'raid-aoe-threat': { scale: 'threatAOE', uncrushable: 'optional' },
  'raid-st-threat': { scale: 'threatSingleBelowCap', atCapScale: 'threatSingleAtCap', uncrushable: 'optional' },
  'st-survival': { scale: 'survivalEHP', uncrushable: 'required' },
  'progression-spike': { scale: 'survivalUncrushable', uncrushable: 'required', staminaLean: true },
  'resistance-set': { scale: 'survivalEHP', uncrushable: 'optional', resistanceConstraint: true },
  'balanced': { scale: 'balanced', uncrittable: 'required', uncrushable: 'required' },
};
