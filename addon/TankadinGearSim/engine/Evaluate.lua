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

  local actualAvoidance = (s.missPct or 0) + (s.dodgePct or 0) + (s.parryPct or 0)
  local totalAvoidanceNoHS = actualAvoidance + (s.blockPct or 0)
  local totalAvoidanceWithHS = totalAvoidanceNoHS + hsBonus

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

    -- Throughput / survival objectives
    spellPower = s.spellPower or 0,
    blockValue = s.blockValue or 0,
    health = s.health or 0,
    ehpPhysical = ehpPhysical,
  }
end

-- Does a set satisfy a goal's hard gates? (uncrittable always; uncrushable per goal)
-- opts = { raid (default true), requireUncrushable (default false) }
function Evaluate.passesGates(evald, opts)
  opts = opts or {}
  local raid = opts.raid
  if raid == nil then raid = true end
  -- NB: not the `a and b or c` idiom — raidCritImmune can be false, which would wrongly fall
  -- through to the heroic check. Branch explicitly.
  local critOk
  if raid then critOk = evald.raidCritImmune else critOk = evald.heroicCritImmune end
  return critOk and (not opts.requireUncrushable or evald.uncrushable)
end

return Evaluate
