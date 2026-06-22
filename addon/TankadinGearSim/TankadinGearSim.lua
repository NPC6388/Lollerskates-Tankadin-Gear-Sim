-- Tankadin Gear Sim Exporter
-- /tgs (or /tankadin) opens a copy box with:
--   line 1: TGS<version>
--   line 2: C:key=val;... — current character-sheet finals (for calibration)
--   then:   I:<itemString>|<equipLoc>|ilvl=N;<ITEM_MOD key>=val;... — one per owned item.
-- Per-item stats are scanned from the item's TOOLTIP, so they INCLUDE gems + enchants
-- (GetItemStats alone returns the base item with empty sockets). Empty-socket counts are
-- still taken from GetItemStats for the gem optimizer. Everything read defensively.

local VERSION = "3"

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
  local defTotal
  if type(UnitDefense) == "function" then
    local b, m = UnitDefense("player")
    if b then defTotal = (b or 0) + (m or 0) end
  end
  if not defTotal then
    local defBonus = (CR_DEFENSE_SKILL and safe(GetCombatRatingBonus, CR_DEFENSE_SKILL)) or 0
    defTotal = level * 5 + defBonus
  end
  add("defenseSkill", string.format("%.2f", defTotal))
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

-- ---- Tooltip scanning (includes gems + enchants) ----
local scanTip
local function tooltipLines(link)
  local out = {}
  if C_TooltipInfo and C_TooltipInfo.GetHyperlink then
    local data = safe(C_TooltipInfo.GetHyperlink, link)
    if data and data.lines then
      for _, ln in ipairs(data.lines) do
        if ln.leftText then out[#out + 1] = ln.leftText end
      end
      if #out > 0 then return out end
    end
  end
  if not scanTip then scanTip = CreateFrame("GameTooltip", "TGSScanTip", nil, "GameTooltipTemplate") end
  scanTip:SetOwner(UIParent, "ANCHOR_NONE")
  scanTip:ClearLines()
  if pcall(scanTip.SetHyperlink, scanTip, link) then
    for i = 1, scanTip:NumLines() do
      local fs = _G["TGSScanTipTextLeft" .. i]
      local t = fs and fs:GetText()
      if t then out[#out + 1] = t end
    end
  end
  return out
end

-- Ordered phrase patterns (lowercased line) -> ITEM_MOD key. More specific first so e.g.
-- "spell hit rating" wins over "hit rating". Handles both "...by N" (equip/enchant) and
-- "+N ... rating" (gem) wordings.
local PHRASES = {
  { "defense rating by (%d+)", "ITEM_MOD_DEFENSE_SKILL_RATING" },
  { "%+(%d+) defense rating", "ITEM_MOD_DEFENSE_SKILL_RATING" },
  { "increased defense %+(%d+)", "ITEM_MOD_DEFENSE_SKILL_RATING" },
  { "dodge rating by (%d+)", "ITEM_MOD_DODGE_RATING" },
  { "%+(%d+) dodge rating", "ITEM_MOD_DODGE_RATING" },
  { "parry rating by (%d+)", "ITEM_MOD_PARRY_RATING" },
  { "%+(%d+) parry rating", "ITEM_MOD_PARRY_RATING" },
  { "block rating by (%d+)", "ITEM_MOD_BLOCK_RATING" },
  { "%+(%d+) block rating", "ITEM_MOD_BLOCK_RATING" },
  { "block value of your shield by (%d+)", "ITEM_MOD_BLOCK_VALUE" },
  { "%+(%d+) block value", "ITEM_MOD_BLOCK_VALUE" },
  { "spell hit rating by (%d+)", "ITEM_MOD_HIT_SPELL_RATING" },
  { "%+(%d+) spell hit rating", "ITEM_MOD_HIT_SPELL_RATING" },
  { "hit rating by (%d+)", "ITEM_MOD_HIT_RATING" },
  { "%+(%d+) hit rating", "ITEM_MOD_HIT_RATING" },
  { "resilience rating by (%d+)", "ITEM_MOD_RESILIENCE_RATING" },
  { "%+(%d+) resilience rating", "ITEM_MOD_RESILIENCE_RATING" },
  { "expertise rating by (%d+)", "ITEM_MOD_EXPERTISE_RATING" },
  { "%+(%d+) expertise rating", "ITEM_MOD_EXPERTISE_RATING" },
  { "spell critical strike rating by (%d+)", "ITEM_MOD_CRIT_SPELL_RATING" },
  { "critical strike rating by (%d+)", "ITEM_MOD_CRIT_RATING" },
  { "%+(%d+) critical strike rating", "ITEM_MOD_CRIT_RATING" },
  { "haste rating by (%d+)", "ITEM_MOD_HASTE_RATING" },
  { "spell power by (%d+)", "ITEM_MOD_SPELL_POWER" },
  { "%+(%d+) spell power", "ITEM_MOD_SPELL_POWER" },
  { "magical spells and effects by up to (%d+)", "ITEM_MOD_SPELL_POWER" },
  { "attack power by (%d+)", "ITEM_MOD_ATTACK_POWER" },
  { "%+(%d+) attack power", "ITEM_MOD_ATTACK_POWER" },
}

local PRIMARY = { stamina = "ITEM_MOD_STAMINA_SHORT", strength = "ITEM_MOD_STRENGTH_SHORT",
  agility = "ITEM_MOD_AGILITY_SHORT", intellect = "ITEM_MOD_INTELLECT_SHORT" }

local RESIST = { fire = "RESISTANCE2_NAME", nature = "RESISTANCE3_NAME", frost = "RESISTANCE4_NAME",
  shadow = "RESISTANCE5_NAME", arcane = "RESISTANCE6_NAME", holy = "RESISTANCE1_NAME" }

local function parseTooltipStats(link)
  local s = {}
  local function add(k, v) if k and v then s[k] = (s[k] or 0) + v end end
  for _, raw in ipairs(tooltipLines(link)) do
    local l = raw:lower()
    -- armor: "1227 armor"
    local arm = l:match("^([%d,]+) armor")
    if arm then add("RESISTANCE0_NAME", tonumber((arm:gsub(",", "")))) end
    -- primary stats: "+43 stamina"
    local n, word = l:match("^%+(%d+) (%a+)")
    if n and PRIMARY[word] then add(PRIMARY[word], tonumber(n)) end
    -- resistances: "+21 fire resistance"
    local rn, rword = l:match("%+(%d+) (%a+) resistance")
    if rn and RESIST[rword] then add(RESIST[rword], tonumber(rn)) end
    -- ratings / spell power / attack power: first matching phrase wins
    for _, pair in ipairs(PHRASES) do
      local v = l:match(pair[1])
      if v then add(pair[2], tonumber(v)); break end
    end
  end
  return s
end

local function itemSegment(link)
  local stats = parseTooltipStats(link)
  -- empty-socket counts come from GetItemStats (reliable, structured)
  local base = safe(GetItemStatsFn, link)
  if type(base) == "table" then
    for _, k in ipairs({ "EMPTY_SOCKET_RED", "EMPTY_SOCKET_YELLOW", "EMPTY_SOCKET_BLUE",
      "EMPTY_SOCKET_META", "EMPTY_SOCKET_PRISMATIC" }) do
      if base[k] then stats[k] = base[k] end
    end
  end
  local parts = {}
  for k, v in pairs(stats) do parts[#parts + 1] = k .. "=" .. tostring(v) end
  local equipLoc = select(9, GetItemInfo(link)) or ""
  local ilvl = select(4, GetItemInfo(link)) or 0
  return equipLoc .. "|ilvl=" .. tostring(ilvl) ..
    (#parts > 0 and (";" .. table.concat(parts, ";")) or "")
end

local function scanGear()
  local seen, list = {}, {}
  local function addLink(link)
    local s = extractItemString(link)
    if not s or seen[s] then return end
    seen[s] = true
    list[#list + 1] = "I:" .. s .. "|" .. itemSegment(link)
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
    f:SetSize(560, 420); f:SetPoint("CENTER"); f:SetFrameStrata("DIALOG")
    f:EnableMouse(true); f:SetMovable(true); f:RegisterForDrag("LeftButton")
    f:SetScript("OnDragStart", f.StartMoving); f:SetScript("OnDragStop", f.StopMovingOrSizing)
    local bg = f:CreateTexture(nil, "BACKGROUND"); bg:SetAllPoints(); bg:SetColorTexture(0, 0, 0, 0.88)
    local title = f:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
    title:SetPoint("TOP", 0, -10); title:SetText("Tankadin Gear Sim Export")
    local hint = f:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    hint:SetPoint("TOP", 0, -32); hint:SetText("Ctrl+A to select all, Ctrl+C to copy, then paste into the sim.")
    local close = CreateFrame("Button", nil, f, "UIPanelCloseButton"); close:SetPoint("TOPRIGHT", 2, 2)
    local scroll = CreateFrame("ScrollFrame", "TGSExportScroll", f, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 16, -50); scroll:SetPoint("BOTTOMRIGHT", -34, 14)
    local eb = CreateFrame("EditBox", "TGSExportEdit", scroll)
    eb:SetMultiLine(true); eb:SetFontObject(ChatFontNormal); eb:SetWidth(500); eb:SetAutoFocus(false)
    eb:SetScript("OnEscapePressed", function() f:Hide() end)
    scroll:SetScrollChild(eb); f.editBox = eb
  end
  f.editBox:SetText(text); f.editBox:HighlightText(); f.editBox:SetFocus(); f:Show()
end

SLASH_TANKADINGEARSIM1 = "/tgs"
SLASH_TANKADINGEARSIM2 = "/tankadin"
SlashCmdList["TANKADINGEARSIM"] = function()
  local text, count = buildExport()
  showExport(text)
  DEFAULT_CHAT_FRAME:AddMessage("|cff7ee787Tankadin Gear Sim:|r exported " .. count ..
    " items (stats incl. gems/enchants) + character. Open your bank first for banked gear.")
end
