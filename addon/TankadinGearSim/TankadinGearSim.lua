-- Tankadin Gear Sim Exporter
-- /tgs (or /tankadin) opens a copy box with:
--   line 1: TGS<version>
--   line 2: C:key=val;... — current character-sheet finals (for calibration)
--   then:   I:<itemString>|<equipLoc>|<statKey>=<val>;... — one per owned item, with
--           exact per-item stats from GetItemStats (so no external item DB is needed,
--           and custom/Anniversary items work). Equipped + bags + bank + reagent bank.
-- Everything read defensively (pcall) so a missing API degrades gracefully.

local VERSION = "2"

local CC = _G.C_Container
local GetContainerNumSlots = (CC and CC.GetContainerNumSlots) or _G.GetContainerNumSlots
local GetContainerItemLink = (CC and CC.GetContainerItemLink) or _G.GetContainerItemLink
local GetItemStatsFn = (_G.C_Item and _G.C_Item.GetItemStats) or _G.GetItemStats

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

local function stat(id) return select(2, UnitStat("player", id)) end

local function characterLine()
  local p = {}
  local function add(k, v) if v ~= nil then p[#p + 1] = k .. "=" .. tostring(v) end end
  add("name", safe(UnitName, "player"))
  local level = safe(UnitLevel, "player") or 70
  add("level", level)
  add("dodge", string.format("%.4f", safe(GetDodgeChance) or 0))
  add("parry", string.format("%.4f", safe(GetParryChance) or 0))
  add("block", string.format("%.4f", safe(GetBlockChance) or 0))
  local defBonus = (CR_DEFENSE_SKILL and safe(GetCombatRatingBonus, CR_DEFENSE_SKILL)) or 0
  add("defenseSkill", string.format("%.2f", level * 5 + defBonus))
  if CR_DEFENSE_SKILL then add("defenseRating", safe(GetCombatRating, CR_DEFENSE_SKILL)) end
  if CR_CRIT_TAKEN_MELEE then add("resilience", safe(GetCombatRating, CR_CRIT_TAKEN_MELEE)) end
  add("agility", safe(stat, 2))
  add("stamina", safe(stat, 3))
  add("health", safe(UnitHealthMax, "player"))
  add("armor", select(2, UnitArmor("player")))
  add("spellPower", safe(GetSpellBonusDamage, 2))
  add("blockValue", safe(GetShieldBlock))
  return "C:" .. table.concat(p, ";")
end

-- Build the stat segment for one item link: raw GetItemStats keys + equip slot + ilvl.
local function itemStatsSegment(link)
  local pairs_ = {}
  local stats = safe(GetItemStatsFn, link)
  if type(stats) == "table" then
    for k, v in pairs(stats) do pairs_[#pairs_ + 1] = k .. "=" .. tostring(v) end
  end
  local equipLoc = select(9, GetItemInfo(link)) or ""
  local ilvl = select(4, GetItemInfo(link)) or 0
  return equipLoc .. "|ilvl=" .. tostring(ilvl) ..
    (#pairs_ > 0 and (";" .. table.concat(pairs_, ";")) or "")
end

local function scanGear()
  local seen, list = {}, {}
  local function addLink(link)
    local s = extractItemString(link)
    if not s or seen[s] then return end
    seen[s] = true
    list[#list + 1] = "I:" .. s .. "|" .. itemStatsSegment(link)
  end
  for slot = 1, 19 do addLink(safe(GetInventoryItemLink, "player", slot)) end
  local bags = { 0, 1, 2, 3, 4, -1, 5, 6, 7, 8, 9, 10, 11, -3 }
  for _, bag in ipairs(bags) do
    local n = safe(GetContainerNumSlots, bag) or 0
    for slot = 1, n do addLink(safe(GetContainerItemLink, bag, slot)) end
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
