-- Defensive combat model + hard-cap engine — Lua port of src/combat.js.
-- Turns final sheet stats into the survival quantities the readout shows: crit immunity,
-- uncrushable status, avoidance, armor/resistance mitigation, EHP. Math traces to the guide's
-- #combat-table and #block-mechanics sections and matches the browser sim to rounding.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local C = ns.engine.Constants
local BASE, CAPS, RATING = C.BASE, C.CAPS, C.RATING

local Combat = {}
ns.engine.Combat = Combat

-- Defense skill from defense rating (above the level-350 base is added separately).
function Combat.defenseSkillFromRating(defenseRating)
  return defenseRating / RATING.defensePerSkill
end

-- % chance a boss melee swing misses you. 5% base + 0.04%/defense-skill over the 350 base.
function Combat.missChance(defenseSkill)
  return BASE.baseMissChance + (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill
end

-- Crit chance removed from the attack table by defense skill + resilience.
-- Defense above base gives 0.04%/skill; resilience gives 1% per RATING.resiliencePer1.
function Combat.critReduction(defenseSkill, resilienceRating)
  resilienceRating = resilienceRating or 0
  local fromDefense = (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill
  local fromResilience = resilienceRating / RATING.resiliencePer1
  return fromDefense + fromResilience
end

-- Uncrittable when the removed crit >= the boss's crit chance (5.6% vs level 73).
function Combat.isUncrittable(defenseSkill, resilienceRating, bossCrit)
  bossCrit = bossCrit or BASE.bossCritVsPlayer
  return Combat.critReduction(defenseSkill, resilienceRating) + 1e-9 >= bossCrit
end

-- Combined avoidance for the crush table. Holy Shield adds +30% block while active.
-- `t` = { miss, dodge, parry, block, holyShieldActive (default true) }.
function Combat.combinedAvoidance(t)
  local holyShieldActive = t.holyShieldActive
  if holyShieldActive == nil then holyShieldActive = true end
  local effBlock = t.block + (holyShieldActive and C.THREAT.holyShieldActive or 0)
  return t.miss + t.dodge + t.parry + effBlock
end

-- Uncrushable when combined avoidance >= 102.4%. Accepts a number or an avoidance table.
function Combat.isUncrushable(avoid)
  local combined = type(avoid) == "number" and avoid or Combat.combinedAvoidance(avoid)
  return combined + 1e-9 >= CAPS.uncrushableCombined
end

-- Physical damage reduction from armor vs an attacker level (default raid boss 73), capped 75%.
function Combat.armorDR(armor, attackerLevel)
  attackerLevel = attackerLevel or BASE.raidBossLevel
  local dr = armor / (armor + C.ARMOR_CONST(attackerLevel))
  return math.min(dr, 0.75)
end

-- Average spell mitigation from resistance vs a caster level (default 73).
function Combat.resistanceMitigation(resistance, casterLevel)
  casterLevel = casterLevel or BASE.raidBossLevel
  local raw = (resistance / C.RESIST_DENOM(casterLevel)) * C.RESIST_MAX_MITIGATION
  return math.min(raw, C.RESIST_MAX_MITIGATION)
end

-- Effective health vs physical: raw health scaled by armor mitigation and by the portion of
-- swings that land (1 - full-avoidance). Block value is handled elsewhere.
function Combat.effectiveHealthPhysical(health, armor, fullAvoidancePct, attackerLevel)
  local armorMult = 1 / (1 - Combat.armorDR(armor, attackerLevel))
  local avoidMult = 1 / (1 - fullAvoidancePct / 100)
  return health * armorMult * avoidMult
end

-- Resistance totals for the lighter (~50%) and capped (75%) targets vs a caster level.
-- At level 73 these are the canonical 244 / 365 breakpoints.
function Combat.resistanceTargets(casterLevel)
  casterLevel = casterLevel or BASE.raidBossLevel
  local cap = C.RESIST_DENOM(casterLevel)                 -- 365 at level 73
  local half = math.floor(244 * (cap / C.RESIST_DENOM()) + 0.5) -- Math.round -> 244 at level 73
  return { half = half, cap = cap }
end

return Combat
