-- Enchants — Lua port of the LOGIC in src/enchants.js: pick the best slot enchant for a goal and
-- detect the player's faction from their shoulder inscription. Data (the per-slot options + the
-- shoulder-faction map) lives in engine/EnchantsData.lua. Parity-checked by test/lua/solver_parity.lua.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.EnchantsData
local Scoring = ns.engine.Scoring
local CURRENT_PHASE = ns.engine.GemsData.CURRENT_PHASE

local Enchants = {}
ns.engine.Enchants = Enchants
Enchants.ENCHANTS = D.ENCHANTS

-- shoulder inscription enchant id -> faction; nil for anything else. Mirrors enchants.js.
function Enchants.factionFromEnchant(enchantId)
  return D.SHOULDER_FACTION[enchantId]
end

-- Detect faction from the equipped shoulder's inscription (prefer the worn one), else nil.
function Enchants.detectFaction(items)
  items = items or {}
  local sh
  for _, it in ipairs(items) do if it.slot == "shoulder" and it.equipped then sh = it; break end end
  if not sh then for _, it in ipairs(items) do if it.slot == "shoulder" then sh = it; break end end end
  if sh then return Enchants.factionFromEnchant(sh.enchantId) end
  return nil
end

local function namesInclude(names, target)
  for _, n in ipairs(names or {}) do if n == target then return true end end
  return false
end

-- Best enchant for a slot under a goal. Profession-locked enchants are excluded unless perks.names has
-- the profession; faction-locked ones unless they match opts.faction (with no faction, all considered);
-- phase-gated like gems (default CURRENT_PHASE). Mirrors enchants.js:bestEnchant.
function Enchants.bestEnchant(slot, weights, perks, opts)
  perks = perks or { names = {} }
  opts = opts or {}
  local list = D.ENCHANTS[slot]
  if not list then return nil end
  local maxPhase = opts.maxPhase
  if maxPhase == nil then maxPhase = CURRENT_PHASE end
  local best = nil
  for _, e in ipairs(list) do
    local ok = true
    if (e.phase or 1) > maxPhase then ok = false end
    if ok and e.profession and not namesInclude(perks.names, e.profession) then ok = false end
    if ok and e.faction and opts.faction and e.faction ~= opts.faction then ok = false end
    if ok then
      local s = Scoring.score(e.stats, weights)
      if not best or s > best.score then best = { enchant = e, score = s } end
    end
  end
  return best
end

return Enchants
