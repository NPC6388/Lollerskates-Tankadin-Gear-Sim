-- Scrolls — Lua port of src/scrolls.js:scrollStats. Sums a list of consumable-scroll keys into a
-- { buffs = {primary stats}, flatArmor } block: primary-stat scrolls ride the buff block (so Kings'
-- +10% applies), Scroll of Protection's armor is flat (bypasses Toughness). Data lives in
-- engine/ScrollsData.lua. Parity-checked by test/lua/solver_parity.lua.

local ADDON, ns = ...
ns.engine = ns.engine or {}
local D = ns.engine.ScrollsData

local Scrolls = {}
ns.engine.Scrolls = Scrolls

-- Sum scroll keys -> { buffs, flatArmor }. Unknown keys are ignored. Mirrors scrolls.js:scrollStats.
function Scrolls.scrollStats(keys)
  keys = keys or {}
  local buffs = {}
  local flatArmor = 0
  for _, key in ipairs(keys) do
    local s = D.SCROLLS[key]
    if s then
      if s.flat then flatArmor = flatArmor + s.value
      else buffs[s.stat] = (buffs[s.stat] or 0) + s.value end
    end
  end
  return { buffs = buffs, flatArmor = flatArmor }
end

return Scrolls
