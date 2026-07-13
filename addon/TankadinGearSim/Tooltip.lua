-- Tooltip augmentation: on any gear tooltip, append two lines showing how equipping that item would
-- change your set's THREAT (SP-equivalent, using the sim's threat weight scale) and EFFECTIVE HEALTH,
-- versus the item it would replace. Pure read/compute — reuses the ported engine (Items/Model/Evaluate)
-- and the same raid-buff assumption the Optimize tab uses, so the deltas match the sim's own ranking.
--
-- Threat is LINEAR in item stats (score = weights . stats), so its delta is just weights .(new - old).
-- EHP is NON-linear (health / armor DR / RF), so it's a full set re-eval: aggregate the worn set, swap
-- the hovered item into its slot, re-aggregate, diff ehpPhysical. Baseline is cached and invalidated on
-- PLAYER_EQUIPMENT_CHANGED so a mouseover sweep doesn't re-scan 19 slots every frame.
local ADDON, ns = ...
local E = ns.engine
if not E then return end

local Items      = E.Items
local Model      = E.Model
local Evaluate   = E.Evaluate
local THREAT_W   = E.Weights and E.Weights.PARTS and E.Weights.PARTS.threat
local BUFFS      = E.CharacterData and E.CharacterData.BUFFS
local HS         = (E.Constants and E.Constants.THREAT and E.Constants.THREAT.holyShieldActive) or 30
if not (Items and Model and Evaluate and THREAT_W) then return end

-- Threat score of a stat block, in spell-power-equivalent units (spellDamage weight == 1).
local function threatScore(stats)
  if not stats then return 0 end
  local s = 0
  for k, w in pairs(THREAT_W) do s = s + w * (stats[k] or 0) end
  return s
end

-- aggregate opts: match the Optimize tab (raid buffs on by default; default talents, like the in-game
-- optimizer, which doesn't feed player talent ranks). Rebuilt each call so the buff toggle is honoured.
local function aggOpts()
  local o = { hsBlockBonus = HS }
  local raid = (ns.UI == nil) or (ns.UI.optBuffs ~= false)
  if raid and BUFFS then o.kings = true; o.buffs = BUFFS.markOfTheWild end
  return o
end

local function ehpOf(items)
  local ok, agg = pcall(Model.aggregate, items, aggOpts())
  if not ok then return nil end
  local ok2, evald = pcall(Evaluate.evaluateSet, agg)
  if not ok2 then return nil end
  return evald.ehpPhysical
end

-- --- worn-set baseline (cached) ------------------------------------------------
local baseCache = { valid = false, eq = nil, ehp = nil }

local function readEquipped()
  local readRaw = ns.Exporter and ns.Exporter.readItemRaw
  if not readRaw then return {} end
  local eq = {}
  for slot = 1, 19 do
    local link = GetInventoryItemLink("player", slot)
    if link then
      local ok, raw = pcall(readRaw, link)
      if ok and raw then
        raw.equipped = true
        local it = Items.build(raw)
        if it and it.slot then eq[#eq + 1] = it end
      end
    end
  end
  return eq
end

local function baseline()
  if not baseCache.valid then
    baseCache.eq = readEquipped()
    baseCache.ehp = ehpOf(baseCache.eq)
    baseCache.valid = true
  end
  return baseCache.eq, baseCache.ehp
end

-- Set list = worn set with `replace` (or nil) swapped out for `add`.
local function swappedSet(eq, replace, add)
  local out = {}
  for _, it in ipairs(eq) do if it ~= replace then out[#out + 1] = it end end
  out[#out + 1] = add
  return out
end

-- Compute { threat, ehp } deltas for equipping `item` into the worn set. For a paired slot (rings,
-- trinkets) it reports the swap that yields the HIGHER resulting EHP — you'd keep your tankier piece and
-- replace the other — and that same swap's threat delta, so both numbers describe ONE real swap.
local function deltasFor(item)
  local eq, ehpBase = baseline()
  if ehpBase == nil then return nil end
  local inSlot = {}
  for _, it in ipairs(eq) do if it.slot == item.slot then inSlot[#inSlot + 1] = it end end

  if #inSlot == 0 then -- empty slot: contribution vs wearing nothing there
    local ehpNew = ehpOf(swappedSet(eq, nil, item))
    if ehpNew == nil then return nil end
    return { threat = threatScore(item.stats), ehp = ehpNew - ehpBase }
  end

  local best, bestEhpNew
  for _, p in ipairs(inSlot) do
    local ehpNew = ehpOf(swappedSet(eq, p, item))
    if ehpNew ~= nil and (bestEhpNew == nil or ehpNew > bestEhpNew) then
      bestEhpNew = ehpNew
      best = { threat = threatScore(item.stats) - threatScore(p.stats), ehp = ehpNew - ehpBase }
    end
  end
  return best
end

-- --- tooltip lines -------------------------------------------------------------
local GOLD = { 1, 0.82, 0 }
local function signColor(v)
  if v > 0.5 then return 0.1, 1, 0.1 elseif v < -0.5 then return 1, 0.25, 0.25 else return 0.6, 0.6, 0.6 end
end
local function signStr(v)
  local n = (v >= 0) and math.floor(v + 0.5) or -math.floor(-v + 0.5)
  return (n > 0 and "+" or "") .. n
end

local function addLines(tt)
  if not tt or tt.tgsAdded then return end
  local _, link = tt:GetItem()
  if not link then return end
  local readRaw = ns.Exporter and ns.Exporter.readItemRaw
  if not readRaw then return end
  local ok, raw = pcall(readRaw, link)
  if not ok or not raw then return end
  local item = Items.build(raw)
  if not item or not item.slot then return end -- not gear the sim places

  local d = deltasFor(item)
  if not d then return end
  tt.tgsAdded = true

  local tr, tg, tb = signColor(d.threat)
  local er, eg, eb = signColor(d.ehp)
  tt:AddDoubleLine("TGS Threat (SP-eq)", signStr(d.threat), GOLD[1], GOLD[2], GOLD[3], tr, tg, tb)
  tt:AddDoubleLine("TGS Effective HP", signStr(d.ehp), GOLD[1], GOLD[2], GOLD[3], er, eg, eb)
  tt:Show() -- re-fit the tooltip around the added lines
end

for _, tt in ipairs({ GameTooltip, ItemRefTooltip }) do
  if tt and tt.HookScript then
    tt:HookScript("OnTooltipSetItem", addLines)
    tt:HookScript("OnTooltipCleared", function(self) self.tgsAdded = false end)
  end
end

-- Invalidate the worn-set baseline when gear changes (next hover recomputes it).
local watcher = CreateFrame("Frame")
watcher:RegisterEvent("PLAYER_EQUIPMENT_CHANGED")
watcher:SetScript("OnEvent", function() baseCache.valid = false end)
