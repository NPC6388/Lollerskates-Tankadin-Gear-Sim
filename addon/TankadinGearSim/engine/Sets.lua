-- Sets — Lua port of src/sets.js:setCounts/setBonusStats. Detects tier-set membership by item id and
-- returns the equivalent flat-stat bundle for the ACTIVE 2pc/4pc bonuses, so the optimizer's 'scale'
-- objective can value completing a set. Data (SET_DB / SET_BONUS_STATS) lives in engine/SetsData.lua.
-- Parity-checked against sets.js by test/lua/optimizer_parity.lua.
-- (The display-only `setBonuses` combat-modifier readout is deferred to the UI phase.)

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.SetsData

local Sets = {}
ns.engine.Sets = Sets

-- Count equipped pieces per set (honors an explicit item.set tag, else the id map).
function Sets.setCounts(items)
  local counts = {}
  for _, it in ipairs(items) do
    local s = it.set or D.SET_DB[it.itemId]
    if s then counts[s] = (counts[s] or 0) + 1 end
  end
  return counts
end

-- Combined equivalent-stat bundle of every ACTIVE set bonus (non-linear 2pc/4pc thresholds).
function Sets.setBonusStats(items)
  local c = Sets.setCounts(items)
  local out = {}
  local function add(b) for k, v in pairs(b) do out[k] = (out[k] or 0) + v end end
  if (c.Justicar or 0) >= 2 then add(D.SET_BONUS_STATS.justicar2pc) end
  if (c.Justicar or 0) >= 4 then add(D.SET_BONUS_STATS.justicar4pc) end
  if (c.Crystalforge or 0) >= 2 then add(D.SET_BONUS_STATS.crystalforge2pc) end
  if (c.Crystalforge or 0) >= 4 then add(D.SET_BONUS_STATS.crystalforge4pc) end
  return out
end

return Sets
