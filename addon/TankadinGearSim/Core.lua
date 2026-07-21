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
local CharData = ns.engine.CharacterData
local RATING = Const.RATING
local CHAR, BUFFS = CharData.CHARACTER, CharData.BUFFS

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

-- Combined stat table for an equipped item link (includes its socketed gems — the link carries them).
local function itemStats(link)
  local getter = (C_Item and C_Item.GetItemStats) or GetItemStats
  if type(getter) ~= "function" then return nil end
  local ok, res = pcall(getter, link)
  if ok and type(res) == "table" then return res end
  return nil
end

-- Resilience summed straight off equipped gear — the reliable path. The Anniversary client's
-- GetCombatRating(CR_CRIT_TAKEN_*) reads come back 0 (so does the % fallback), which silently dropped
-- resilience and made a genuinely uncrittable tank read as crittable. GetItemStats on each equipped
-- link mirrors what the website does off tooltips. Returns nil only when the API is missing on this
-- build (so the caller can fall back); a scanned 0 is a valid "no resilience gear" answer.
local RESIL_KEYS = { "ITEM_MOD_RESILIENCE_RATING", "ITEM_MOD_RESILIENCE_RATING_SHORT" }
local function equippedResilienceRating()
  if type((C_Item and C_Item.GetItemStats) or GetItemStats) ~= "function" then return nil end
  local total = 0
  for slot = 1, 18 do
    local link = safe(GetInventoryItemLink, "player", slot)
    if link then
      local stats = itemStats(link)
      if stats then
        for _, k in ipairs(RESIL_KEYS) do
          if stats[k] then total = total + stats[k] end
        end
      end
    end
  end
  return total
end

-- Spell hit RATING summed off equipped gear (same reliable path as resilience — the Anniversary
-- combat-rating API is flaky). Feeds the Live "Spell hit" readout: spellHitPct = Precision + rating/12.62.
local SPELLHIT_KEYS = { "ITEM_MOD_HIT_SPELL_RATING", "ITEM_MOD_HIT_SPELL_RATING_SHORT" }
local function equippedSpellHitRating()
  if type((C_Item and C_Item.GetItemStats) or GetItemStats) ~= "function" then return 0 end
  local total = 0
  for slot = 1, 18 do
    local link = safe(GetInventoryItemLink, "player", slot)
    if link then
      local stats = itemStats(link)
      if stats then
        for _, k in ipairs(SPELLHIT_KEYS) do if stats[k] then total = total + stats[k] end end
      end
    end
  end
  return total
end

-- Resilience as an equivalent rating for evaluateSet. Prefer the equipped-gear scan; fall back to
-- the combat-rating API (unreliable on Anniversary — returns 0 — but harmless) only if the scan API
-- is unavailable on this build.
local function liveResilienceRating()
  local scanned = equippedResilienceRating()
  if scanned ~= nil then return scanned end
  for _, i in ipairs(critTakenIndices()) do
    local rating = safe(GetCombatRating, i)
    if rating and rating > 0 then return rating end
  end
  for _, i in ipairs(critTakenIndices()) do
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

-- Is a named buff active on the player? (AuraUtil when present, else a UnitBuff scan.)
local function buffActive(name)
  if AuraUtil and AuraUtil.FindAuraByName then
    return AuraUtil.FindAuraByName(name, "player", "HELPFUL") ~= nil
  end
  for i = 1, 40 do
    local n = safe(UnitBuff, "player", i)
    if not n then break end
    if n == name then return true end
  end
  return false
end

-- Is Holy Shield currently up? When it is, GetBlockChance() already includes its +30% block (and a
-- block libram's HS-conditional block), so we must NOT add the bonus again — doing so double-counted
-- the crush table live (134% instead of 104%). When HS is down, GetBlockChance() is the base and the
-- toggle previews HS up.
local function holyShieldAuraActive() return buffActive("Holy Shield") end

-- Block rating granted by an equipped block libram (relic slot) while Holy Shield is up. Mirrors
-- src/librams.js. Libram of Repentance = +42 block rating; it's HS-conditional, so it rides with the
-- Holy Shield bonus rather than the base block (a live HS aura folds it into GetBlockChance).
local BLOCK_LIBRAMS = { [29388] = 42 } -- Libram of Repentance
local function blockLibramRating()
  local link = safe(GetInventoryItemLink, "player", 18) -- INVSLOT_RANGED = relic/libram slot in TBC
  if not link then return 0 end
  local id = tonumber(link:match("item:(%d+)"))
  return (id and BLOCK_LIBRAMS[id]) or 0
end

-- Rank (0-5) of a talent by NAME; 0 if not found or the API is unavailable. Backs the live damage-
-- reduction (Improved Righteous Fury) and stamina-multiplier (Sacred Duty / Combat Expertise) reads.
local function talentRank(target)
  if type(GetTalentInfo) ~= "function" then return 0 end
  local tabs = (GetNumTalentTabs and GetNumTalentTabs()) or 3
  for tab = 1, tabs do
    local n = (GetNumTalents and GetNumTalents(tab)) or 0
    for i = 1, n do
      local name, _, _, _, rank = GetTalentInfo(tab, i)
      if name == target then return rank or 0 end
    end
  end
  return 0
end

-- Improved Righteous Fury talent rank (0-3). Its 2%/rank damage reduction applies only while
-- Righteous Fury is up — read the live rank so a non-tank spec doesn't get a phantom EHP boost.
local function impRighteousFuryRank() return talentRank("Improved Righteous Fury") end

-- Live stamina multiplier from talents (Sacred Duty +3%/rank, Combat Expertise +2%/rank), matching
-- Model.aggregate's staminaMult. Read live so the Kings/MotW health preview scales the flat +14 stamina
-- exactly as the sheet does (the game applies these % increases to effective stamina).
local function liveStaminaMult()
  return 1 + 0.03 * talentRank("Sacred Duty") + 0.02 * talentRank("Combat Expertise")
end

-- Raid stat buffs (Kings + Mark of the Wild) the OPTIMIZER always assumes. The live sheet only shows
-- them when they're physically on you, so a set built to be uncrushable / hit an EHP floor WHEN RAID-
-- BUFFED reads short in town. `opts.assumeBuffs` models the missing buffs here so the Live panel matches
-- the optimizer's raid-buffed assumption (mirrors the Holy Shield toggle). Kings = +10% primaries (after
-- flats); MotW = +14 flat each. We detect each so an already-active buff is never double-counted. Only
-- agility (-> dodge + armor), stamina (-> health) and strength (-> block value) move a tank's readout;
-- the buffs add no defense/resilience, so crit immunity is deliberately untouched.
local BLESSING_OF_KINGS = { "Blessing of Kings", "Greater Blessing of Kings" }
local MARK_OF_THE_WILD = { "Mark of the Wild", "Gift of the Wild" }
local function anyBuffActive(names)
  for _, n in ipairs(names) do if buffActive(n) then return true end end
  return false
end

-- Effective value of a primary stat if BOTH Kings and MotW were active, given the current effective
-- value E and which of the two are already on. `flat` = MotW's amount; `mult` = any talent stat-
-- multiplier applied to that flat before Kings (1 for agi/str, staminaMult for stamina).
local function withBuffs(E, kActive, mActive, flat, mult, kMult)
  local preKings = E / (kActive and kMult or 1)          -- strip Kings' x1.10 back off
  local core = preKings - (mActive and flat * mult or 0) -- strip MotW's (mult-scaled) flat, if present
  return (core + flat * mult) * kMult                    -- re-add MotW, then apply Kings
end

-- The current effective value of a primary stat (2nd UnitStat return, like Exporter's `stat`).
local function effStat(id) return (select(2, safe(UnitStat, "player", id))) or 0 end

-- Read the final sheet values evaluateSet() consumes. `opts.holyShield` (default true) toggles
-- the Holy Shield uptime assumption (+30% block, plus a block libram's HS-conditional block).
-- `opts.assumeBuffs` (default false) models Kings + Mark of the Wild the same way the optimizer does,
-- so the Live panel can show the raid-buffed readout (see withBuffs); off = raw current sheet.
function Core.readSheet(opts)
  opts = opts or {}
  local holyShield = opts.holyShield
  if holyShield == nil then holyShield = true end

  local defenseSkill = liveDefenseSkill()
  local resilience = liveResilienceRating()

  -- Normalize block to a Holy-Shield-free base so the with/without-HS numbers are consistent whether
  -- or not HS happens to be up right now. GetBlockChance() reflects the live HS aura (+30%) and a
  -- block libram's HS-conditional block; strip them back out and re-add the assumption ourselves
  -- (hsBonusFull) — otherwise a live HS aura double-counts the crush table.
  local blockRaw = safe(GetBlockChance) or 0
  local hsActive = holyShieldAuraActive()
  local libramRating = blockLibramRating()
  local hsBonusFull = Const.THREAT.holyShieldActive + libramRating / RATING.blockPer1 -- +30% HS + libram
  local baseBlock = hsActive and math.max(0, blockRaw - hsBonusFull) or blockRaw
  -- Apply the bonus when Holy Shield is actually up OR when the user asks to assume it — so casting
  -- Holy Shield moves the Block/Crush numbers live (toggle off), while the toggle still previews it
  -- when HS is down. baseBlock already stripped any live aura out, so this never double-counts.
  local assumeHS = hsActive or holyShield
  local hsBlockBonus = assumeHS and hsBonusFull or 0

  -- Improved Righteous Fury cuts damage taken by 2%/rank, but only while Righteous Fury is up — so it
  -- raises physical EHP (not Armor DR, which is armor-only). Detect the live RF aura + the talent rank.
  local rfRank = impRighteousFuryRank()
  local rfActive = buffActive("Righteous Fury")
  local damageTakenMult = (rfActive and rfRank > 0) and (1 - 0.02 * rfRank) or 1

  -- Live derived values the raid buffs would move. Kept in locals so the assumeBuffs preview can add
  -- the missing Kings/MotW contribution before evaluateSet recomputes avoid/crush/EHP from them.
  local dodgePct = safe(GetDodgeChance) or 0
  local armor = select(2, safe(UnitArmor, "player")) or 0
  local health = safe(UnitHealthMax, "player") or 0
  local blockValue = safe(GetShieldBlock) or 0
  if opts.assumeBuffs then
    local kMult = BUFFS.kingsMult
    local kOn, mOn = anyBuffActive(BLESSING_OF_KINGS), anyBuffActive(MARK_OF_THE_WILD)
    local flat = BUFFS.markOfTheWild
    local curAgi, curStr, curSta = effStat(2), effStat(1), effStat(3)
    local newAgi = withBuffs(curAgi, kOn, mOn, flat.agility, 1, kMult)
    local newStr = withBuffs(curStr, kOn, mOn, flat.strength, 1, kMult)
    local newSta = withBuffs(curSta, kOn, mOn, flat.stamina, liveStaminaMult(), kMult)
    dodgePct = dodgePct + (newAgi - curAgi) / CHAR.agilityPerDodgePct   -- agility -> dodge
    armor = armor + (newAgi - curAgi) * CHAR.armorPerAgility            -- agility -> armor
    health = health + (newSta - curSta) * CHAR.hpPerStamina             -- stamina -> health (>20 stam)
    blockValue = blockValue + math.floor(newStr / 20) - math.floor(curStr / 20) -- 1 BV per 20 Str
  end

  return {
    defenseSkill = defenseSkill,
    resilienceRating = resilience,
    -- The game doesn't expose "miss vs boss"; derive it from defense skill exactly as the model
    -- does (src/model.js:124): 5% base + 0.04%/skill over 350.
    missPct = Combat.missChance(defenseSkill),
    dodgePct = dodgePct,
    parryPct = safe(GetParryChance) or 0,
    -- HS-free base block feeds the avoidance totals; blockPctEffective (base + assumed HS/libram) is
    -- what the avoidance row shows so it matches the WeakAura's live block figure.
    blockPct = baseBlock,
    blockPctEffective = baseBlock + hsBlockBonus,
    hsBlockBonus = hsBlockBonus,
    holyShieldLive = hsActive,
    blockLibramRating = libramRating,
    armor = armor,
    health = health,
    spellPower = safe(GetSpellBonusDamage, 2) or 0, -- holy school
    -- Spell hit % vs a raid boss: Precision talent (+1%/rank) + gear spell-hit rating / 12.62 (matches
    -- runner.js spellHitPct). Cap for reference is Const.CAPS.spellHitCapPct (17% vs a level-73 boss).
    spellHitPct = talentRank("Precision") + equippedSpellHitRating() / RATING.spellHitPer1,
    blockValue = blockValue,
    -- Improved Righteous Fury's damage reduction, live (folds into physical EHP in evaluateSet).
    damageTakenMult = damageTakenMult,
    righteousFuryLive = rfActive,
    impRfRank = rfRank,
  }
end

-- Full snapshot: the live input plus its evaluation. `opts` forwards to readSheet.
function Core.snapshot(opts)
  local input = Core.readSheet(opts)
  return { input = input, evald = Evaluate.evaluateSet(input) }
end

-- /tgs debug — dump the raw API reads so a live-vs-website mismatch can be pinned to the exact source
-- (e.g. which resilience combat-rating index the client populates). Prints to chat AND returns the
-- text as one string, so the UI can drop it in the Export copy box for easy Ctrl+C.
function Core.debug()
  local lines = {}
  local function p(s) lines[#lines + 1] = s end
  local input = Core.readSheet({})
  p(string.format("defenseSkill=%.2f  miss=%.2f  dodge=%.2f  parry=%.2f  block=%.2f",
    input.defenseSkill, input.missPct, input.dodgePct, input.parryPct, input.blockPct))
  p(string.format("resilienceRating=%.2f (crit red %.2f%%)  armor=%d  hp=%d  sp=%d  bv=%d",
    input.resilienceRating, Combat.critReduction(input.defenseSkill, input.resilienceRating),
    input.armor, input.health, input.spellPower, input.blockValue))
  p(string.format("resil scan (gear)=%s  |  HS live=%s  blockLibram=%d rating  blockBase=%.2f  blockEff=%.2f",
    tostring(equippedResilienceRating()), tostring(input.holyShieldLive), input.blockLibramRating or 0,
    input.blockPct, input.blockPctEffective))
  p(string.format("RF live=%s  impRF rank=%d  damageTakenMult=%.3f",
    tostring(input.righteousFuryLive), input.impRfRank or 0, input.damageTakenMult or 1))
  -- Professions + which API answered. Worth printing because the answer is CLIENT-dependent:
  -- GetProfessions() is retail-only, so on a Classic client the skills list is the only path that
  -- works, and a wrong read here silently changes which gems/enchants the optimizer will recommend.
  local profs = (ns.Exporter and ns.Exporter.detectProfessions and ns.Exporter.detectProfessions()) or {}
  p(string.format("professions=%s  |  GetNumSkillLines=%s  GetProfessions=%s",
    (#profs > 0) and table.concat(profs, "+") or "(none detected)",
    type(GetNumSkillLines), type(GetProfessions)))
  -- Raw resilience reads per combat-rating index, so we can see which one the client fills.
  local names = { [CR_CRIT_TAKEN_MELEE or -1] = "MELEE", [CR_CRIT_TAKEN_SPELL or -2] = "SPELL",
    [CR_CRIT_TAKEN_RANGED or -3] = "RANGED" }
  for _, i in ipairs(critTakenIndices()) do
    p(string.format("CR idx %d (%s): GetCombatRating=%s  GetCombatRatingBonus=%s",
      i, names[i] or "?", tostring(safe(GetCombatRating, i)), tostring(safe(GetCombatRatingBonus, i))))
  end

  local out = DEFAULT_CHAT_FRAME
  for _, s in ipairs(lines) do out:AddMessage("|cff7ee787TGS|r " .. s) end
  return table.concat(lines, "\n")
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
frame:RegisterUnitEvent("UNIT_AURA", "player") -- Holy Shield / Righteous Fury / buffs change block & EHP
if CR_DEFENSE_SKILL then frame:RegisterEvent("COMBAT_RATING_UPDATE") end
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
-- Coalesce bursts (equipping a full set fires many events) into one refresh next frame.
local pending
frame:SetScript("OnEvent", function()
  if pending then return end
  pending = true
  C_Timer.After(0, function() pending = false; notify() end)
end)
