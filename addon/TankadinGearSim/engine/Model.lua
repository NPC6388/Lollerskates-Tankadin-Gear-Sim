-- Model — Lua port of src/model.js: the FIRST-PRINCIPLES forward calc that turns a set of items
-- (raw ratings + stats) into the final character-sheet values evaluateSet() expects.
-- Data (base intercepts / talent mods / buffs) is generated in engine/CharacterData.lua; this is the
-- logic. Parity-checked against the JS by test/lua/model_parity.lua.
--
-- The in-game Live readout doesn't need this (it reads the sheet finals directly), but the OPTIMIZER
-- does: to score a candidate set it must forward-compute the sheet from a hypothetical item selection.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local C = ns.engine.Constants
local D = ns.engine.CharacterData
local RATING, BASE = C.RATING, C.BASE
local CHARACTER, TALENTS, BUFFS, STAT_KEYS = D.CHARACTER, D.TALENTS, D.BUFFS, D.STAT_KEYS

local Model = {}
ns.engine.Model = Model

local function copy(t)
  local o = {}
  for k, v in pairs(t) do o[k] = v end
  return o
end

-- Stat-affecting talent modifiers from a scanned rank map (talent name -> points). Absent ranks
-- fall back to the guide's Avenger's Shield (0/43/18) build, so an export without talents matches
-- the default TALENTS exactly. Mirrors model.js:talentsFromRanks.
function Model.talentsFromRanks(ranks)
  if not ranks or not next(ranks) then return copy(TALENTS) end
  local function r(name, def) local v = ranks[name]; if v ~= nil then return v else return def end end
  local sacredDuty = r("Sacred Duty", 2)
  local combatExpertise = r("Combat Expertise", 5)
  local toughness = r("Toughness", 5)
  local anticipation = r("Anticipation", 5)
  local deflection = r("Deflection", 5)
  local precision = r("Precision", 3)
  local impRF = r("Improved Righteous Fury", 3)
  return {
    anticipationDefenseSkill = anticipation * 4,
    deflectionParryPct = deflection * 1,
    toughnessItemArmorMult = 1 + toughness * 0.02,
    staminaMult = 1 + sacredDuty * 0.03 + combatExpertise * 0.02,
    combatExpertise = combatExpertise * 1,
    precisionSpellHitPct = precision * 1,
    precisionMeleeHitPct = precision * 1,
    impRighteousFuryDR = impRF * 0.02, -- -2/-4/-6% damage taken while Righteous Fury is up
  }
end

-- Sum the STAT_KEYS across a list of items (each item = { stats = { key = value, ... } }).
function Model.sumStats(items)
  local t = {}
  for _, k in ipairs(STAT_KEYS) do t[k] = 0 end
  for _, it in ipairs(items) do
    local s = it.stats or {}
    for _, k in ipairs(STAT_KEYS) do t[k] = t[k] + (s[k] or 0) end
  end
  return t
end

-- TBC stamina->health: first 20 stamina give 1 HP each, the rest give 10 HP each.
local function healthFromStamina(stam)
  if stam <= 20 then return stam end
  return 20 + (stam - 20) * CHARACTER.hpPerStamina
end

-- items -> evaluateSet() input shape, computed from scratch. opts:
--   hsBlockBonus (default 30), buffs (flat stat block added on top of gear), flatArmor (bypasses
--   Toughness), kings (apply the +10% Blessing of Kings multiplier), talents (override TALENTS).
-- Mirrors model.js:aggregate.
function Model.aggregate(items, opts)
  opts = opts or {}
  local hsBlockBonus = opts.hsBlockBonus
  if hsBlockBonus == nil then hsBlockBonus = 30 end
  local buffs = opts.buffs or {}
  local flatArmor = opts.flatArmor or 0
  local kMult = opts.kings and BUFFS.kingsMult or 1.0

  local Ch = CHARACTER
  local T = TALENTS
  if opts.talents then
    T = copy(TALENTS)
    for k, v in pairs(opts.talents) do T[k] = v end
  end

  local t = Model.sumStats(items)
  local function b(k) return (t[k] or 0) + (buffs[k] or 0) end

  local defenseSkill =
    BASE.baseDefenseSkill + b("defenseRating") / RATING.defensePerSkill + T.anticipationDefenseSkill
  local defBonus = (defenseSkill - BASE.baseDefenseSkill) * BASE.defenseBenefitPerSkill

  local agility = (Ch.baseAgility + b("agility")) * kMult
  local strength = (Ch.baseStrength + b("strength")) * kMult
  local intellect = (Ch.baseIntellect + b("intellect")) * kMult
  local stamina = (Ch.baseStamina + b("stamina")) * T.staminaMult * kMult

  return {
    defenseSkill = defenseSkill,
    resilienceRating = b("resilienceRating"),
    missPct = BASE.baseMissChance + defBonus,
    dodgePct = Ch.baseDodgePct + agility / Ch.agilityPerDodgePct + b("dodgeRating") / RATING.dodgePer1 + defBonus,
    parryPct = Ch.baseParryPct + T.deflectionParryPct + b("parryRating") / RATING.parryPer1 + defBonus,
    blockPct = Ch.baseBlockPct + b("blockRating") / RATING.blockPer1 + defBonus,
    hsBlockBonus = hsBlockBonus,
    -- Toughness boosts armor FROM ITEMS only; flatArmor (e.g. Scroll of Protection) bypasses it.
    armor = agility * Ch.armorPerAgility + b("armor") * T.toughnessItemArmorMult + flatArmor,
    -- Improved Righteous Fury: -N% damage taken while RF is up (folded into EHP by evaluateSet).
    damageTakenMult = 1 - (T.impRighteousFuryDR or 0),
    health = Ch.baseHealth + healthFromStamina(stamina),
    stamina = stamina,
    agility = agility,
    strength = strength,
    intellect = intellect,
    spellPower = b("spellDamage"),
    spellCritRating = b("spellCritRating"),
    -- Block value = shield base block + item block-value + Strength/20 (TBC: 1 BV per 20 Str).
    blockValue = b("blockValue") + math.floor(strength / 20),
    _raw = t,
  }
end

return Model
