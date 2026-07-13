-- Set evaluator — Lua port of src/character.js evaluateSet/passesGates.
-- Given a set's final sheet values, returns the same checks the tank spreadsheet computes:
-- crit immunity (heroic & raid), uncrushable status + crush surplus/deficit, avoidance totals,
-- and physical EHP. Matches the browser sim's evaluateSet to rounding.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local C = ns.engine.Constants
local Combat = ns.engine.Combat
local BASE, CAPS = C.BASE, C.CAPS

local Evaluate = {}
ns.engine.Evaluate = Evaluate

-- input shape (all final character-sheet values, like the spreadsheet columns):
--   defenseSkill, resilienceRating, missPct, dodgePct, parryPct, blockPct,
--   hsBlockBonus (30 base, or 35.32 with a block libram), armor, health, spellPower, blockValue,
--   damageTakenMult (optional; e.g. 0.94 with Improved Righteous Fury up)
function Evaluate.evaluateSet(s)
  local hsBonus = s.hsBlockBonus or 30 -- Holy Shield +30%, or 35.32 w/ block libram
  local critRed = Combat.critReduction(s.defenseSkill, s.resilienceRating or 0)

  local missP, dodgeP, parryP, blockP = s.missPct or 0, s.dodgePct or 0, s.parryPct or 0, s.blockPct or 0
  local actualAvoidance = missP + dodgeP + parryP
  local totalAvoidanceNoHS = actualAvoidance + blockP
  local totalAvoidanceWithHS = totalAvoidanceNoHS + hsBonus

  -- Encounter-adjusted crush avoidance (Holy Shield included): Illidan's Shear can't miss (drop miss);
  -- Sunwell Radiance = boss +5% hit (miss -5) and -20% to your dodge. Mirrors src/character.js.
  local illyAvoidance = dodgeP + parryP + blockP + hsBonus
  local swpAvoidance = math.max(0, missP - CAPS.sunwellHitReduction)
    + math.max(0, dodgeP - CAPS.sunwellDodgeReduction) + parryP + blockP + hsBonus

  -- Physical EHP = health behind armor mitigation. Avoidance is NOT multiplied in (diminishing
  -- returns; valued in the weight scales instead). Flat damage reduction (Imp RF) DOES fold in.
  local dmgTakenMult = s.damageTakenMult or 1
  local ehpPhysical = nil
  if s.armor ~= nil and s.health ~= nil then
    ehpPhysical = s.health / (1 - Combat.armorDR(s.armor)) / dmgTakenMult
  end

  return {
    -- Crit immunity (defense + resilience vs the boss's bonus crit)
    critReduction = critRed,
    heroicCritImmune = critRed + 1e-9 >= BASE.heroicBossCritVsPlayer,
    raidCritImmune = critRed + 1e-9 >= BASE.bossCritVsPlayer,
    heroicCritSurplus = critRed - BASE.heroicBossCritVsPlayer,
    raidCritSurplus = critRed - BASE.bossCritVsPlayer,

    -- Crush immunity (single-roll table must fill 102.4% with Holy Shield up)
    actualAvoidance = actualAvoidance,
    totalAvoidanceNoHS = totalAvoidanceNoHS,
    totalAvoidanceWithHS = totalAvoidanceWithHS,
    crushSurplus = totalAvoidanceWithHS - CAPS.uncrushableCombined,
    uncrushable = totalAvoidanceWithHS + 1e-9 >= CAPS.uncrushableCombined,

    -- Encounter-specific uncrushable. Illidan's Shear can't miss and is avoided at the LOWER 101.8%
    -- target (dodge+parry+block+HS); Sunwell keeps the 102.4% crush table on its reduced avoidance.
    illyAvoidance = illyAvoidance,
    illyUncrushable = illyAvoidance + 1e-9 >= CAPS.shearAvoidanceTarget,
    illyCrushSurplus = illyAvoidance - CAPS.shearAvoidanceTarget,
    swpAvoidance = swpAvoidance,
    swpUncrushable = swpAvoidance + 1e-9 >= CAPS.uncrushableCombined,
    swpCrushSurplus = swpAvoidance - CAPS.uncrushableCombined,

    -- Throughput / survival objectives
    spellPower = s.spellPower or 0,
    blockValue = s.blockValue or 0,
    health = s.health or 0,
    ehpPhysical = ehpPhysical,
  }
end

-- Does a set satisfy a goal's hard gates? (uncrittable always; uncrushable per goal)
-- opts = { raid (default true), requireUncrushable (default false), encounter ('illidan'|'sunwell'|nil) }
function Evaluate.passesGates(evald, opts)
  opts = opts or {}
  local raid = opts.raid
  if raid == nil then raid = true end
  -- NB: not the `a and b or c` idiom — raidCritImmune can be false, which would wrongly fall
  -- through to the heroic check. Branch explicitly.
  local critOk
  if raid then critOk = evald.raidCritImmune else critOk = evald.heroicCritImmune end
  if not opts.requireUncrushable then return critOk end
  local uncrush
  if opts.encounter == "sunwell" then uncrush = evald.swpUncrushable
  elseif opts.encounter == "illidan" then uncrush = evald.illyUncrushable
  else uncrush = evald.uncrushable end
  return critOk and uncrush
end

return Evaluate
