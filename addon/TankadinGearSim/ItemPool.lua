-- ItemPool — the LIVE optimizer input: scans owned gear (equipped + bags + open bank) and turns each
-- item into the structured object engine/Items.build produces, grouped by slot. This is the in-game
-- replacement for the website's export-string round-trip (import.js): the same item objects, read
-- straight from the game. Impure (WoW inventory APIs), so it lives here, not in engine/.
--
-- Reuses ns.Exporter.readItemRaw (tooltip scan + stripped GetItemStats + socket bonus) so the item
-- reads match the export exactly, then ns.engine.Items.build maps them to our stat keys.

local ADDON, ns = ...
ns.ItemPool = ns.ItemPool or {}

local CC = _G.C_Container
local GetContainerNumSlots = (CC and CC.GetContainerNumSlots) or _G.GetContainerNumSlots
local GetContainerItemLink = (CC and CC.GetContainerItemLink) or _G.GetContainerItemLink

local function safe(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, a = pcall(fn, ...)
  if ok then return a end
  return nil
end

local function itemStringOf(link)
  if not link then return nil end
  return link:match("|H(item:[%-%d:]+)|h") or link:match("(item:[%-%d:]+)")
end

-- Scan owned gear into built item objects, deduped by item string. Equipped pieces (slots 1-19) are
-- flagged `equipped = true`; bag/bank items false. Bank is only readable while the bank frame is open
-- (same caveat as the exporter).
function ns.ItemPool.scan()
  local Items = ns.engine and ns.engine.Items
  local readRaw = ns.Exporter and ns.Exporter.readItemRaw
  if not (Items and Items.build and readRaw) then return {} end

  local seen, out = {}, {}
  local function addLink(link, equipped)
    local s = itemStringOf(link)
    if not s or seen[s] then return end
    seen[s] = true
    local raw = readRaw(link)
    raw.equipped = equipped and true or false
    out[#out + 1] = Items.build(raw)
  end

  for slot = 1, 19 do addLink(safe(GetInventoryItemLink, "player", slot), true) end
  local bags = { 0, 1, 2, 3, 4, -1, 5, 6, 7, 8, 9, 10, 11, -3 } -- backpack..bags, bank, bank bags, reagent
  for _, bag in ipairs(bags) do
    local n = safe(GetContainerNumSlots, bag) or 0
    for slot = 1, n do addLink(safe(GetContainerItemLink, bag, slot), false) end
  end
  return out
end

-- Group a scanned pool (or a fresh scan) by slot key -> { items }. Items with no mapped slot (tabard,
-- etc.) are dropped, since the optimizer can't place them.
function ns.ItemPool.bySlot(pool)
  local out = {}
  for _, it in ipairs(pool or ns.ItemPool.scan()) do
    if it.slot then
      out[it.slot] = out[it.slot] or {}
      out[it.slot][#out[it.slot] + 1] = it
    end
  end
  return out
end
