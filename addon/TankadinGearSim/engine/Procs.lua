-- Procs — Lua port of src/procs.js:procStats. Some trinkets carry their value in a temporary buff
-- that GetItemStats reports as NOTHING (Tome of Fiery Redemption reads as an empty stat block), so a
-- known proc/on-use trinket gets its UPTIME-AVERAGED equivalent added on top of its parsed stats.
-- Unlike librams (which OVERRIDE), these are ADDITIVE — the item's passive stats are real.
-- Matched by item id (canonical) or a lowercase name substring. Data lives in engine/ProcsData.lua.
-- Parity-checked by test/lua/solver_parity.lua; wired into engine/Items.build for the item pool.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.ProcsData

local Procs = {}
ns.engine.Procs = Procs

-- Modeled ADDITIVE stats for an item if it's a known proc trinket, else nil. Matches id first, then
-- any nameMatch substring against the lowercased name. Returns a COPY (the caller adds it on).
function Procs.procStats(item)
  item = item or {}
  local nameLower = tostring(item.name or ""):lower()
  for _, P in ipairs(D.PROCS) do
    local matched = false
    if P.ids then
      for _, id in ipairs(P.ids) do if id == item.itemId then matched = true; break end end
    end
    if not matched and P.nameMatch then
      for _, sub in ipairs(P.nameMatch) do if nameLower:find(sub, 1, true) then matched = true; break end end
    end
    if matched then
      local out = {}
      for k, v in pairs(P.stats) do out[k] = v end
      return out
    end
  end
  return nil
end

return Procs
