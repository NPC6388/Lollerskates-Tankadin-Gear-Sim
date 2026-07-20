-- Items — Lua port of the PURE per-item logic in src/import.js: turn raw GetItemStats/tooltip reads
-- into the structured item object the optimizer consumes ({ slot, stats, baseStats, sockets,
-- socketBonus, itemId, ... }). Data (the key/slot maps) is generated in engine/ItemsData.lua; this is
-- the logic. Parity-checked against import.js by test/lua/items_parity.lua.
--
-- The WoW-API reading (tooltip scan, bag/bank iteration) lives in the impure ItemPool.lua, which calls
-- Items.build() with the raw tables — so this file stays pure and testable.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.ItemsData
local STAT_KEY_MAP, SLOT_MAP = D.STAT_KEY_MAP, D.SLOT_MAP
local STAT_KEYS = ns.engine.CharacterData.STAT_KEYS

local Items = {}
ns.engine.Items = Items

-- socket-count stat keys -> color (mirrors import.js SOCKET_STAT_KEYS).
local SOCKET_STAT_KEYS = { socketRed = "red", socketYellow = "yellow", socketBlue = "blue", socketMeta = "meta" }

function Items.equipLocToSlot(loc) return SLOT_MAP[loc] end

-- Split on ":" KEEPING empty fields (WoW item strings can have empties), so field indices line up
-- with the JS parser. NB: parts[1] == "item", so JS index i maps to Lua parts[i + 1].
local function splitColon(s)
  local parts, last = {}, 1
  s = tostring(s)
  while true do
    local i = s:find(":", last, true)
    if not i then parts[#parts + 1] = s:sub(last); break end
    parts[#parts + 1] = s:sub(last, i - 1)
    last = i + 1
  end
  return parts
end

-- item string -> { itemId, enchantId, gems, suffixId, itemString } (mirrors import.js parseItemString).
function Items.parseItemString(s)
  local parts = splitColon(s)
  local function n(i) return tonumber(parts[i]) or 0 end
  local gems = {}
  for _, i in ipairs({ 4, 5, 6, 7 }) do local g = n(i); if g ~= 0 then gems[#gems + 1] = g end end
  return { itemString = s, itemId = n(2), enchantId = n(3), gems = gems, suffixId = n(8) }
end

-- Map a raw GetItemStats/tooltip table (ITEM_MOD_* etc. keys) to our internal stat names, summing.
function Items.mapStats(raw)
  local out = {}
  for k, v in pairs(raw or {}) do
    local mapped = STAT_KEY_MAP[k]
    if mapped and type(v) == "number" then out[mapped] = (out[mapped] or 0) + v end
  end
  return out
end

-- mapped-stats -> { red, yellow, blue, meta } counts present.
function Items.socketsFromStats(stats)
  local out = {}
  for key, color in pairs(SOCKET_STAT_KEYS) do
    if stats[key] then out[color] = stats[key] end
  end
  return out
end

-- Socket-bonus token "ITEM_MOD_STAMINA_SHORT:4" -> { stat = "stamina", value = 4 }, else nil.
function Items.parseSocketBonus(token)
  if not token or token == "" then return nil end
  local i = token:find(":", 1, true)
  if not i then return nil end
  local stat = STAT_KEY_MAP[token:sub(1, i - 1)]
  local value = tonumber(token:sub(i + 1)) or 0
  if stat and value ~= 0 then return { stat = stat, value = value } end
  return nil
end

-- Build the structured item object from raw reads. `raw`:
--   { itemString, equipLoc, name, equipped, itemLevel, resolved = {ITEM_MOD_*=v}, base = {..}, socketBonus = token }
-- resolved = as-worn (tooltip, incl. gems/enchants + empty sockets); base = gem/enchant-stripped
-- GetItemStats (full socket layout + innate stats). Mirrors import.js's per-item block.
function Items.build(raw)
  local item = Items.parseItemString(raw.itemString)
  item.equipped = raw.equipped or false
  if raw.name then item.name = raw.name end
  item.equipLoc = raw.equipLoc or ""
  item.slot = Items.equipLocToSlot(item.equipLoc)
  item.itemLevel = raw.itemLevel or 0

  local stats = Items.mapStats(raw.resolved)
  item.stats = stats

  if raw.base ~= nil then
    local baseStats = Items.mapStats(raw.base)
    item.baseStats = baseStats
    -- GetItemStats omits SHIELD armor (reports 0); backfill from resolved so a re-gem from base doesn't
    -- undercount armor. Armor is never gem/enchant-added, so this is exact, not a double-count.
    if not baseStats.armor and stats.armor then baseStats.armor = stats.armor end
    -- Same omission for SHIELD BLOCK VALUE: GetItemStats doesn't report a shield's innate block value,
    -- so base reads 0 while the tooltip (resolved) has it. Backfill so a re-gem from base doesn't drop
    -- ~150 block value (which made "re-gem everything" score a shield far below a keep-mode set).
    if not baseStats.blockValue and stats.blockValue then baseStats.blockValue = stats.blockValue end
    -- The tooltip scan can miss an innate equip line GetItemStats captures; resolved should be >= base
    -- for innate stats, so lift any stat the scan came up short on.
    for _, k in ipairs(STAT_KEYS) do
      if (baseStats[k] or 0) > (stats[k] or 0) then stats[k] = baseStats[k] end
    end
  end

  -- sockets: prefer the base layout (every socket); fall back to resolved (currently-empty only).
  item.sockets = Items.socketsFromStats(item.baseStats or stats)
  item.socketBonus = Items.parseSocketBonus(raw.socketBonus)
  -- Librams score through a special equip effect the tooltip parser misses (e.g. +Consecration
  -- damage). Override with the modeled effective stats so the libram is valued correctly (mirrors
  -- import.js's final per-item step). Referenced lazily so Items stays loadable without the solver.
  local Librams = ns.engine.Librams
  if Librams then
    local lib = Librams.libramStats(item)
    if lib then
      item.stats = lib
      local base = {}
      for k, v in pairs(lib) do base[k] = v end
      item.baseStats = base
    end
  end
  -- Proc/on-use trinkets carry value in a temporary buff GetItemStats reports as nothing. Add the
  -- uptime-averaged equivalent so the slot is scored honestly (mirrors import.js). ADDITIVE, and
  -- applied to base too so re-gemming doesn't drop it. Lazy reference, like Librams above.
  local Procs = ns.engine.Procs
  if Procs then
    local proc = Procs.procStats(item)
    if proc then
      item.procStats = proc
      item.stats = item.stats or {}
      for k, v in pairs(proc) do
        item.stats[k] = (item.stats[k] or 0) + v
        if item.baseStats then item.baseStats[k] = (item.baseStats[k] or 0) + v end
      end
    end
  end
  return item
end

return Items
