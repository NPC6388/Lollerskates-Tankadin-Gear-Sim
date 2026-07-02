-- Core constants for the Tankadin Gear Sim — Lua port of src/constants.js.
-- Single source of truth for the in-game engine; every value traces to the WoW TBC Prot
-- Paladin Tanking Guide, matching the browser sim's constants exactly (see src/constants.js).
--
-- NOTE: this file is the hand-authored stub. Phase C adds a Node generator (bin/gen-lua-data.mjs)
-- that regenerates the numeric tables from src/constants.js so the web and addon can't drift.
-- Keep the values here byte-for-byte identical to the JS until that generator lands.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local C = {}
ns.engine.Constants = C

-- --- Rating conversions (guide: #stat-conversions table) ---
-- "Rating per 1%" except defense/expertise which are per skill point.
C.RATING = {
  defensePerSkill = 2.3654, -- defense rating per 1 defense skill
  meleeHitPer1 = 15.77,     -- melee hit rating per 1%
  spellHitPer1 = 12.62,     -- spell hit rating per 1%
  expertisePer1 = 3.9423,   -- expertise rating per 1 expertise
  dodgePer1 = 18.92,        -- dodge rating per 1%
  parryPer1 = 23.65,        -- parry rating per 1%
  blockPer1 = 7.88,         -- block rating per 1%
  critPer1 = 22.08,         -- crit rating per 1%
  hastePer1 = 15.77,        -- haste rating per 1%
  resiliencePer1 = 39.42,   -- resilience rating per 1% crit reduction
}

-- --- Character / boss baselines (guide: #combat-table, #block-mechanics) ---
C.BASE = {
  playerLevel = 70,
  baseDefenseSkill = 350,        -- 5 x level
  baseMissChance = 5,            -- % melee miss vs target (guide profile baseline)
  defenseBenefitPerSkill = 0.04, -- % per defense skill to dodge/parry/block/miss/crit-avoid
  raidBossLevel = 73,
  heroicBossLevel = 72,
  bossCritVsPlayer = 5.6,        -- % crit a level 73 raid boss has on a level 70 (guide: 1531)
  heroicBossCritVsPlayer = 5.4,  -- % crit a level 72 heroic boss has on a level 70
}

-- --- Hard caps / thresholds (guide: #stat-conversions, #combat-table) ---
C.CAPS = {
  defenseSkillRaid = 490,     -- crit immunity vs level 73 (guide: 1527-1534)
  defenseSkillHeroic = 485,   -- crit immunity vs level 72
  uncrushableCombined = 102.4, -- miss+dodge+parry+block >= this => no crushing (guide: 1566)
  spellHitCapPct = 17,        -- vs raid boss (guide table)
  meleeHitCapPct = 9,         -- vs raid boss (6% with 3/3 Precision)
  expertiseSoftCap = 26,      -- eliminates boss dodge
}

-- --- Threat amplifiers (guide: #threat-system) ---
C.THREAT = {
  righteousFury = 1.9,      -- 3/3 Improved Righteous Fury (guide: 845)
  holyShieldActive = 30,    -- +30% block chance while Holy Shield is up (guide: 1552)
  justicar2pcSeal = 1.10,   -- +10% SoR/SoV/SoC seal damage (guide: 633)
  justicar4pcHolyShield = 15, -- +15 flat per Holy Shield block (guide: 634)
  crystalforge2pcRetAura = 15, -- +15 Retribution Aura damage per hit (T5 2pc)
  crystalforge4pcBlockValue = 100, -- +100 block value for 6s after Holy Shield (T5 4pc)
  improvedHolyShieldDmg = 1.20, -- 2/2 Improved Holy Shield damage multiplier (guide: 878)
}

-- Crit multipliers by school (guide: seal crit mechanics table, 1256-1262)
C.CRIT_MULT = { spell = 1.5, melee = 2.0 }

C.RESIST_MAX_MITIGATION = 0.75

-- --- Armor mitigation (standard TBC formula; attacker-level dependent) ---
-- DR = Armor / (Armor + (467.5 * attackerLevel - 22167.5)), capped at 75%. = 11960 at level 73.
function C.ARMOR_CONST(attackerLevel)
  attackerLevel = attackerLevel or C.BASE.raidBossLevel
  return 467.5 * attackerLevel - 22167.5
end

-- --- Resistance mitigation ---
-- Average mitigation vs a caster = Resistance / (5 * casterLevel) * 0.75, capped 75%.
-- At level 73: 5*73 = 365 => 365 res = 75% (cap); 244 res ~= 50%.
function C.RESIST_DENOM(casterLevel)
  casterLevel = casterLevel or C.BASE.raidBossLevel
  return 5 * casterLevel
end

return C
