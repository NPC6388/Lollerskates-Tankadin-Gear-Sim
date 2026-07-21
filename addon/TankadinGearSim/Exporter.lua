-- Tankadin Gear Sim — website exporter (formerly all of TankadinGearSim.lua).
-- Builds the export string the browser sim ingests and stashes it in SavedVariables. The
-- format is TGS<version> header + C:/T:/TR:/P: lines + one I:/E: line per item; see
-- addon/README.md. Exposed as ns.Exporter for the UI's Export tab and the /tgs export command.
--   resolved = TOOLTIP-scanned stats (gems + enchants as worn); base = GetItemStats on the
--   gem/enchant-stripped link (clean stats + full socket layout); socketBonus captured separately.

local ADDON, ns = ...
ns.Exporter = ns.Exporter or {}

local VERSION = ns.VERSION or "11"

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

local function inactiveSocketBonus(l, ln)
  if not l:find("socket bonus", 1, true) then return false end
  if not ln.r or not ln.g or not ln.b then return false end
  local green = ln.g > 0.6 and ln.r < 0.5 and ln.b < 0.5
  return not green
end

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

local function parseClause(clause, add)
  local alln = clause:match("%+(%d+) all stats")
  if alln then
    for _, pk in pairs(PRIMARY) do add(pk, tonumber(alln)) end
    return
  end
  if clause:find("block rating", 1, true) then
    local v = clause:match("(%d+)")
    if v then add("ITEM_MOD_BLOCK_RATING", tonumber(v)); return end
  end
  local n, word = clause:match("%+(%d+)%s+(%a+)")
  if n and PRIMARY[word] then add(PRIMARY[word], tonumber(n)) end
  local rn, rword = clause:match("%+(%d+)%s+(%a+)%s+resistance")
  if rn and RESIST[rword] then add(RESIST[rword], tonumber(rn)) end
  for _, pair in ipairs(PHRASES) do
    local v = clause:match(pair[1])
    if v then add(pair[2], tonumber(v)); break end
  end
end

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
    if not socketBonus and l:find("socket bonus", 1, true) then
      socketBonus = parseSocketBonus(l)
    end
    if l:match("^use:") or l:find("chance on", 1, true) or l:find("chance when", 1, true)
      or l:find("when struck", 1, true) or l:find("for %d+ sec") or inactiveSocketBonus(l, ln) then
      -- skip this line
    else
      local eqsp = l:match("magical spells and effects by up to (%d+)")
      if eqsp then add("ITEM_MOD_SPELL_POWER", tonumber(eqsp)) end
      local arm = l:match("^([%d,]+) armor")
      if arm then add("RESISTANCE0_NAME", tonumber((arm:gsub(",", "")))) end
      local blk = l:match("^([%d,]+) block%s*$")
      if blk then add("ITEM_MOD_BLOCK_VALUE", tonumber((blk:gsub(",", "")))) end
      local body = l:gsub("magical spells and effects by up to %d+", "")
      body = body:gsub(" and ", "\1"):gsub(",", "\1")
      for clause in body:gmatch("[^\1]+") do
        parseClause(clause, add)
      end
    end
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

local EMPTY_SOCKET_KEYS = { "EMPTY_SOCKET_RED", "EMPTY_SOCKET_YELLOW", "EMPTY_SOCKET_BLUE",
  "EMPTY_SOCKET_META", "EMPTY_SOCKET_PRISMATIC" }

-- Read one item's raw components (shared by the export string AND the in-game item pool):
--   resolved = tooltip-scanned stats (gems/enchants as worn) + the live empty-socket layout;
--   base = GetItemStats on the gem/enchant-stripped link (clean stats + full socket layout);
--   socketBonus token; equipLoc / name / itemLevel. Exposed as ns.Exporter.readItemRaw so
--   ItemPool.lua can feed it straight into engine/Items.build (no export-string round-trip).
local function readItemRaw(link)
  local resolved, socketBonus = parseTooltipStats(link)
  local liveBase = safe(GetItemStatsFn, link)
  if type(liveBase) == "table" then
    for _, k in ipairs(EMPTY_SOCKET_KEYS) do
      if liveBase[k] then resolved[k] = liveBase[k] end
    end
  end
  local ok, name, _, _, ilvl, _, _, _, _, equipLoc = pcall(GetItemInfo, link)
  if not ok then name, ilvl, equipLoc = nil, 0, "" end
  local id = link and link:match("item:(%d+)")
  return {
    itemString = extractItemString(link),
    equipLoc = equipLoc or "",
    name = name,
    itemLevel = ilvl or 0,
    resolved = resolved,
    base = (id and safe(GetItemStatsFn, "item:" .. id)) or {},
    socketBonus = socketBonus,
  }
end
ns.Exporter.readItemRaw = readItemRaw

local function itemSegment(link)
  local r = readItemRaw(link)
  local resolvedSeg = "ilvl=" .. tostring(r.itemLevel) ..
    (next(r.resolved) and (";" .. serializeStats(r.resolved)) or "")
  local baseSeg = serializeStats(r.base)
  return r.equipLoc .. "|" .. resolvedSeg .. "|" .. baseSeg .. "|" .. (r.socketBonus or "") .. "|" .. (r.name or "")
end

local function scanGear()
  local seen, list = {}, {}
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

local function talentString()
  local out = {}
  local tabs = (type(GetNumTalentTabs) == "function" and GetNumTalentTabs()) or 3
  for t = 1, tabs do
    local n = (type(GetNumTalents) == "function" and GetNumTalents(t)) or 0
    local rows = {}
    for i = 1, n do
      local _, _, tier, column, rank = GetTalentInfo(t, i)
      rows[#rows + 1] = { tier = tier or 0, column = column or 0, rank = rank or 0 }
    end
    table.sort(rows, function(a, b)
      if a.tier ~= b.tier then return a.tier < b.tier end
      return a.column < b.column
    end)
    for _, r in ipairs(rows) do out[#out + 1] = tostring(r.rank) end
    if t < tabs then out[#out + 1] = "-" end
  end
  return table.concat(out)
end

-- Public: the player's talents as { [name] = rank }. Public because the Optimize tab feeds this
-- STRAIGHT to the optimizer (Runner's `talentRanks` option): without it the engine falls back to its
-- default build — Anticipation 5, Toughness 5, Sacred Duty 2, Combat Expertise 5 — which silently
-- gives a differently-specced player armor, stamina and defense they do not have. The `TR:` export
-- line is the same table, flattened.
function ns.Exporter.talentRanks()
  local out = {}
  local tabs = (type(GetNumTalentTabs) == "function" and GetNumTalentTabs()) or 3
  for t = 1, tabs do
    local n = (type(GetNumTalents) == "function" and GetNumTalents(t)) or 0
    for i = 1, n do
      local name, _, _, _, rank = GetTalentInfo(t, i)
      if name then out[name] = rank or 0 end
    end
  end
  return out
end

local function talentRanksLine()
  local parts = {}
  for name, rank in pairs(ns.Exporter.talentRanks()) do
    parts[#parts + 1] = name .. "=" .. tostring(rank)
  end
  table.sort(parts) -- pairs() order is arbitrary; sort so the export line is stable between runs
  return table.concat(parts, ";")
end

-- Public: the player's two professions, mapped to the engine's names (which gate JC-only gems, the
-- Enchanting ring enchants, the LW bracer, and BS sockets). Public because the Optimize tab runs the
-- SAME detection for its in-game solve — one implementation, so the addon and the `P:` line it exports
-- can never disagree. Empty when the client doesn't expose the API or the profession isn't one we model.
function ns.Exporter.detectProfessions()
  local out, seen = {}, {}
  local known = {}
  for _, n in ipairs(ns.engine.Professions.PROFESSION_NAMES) do known[n] = true end
  local function add(name)
    if name and known[name] and not seen[name] then seen[name] = true; out[#out + 1] = name end
  end

  -- PRIMARY PATH: the character sheet's Skills list. This is the one that works on a Classic client —
  -- GetProfessions() is RETAIL-only (TradeSkillMaster gates its use behind IsRetail()), so the earlier
  -- version of this function silently found nothing here and every export said "no professions".
  local function scanSkillLines()
    if type(GetNumSkillLines) ~= "function" or type(GetSkillLineInfo) ~= "function" then return end
    local n = safe(GetNumSkillLines) or 0
    for i = 1, n do
      -- safe() only forwards the FIRST return value, and we need isHeader too, so pcall directly.
      local ok, name, isHeader = pcall(GetSkillLineInfo, i)
      if ok and not isHeader then add(name) end
    end
  end
  scanSkillLines()
  -- Skills under a COLLAPSED header aren't enumerated at all, so a player whose Professions header is
  -- collapsed would read as having none. Only expand (a visible change to their skills UI) when the
  -- first pass came up empty — for most players nothing is touched.
  if #out == 0 and type(ExpandSkillHeader) == "function" then
    pcall(ExpandSkillHeader, 0)
    scanSkillLines()
  end
  if #out > 0 then return out end

  -- FALLBACK: the retail/Pandaria-Classic spellbook API, for clients that do have it.
  if type(GetProfessions) == "function" and type(GetProfessionInfo) == "function" then
    local ok, p1, p2 = pcall(GetProfessions)
    if ok then
      for _, idx in ipairs({ p1 or false, p2 or false }) do
        if idx then
          local ok2, name = pcall(GetProfessionInfo, idx)
          if ok2 then add(name) end
        end
      end
    end
  end
  return out
end

-- Public: build the full export string + item count.
function ns.Exporter.build()
  -- P: (v12) — the professions line, so the website can default its two dropdowns to what the player
  -- actually has instead of guessing Enchanting. Written even when empty ("P:"), so an export from a
  -- profession-less character reads as "none", not as an older addon that couldn't say.
  local lines = { "TGS" .. VERSION, characterLine(), "T:" .. talentString(), "TR:" .. talentRanksLine(),
    "P:" .. table.concat(ns.Exporter.detectProfessions(), ";") }
  for _, l in ipairs(scanGear()) do lines[#lines + 1] = l end
  return table.concat(lines, "\n"), #lines - 5
end

-- Public: build + stash into SavedVariables (flushed on /reload or logout) and return the text.
function ns.Exporter.run()
  local text, count = ns.Exporter.build()
  TankadinGearSimDB = {
    version = VERSION,
    count = count,
    exportedAt = (date and date("%Y-%m-%d %H:%M:%S")) or (time and time()) or 0,
    export = text,
  }
  return text, count
end
