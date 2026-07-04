-- Professions — Lua port of src/professions.js:professionPerks. Resolves a chosen profession pair into
-- the flat capability set the gem/enchant solver queries (extra sockets, jcGems, ring enchant, ...).
-- Data (the perk table) lives in engine/ProfessionsData.lua. Parity-checked by test/lua/solver_parity.lua.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.ProfessionsData

local Professions = {}
ns.engine.Professions = Professions
Professions.PROFESSION_NAMES = D.PROFESSION_NAMES

-- Resolve a chosen pair (e.g. {"Blacksmithing","Jewelcrafting"}) into a perks table. Unknown names
-- are ignored. Mirrors professions.js:professionPerks.
function Professions.professionPerks(chosen)
  chosen = chosen or {}
  local perks = {
    jcGems = false, ringEnchant = false, bracerFurLining = false, tinkers = false,
    mixology = false, extraSockets = {}, names = {},
  }
  for _, name in ipairs(chosen) do
    local p = D.PROFESSIONS[name]
    if p then
      perks.names[#perks.names + 1] = name
      if p.jcGems then perks.jcGems = true end
      if p.ringEnchant then perks.ringEnchant = true end
      if p.bracerFurLining then perks.bracerFurLining = true end
      if p.tinkers then perks.tinkers = true end
      if p.mixology then perks.mixology = true end
      for slot, n in pairs(p.extraSockets or {}) do
        perks.extraSockets[slot] = (perks.extraSockets[slot] or 0) + n
      end
    end
  end
  return perks
end

return Professions
