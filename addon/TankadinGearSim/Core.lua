-- Core — reads the player's LIVE character-sheet finals and feeds them straight into the
-- ported evaluator (engine/Evaluate.lua). Because evaluateSet already takes final sheet values
-- (the spreadsheet columns), the in-game path needs no forward model or item pool: it reads what
-- the game already computed and returns crit/crush/EHP/avoidance. Recomputes on gear/stat events.

local ADDON, ns = ...
ns.Core = ns.Core or {}
local Core = ns.Core

local Evaluate = ns.engine.Evaluate
local Combat = ns.engine.Combat
local Const = ns.engine.Constants
local RATING = Const.RATING

local function safe(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, a, b = pcall(fn, ...)
  if ok then return a, b end
  return nil
end

-- The combat-rating indices that carry resilience (crit-taken reduction). We use the CR_* globals
-- (semantically correct on every build) rather than raw numbers so we never mis-read another stat.
local function critTakenIndices()
  local out, seen = {}, {}
  local function push(v) if v and not seen[v] then seen[v] = true; out[#out + 1] = v end end
  push(CR_CRIT_TAKEN_MELEE); push(CR_CRIT_TAKEN_SPELL); push(CR_CRIT_TAKEN_RANGED)
  return out
end

-- Resilience as an equivalent rating for evaluateSet. GetCombatRating(CR_CRIT_TAKEN_MELEE) returns
-- the rating, but on the Anniversary client that read can come back 0 — so if it does, fall back to
-- the % the game actually reports (GetCombatRatingBonus) and convert it to the rating that yields it.
-- (The website avoids this entirely by parsing resilience off item tooltips.)
local function liveResilienceRating()
  local idx = critTakenIndices()
  for _, i in ipairs(idx) do
    local rating = safe(GetCombatRating, i)
    if rating and rating > 0 then return rating end
  end
  for _, i in ipairs(idx) do
    local pct = safe(GetCombatRatingBonus, i) -- % crit-avoidance from resilience
    if pct and pct > 0 then return pct * RATING.resiliencePer1 end
  end
  return 0
end

-- Live defense SKILL (not rating): base + modifier from UnitDefense, with a rating fallback.
local function liveDefenseSkill()
  if type(UnitDefense) == "function" then
    local base, mod = safe(UnitDefense, "player")
    if base then return (base or 0) + (mod or 0) end
  end
  local level = safe(UnitLevel, "player") or 70
  local defBonus = (CR_DEFENSE_SKILL and safe(GetCombatRatingBonus, CR_DEFENSE_SKILL)) or 0
  return level * 5 + defBonus
end

-- Read the final sheet values evaluateSet() consumes. `opts.holyShield` (default true) toggles
-- the +30% block the Holy Shield uptime assumption adds to the crush table.
function Core.readSheet(opts)
  opts = opts or {}
  local holyShield = opts.holyShield
  if holyShield == nil then holyShield = true end

  local defenseSkill = liveDefenseSkill()
  local resilience = liveResilienceRating()

  return {
    defenseSkill = defenseSkill,
    resilienceRating = resilience,
    -- The game doesn't expose "miss vs boss"; derive it from defense skill exactly as the model
    -- does (src/model.js:124): 5% base + 0.04%/skill over 350.
    missPct = Combat.missChance(defenseSkill),
    dodgePct = safe(GetDodgeChance) or 0,
    parryPct = safe(GetParryChance) or 0,
    blockPct = safe(GetBlockChance) or 0,
    -- Holy Shield block bonus: 30% when assumed up, 0 when toggled off. (Block-libram 35.32 is a
    -- later refinement — needs relic-slot detection.)
    hsBlockBonus = holyShield and Const.THREAT.holyShieldActive or 0,
    armor = select(2, safe(UnitArmor, "player")) or 0,
    health = safe(UnitHealthMax, "player") or 0,
    spellPower = safe(GetSpellBonusDamage, 2) or 0, -- holy school
    blockValue = safe(GetShieldBlock) or 0,
    -- damageTakenMult (Improved Righteous Fury -6%) left at default 1 for the honest raw EHP;
    -- it's a constant factor and doesn't change any pass/fail. Aura detection is a later refinement.
  }
end

-- Full snapshot: the live input plus its evaluation. `opts` forwards to readSheet.
function Core.snapshot(opts)
  local input = Core.readSheet(opts)
  return { input = input, evald = Evaluate.evaluateSet(input) }
end

-- /tgs debug — print the raw API reads so a live-vs-website mismatch can be pinned to the exact
-- source (e.g. which resilience combat-rating index the client actually populates).
function Core.debug()
  local out = DEFAULT_CHAT_FRAME
  local function p(s) out:AddMessage("|cff7ee787TGS|r " .. s) end
  local input = Core.readSheet({})
  p(string.format("defenseSkill=%.2f  miss=%.2f  dodge=%.2f  parry=%.2f  block=%.2f",
    input.defenseSkill, input.missPct, input.dodgePct, input.parryPct, input.blockPct))
  p(string.format("resilienceRating=%.2f (crit red %.2f%%)  armor=%d  hp=%d  sp=%d  bv=%d",
    input.resilienceRating, Combat.critReduction(input.defenseSkill, input.resilienceRating),
    input.armor, input.health, input.spellPower, input.blockValue))
  -- Raw resilience reads per combat-rating index, so we can see which one the client fills.
  local names = { [CR_CRIT_TAKEN_MELEE or -1] = "MELEE", [CR_CRIT_TAKEN_SPELL or -2] = "SPELL",
    [CR_CRIT_TAKEN_RANGED or -3] = "RANGED" }
  for _, i in ipairs(critTakenIndices()) do
    p(string.format("CR idx %d (%s): GetCombatRating=%s  GetCombatRatingBonus=%s",
      i, names[i] or "?", tostring(safe(GetCombatRating, i)), tostring(safe(GetCombatRatingBonus, i))))
  end
end

-- ---- Refresh plumbing: let the UI subscribe to gear/stat changes ----
local listeners = {}
function Core.onChange(fn) listeners[#listeners + 1] = fn end
local function notify()
  for _, fn in ipairs(listeners) do pcall(fn) end
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_EQUIPMENT_CHANGED")
frame:RegisterUnitEvent("UNIT_STATS", "player")
if CR_DEFENSE_SKILL then frame:RegisterEvent("COMBAT_RATING_UPDATE") end
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
-- Coalesce bursts (equipping a full set fires many events) into one refresh next frame.
local pending
frame:SetScript("OnEvent", function()
  if pending then return end
  pending = true
  C_Timer.After(0, function() pending = false; notify() end)
end)
