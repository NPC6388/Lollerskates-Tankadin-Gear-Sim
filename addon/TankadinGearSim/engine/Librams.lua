-- Librams — Lua port of src/librams.js:libramStats. Librams score through a special equip effect the
-- tooltip parser misses, so a known Prot libram is OVERRIDDEN with a modeled effective stat block.
-- Matched by item id (canonical) or a lowercase name substring. Data lives in engine/LibramsData.lua.
-- Parity-checked by test/lua/solver_parity.lua; wired into engine/Items.build for the item pool.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.LibramsData

local Librams = {}
ns.engine.Librams = Librams

-- Modeled stats for an item if it's a known libram, else nil. Matches id first, then any nameMatch
-- substring against the lowercased name. Returns a COPY (the caller overrides item stats with it).
function Librams.libramStats(item)
  item = item or {}
  local nameLower = tostring(item.name or ""):lower()
  for _, L in ipairs(D.LIBRAMS) do
    local matched = false
    if L.ids then
      for _, id in ipairs(L.ids) do if id == item.itemId then matched = true; break end end
    end
    if not matched and L.nameMatch then
      for _, sub in ipairs(L.nameMatch) do if nameLower:find(sub, 1, true) then matched = true; break end end
    end
    if matched then
      local out = {}
      for k, v in pairs(L.stats) do out[k] = v end
      return out
    end
  end
  return nil
end

return Librams
