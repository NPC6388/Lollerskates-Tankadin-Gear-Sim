-- Tankadin Gear Sim Exporter
-- /tgs (or /tankadin) opens a copy box with:
--   line 1: TGS<version>
--   line 2: C:key=val;... — current character-sheet finals (for calibration)
--   then:   I:<itemString>|<equipLoc>|<resolved>|<base>|<socketBonus> — one per owned item.
--     resolved = "ilvl=N;<ITEM_MOD key>=val;..." scanned from the item's TOOLTIP, so it
--       INCLUDES the gems + enchants CURRENTLY applied (the gear "as worn").
--     base     = "<ITEM_MOD key>=val;..." from GetItemStats on the gem/enchant-STRIPPED
--       base link, so it carries the clean item stats AND the FULL socket-color layout
--       (EMPTY_SOCKET_* for every socket, even ones currently filled). For the gem solver.
--     socketBonus = "<ITEM_MOD key>:val" — the item's socket bonus (the prize for matching
--       all its socket colors), captured whether or not it's currently active. May be empty.
-- v1–v7 lines had only the first three fields (resolved). Everything read defensively.

local VERSION = "8"

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
  add("strength", safe(stat, 1))
  add("agility", safe(stat, 2))
  add("stamina", safe(stat, 3))
  add("intellect", safe(stat, 4))
  add("health", safe(UnitHealthMax, "player"))
  add("armor", select(2, UnitArmor("player")))
  add("spellPower", safe(GetSpellBonusDamage, 2))
  add("blockValue", safe(GetShieldBlock))
  return "C:" .. table.concat(p, ";")
end

-- ---- Tooltip scanning (includes gems + enchants) ----
-- Each line is { text, r, g, b }; the color lets us tell an ACTIVE socket bonus (green)
-- from an INACTIVE one (grey) so we don't count bonuses the player's gems don't satisfy.
local scanTip
local function colorOf(ln)
  local c = ln.leftColor
  if c then
    if c.GetRGB then local ok, r, g, b = pcall(c.GetRGB, c); if ok then return r, g, b end end
    if c.r then return c.r, c.g, c.b end
  end
  return nil
end
local function tooltipLines(link)
  local out = {}
  if C_TooltipInfo and C_TooltipInfo.GetHyperlink then
    local data = safe(C_TooltipInfo.GetHyperlink, link)
    if data and data.lines then
      for _, ln in ipairs(data.lines) do
        if ln.leftText then
          local r, g, b = colorOf(ln)
          out[#out + 1] = { text = ln.leftText, r = r, g = g, b = b }
        end
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
      if t then
        local r, g, b = fs:GetTextColor()
        out[#out + 1] = { text = t, r = r, g = g, b = b }
      end
    end
  end
  return out
end

-- A socket bonus applies only when its tooltip line is green; grey means the gem colors
-- don't match. Unknown color -> treat as active (don't silently drop real stats).
local function inactiveSocketBonus(l, ln)
  if not l:find("socket bonus", 1, true) then return false end
  if not ln.r or not ln.g or not ln.b then return false end
  local green = ln.g > 0.6 and ln.r < 0.5 and ln.b < 0.5
  return not green
end

-- Ordered phrase patterns (matched against a single-stat CLAUSE, see parseTooltipStats)
-- -> ITEM_MOD key. More specific first so "spell hit rating" wins over "hit rating".
-- Handles both "...by N" (equip/enchant) and "+N ... rating" (gem) wordings. The game
-- prints "Spell Damage"; gamers say "spell power" -- we accept BOTH and store as
-- ITEM_MOD_SPELL_POWER (the parser maps that to our internal spellPower).
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
  { "%+(%d+) spell critical strike rating", "ITEM_MOD_CRIT_SPELL_RATING" },
  { "critical strike rating by (%d+)", "ITEM_MOD_CRIT_RATING" },
  { "%+(%d+) critical strike rating", "ITEM_MOD_CRIT_RATING" },
  { "haste rating by (%d+)", "ITEM_MOD_HASTE_RATING" },
  { "spell damage by (%d+)", "ITEM_MOD_SPELL_POWER" },
  { "%+(%d+) spell damage", "ITEM_MOD_SPELL_POWER" },
  { "spell power by (%d+)", "ITEM_MOD_SPELL_POWER" },
  { "%+(%d+) spell power", "ITEM_MOD_SPELL_POWER" },
  { "attack power by (%d+)", "ITEM_MOD_ATTACK_POWER" },
  { "%+(%d+) attack power", "ITEM_MOD_ATTACK_POWER" },
}

local PRIMARY = { stamina = "ITEM_MOD_STAMINA_SHORT", strength = "ITEM_MOD_STRENGTH_SHORT",
  agility = "ITEM_MOD_AGILITY_SHORT", intellect = "ITEM_MOD_INTELLECT_SHORT" }

local RESIST = { fire = "RESISTANCE2_NAME", nature = "RESISTANCE3_NAME", frost = "RESISTANCE4_NAME",
  shadow = "RESISTANCE5_NAME", arcane = "RESISTANCE6_NAME", holy = "RESISTANCE1_NAME" }

-- Parse one already-lowercased clause (a single stat) into (key, value) and add it.
local function parseClause(clause, add)
  -- "+N all stats" -> every primary
  local alln = clause:match("%+(%d+) all stats")
  if alln then
    for _, pk in pairs(PRIMARY) do add(pk, tonumber(alln)) end
    return
  end
  -- primary: "+43 stamina" / gem "+12 stamina" (un-anchored so socketed-gem lines count)
  local n, word = clause:match("%+(%d+)%s+(%a+)")
  if n and PRIMARY[word] then add(PRIMARY[word], tonumber(n)) end
  -- resistance: "+21 fire resistance"
  local rn, rword = clause:match("%+(%d+)%s+(%a+)%s+resistance")
  if rn and RESIST[rword] then add(RESIST[rword], tonumber(rn)) end
  -- ratings / spell power / attack power: first matching phrase wins for this clause
  for _, pair in ipairs(PHRASES) do
    local v = clause:match(pair[1])
    if v then add(pair[2], tonumber(v)); break end
  end
end

-- The socket bonus line ("Socket Bonus: +4 Stamina") -> "ITEM_MOD_STAMINA_SHORT:4", a
-- discrete stat:value captured whether the bonus is currently active or not. The gem solver
-- decides whether color-matching the sockets to earn it beats slotting raw gems.
local function parseSocketBonus(l)
  local clause = l:match("socket bonus:?%s*(.+)") or l
  local rn, rword = clause:match("%+(%d+)%s+(%a+)%s+resistance")
  if rn and RESIST[rword] then return RESIST[rword] .. ":" .. rn end
  local n, word = clause:match("%+(%d+)%s+(%a+)")
  if n and PRIMARY[word] then return PRIMARY[word] .. ":" .. n end
  for _, pair in ipairs(PHRASES) do
    local v = clause:match(pair[1])
    if v then return pair[2] .. ":" .. v end
  end
  return nil
end

local function parseTooltipStats(link)
  local s = {}
  local socketBonus = nil
  local function add(k, v) if k and v then s[k] = (s[k] or 0) + v end end
  for _, ln in ipairs(tooltipLines(link)) do
    local l = ln.text:lower()
    -- capture the socket bonus discretely (active or grey) before any skip/fold logic
    if not socketBonus and l:find("socket bonus", 1, true) then
      socketBonus = parseSocketBonus(l)
    end
    -- skip on-use / proc effects (activated numbers aren't passive stats) and socket
    -- bonuses the gems don't activate (grey lines).
    if l:match("^use:") or l:find("chance on", 1, true) or l:find("chance when", 1, true)
      or l:find("when struck", 1, true) or l:find("for %d+ sec") or inactiveSocketBonus(l, ln) then
      -- skip this line
    else
      -- equip spell-power phrase FIRST: it contains " and " (which we split on below),
      -- so consume + strip it before clause-splitting.
      local eqsp = l:match("magical spells and effects by up to (%d+)")
      if eqsp then add("ITEM_MOD_SPELL_POWER", tonumber(eqsp)) end
      -- armor: "1227 armor" (whole-line)
      local arm = l:match("^([%d,]+) armor")
      if arm then add("RESISTANCE0_NAME", tonumber((arm:gsub(",", "")))) end
      -- shield base block value: "137 block" (whole-line; not "block rating/value ... by N")
      local blk = l:match("^([%d,]+) block%s*$")
      if blk then add("ITEM_MOD_BLOCK_VALUE", tonumber((blk:gsub(",", "")))) end
      -- Split combined stat lines into single-stat clauses so BOTH stats are read:
      --   "+22 Spell Power and +14 Spell Hit Rating" (Glyph of Power)
      --   "+35 Spell Damage and +20 Stamina" (Runic Spellthread)
      --   "+X Defense Rating and +10 Dodge Rating" (shoulder inscription)
      local body = l:gsub("magical spells and effects by up to %d+", "")
      body = body:gsub(" and ", "\1"):gsub(",", "\1")
      for clause in body:gmatch("[^\1]+") do
        parseClause(clause, add)
      end
    end -- end of non-skipped line
  end
  return s, socketBonus
end

local function serializeStats(t)
  local parts = {}
  if type(t) == "table" then
    for k, v in pairs(t) do parts[#parts + 1] = k .. "=" .. tostring(v) end
  end
  return table.concat(parts, ";")
end

local function itemSegment(link)
  local stats, socketBonus = parseTooltipStats(link)
  -- empty-socket counts on the LIVE link come from GetItemStats (only currently-empty ones);
  -- kept in the resolved field for backward compatibility with v7 consumers.
  local liveBase = safe(GetItemStatsFn, link)
  if type(liveBase) == "table" then
    for _, k in ipairs({ "EMPTY_SOCKET_RED", "EMPTY_SOCKET_YELLOW", "EMPTY_SOCKET_BLUE",
      "EMPTY_SOCKET_META", "EMPTY_SOCKET_PRISMATIC" }) do
      if liveBase[k] then stats[k] = liveBase[k] end
    end
  end
  local equipLoc = select(9, GetItemInfo(link)) or ""
  local ilvl = select(4, GetItemInfo(link)) or 0
  local resolvedSeg = "ilvl=" .. tostring(ilvl) ..
    (next(stats) and (";" .. serializeStats(stats)) or "")
  -- v8 base field: GetItemStats on the gem/enchant-STRIPPED base link gives clean item stats
  -- plus the FULL socket-color layout (every socket as EMPTY_SOCKET_*, even filled ones).
  local id = link:match("item:(%d+)")
  local baseSeg = id and serializeStats(safe(GetItemStatsFn, "item:" .. id)) or ""
  return equipLoc .. "|" .. resolvedSeg .. "|" .. baseSeg .. "|" .. (socketBonus or "")
end

local function scanGear()
  local seen, list = {}, {}
  -- Equipped items are tagged "E:" (used to auto-calibrate the model to your sheet);
  -- everything else is "I:". Equipped slots are scanned first so they win the de-dupe.
  local function addLink(link, equipped)
    local s = extractItemString(link)
    if not s or seen[s] then return end
    seen[s] = true
    list[#list + 1] = (equipped and "E:" or "I:") .. s .. "|" .. itemSegment(link)
  end
  for slot = 1, 19 do addLink(safe(GetInventoryItemLink, "player", slot), true) end
  local bags = { 0, 1, 2, 3, 4, -1, 5, 6, 7, 8, 9, 10, 11, -3 }
  for _, bag in ipairs(bags) do
    local n = safe(GetContainerNumSlots, bag) or 0
    for slot = 1, n do addLink(safe(GetContainerItemLink, bag, slot), false) end
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
