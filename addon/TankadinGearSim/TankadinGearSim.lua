-- Tankadin Gear Sim Exporter
-- /tgs (or /tankadin) opens a copy box with:
--   line 1: TGS<version>
--   line 2: C:key=val;... — your current character-sheet finals (for calibration)
--   then:   I:item:<id>:<enchant>:<gem1..4>:<suffix>:... — one per owned item
--           (equipped + bags + bank + reagent bank), de-duplicated.
-- All values are read defensively (pcall) so a missing API on a given client build
-- degrades gracefully instead of erroring.

local VERSION = "1"

-- Container API shim: modern Classic moved these under C_Container.
local CC = _G.C_Container
local GetContainerNumSlots = (CC and CC.GetContainerNumSlots) or _G.GetContainerNumSlots
local GetContainerItemLink = (CC and CC.GetContainerItemLink) or _G.GetContainerItemLink

local function safe(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, a = pcall(fn, ...)
  if ok then return a end
  return nil
end

local function extractItemString(link)
  if not link then return nil end
  return link:match("|H(item:[%-%d:]+)|h") or link:match("(item:[%-%d:]+)")
end

-- Second return of UnitStat/UnitArmor is the effective total on these clients.
local function stat(id) return select(2, UnitStat("player", id)) end

local function characterLine()
  local p = {}
  local function add(k, v) if v ~= nil then p[#p + 1] = k .. "=" .. tostring(v) end end

  add("name", safe(UnitName, "player"))
  local level = safe(UnitLevel, "player") or 70
  add("level", level)

  -- Avoidance finals (the values the sim calibrates its bases against)
  add("dodge", string.format("%.4f", safe(GetDodgeChance) or 0))
  add("parry", string.format("%.4f", safe(GetParryChance) or 0))
  add("block", string.format("%.4f", safe(GetBlockChance) or 0))

  -- Defense skill = level*5 + skill granted by defense rating
  local defBonus = (CR_DEFENSE_SKILL and safe(GetCombatRatingBonus, CR_DEFENSE_SKILL)) or 0
  add("defenseSkill", string.format("%.2f", level * 5 + defBonus))
  if CR_DEFENSE_SKILL then add("defenseRating", safe(GetCombatRating, CR_DEFENSE_SKILL)) end

  -- Resilience (TBC: crit-taken rating)
  if CR_CRIT_TAKEN_MELEE then add("resilience", safe(GetCombatRating, CR_CRIT_TAKEN_MELEE)) end

  add("agility", safe(stat, 2))
  add("stamina", safe(stat, 3))
  add("health", safe(UnitHealthMax, "player"))
  add("armor", select(2, UnitArmor("player")))
  add("spellPower", safe(GetSpellBonusDamage, 2)) -- holy school
  add("blockValue", safe(GetShieldBlock))

  return "C:" .. table.concat(p, ";")
end

local function scanGear()
  local seen, list = {}, {}
  local function addStr(s)
    if s and not seen[s] then seen[s] = true; list[#list + 1] = "I:" .. s end
  end
  -- equipped (1..19 covers all gear slots; shirt/tabard are harmless)
  for slot = 1, 19 do addStr(extractItemString(safe(GetInventoryItemLink, "player", slot))) end
  -- bags 0-4, bank -1 and 5-11, reagent bank -3 (when available)
  local bags = { 0, 1, 2, 3, 4, -1, 5, 6, 7, 8, 9, 10, 11, -3 }
  for _, bag in ipairs(bags) do
    local n = safe(GetContainerNumSlots, bag) or 0
    for slot = 1, n do addStr(extractItemString(safe(GetContainerItemLink, bag, slot))) end
  end
  return list
end

local function buildExport()
  local lines = { "TGS" .. VERSION, characterLine() }
  for _, l in ipairs(scanGear()) do lines[#lines + 1] = l end
  return table.concat(lines, "\n"), #lines - 2
end

local function showExport(text)
  local f = _G["TGSExportFrame"]
  if not f then
    f = CreateFrame("Frame", "TGSExportFrame", UIParent)
    f:SetSize(560, 420)
    f:SetPoint("CENTER")
    f:SetFrameStrata("DIALOG")
    f:EnableMouse(true)
    f:SetMovable(true)
    f:RegisterForDrag("LeftButton")
    f:SetScript("OnDragStart", f.StartMoving)
    f:SetScript("OnDragStop", f.StopMovingOrSizing)

    local bg = f:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0, 0, 0, 0.88)

    local title = f:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
    title:SetPoint("TOP", 0, -10)
    title:SetText("Tankadin Gear Sim Export")

    local hint = f:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    hint:SetPoint("TOP", 0, -32)
    hint:SetText("Ctrl+A to select all, Ctrl+C to copy, then paste into the sim.")

    local close = CreateFrame("Button", nil, f, "UIPanelCloseButton")
    close:SetPoint("TOPRIGHT", 2, 2)

    local scroll = CreateFrame("ScrollFrame", "TGSExportScroll", f, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 16, -50)
    scroll:SetPoint("BOTTOMRIGHT", -34, 14)

    local eb = CreateFrame("EditBox", "TGSExportEdit", scroll)
    eb:SetMultiLine(true)
    eb:SetFontObject(ChatFontNormal)
    eb:SetWidth(500)
    eb:SetAutoFocus(false)
    eb:SetScript("OnEscapePressed", function() f:Hide() end)
    scroll:SetScrollChild(eb)
    f.editBox = eb
  end
  f.editBox:SetText(text)
  f.editBox:HighlightText()
  f.editBox:SetFocus()
  f:Show()
end

SLASH_TANKADINGEARSIM1 = "/tgs"
SLASH_TANKADINGEARSIM2 = "/tankadin"
SlashCmdList["TANKADINGEARSIM"] = function()
  local text, count = buildExport()
  showExport(text)
  DEFAULT_CHAT_FRAME:AddMessage("|cff7ee787Tankadin Gear Sim:|r exported " .. count ..
    " items + character stats. Open your bank first to include banked gear.")
end
